import {
  Archive,
  Copy,
  DotsThreeVertical,
  DownloadSimple,
} from "@phosphor-icons/react";
import { StatusBadge } from "./WorkspaceUI.jsx";
import {
  formatCurrencyAmount,
  formatWorkspaceDate,
  getInvoiceBalance,
} from "./workspaceData.js";

export function InvoiceTable({
  invoices,
  now,
  onOpenInvoice,
  onDuplicateInvoice,
  onExportInvoice,
  onArchiveInvoice,
}) {
  return (
    <div className="studio-table-scroll" role="region" aria-label="Invoice library table" tabIndex="0">
      <table className="studio-table studio-invoice-table">
        <caption className="studio-visually-hidden">Invoice library</caption>
        <thead>
          <tr>
            <th scope="col">Invoice</th>
            <th scope="col">Customer</th>
            <th scope="col">Issued</th>
            <th scope="col">Due</th>
            <th scope="col">Status</th>
            <th scope="col" className="studio-table-number">Total</th>
            <th scope="col" className="studio-table-number">Balance</th>
            <th scope="col"><span className="studio-visually-hidden">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {invoices.map((invoice) => (
            <tr key={invoice.id}>
              <td>
                {onOpenInvoice ? (
                  <button
                    className="studio-table-primary-action"
                    type="button"
                    onClick={() => onOpenInvoice(invoice.id)}
                  >
                    {invoice.number || "Draft"}
                  </button>
                ) : <strong>{invoice.number || "Draft"}</strong>}
                {invoice.updatedAt ? (
                  <small>Updated {formatWorkspaceDate(invoice.updatedAt, invoice.locale)}</small>
                ) : null}
              </td>
              <td>{invoice.customerName || "Customer not set"}</td>
              <td>{formatWorkspaceDate(invoice.issueDate, invoice.locale)}</td>
              <td>{formatWorkspaceDate(invoice.dueDate, invoice.locale)}</td>
              <td><StatusBadge invoice={invoice} now={now} /></td>
              <td className="studio-table-number">
                {formatCurrencyAmount(invoice.total, invoice.currency, invoice.locale)}
              </td>
              <td className="studio-table-number">
                {formatCurrencyAmount(getInvoiceBalance(invoice), invoice.currency, invoice.locale)}
              </td>
              <td className="studio-table-action">
                {(onDuplicateInvoice || onExportInvoice || onArchiveInvoice) ? (
                  <details className="studio-action-menu">
                    <summary aria-label={`More actions for invoice ${invoice.number || "draft"}`}>
                      <DotsThreeVertical size={18} weight="bold" aria-hidden="true" />
                    </summary>
                    <div>
                      {onExportInvoice ? (
                        <button type="button" onClick={() => onExportInvoice(invoice.id)}>
                          <DownloadSimple size={16} aria-hidden="true" />
                          Export PDF
                        </button>
                      ) : null}
                      {onDuplicateInvoice ? (
                        <button type="button" onClick={() => onDuplicateInvoice(invoice.id)}>
                          <Copy size={16} aria-hidden="true" />
                          Duplicate
                        </button>
                      ) : null}
                      {onArchiveInvoice ? (
                        <button
                          className="studio-action-menu-danger"
                          type="button"
                          onClick={() => onArchiveInvoice(invoice.id)}
                        >
                          <Archive size={16} aria-hidden="true" />
                          Archive
                        </button>
                      ) : null}
                    </div>
                  </details>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
