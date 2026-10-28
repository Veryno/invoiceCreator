import {
  Copy,
  Plus,
  Trash,
} from "@phosphor-icons/react";
import { useMemo } from "react";
import { buildProductOptions } from "../lib/catalog.js";
import { calculateInvoice, lineRateForAmount } from "../lib/invoice.js";
import { NumberField } from "./NumberField.jsx";
import { ProductServicePicker } from "./ProductServicePicker.jsx";

export function LineItemsTable({
  invoice,
  updateLine,
  addLine,
  duplicateLine,
  removeLine,
  catalog = [],
  onSaveCatalogItem,
}) {
  const totals = calculateInvoice(invoice);
  const options = useMemo(() => buildProductOptions(catalog), [catalog]);
  const currencySymbol = new Intl.NumberFormat(invoice.meta.locale, {
    style: "currency",
    currency: invoice.meta.currency,
    currencyDisplay: "narrowSymbol",
  }).formatToParts(0).find((part) => part.type === "currency")?.value || invoice.meta.currency;

  function pickProduct(line, option) {
    const patch = { item: option.name };
    if (!String(line.description || "").trim() && option.description) patch.description = option.description;
    if (Number(option.rate) > 0) patch.rate = option.rate;
    if (typeof option.taxable === "boolean") patch.taxable = option.taxable;
    updateLine(line.id, patch);
  }

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
              <th className="line-number-column">#</th>
              {invoice.design.showServiceDate && <th className="service-date-column">Service date</th>}
              {invoice.design.showItem && <th className="product-column">Product / service</th>}
              <th>Description</th>
              <th className="number-column">Qty</th>
              <th className="number-column rate-column">Rate</th>
              <th className="amount-column">Amount</th>
              <th className="tax-column">Tax</th>
              <th className="actions-column"><span className="visually-hidden">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {invoice.lineItems.map((line, index) => (
              <tr key={line.id}>
                <td className="line-number-column" data-label="Line">{index + 1}</td>
                {invoice.design.showServiceDate && (
                  <td className="service-date-column" data-label="Service date">
                    <input
                      aria-label={`Service date for line ${index + 1}`}
                      type="date"
                      value={line.serviceDate}
                      onChange={(event) => updateLine(line.id, "serviceDate", event.target.value)}
                    />
                  </td>
                )}
                {invoice.design.showItem && (
                  <td className="product-column" data-label="Product or service">
                    <ProductServicePicker
                      label={`Product or service for line ${index + 1}`}
                      value={line.item}
                      options={options}
                      onChange={(value) => updateLine(line.id, "item", value)}
                      onPick={(option) => pickProduct(line, option)}
                      onSaveNew={onSaveCatalogItem
                        ? (name) => onSaveCatalogItem({
                            name,
                            description: line.description,
                            rate: Number(line.rate) || 0,
                            taxable: line.taxable,
                          })
                        : undefined}
                    />
                  </td>
                )}
                <td className="description-cell" data-label="Description">
                  <textarea
                    aria-label={`Description for line ${index + 1}`}
                    rows="1"
                    value={line.description}
                    placeholder="Describe the work or materials"
                    onChange={(event) => updateLine(line.id, "description", event.target.value)}
                  />
                </td>
                <td className="number-column" data-label="Quantity">
                  <NumberField
                    aria-label={`Quantity for line ${index + 1}`}
                    value={line.quantity}
                    emptyValue={0}
                    onValue={(quantity) => updateLine(line.id, "quantity", quantity)}
                  />
                </td>
                <td className="number-column rate-input" data-label="Rate">
                  <span aria-hidden="true">{currencySymbol}</span>
                  <NumberField
                    aria-label={`Rate for line ${index + 1}`}
                    value={line.rate}
                    decimals={2}
                    onValue={(rate) => updateLine(line.id, "rate", rate)}
                  />
                </td>
                <td className="amount-column rate-input" data-label="Amount">
                  <span aria-hidden="true">{currencySymbol}</span>
                  <NumberField
                    aria-label={`Amount for line ${index + 1}`}
                    value={totals.lineItems[index]?.amount || 0}
                    decimals={2}
                    onValue={(amount) => updateLine(line.id, lineRateForAmount(amount, line.quantity))}
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
        Add line
      </button>
    </section>
  );
}
