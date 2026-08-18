"use strict";

const { contextBridge, ipcRenderer } = require("electron");

const IPC_CHANNELS = Object.freeze({
  exportPdf: "invoice-desktop:export-pdf",
  saveTextFile: "invoice-desktop:save-text-file",
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
});

contextBridge.exposeInMainWorld("invoiceDesktop", invoiceDesktop);

