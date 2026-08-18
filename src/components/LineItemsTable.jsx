import {
  Copy,
  DotsSixVertical,
  Plus,
  Trash,
} from "@phosphor-icons/react";
import { calculateInvoice, formatMoney } from "../lib/invoice.js";

export function LineItemsTable({
  invoice,
  updateLine,
  addLine,
  duplicateLine,
  removeLine,
}) {
  const totals = calculateInvoice(invoice);
  const currencySymbol = new Intl.NumberFormat(invoice.meta.locale, {
    style: "currency",
    currency: invoice.meta.currency,
    currencyDisplay: "narrowSymbol",
  }).formatToParts(0).find((part) => part.type === "currency")?.value || invoice.meta.currency;

  return (
    <section className="editor-card editor-card--lines" aria-labelledby="line-items-heading">
      <div className="section-heading section-heading--line-items">
        <div>
          <p className="section-kicker">Products &amp; services</p>
          <h2 id="line-items-heading">Line items</h2>
        </div>
        <span className="item-count">{invoice.lineItems.length} {invoice.lineItems.length === 1 ? "item" : "items"}</span>
      </div>

      <div className="line-table-scroll">
        <table className="line-table">
          <thead>
            <tr>
              <th className="drag-column"><span className="visually-hidden">Order</span></th>
              {invoice.design.showServiceDate && <th>Service date</th>}
              {invoice.design.showItem && <th>Product / service</th>}
              <th>Description</th>
              <th className="number-column">Qty</th>
              <th className="number-column">Rate</th>
              <th className="tax-column">Tax</th>
              <th className="amount-column">Amount</th>
              <th className="actions-column"><span className="visually-hidden">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {invoice.lineItems.map((line, index) => (
              <tr key={line.id}>
                <td className="drag-column" data-label="Order">
                  <DotsSixVertical size={18} aria-hidden="true" />
                  <span className="visually-hidden">Item {index + 1}</span>
                </td>
                {invoice.design.showServiceDate && (
                  <td data-label="Service date">
                    <input
                      aria-label={`Service date for line ${index + 1}`}
                      type="date"
                      value={line.serviceDate}
                      onChange={(event) => updateLine(line.id, "serviceDate", event.target.value)}
                    />
                  </td>
                )}
                {invoice.design.showItem && (
                  <td data-label="Product or service">
                    <input
                      aria-label={`Product or service for line ${index + 1}`}
                      value={line.item}
                      placeholder="Consulting"
                      onChange={(event) => updateLine(line.id, "item", event.target.value)}
                    />
                  </td>
                )}
                <td className="description-cell" data-label="Description">
                  <textarea
                    aria-label={`Description for line ${index + 1}`}
                    rows="2"
                    value={line.description}
                    placeholder="Describe the work or product delivered"
                    onChange={(event) => updateLine(line.id, "description", event.target.value)}
                  />
                </td>
                <td className="number-column" data-label="Quantity">
                  <input
                    aria-label={`Quantity for line ${index + 1}`}
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={line.quantity}
                    onChange={(event) => updateLine(line.id, "quantity", event.target.value)}
                  />
                </td>
                <td className="number-column rate-input" data-label="Rate">
                  <span aria-hidden="true">{currencySymbol}</span>
                  <input
                    aria-label={`Rate for line ${index + 1}`}
                    type="number"
                    step="0.01"
                    inputMode="decimal"
                    value={line.rate}
                    onChange={(event) => updateLine(line.id, "rate", event.target.value)}
                  />
                </td>
                <td className="tax-column" data-label="Taxable">
                  <label className="checkbox-control">
                    <input
                      type="checkbox"
                      checked={line.taxable}
                      onChange={(event) => updateLine(line.id, "taxable", event.target.checked)}
                    />
                    <span className="visually-hidden">Tax line {index + 1}</span>
                  </label>
                </td>
                <td className="amount-column" data-label="Amount">
                  {formatMoney(totals.lineItems[index]?.amount || 0, invoice.meta.currency, invoice.meta.locale)}
                </td>
                <td className="actions-column" data-label="Actions">
                  <div className="row-actions">
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Duplicate line ${index + 1}`}
                      title="Duplicate line"
                      onClick={() => duplicateLine(line.id)}
                    >
                      <Copy size={16} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="icon-button icon-button--danger"
                      aria-label={`Delete line ${index + 1}`}
                      title="Delete line"
                      onClick={() => removeLine(line.id)}
                    >
                      <Trash size={16} aria-hidden="true" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button type="button" className="add-line-button" onClick={addLine}>
        <Plus size={16} weight="bold" aria-hidden="true" />
        Add another line
      </button>
    </section>
  );
}
