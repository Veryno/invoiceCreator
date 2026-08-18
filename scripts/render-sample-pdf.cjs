"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

if (!process.versions.electron) {
  throw new Error(
    "This script must be launched with Electron: electron scripts/render-sample-pdf.cjs",
  );
}

const { app, BrowserWindow, net, protocol } = require("electron");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const CLIENT_ROOT = path.join(PROJECT_ROOT, "dist", "client");
const INPUT_PATH = path.join(CLIENT_ROOT, "index.html");
const OUTPUT_PATH = path.join(
  PROJECT_ROOT,
  "output",
  "pdf",
  "sample-professional-invoice.pdf",
);
const APP_SCHEME = "invoice-studio";
const APP_ORIGIN = `${APP_SCHEME}://app`;

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
app.enableSandbox();

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
      return await net.fetch(pathToFileURL(filePath).href);
    } catch {
      return new Response("Not found", { status: 404 });
    }
  });
}

async function atomicWriteFile(targetPath, contents) {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });

  const temporaryPath = path.join(
    path.dirname(targetPath),
    `.invoice-studio-sample-${process.pid}-${crypto.randomUUID()}.tmp`,
  );

  let fileHandle;
  try {
    fileHandle = await fs.open(temporaryPath, "wx", 0o600);
    await fileHandle.writeFile(contents);
    await fileHandle.sync();
    await fileHandle.close();
    fileHandle = undefined;
    await fs.rename(temporaryPath, targetPath);
  } catch (error) {
    if (fileHandle) {
      await fileHandle.close().catch(() => {});
    }
    await fs.unlink(temporaryPath).catch(() => {});
    throw error;
  }
}

async function waitForPrintableDocument(webContents) {
  const readyState = await webContents.executeJavaScript(`
    (async () => {
      if (document.readyState !== "complete") {
        await new Promise((resolve) => {
          window.addEventListener("load", resolve, { once: true });
        });
      }

      if (document.fonts && document.fonts.ready) {
        await document.fonts.ready;
      }

      await Promise.all(Array.from(document.images, (image) => {
        if (image.complete) return Promise.resolve();
        return new Promise((resolve) => {
          image.addEventListener("load", resolve, { once: true });
          image.addEventListener("error", resolve, { once: true });
        });
      }));

      await new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(resolve));
      });

      return {
        textLength: (document.body?.innerText || "").trim().length,
        title: document.title,
      };
    })()
  `);

  if (!readyState || readyState.textLength < 40) {
    throw new Error(
      "The print fixture did not render enough content to create a sample invoice.",
    );
  }
}

async function renderSamplePdf() {
  await fs.access(INPUT_PATH);
  registerApplicationProtocol();

  const window = new BrowserWindow({
    width: 1280,
    height: 900,
    show: false,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      webviewTag: false,
      backgroundThrottling: false,
    },
  });

  window.webContents.session.setPermissionCheckHandler(() => false);
  window.webContents.session.setPermissionRequestHandler(
    (_requestingWebContents, _permission, callback) => callback(false),
  );
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  window.webContents.on("will-frame-navigate", (event) => event.preventDefault());
  window.webContents.on("will-redirect", (event) => event.preventDefault());
  window.webContents.on("will-attach-webview", (event) => event.preventDefault());
  window.webContents.session.on("will-download", (event) => event.preventDefault());

  try {
    await window.loadURL(`${APP_ORIGIN}/index.html?fixture=print`);
    await waitForPrintableDocument(window.webContents);

    const pdf = await window.webContents.printToPDF({
      printBackground: true,
      preferCSSPageSize: true,
      pageSize: "Letter",
    });

    await atomicWriteFile(OUTPUT_PATH, pdf);
  } finally {
    if (!window.isDestroyed()) {
      window.destroy();
    }
  }
}

const watchdog = setTimeout(() => {
  console.error("Timed out while rendering the sample invoice PDF.");
  app.exit(1);
}, 45_000);

app.whenReady()
  .then(renderSamplePdf)
  .then(() => {
    clearTimeout(watchdog);
    process.stdout.write(`Rendered sample PDF to ${OUTPUT_PATH}\n`);
    app.exit(0);
  })
  .catch((error) => {
    clearTimeout(watchdog);
    console.error("Unable to render the sample invoice PDF:", error);
    app.exit(1);
  });
