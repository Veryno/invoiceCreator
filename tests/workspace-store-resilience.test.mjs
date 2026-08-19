import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import test from "node:test";
import { createWorkspace } from "../src/lib/workspace.js";

const require = createRequire(import.meta.url);
const {
  WorkspaceConflictError,
  WorkspaceVersionError,
  createInitialWorkspace,
  createWorkspaceStore,
} = require("../electron/workspace-store.cjs");

async function withTemporaryDirectory(run) {
  const directoryPath = await mkdtemp(path.join(tmpdir(), "invoice-studio-store-resilience-"));
  try {
    return await run(directoryPath);
  } finally {
    await rm(directoryPath, { recursive: true, force: true });
  }
}

function withCustomer(workspace, id) {
  return {
    ...workspace,
    customers: [
      ...workspace.customers,
      {
        id,
        name: id,
        email: "",
        phone: "",
        address: "",
        notes: "",
        createdAt: workspace.createdAt,
        updatedAt: workspace.updatedAt,
        archivedAt: null,
      },
    ],
  };
}

test("main-process and renderer workspace defaults stay schema-compatible", () => {
  const options = {
    now: "2026-08-19T12:00:00.000Z",
    idFactory: (prefix) => `${prefix}:same-defaults`,
  };
  assert.deepEqual(createInitialWorkspace(options), createWorkspace(options));
});

test("concurrent desktop commits serialize and reject the stale writer", async () => {
  await withTemporaryDirectory(async (directoryPath) => {
    const store = createWorkspaceStore({
      directoryPath,
      now: "2026-08-19T12:00:00.000Z",
      idFactory: (prefix) => `${prefix}:concurrent-store`,
      logger: { warn() {} },
    });
    const initial = (await store.getWorkspace()).workspace;
    const first = store.commitWorkspace(withCustomer(initial, "customer:first"), 0);
    const stale = store.commitWorkspace(withCustomer(initial, "customer:stale"), 0);

    const committed = await first;
    await assert.rejects(
      stale,
      (error) => error instanceof WorkspaceConflictError
        && error.expectedRevision === 0
        && error.actualRevision === 1,
    );
    assert.equal(committed.revision, 1);
    assert.deepEqual(
      (await store.getWorkspace()).workspace.customers.map(({ id }) => id),
      ["customer:first"],
    );
  });
});

test("a rejected desktop commit does not poison later valid writes", async () => {
  await withTemporaryDirectory(async (directoryPath) => {
    const store = createWorkspaceStore({
      directoryPath,
      now: "2026-08-19T12:00:00.000Z",
      idFactory: (prefix) => `${prefix}:recovering-store`,
      logger: { warn() {} },
    });
    const initial = (await store.getWorkspace()).workspace;

    await assert.rejects(
      store.commitWorkspace({ ...initial, schemaVersion: 99 }, 0),
      WorkspaceVersionError,
    );
    const committed = await store.commitWorkspace(withCustomer(initial, "customer:valid"), 0);

    assert.equal(committed.revision, 1);
    assert.equal(committed.customers[0].id, "customer:valid");
    assert.deepEqual(await store.flush(), { revision: 1 });
  });
});
