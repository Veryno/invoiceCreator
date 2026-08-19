import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
  WorkspaceConflictError,
  WorkspaceValidationError,
  WorkspaceVersionError,
  createWorkspaceStore,
  serializeAndValidateWorkspace,
} = require("../electron/workspace-store.cjs");

async function withTemporaryDirectory(run) {
  const directoryPath = await mkdtemp(path.join(tmpdir(), "invoice-studio-workspace-"));
  try {
    return await run(directoryPath);
  } finally {
    await rm(directoryPath, { recursive: true, force: true });
  }
}

function addCustomer(workspace, id, name, timestamp) {
  return {
    ...workspace,
    customers: [
      ...workspace.customers,
      {
        id,
        name,
        email: "",
        phone: "",
        address: "",
        notes: "",
        createdAt: timestamp,
        updatedAt: timestamp,
        archivedAt: null,
      },
    ],
  };
}

test("desktop store commits atomically with optimistic revisions and a backup", async () => {
  await withTemporaryDirectory(async (directoryPath) => {
    const timestamp = "2026-08-19T12:00:00.000Z";
    const store = createWorkspaceStore({
      directoryPath,
      now: timestamp,
      idFactory: () => "install:test",
      logger: { warn() {} },
    });
    const initialResult = await store.getWorkspace();
    assert.equal(initialResult.isNew, true);
    assert.equal(initialResult.workspace.revision, 0);

    const committed = await store.commitWorkspace(
      addCustomer(initialResult.workspace, "customer:first", "First", timestamp),
      0,
    );
    assert.equal(committed.revision, 1);
    assert.equal(committed.customers[0].name, "First");
    assert.equal((await store.flush()).revision, 1);

    const primary = JSON.parse(await readFile(store.workspacePath, "utf8"));
    const backup = JSON.parse(await readFile(store.backupPath, "utf8"));
    assert.equal(primary.revision, 1);
    assert.equal(backup.revision, 0);

    await assert.rejects(
      store.commitWorkspace(committed, 0),
      (error) => error instanceof WorkspaceConflictError
        && error.expectedRevision === 0
        && error.actualRevision === 1,
    );
  });
});

test("desktop store recovers the last valid backup after primary corruption", async () => {
  await withTemporaryDirectory(async (directoryPath) => {
    const warnings = [];
    const options = {
      directoryPath,
      now: "2026-08-19T12:00:00.000Z",
      idFactory: () => "install:recover",
      logger: { warn: (...args) => warnings.push(args) },
    };
    const firstStore = createWorkspaceStore(options);
    const initial = (await firstStore.getWorkspace()).workspace;
    const revisionOne = await firstStore.commitWorkspace(
      addCustomer(initial, "customer:first", "First", initial.createdAt),
      0,
    );
    const revisionTwo = await firstStore.commitWorkspace(
      addCustomer(revisionOne, "customer:second", "Second", initial.createdAt),
      1,
    );
    assert.equal(revisionTwo.revision, 2);
    await writeFile(firstStore.workspacePath, "{corrupt json", "utf8");

    const recoveredStore = createWorkspaceStore(options);
    const recovered = await recoveredStore.getWorkspace();
    assert.equal(recovered.recoveredFromBackup, true);
    assert.equal(recovered.isNew, false);
    assert.equal(recovered.workspace.revision, 1);
    assert.equal(recovered.workspace.customers.length, 1);
    assert.ok(warnings.length >= 1);

    const repairedPrimary = JSON.parse(await readFile(recoveredStore.workspacePath, "utf8"));
    assert.equal(repairedPrimary.revision, 1);
  });
});

test("desktop validation rejects non-finite data, dangerous keys, and path traversal", async () => {
  await withTemporaryDirectory(async (directoryPath) => {
    assert.throws(
      () => createWorkspaceStore({ directoryPath, fileName: "../escape.json" }),
      /not a path/,
    );
    const store = createWorkspaceStore({
      directoryPath,
      idFactory: () => "install:validated",
      logger: { warn() {} },
    });
    const initial = (await store.getWorkspace()).workspace;

    const legacyWithoutAssets = structuredClone(initial);
    delete legacyWithoutAssets.assets;
    legacyWithoutAssets.profile.company.logo = "data:image/png;base64,bGVnYWN5";
    assert.doesNotThrow(() => serializeAndValidateWorkspace(legacyWithoutAssets));

    assert.throws(
      () => serializeAndValidateWorkspace({ ...initial, unsafeNumber: Number.NaN }),
      WorkspaceValidationError,
    );
    const dangerous = structuredClone(initial);
    dangerous.extra = JSON.parse('{"__proto__":"blocked"}');
    assert.throws(
      () => serializeAndValidateWorkspace(dangerous),
      /forbidden key/,
    );
    assert.throws(
      () => serializeAndValidateWorkspace({ ...initial, updatedAt: "not-a-timestamp" }),
      /timestamps are invalid/,
    );
    assert.throws(
      () => serializeAndValidateWorkspace({
        ...initial,
        assets: {
          logos: [{ id: "logo:invalid", dataUrl: "data:image/png;base64,not valid!" }],
        },
      }),
      /invalid image data/,
    );

    await assert.rejects(
      store.commitWorkspace({ ...initial, schemaVersion: 2 }, 0),
      WorkspaceVersionError,
    );
    assert.equal((await store.getWorkspace()).workspace.revision, 0);
  });
});

test("desktop store preserves unreadable and newer primary files instead of replacing them", async () => {
  await withTemporaryDirectory(async (directoryPath) => {
    const options = {
      directoryPath,
      idFactory: () => "install:preserved",
      logger: { warn() {} },
    };
    const firstStore = createWorkspaceStore(options);
    const initial = (await firstStore.getWorkspace()).workspace;
    await writeFile(firstStore.workspacePath, "{still recoverable by a user", "utf8");

    const corruptStore = createWorkspaceStore(options);
    await assert.rejects(
      corruptStore.getWorkspace(),
      /original files were preserved/,
    );
    assert.equal(await readFile(firstStore.workspacePath, "utf8"), "{still recoverable by a user");

    await writeFile(firstStore.workspacePath, JSON.stringify({ ...initial, schemaVersion: 2 }), "utf8");
    const newerStore = createWorkspaceStore(options);
    await assert.rejects(newerStore.getWorkspace(), WorkspaceVersionError);
    const untouched = JSON.parse(await readFile(firstStore.workspacePath, "utf8"));
    assert.equal(untouched.schemaVersion, 2);
  });
});
