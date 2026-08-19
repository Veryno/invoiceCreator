"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");

const WORKSPACE_SCHEMA_VERSION = 1;
const DEFAULT_FILE_NAME = "invoice-studio-workspace.json";
const MAX_WORKSPACE_BYTES = 64 * 1024 * 1024;
const MAX_TREE_DEPTH = 24;
const MAX_TREE_NODES = 250_000;
const MAX_LOGO_ASSETS = 5_000;
const MAX_LOGO_ASSET_BYTES = 2_500_000;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const EMBEDDED_LOGO_PATTERN = /^data:image\/(?:png|jpeg|webp);base64,([A-Za-z0-9+/]*={0,2})$/iu;
const DANGEROUS_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const COLLECTION_LIMITS = Object.freeze({
  invoices: 20_000,
  customers: 20_000,
  templates: 5_000,
  catalog: 50_000,
  payments: 100_000,
  recurring: 20_000,
  estimates: 20_000,
});

class WorkspaceConflictError extends Error {
  constructor(expected, actual) {
    super(`Workspace revision conflict: expected ${String(expected)}, current revision is ${String(actual)}.`);
    this.name = "WorkspaceConflictError";
    this.code = "WORKSPACE_REVISION_CONFLICT";
    this.expectedRevision = expected;
    this.actualRevision = actual;
  }
}

class WorkspaceValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "WorkspaceValidationError";
    this.code = "WORKSPACE_VALIDATION_FAILED";
  }
}

class WorkspaceVersionError extends WorkspaceValidationError {
  constructor(version) {
    super(`Workspace schema version ${String(version)} is not supported by this app.`);
    this.name = "WorkspaceVersionError";
    this.code = "WORKSPACE_VERSION_UNSUPPORTED";
    this.schemaVersion = version;
  }
}

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isCanonicalIsoTimestamp(value) {
  if (typeof value !== "string") return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.toISOString() === value;
}

function isoNow(now) {
  const value = typeof now === "function" ? now() : now;
  const date = value instanceof Date ? value : value ? new Date(value) : new Date();
  return (Number.isNaN(date.getTime()) ? new Date() : date).toISOString();
}

function createInitialWorkspace({ now, idFactory } = {}) {
  const timestamp = isoNow(now);
  const generatedId = typeof idFactory === "function" ? idFactory("install") : `install:${crypto.randomUUID()}`;
  const installId = typeof generatedId === "string" && ID_PATTERN.test(generatedId)
    ? generatedId
    : `install:${crypto.randomUUID()}`;
  return {
    schemaVersion: WORKSPACE_SCHEMA_VERSION,
    revision: 0,
    installId,
    createdAt: timestamp,
    updatedAt: timestamp,
    profile: {
      company: { name: "", email: "", phone: "", website: "", address: "", taxId: "", logo: "" },
      defaults: {
        currency: "USD",
        locale: "en-US",
        terms: "Net 30",
        taxRate: 0,
        content: { notes: "", paymentInstructions: "" },
        design: {
          template: "modern",
          accentColor: "#2563EB",
          font: "Inter",
          paperSize: "Letter",
          showServiceDate: true,
          showItem: true,
        },
      },
    },
    assets: { logos: [] },
    preferences: {
      activeInvoiceId: null,
      defaultTemplateId: "builtin:modern",
      numbering: { prefix: "INV", nextSequence: 1, padding: 3, includeYear: true },
      onboarding: {
        flowVersion: 1,
        status: "notStarted",
        currentStep: null,
        completedSteps: [],
        startedAt: null,
        completedAt: null,
        skippedAt: null,
        skipReason: null,
        draft: {
          customerMode: "manual",
          selectedCustomerId: null,
          customer: { name: "", email: "", phone: "", address: "" },
        },
        updatedAt: timestamp,
      },
    },
    invoices: [],
    customers: [],
    templates: [],
    catalog: [],
    payments: [],
    recurring: [],
    estimates: [],
    migrations: {
      legacyDraftV1: { completed: false, importedAt: null, invoiceId: null },
    },
  };
}

function validateTree(root) {
  const stack = [{ value: root, depth: 0 }];
  let nodes = 0;
  while (stack.length) {
    const { value, depth } = stack.pop();
    nodes += 1;
    if (nodes > MAX_TREE_NODES) {
      throw new WorkspaceValidationError("Workspace contains too many values.");
    }
    if (depth > MAX_TREE_DEPTH) {
      throw new WorkspaceValidationError("Workspace nesting is too deep.");
    }
    if (value === null || ["string", "boolean"].includes(typeof value)) continue;
    if (typeof value === "number") {
      if (!Number.isFinite(value)) throw new WorkspaceValidationError("Workspace numbers must be finite.");
      continue;
    }
    if (Array.isArray(value)) {
      for (const entry of value) stack.push({ value: entry, depth: depth + 1 });
      continue;
    }
    if (!isPlainObject(value)) {
      throw new WorkspaceValidationError("Workspace must contain JSON-compatible values only.");
    }
    for (const [key, entry] of Object.entries(value)) {
      if (DANGEROUS_KEYS.has(key)) {
        throw new WorkspaceValidationError(`Workspace contains a forbidden key: ${key}.`);
      }
      stack.push({ value: entry, depth: depth + 1 });
    }
  }
}

function validateRecordCollection(workspace, name, maximum) {
  const records = workspace[name];
  if (!Array.isArray(records)) {
    throw new WorkspaceValidationError(`Workspace ${name} must be an array.`);
  }
  if (records.length > maximum) {
    throw new WorkspaceValidationError(`Workspace ${name} exceeds the ${maximum} record limit.`);
  }
  const ids = new Set();
  records.forEach((record, index) => {
    if (!isPlainObject(record) || typeof record.id !== "string" || !ID_PATTERN.test(record.id)) {
      throw new WorkspaceValidationError(`Workspace ${name}[${index}] has an invalid id.`);
    }
    if (ids.has(record.id)) {
      throw new WorkspaceValidationError(`Workspace ${name} contains duplicate id ${record.id}.`);
    }
    ids.add(record.id);
    if (!isCanonicalIsoTimestamp(record.createdAt) || !isCanonicalIsoTimestamp(record.updatedAt)) {
      throw new WorkspaceValidationError(`Workspace ${name}[${index}] has invalid timestamps.`);
    }
  });
}

function validateLogoAssets(workspace) {
  // Schema v1 workspaces created before logo assets were introduced remain
  // readable so the renderer repository can compact and migrate them safely.
  if (workspace.assets === undefined) return;
  if (!isPlainObject(workspace.assets) || !Array.isArray(workspace.assets.logos)) {
    throw new WorkspaceValidationError("Workspace logo assets must be an array.");
  }
  if (workspace.assets.logos.length > MAX_LOGO_ASSETS) {
    throw new WorkspaceValidationError(`Workspace logo assets exceed the ${MAX_LOGO_ASSETS} record limit.`);
  }

  const ids = new Set();
  const dataUrls = new Set();
  workspace.assets.logos.forEach((asset, index) => {
    if (!isPlainObject(asset) || typeof asset.id !== "string" || !ID_PATTERN.test(asset.id)) {
      throw new WorkspaceValidationError(`Workspace logo assets[${index}] has an invalid id.`);
    }
    if (ids.has(asset.id)) {
      throw new WorkspaceValidationError(`Workspace logo assets contains duplicate id ${asset.id}.`);
    }
    const dataMatch = typeof asset.dataUrl === "string"
      ? EMBEDDED_LOGO_PATTERN.exec(asset.dataUrl)
      : null;
    const padding = dataMatch?.[1].endsWith("==") ? 2 : dataMatch?.[1].endsWith("=") ? 1 : 0;
    const decodedBytes = dataMatch && dataMatch[1].length % 4 === 0
      ? (dataMatch[1].length / 4) * 3 - padding
      : Number.POSITIVE_INFINITY;
    if (!dataMatch || decodedBytes > MAX_LOGO_ASSET_BYTES) {
      throw new WorkspaceValidationError(`Workspace logo assets[${index}] has invalid image data.`);
    }
    if (dataUrls.has(asset.dataUrl)) {
      throw new WorkspaceValidationError("Workspace logo assets contains duplicate image data.");
    }
    ids.add(asset.id);
    dataUrls.add(asset.dataUrl);
  });
}

function serializeAndValidateWorkspace(value) {
  if (!isPlainObject(value)) throw new WorkspaceValidationError("Workspace must be an object.");
  validateTree(value);
  if (value.schemaVersion !== WORKSPACE_SCHEMA_VERSION) {
    throw new WorkspaceVersionError(value.schemaVersion);
  }
  if (!Number.isSafeInteger(value.revision) || value.revision < 0) {
    throw new WorkspaceValidationError("Workspace revision must be a non-negative integer.");
  }
  if (typeof value.installId !== "string" || !ID_PATTERN.test(value.installId)) {
    throw new WorkspaceValidationError("Workspace installId is invalid.");
  }
  if (!isCanonicalIsoTimestamp(value.createdAt) || !isCanonicalIsoTimestamp(value.updatedAt)) {
    throw new WorkspaceValidationError("Workspace timestamps are invalid.");
  }
  if (!isPlainObject(value.profile) || !isPlainObject(value.preferences) || !isPlainObject(value.migrations)) {
    throw new WorkspaceValidationError("Workspace profile, preferences, and migrations are required.");
  }
  validateLogoAssets(value);
  for (const [name, maximum] of Object.entries(COLLECTION_LIMITS)) {
    validateRecordCollection(value, name, maximum);
  }
  const serialized = JSON.stringify(value);
  if (Buffer.byteLength(serialized, "utf8") > MAX_WORKSPACE_BYTES) {
    throw new WorkspaceValidationError("Workspace exceeds the 64 MiB storage limit.");
  }
  return serialized;
}

function cloneWorkspace(value) {
  return JSON.parse(serializeAndValidateWorkspace(value));
}

async function ensureNotSymlink(filePath) {
  try {
    const stats = await fs.lstat(filePath);
    if (stats.isSymbolicLink() || !stats.isFile()) {
      throw new WorkspaceValidationError(`Workspace path is not a regular file: ${path.basename(filePath)}.`);
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

async function atomicWriteFile(filePath, serialized) {
  await ensureNotSymlink(filePath);
  const temporaryPath = path.join(
    path.dirname(filePath),
    `.invoice-studio-workspace-${process.pid}-${crypto.randomUUID()}.tmp`,
  );
  let handle;
  try {
    handle = await fs.open(temporaryPath, "wx", 0o600);
    await handle.writeFile(serialized, "utf8");
    await handle.sync();
    await handle.close();
    handle = null;
    await fs.rename(temporaryPath, filePath);
  } catch (error) {
    if (handle) await handle.close().catch(() => {});
    await fs.unlink(temporaryPath).catch(() => {});
    throw error;
  }
}

async function readWorkspaceFile(filePath) {
  await ensureNotSymlink(filePath);
  const serialized = await fs.readFile(filePath, "utf8");
  if (Buffer.byteLength(serialized, "utf8") > MAX_WORKSPACE_BYTES) {
    throw new WorkspaceValidationError("Stored workspace exceeds the 64 MiB storage limit.");
  }
  const parsed = JSON.parse(serialized);
  serializeAndValidateWorkspace(parsed);
  return parsed;
}

function createWorkspaceStore({
  directoryPath,
  fileName = DEFAULT_FILE_NAME,
  now,
  idFactory,
  logger = console,
} = {}) {
  if (typeof directoryPath !== "string" || !path.isAbsolute(directoryPath)) {
    throw new TypeError("Workspace store requires an absolute directoryPath.");
  }
  if (typeof fileName !== "string" || path.basename(fileName) !== fileName || !fileName.endsWith(".json")) {
    throw new TypeError("Workspace fileName must be a JSON filename, not a path.");
  }

  const workspacePath = path.join(directoryPath, fileName);
  const backupPath = `${workspacePath}.bak`;
  let current = null;
  let loaded = false;
  let recoveredFromBackup = false;
  let isNew = false;
  let writeQueue = Promise.resolve();

  function enqueue(operation) {
    const result = writeQueue.then(operation, operation);
    writeQueue = result.catch(() => {});
    return result;
  }

  async function loadFromDisk() {
    await fs.mkdir(directoryPath, { recursive: true, mode: 0o700 });
    try {
      current = await readWorkspaceFile(workspacePath);
    } catch (primaryError) {
      if (primaryError?.code === "WORKSPACE_VERSION_UNSUPPORTED") throw primaryError;
      if (primaryError?.code !== "ENOENT") {
        logger.warn?.("Invoice Studio workspace could not be read; trying backup:", primaryError);
      }
      try {
        current = await readWorkspaceFile(backupPath);
        recoveredFromBackup = true;
        await atomicWriteFile(workspacePath, serializeAndValidateWorkspace(current));
      } catch (backupError) {
        if (backupError?.code === "WORKSPACE_VERSION_UNSUPPORTED") throw backupError;
        if (primaryError?.code === "ENOENT" && backupError?.code === "ENOENT") {
          current = createInitialWorkspace({ now, idFactory });
          isNew = true;
          await atomicWriteFile(workspacePath, serializeAndValidateWorkspace(current));
        } else {
          const error = new WorkspaceValidationError(
            "The workspace and its backup could not be read. The original files were preserved.",
          );
          error.cause = primaryError?.code === "ENOENT" ? backupError : primaryError;
          throw error;
        }
      }
    }
    loaded = true;
    return current;
  }

  async function ensureLoaded() {
    if (!loaded) await loadFromDisk();
  }

  async function getWorkspace() {
    await ensureLoaded();
    return {
      workspace: cloneWorkspace(current),
      recoveredFromBackup,
      isNew,
    };
  }

  async function commitWorkspace(nextWorkspace, expectedRevision) {
    return enqueue(async () => {
      await ensureLoaded();
      if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
        throw new TypeError("expectedRevision must be a non-negative integer.");
      }
      if (expectedRevision !== current.revision) {
        throw new WorkspaceConflictError(expectedRevision, current.revision);
      }

      const candidate = JSON.parse(serializeAndValidateWorkspace(nextWorkspace));
      candidate.schemaVersion = WORKSPACE_SCHEMA_VERSION;
      candidate.revision = current.revision + 1;
      candidate.installId = current.installId;
      candidate.createdAt = current.createdAt;
      candidate.updatedAt = isoNow(now);
      const serialized = serializeAndValidateWorkspace(candidate);
      const backup = serializeAndValidateWorkspace(current);
      await atomicWriteFile(backupPath, backup);
      await atomicWriteFile(workspacePath, serialized);
      current = candidate;
      recoveredFromBackup = false;
      isNew = false;
      return cloneWorkspace(current);
    });
  }

  async function flush() {
    await writeQueue;
    return { revision: current?.revision ?? null };
  }

  return Object.freeze({
    backupPath,
    commitWorkspace,
    flush,
    getWorkspace,
    workspacePath,
  });
}

module.exports = {
  DEFAULT_FILE_NAME,
  MAX_WORKSPACE_BYTES,
  MAX_LOGO_ASSETS,
  MAX_LOGO_ASSET_BYTES,
  WORKSPACE_SCHEMA_VERSION,
  WorkspaceConflictError,
  WorkspaceValidationError,
  WorkspaceVersionError,
  createInitialWorkspace,
  createWorkspaceStore,
  serializeAndValidateWorkspace,
};
