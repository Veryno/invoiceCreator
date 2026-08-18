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

const APP_NAME = "Invoice Studio";
const APP_ID = "com.invoicestudio.desktop";
const APP_SCHEME = "invoice-studio";
const APP_ORIGIN = `${APP_SCHEME}://app`;
const CLIENT_ROOT = path.resolve(__dirname, "..", "dist", "client");
const MAX_SUGGESTED_NAME_LENGTH = 180;
const MAX_TEXT_FILE_BYTES = 50 * 1024 * 1024;

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
});

const PDF_PAGE_SIZES = new Map([
  ["a4", "A4"],
  ["letter", "Letter"],
]);

let mainWindow = null;
let updateManager = null;
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

  ipcMain.handle(IPC_CHANNELS.restartAndInstall, (event) => {
    assertTrustedSender(event);
    return requireUpdateManager().restartAndInstall();
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

  denyRendererPrivileges(mainWindow.webContents);

  mainWindow.once("ready-to-show", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  mainWindow.webContents.once("did-finish-load", () => {
    if (updateManager) sendUpdateState(updateManager.getState());
  });

  const developmentUrl = getDevelopmentUrl();
  if (developmentUrl) {
    await mainWindow.loadURL(developmentUrl);
  } else {
    await mainWindow.loadURL(`${APP_ORIGIN}/index.html`);
  }
}

registerIpcHandlers();

app.whenReady().then(async () => {
  try {
    registerApplicationProtocol();
    updateManager = createUpdateManager({ app, autoUpdater });
    updateManager.onState(sendUpdateState);
    await createMainWindow();
    updateManager.start();
  } catch (error) {
    console.error("Unable to start Invoice Studio:", error);
    dialog.showErrorBox(
      `${APP_NAME} could not start`,
      "The application files could not be loaded. Reinstall the application and try again.",
    );
    app.quit();
  }
});

app.on("before-quit", () => {
  updateManager?.stop();
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
