"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");

const SETTINGS_FILE = "backup-settings.json";
const BACKUP_PREFIX = "Invoice-Studio-Backup-";
const BACKUP_PATTERN = /^Invoice-Studio-Backup-\d{4}-\d{2}-\d{2}\.json$/u;
const KEEP_OPTIONS = Object.freeze([7, 14, 30, 60, 90]);
const DAY_MS = 24 * 60 * 60 * 1000;
const CHECK_INTERVAL_MS = 60 * 60 * 1000;

function localDate(date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function cleanSettings(value, defaultFolder) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const folder = typeof source.folder === "string" && path.isAbsolute(source.folder)
    ? path.normalize(source.folder)
    : defaultFolder;
  const keep = KEEP_OPTIONS.includes(source.keep) ? source.keep : 30;
  const lastBackupAt = typeof source.lastBackupAt === "string" && Number.isFinite(Date.parse(source.lastBackupAt))
    ? source.lastBackupAt
    : null;
  return {
    enabled: typeof source.enabled === "boolean" ? source.enabled : true,
    folder,
    keep,
    lastBackupAt,
    lastFile: typeof source.lastFile === "string" ? path.basename(source.lastFile) : null,
    lastError: typeof source.lastError === "string" ? source.lastError.slice(0, 300) : null,
  };
}

async function writeAtomically(filePath, contents) {
  const temporaryPath = path.join(
    path.dirname(filePath),
    `.invoice-studio-backup-${process.pid}-${crypto.randomUUID()}.tmp`,
  );
  let handle;
  try {
    handle = await fs.open(temporaryPath, "wx", 0o600);
    await handle.writeFile(contents, "utf8");
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

function friendlyError(error) {
  if (["ENOENT", "ENOTDIR"].includes(error?.code)) return "The backup folder isn’t available. If it’s on a USB drive, plug it in, or choose another folder.";
  if (["EACCES", "EPERM", "EROFS"].includes(error?.code)) return "Invoice Studio isn’t allowed to save in the backup folder. Choose another folder.";
  if (error?.code === "ENOSPC") return "The backup drive is full. Free up space or choose another folder.";
  return error?.message || "The backup couldn’t be saved.";
}

/**
 * Writes one dated copy of the workspace per day to a folder the owner picks
 * (a USB drive or a Dropbox/OneDrive folder protects against losing the
 * computer) and keeps only the most recent copies. Each file is a normal
 * Settings backup, so Restore backup reads it directly.
 */
function createBackupService({ directoryPath, defaultFolder, workspaceStore, now = () => new Date(), logger = console }) {
  if (!path.isAbsolute(directoryPath) || !path.isAbsolute(defaultFolder)) {
    throw new TypeError("Backup service paths must be absolute.");
  }
  const settingsPath = path.join(directoryPath, SETTINGS_FILE);
  let settings = null;
  let running = null;
  let timer = null;

  async function load() {
    if (settings) return settings;
    try {
      settings = cleanSettings(JSON.parse(await fs.readFile(settingsPath, "utf8")), defaultFolder);
    } catch {
      settings = cleanSettings({}, defaultFolder);
    }
    return settings;
  }

  async function persist(next) {
    settings = cleanSettings(next, defaultFolder);
    await fs.mkdir(directoryPath, { recursive: true, mode: 0o700 });
    await writeAtomically(settingsPath, JSON.stringify(settings, null, 2));
    return settings;
  }

  async function getSettings() {
    const current = await load();
    return { ...current, defaultFolder, keepOptions: [...KEEP_OPTIONS] };
  }

  async function saveSettings(patch = {}) {
    const current = await load();
    await persist({
      ...current,
      ...(typeof patch.enabled === "boolean" ? { enabled: patch.enabled } : {}),
      ...(KEEP_OPTIONS.includes(patch.keep) ? { keep: patch.keep } : {}),
    });
    return getSettings();
  }

  // The folder only ever comes from the main process (a native dialog result),
  // never from text the renderer sends.
  async function setFolder(folder) {
    if (typeof folder !== "string" || !path.isAbsolute(folder)) throw new TypeError("Choose a folder.");
    const current = await load();
    await persist({ ...current, folder, lastError: null });
    return getSettings();
  }

  async function prune(folder, keep) {
    const names = (await fs.readdir(folder)).filter((name) => BACKUP_PATTERN.test(name)).sort();
    const extra = names.slice(0, Math.max(0, names.length - keep));
    await Promise.all(extra.map((name) => fs.unlink(path.join(folder, name)).catch(() => {})));
  }

  async function backupNow() {
    if (running) return running;
    running = (async () => {
      const current = await load();
      const date = now();
      const fileName = `${BACKUP_PREFIX}${localDate(date)}.json`;
      try {
        await workspaceStore.flush();
        const { workspace } = await workspaceStore.getWorkspace();
        const contents = JSON.stringify({ app: "Invoice Studio", backupVersion: 1, workspace }, null, 2);
        await fs.mkdir(current.folder, { recursive: true });
        await writeAtomically(path.join(current.folder, fileName), contents);
        await prune(current.folder, current.keep);
        await persist({ ...current, lastBackupAt: date.toISOString(), lastFile: fileName, lastError: null });
      } catch (error) {
        logger.warn?.("Invoice Studio automatic backup failed:", error);
        await persist({ ...current, lastError: friendlyError(error) }).catch(() => {});
      }
      return getSettings();
    })();
    try {
      return await running;
    } finally {
      running = null;
    }
  }

  async function runIfDue() {
    const current = await load();
    if (!current.enabled) return getSettings();
    const last = current.lastBackupAt ? Date.parse(current.lastBackupAt) : 0;
    const today = localDate(now());
    const lastDay = last ? localDate(new Date(last)) : null;
    if (lastDay === today && now().getTime() - last < DAY_MS && !current.lastError) return getSettings();
    return backupNow();
  }

  function start() {
    void runIfDue().catch(() => {});
    timer = setInterval(() => {
      void runIfDue().catch(() => {});
    }, CHECK_INTERVAL_MS);
    timer.unref?.();
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  return Object.freeze({ backupNow, getSettings, runIfDue, saveSettings, setFolder, start, stop });
}

module.exports = { BACKUP_PATTERN, KEEP_OPTIONS, createBackupService };
