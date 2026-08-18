import {
  ArrowClockwise,
  CheckCircle,
  DownloadSimple,
  Info,
  SpinnerGap,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import { useEffect, useRef } from "react";

const STATUS_COPY = {
  idle: {
    icon: Info,
    title: "Updates are automatic",
    body: "Invoice Studio checks GitHub Releases in the background and lets you choose when to install.",
  },
  checking: {
    icon: SpinnerGap,
    title: "Checking for updates…",
    body: "This normally takes only a few seconds.",
  },
  current: {
    icon: CheckCircle,
    title: "You’re up to date",
    body: "This computer already has the latest available version.",
  },
  available: {
    icon: DownloadSimple,
    title: "An update is available",
    body: "Download it now, then restart whenever you’re ready.",
  },
  downloading: {
    icon: SpinnerGap,
    title: "Downloading the update…",
    body: "You can keep working while the installer downloads.",
  },
  ready: {
    icon: ArrowClockwise,
    title: "Update ready to install",
    body: "Restart Invoice Studio to finish the update. Your saved invoices will stay on this computer.",
  },
  error: {
    icon: WarningCircle,
    title: "Couldn’t check for updates",
    body: "Check the internet connection and try again.",
  },
  development: {
    icon: Info,
    title: "Browser preview",
    body: "Update checks become active in the installed Windows application.",
  },
  unsupported: {
    icon: Info,
    title: "Windows-first updates",
    body: "Automatic updates are currently enabled for the installed Windows application.",
  },
};

export function UpdateDialog({
  open,
  onClose,
  updateState,
  onCheck,
  onDownload,
  onRestart,
}) {
  const dialogRef = useRef(null);
  const status = STATUS_COPY[updateState.status] ? updateState.status : "idle";
  const copy = STATUS_COPY[status];
  const StatusIcon = copy.icon;
  const busy = status === "checking" || status === "downloading";

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      className="update-dialog"
      ref={dialogRef}
      aria-labelledby="update-dialog-title"
      onClose={onClose}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="update-dialog-header">
        <div>
          <span>Invoice Studio</span>
          <h2 id="update-dialog-title">Software updates</h2>
        </div>
        <button className="icon-button" type="button" onClick={onClose} aria-label="Close software updates">
          <X size={19} aria-hidden="true" />
        </button>
      </div>

      <div className={`update-status update-status--${status}`} role="status" aria-live="polite">
        <span className={`update-status-icon${busy ? " is-spinning" : ""}`}>
          <StatusIcon size={25} weight="duotone" aria-hidden="true" />
        </span>
        <div>
          <h3>{copy.title}</h3>
          <p>{copy.body}</p>
        </div>
      </div>

      {updateState.availableVersion && (
        <div className="update-version-row">
          <span>Available version</span>
          <strong>{updateState.availableVersion}</strong>
        </div>
      )}

      {status === "downloading" && (
        <div className="update-progress" aria-label={`Update download ${updateState.percent || 0}% complete`}>
          <div><span>Download progress</span><strong>{updateState.percent || 0}%</strong></div>
          <progress max="100" value={updateState.percent || 0} />
        </div>
      )}

      {status === "error" && updateState.errorMessage && (
        <p className="update-error-detail">{updateState.errorMessage}</p>
      )}

      <div className="update-dialog-footer">
        <div>
          <span>Installed version</span>
          <strong>{updateState.currentVersion || "Development preview"}</strong>
        </div>
        <div className="update-dialog-actions">
          <button className="secondary-button" type="button" onClick={onClose}>
            {status === "ready" || status === "available" ? "Later" : "Close"}
          </button>
          {["idle", "current", "error"].includes(status) && (
            <button className="primary-button" type="button" onClick={onCheck}>Check for updates</button>
          )}
          {status === "available" && (
            <button className="primary-button" type="button" onClick={onDownload}>Download update</button>
          )}
          {status === "ready" && (
            <button className="primary-button" type="button" onClick={onRestart}>Restart &amp; update</button>
          )}
        </div>
      </div>
    </dialog>
  );
}
