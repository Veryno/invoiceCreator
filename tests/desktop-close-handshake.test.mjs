import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const CLOSE_REQUEST_CHANNEL = "invoice-desktop:close-save-requested";
const CLOSE_COMPLETE_CHANNEL = "invoice-desktop:close-save-complete";
const CLOSE_RELEASE_CHANNEL = "invoice-desktop:close-save-released";

async function loadPreloadBridge() {
  const listeners = new Map();
  const sent = [];
  let exposedBridge;
  const ipcRenderer = {
    invoke() {},
    on(channel, listener) {
      listeners.set(channel, listener);
    },
    removeListener(channel, listener) {
      if (listeners.get(channel) === listener) listeners.delete(channel);
    },
    send(channel, payload) {
      sent.push({ channel, payload });
    },
  };
  const source = await readFile(new URL("../electron/preload.cjs", import.meta.url), "utf8");
  vm.runInNewContext(source, {
    console,
    require(name) {
      assert.equal(name, "electron");
      return {
        contextBridge: {
          exposeInMainWorld(name, value) {
            assert.equal(name, "invoiceDesktop");
            exposedBridge = value;
          },
        },
        ipcRenderer,
      };
    },
  }, { filename: "electron/preload.cjs" });
  return { bridge: exposedBridge, listeners, sent };
}

test("the preload close-save bridge validates requests and acknowledgements", async () => {
  const { bridge, listeners, sent } = await loadPreloadBridge();
  const received = [];
  const unsubscribe = bridge.onCloseSaveRequested((request) => received.push(request));
  const released = [];
  const unsubscribeRelease = bridge.onCloseSaveReleased((request) => released.push(request));
  const listener = listeners.get(CLOSE_REQUEST_CHANNEL);
  const releaseListener = listeners.get(CLOSE_RELEASE_CHANNEL);

  listener({}, { requestId: "not valid!", reason: "window-close" });
  listener({}, { requestId: "3ba0063e-6ed3-4fab-8834-4018a25882a0", reason: "unknown" });
  assert.equal(received.length, 0);

  listener({}, {
    requestId: "3ba0063e-6ed3-4fab-8834-4018a25882a0",
    reason: "restart-update",
    ignored: "not exposed",
  });
  assert.equal(received.length, 1);
  assert.deepEqual(
    { ...received[0] },
    {
      requestId: "3ba0063e-6ed3-4fab-8834-4018a25882a0",
      reason: "restart-update",
    },
  );
  assert.equal(Object.isFrozen(received[0]), true);

  releaseListener({}, { requestId: "not valid!", reason: "window-close" });
  releaseListener({}, {
    requestId: received[0].requestId,
    reason: "restart-update",
    ignored: "not exposed",
  });
  assert.deepEqual({ ...released[0] }, {
    requestId: received[0].requestId,
    reason: "restart-update",
  });
  assert.equal(Object.isFrozen(released[0]), true);

  bridge.acknowledgeCloseSave({
    requestId: received[0].requestId,
    status: "failed",
    errorMessage: " Disk\nfull\u0000 ",
  });
  assert.deepEqual(JSON.parse(JSON.stringify(sent)), [{
    channel: CLOSE_COMPLETE_CHANNEL,
    payload: {
      requestId: received[0].requestId,
      status: "failed",
      errorMessage: "Disk full",
    },
  }]);
  assert.throws(
    () => bridge.acknowledgeCloseSave({ requestId: received[0].requestId, status: "maybe" }),
    /status must be saved or failed/,
  );

  unsubscribe();
  unsubscribeRelease();
  assert.equal(listeners.has(CLOSE_REQUEST_CHANNEL), false);
  assert.equal(listeners.has(CLOSE_RELEASE_CHANNEL), false);
});

test("the renderer helper acknowledges only after its save barrier settles", async () => {
  let closeListener;
  let closeReleaseListener;
  const acknowledgements = [];
  globalThis.window = {
    invoiceDesktop: {
      onCloseSaveRequested(listener) {
        closeListener = listener;
        return () => {
          closeListener = undefined;
        };
      },
      onCloseSaveReleased(listener) {
        closeReleaseListener = listener;
        return () => {
          closeReleaseListener = undefined;
        };
      },
      acknowledgeCloseSave(payload) {
        acknowledgements.push(payload);
      },
    },
  };

  const desktop = await import(`../src/lib/desktop.js?close-handshake=${Date.now()}`);
  let releaseSave;
  const saveBarrier = new Promise((resolve) => {
    releaseSave = resolve;
  });
  const lifecycle = [];
  const unsubscribe = desktop.registerDesktopCloseSaveHandler(
    () => saveBarrier,
    {
      onLock: (request) => lifecycle.push(`lock:${request.requestId}`),
      onRelease: (request) => lifecycle.push(`release:${request.requestId}:${request.cause}`),
    },
  );
  closeListener({ requestId: "save-1", reason: "window-close" });
  assert.deepEqual(lifecycle, ["lock:save-1"]);
  await Promise.resolve();
  assert.deepEqual(acknowledgements, []);

  releaseSave();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(acknowledgements, [{ requestId: "save-1", status: "saved" }]);
  assert.deepEqual(lifecycle, ["lock:save-1"]);
  closeReleaseListener({ requestId: "save-1", reason: "window-close" });
  assert.deepEqual(lifecycle, ["lock:save-1", "release:save-1:main-kept-open"]);
  unsubscribe();
  assert.equal(closeListener, undefined);
  assert.equal(closeReleaseListener, undefined);

  const failedLifecycle = [];
  desktop.registerDesktopCloseSaveHandler(
    async () => {
      throw new Error("Workspace flush failed");
    },
    {
      onLock: (request) => failedLifecycle.push(`lock:${request.requestId}`),
      onRelease: (request) => failedLifecycle.push(`release:${request.requestId}:${request.cause}`),
    },
  );
  closeListener({ requestId: "save-2", reason: "restart-update" });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(acknowledgements[1], {
    requestId: "save-2",
    status: "failed",
    errorMessage: "Workspace flush failed",
  });
  assert.deepEqual(failedLifecycle, [
    "lock:save-2",
    "release:save-2:save-failed",
  ]);
  closeReleaseListener({ requestId: "save-2", reason: "restart-update" });
  assert.equal(failedLifecycle.length, 2);

  delete globalThis.window;
});
