import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parse } from "yaml";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const releaseDirectory = path.join(projectRoot, "release");
const packagePath = path.join(projectRoot, "package.json");
const updateMetadataPath = path.join(releaseDirectory, "latest.yml");

function fail(message) {
  throw new Error(message);
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireNonEmptyString(value, label) {
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value) {
    fail(`${label} must be a non-empty string without surrounding whitespace.`);
  }

  return value;
}

function safeArtifactBasename(value, label) {
  const name = requireNonEmptyString(value, label);

  if (/[\u0000-\u001f\u007f]/u.test(name)) {
    fail(`${label} contains control characters.`);
  }

  let decodedName;
  try {
    decodedName = decodeURIComponent(name);
  } catch {
    fail(`${label} contains malformed percent-encoding.`);
  }

  if (decodedName !== name) {
    fail(`${label} must not use percent-encoding.`);
  }

  if (
    path.posix.isAbsolute(name)
    || path.win32.isAbsolute(name)
    || name.includes("/")
    || name.includes("\\")
    || name === "."
    || name === ".."
    || path.posix.basename(name) !== name
    || path.win32.basename(name) !== name
  ) {
    fail(`${label} must be a filename, not a path.`);
  }

  return path.basename(name);
}

function pathInsideReleaseDirectory(name) {
  const candidate = path.resolve(releaseDirectory, name);
  if (path.dirname(candidate) !== releaseDirectory) {
    fail(`Artifact path escapes the release directory: ${name}`);
  }

  return candidate;
}

async function requireRegularFile(filePath, label) {
  let stats;
  try {
    stats = await lstat(filePath);
  } catch (error) {
    if (error?.code === "ENOENT") {
      fail(`${label} does not exist: ${path.basename(filePath)}`);
    }
    throw error;
  }

  if (!stats.isFile() || stats.isSymbolicLink()) {
    fail(`${label} must be a regular file: ${path.basename(filePath)}`);
  }
}

async function sha512Base64(filePath) {
  const hash = createHash("sha512");
  for await (const chunk of createReadStream(filePath)) {
    hash.update(chunk);
  }
  return hash.digest("base64");
}

function selectInstallerEntry(metadata) {
  if (!Array.isArray(metadata.files) || metadata.files.length === 0) {
    fail("latest.yml must contain a non-empty files array.");
  }

  const executableEntries = [];

  metadata.files.forEach((entry, index) => {
    if (!isRecord(entry)) {
      fail(`latest.yml files[${index}] must be an object.`);
    }

    const artifactName = safeArtifactBasename(
      entry.url,
      `latest.yml files[${index}].url`,
    );

    if (artifactName.toLowerCase().endsWith(".exe")) {
      executableEntries.push({ entry, artifactName, index });
    }
  });

  if (executableEntries.length === 0) {
    fail("latest.yml does not contain an NSIS .exe file entry.");
  }

  if (metadata.path !== undefined) {
    const primaryName = safeArtifactBasename(
      metadata.path,
      "latest.yml path",
    );
    const matches = executableEntries.filter(
      ({ artifactName }) => artifactName === primaryName,
    );

    if (matches.length !== 1) {
      fail("latest.yml path must identify exactly one NSIS .exe file entry.");
    }

    return matches[0];
  }

  if (executableEntries.length !== 1) {
    fail("latest.yml contains multiple .exe entries but no unambiguous path.");
  }

  return executableEntries[0];
}

async function main() {
  const packageJson = JSON.parse(await readFile(packagePath, "utf8"));
  if (!isRecord(packageJson)) {
    fail("package.json must contain a JSON object.");
  }

  const packageVersion = requireNonEmptyString(
    packageJson.version,
    "package.json version",
  );
  const expectedTag = `v${packageVersion}`;

  if (
    process.env.GITHUB_REF_NAME !== undefined
    && process.env.GITHUB_REF_NAME !== expectedTag
  ) {
    fail(
      `Git tag ${JSON.stringify(process.env.GITHUB_REF_NAME)} does not match ${expectedTag}.`,
    );
  }

  await requireRegularFile(updateMetadataPath, "Windows update metadata");
  const metadata = parse(await readFile(updateMetadataPath, "utf8"));
  if (!isRecord(metadata)) {
    fail("latest.yml must contain a YAML object.");
  }

  const metadataVersion = requireNonEmptyString(
    metadata.version,
    "latest.yml version",
  );
  if (metadataVersion !== packageVersion) {
    fail(
      `latest.yml version ${metadataVersion} does not match package version ${packageVersion}.`,
    );
  }

  const { entry, artifactName, index } = selectInstallerEntry(metadata);
  const expectedHash = requireNonEmptyString(
    entry.sha512,
    `latest.yml files[${index}].sha512`,
  );
  if (!/^[A-Za-z0-9+/]{86}==$/u.test(expectedHash)) {
    fail(
      `latest.yml files[${index}].sha512 is not a valid SHA-512 base64 digest.`,
    );
  }

  if (metadata.sha512 !== undefined && metadata.sha512 !== expectedHash) {
    fail("latest.yml top-level sha512 does not match the selected file entry.");
  }

  const installerPath = pathInsideReleaseDirectory(artifactName);
  const blockmapName = safeArtifactBasename(
    `${artifactName}.blockmap`,
    "NSIS blockmap name",
  );
  const blockmapPath = pathInsideReleaseDirectory(blockmapName);

  await requireRegularFile(installerPath, "NSIS installer");
  await requireRegularFile(blockmapPath, "NSIS blockmap");

  const actualHash = await sha512Base64(installerPath);
  if (actualHash !== expectedHash) {
    fail(`SHA-512 mismatch for ${artifactName}.`);
  }

  console.log(
    `Verified Windows update ${packageVersion}: ${artifactName} and blockmap (SHA-512 match).`,
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Windows update asset verification failed: ${message}`);
  process.exitCode = 1;
});
