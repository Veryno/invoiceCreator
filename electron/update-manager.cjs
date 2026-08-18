"use strict";

const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const UPDATE_STARTUP_DELAY_MS = 12 * 1000;

function cleanVersion(value) {
  return typeof value === "string" ? value.slice(0, 80) : null;
}

function cleanError(error) {
  const message = error instanceof Error ? error.message : String(error || "Unknown update error");
  return message.replace(/https?:\/\/\S+/gi, "the update service").slice(0, 240);
}

function createUpdateManager({
  app,
  autoUpdater,
  platform = process.platform,
  logger = console,
  setTimeoutFn = setTimeout,
  setIntervalFn = setInterval,
  clearTimeoutFn = clearTimeout,
  clearIntervalFn = clearInterval,
}) {
  if (!app || !autoUpdater) {
    throw new TypeError("Update manager requires app and autoUpdater.");
  }

  const isWindows = platform === "win32";
  const enabled = Boolean(app.isPackaged && isWindows);
  const listeners = new Set();
  let started = false;
  let checkTimer = null;
  let intervalTimer = null;
  let lastCheckRequestAt = 0;
  let state = {
    status: enabled ? "idle" : app.isPackaged ? "unsupported" : "development",
    currentVersion: cleanVersion(app.getVersion?.()) || "0.0.0",
    availableVersion: null,
    percent: null,
    lastCheckedAt: null,
    errorMessage: null,
  };

  function snapshot() {
    return { ...state };
  }

  function updateState(patch) {
    state = { ...state, ...patch };
    const next = snapshot();
    listeners.forEach((listener) => listener(next));
    return next;
  }

  function onState(listener) {
    if (typeof listener !== "function") {
      throw new TypeError("Update state listener must be a function.");
    }
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  async function checkForUpdates() {
    if (!enabled) return snapshot();
    if (["checking", "downloading"].includes(state.status)) return snapshot();

    const now = Date.now();
    if (now - lastCheckRequestAt < 5_000) return snapshot();
    lastCheckRequestAt = now;

    updateState({ status: "checking", errorMessage: null, percent: null });
    try {
      await autoUpdater.checkForUpdates();
    } catch (error) {
      logger.warn?.("Invoice Studio update check failed:", error);
      updateState({
        status: "error",
        errorMessage: cleanError(error),
        lastCheckedAt: new Date().toISOString(),
      });
    }
    return snapshot();
  }

  async function downloadUpdate() {
    if (!enabled) return snapshot();
    if (state.status !== "available") {
      throw new Error("No update is ready to download.");
    }

    updateState({ status: "downloading", percent: 0, errorMessage: null });
    try {
      await autoUpdater.downloadUpdate();
    } catch (error) {
      logger.warn?.("Invoice Studio update download failed:", error);
      updateState({ status: "error", errorMessage: cleanError(error), percent: null });
    }
    return snapshot();
  }

  function restartAndInstall() {
    if (!enabled || state.status !== "ready") {
      throw new Error("No downloaded update is ready to install.");
    }
    // The one-click, per-user NSIS installer can run silently after the user
    // explicitly chooses Restart & update.
    autoUpdater.quitAndInstall(true, true);
    return { accepted: true };
  }

  function start() {
    if (started) return;
    started = true;
    if (!enabled) return;

    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.disableWebInstaller = true;
    autoUpdater.allowPrerelease = false;
    autoUpdater.allowDowngrade = false;

    autoUpdater.on("checking-for-update", () => {
      updateState({ status: "checking", errorMessage: null, percent: null });
    });
    autoUpdater.on("update-available", (info) => {
      updateState({
        status: "available",
        availableVersion: cleanVersion(info?.version),
        percent: null,
        errorMessage: null,
        lastCheckedAt: new Date().toISOString(),
      });
    });
    autoUpdater.on("update-not-available", () => {
      updateState({
        status: "current",
        availableVersion: null,
        percent: null,
        errorMessage: null,
        lastCheckedAt: new Date().toISOString(),
      });
    });
    autoUpdater.on("download-progress", (progress) => {
      const percent = Number.isFinite(progress?.percent)
        ? Math.max(0, Math.min(100, Math.round(progress.percent)))
        : 0;
      updateState({ status: "downloading", percent, errorMessage: null });
    });
    autoUpdater.on("update-downloaded", (info) => {
      updateState({
        status: "ready",
        availableVersion: cleanVersion(info?.version) || state.availableVersion,
        percent: 100,
        errorMessage: null,
      });
    });
    autoUpdater.on("error", (error) => {
      logger.warn?.("Invoice Studio updater error:", error);
      updateState({ status: "error", errorMessage: cleanError(error), percent: null });
    });

    checkTimer = setTimeoutFn(() => void checkForUpdates(), UPDATE_STARTUP_DELAY_MS);
    checkTimer?.unref?.();
    intervalTimer = setIntervalFn(() => void checkForUpdates(), UPDATE_CHECK_INTERVAL_MS);
    intervalTimer?.unref?.();
  }

  function stop() {
    if (checkTimer) clearTimeoutFn(checkTimer);
    if (intervalTimer) clearIntervalFn(intervalTimer);
    checkTimer = null;
    intervalTimer = null;
  }

  return {
    checkForUpdates,
    downloadUpdate,
    getState: snapshot,
    isEnabled: () => enabled,
    onState,
    restartAndInstall,
    start,
    stop,
  };
}

module.exports = {
  UPDATE_CHECK_INTERVAL_MS,
  UPDATE_STARTUP_DELAY_MS,
  createUpdateManager,
};
