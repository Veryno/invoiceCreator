"use strict";

const packageMetadata = require("./package.json");

const config = structuredClone(packageMetadata.build);
const repositorySlug = process.env.GITHUB_REPOSITORY?.trim() || "";
const repositoryMatch = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/.exec(repositorySlug);

// GitHub Actions supplies GITHUB_REPOSITORY automatically. Keeping this
// dynamic lets local unsigned builds work before the project has a remote,
// while release builds embed the public GitHub update feed in app-update.yml.
if (repositoryMatch) {
  config.win = {
    ...config.win,
    publish: [
      {
        provider: "github",
        owner: repositoryMatch[1],
        repo: repositoryMatch[2],
        releaseType: "release",
      },
    ],
  };
}

// When signing credentials are configured, fail the CI build instead of
// silently publishing a broken signature. Personal releases may remain
// unsigned until a certificate is added to the repository secrets.
if (process.env.GITHUB_ACTIONS === "true" && process.platform === "win32") {
  const hasCertificate = Boolean(process.env.WIN_CSC_LINK?.trim());
  const hasPassword = Boolean(process.env.WIN_CSC_KEY_PASSWORD?.trim());

  if (hasCertificate !== hasPassword) {
    throw new Error(
      "WIN_CSC_LINK and WIN_CSC_KEY_PASSWORD must either both be configured or both be empty.",
    );
  }

  if (hasCertificate) config.forceCodeSigning = true;
}

module.exports = config;
