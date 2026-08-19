"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  protocol,
} = require("electron");
const { autoUpdater } = require("electron-updater");
const { createUpdateManager } = require("./update-manager.cjs");
const { createWorkspaceStore } = require("./workspace-store.cjs");

const APP_NAME = "Invoice Studio";
const APP_ID = "com.invoicestudio.desktop";
const APP_SCHEME = "invoice-studio";
const APP_ORIGIN = `${APP_SCHEME}://app`;
const CLIENT_ROOT = path.resolve(__dirname, "..", "dist", "client");
const MAX_SUGGESTED_NAME_LENGTH = 180;
const MAX_TEXT_FILE_BYTES = 50 * 1024 * 1024;
const CLOSE_SAVE_TIMEOUT_MS = 15_000;
const CLOSE_APPROVAL_TIMEOUT_MS = 30_000;

const CONTENT_TYPES = new Map([
  [".css", "text/css; charset=utf-8"],
  [".gif", "image/gif"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".otf", "font/otf"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".ttf", "font/ttf"],
  [".webp", "image/webp"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
]);

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

const PDF_PAGE_SIZES = new Map([
  ["a4", "A4"],
  ["letter", "Letter"],
]);

let mainWindow = null;
let updateManager = null;
let workspaceStore = null;
let pendingCloseSave = null;
let closeOperation = null;
let approvedClose = null;
let heldCloseSaveRequest = null;
const hardenedSessions = new WeakSet();

protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      codeCache: true,
    },
  },
]);

app.setName(APP_NAME);
app.setAppUserModelId(APP_ID);
app.enableSandbox();

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function sanitizeSuggestedName(value, fallback) {
  const source =
    typeof value === "string"
      ? value.slice(0, MAX_SUGGESTED_NAME_LENGTH * 2).trim()
      : "";
  let name = (source || fallback).split(/[\\/]/).pop();

  name = name
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[<>:"|?*]/g, "-")
    .slice(0, MAX_SUGGESTED_NAME_LENGTH)
    .replace(/[. ]+$/g, "");

  if (!name || name === "." || name === "..") {
    name = fallback;
  }

  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) {
    name = `invoice-${name}`;
  }

  return name;
}

function normalizePageSize(value) {
  if (value === undefined || value === null || value === "") {
    return "Letter";
  }

  if (typeof value !== "string") {
    throw new TypeError("pageSize must be either A4 or Letter.");
  }
  if (value.length > 16) {
    throw new TypeError("pageSize must be either A4 or Letter.");
  }

  const pageSize = PDF_PAGE_SIZES.get(value.trim().toLowerCase());
  if (!pageSize) {
    throw new TypeError("pageSize must be either A4 or Letter.");
  }

  return pageSize;
}

function normalizeFilters(value) {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value) || value.length > 10) {
    throw new TypeError("filters must be an array with at most 10 entries.");
  }

  const filters = value.map((filter) => {
    if (!isRecord(filter) || typeof filter.name !== "string") {
      throw new TypeError("Each file filter must include a name and extensions.");
    }

    const name = filter.name
      .slice(0, 160)
      .trim()
      .replace(/[\u0000-\u001f\u007f]/g, "")
      .slice(0, 80);

    if (
      !name ||
      !Array.isArray(filter.extensions) ||
      filter.extensions.length === 0 ||
      filter.extensions.length > 20
    ) {
      throw new TypeError("Each file filter must include a name and extensions.");
    }

    const extensions = filter.extensions.map((extension) => {
      if (typeof extension !== "string") {
        throw new TypeError("File filter extensions must be strings.");
      }
      if (extension.length > 32) {
        throw new TypeError("File filter extensions are limited to 32 characters.");
      }

      const normalized = extension.trim().replace(/^\.+/, "").toLowerCase();
      if (!/^[a-z0-9][a-z0-9+_-]{0,15}$/.test(normalized)) {
        throw new TypeError(`Invalid file filter extension: ${extension}`);
      }

      return normalized;
    });

    return { name, extensions };
  });

  return filters.length > 0 ? filters : undefined;
}

async function atomicWriteFile(targetPath, contents) {
  const directory = path.dirname(targetPath);
  const temporaryPath = path.join(
    directory,
    `.invoice-studio-${process.pid}-${crypto.randomUUID()}.tmp`,
  );

  let fileHandle;

  try {
    fileHandle = await fs.open(temporaryPath, "wx", 0o600);
    await fileHandle.writeFile(contents);
    await fileHandle.sync();
    await fileHandle.close();
    fileHandle = undefined;

    // The temporary file is on the same volume, so rename is an atomic replace.
    await fs.rename(temporaryPath, targetPath);
  } catch (error) {
    if (fileHandle) {
      await fileHandle.close().catch(() => {});
    }
    await fs.unlink(temporaryPath).catch(() => {});
    throw error;
  }
}

function assertTrustedSender(event) {
  if (
    !mainWindow ||
    mainWindow.isDestroyed() ||
    event.sender !== mainWindow.webContents ||
    event.sender.isDestroyed()
  ) {
    throw new Error("Rejected an IPC request from an untrusted renderer.");
  }

  if (
    event.senderFrame &&
    event.sender.mainFrame &&
    event.senderFrame !== event.sender.mainFrame
  ) {
    throw new Error("Rejected an IPC request from a subframe.");
  }
}

function ownerWindowFor(event) {
  return BrowserWindow.fromWebContents(event.sender) || mainWindow;
}

function sendUpdateState(state) {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) return;
  mainWindow.webContents.send(IPC_CHANNELS.updateState, state);
  mainWindow.setProgressBar(
    state.status === "downloading" && Number.isFinite(state.percent)
      ? state.percent / 100
      : -1,
  );
}

function requireUpdateManager() {
  if (!updateManager) {
    throw new Error("The update service is still starting. Try again in a moment.");
  }
  return updateManager;
}

function requireWorkspaceStore() {
  if (!workspaceStore) {
    throw new Error("The local workspace is still starting. Try again in a moment.");
  }
  return workspaceStore;
}

function cleanCloseSaveError(error) {
  const message = error instanceof Error ? error.message : String(error || "Unknown save error");
  return message
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 400) || "Invoice Studio could not confirm that the workspace was saved.";
}

function settlePendingCloseSave(result) {
  const pending = pendingCloseSave;
  if (!pending) return false;

  pendingCloseSave = null;
  clearTimeout(pending.timeout);
  pending.resolve({
    ...result,
    requestId: pending.requestId,
    reason: pending.reason,
    webContents: pending.webContents,
  });
  return true;
}

function releaseHeldCloseSave() {
  const held = heldCloseSaveRequest;
  heldCloseSaveRequest = null;
  if (!held || held.webContents.isDestroyed()) return;

  try {
    held.webContents.send(IPC_CHANNELS.closeSaveReleased, {
      requestId: held.requestId,
      reason: held.reason,
    });
  } catch (error) {
    console.warn("Unable to release the renderer close save lock:", error);
  }
}

function failPendingCloseSaveFor(webContents, message) {
  if (!pendingCloseSave || pendingCloseSave.webContents !== webContents) return;
  settlePendingCloseSave({ ok: false, kind: "renderer", message });
}

function requestRendererCloseSave(targetWindow, reason) {
  if (
    !targetWindow
    || targetWindow.isDestroyed()
    || targetWindow.webContents.isDestroyed()
  ) {
    return Promise.resolve({
      ok: false,
      kind: "renderer",
      message: "The application window is no longer available to save its changes.",
    });
  }

  if (pendingCloseSave) {
    return Promise.resolve({
      ok: false,
      kind: "busy",
      message: "Another close save request is already in progress.",
    });
  }

  const requestId = crypto.randomUUID();
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      if (pendingCloseSave?.requestId !== requestId) return;
      settlePendingCloseSave({
        ok: false,
        kind: "timeout",
        message: "The application did not confirm that its latest changes were saved in time.",
      });
    }, CLOSE_SAVE_TIMEOUT_MS);

    pendingCloseSave = {
      requestId,
      reason,
      resolve,
      timeout,
      webContents: targetWindow.webContents,
    };
    heldCloseSaveRequest = {
      requestId,
      reason,
      webContents: targetWindow.webContents,
    };

    try {
      targetWindow.webContents.send(IPC_CHANNELS.closeSaveRequested, {
        requestId,
        reason,
      });
    } catch (error) {
      settlePendingCloseSave({
        ok: false,
        kind: "renderer",
        message: cleanCloseSaveError(error),
      });
    }
  });
}

async function askToRetryCloseSave(targetWindow, failure) {
  if (!targetWindow || targetWindow.isDestroyed()) return false;

  const detail = failure.kind === "timeout"
    ? "Invoice Studio will stay open because it did not receive a save confirmation. Try again after checking the save status, or keep the app open so no changes are discarded."
    : `Invoice Studio will stay open so no changes are discarded. ${cleanCloseSaveError(failure.message)}`;
  const result = await dialog.showMessageBox(targetWindow, {
    type: "warning",
    title: "Changes were not confirmed saved",
    message: "Invoice Studio could not safely close yet.",
    detail,
    buttons: ["Try saving again", "Keep Invoice Studio open"],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
  });

  return result.response === 0;
}

async function confirmRendererSavedBeforeClose(targetWindow, reason) {
  while (targetWindow && !targetWindow.isDestroyed()) {
    let result = await requestRendererCloseSave(targetWindow, reason);

    if (result.ok) {
      try {
        await requireWorkspaceStore().flush();
      } catch (error) {
        result = {
          ok: false,
          kind: "storage",
          message: `The local workspace could not be flushed to disk. ${cleanCloseSaveError(error)}`,
        };
      }
    }

    if (result.ok) return true;
    if (!await askToRetryCloseSave(targetWindow, result)) {
      releaseHeldCloseSave();
      return false;
    }
  }

  return false;
}

function approveNextCloseFor(targetWindow) {
  if (approvedClose?.timeout) clearTimeout(approvedClose.timeout);

  const approval = { targetWindow, timeout: null };
  approval.timeout = setTimeout(() => {
    if (approvedClose !== approval) return;
    approvedClose = null;
    releaseHeldCloseSave();
  }, CLOSE_APPROVAL_TIMEOUT_MS);
  approval.timeout.unref?.();
  approvedClose = approval;
}

function consumeCloseApproval(targetWindow) {
  if (!approvedClose || approvedClose.targetWindow !== targetWindow) return false;
  clearTimeout(approvedClose.timeout);
  approvedClose = null;
  heldCloseSaveRequest = null;
  return true;
}

function revokeCloseApproval(targetWindow) {
  if (approvedClose?.targetWindow === targetWindow) {
    clearTimeout(approvedClose.timeout);
    approvedClose = null;
  }
  releaseHeldCloseSave();
}

function beginCloseOperation(reason, onConfirmed) {
  if (closeOperation) return closeOperation.promise;

  const targetWindow = mainWindow;
  if (!targetWindow || targetWindow.isDestroyed()) {
    return Promise.resolve(false);
  }

  const operation = (async () => {
    const confirmed = await confirmRendererSavedBeforeClose(targetWindow, reason);
    if (!confirmed) return false;
    await onConfirmed(targetWindow);
    return true;
  })();
  closeOperation = { promise: operation, reason };
  operation.then(
    () => {
      if (closeOperation?.promise === operation) closeOperation = null;
    },
    () => {
      if (closeOperation?.promise === operation) closeOperation = null;
    },
  );
  return operation;
}

function reportUnexpectedCloseError(error) {
  console.error("Unable to safely close Invoice Studio:", error);
  revokeCloseApproval(mainWindow);
  if (!mainWindow || mainWindow.isDestroyed()) return;
  dialog.showErrorBox(
    "Invoice Studio is staying open",
    "The latest changes could not be confirmed saved. Invoice Studio will remain open so your data is not discarded.",
  );
}

function registerApplicationProtocol() {
  protocol.handle(APP_SCHEME, async (request) => {
    if (request.method !== "GET") {
      return new Response("Method not allowed", { status: 405 });
    }

    const requestUrl = new URL(request.url);
    if (requestUrl.host !== "app") {
      return new Response("Not found", { status: 404 });
    }

    let pathname;
    try {
      pathname = decodeURIComponent(requestUrl.pathname);
    } catch {
      return new Response("Bad request", { status: 400 });
    }

    const relativePath = pathname === "/" || pathname === ""
      ? "index.html"
      : pathname.replace(/^\/+/, "");

    if (relativePath.includes("\0")) {
      return new Response("Bad request", { status: 400 });
    }

    const filePath = path.resolve(CLIENT_ROOT, relativePath);
    const pathFromRoot = path.relative(CLIENT_ROOT, filePath);
    if (pathFromRoot.startsWith("..") || path.isAbsolute(pathFromRoot)) {
      return new Response("Not found", { status: 404 });
    }

    try {
      const contents = await fs.readFile(filePath);
      const contentType = CONTENT_TYPES.get(path.extname(filePath).toLowerCase())
        || "application/octet-stream";

      return new Response(contents, {
        status: 200,
        headers: {
          "Cache-Control": relativePath === "index.html"
            ? "no-cache"
            : "public, max-age=31536000, immutable",
          "Content-Type": contentType,
          "X-Content-Type-Options": "nosniff",
        },
      });
    } catch {
      return new Response("Not found", { status: 404 });
    }
  });
}

function registerIpcHandlers() {
  ipcMain.on(IPC_CHANNELS.closeSaveComplete, (event, payload) => {
    try {
      assertTrustedSender(event);
    } catch (error) {
      console.warn("Rejected an untrusted close save acknowledgement:", error);
      return;
    }

    const pending = pendingCloseSave;
    if (!pending || event.sender !== pending.webContents) return;
    if (
      !isRecord(payload)
      || typeof payload.requestId !== "string"
      || payload.requestId !== pending.requestId
      || !["saved", "failed"].includes(payload.status)
    ) {
      return;
    }

    if (payload.status === "saved") {
      settlePendingCloseSave({ ok: true, kind: "saved" });
      return;
    }

    settlePendingCloseSave({
      ok: false,
      kind: "renderer",
      message: typeof payload.errorMessage === "string"
        ? cleanCloseSaveError(payload.errorMessage)
        : "The application reported that its latest changes could not be saved.",
    });
  });

  ipcMain.handle(IPC_CHANNELS.exportPdf, async (event, payload) => {
    assertTrustedSender(event);

    if (payload !== undefined && !isRecord(payload)) {
      throw new TypeError("PDF export options must be an object.");
    }

    const options = payload || {};
    const pageSize = normalizePageSize(options.pageSize);
    let suggestedName = sanitizeSuggestedName(
      options.suggestedName,
      "professional-invoice.pdf",
    );
    if (!suggestedName.toLowerCase().endsWith(".pdf")) {
      suggestedName += ".pdf";
    }

    const result = await dialog.showSaveDialog(ownerWindowFor(event), {
      title: "Export invoice as PDF",
      buttonLabel: "Export PDF",
      defaultPath: path.join(app.getPath("documents"), suggestedName),
      filters: [{ name: "PDF document", extensions: ["pdf"] }],
      properties: ["createDirectory", "showOverwriteConfirmation"],
    });

    if (result.canceled || !result.filePath) {
      return { canceled: true };
    }

    // Honor the exact path confirmed by the native dialog. The suggested name and
    // filter already include .pdf, while preserving an intentional user override.
    const targetPath = result.filePath;
    const pdf = await event.sender.printToPDF({
      printBackground: true,
      preferCSSPageSize: true,
      pageSize,
    });

    await atomicWriteFile(targetPath, pdf);
    return { canceled: false, filePath: targetPath };
  });

  ipcMain.handle(IPC_CHANNELS.saveTextFile, async (event, payload) => {
    assertTrustedSender(event);

    if (!isRecord(payload)) {
      throw new TypeError("Text export options must be an object.");
    }
    if (typeof payload.contents !== "string") {
      throw new TypeError("Text export contents must be a string.");
    }
    if (Buffer.byteLength(payload.contents, "utf8") > MAX_TEXT_FILE_BYTES) {
      throw new RangeError("Text exports are limited to 50 MiB.");
    }

    const suggestedName = sanitizeSuggestedName(
      payload.suggestedName,
      "invoice-data.json",
    );
    const filters = normalizeFilters(payload.filters);
    const result = await dialog.showSaveDialog(ownerWindowFor(event), {
      title: "Save invoice data",
      buttonLabel: "Save",
      defaultPath: path.join(app.getPath("documents"), suggestedName),
      ...(filters ? { filters } : {}),
      properties: ["createDirectory", "showOverwriteConfirmation"],
    });

    if (result.canceled || !result.filePath) {
      return { canceled: true };
    }

    await atomicWriteFile(result.filePath, Buffer.from(payload.contents, "utf8"));
    return { canceled: false, filePath: result.filePath };
  });

  ipcMain.handle(IPC_CHANNELS.getWorkspace, async (event) => {
    assertTrustedSender(event);
    return requireWorkspaceStore().getWorkspace();
  });

  ipcMain.handle(IPC_CHANNELS.saveWorkspace, async (event, payload) => {
    assertTrustedSender(event);
    if (!isRecord(payload) || !isRecord(payload.workspace)) {
      throw new TypeError("Workspace save requires a workspace object.");
    }
    if (!Number.isSafeInteger(payload.expectedRevision) || payload.expectedRevision < 0) {
      throw new TypeError("Workspace save expectedRevision must be a non-negative integer.");
    }
    return requireWorkspaceStore().commitWorkspace(
      payload.workspace,
      payload.expectedRevision,
    );
  });

  ipcMain.handle(IPC_CHANNELS.flushWorkspace, async (event) => {
    assertTrustedSender(event);
    return requireWorkspaceStore().flush();
  });

  ipcMain.handle(IPC_CHANNELS.getUpdateState, (event) => {
    assertTrustedSender(event);
    return requireUpdateManager().getState();
  });

  ipcMain.handle(IPC_CHANNELS.checkForUpdates, async (event) => {
    assertTrustedSender(event);
    return requireUpdateManager().checkForUpdates();
  });

  ipcMain.handle(IPC_CHANNELS.downloadUpdate, async (event) => {
    assertTrustedSender(event);
    return requireUpdateManager().downloadUpdate();
  });

  ipcMain.handle(IPC_CHANNELS.restartAndInstall, async (event) => {
    assertTrustedSender(event);
    const manager = requireUpdateManager();
    if (manager.getState().status !== "ready") {
      throw new Error("No downloaded update is ready to install.");
    }
    if (closeOperation) {
      throw new Error("Invoice Studio is already preparing to close.");
    }

    let updateResult = { accepted: false };
    const confirmed = await beginCloseOperation("restart-update", async (targetWindow) => {
      approveNextCloseFor(targetWindow);
      try {
        updateResult = manager.restartAndInstall();
      } catch (error) {
        revokeCloseApproval(targetWindow);
        throw error;
      }
    });
    return confirmed ? updateResult : { accepted: false };
  });
}

function denyRendererPrivileges(webContents) {
  const rendererSession = webContents.session;

  if (!hardenedSessions.has(rendererSession)) {
    rendererSession.setPermissionCheckHandler(() => false);
    rendererSession.setPermissionRequestHandler(
      (_requestingWebContents, _permission, callback) => callback(false),
    );
    rendererSession.on("will-download", (event) => event.preventDefault());
    hardenedSessions.add(rendererSession);
  }

  webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  webContents.on("will-navigate", (event) => event.preventDefault());
  webContents.on("will-frame-navigate", (event) => event.preventDefault());
  webContents.on("will-redirect", (event) => event.preventDefault());
  webContents.on("will-attach-webview", (event) => event.preventDefault());
}

function getDevelopmentUrl() {
  const value = process.env.VITE_DEV_SERVER_URL;
  if (!value) {
    return null;
  }

  const url = new URL(value);
  const allowedHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
  if (!allowedHosts.has(url.hostname) || !["http:", "https:"].includes(url.protocol)) {
    throw new Error("VITE_DEV_SERVER_URL must point to a local HTTP(S) server.");
  }
  if (url.username || url.password) {
    throw new Error("VITE_DEV_SERVER_URL must not contain credentials.");
  }

  return url.href;
}

async function createMainWindow() {
  mainWindow = new BrowserWindow({
    title: APP_NAME,
    width: 1440,
    height: 940,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: "#f5f7fb",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      navigateOnDragDrop: false,
    },
  });
  const createdWindow = mainWindow;
  const rendererWebContents = createdWindow.webContents;

  denyRendererPrivileges(rendererWebContents);

  createdWindow.once("ready-to-show", () => {
    if (!createdWindow.isDestroyed()) {
      createdWindow.show();
    }
  });

  createdWindow.on("close", (event) => {
    if (consumeCloseApproval(createdWindow)) return;

    event.preventDefault();
    if (closeOperation) return;
    void beginCloseOperation("window-close", async (targetWindow) => {
      approveNextCloseFor(targetWindow);
      targetWindow.close();
    }).catch(reportUnexpectedCloseError);
  });

  createdWindow.on("closed", () => {
    failPendingCloseSaveFor(
      rendererWebContents,
      "The application window closed before its save could be confirmed.",
    );
    if (approvedClose?.targetWindow === createdWindow) {
      clearTimeout(approvedClose.timeout);
      approvedClose = null;
    }
    if (heldCloseSaveRequest?.webContents === rendererWebContents) {
      heldCloseSaveRequest = null;
    }
    if (mainWindow === createdWindow) mainWindow = null;
  });

  rendererWebContents.on("render-process-gone", () => {
    failPendingCloseSaveFor(
      rendererWebContents,
      "The application window stopped responding before its save could be confirmed.",
    );
  });

  rendererWebContents.once("did-finish-load", () => {
    if (updateManager) sendUpdateState(updateManager.getState());
  });

  const developmentUrl = getDevelopmentUrl();
  if (developmentUrl) {
    await createdWindow.loadURL(developmentUrl);
  } else {
    await createdWindow.loadURL(`${APP_ORIGIN}/index.html`);
  }
}

registerIpcHandlers();

app.whenReady().then(async () => {
  try {
    registerApplicationProtocol();
    workspaceStore = createWorkspaceStore({
      directoryPath: app.getPath("userData"),
    });
    await workspaceStore.getWorkspace();
    updateManager = createUpdateManager({ app, autoUpdater });
    updateManager.onState(sendUpdateState);
    await createMainWindow();
    updateManager.start();
  } catch (error) {
    console.error("Unable to start Invoice Studio:", error);
    const startupMessage = error?.code === "WORKSPACE_VERSION_UNSUPPORTED"
      ? "Your local workspace was created by a newer version of Invoice Studio. Install the latest version to open it. Your workspace files were preserved."
      : error?.code === "WORKSPACE_VALIDATION_FAILED"
        ? "Your local workspace and its backup could not be read. The original files were preserved. Restore a valid backup or contact support before making further changes."
        : "The application files could not be loaded. Reinstall the application and try again.";
    dialog.showErrorBox(
      `${APP_NAME} could not start`,
      startupMessage,
    );
    app.quit();
  }
});

app.on("will-quit", () => {
  updateManager?.stop();
  workspaceStore?.flush().catch((error) => {
    console.error("Unable to flush Invoice Studio workspace:", error);
  });
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow().catch((error) => {
      console.error("Unable to reopen Invoice Studio:", error);
    });
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
