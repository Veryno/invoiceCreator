import { ImageSquare, X } from "@phosphor-icons/react";

function Field({ label, className = "", ...inputProps }) {
  const id = inputProps.id || `field-${inputProps.name}`;
  return (
    <label className={`form-field ${className}`} htmlFor={id}>
      <span>{label}</span>
      <input id={id} {...inputProps} />
    </label>
  );
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

export function InvoiceHeaderForm({ invoice, updateField }) {
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

  return (
    <section className="editor-card editor-card--header" aria-labelledby="invoice-details-heading">
      <div className="section-heading">
        <div>
          <p className="section-kicker">From &amp; to</p>
          <h2 id="invoice-details-heading">Invoice details</h2>
        </div>
        <span className="section-helper">Fields update the PDF preview instantly</span>
      </div>

      <div className="invoice-form-grid">
        <fieldset className="form-group company-fields">
          <legend>Your company</legend>
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
          <div className="field-grid field-grid--two">
            <Field
              label="Company name"
              name="company-name"
              value={invoice.company.name}
              onChange={(event) => updateField("company.name", event.target.value)}
            />
            <Field
              label="Tax ID"
              name="company-tax-id"
              value={invoice.company.taxId}
              onChange={(event) => updateField("company.taxId", event.target.value)}
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
              className="field-span-two"
              value={invoice.company.website}
              onChange={(event) => updateField("company.website", event.target.value)}
            />
            <TextAreaField
              label="Business address"
              name="company-address"
              className="field-span-two"
              rows="2"
              value={invoice.company.address}
              onChange={(event) => updateField("company.address", event.target.value)}
            />
          </div>
        </fieldset>

        <fieldset className="form-group customer-fields">
          <legend>Bill to</legend>
          <div className="field-grid field-grid--two">
            <Field
              label="Customer or company"
              name="customer-name"
              className="field-span-two"
              value={invoice.customer.name}
              onChange={(event) => updateField("customer.name", event.target.value)}
            />
            <Field
              label="Email"
              name="customer-email"
              type="email"
              value={invoice.customer.email}
              onChange={(event) => updateField("customer.email", event.target.value)}
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
              className="field-span-two"
              rows="2"
              value={invoice.customer.address}
              onChange={(event) => updateField("customer.address", event.target.value)}
            />
          </div>
        </fieldset>

        <fieldset className="form-group meta-fields">
          <legend>Invoice information</legend>
          <div className="field-grid field-grid--two">
            <Field
              label="Invoice number"
              name="invoice-number"
              value={invoice.meta.number}
              onChange={(event) => updateField("meta.number", event.target.value)}
            />
            <Field
              label="Purchase order"
              name="purchase-order"
              value={invoice.meta.poNumber}
              onChange={(event) => updateField("meta.poNumber", event.target.value)}
            />
            <Field
              label="Issue date"
              name="issue-date"
              type="date"
              value={invoice.meta.issueDate}
              onChange={(event) => updateField("meta.issueDate", event.target.value)}
            />
            <Field
              label="Due date"
              name="due-date"
              type="date"
              value={invoice.meta.dueDate}
              onChange={(event) => updateField("meta.dueDate", event.target.value)}
            />
            <label className="form-field" htmlFor="invoice-terms">
              <span>Terms</span>
              <select
                id="invoice-terms"
                value={invoice.meta.terms}
                onChange={(event) => updateField("meta.terms", event.target.value)}
              >
                <option>Due on receipt</option>
                <option>Net 7</option>
                <option>Net 15</option>
                <option>Net 30</option>
                <option>Net 60</option>
              </select>
            </label>
            <label className="form-field" htmlFor="invoice-currency">
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
