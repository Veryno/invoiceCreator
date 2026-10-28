import {
  CheckCircle,
  FileXls,
  UploadSimple,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import { useEffect, useId, useRef, useState } from "react";
import { calculateInvoice, formatMoney, normalizeInvoice } from "../../lib/invoice.js";
import { WorkspaceButton } from "../workspace/WorkspaceUI.jsx";
import "./quickbooks-import.css";

const STEPS = {
  online: {
    label: "QuickBooks Online",
    customers: [
      "Go to Sales → Customers (or Get paid & pay → Customers).",
      "Click the Export icon above the customer list and choose Export to Excel.",
    ],
    invoices: [
      "Go to Reports and open Sales by Customer Detail.",
      "Set Report period to All Dates and click Run report.",
      "Click the Export icon and choose Export to Excel.",
      "Optional: export the Invoice List report the same way so due dates and paid invoices come across.",
    ],
  },
  desktop: {
    label: "QuickBooks Desktop",
    customers: [
      "Open Customers → Customer Center.",
      "Click Excel → Export Customer List and save it as .xlsx or .csv.",
    ],
    invoices: [
      "Open Reports → Sales → Sales by Customer Detail, and set Dates to All.",
      "Click Excel → Create New Worksheet, then save the workbook as .xlsx.",
      "Optional: export Reports → Customers & Receivables → Open Invoices too, so unpaid balances and due dates come across.",
    ],
  },
};

export function QuickBooksImportDialog({ open, onClose, onImport }) {
  const dialogRef = useRef(null);
  const inputRef = useRef(null);
  const titleId = useId();
  const [edition, setEdition] = useState("online");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [includeCustomers, setIncludeCustomers] = useState(true);
  const [includeInvoices, setIncludeInvoices] = useState(true);
  const [summary, setSummary] = useState(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setData(null);
      setError("");
      setSummary(null);
      dialog.showModal();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  async function readFiles(fileList) {
    const files = [...(fileList || [])];
    if (!files.length) return;
    setBusy(true);
    setError("");
    setSummary(null);
    try {
      const { readQuickBooksFiles } = await import("../../lib/importQuickBooks.js");
      const result = await readQuickBooksFiles(files);
      if (!result.customers.length && !result.invoices.length) {
        throw new Error("No customers or invoices were found in that file.");
      }
      setData(result);
      setIncludeCustomers(result.customers.length > 0);
      setIncludeInvoices(result.invoices.length > 0);
    } catch (readError) {
      setData(null);
      setError(readError?.message || "That file couldn’t be read.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function runImport() {
    setBusy(true);
    setError("");
    try {
      setSummary(await onImport(data, { includeCustomers, includeInvoices }));
    } catch (importError) {
      setError(importError?.message || "The import didn’t finish. Nothing was changed.");
    } finally {
      setBusy(false);
    }
  }

  const steps = STEPS[edition];
  const invoiceTotal = data?.invoices.reduce((sum, invoice) => sum + calculateInvoice(normalizeInvoice(invoice)).total, 0) || 0;

  return (
    <dialog
      className="studio-dialog qb-dialog"
      ref={dialogRef}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <div className="studio-dialog-form">
        <header className="studio-dialog-header">
          <div>
            <p>Switching from QuickBooks</p>
            <h2 id={titleId}>Import customers and invoices</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close QuickBooks import" disabled={busy}>
            <X size={19} weight="bold" aria-hidden="true" />
          </button>
        </header>

        {summary ? (
          <div className="qb-done" role="status">
            <CheckCircle size={40} weight="fill" aria-hidden="true" />
            <h3>Import complete</h3>
            <p>
              {summary.customersCreated} new {summary.customersCreated === 1 ? "customer" : "customers"}
              {summary.customersUpdated ? `, ${summary.customersUpdated} updated` : ""}
              {" · "}
              {summary.invoicesCreated} {summary.invoicesCreated === 1 ? "invoice" : "invoices"} added
              {summary.invoicesSkipped ? ` (${summary.invoicesSkipped} already here, skipped)` : ""}
            </p>
            <WorkspaceButton variant="primary" onClick={onClose}>Done</WorkspaceButton>
          </div>
        ) : (
          <div className="qb-body">
            <div className="qb-edition" role="tablist" aria-label="QuickBooks version">
              {Object.entries(STEPS).map(([id, entry]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={edition === id}
                  className={edition === id ? "is-active" : ""}
                  onClick={() => setEdition(id)}
                >
                  {entry.label}
                </button>
              ))}
            </div>

            <div className="qb-steps">
              <div>
                <h3>1. Export your customers</h3>
                <ol>{steps.customers.map((step) => <li key={step}>{step}</li>)}</ol>
              </div>
              <div>
                <h3>2. Export your invoices</h3>
                <ol>{steps.invoices.map((step) => <li key={step}>{step}</li>)}</ol>
              </div>
            </div>

            <label
              className={`qb-drop${dragging ? " is-dragging" : ""}`}
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                void readFiles(event.dataTransfer.files);
              }}
            >
              <UploadSimple size={24} aria-hidden="true" />
              <strong>{busy && !data ? "Reading…" : "3. Choose the exported files"}</strong>
              <span>Select all the files at once, or drop them here. Excel (.xlsx) or CSV.</span>
              <input
                ref={inputRef}
                className="visually-hidden"
                type="file"
                multiple
                accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={(event) => readFiles(event.target.files)}
              />
            </label>

            {data ? (
              <div className="qb-preview">
                <ul className="qb-files">
                  {data.files.map((file) => (
                    <li key={file.fileName}>
                      <FileXls size={18} aria-hidden="true" />
                      <span>{file.fileName}</span>
                      <small>
                        {file.kind === "customers"
                          ? `Customer list · ${file.customerCount} customers`
                          : `Sales detail · ${file.invoiceCount} invoices${file.nonInvoice ? ` · ${file.nonInvoice} payments and other rows ignored` : ""}`}
                      </small>
                    </li>
                  ))}
                </ul>
                <label className="qb-check">
                  <input
                    type="checkbox"
                    checked={includeCustomers}
                    disabled={!data.customers.length}
                    onChange={(event) => setIncludeCustomers(event.target.checked)}
                  />
                  Import {data.customers.length} {data.customers.length === 1 ? "customer" : "customers"}
                </label>
                <label className="qb-check">
                  <input
                    type="checkbox"
                    checked={includeInvoices}
                    disabled={!data.invoices.length}
                    onChange={(event) => setIncludeInvoices(event.target.checked)}
                  />
                  Import {data.invoices.length} {data.invoices.length === 1 ? "invoice" : "invoices"}
                  {data.invoices.length ? ` totaling ${formatMoney(invoiceTotal)}` : ""}
                </label>
                {data.invoices.length ? (
                  <table className="qb-table">
                    <thead>
                      <tr><th>No.</th><th>Customer</th><th>Date</th><th>Lines</th><th>Total</th></tr>
                    </thead>
                    <tbody>
                      {data.invoices.slice(0, 6).map((invoice, index) => (
                        <tr key={`${invoice.meta.number}-${index}`}>
                          <td>{invoice.meta.number || "—"}</td>
                          <td>{invoice.customer.name || "—"}</td>
                          <td>{invoice.meta.issueDate || "—"}</td>
                          <td>{invoice.lineItems.length}</td>
                          <td>{formatMoney(calculateInvoice(normalizeInvoice(invoice)).total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : null}
                {data.invoices.length > 6 ? <p className="qb-more">and {data.invoices.length - 6} more</p> : null}
                <p className="qb-note">
                  Sales tax lines aren’t part of these reports, so imported invoices show the pre-tax amounts. Invoices already in Invoice Studio with the same number are skipped.
                </p>
              </div>
            ) : null}

            {error ? (
              <p className="studio-form-error" role="alert">
                <WarningCircle size={16} weight="fill" aria-hidden="true" /> {error}
              </p>
            ) : null}
          </div>
        )}

        {!summary ? (
          <footer className="studio-dialog-footer">
            <WorkspaceButton onClick={onClose} disabled={busy}>Cancel</WorkspaceButton>
            <WorkspaceButton
              variant="primary"
              onClick={runImport}
              disabled={busy || !data || (!includeCustomers && !includeInvoices)}
            >
              {busy && data ? "Importing…" : "Import"}
            </WorkspaceButton>
          </footer>
        ) : null}
      </div>
    </dialog>
  );
}
