import { ClockCounterClockwise, FolderOpen, FolderSimple, WarningCircle } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import {
  backupNow,
  chooseBackupFolder,
  getBackupSettings,
  hasDesktopBackups,
  openBackupFolder,
  saveBackupSettings,
} from "../../lib/desktop.js";
import { SetupSwitch } from "./SetupControls.jsx";

function formatWhen(value) {
  if (!value) return "No automatic backup yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No automatic backup yet";
  return `Last automatic backup ${new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date)}`;
}

export function AutoBackupCard({ onNotify }) {
  const available = hasDesktopBackups();
  const [settings, setSettings] = useState(null);
  const [busy, setBusy] = useState("");

  useEffect(() => {
    if (!available) return;
    getBackupSettings().then(setSettings).catch(() => setSettings(null));
  }, [available]);

  async function run(kind, action) {
    setBusy(kind);
    try {
      const result = await action();
      if (result && typeof result === "object" && "folder" in result) setSettings(result);
      return result;
    } catch (error) {
      onNotify?.({ type: "error", title: "Backup settings", message: error?.message || "Try that again." });
      return null;
    } finally {
      setBusy("");
    }
  }

  return (
    <section className="setup-settings-card setup-settings-card--wide" aria-labelledby="settings-autobackup-title">
      <div className="setup-settings-card-heading">
        <span><ClockCounterClockwise size={20} weight="duotone" aria-hidden="true" /></span>
        <div>
          <h2 id="settings-autobackup-title">Automatic backups</h2>
          <p>Once a day, Invoice Studio saves a full copy of your invoices, customers, and settings to a folder. Pick a USB drive or a Dropbox, OneDrive, or Google Drive folder so a copy survives if this computer dies.</p>
        </div>
      </div>

      {!available ? (
        <p className="setup-autobackup-note">Automatic backups run in the desktop app. Use Create backup below in the meantime.</p>
      ) : !settings ? (
        <p className="setup-autobackup-note">Loading backup settings…</p>
      ) : (
        <div className="setup-autobackup">
          <SetupSwitch
            id="autobackup-enabled"
            checked={settings.enabled}
            label="Back up automatically every day"
            description="Runs when the app opens and once a day while it’s open."
            onChange={(event) => run("toggle", () => saveBackupSettings({ enabled: event.target.checked }))}
          />

          <div className="setup-autobackup-folder">
            <FolderSimple size={20} weight="duotone" aria-hidden="true" />
            <div>
              <span>Backup folder</span>
              <strong title={settings.folder}>{settings.folder}</strong>
              {settings.folder === settings.defaultFolder ? (
                <small>This is on this computer. Choose a USB drive or cloud folder for real protection.</small>
              ) : null}
            </div>
            <button
              className="setup-button setup-button--secondary"
              type="button"
              disabled={Boolean(busy)}
              onClick={async () => {
                const result = await run("folder", chooseBackupFolder);
                if (result && !result.canceled && !result.lastError) {
                  onNotify?.({ title: "Backup folder changed", message: "A backup was saved there just now." });
                }
              }}
            >
              Change folder
            </button>
          </div>

          <label className="setup-autobackup-keep" htmlFor="autobackup-keep">
            <span>Keep the last</span>
            <select
              id="autobackup-keep"
              value={settings.keep}
              disabled={Boolean(busy)}
              onChange={(event) => run("keep", () => saveBackupSettings({ keep: Number(event.target.value) }))}
            >
              {settings.keepOptions.map((days) => <option key={days} value={days}>{days} days</option>)}
            </select>
            <span>of backups. Older ones are removed from the folder.</span>
          </label>

          {settings.lastError ? (
            <p className="setup-autobackup-error" role="alert">
              <WarningCircle size={16} weight="fill" aria-hidden="true" />
              {settings.lastError}
            </p>
          ) : (
            <p className="setup-backup-timestamp" role="status">{formatWhen(settings.lastBackupAt)}</p>
          )}

          <div className="setup-settings-actions">
            <button
              className="setup-button setup-button--primary"
              type="button"
              disabled={Boolean(busy)}
              onClick={async () => {
                const result = await run("now", backupNow);
                if (result && !result.lastError) onNotify?.({ title: "Backup saved", message: result.lastFile || "Saved to your backup folder." });
              }}
            >
              <ClockCounterClockwise size={17} aria-hidden="true" />
              {busy === "now" ? "Backing up…" : "Back up now"}
            </button>
            <button
              className="setup-button setup-button--secondary"
              type="button"
              disabled={Boolean(busy)}
              onClick={() => run("open", openBackupFolder)}
            >
              <FolderOpen size={17} aria-hidden="true" />
              Open folder
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
