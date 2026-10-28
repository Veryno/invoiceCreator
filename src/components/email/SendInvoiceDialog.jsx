import {
  CheckCircle,
  EnvelopeSimple,
  GearSix,
  PaperPlaneTilt,
  UserCircle,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import { useEffect, useId, useRef, useState } from "react";
import { emailFingerprint, fillEmailTemplate, invalidEmails } from "../../lib/email.js";
import { WorkspaceButton } from "../workspace/WorkspaceUI.jsx";
import "./email.css";

/**
 * Two-step send: a copy goes to the owner first so they can check the PDF in
 * their own inbox, then the same message goes to the customer.
 */
export function SendInvoiceDialog({
  open,
  invoice,
  record,
  emailPreferences,
  emailStatus,
  onClose,
  onSend,
  onOpenSettings,
}) {
  const dialogRef = useRef(null);
  const titleId = useId();
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [testTo, setTestTo] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState("");
  const [error, setError] = useState("");
  const [testedFingerprint, setTestedFingerprint] = useState(null);
  const [sentTo, setSentTo] = useState("");

  useEffect(() => {
    if (!open) return;
    setTo(invoice.customer.email || "");
    setCc("");
    setTestTo(emailPreferences.testAddress || invoice.company.email || emailStatus?.settings?.username || "");
    setSubject(fillEmailTemplate(emailPreferences.subject, invoice));
    setMessage(fillEmailTemplate(emailPreferences.message, invoice));
    setError("");
    setSending("");
    setTestedFingerprint(null);
    setSentTo("");
    // Only reset when the dialog opens, not on every invoice keystroke.
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const configured = Boolean(emailStatus?.configured);
  const fingerprint = emailFingerprint({ invoice, subject, message });
  const tested = testedFingerprint === fingerprint;
  const testRequired = emailPreferences.requireTest !== false;
  const customerReady = !testRequired || tested;

  async function send(kind) {
    const recipients = kind === "test" ? testTo : to;
    const problems = invalidEmails(recipients).concat(kind === "customer" ? invalidEmails(cc) : []);
    if (!recipients.trim()) {
      setError(kind === "test" ? "Enter your email address for the test copy." : "Enter the customer’s email address.");
      return;
    }
    if (problems.length) {
      setError(`“${problems[0]}” is not a valid email address.`);
      return;
    }
    setSending(kind);
    setError("");
    try {
      await onSend({
        kind,
        to: recipients,
        cc: kind === "customer" ? cc : "",
        subject: kind === "test" ? `[Test] ${subject}` : subject,
        message,
        testAddress: kind === "test" ? recipients : undefined,
      });
      if (kind === "test") setTestedFingerprint(fingerprint);
      else setSentTo(recipients);
    } catch (sendError) {
      setError(sendError?.message || "The email could not be sent.");
    } finally {
      setSending("");
    }
  }

  return (
    <dialog
      className="studio-dialog send-dialog"
      ref={dialogRef}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        if (!sending) onClose();
      }}
    >
      <div className="studio-dialog-form">
        <header className="studio-dialog-header">
          <div>
            <p>Invoice {invoice.meta.number || "Draft"}</p>
            <h2 id={titleId}>Email invoice</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close email dialog" disabled={Boolean(sending)}>
            <X size={19} weight="bold" aria-hidden="true" />
          </button>
        </header>

        {!emailStatus?.available ? (
          <div className="send-notice">
            <WarningCircle size={20} weight="fill" aria-hidden="true" />
            <div>
              <strong>Email sending runs in the desktop app</strong>
              <p>Open Invoice Studio on your computer to send invoices. You can still save the PDF here.</p>
            </div>
          </div>
        ) : !configured ? (
          <div className="send-notice">
            <GearSix size={20} weight="fill" aria-hidden="true" />
            <div>
              <strong>Connect your email first</strong>
              <p>Invoices are sent from your own Gmail, Outlook, or other email account. It takes about a minute to set up.</p>
              <WorkspaceButton variant="primary" icon={GearSix} onClick={onOpenSettings}>Set up email</WorkspaceButton>
            </div>
          </div>
        ) : sentTo ? (
          <div className="send-success" role="status">
            <CheckCircle size={40} weight="fill" aria-hidden="true" />
            <h3>Invoice sent</h3>
            <p>Sent to {sentTo}. The invoice is marked as sent.</p>
            <WorkspaceButton variant="primary" onClick={onClose}>Done</WorkspaceButton>
          </div>
        ) : (
          <>
            <ol className="send-steps" aria-label="Sending steps">
              <li className={tested ? "is-done" : "is-current"}>
                <span>{tested ? <CheckCircle size={18} weight="fill" aria-hidden="true" /> : "1"}</span>
                Send yourself a test
              </li>
              <li className={tested ? "is-current" : ""}>
                <span>2</span>
                Send to customer
              </li>
            </ol>

            <div className="studio-dialog-fields send-fields">
              <label className="studio-field studio-field--wide">
                <span>To (customer)</span>
                <input value={to} onChange={(event) => setTo(event.target.value)} placeholder="client@example.com" />
              </label>
              <label className="studio-field">
                <span>Cc</span>
                <input value={cc} onChange={(event) => setCc(event.target.value)} placeholder="Optional" />
              </label>
              <label className="studio-field">
                <span>Test copy goes to</span>
                <input value={testTo} onChange={(event) => setTestTo(event.target.value)} placeholder="you@yourcompany.com" />
              </label>
              <label className="studio-field studio-field--wide">
                <span>Subject</span>
                <input value={subject} onChange={(event) => setSubject(event.target.value)} />
              </label>
              <label className="studio-field studio-field--wide">
                <span>Message</span>
                <textarea rows="7" value={message} onChange={(event) => setMessage(event.target.value)} />
              </label>
              <p className="send-attachment studio-field--wide">
                <EnvelopeSimple size={16} aria-hidden="true" />
                The invoice PDF is attached automatically.
                {record?.lastSentAt ? ` Last sent ${new Date(record.lastSentAt).toLocaleString()}.` : ""}
              </p>
              {tested ? (
                <p className="send-tested studio-field--wide" role="status">
                  <CheckCircle size={16} weight="fill" aria-hidden="true" />
                  Test sent to {testTo}. Check it in your inbox, then send it to the customer.
                </p>
              ) : testRequired ? (
                <p className="send-hint studio-field--wide">
                  Send yourself a test first. Changing the invoice or message after the test asks for a new one.
                </p>
              ) : null}
              {error ? <p className="studio-form-error studio-field--wide" role="alert">{error}</p> : null}
            </div>

            <footer className="studio-dialog-footer">
              <WorkspaceButton onClick={onClose} disabled={Boolean(sending)}>Cancel</WorkspaceButton>
              <WorkspaceButton
                icon={UserCircle}
                variant={tested ? "secondary" : "primary"}
                onClick={() => send("test")}
                disabled={Boolean(sending)}
              >
                {sending === "test" ? "Sending test…" : tested ? "Send another test" : "Send test to me"}
              </WorkspaceButton>
              <WorkspaceButton
                icon={PaperPlaneTilt}
                variant={customerReady ? "primary" : "secondary"}
                onClick={() => send("customer")}
                disabled={Boolean(sending) || !customerReady}
                title={customerReady ? undefined : "Send yourself a test first"}
              >
                {sending === "customer" ? "Sending…" : "Send to customer"}
              </WorkspaceButton>
            </footer>
          </>
        )}
      </div>
    </dialog>
  );
}
