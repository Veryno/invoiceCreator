import { Buildings, Palette } from "@phosphor-icons/react";
import {
  BrandColorField,
  LogoUploadField,
  SetupTextField,
} from "./SetupControls.jsx";
import { emitSetupChange } from "./setupModel.js";

export function OnboardingCompanyStep({
  company,
  brandColor,
  onUpdateCompany,
  onUpdateBrandColor,
  onAutosave,
}) {
  function updateCompany(patch) {
    emitSetupChange({
      onChange: onUpdateCompany,
      onAutosave,
      section: "company",
      patch,
      step: 0,
    });
  }

  function updateBrandColor(value) {
    onUpdateBrandColor?.(value);
    onAutosave?.({ section: "brandColor", value, step: 0 });
  }

  return (
    <div className="setup-step-panel" aria-labelledby="setup-company-title">
      <div className="setup-step-heading">
        <span className="setup-step-icon"><Buildings size={22} weight="duotone" aria-hidden="true" /></span>
        <div>
          <p>Step 1 of 4</p>
          <h2 id="setup-company-title" data-setup-step-title tabIndex="-1">Make invoices feel like yours</h2>
          <span>Add the business details customers should see. Everything can be changed later.</span>
        </div>
      </div>

      <section className="setup-section" aria-labelledby="setup-company-logo-heading">
        <div className="setup-section-heading">
          <h3 id="setup-company-logo-heading">Logo</h3>
          <p>Use a clear mark that still reads well on a printed page.</p>
        </div>
        <LogoUploadField
          id="onboarding-company-logo"
          logo={company.logo || ""}
          companyName={company.name || ""}
          onChange={(logo) => updateCompany({ logo })}
        />
      </section>

      <section className="setup-section" aria-labelledby="setup-company-details-heading">
        <div className="setup-section-heading">
          <h3 id="setup-company-details-heading">Business details</h3>
          <p>Only information you enter is stored, and it stays on this device.</p>
        </div>
        <div className="setup-field-grid setup-field-grid--two">
          <SetupTextField
            id="onboarding-company-name"
            label="Company name"
            className="setup-field--wide"
            value={company.name || ""}
            placeholder="Your business name"
            autoComplete="organization"
            onChange={(event) => updateCompany({ name: event.target.value })}
          />
          <SetupTextField
            id="onboarding-company-email"
            label="Email"
            type="email"
            value={company.email || ""}
            autoComplete="email"
            onChange={(event) => updateCompany({ email: event.target.value })}
          />
          <SetupTextField
            id="onboarding-company-phone"
            label="Phone"
            type="tel"
            value={company.phone || ""}
            autoComplete="tel"
            onChange={(event) => updateCompany({ phone: event.target.value })}
          />
          <SetupTextField
            id="onboarding-company-website"
            label="Website"
            value={company.website || ""}
            inputMode="url"
            autoComplete="url"
            placeholder="https://example.com"
            onChange={(event) => updateCompany({ website: event.target.value })}
          />
          <SetupTextField
            id="onboarding-company-tax-id"
            label="Tax ID"
            value={company.taxId || ""}
            autoComplete="off"
            onChange={(event) => updateCompany({ taxId: event.target.value })}
          />
          <SetupTextField
            id="onboarding-company-address"
            label="Business address"
            className="setup-field--wide"
            multiline
            rows={3}
            value={company.address || ""}
            autoComplete="street-address"
            onChange={(event) => updateCompany({ address: event.target.value })}
          />
        </div>
      </section>

      <section className="setup-section setup-section--brand" aria-labelledby="setup-brand-color-heading">
        <div className="setup-section-heading setup-section-heading--iconized">
          <Palette size={18} aria-hidden="true" />
          <div>
            <h3 id="setup-brand-color-heading">Brand color</h3>
            <p>Choose with an RGB picker or enter the exact HEX value.</p>
          </div>
        </div>
        <BrandColorField
          idPrefix="onboarding-brand-color"
          value={brandColor}
          onChange={updateBrandColor}
        />
      </section>
    </div>
  );
}
