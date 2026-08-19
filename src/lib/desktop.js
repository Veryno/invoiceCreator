function downloadBlob(contents, filename, type = "application/octet-stream") {
  const blob = contents instanceof Blob ? contents : new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function isDesktopApp() {
  return Boolean(window.invoiceDesktop?.isDesktop);
}

export function hasDesktopWorkspaceStore() {
  return Boolean(
    window.invoiceDesktop?.getWorkspace
    && window.invoiceDesktop?.saveWorkspace
    && window.invoiceDesktop?.flushWorkspace,
  );
}

export async function getDesktopWorkspace() {
  if (!hasDesktopWorkspaceStore()) return null;
  return window.invoiceDesktop.getWorkspace();
}

export async function saveDesktopWorkspace({ workspace, expectedRevision }) {
  if (!hasDesktopWorkspaceStore()) {
    throw new Error("The desktop workspace store is unavailable.");
  }
  return window.invoiceDesktop.saveWorkspace({ workspace, expectedRevision });
}

export async function flushDesktopWorkspace() {
  if (!hasDesktopWorkspaceStore()) return { revision: null };
  return window.invoiceDesktop.flushWorkspace();
}

export function hasDesktopCloseSaveHandshake() {
  return Boolean(
    window.invoiceDesktop?.onCloseSaveRequested
    && window.invoiceDesktop?.onCloseSaveReleased
    && window.invoiceDesktop?.acknowledgeCloseSave,
  );
}

/**
 * Registers the single renderer-side save barrier used by Electron before the
 * window closes. The handler must resolve only after every pending draft and
 * workspace write has been persisted. Rejections keep the desktop app open.
 */
export function registerDesktopCloseSaveHandler(handler, lifecycle = {}) {
  if (typeof handler !== "function") {
    throw new TypeError("Desktop close save handler must be a function.");
  }
  if (!lifecycle || typeof lifecycle !== "object" || Array.isArray(lifecycle)) {
    throw new TypeError("Desktop close save lifecycle options must be an object.");
  }
  if (lifecycle.onLock !== undefined && typeof lifecycle.onLock !== "function") {
    throw new TypeError("Desktop close save onLock must be a function.");
  }
  if (lifecycle.onRelease !== undefined && typeof lifecycle.onRelease !== "function") {
    throw new TypeError("Desktop close save onRelease must be a function.");
  }
  if (!hasDesktopCloseSaveHandshake()) return () => {};

  const desktop = window.invoiceDesktop;
  const releasedRequestIds = new Set();
  let currentLockRequestId = null;
  const release = (request, cause) => {
    if (releasedRequestIds.has(request.requestId)) return;
    releasedRequestIds.add(request.requestId);
    if (releasedRequestIds.size > 128) {
      releasedRequestIds.delete(releasedRequestIds.values().next().value);
    }
    if (currentLockRequestId !== request.requestId) return;
    currentLockRequestId = null;
    try {
      lifecycle.onRelease?.(Object.freeze({ ...request, cause }));
    } catch (error) {
      console.error("Unable to release the desktop close save lock:", error);
    }
  };
  const unsubscribeRelease = desktop.onCloseSaveReleased((request) => {
    release(request, "main-kept-open");
  });
  const unsubscribeRequest = desktop.onCloseSaveRequested((request) => {
    releasedRequestIds.delete(request.requestId);
    currentLockRequestId = request.requestId;
    try {
      lifecycle.onLock?.(request);
    } catch (error) {
      release(request, "save-failed");
      try {
        desktop.acknowledgeCloseSave({
          requestId: request.requestId,
          status: "failed",
          errorMessage: error instanceof Error ? error.message : String(error),
        });
      } catch (acknowledgementError) {
        console.error("Unable to acknowledge the desktop close save request:", acknowledgementError);
      }
      return;
    }

    void (async () => {
      let acknowledgement;
      try {
        await handler(request);
        acknowledgement = {
          requestId: request.requestId,
          status: "saved",
        };
      } catch (error) {
        const errorMessage = error instanceof Error
          ? error.message
          : String(error || "The latest changes could not be saved.");
        acknowledgement = {
          requestId: request.requestId,
          status: "failed",
          errorMessage,
        };
        release(request, "save-failed");
      }
      desktop.acknowledgeCloseSave(acknowledgement);
    })().catch((error) => {
      console.error("Unable to acknowledge the desktop close save request:", error);
    });
  });
  return () => {
    unsubscribeRequest();
    unsubscribeRelease();
  };
}

export async function exportPdf({ suggestedName, pageSize = "Letter" }) {
  if (window.invoiceDesktop?.exportPdf) {
    return window.invoiceDesktop.exportPdf({ suggestedName, pageSize });
  }

  window.print();
  return { ok: true, method: "print-dialog" };
}

export async function saveTextFile({ suggestedName, contents, filters = [] }) {
  if (window.invoiceDesktop?.saveTextFile) {
    return window.invoiceDesktop.saveTextFile({ suggestedName, contents, filters });
  }

  const type = suggestedName?.toLowerCase().endsWith(".csv")
    ? "text/csv"
    : "application/json";
  downloadBlob(contents, suggestedName, type);
  return { ok: true, method: "download" };
}

export function downloadText(contents, suggestedName, type = "text/plain") {
  downloadBlob(contents, suggestedName, type);
}
