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
});

function requireOptions(options, operation) {
  if (options === undefined) {
    return {};
  }
  if (options === null || typeof options !== "object" || Array.isArray(options)) {
    throw new TypeError(`${operation} options must be an object.`);
  }
  return options;
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
