import {
  ArrowSquareOut,
  ArrowsClockwise,
  CheckCircle,
  CloudSlash,
  DownloadSimple,
  Gear,
  HashStraight,
  UploadSimple,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import { useRef, useState } from "react";
import {
  SetupSelectField,
  SetupSwitch,
  SetupTextField,
} from "./SetupControls.jsx";
import {
  BASE_TEMPLATE_OPTIONS,
  CURRENCY_OPTIONS,
  EMPTY_LIST,
  EMPTY_RECORD,
  numberingExample,
  TERM_OPTIONS,
} from "./setupModel.js";
import "./setup.css";

function formatBackupTime(value) {
  if (!value) return "No backup recorded";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return `Last backup ${new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date)}`;
}

function updateCopy(updateState) {
  const state = typeof updateState === "string" ? { status: updateState } : updateState || {};
  const status = state.status || "idle";
  const copy = {
    idle: ["Updates", "Open the updater to check for a newer version."],
    checking: ["Checking for updates", "Invoice Studio is contacting the release service."],
    current: ["You’re up to date", "This device has the latest available version."],
    available: ["An update is available", state.availableVersion ? `Version ${state.availableVersion} is ready to download.` : "A newer version is ready to download."],
    downloading: ["Downloading update", Number.isFinite(state.progress) ? `${Math.round(state.progress)}% downloaded.` : "The update is downloading in the background."],
    ready: ["Ready to restart", state.availableVersion ? `Version ${state.availableVersion} will install when you restart.` : "The update will install when you restart."],
    error: ["Update check needs attention", state.message || "Open updates for details and try again."],
  }[status] || ["Updates", state.message || "Open the updater to see the latest status."];

  return { state, status, title: copy[0], description: copy[1] };
}

export function SettingsWorkspace({
  preferences = EMPTY_RECORD,
  presets = EMPTY_LIST,
  updateState,
  isBackingUp = false,
  isRestoring = false,
  lastBackupAt = null,
  onUpdatePreferences,
  onBackup,
  onRestore,
  onOpenUpdates,
  onRestartOnboarding,
}) {
  const [confirmRestart, setConfirmRestart] = useState(false);
  const restartButtonRef = useRef(null);
  const cancelRestartRef = useRef(null);
  const defaults = preferences.defaults && typeof preferences.defaults === "object"
    ? preferences.defaults
    : EMPTY_RECORD;
  const numbering = preferences.numbering && typeof preferences.numbering === "object"
    ? preferences.numbering
    : EMPTY_RECORD;
  const templates = presets.length > 0 ? presets : BASE_TEMPLATE_OPTIONS;
  const update = updateCopy(updateState);

  function updateDefaults(patch) {
    onUpdatePreferences?.({ defaults: patch });
  }

  function updateNumbering(patch) {
    onUpdatePreferences?.({ numbering: patch });
  }

  return (
    <section className="setup-settings-workspace" aria-labelledby="settings-workspace-title">
      <header className="setup-workspace-header setup-settings-header">
        <div>
          <p>App preferences</p>
          <h1 id="settings-workspace-title">Settings</h1>
          <span>Choose defaults, protect your local data, and manage this installation.</span>
        </div>
        <span className="setup-offline-badge"><CloudSlash size={16} weight="duotone" aria-hidden="true" />Offline-first</span>
      </header>

      <div className="setup-offline-notice">
        <CloudSlash size={22} weight="duotone" aria-hidden="true" />
        <div>
          <strong>Your invoice data stays on this device.</strong>
          <span>No account or cloud sync is required. Internet access is only needed to check for and download app updates.</span>
        </div>
      </div>

      <div className="setup-settings-grid">
        <section className="setup-settings-card setup-settings-card--wide" aria-labelledby="settings-defaults-title">
          <div className="setup-settings-card-heading">
            <span><Gear size={20} weight="duotone" aria-hidden="true" /></span>
            <div>
              <h2 id="settings-defaults-title">New invoice defaults</h2>
              <p>These values prefill future invoices and remain editable per document.</p>
            </div>
          </div>
          <div className="setup-field-grid setup-field-grid--two">
            <SetupSelectField
              id="settings-default-terms"
              label="Payment terms"
              value={defaults.terms || ""}
              onChange={(event) => updateDefaults({ terms: event.target.value })}
            >
              <option value="">Choose terms</option>
              {TERM_OPTIONS.map((term) => <option key={term} value={term}>{term}</option>)}
            </SetupSelectField>
            <SetupSelectField
              id="settings-default-currency"
              label="Currency"
              value={defaults.currency || ""}
              onChange={(event) => updateDefaults({ currency: event.target.value })}
            >
              <option value="">Choose currency</option>
              {CURRENCY_OPTIONS.map((currency) => (
                <option key={currency.value} value={currency.value}>{currency.label}</option>
              ))}
            </SetupSelectField>
            <SetupTextField
              id="settings-default-tax"
              label="Tax rate"
              hint="Percentage from 0 to 100."
              type="number"
              inputMode="decimal"
              min="0"
              max="100"
              step="0.01"
              value={defaults.taxRate ?? ""}
              onChange={(event) => updateDefaults({ taxRate: event.target.value })}
            />
            <SetupSelectField
              id="settings-default-paper"
              label="Paper size"
              value={defaults.paperSize || "Letter"}
              onChange={(event) => updateDefaults({ paperSize: event.target.value })}
            >
              <option value="Letter">Letter</option>
              <option value="A4">A4</option>
            </SetupSelectField>
            <SetupSelectField
              id="settings-default-template"
              label="Default template"
              hint="Applied when a new invoice is created."
              className="setup-field--wide"
              value={defaults.defaultTemplateId || ""}
              onChange={(event) => updateDefaults({ defaultTemplateId: event.target.value })}
            >
              <option value="">Choose a template</option>
              {templates.map((preset) => (
                <option key={preset.id} value={preset.id}>{preset.name || preset.label}</option>
              ))}
            </SetupSelectField>
          </div>
        </section>

        <section className="setup-settings-card" aria-labelledby="settings-numbering-title">
          <div className="setup-settings-card-heading">
            <span><HashStraight size={20} weight="duotone" aria-hidden="true" /></span>
            <div>
              <h2 id="settings-numbering-title">Invoice numbering</h2>
              <p>Set the next number and its display format.</p>
            </div>
          </div>
          <output className="setup-number-preview setup-number-preview--settings" aria-label="Next invoice number example">
            Next: {numberingExample({ numbering })}
          </output>
          <div className="setup-field-grid setup-settings-numbering-grid">
            <SetupTextField
              id="settings-number-prefix"
              label="Prefix"
              value={numbering.prefix ?? ""}
              placeholder="INV-"
              maxLength={16}
              onChange={(event) => updateNumbering({ prefix: event.target.value })}
            />
            <SetupTextField
              id="settings-next-number"
              label="Next number"
              type="number"
              inputMode="numeric"
              min="1"
              step="1"
              value={numbering.nextNumber ?? 1}
              onChange={(event) => updateNumbering({ nextNumber: event.target.value })}
            />
            <SetupSelectField
              id="settings-number-padding"
              label="Minimum digits"
              value={numbering.padding ?? 1}
              onChange={(event) => updateNumbering({ padding: event.target.value })}
            >
              {[1, 2, 3, 4, 5, 6].map((value) => <option key={value} value={value}>{value}</option>)}
            </SetupSelectField>
          </div>
          <div className="setup-numbering-switch setup-numbering-switch--settings">
            <SetupSwitch
              id="settings-number-include-year"
              checked={numbering.includeYear !== false}
              onChange={(event) => updateNumbering({ includeYear: event.target.checked })}
              label="Include the current year"
              description="Turn this off for a continuous number such as INV-001."
            />
          </div>
        </section>

        <section className="setup-settings-card" aria-labelledby="settings-backup-title">
          <div className="setup-settings-card-heading">
            <span><DownloadSimple size={20} weight="duotone" aria-hidden="true" /></span>
            <div>
              <h2 id="settings-backup-title">Backup and restore</h2>
              <p>Keep a portable copy of your local Invoice Studio data.</p>
            </div>
          </div>
          <p className="setup-backup-timestamp" role="status">{formatBackupTime(lastBackupAt)}</p>
          <div className="setup-settings-actions">
            <button className="setup-button setup-button--primary" type="button" disabled={isBackingUp || isRestoring} onClick={() => onBackup?.()}>
              <DownloadSimple size={17} aria-hidden="true" />
              {isBackingUp ? "Creating backup…" : "Create backup"}
            </button>
            <button className="setup-button setup-button--secondary" type="button" disabled={isBackingUp || isRestoring} onClick={() => onRestore?.()}>
              <UploadSimple size={17} aria-hidden="true" />
              {isRestoring ? "Restoring…" : "Restore backup"}
            </button>
          </div>
        </section>

        <section className="setup-settings-card" aria-labelledby="settings-updates-title">
          <div className="setup-settings-card-heading">
            <span className={update.status === "checking" || update.status === "downloading" ? "is-spinning" : ""}>
              {update.status === "error"
                ? <WarningCircle size={20} weight="duotone" aria-hidden="true" />
                : update.status === "current" || update.status === "ready"
                  ? <CheckCircle size={20} weight="duotone" aria-hidden="true" />
                  : <ArrowsClockwise size={20} weight="duotone" aria-hidden="true" />}
            </span>
            <div role="status" aria-live="polite">
              <h2 id="settings-updates-title">{update.title}</h2>
              <p>{update.description}</p>
            </div>
          </div>
          {update.state.currentVersion ? <p className="setup-current-version">Installed version {update.state.currentVersion}</p> : null}
          <button className="setup-button setup-button--secondary" type="button" onClick={() => onOpenUpdates?.()}>
            Open updates
            <ArrowSquareOut size={16} aria-hidden="true" />
          </button>
        </section>

        <section className="setup-settings-card setup-settings-card--quiet" aria-labelledby="settings-onboarding-title">
          <div className="setup-settings-card-heading">
            <span><ArrowsClockwise size={20} weight="duotone" aria-hidden="true" /></span>
            <div>
              <h2 id="settings-onboarding-title">First-run setup</h2>
              <p>Revisit the guided setup without deleting invoices, customers, or templates.</p>
            </div>
          </div>
          {confirmRestart ? (
            <div className="setup-inline-confirmation" role="alert">
              <span>Restart setup now?</span>
              <div>
                <button
                  ref={cancelRestartRef}
                  className="setup-icon-button"
                  type="button"
                  aria-label="Cancel restarting setup"
                  onClick={() => {
                    setConfirmRestart(false);
                    requestAnimationFrame(() => restartButtonRef.current?.focus());
                  }}
                >
                  <X size={17} aria-hidden="true" />
                </button>
                <button
                  className="setup-button setup-button--primary"
                  type="button"
                  onClick={() => {
                    setConfirmRestart(false);
                    onRestartOnboarding?.();
                  }}
                >
                  Restart setup
                </button>
              </div>
            </div>
          ) : (
            <button
              ref={restartButtonRef}
              className="setup-button setup-button--secondary"
              type="button"
              onClick={() => {
                setConfirmRestart(true);
                requestAnimationFrame(() => cancelRestartRef.current?.focus());
              }}
            >
              Restart onboarding
            </button>
          )}
        </section>
      </div>
    </section>
  );
}
