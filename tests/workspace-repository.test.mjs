import assert from "node:assert/strict";
import test from "node:test";
import {
  LEGACY_DRAFT_STORAGE_KEY,
  createWorkspace,
  normalizeWorkspace,
  setWorkspaceOnboarding,
} from "../src/lib/workspace.js";
import { createWorkspaceRepository } from "../src/lib/workspaceRepository.js";

function makeStorage(entries = {}) {
  const values = new Map(Object.entries(entries));
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    removeItem(key) {
      values.delete(key);
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    values,
  };
}

class FakeEventTarget {
  constructor() {
    this.listeners = new Map();
  }

  addEventListener(type, listener, options = {}) {
    const entries = this.listeners.get(type) || [];
    entries.push({ listener, once: Boolean(options.once) });
    this.listeners.set(type, entries);
  }

  emit(type) {
    const entries = [...(this.listeners.get(type) || [])];
    this.listeners.set(type, entries.filter(({ once }) => !once));
    entries.forEach(({ listener }) => listener({ target: this }));
  }
}

function makeIndexedDb() {
  const records = new Map();
  const storeNames = new Set();

  class FakeTransaction extends FakeEventTarget {
    constructor() {
      super();
      this.pending = 0;
      this.completed = false;
      this.aborted = false;
      this.error = null;
    }

    request(operation) {
      const request = new FakeEventTarget();
      request.result = undefined;
      request.error = null;
      this.pending += 1;
      queueMicrotask(() => {
        if (this.aborted) return;
        try {
          request.result = operation();
          request.emit("success");
        } catch (error) {
          request.error = error;
          this.error = error;
          request.emit("error");
          this.emit("error");
        } finally {
          this.pending -= 1;
          setTimeout(() => {
            if (!this.aborted && !this.completed && this.pending === 0) {
              this.completed = true;
              this.emit("complete");
            }
          }, 0);
        }
      });
      return request;
    }

    objectStore() {
      return {
        get: (key) => this.request(() => structuredClone(records.get(key))),
        put: (value, key) => this.request(() => {
          records.set(key, structuredClone(value));
          return key;
        }),
      };
    }

    abort() {
      this.aborted = true;
      queueMicrotask(() => this.emit("abort"));
    }
  }

  const database = {
    close() {},
    createObjectStore(name) {
      storeNames.add(name);
    },
    objectStoreNames: { contains: (name) => storeNames.has(name) },
    transaction() {
      return new FakeTransaction();
    },
  };

  return {
    open() {
      const request = new FakeEventTarget();
      request.result = database;
      request.error = null;
      queueMicrotask(() => {
        if (!storeNames.has("workspace")) request.emit("upgradeneeded");
        request.emit("success");
      });
      return request;
    },
  };
}

function makeDesktopBridge({ initial, failSaves = false, isNew = true, delay = 0 } = {}) {
  let workspace = normalizeWorkspace(initial || createWorkspace());
  let activeSaves = 0;
  let maximumConcurrentSaves = 0;
  const expectedRevisions = [];
  let flushCalls = 0;

  return {
    async getWorkspace() {
      return { workspace: structuredClone(workspace), isNew, recoveredFromBackup: false };
    },
    async saveWorkspace({ workspace: requested, expectedRevision }) {
      expectedRevisions.push(expectedRevision);
      activeSaves += 1;
      maximumConcurrentSaves = Math.max(maximumConcurrentSaves, activeSaves);
      try {
        if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
        if (failSaves) throw new Error("simulated disk failure");
        if (workspace.revision !== expectedRevision) {
          const error = new Error("revision conflict");
          error.code = "WORKSPACE_REVISION_CONFLICT";
          throw error;
        }
        const candidate = normalizeWorkspace(requested);
        candidate.revision = workspace.revision + 1;
        candidate.installId = workspace.installId;
        candidate.createdAt = workspace.createdAt;
        candidate.updatedAt = new Date().toISOString();
        workspace = candidate;
        isNew = false;
        return structuredClone(workspace);
      } finally {
        activeSaves -= 1;
      }
    },
    async flushWorkspace() {
      flushCalls += 1;
      return { revision: workspace.revision };
    },
    inspect() {
      return {
        expectedRevisions: [...expectedRevisions],
        flushCalls,
        maximumConcurrentSaves,
        workspace: structuredClone(workspace),
      };
    },
  };
}

test("desktop repository serializes updates and exposes durable snapshots", async () => {
  const bridge = makeDesktopBridge({ delay: 5 });
  const repository = createWorkspaceRepository({ bridge, storage: makeStorage() });
  const events = [];
  const unsubscribe = repository.subscribe((workspace) => events.push(workspace.revision));

  const initial = await repository.load();
  assert.equal(repository.kind, "desktop");
  assert.equal(initial.revision, 0);

  const first = repository.update((workspace) => ({
    ...workspace,
    preferences: {
      ...workspace.preferences,
      numbering: { ...workspace.preferences.numbering, prefix: "BILL" },
    },
  }));
  const second = repository.update((workspace) => ({
    ...workspace,
    preferences: {
      ...workspace.preferences,
      numbering: { ...workspace.preferences.numbering, nextSequence: 42 },
    },
  }));
  const [, final] = await Promise.all([first, second]);

  assert.equal(final.revision, 2);
  assert.equal(final.preferences.numbering.prefix, "BILL");
  assert.equal(final.preferences.numbering.nextSequence, 42);
  assert.deepEqual(bridge.inspect().expectedRevisions, [0, 1]);
  assert.equal(bridge.inspect().maximumConcurrentSaves, 1);
  assert.deepEqual(repository.getSnapshot(), final);
  assert.deepEqual(events, [0, 1, 2]);

  assert.deepEqual(await repository.flush(), { revision: 2 });
  assert.equal(bridge.inspect().flushCalls, 1);
  await repository.close();
  assert.equal(bridge.inspect().flushCalls, 2);
  unsubscribe();
});

test("repository migrates a legacy draft once and clears it only after commit", async () => {
  const storage = makeStorage({
    [LEGACY_DRAFT_STORAGE_KEY]: JSON.stringify({
      company: { name: "Legacy Studio" },
      customer: { name: "Saved Customer" },
      meta: { number: "LEGACY-7" },
      lineItems: [],
    }),
  });
  const bridge = makeDesktopBridge();
  const repository = createWorkspaceRepository({ bridge, storage });
  const migrated = await repository.load();

  assert.equal(migrated.revision, 1);
  assert.equal(migrated.invoices.length, 1);
  assert.equal(migrated.invoices[0].invoice.meta.number, "LEGACY-7");
  assert.equal(migrated.migrations.legacyDraftV1.completed, true);
  assert.equal(storage.getItem(LEGACY_DRAFT_STORAGE_KEY), null);
  assert.equal(repository.getMetadata().isNew, false);

  storage.setItem(LEGACY_DRAFT_STORAGE_KEY, JSON.stringify({ meta: { number: "DUPLICATE" } }));
  const reopened = createWorkspaceRepository({ bridge, storage });
  const loadedAgain = await reopened.load();
  assert.equal(loadedAgain.invoices.length, 1);
  assert.equal(bridge.inspect().expectedRevisions.length, 1);
});

test("failed legacy migration commit leaves the source draft available for retry", async () => {
  const storage = makeStorage({
    [LEGACY_DRAFT_STORAGE_KEY]: JSON.stringify({ meta: { number: "RETRY-ME" } }),
  });
  const repository = createWorkspaceRepository({
    bridge: makeDesktopBridge({ failSaves: true }),
    storage,
  });

  await assert.rejects(repository.load(), /simulated disk failure/);
  assert.notEqual(storage.getItem(LEGACY_DRAFT_STORAGE_KEY), null);
});

test("browser fallback persists versioned workspace data when IndexedDB is unavailable", async () => {
  const storage = makeStorage();
  const repository = createWorkspaceRepository({
    bridge: null,
    indexedDB: null,
    storage,
  });
  assert.equal(repository.kind, "local-storage-fallback");
  await repository.load();
  await repository.update((workspace) => setWorkspaceOnboarding({
    ...workspace,
    preferences: {
      ...workspace.preferences,
      numbering: { ...workspace.preferences.numbering, prefix: "WEB" },
    },
  }, {
    status: "inProgress",
    currentStep: "customer",
    draft: { customerMode: "manual", customer: { name: "Resume Me" } },
  }));

  const reopened = createWorkspaceRepository({ bridge: null, indexedDB: null, storage });
  const persisted = await reopened.load();
  assert.equal(persisted.revision, 1);
  assert.equal(persisted.preferences.numbering.prefix, "WEB");
  assert.equal(persisted.preferences.onboarding.currentStep, "customer");
  assert.equal(persisted.preferences.onboarding.draft.customer.name, "Resume Me");
});

test("browser repository prefers IndexedDB and persists across repository instances", async () => {
  const logo = "data:image/png;base64,aW5kZXhlZC1sb2dv";
  const indexedDB = makeIndexedDb();
  const storage = makeStorage();
  const first = createWorkspaceRepository({ bridge: null, indexedDB, storage });
  assert.equal(first.kind, "indexeddb");
  await first.load();
  await first.update((workspace) => ({
    ...workspace,
    profile: {
      ...workspace.profile,
      company: { ...workspace.profile.company, logo },
    },
    preferences: {
      ...workspace.preferences,
      numbering: { ...workspace.preferences.numbering, prefix: "IDB" },
    },
  }));

  const second = createWorkspaceRepository({ bridge: null, indexedDB, storage });
  const reopened = await second.load();
  assert.equal(reopened.revision, 1);
  assert.equal(reopened.preferences.numbering.prefix, "IDB");
  assert.equal(reopened.profile.company.logo, logo);
  assert.equal(second.getSnapshot().assets.logos.length, 1);
  assert.match(second.getSnapshot().profile.company.logo, /^invoice-studio-logo:/);
  assert.equal(storage.values.size, 0);
  await first.close();
  await second.close();
});
