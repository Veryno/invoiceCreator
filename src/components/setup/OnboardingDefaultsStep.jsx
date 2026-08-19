import { FileText, HashStraight } from "@phosphor-icons/react";
import {
  SetupSelectField,
  SetupSwitch,
  SetupTextField,
} from "./SetupControls.jsx";
import {
  BASE_TEMPLATE_OPTIONS,
  CURRENCY_OPTIONS,
  emitSetupChange,
  numberingExample,
  numberingValues,
  TERM_OPTIONS,
} from "./setupModel.js";

export function OnboardingDefaultsStep({
  defaults,
  templates,
  onUpdateDefaults,
  onAutosave,
}) {
  const availableTemplates = templates.length > 0 ? templates : BASE_TEMPLATE_OPTIONS;
  const numbering = numberingValues(defaults);
  const templateId = defaults.defaultTemplateId || defaults.templateId || "";

  function updateDefaults(patch) {
    emitSetupChange({
      onChange: onUpdateDefaults,
      onAutosave,
      section: "defaults",
      patch,
      step: 1,
    });
  }

  function updateNumbering(patch) {
    updateDefaults({ numbering: { ...numbering, ...patch } });
  }

  return (
    <div className="setup-step-panel" aria-labelledby="setup-defaults-title">
      <div className="setup-step-heading">
        <span className="setup-step-icon"><FileText size={22} weight="duotone" aria-hidden="true" /></span>
        <div>
          <p>Step 2 of 4</p>
          <h2 id="setup-defaults-title" data-setup-step-title tabIndex="-1">Set your invoice starting point</h2>
          <span>These defaults speed up new invoices without locking individual documents.</span>
        </div>
      </div>

      <section className="setup-section" aria-labelledby="setup-invoice-defaults-heading">
        <div className="setup-section-heading">
          <h3 id="setup-invoice-defaults-heading">Invoice defaults</h3>
          <p>You can override any of these while editing an invoice.</p>
        </div>
        <div className="setup-field-grid setup-field-grid--two">
          <SetupSelectField
            id="onboarding-default-terms"
            label="Payment terms"
            value={defaults.terms || ""}
            onChange={(event) => updateDefaults({ terms: event.target.value })}
          >
            <option value="">Choose terms</option>
            {TERM_OPTIONS.map((term) => <option key={term} value={term}>{term}</option>)}
          </SetupSelectField>
          <SetupSelectField
            id="onboarding-default-currency"
            label="Currency"
            value={defaults.currency || ""}
            onChange={(event) => updateDefaults({ currency: event.target.value })}
          >
            <option value="">Choose currency</option>
            {CURRENCY_OPTIONS.map((currency) => (
              <option key={currency.value} value={currency.value}>{currency.label}</option>
            ))}
          </SetupSelectField>
          <SetupTextField
            id="onboarding-default-tax"
            label="Default tax rate"
            hint="Enter a percentage from 0 to 100."
            type="number"
            inputMode="decimal"
            min="0"
            max="100"
            step="0.01"
            value={defaults.taxRate ?? ""}
            onChange={(event) => updateDefaults({ taxRate: event.target.value })}
          />
          <SetupSelectField
            id="onboarding-default-paper"
            label="Paper size"
            value={defaults.paperSize || "Letter"}
            onChange={(event) => updateDefaults({ paperSize: event.target.value })}
          >
            <option value="Letter">Letter</option>
            <option value="A4">A4</option>
          </SetupSelectField>
          <SetupSelectField
            id="onboarding-default-template"
            label="Default template"
            hint="Used for future invoices until you choose another style."
            className="setup-field--wide"
            value={templateId}
            onChange={(event) => updateDefaults({ defaultTemplateId: event.target.value })}
          >
            <option value="">Choose a template</option>
            {availableTemplates.map((template) => (
              <option key={template.id} value={template.id}>{template.name || template.label}</option>
            ))}
          </SetupSelectField>
        </div>
      </section>

      <section className="setup-section" aria-labelledby="setup-numbering-heading">
        <div className="setup-section-heading setup-section-heading--iconized">
          <HashStraight size={18} aria-hidden="true" />
          <div>
            <h3 id="setup-numbering-heading">Automatic numbering</h3>
            <p>Invoice Studio advances the number after a new invoice is created.</p>
          </div>
          <output className="setup-number-preview" aria-label="Next invoice number example">
            {numberingExample(defaults)}
          </output>
        </div>
        <div className="setup-field-grid setup-numbering-grid">
          <SetupTextField
            id="onboarding-number-prefix"
            label="Prefix"
            value={numbering.prefix}
            placeholder="INV-"
            maxLength={16}
            autoComplete="off"
            onChange={(event) => updateNumbering({ prefix: event.target.value })}
          />
          <SetupTextField
            id="onboarding-next-number"
            label="Next number"
            type="number"
            inputMode="numeric"
            min="1"
            step="1"
            value={numbering.nextNumber}
            onChange={(event) => updateNumbering({ nextNumber: event.target.value })}
          />
          <SetupSelectField
            id="onboarding-number-padding"
            label="Minimum digits"
            value={numbering.padding}
            onChange={(event) => updateNumbering({ padding: event.target.value })}
          >
            {[1, 2, 3, 4, 5, 6].map((value) => (
              <option key={value} value={value}>{value}</option>
            ))}
          </SetupSelectField>
        </div>
        <div className="setup-numbering-switch">
          <SetupSwitch
            id="onboarding-number-include-year"
            checked={numbering.includeYear !== false}
            onChange={(event) => updateNumbering({ includeYear: event.target.checked })}
            label="Include the current year"
            description="Keeps invoice numbers easy to scan, such as INV-2026-001."
          />
        </div>
      </section>
    </div>
  );
}
