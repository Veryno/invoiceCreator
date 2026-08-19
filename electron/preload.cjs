"use strict";

const { contextBridge, ipcRenderer } = require("electron");

const IPC_CHANNELS = Object.freeze({
  exportPdf: "invoice-desktop:export-pdf",
  saveTextFile: "invoice-desktop:save-text-file",
  updateState: "invoice-desktop:update-state",
  getUpdateState: "invoice-desktop:get-update-state",
  checkForUpdates: "invoice-desktop:check-for-updates",
  downloadUpdate: "invoice-desktop:download-update",
  restartAndInstall: "invoice-desktop:restart-and-install",
  getWorkspace: "invoice-desktop:get-workspace",
  saveWorkspace: "invoice-desktop:save-workspace",
  flushWorkspace: "invoice-desktop:flush-workspace",
  closeSaveRequested: "invoice-desktop:close-save-requested",
  closeSaveComplete: "invoice-desktop:close-save-complete",
  closeSaveReleased: "invoice-desktop:close-save-released",
});

const CLOSE_REASONS = new Set(["window-close", "restart-update"]);
let closeSaveListener = null;
let closeSaveReleaseListener = null;

function requireOptions(options, operation) {
  if (options === undefined) {
    return {};
  }
  if (options === null || typeof options !== "object" || Array.isArray(options)) {
    throw new TypeError(`${operation} options must be an object.`);
  }
  return options;
}

function requireCloseRequestId(value) {
  if (
    typeof value !== "string"
    || value.length > 80
    || !/^[a-zA-Z0-9-]+$/.test(value)
  ) {
    throw new TypeError("Close save acknowledgement requires a valid requestId.");
  }
  return value;
}

const invoiceDesktop = Object.freeze({
  isDesktop: true,

  exportPdf(options) {
    const value = requireOptions(options, "PDF export");
    return ipcRenderer.invoke(IPC_CHANNELS.exportPdf, {
      suggestedName: value.suggestedName,
      pageSize: value.pageSize,
    });
  },

  saveTextFile(options) {
    const value = requireOptions(options, "Text export");
    return ipcRenderer.invoke(IPC_CHANNELS.saveTextFile, {
      suggestedName: value.suggestedName,
      contents: value.contents,
      filters: value.filters,
    });
  },

  getWorkspace() {
    return ipcRenderer.invoke(IPC_CHANNELS.getWorkspace);
  },

  saveWorkspace(options) {
    const value = requireOptions(options, "Workspace save");
    if (value.workspace === null || typeof value.workspace !== "object" || Array.isArray(value.workspace)) {
      throw new TypeError("Workspace save requires a workspace object.");
    }
    if (!Number.isSafeInteger(value.expectedRevision) || value.expectedRevision < 0) {
      throw new TypeError("Workspace save expectedRevision must be a non-negative integer.");
    }
    return ipcRenderer.invoke(IPC_CHANNELS.saveWorkspace, {
      workspace: value.workspace,
      expectedRevision: value.expectedRevision,
    });
  },

  flushWorkspace() {
    return ipcRenderer.invoke(IPC_CHANNELS.flushWorkspace);
  },

  onCloseSaveRequested(callback) {
    if (typeof callback !== "function") {
      throw new TypeError("Close save callback must be a function.");
    }
    if (closeSaveListener) {
      throw new Error("A close save callback is already registered.");
    }
    const listener = (_event, payload) => {
      if (
        !payload
        || typeof payload !== "object"
        || Array.isArray(payload)
        || typeof payload.requestId !== "string"
        || payload.requestId.length > 80
        || !/^[a-zA-Z0-9-]+$/.test(payload.requestId)
        || !CLOSE_REASONS.has(payload.reason)
      ) {
        return;
      }
      callback(Object.freeze({
        requestId: payload.requestId,
        reason: payload.reason,
      }));
    };
    closeSaveListener = listener;
    ipcRenderer.on(IPC_CHANNELS.closeSaveRequested, listener);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.closeSaveRequested, listener);
      if (closeSaveListener === listener) closeSaveListener = null;
    };
  },

  onCloseSaveReleased(callback) {
    if (typeof callback !== "function") {
      throw new TypeError("Close save release callback must be a function.");
    }
    if (closeSaveReleaseListener) {
      throw new Error("A close save release callback is already registered.");
    }
    const listener = (_event, payload) => {
      if (
        !payload
        || typeof payload !== "object"
        || Array.isArray(payload)
        || typeof payload.requestId !== "string"
        || payload.requestId.length > 80
        || !/^[a-zA-Z0-9-]+$/.test(payload.requestId)
        || !CLOSE_REASONS.has(payload.reason)
      ) {
        return;
      }
      callback(Object.freeze({
        requestId: payload.requestId,
        reason: payload.reason,
      }));
    };
    closeSaveReleaseListener = listener;
    ipcRenderer.on(IPC_CHANNELS.closeSaveReleased, listener);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.closeSaveReleased, listener);
      if (closeSaveReleaseListener === listener) closeSaveReleaseListener = null;
    };
  },

  acknowledgeCloseSave(options) {
    const value = requireOptions(options, "Close save acknowledgement");
    const requestId = requireCloseRequestId(value.requestId);
    if (!["saved", "failed"].includes(value.status)) {
      throw new TypeError("Close save acknowledgement status must be saved or failed.");
    }
    const errorMessage = typeof value.errorMessage === "string"
      ? value.errorMessage
        .replace(/[\u0000-\u001f\u007f]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 400)
      : undefined;
    ipcRenderer.send(IPC_CHANNELS.closeSaveComplete, {
      requestId,
      status: value.status,
      ...(value.status === "failed" && errorMessage ? { errorMessage } : {}),
    });
  },

  getUpdateState() {
    return ipcRenderer.invoke(IPC_CHANNELS.getUpdateState);
  },

  checkForUpdates() {
    return ipcRenderer.invoke(IPC_CHANNELS.checkForUpdates);
  },

  downloadUpdate() {
    return ipcRenderer.invoke(IPC_CHANNELS.downloadUpdate);
  },

  restartAndInstall() {
    return ipcRenderer.invoke(IPC_CHANNELS.restartAndInstall);
  },

  onUpdateState(callback) {
    if (typeof callback !== "function") {
      throw new TypeError("Update state callback must be a function.");
    }
    const listener = (_event, state) => callback(state);
    ipcRenderer.on(IPC_CHANNELS.updateState, listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.updateState, listener);
  },
});

contextBridge.exposeInMainWorld("invoiceDesktop", invoiceDesktop);
