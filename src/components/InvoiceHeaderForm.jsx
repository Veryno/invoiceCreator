import { ArrowDown, Buildings, CaretRight, ImageSquare, X } from "@phosphor-icons/react";
import { calculateInvoice, formatMoney } from "../lib/invoice.js";
import { labelFor } from "../lib/layout.js";
import { useInvoiceLayout } from "../hooks/useInvoiceLayout.js";

const TERM_DAYS = new Map([
  ["Due on receipt", 0],
  ["Net 7", 7],
  ["Net 10", 10],
  ["Net 15", 15],
  ["Net 30", 30],
  ["Net 45", 45],
  ["Net 60", 60],
]);

function addDays(dateString, days) {
  const date = new Date(`${dateString}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  date.setDate(date.getDate() + days);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function Field({ label, className = "", ...inputProps }) {
  const id = inputProps.id || `field-${inputProps.name}`;
  return (
    <label className={`form-field ${className}`} htmlFor={id}>
      <span>{label}</span>
      <input id={id} {...inputProps} />
    </label>
  );
}

function CustomFields({ fields, invoice, updateField, className = "" }) {
  return fields.map((field) => (
    <Field
      key={field.id}
      id={`custom-${field.id}`}
      className={className}
      label={field.label}
      name={field.id}
      value={invoice.customFields?.[field.id] || ""}
      onChange={(event) => updateField(`customFields.${field.id}`, event.target.value)}
    />
  ));
}

function TextAreaField({ label, className = "", ...inputProps }) {
  const id = inputProps.id || `field-${inputProps.name}`;
  return (
    <label className={`form-field ${className}`} htmlFor={id}>
      <span>{label}</span>
      <textarea id={id} {...inputProps} />
    </label>
  );
}

export function InvoiceHeaderForm({
  invoice,
  updateField,
  customers = [],
  selectedCustomerId = "",
  onSelectCustomer,
}) {
  const totals = calculateInvoice(invoice);
  const layout = useInvoiceLayout();
  const jobFields = layout.fields.filter((field) => field.section === "job");
  const invoiceFields = layout.fields.filter((field) => field.section === "invoice");
  const terms = invoice.meta.terms;
  const termOptions = TERM_DAYS.has(terms) || !terms ? [...TERM_DAYS.keys()] : [...TERM_DAYS.keys(), terms];

  function handleLogo(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 2_500_000) {
      event.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.addEventListener("load", () => updateField("company.logo", reader.result));
    reader.readAsDataURL(file);
  }

  function changeTerms(value) {
    updateField("meta.terms", value);
    if (TERM_DAYS.has(value) && invoice.meta.issueDate) {
      updateField("meta.dueDate", addDays(invoice.meta.issueDate, TERM_DAYS.get(value)));
    }
  }

  function changeIssueDate(value) {
    updateField("meta.issueDate", value);
    if (TERM_DAYS.has(terms) && value) updateField("meta.dueDate", addDays(value, TERM_DAYS.get(terms)));
  }

  return (
    <section className="editor-card editor-card--header" aria-labelledby="invoice-details-heading">
      <div className="invoice-header-top">
        <div className="invoice-header-customer">
          <h2 id="invoice-details-heading" className="visually-hidden">Invoice details</h2>
          {customers.length > 0 && onSelectCustomer ? (
            <label className="form-field" htmlFor="saved-customer">
              <span>Customer</span>
              <select
                id="saved-customer"
                value={selectedCustomerId || ""}
                onChange={(event) => onSelectCustomer(event.target.value)}
              >
                <option value="">Choose a customer…</option>
                {customers.map((customer) => (
                  <option value={customer.id} key={customer.id}>{customer.name}</option>
                ))}
              </select>
            </label>
          ) : null}
          <Field
            label="Customer email"
            name="customer-email"
            type="email"
            placeholder="Separate multiple emails with commas"
            value={invoice.customer.email}
            onChange={(event) => updateField("customer.email", event.target.value)}
          />
        </div>
        <div className="invoice-header-balance" aria-live="polite">
          <span>Balance due</span>
          <strong>{formatMoney(totals.balance, invoice.meta.currency, invoice.meta.locale)}</strong>
        </div>
      </div>

      <details className="company-disclosure">
        <summary>
          <CaretRight size={14} weight="bold" aria-hidden="true" />
          <Buildings size={16} aria-hidden="true" />
          <span>From <strong>{invoice.company.name || "your company"}</strong></span>
          <small>Edit the company details printed on this invoice</small>
        </summary>
        <div className="company-disclosure-body">
          <div className="logo-field">
            {invoice.company.logo ? (
              <div className="logo-preview">
                <img src={invoice.company.logo} alt={`${invoice.company.name || "Company"} logo`} />
                <button
                  type="button"
                  aria-label="Remove company logo"
                  title="Remove logo"
                  onClick={() => updateField("company.logo", "")}
                >
                  <X size={14} weight="bold" aria-hidden="true" />
                </button>
              </div>
            ) : (
              <label className="logo-upload" htmlFor="company-logo">
                <ImageSquare size={22} aria-hidden="true" />
                <span>Upload logo</span>
                <small>PNG, JPG, or WebP, up to 2.5 MB</small>
              </label>
            )}
            <input
              className="visually-hidden"
              id="company-logo"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={handleLogo}
            />
          </div>
          <div className="field-grid field-grid--three">
            <Field
              label="Company name"
              name="company-name"
              value={invoice.company.name}
              onChange={(event) => updateField("company.name", event.target.value)}
            />
            <Field
              label="Email"
              name="company-email"
              type="email"
              value={invoice.company.email}
              onChange={(event) => updateField("company.email", event.target.value)}
            />
            <Field
              label="Phone"
              name="company-phone"
              value={invoice.company.phone}
              onChange={(event) => updateField("company.phone", event.target.value)}
            />
            <Field
              label="Website"
              name="company-website"
              value={invoice.company.website}
              onChange={(event) => updateField("company.website", event.target.value)}
            />
            <Field
              label="License / tax ID"
              name="company-tax-id"
              value={invoice.company.taxId}
              onChange={(event) => updateField("company.taxId", event.target.value)}
            />
            <TextAreaField
              label="Business address"
              name="company-address"
              rows="2"
              value={invoice.company.address}
              onChange={(event) => updateField("company.address", event.target.value)}
            />
          </div>
        </div>
      </details>

      <div className="invoice-form-grid">
        <fieldset className="form-group customer-fields">
          <legend>{labelFor(layout, "billTo")}</legend>
          <div className="field-grid">
            <Field
              label="Customer or company"
              name="customer-name"
              value={invoice.customer.name}
              onChange={(event) => updateField("customer.name", event.target.value)}
            />
            <Field
              label="Phone"
              name="customer-phone"
              value={invoice.customer.phone}
              onChange={(event) => updateField("customer.phone", event.target.value)}
            />
            <TextAreaField
              label="Billing address"
              name="customer-address"
              rows="3"
              value={invoice.customer.address}
              onChange={(event) => updateField("customer.address", event.target.value)}
            />
          </div>
        </fieldset>

        <fieldset className="form-group job-fields">
          <legend>
            {labelFor(layout, "jobSite")}
            {invoice.customer.address && invoice.job.address !== invoice.customer.address ? (
              <button
                type="button"
                className="legend-action"
                onClick={() => updateField("job.address", invoice.customer.address)}
              >
                <ArrowDown size={12} weight="bold" aria-hidden="true" />
                Same as billing
              </button>
            ) : null}
          </legend>
          <div className="field-grid">
            <Field
              label="Job name"
              name="job-name"
              placeholder="Kitchen remodel, Unit 4B"
              value={invoice.job.name}
              onChange={(event) => updateField("job.name", event.target.value)}
            />
            <TextAreaField
              label="Job site address"
              name="job-address"
              rows="2"
              value={invoice.job.address}
              onChange={(event) => updateField("job.address", event.target.value)}
            />
            <TextAreaField
              label="Job info"
              name="job-info"
              rows="2"
              placeholder="Permit #, lot/unit, gate code, superintendent"
              value={invoice.job.info}
              onChange={(event) => updateField("job.info", event.target.value)}
            />
            <CustomFields fields={jobFields} invoice={invoice} updateField={updateField} />
          </div>
        </fieldset>

        <fieldset className="form-group meta-fields">
          <legend>Invoice information</legend>
          <div className="field-grid field-grid--two">
            <Field
              label="Invoice no."
              name="invoice-number"
              value={invoice.meta.number}
              onChange={(event) => updateField("meta.number", event.target.value)}
            />
            <Field
              label={labelFor(layout, "poNumber")}
              name="purchase-order"
              value={invoice.meta.poNumber}
              onChange={(event) => updateField("meta.poNumber", event.target.value)}
            />
            <Field
              label="Invoice date"
              name="issue-date"
              type="date"
              value={invoice.meta.issueDate}
              onChange={(event) => changeIssueDate(event.target.value)}
            />
            <label className="form-field" htmlFor="invoice-terms">
              <span>Terms</span>
              <select
                id="invoice-terms"
                value={terms}
                onChange={(event) => changeTerms(event.target.value)}
              >
                {termOptions.map((option) => <option key={option}>{option}</option>)}
              </select>
            </label>
            <Field
              label="Due date"
              name="due-date"
              type="date"
              value={invoice.meta.dueDate}
              onChange={(event) => updateField("meta.dueDate", event.target.value)}
            />
            <label className="form-field" htmlFor="invoice-status">
              <span>Status</span>
              <select
                id="invoice-status"
                value={String(invoice.meta.status || "draft").toLowerCase()}
                onChange={(event) => updateField("meta.status", event.target.value)}
              >
                <option value="draft">Draft</option>
                <option value="sent">Sent</option>
                <option value="paid">Paid</option>
                <option value="void">Void</option>
              </select>
            </label>
            <CustomFields fields={invoiceFields} invoice={invoice} updateField={updateField} />
            <label className="form-field field-span-two" htmlFor="invoice-currency">
              <span>Currency</span>
              <select
                id="invoice-currency"
                value={invoice.meta.currency}
                onChange={(event) => updateField("meta.currency", event.target.value)}
              >
                <option value="USD">USD — US Dollar</option>
                <option value="CAD">CAD — Canadian Dollar</option>
                <option value="EUR">EUR — Euro</option>
                <option value="GBP">GBP — Pound Sterling</option>
                <option value="AUD">AUD — Australian Dollar</option>
              </select>
            </label>
          </div>
        </fieldset>
      </div>
    </section>
  );
}
