import { Info } from "@phosphor-icons/react";
import { calculateInvoice, formatMoney } from "../lib/invoice.js";
import { NumberField } from "./NumberField.jsx";

function MoneyRow({ label, value, strong = false, muted = false }) {
  return (
    <div className={`totals-row${strong ? " totals-row--strong" : ""}${muted ? " totals-row--muted" : ""}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

export function NotesAndTotals({ invoice, updateField }) {
  const totals = calculateInvoice(invoice);
  const money = (value) => formatMoney(value, invoice.meta.currency, invoice.meta.locale);
  const currencySymbol = new Intl.NumberFormat(invoice.meta.locale, {
    style: "currency",
    currency: invoice.meta.currency,
    currencyDisplay: "narrowSymbol",
  }).formatToParts(0).find((part) => part.type === "currency")?.value || invoice.meta.currency;

  return (
    <section className="editor-card notes-totals-card" aria-labelledby="notes-heading">
      <div className="notes-fields">
        <div className="section-heading section-heading--compact">
          <div>
            <p className="section-kicker">Final details</p>
            <h2 id="notes-heading">Notes &amp; payment</h2>
          </div>
        </div>
        <label className="form-field" htmlFor="invoice-notes">
          <span>Message on invoice</span>
          <textarea
            id="invoice-notes"
            rows="3"
            value={invoice.content.notes}
            onChange={(event) => updateField("content.notes", event.target.value)}
            placeholder="Thank your customer or add project context"
          />
        </label>
        <label className="form-field" htmlFor="payment-instructions">
          <span>Payment instructions</span>
          <textarea
            id="payment-instructions"
            rows="3"
            value={invoice.content.paymentInstructions}
            onChange={(event) => updateField("content.paymentInstructions", event.target.value)}
            placeholder="Bank details, check instructions, or payment link"
          />
        </label>
      </div>

      <div className="totals-editor" aria-label="Invoice totals">
        <MoneyRow label="Subtotal" value={money(totals.subtotal)} />

        <div className="adjustment-row">
          <label htmlFor="invoice-discount">Discount</label>
          <div className="adjustment-control">
            <NumberField
              id="invoice-discount"
              value={invoice.adjustments.discountValue}
              onValue={(value) => updateField("adjustments.discountValue", value)}
            />
            <select
              aria-label="Discount type"
              value={invoice.adjustments.discountType}
              onChange={(event) => updateField("adjustments.discountType", event.target.value)}
            >
              <option value="percent">%</option>
              <option value="fixed">{currencySymbol}</option>
            </select>
          </div>
        </div>
        {totals.discount > 0 && <MoneyRow label="Discount applied" value={`−${money(totals.discount)}`} muted />}

        <div className="adjustment-row">
          <label htmlFor="invoice-tax-rate">Tax rate</label>
          <div className="suffix-input">
            <NumberField
              id="invoice-tax-rate"
              value={invoice.adjustments.taxRate}
              onValue={(value) => updateField("adjustments.taxRate", value)}
            />
            <span aria-hidden="true">%</span>
          </div>
        </div>
        <MoneyRow label="Tax" value={money(totals.tax)} />
        <MoneyRow label="Invoice total" value={money(totals.total)} strong />

        <div className="adjustment-row">
          <label htmlFor="invoice-deposit">Deposit received</label>
          <div className="money-input">
            <span aria-hidden="true">{currencySymbol}</span>
            <NumberField
              id="invoice-deposit"
              value={invoice.adjustments.deposit}
              onValue={(value) => updateField("adjustments.deposit", value)}
            />
          </div>
        </div>

        <div className="balance-panel">
          <div>
            <span>Balance due</span>
            <strong>{money(totals.balance)}</strong>
          </div>
          <Info size={18} aria-hidden="true" />
        </div>
      </div>
    </section>
  );
}
