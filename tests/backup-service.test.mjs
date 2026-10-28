import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createWorkspace, parseWorkspaceBackup } from "../src/lib/workspace.js";

const require = createRequire(import.meta.url);
const { createBackupService } = require("../electron/backup-service.cjs");

async function tempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), "invoice-studio-backup-"));
}

function fakeStore(workspace = createWorkspace()) {
  let flushed = 0;
  return {
    get flushed() {
      return flushed;
    },
    async flush() {
      flushed += 1;
    },
    async getWorkspace() {
      return { workspace };
    },
  };
}

test("backs up once a day into a restorable file and keeps only recent copies", async () => {
  const root = await tempDir();
  const folder = path.join(root, "Backups");
  await fs.mkdir(folder);
  for (let day = 1; day <= 9; day += 1) {
    await fs.writeFile(path.join(folder, `Invoice-Studio-Backup-2026-09-0${day}.json`), "{}");
  }
  await fs.writeFile(path.join(folder, "notes.txt"), "keep me");
  const store = fakeStore();
  let clock = new Date(2026, 9, 28, 9, 0, 0);
  const service = createBackupService({
    directoryPath: root,
    defaultFolder: folder,
    workspaceStore: store,
    now: () => clock,
    logger: {},
  });
  await service.saveSettings({ keep: 7 });

  const result = await service.runIfDue();
  assert.equal(result.lastError, null);
  assert.equal(result.lastFile, "Invoice-Studio-Backup-2026-10-28.json");
  assert.equal(store.flushed, 1);

  const names = (await fs.readdir(folder)).sort();
  assert.equal(names.filter((name) => name.startsWith("Invoice-Studio-Backup-")).length, 7);
  assert.ok(names.includes("notes.txt"));
  assert.ok(!names.includes("Invoice-Studio-Backup-2026-09-01.json"));

  const saved = JSON.parse(await fs.readFile(path.join(folder, result.lastFile), "utf8"));
  assert.equal(parseWorkspaceBackup(saved).schemaVersion, 1);

  clock = new Date(2026, 9, 28, 15, 0, 0);
  await service.runIfDue();
  assert.equal(store.flushed, 1, "a second check on the same day does nothing");

  clock = new Date(2026, 9, 29, 8, 0, 0);
  const next = await service.runIfDue();
  assert.equal(next.lastFile, "Invoice-Studio-Backup-2026-10-29.json");
});

test("does nothing while turned off and reports an unavailable folder plainly", async () => {
  const root = await tempDir();
  const blocker = path.join(root, "not-a-folder");
  await fs.writeFile(blocker, "");
  const store = fakeStore();
  const service = createBackupService({
    directoryPath: root,
    defaultFolder: path.join(blocker, "Backups"),
    workspaceStore: store,
    logger: {},
  });

  await service.saveSettings({ enabled: false });
  await service.runIfDue();
  assert.equal(store.flushed, 0);

  const failed = await service.backupNow();
  assert.match(failed.lastError, /folder isn’t available/u);
  assert.equal(failed.lastBackupAt, null);

  const reloaded = createBackupService({ directoryPath: root, defaultFolder: path.join(root, "Fallback"), workspaceStore: store, logger: {} });
  const settings = await reloaded.getSettings();
  assert.equal(settings.enabled, false);
  assert.equal(settings.folder, path.join(blocker, "Backups"), "the chosen folder is remembered");
});

test("only accepts an absolute folder", async () => {
  const root = await tempDir();
  const service = createBackupService({ directoryPath: root, defaultFolder: path.join(root, "B"), workspaceStore: fakeStore(), logger: {} });
  await assert.rejects(service.setFolder("relative/path"), TypeError);
  const settings = await service.setFolder(path.join(root, "USB"));
  assert.equal(settings.folder, path.join(root, "USB"));
});
