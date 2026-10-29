import { CheckCircle, EnvelopeSimple, WarningCircle } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import {
  getEmailSettings,
  hasDesktopEmail,
  saveEmailSettings,
  verifyEmailSettings,
} from "../../lib/desktop.js";
import { DEFAULT_EMAIL_MESSAGE, DEFAULT_EMAIL_SUBJECT } from "../../lib/workspace.js";
import "./email.css";

const APP_PASSWORD_HELP = {
  gmail: "Gmail needs an app password: Google Account → Security → 2-Step Verification → App passwords. Paste the 16-letter code here.",
  yahoo: "Yahoo needs an app password: Account security → Generate app password.",
  icloud: "iCloud needs an app-specific password from appleid.apple.com → Sign-In and Security.",
  outlook: "Use your Outlook password. If two-step verification is on, create an app password in your Microsoft account security settings.",
  office365: "Use your Microsoft 365 password. Your administrator may need to allow SMTP sending for your mailbox.",
  custom: "Use the SMTP server details from your email provider.",
};

/**
 * Connects the owner's own mailbox over SMTP. The password is kept by the
 * desktop app in the operating system's encrypted storage, never in the
 * workspace file or backups.
 */
export function EmailSettingsCard({ emailPreferences, onUpdateEmailPreferences, onStatusChange }) {
  const available = hasDesktopEmail();
  const [status, setStatus] = useState(null);
  const [form, setForm] = useState({ provider: "gmail", username: "", fromName: "", host: "", port: 587, secure: false });
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState("");

  useEffect(() => {
    if (!available) return;
    let active = true;
    getEmailSettings().then((result) => {
      if (!active || !result) return;
      setStatus(result);
      setForm((current) => ({ ...current, ...result.settings }));
    }).catch(() => {});
    return () => {
      active = false;
    };
  }, [available]);

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    setMessage(null);
  }

  async function save(event) {
    event.preventDefault();
    setBusy("save");
    setMessage(null);
    try {
      const result = await saveEmailSettings({ settings: form, password: password || undefined });
      setStatus(result);
      setPassword("");
      onStatusChange?.(result);
      setMessage({ type: "success", text: result.configured ? "Email settings saved." : "Saved. Add the password to finish." });
    } catch (error) {
      setMessage({ type: "error", text: error?.message || "Email settings were not saved." });
    } finally {
      setBusy("");
    }
  }

  async function verify() {
    setBusy("verify");
    setMessage(null);
    try {
      await verifyEmailSettings();
      setMessage({ type: "success", text: "Connected. Invoice Studio can send from this account." });
    } catch (error) {
      setMessage({ type: "error", text: error?.message || "The connection test failed." });
    } finally {
      setBusy("");
    }
  }

  return (
    <section className="setup-settings-card setup-settings-card--wide email-settings" aria-labelledby="settings-email-title">
      <div className="setup-settings-card-heading">
        <span><EnvelopeSimple size={20} weight="duotone" aria-hidden="true" /></span>
        <div>
          <h2 id="settings-email-title">Email</h2>
          <p>Send invoices from your own email account, with the PDF attached.</p>
        </div>
        {status?.configured ? (
          <strong className="email-status email-status--on"><CheckCircle size={14} weight="fill" aria-hidden="true" />Connected</strong>
        ) : (
          <strong className="email-status">Not connected</strong>
        )}
      </div>

      {!available ? (
        <p className="email-settings-note">
          <WarningCircle size={16} weight="fill" aria-hidden="true" />
          Email sending is available in the Invoice Studio desktop app.
        </p>
      ) : (
        <form className="email-settings-form" onSubmit={save}>
          <label className="email-field">
            <span>Email provider</span>
            <select value={form.provider} onChange={(event) => update("provider", event.target.value)}>
              {(status?.providers || [{ id: "gmail", label: "Gmail / Google Workspace" }]).map((provider) => (
                <option key={provider.id} value={provider.id}>{provider.label}</option>
              ))}
            </select>
          </label>
          <label className="email-field">
            <span>Your email address</span>
            <input type="email" autoComplete="username" value={form.username} onChange={(event) => update("username", event.target.value)} placeholder="you@yourcompany.com" />
          </label>
          <label className="email-field">
            <span>{form.provider === "gmail" || form.provider === "yahoo" || form.provider === "icloud" ? "App password" : "Password"}</span>
            <input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={status?.hasPassword ? "Saved — type to replace" : ""}
            />
          </label>
          <label className="email-field">
            <span>Sender name</span>
            <input value={form.fromName} onChange={(event) => update("fromName", event.target.value)} placeholder="REEM Construction" />
          </label>
          {form.provider === "custom" ? (
            <>
              <label className="email-field">
                <span>SMTP server</span>
                <input value={form.host} onChange={(event) => update("host", event.target.value)} placeholder="smtp.example.com" />
              </label>
              <label className="email-field email-field--small">
                <span>Port</span>
                <input inputMode="numeric" value={form.port} onChange={(event) => update("port", event.target.value)} />
              </label>
              <label className="email-check">
                <input type="checkbox" checked={form.secure} onChange={(event) => update("secure", event.target.checked)} />
                Use SSL/TLS from the start (usually port 465)
              </label>
            </>
          ) : null}
          <p className="email-settings-note email-settings-note--wide">{APP_PASSWORD_HELP[form.provider]}</p>
          {status && !status.canPersistPassword ? (
            <p className="email-settings-note email-settings-note--wide">
              <WarningCircle size={16} weight="fill" aria-hidden="true" />
              This computer has no secure password storage, so the password is kept only until Invoice Studio closes.
            </p>
          ) : null}
          <div className="email-settings-actions">
            <button className="setup-button setup-button--primary" type="submit" disabled={Boolean(busy)}>
              {busy === "save" ? "Saving…" : "Save email settings"}
            </button>
            <button className="setup-button setup-button--secondary" type="button" onClick={verify} disabled={Boolean(busy) || !status?.configured}>
              {busy === "verify" ? "Testing…" : "Test connection"}
            </button>
            {message ? (
              <p className={`email-settings-message email-settings-message--${message.type}`} role={message.type === "error" ? "alert" : "status"}>
                {message.text}
              </p>
            ) : null}
          </div>
        </form>
      )}

      <div className="email-template-fields">
        <h3>Default message</h3>
        <p>Use {"{number}"}, {"{customer}"}, {"{job}"}, {"{balance}"}, {"{dueDate}"}, and {"{company}"} to fill in invoice details.</p>
        <label className="email-field email-field--wide">
          <span>Subject</span>
          <input
            value={emailPreferences.subject}
            onChange={(event) => onUpdateEmailPreferences({ subject: event.target.value || DEFAULT_EMAIL_SUBJECT })}
          />
        </label>
        <label className="email-field email-field--wide">
          <span>Message</span>
          <textarea
            rows="6"
            value={emailPreferences.message}
            onChange={(event) => onUpdateEmailPreferences({ message: event.target.value || DEFAULT_EMAIL_MESSAGE })}
          />
        </label>
        <label className="email-field">
          <span>Send test copies to</span>
          <input
            type="email"
            value={emailPreferences.testAddress}
            placeholder="Defaults to your company email"
            onChange={(event) => onUpdateEmailPreferences({ testAddress: event.target.value })}
          />
        </label>
        <label className="email-check">
          <input
            type="checkbox"
            checked={emailPreferences.requireTest !== false}
            onChange={(event) => onUpdateEmailPreferences({ requireTest: event.target.checked })}
          />
          Require a test copy to me before sending to a customer
        </label>
      </div>
    </section>
  );
}
