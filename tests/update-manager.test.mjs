import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
  UPDATE_CHECK_INTERVAL_MS,
  UPDATE_STARTUP_DELAY_MS,
  createUpdateManager,
} = require("../electron/update-manager.cjs");

class FakeAutoUpdater extends EventEmitter {
  constructor({ checkError = null, downloadError = null } = {}) {
    super();
    this.checkError = checkError;
    this.downloadError = downloadError;
    this.checkCalls = 0;
    this.downloadCalls = 0;
    this.installCalls = [];
    this.autoDownload = "unchanged";
    this.autoInstallOnAppQuit = "unchanged";
    this.disableWebInstaller = "unchanged";
    this.allowPrerelease = "unchanged";
    this.allowDowngrade = "unchanged";
  }

  async checkForUpdates() {
    this.checkCalls += 1;
    if (this.checkError) throw this.checkError;
    return { updateInfo: null };
  }

  async downloadUpdate() {
    this.downloadCalls += 1;
    if (this.downloadError) throw this.downloadError;
    return ["C:\\Temp\\invoice-studio-update.exe"];
  }

  quitAndInstall(...args) {
    this.installCalls.push(args);
  }
}

function createApp({ isPackaged = true, version = "1.0.0" } = {}) {
  return {
    isPackaged,
    getVersion: () => version,
  };
}

function createTimerHarness() {
  const timeouts = [];
  const intervals = [];
  const clearedTimeouts = [];
  const clearedIntervals = [];

  function createHandle(callback, delay) {
    return {
      callback,
      delay,
      unrefCalls: 0,
      unref() {
        this.unrefCalls += 1;
      },
    };
  }

  return {
    clearIntervalFn(handle) {
      clearedIntervals.push(handle);
    },
    clearTimeoutFn(handle) {
      clearedTimeouts.push(handle);
    },
    clearedIntervals,
    clearedTimeouts,
    intervals,
    setIntervalFn(callback, delay) {
      const handle = createHandle(callback, delay);
      intervals.push(handle);
      return handle;
    },
    setTimeoutFn(callback, delay) {
      const handle = createHandle(callback, delay);
      timeouts.push(handle);
      return handle;
    },
    timeouts,
  };
}

function createManager({
  app = createApp(),
  autoUpdater = new FakeAutoUpdater(),
  platform = "win32",
  logger = { warn() {} },
  timers = createTimerHarness(),
} = {}) {
  return {
    autoUpdater,
    manager: createUpdateManager({
      app,
      autoUpdater,
      platform,
      logger,
      setTimeoutFn: timers.setTimeoutFn,
      setIntervalFn: timers.setIntervalFn,
      clearTimeoutFn: timers.clearTimeoutFn,
      clearIntervalFn: timers.clearIntervalFn,
    }),
    timers,
  };
}

test("development and unsupported platforms stay disabled without updater side effects", async () => {
  const cases = [
    {
      app: createApp({ isPackaged: false, version: "1.2.3-dev" }),
      platform: "win32",
      status: "development",
    },
    {
      app: createApp({ isPackaged: true, version: "1.2.3" }),
      platform: "darwin",
      status: "unsupported",
    },
  ];

  for (const scenario of cases) {
    const { autoUpdater, manager, timers } = createManager(scenario);

    manager.start();
    manager.start();

    assert.equal(manager.isEnabled(), false);
    assert.equal(manager.getState().status, scenario.status);
    assert.equal(timers.timeouts.length, 0);
    assert.equal(timers.intervals.length, 0);
    assert.equal(autoUpdater.listenerCount("update-available"), 0);
    assert.equal(autoUpdater.autoDownload, "unchanged");

    assert.equal((await manager.checkForUpdates()).status, scenario.status);
    assert.equal((await manager.downloadUpdate()).status, scenario.status);
    assert.equal(autoUpdater.checkCalls, 0);
    assert.equal(autoUpdater.downloadCalls, 0);
    assert.throws(
      () => manager.restartAndInstall(),
      /No downloaded update is ready to install/,
    );
  }
});

test("packaged Windows startup applies safe updater policies and owns its timers", () => {
  const { autoUpdater, manager, timers } = createManager();

  manager.start();
  manager.start();

  assert.equal(manager.isEnabled(), true);
  assert.equal(manager.getState().status, "idle");
  assert.equal(autoUpdater.autoDownload, false);
  assert.equal(autoUpdater.autoInstallOnAppQuit, true);
  assert.equal(autoUpdater.disableWebInstaller, true);
  assert.equal(autoUpdater.allowPrerelease, false);
  assert.equal(autoUpdater.allowDowngrade, false);

  assert.equal(timers.timeouts.length, 1);
  assert.equal(timers.timeouts[0].delay, UPDATE_STARTUP_DELAY_MS);
  assert.equal(timers.timeouts[0].unrefCalls, 1);
  assert.equal(timers.intervals.length, 1);
  assert.equal(timers.intervals[0].delay, UPDATE_CHECK_INTERVAL_MS);
  assert.equal(timers.intervals[0].unrefCalls, 1);
  assert.equal(autoUpdater.listenerCount("update-available"), 1);

  manager.stop();
  assert.deepEqual(timers.clearedTimeouts, [timers.timeouts[0]]);
  assert.deepEqual(timers.clearedIntervals, [timers.intervals[0]]);
});

test("available update can be downloaded, tracked, and silently installed", async () => {
  const { autoUpdater, manager } = createManager();
  const observedStates = [];
  const unsubscribe = manager.onState((state) => observedStates.push(state));

  manager.start();
  autoUpdater.emit("update-available", { version: "1.1.0" });

  assert.deepEqual(manager.getState(), {
    status: "available",
    currentVersion: "1.0.0",
    availableVersion: "1.1.0",
    percent: null,
    lastCheckedAt: manager.getState().lastCheckedAt,
    errorMessage: null,
  });
  assert.match(manager.getState().lastCheckedAt, /^\d{4}-\d{2}-\d{2}T/);

  await manager.downloadUpdate();
  assert.equal(autoUpdater.downloadCalls, 1);
  assert.equal(manager.getState().status, "downloading");
  assert.equal(manager.getState().percent, 0);

  autoUpdater.emit("download-progress", { percent: 44.6 });
  assert.equal(manager.getState().percent, 45);
  autoUpdater.emit("download-progress", { percent: 500 });
  assert.equal(manager.getState().percent, 100);

  autoUpdater.emit("update-downloaded", { version: "1.1.0" });
  assert.equal(manager.getState().status, "ready");
  assert.equal(manager.getState().availableVersion, "1.1.0");
  assert.equal(manager.getState().percent, 100);

  assert.deepEqual(manager.restartAndInstall(), { accepted: true });
  assert.deepEqual(autoUpdater.installCalls, [[true, true]]);

  const observedCount = observedStates.length;
  unsubscribe();
  autoUpdater.emit("update-not-available");
  assert.equal(observedStates.length, observedCount);
});

test("state guards prevent duplicate checks, downloads, and premature installs", async () => {
  const { autoUpdater, manager } = createManager();
  manager.start();

  await assert.rejects(
    manager.downloadUpdate(),
    /No update is ready to download/,
  );
  assert.throws(
    () => manager.restartAndInstall(),
    /No downloaded update is ready to install/,
  );

  const firstCheck = manager.checkForUpdates();
  const duplicateCheck = manager.checkForUpdates();
  await Promise.all([firstCheck, duplicateCheck]);
  assert.equal(autoUpdater.checkCalls, 1);
  assert.equal(manager.getState().status, "checking");

  autoUpdater.emit("update-available", { version: "1.0.1" });
  const firstDownload = manager.downloadUpdate();
  await assert.rejects(
    manager.downloadUpdate(),
    /No update is ready to download/,
  );
  await firstDownload;
  assert.equal(autoUpdater.downloadCalls, 1);

  assert.throws(
    () => manager.restartAndInstall(),
    /No downloaded update is ready to install/,
  );
});

test("check and updater errors expose bounded messages with service URLs removed", async () => {
  const warnings = [];
  const autoUpdater = new FakeAutoUpdater({
    checkError: new Error(
      `Request to https://updates.example.test/latest.yml?token=top-secret failed ${"x".repeat(400)}`,
    ),
  });
  const { manager } = createManager({
    autoUpdater,
    logger: { warn: (...args) => warnings.push(args) },
  });
  manager.start();

  await manager.checkForUpdates();

  assert.equal(manager.getState().status, "error");
  assert.match(manager.getState().errorMessage, /the update service/);
  assert.doesNotMatch(manager.getState().errorMessage, /https?:\/\//);
  assert.doesNotMatch(manager.getState().errorMessage, /top-secret|updates\.example/);
  assert.ok(manager.getState().errorMessage.length <= 240);
  assert.equal(warnings.length, 1);

  autoUpdater.emit(
    "error",
    new Error("Download failed at http://cdn.example.test/setup.exe?credential=private retry later"),
  );
  assert.equal(manager.getState().status, "error");
  assert.equal(
    manager.getState().errorMessage,
    "Download failed at the update service retry later",
  );
  assert.equal(warnings.length, 2);
});
