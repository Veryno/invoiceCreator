import {
  calculateInvoice,
  formatMoney,
  getAccentInkColor,
  getReadableAccentColor,
} from "../lib/invoice.js";

function formatDate(value, locale) {
  if (!value) return "—";
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale || "en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function Address({ children }) {
  if (!children) return null;
  return <span className="document-address">{children}</span>;
}

export function InvoiceDocument({ invoice, id, className = "" }) {
  const totals = calculateInvoice(invoice);
  const money = (value) => formatMoney(value, invoice.meta.currency, invoice.meta.locale);
  const paperSize = invoice.design.paperSize || "Letter";
  const fontFamily = invoice.design.font === "Georgia"
    ? "Georgia, 'Times New Roman', serif"
    : invoice.design.font === "Arial"
      ? "Arial, Helvetica, sans-serif"
      : "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  const accentInk = getAccentInkColor(invoice.design.accentColor);
  const readableAccent = getReadableAccentColor(invoice.design.accentColor);

  return (
    <article
      id={id}
      className={`invoice-document invoice-document--${invoice.design.template} invoice-document--${paperSize.toLowerCase()} ${className}`}
      style={{
        "--invoice-accent": invoice.design.accentColor,
        "--invoice-accent-ink": accentInk,
        "--invoice-accent-readable": readableAccent,
        "--invoice-font": fontFamily,
      }}
      aria-label={`Invoice ${invoice.meta.number || "draft"} preview`}
    >
      <header className="document-header">
        <div className="document-company">
          {invoice.company.logo && (
            <img className="document-logo" src={invoice.company.logo} alt={`${invoice.company.name || "Company"} logo`} />
          )}
          <div>
            <h2>{invoice.company.name || "Your company"}</h2>
            <Address>{invoice.company.address}</Address>
            <div className="document-contact-line">
              {invoice.company.email && <span>{invoice.company.email}</span>}
              {invoice.company.phone && <span>{invoice.company.phone}</span>}
              {invoice.company.website && <span>{invoice.company.website}</span>}
            </div>
          </div>
        </div>
        <div className="document-title-block">
          <span className={`document-status document-status--${invoice.meta.status.toLowerCase()}`}>
            {invoice.meta.status}
          </span>
          <h1>Invoice</h1>
          <strong>{invoice.meta.number || "DRAFT"}</strong>
        </div>
      </header>

      <section className="document-parties">
        <div className="document-bill-to">
          <p className="document-label">Bill to</p>
          <h3>{invoice.customer.name || "Customer name"}</h3>
          <Address>{invoice.customer.address}</Address>
          {invoice.customer.email && <span>{invoice.customer.email}</span>}
          {invoice.customer.phone && <span>{invoice.customer.phone}</span>}
        </div>
        <dl className="document-metadata">
          <div>
            <dt>Issue date</dt>
            <dd>{formatDate(invoice.meta.issueDate, invoice.meta.locale)}</dd>
          </div>
          <div>
            <dt>Due date</dt>
            <dd>{formatDate(invoice.meta.dueDate, invoice.meta.locale)}</dd>
          </div>
          <div>
            <dt>Terms</dt>
            <dd>{invoice.meta.terms || "—"}</dd>
          </div>
          {invoice.meta.poNumber && (
            <div>
              <dt>Purchase order</dt>
              <dd>{invoice.meta.poNumber}</dd>
            </div>
          )}
        </dl>
      </section>

      <table className="document-table">
        <thead>
          <tr>
            {invoice.design.showServiceDate && <th>Service date</th>}
            {invoice.design.showItem && <th>Product / service</th>}
            <th>Description</th>
            <th className="document-number">Qty</th>
            <th className="document-number">Rate</th>
            <th className="document-number">Amount</th>
          </tr>
        </thead>
        <tbody>
          {totals.lineItems.length > 0 ? totals.lineItems.map((line) => (
            <tr key={line.id}>
              {invoice.design.showServiceDate && <td>{formatDate(line.serviceDate, invoice.meta.locale)}</td>}
              {invoice.design.showItem && <td className="document-item-name">{line.item || "—"}</td>}
              <td>{line.description || "—"}</td>
              <td className="document-number">{line.quantity}</td>
              <td className="document-number">{money(line.rate)}</td>
              <td className="document-number document-line-amount">{money(line.amount)}</td>
            </tr>
          )) : (
            <tr>
              <td className="document-empty-line" colSpan={6}>Add a line item to complete this invoice.</td>
            </tr>
          )}
        </tbody>
      </table>

      <section className="document-summary">
        <div className="document-notes">
          {invoice.content.notes && (
            <div>
              <p className="document-label">Note</p>
              <p>{invoice.content.notes}</p>
            </div>
          )}
          {invoice.content.paymentInstructions && (
            <div>
              <p className="document-label">Payment instructions</p>
              <p>{invoice.content.paymentInstructions}</p>
            </div>
          )}
        </div>

        <dl className="document-totals">
          <div><dt>Subtotal</dt><dd>{money(totals.subtotal)}</dd></div>
          {totals.discount > 0 && <div><dt>Discount</dt><dd>−{money(totals.discount)}</dd></div>}
          {totals.shipping > 0 && <div><dt>Shipping / fees</dt><dd>{money(totals.shipping)}</dd></div>}
          <div><dt>Tax ({invoice.adjustments.taxRate || 0}%)</dt><dd>{money(totals.tax)}</dd></div>
          <div className="document-total"><dt>Total</dt><dd>{money(totals.total)}</dd></div>
          {totals.deposit > 0 && <div><dt>Payments</dt><dd>−{money(totals.deposit)}</dd></div>}
          <div className="document-balance"><dt>Balance due</dt><dd>{money(totals.balance)}</dd></div>
        </dl>
      </section>

      <footer className="document-footer">
        <span>{invoice.company.name || "Invoice Studio"}</span>
        {invoice.company.taxId && <span>Tax ID {invoice.company.taxId}</span>}
        <span>{invoice.meta.currency} invoice</span>
      </footer>
    </article>
  );
}
