import {
  Archive,
  EnvelopeSimple,
  FileText,
  MapPin,
  NotePencil,
  PencilSimple,
  Phone,
  Plus,
  UsersThree,
} from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import {
  EmptyState,
  MoneyStack,
  StatusBadge,
  WorkspaceButton,
} from "./WorkspaceUI.jsx";
import {
  formatCurrencyAmount,
  formatWorkspaceDate,
  getInvoiceBalance,
  getRecentInvoices,
} from "./workspaceData.js";

export function CustomerDetail({
  detailRef,
  customer,
  stats,
  invoices,
  now,
  onEdit,
  onArchive,
  onCreateInvoice,
  onOpenInvoice,
  onUpdateCustomer,
}) {
  const [notes, setNotes] = useState("");
  const [noteStatus, setNoteStatus] = useState("");
  const [noteError, setNoteError] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);

  useEffect(() => {
    setNotes(customer?.notes || "");
    setNoteStatus("");
    setNoteError(false);
    setSavingNotes(false);
  }, [customer?.id, customer?.notes]);

  if (!customer) {
    return (
      <aside
        ref={detailRef}
        className="studio-panel studio-customer-detail studio-customer-detail--empty"
        aria-label="Customer details"
        tabIndex="-1"
      >
        <EmptyState
          icon={UsersThree}
          title="Select a customer"
          description="Choose View in the directory to see contact details, notes, balances, and invoice history."
          compact
        />
      </aside>
    );
  }

  const customerInvoices = getRecentInvoices(
    invoices.filter((invoice) => invoice.customerId === customer.id),
    5,
  );
  const notesChanged = notes !== (customer.notes || "");

  async function saveNotes(event) {
    event.preventDefault();
    if (!onUpdateCustomer || !notesChanged) return;
    setSavingNotes(true);
    setNoteStatus("");
    setNoteError(false);
    try {
      await onUpdateCustomer(customer.id, { notes: notes.trim() });
      setNoteStatus("Notes saved.");
    } catch (error) {
      setNoteStatus(error?.message || "Notes could not be saved.");
      setNoteError(true);
    } finally {
      setSavingNotes(false);
    }
  }

  return (
    <aside
      ref={detailRef}
      className="studio-panel studio-customer-detail"
      aria-labelledby="studio-customer-detail-title"
      tabIndex="-1"
    >
      <header className="studio-customer-detail-header">
        <div>
          <p className="studio-card-kicker">Customer details</p>
          <h2 id="studio-customer-detail-title">{customer.name || "Unnamed customer"}</h2>
        </div>
        <div className="studio-customer-detail-actions">
          {onEdit ? (
            <WorkspaceButton icon={PencilSimple} variant="quiet" onClick={() => onEdit(customer)}>
              Edit
            </WorkspaceButton>
          ) : null}
          {onCreateInvoice ? (
            <WorkspaceButton icon={Plus} variant="primary" onClick={() => onCreateInvoice(customer.id)}>
              New invoice
            </WorkspaceButton>
          ) : null}
        </div>
      </header>

      <dl className="studio-customer-summary">
        <div>
          <dt>Invoices</dt>
          <dd>{stats?.invoiceCount || 0}</dd>
        </div>
        <div>
          <dt>Outstanding</dt>
          <dd><MoneyStack amounts={stats?.balances} /></dd>
        </div>
        <div>
          <dt>Overdue</dt>
          <dd><MoneyStack amounts={stats?.balances} field="overdue" /></dd>
        </div>
      </dl>

      <section className="studio-detail-section" aria-labelledby="studio-customer-contact-title">
        <h3 id="studio-customer-contact-title">Contact</h3>
        <dl className="studio-contact-list">
          <div>
            <dt><EnvelopeSimple size={17} aria-hidden="true" />Email</dt>
            <dd>{customer.email || "Not provided"}</dd>
          </div>
          <div>
            <dt><Phone size={17} aria-hidden="true" />Phone</dt>
            <dd>{customer.phone || "Not provided"}</dd>
          </div>
          <div>
            <dt><MapPin size={17} aria-hidden="true" />Billing address</dt>
            <dd className="studio-preline">{customer.address || "Not provided"}</dd>
          </div>
        </dl>
      </section>

      <section className="studio-detail-section" aria-labelledby="studio-customer-invoices-title">
        <div className="studio-detail-section-heading">
          <h3 id="studio-customer-invoices-title">Recent invoices</h3>
          <span>{customerInvoices.length}</span>
        </div>
        {customerInvoices.length === 0 ? (
          <p className="studio-detail-empty"><FileText size={17} aria-hidden="true" />No invoices for this customer.</p>
        ) : (
          <ul className="studio-customer-invoice-list">
            {customerInvoices.map((invoice) => (
              <li key={invoice.id}>
                <div>
                  <strong>{invoice.number || "Draft"}</strong>
                  <span>{formatWorkspaceDate(invoice.issueDate, invoice.locale)}</span>
                </div>
                <div>
                  <strong>{formatCurrencyAmount(getInvoiceBalance(invoice), invoice.currency, invoice.locale)}</strong>
                  <StatusBadge invoice={invoice} now={now} />
                </div>
                {onOpenInvoice ? (
                  <button type="button" onClick={() => onOpenInvoice(invoice.id)}>
                    Open<span className="studio-visually-hidden"> invoice {invoice.number || "draft"}</span>
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <form className="studio-detail-section studio-notes-form" onSubmit={saveNotes}>
        <label htmlFor={`customer-notes-${customer.id}`}>
          <span><NotePencil size={17} aria-hidden="true" />Private notes</span>
          <small>These notes never appear on an invoice.</small>
        </label>
        <textarea
          id={`customer-notes-${customer.id}`}
          rows="4"
          value={notes}
          readOnly={!onUpdateCustomer}
          placeholder="Add context, preferences, or follow-up details"
          onChange={(event) => {
            setNotes(event.target.value);
            setNoteStatus("");
            setNoteError(false);
          }}
        />
        <div>
          <span
            className={`studio-note-status${noteError ? " studio-note-status--error" : ""}`}
            role={noteError ? "alert" : "status"}
          >
            {noteStatus}
          </span>
          {onUpdateCustomer ? (
            <WorkspaceButton variant="quiet" type="submit" disabled={!notesChanged || savingNotes}>
              {savingNotes ? "Saving…" : "Save notes"}
            </WorkspaceButton>
          ) : null}
        </div>
      </form>

      {onArchive ? (
        <div className="studio-customer-danger-zone">
          <div>
            <strong>Archive customer</strong>
            <span>Existing invoices remain in the library.</span>
          </div>
          <WorkspaceButton icon={Archive} variant="danger-quiet" onClick={() => onArchive(customer)}>
            Archive
          </WorkspaceButton>
        </div>
      ) : null}
    </aside>
  );
}
