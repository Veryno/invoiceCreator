import {
  LEGACY_DRAFT_STORAGE_KEY,
  compactWorkspaceLogoAssets,
  createWorkspace,
  hydrateWorkspaceLogoAssets,
  migrateLegacyDraft,
  normalizeWorkspace,
} from "./workspace.js";

const DATABASE_NAME = "invoice-studio-workspace";
const DATABASE_VERSION = 1;
const OBJECT_STORE_NAME = "workspace";
const CURRENT_WORKSPACE_KEY = "current";
const LOCAL_WORKSPACE_KEY = "invoice-studio:workspace:v1";

export class WorkspaceRepositoryConflictError extends Error {
  constructor(expected, actual) {
    super(`Workspace revision conflict: expected ${String(expected)}, current revision is ${String(actual)}.`);
    this.name = "WorkspaceRepositoryConflictError";
    this.code = "WORKSPACE_REVISION_CONFLICT";
    this.expectedRevision = expected;
    this.actualRevision = actual;
  }
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result), { once: true });
    request.addEventListener("error", () => reject(request.error || new Error("IndexedDB request failed.")), { once: true });
  });
}

function transactionComplete(transaction) {
  return new Promise((resolve, reject) => {
    transaction.addEventListener("complete", () => resolve(), { once: true });
    transaction.addEventListener("abort", () => reject(transaction.error || new Error("IndexedDB transaction aborted.")), { once: true });
    transaction.addEventListener("error", () => reject(transaction.error || new Error("IndexedDB transaction failed.")), { once: true });
  });
}

function openDatabase(indexedDb) {
  return new Promise((resolve, reject) => {
    const request = indexedDb.open(DATABASE_NAME, DATABASE_VERSION);
    request.addEventListener("upgradeneeded", () => {
      if (!request.result.objectStoreNames.contains(OBJECT_STORE_NAME)) {
        request.result.createObjectStore(OBJECT_STORE_NAME);
      }
    });
    request.addEventListener("success", () => resolve(request.result), { once: true });
    request.addEventListener("error", () => reject(request.error || new Error("Unable to open local workspace database.")), { once: true });
    request.addEventListener("blocked", () => reject(new Error("The local workspace database is blocked by another window.")), { once: true });
  });
}

function createIndexedDbAdapter(indexedDb, options) {
  let databasePromise;
  const database = () => {
    databasePromise ||= openDatabase(indexedDb);
    return databasePromise;
  };

  async function load() {
    const db = await database();
    const transaction = db.transaction(OBJECT_STORE_NAME, "readwrite");
    const store = transaction.objectStore(OBJECT_STORE_NAME);
    let workspace = await requestResult(store.get(CURRENT_WORKSPACE_KEY));
    let isNew = false;
    if (!workspace) {
      workspace = createWorkspace(options);
      store.put(workspace, CURRENT_WORKSPACE_KEY);
      isNew = true;
    }
    await transactionComplete(transaction);
    return { workspace: normalizeWorkspace(workspace, options), isNew, recoveredFromBackup: false };
  }

  async function commit(nextWorkspace, expectedRevision) {
    const db = await database();
    const transaction = db.transaction(OBJECT_STORE_NAME, "readwrite");
    const store = transaction.objectStore(OBJECT_STORE_NAME);
    const currentValue = await requestResult(store.get(CURRENT_WORKSPACE_KEY));
    const current = normalizeWorkspace(currentValue || createWorkspace(options), options);
    if (current.revision !== expectedRevision) {
      transaction.abort();
      throw new WorkspaceRepositoryConflictError(expectedRevision, current.revision);
    }
    const candidate = normalizeWorkspace(nextWorkspace, options);
    candidate.revision = current.revision + 1;
    candidate.installId = current.installId;
    candidate.createdAt = current.createdAt;
    candidate.updatedAt = new Date().toISOString();
    store.put(candidate, CURRENT_WORKSPACE_KEY);
    await transactionComplete(transaction);
    return normalizeWorkspace(candidate, options);
  }

  return {
    kind: "indexeddb",
    load,
    commit,
    async flush() {},
    async close() {
      const db = await databasePromise;
      db?.close();
    },
  };
}

function createLocalStorageAdapter(storage, options) {
  function read() {
    const value = storage?.getItem?.(LOCAL_WORKSPACE_KEY);
    if (value === null || value === undefined || value === "") return null;
    try {
      return normalizeWorkspace(JSON.parse(value), options);
    } catch (error) {
      const failure = new Error("The local workspace could not be read. Its original data was preserved.", { cause: error });
      failure.name = "WorkspaceStorageError";
      failure.code = "WORKSPACE_VALIDATION_FAILED";
      throw failure;
    }
  }

  return {
    kind: "local-storage-fallback",
    async load() {
      let workspace = read();
      const isNew = !workspace;
      workspace ||= createWorkspace(options);
      storage?.setItem?.(LOCAL_WORKSPACE_KEY, JSON.stringify(workspace));
      return { workspace, isNew, recoveredFromBackup: false };
    },
    async commit(nextWorkspace, expectedRevision) {
      const current = read() || createWorkspace(options);
      if (current.revision !== expectedRevision) {
        throw new WorkspaceRepositoryConflictError(expectedRevision, current.revision);
      }
      const candidate = normalizeWorkspace(nextWorkspace, options);
      candidate.revision = current.revision + 1;
      candidate.installId = current.installId;
      candidate.createdAt = current.createdAt;
      candidate.updatedAt = new Date().toISOString();
      storage?.setItem?.(LOCAL_WORKSPACE_KEY, JSON.stringify(candidate));
      return normalizeWorkspace(candidate, options);
    },
    async flush() {},
    async close() {},
  };
}

function createDesktopAdapter(bridge) {
  return {
    kind: "desktop",
    load: () => bridge.getWorkspace(),
    commit: (workspace, expectedRevision) => bridge.saveWorkspace({ workspace, expectedRevision }),
    flush: () => bridge.flushWorkspace(),
    async close() {},
  };
}

function resolveEnvironment(options) {
  const browserWindow = typeof window === "object" ? window : undefined;
  return {
    bridge: options.bridge ?? browserWindow?.invoiceDesktop,
    indexedDb: options.indexedDB === undefined ? browserWindow?.indexedDB : options.indexedDB,
    storage: options.storage === undefined ? browserWindow?.localStorage : options.storage,
  };
}

/**
 * Creates the one authoritative workspace repository used by the React shell.
 * Desktop builds persist through validated main-process IPC. Browser previews
 * use IndexedDB, with localStorage only as a last-resort compatibility fallback.
 */
export function createWorkspaceRepository(options = {}) {
  const environment = resolveEnvironment(options);
  const adapter = environment.bridge?.getWorkspace
    && environment.bridge?.saveWorkspace
    && environment.bridge?.flushWorkspace
    ? createDesktopAdapter(environment.bridge)
    : environment.indexedDb
      ? createIndexedDbAdapter(environment.indexedDb, options)
      : createLocalStorageAdapter(environment.storage, options);

  let current = null;
  let metadata = { isNew: false, recoveredFromBackup: false };
  let operationQueue = Promise.resolve();
  const listeners = new Set();

  const compact = (workspace) => compactWorkspaceLogoAssets(workspace, options);
  const hydrate = (workspace) => hydrateWorkspaceLogoAssets(workspace, options);

  async function commitVisibleWorkspace(workspace, expectedRevision) {
    const compacted = compact(workspace).workspace;
    return hydrate(await adapter.commit(compacted, expectedRevision));
  }

  function emit() {
    if (!current) return;
    const snapshot = hydrate(current);
    listeners.forEach((listener) => listener(snapshot));
  }

  function enqueue(operation) {
    const result = operationQueue.then(operation, operation);
    operationQueue = result.catch(() => {});
    return result;
  }

  async function migrateLegacyIfPresent() {
    if (!current || current.migrations.legacyDraftV1.completed) return null;
    let legacyValue = null;
    try {
      legacyValue = environment.storage?.getItem?.(LEGACY_DRAFT_STORAGE_KEY) ?? null;
    } catch {
      return null;
    }
    const result = migrateLegacyDraft(current, legacyValue, options);
    if (!result.migrated) return result;
    current = await commitVisibleWorkspace(result.workspace, current.revision);
    metadata = { ...metadata, isNew: false };
    try {
      environment.storage?.removeItem?.(LEGACY_DRAFT_STORAGE_KEY);
    } catch {
      // The committed workspace is authoritative; a stale legacy key is safe
      // because the persisted migration marker prevents duplicate imports.
    }
    emit();
    return result;
  }

  async function load() {
    return enqueue(async () => {
      if (current) return normalizeWorkspace(current, options);
      const result = await adapter.load();
      const loaded = normalizeWorkspace(result?.workspace, options);
      const compacted = compact(loaded);
      current = compacted.changed
        ? hydrate(await adapter.commit(compacted.workspace, loaded.revision))
        : hydrate(loaded);
      metadata = {
        isNew: Boolean(result?.isNew),
        recoveredFromBackup: Boolean(result?.recoveredFromBackup),
      };
      if (compacted.changed) metadata.isNew = false;
      await migrateLegacyIfPresent();
      emit();
      return hydrate(current);
    });
  }

  async function save(nextWorkspace, saveOptions = {}) {
    const requested = normalizeWorkspace(nextWorkspace, options);
    const expectedRevision = saveOptions.expectedRevision ?? requested.revision;
    return enqueue(async () => {
      if (!current) {
        const result = await adapter.load();
        current = hydrate(result.workspace);
      }
      current = await commitVisibleWorkspace(requested, expectedRevision);
      metadata = { ...metadata, isNew: false };
      emit();
      return hydrate(current);
    });
  }

  async function update(updater) {
    if (typeof updater !== "function") throw new TypeError("Workspace updater must be a function.");
    return enqueue(async () => {
      if (!current) {
        const result = await adapter.load();
        const loaded = normalizeWorkspace(result.workspace, options);
        const compacted = compact(loaded);
        current = compacted.changed
          ? hydrate(await adapter.commit(compacted.workspace, loaded.revision))
          : hydrate(loaded);
        await migrateLegacyIfPresent();
      }
      const base = hydrate(current);
      const updated = updater(base);
      const candidate = normalizeWorkspace(updated === undefined ? base : updated, options);
      current = await commitVisibleWorkspace(candidate, base.revision);
      metadata = { ...metadata, isNew: false };
      emit();
      return hydrate(current);
    });
  }

  async function flush() {
    await operationQueue;
    await adapter.flush();
    return current ? { revision: current.revision } : { revision: null };
  }

  async function close() {
    await flush();
    await adapter.close();
  }

  return Object.freeze({
    kind: adapter.kind,
    close,
    flush,
    getMetadata: () => ({ ...metadata }),
    // Authoritative snapshots mirror durable storage. UI-facing load/update
    // returns and subscriber payloads remain hydrated.
    getSnapshot: () => current ? compact(current).workspace : null,
    load,
    save,
    subscribe(listener) {
      if (typeof listener !== "function") throw new TypeError("Workspace listener must be a function.");
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    update,
  });
}
