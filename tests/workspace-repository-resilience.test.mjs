import assert from "node:assert/strict";
import test from "node:test";
import { createWorkspace, normalizeWorkspace } from "../src/lib/workspace.js";
import {
  WorkspaceRepositoryConflictError,
  createWorkspaceRepository,
} from "../src/lib/workspaceRepository.js";

function makeStorage() {
  const values = new Map();
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
  };
}

function makeRecoverableBridge() {
  let workspace = createWorkspace({
    now: "2026-08-19T12:00:00.000Z",
    idFactory: (prefix) => `${prefix}:repository-resilience`,
  });
  let failNextSave = false;
  const expectedRevisions = [];

  return {
    async getWorkspace() {
      return { workspace: structuredClone(workspace), isNew: false, recoveredFromBackup: false };
    },
    async saveWorkspace({ workspace: requested, expectedRevision }) {
      expectedRevisions.push(expectedRevision);
      if (failNextSave) {
        failNextSave = false;
        throw new Error("one-time disk failure");
      }
      assert.equal(expectedRevision, workspace.revision);
      const candidate = normalizeWorkspace(requested);
      candidate.revision = workspace.revision + 1;
      candidate.installId = workspace.installId;
      candidate.createdAt = workspace.createdAt;
      candidate.updatedAt = new Date().toISOString();
      workspace = candidate;
      return structuredClone(workspace);
    },
    async flushWorkspace() {
      return { revision: workspace.revision };
    },
    failOnce() {
      failNextSave = true;
    },
    inspect() {
      return { expectedRevisions: [...expectedRevisions], workspace: structuredClone(workspace) };
    },
  };
}

test("a failed repository write does not poison the ordered save queue", async () => {
  const bridge = makeRecoverableBridge();
  const repository = createWorkspaceRepository({ bridge, storage: makeStorage() });
  await repository.load();

  bridge.failOnce();
  await assert.rejects(
    repository.update((workspace) => ({
      ...workspace,
      preferences: {
        ...workspace.preferences,
        numbering: { ...workspace.preferences.numbering, prefix: "FAILED" },
      },
    })),
    /one-time disk failure/,
  );

  const recovered = await repository.update((workspace) => ({
    ...workspace,
    preferences: {
      ...workspace.preferences,
      numbering: { ...workspace.preferences.numbering, prefix: "RECOVERED" },
    },
  }));

  assert.equal(recovered.revision, 1);
  assert.equal(recovered.preferences.numbering.prefix, "RECOVERED");
  assert.deepEqual(bridge.inspect().expectedRevisions, [0, 0]);
});

test("repository snapshots and subscriber payloads cannot mutate authoritative state", async () => {
  const bridge = makeRecoverableBridge();
  const repository = createWorkspaceRepository({ bridge, storage: makeStorage() });
  repository.subscribe((snapshot) => {
    snapshot.preferences.numbering.prefix = "MUTATED OUTSIDE";
    snapshot.customers.push({ id: "customer:unsafe" });
  });

  const loaded = await repository.load();
  loaded.preferences.numbering.prefix = "ALSO MUTATED";
  loaded.invoices.push({ id: "invoice:unsafe" });

  const authoritative = repository.getSnapshot();
  assert.equal(authoritative.preferences.numbering.prefix, "INV");
  assert.deepEqual(authoritative.customers, []);
  assert.deepEqual(authoritative.invoices, []);
});

test("two browser repositories detect stale revisions instead of overwriting newer data", async () => {
  const storage = makeStorage();
  const first = createWorkspaceRepository({ bridge: null, indexedDB: null, storage });
  const stale = createWorkspaceRepository({ bridge: null, indexedDB: null, storage });
  await Promise.all([first.load(), stale.load()]);

  await first.update((workspace) => ({
    ...workspace,
    preferences: {
      ...workspace.preferences,
      numbering: { ...workspace.preferences.numbering, prefix: "FIRST" },
    },
  }));

  await assert.rejects(
    stale.update((workspace) => ({
      ...workspace,
      preferences: {
        ...workspace.preferences,
        numbering: { ...workspace.preferences.numbering, prefix: "STALE" },
      },
    })),
    (error) => error instanceof WorkspaceRepositoryConflictError
      && error.expectedRevision === 0
      && error.actualRevision === 1,
  );

  const reopened = createWorkspaceRepository({ bridge: null, indexedDB: null, storage });
  const persisted = await reopened.load();
  assert.equal(persisted.preferences.numbering.prefix, "FIRST");
  assert.equal(persisted.revision, 1);
});

test("browser fallback preserves corrupt and newer workspaces instead of replacing them", async () => {
  const storageKey = "invoice-studio:workspace:v1";
  for (const sentinel of [
    "{not valid json",
    JSON.stringify({ schemaVersion: 999, marker: "future workspace" }),
  ]) {
    const storage = makeStorage();
    storage.setItem(storageKey, sentinel);
    const repository = createWorkspaceRepository({ bridge: null, indexedDB: null, storage });

    await assert.rejects(repository.load(), (error) => (
      error?.code === "WORKSPACE_VALIDATION_FAILED"
    ));
    assert.equal(storage.getItem(storageKey), sentinel);
  }
});
