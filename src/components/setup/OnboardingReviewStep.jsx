import {
  Buildings,
  CheckCircle,
  FileText,
  PencilSimple,
  UsersThree,
} from "@phosphor-icons/react";
import {
  BASE_TEMPLATE_OPTIONS,
  numberingExample,
  templateNameForId,
} from "./setupModel.js";

function ReviewCard({ title, icon: Icon, onEdit, children }) {
  return (
    <section className="setup-review-card">
      <div className="setup-review-card-heading">
        <span><Icon size={18} weight="duotone" aria-hidden="true" />{title}</span>
        <button type="button" aria-label={`Edit ${title}`} onClick={onEdit}>
          <PencilSimple size={15} aria-hidden="true" />
          Edit
        </button>
      </div>
      {children}
    </section>
  );
}

function Value({ label, children }) {
  return (
    <div className="setup-review-value">
      <dt>{label}</dt>
      <dd>{children || "Not added yet"}</dd>
    </div>
  );
}

export function OnboardingReviewStep({
  company,
  brandColor,
  defaults,
  templates,
  customer,
  customerMode,
  customerImportSummary,
  onEditStep,
}) {
  const availableTemplates = templates.length > 0 ? templates : BASE_TEMPLATE_OPTIONS;
  const templateId = defaults.defaultTemplateId || defaults.templateId || "";
  const customerSummary = customerMode === "skip"
    ? "Skipped for now"
    : customerMode === "import"
      ? customerImportSummary || "Import ready for review"
      : customer.name || "Not added yet";

  return (
    <div className="setup-step-panel" aria-labelledby="setup-review-title">
      <div className="setup-step-heading">
        <span className="setup-step-icon"><CheckCircle size={22} weight="duotone" aria-hidden="true" /></span>
        <div>
          <p>Step 4 of 4</p>
          <h2 id="setup-review-title" data-setup-step-title tabIndex="-1">Review your starting setup</h2>
          <span>Nothing is sent anywhere. These choices stay local and can be edited later.</span>
        </div>
      </div>

      <div className="setup-review-grid">
        <ReviewCard title="Company" icon={Buildings} onEdit={() => onEditStep?.(0)}>
          <div className="setup-review-company">
            <span className="setup-review-logo">
              {company.logo ? <img src={company.logo} alt="" /> : <Buildings size={22} aria-hidden="true" />}
            </span>
            <dl>
              <Value label="Name">{company.name}</Value>
              <Value label="Email">{company.email}</Value>
              <Value label="Address">{company.address}</Value>
            </dl>
          </div>
          <div className="setup-review-color">
            <span style={{ backgroundColor: brandColor }} aria-hidden="true" />
            <code>{brandColor}</code>
            <small>Brand color</small>
          </div>
        </ReviewCard>

        <ReviewCard title="Invoice defaults" icon={FileText} onEdit={() => onEditStep?.(1)}>
          <dl className="setup-review-list">
            <Value label="Template">{templateNameForId(availableTemplates, templateId)}</Value>
            <Value label="Terms">{defaults.terms}</Value>
            <Value label="Currency">{defaults.currency}</Value>
            <Value label="Next number">{numberingExample(defaults)}</Value>
          </dl>
        </ReviewCard>

        <ReviewCard title="Customers" icon={UsersThree} onEdit={() => onEditStep?.(2)}>
          <dl className="setup-review-list">
            <Value label="Starting choice">{customerSummary}</Value>
            {customerMode === "manual" ? <Value label="Email">{customer.email}</Value> : null}
          </dl>
        </ReviewCard>
      </div>

      <div className="setup-offline-note">
        <CheckCircle size={18} weight="fill" aria-hidden="true" />
        <p><strong>Private by design.</strong> Company, customer, and invoice data remain on this device unless you export a file.</p>
      </div>
    </div>
  );
}
