import {
  CheckCircle,
  FileArrowUp,
  UserPlus,
  UsersThree,
} from "@phosphor-icons/react";
import { SetupTextField } from "./SetupControls.jsx";
import { emitSetupChange } from "./setupModel.js";

const CUSTOMER_MODES = [
  {
    id: "manual",
    label: "Add one manually",
    description: "Enter the first customer’s billing details.",
    Icon: UserPlus,
  },
  {
    id: "import",
    label: "Import customers",
    description: "Choose a CSV, XLSX, or JSON file.",
    Icon: FileArrowUp,
  },
  {
    id: "skip",
    label: "Skip for now",
    description: "Start with an empty customer directory.",
    Icon: CheckCircle,
  },
];

export function OnboardingCustomerStep({
  customer,
  mode,
  onModeChange,
  onUpdateCustomer,
  onImportCustomerFile,
  onSkipCustomer,
  onAutosave,
  isImporting = false,
  importError = "",
  importSummary = "",
}) {
  function chooseMode(nextMode) {
    onModeChange?.(nextMode);
    onAutosave?.({ section: "customerMode", value: nextMode, step: 2 });
    if (nextMode === "skip") onSkipCustomer?.();
  }

  function updateCustomer(patch) {
    emitSetupChange({
      onChange: onUpdateCustomer,
      onAutosave,
      section: "customer",
      patch,
      step: 2,
    });
  }

  return (
    <div className="setup-step-panel" aria-labelledby="setup-customer-title">
      <div className="setup-step-heading">
        <span className="setup-step-icon"><UsersThree size={22} weight="duotone" aria-hidden="true" /></span>
        <div>
          <p>Step 3 of 4</p>
          <h2 id="setup-customer-title" data-setup-step-title tabIndex="-1">How would you like to start?</h2>
          <span>Add one customer, import a list, or leave the directory empty for now.</span>
        </div>
      </div>

      <fieldset className="setup-choice-group">
        <legend className="visually-hidden">Choose how to set up customers</legend>
        {CUSTOMER_MODES.map(({ id, label, description, Icon }) => (
          <label key={id} className={`setup-choice-card${mode === id ? " is-selected" : ""}`}>
            <input
              type="radio"
              name="onboarding-customer-mode"
              value={id}
              checked={mode === id}
              onChange={() => chooseMode(id)}
            />
            <span className="setup-choice-icon"><Icon size={20} weight="duotone" aria-hidden="true" /></span>
            <span>
              <strong>{label}</strong>
              <small>{description}</small>
            </span>
            <span className="setup-choice-check" aria-hidden="true"><CheckCircle size={18} weight="fill" /></span>
          </label>
        ))}
      </fieldset>

      {mode === "manual" ? (
        <section className="setup-section" aria-labelledby="setup-first-customer-heading">
          <div className="setup-section-heading">
            <h3 id="setup-first-customer-heading">First customer</h3>
            <p>This creates a reusable directory entry; invoices keep their own historical snapshot.</p>
          </div>
          <div className="setup-field-grid setup-field-grid--two">
            <SetupTextField
              id="onboarding-customer-name"
              label="Customer or company"
              className="setup-field--wide"
              value={customer.name || ""}
              autoComplete="organization"
              onChange={(event) => updateCustomer({ name: event.target.value })}
            />
            <SetupTextField
              id="onboarding-customer-email"
              label="Email"
              type="email"
              value={customer.email || ""}
              autoComplete="email"
              onChange={(event) => updateCustomer({ email: event.target.value })}
            />
            <SetupTextField
              id="onboarding-customer-phone"
              label="Phone"
              type="tel"
              value={customer.phone || ""}
              autoComplete="tel"
              onChange={(event) => updateCustomer({ phone: event.target.value })}
            />
            <SetupTextField
              id="onboarding-customer-address"
              label="Billing address"
              className="setup-field--wide"
              multiline
              rows={3}
              value={customer.address || ""}
              autoComplete="street-address"
              onChange={(event) => updateCustomer({ address: event.target.value })}
            />
          </div>
        </section>
      ) : null}

      {mode === "import" ? (
        <section className="setup-section setup-import-section" aria-labelledby="setup-customer-import-heading">
          <div className="setup-section-heading">
            <h3 id="setup-customer-import-heading">Import a customer list</h3>
            <p>Invoice Studio recognizes common customer columns and reports what was added.</p>
          </div>
          <label className={`setup-import-button${isImporting ? " is-busy" : ""}`} htmlFor="onboarding-customer-import">
            <FileArrowUp size={23} weight="duotone" aria-hidden="true" />
            <span>
              <strong>{isImporting ? "Reading customer data…" : "Choose a customer file"}</strong>
              <small>CSV, XLSX, or JSON</small>
            </span>
          </label>
          <input
            className="visually-hidden"
            id="onboarding-customer-import"
            type="file"
            accept=".csv,.xlsx,.json,text/csv,application/json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            disabled={isImporting}
            aria-describedby={importError ? "onboarding-customer-import-error" : "onboarding-customer-import-status"}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onImportCustomerFile?.(file);
              event.target.value = "";
            }}
          />
          <p className="setup-import-status" id="onboarding-customer-import-status" role="status" aria-live="polite">
            {importSummary || "Legacy .xls files should be converted to XLSX or CSV first."}
          </p>
          {importError ? <p className="setup-field-error" id="onboarding-customer-import-error" role="alert">{importError}</p> : null}
        </section>
      ) : null}

      {mode === "skip" ? (
        <section className="setup-skip-note" aria-label="Customer setup skipped">
          <CheckCircle size={21} weight="fill" aria-hidden="true" />
          <div>
            <strong>No customer data will be added.</strong>
            <span>You can create or import customers later from the Customers workspace.</span>
          </div>
        </section>
      ) : null}
    </div>
  );
}
