import {
  ArrowLeft,
  Buildings,
  ImageSquare,
  Palette,
  Trash,
  UploadSimple,
} from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { normalizeHexColorInput } from "../lib/invoice.js";

const MAX_LOGO_BYTES = 2_500_000;
const ALLOWED_LOGO_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const DEFAULT_ACCENT_COLOR = "#2563EB";

function ProfileField({ id, label, hint, className = "", ...inputProps }) {
  const hintId = hint ? `${id}-hint` : undefined;

  return (
    <label
      className={`company-profile-field${className ? ` ${className}` : ""}`}
      htmlFor={id}
    >
      <span className="company-profile-field-label">{label}</span>
      {hint && <small className="company-profile-field-hint" id={hintId}>{hint}</small>}
      <input id={id} aria-describedby={hintId} {...inputProps} />
    </label>
  );
}

export function CompanyProfile({ draft, onBack }) {
  const { invoice, updateField } = draft;
  const logoInputRef = useRef(null);
  const committedColor =
    normalizeHexColorInput(invoice.design.accentColor) || DEFAULT_ACCENT_COLOR;
  const [hexDraft, setHexDraft] = useState(committedColor);
  const [hexError, setHexError] = useState("");
  const [logoError, setLogoError] = useState("");

  useEffect(() => {
    setHexDraft(committedColor);
    setHexError("");
  }, [committedColor]);

  function resetLogoInput() {
    if (logoInputRef.current) logoInputRef.current.value = "";
  }

  function handleLogo(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!ALLOWED_LOGO_TYPES.has(file.type)) {
      setLogoError("Choose a PNG, JPG, or WebP image.");
      resetLogoInput();
      return;
    }

    if (file.size > MAX_LOGO_BYTES) {
      setLogoError("Choose an image smaller than 2.5 MB.");
      resetLogoInput();
      return;
    }

    const reader = new FileReader();
    reader.addEventListener("load", () => {
      const result = reader.result;
      if (
        typeof result !== "string"
        || !/^data:image\/(?:png|jpeg|webp);base64,/i.test(result)
      ) {
        setLogoError("That image could not be read. Try another file.");
        resetLogoInput();
        return;
      }

      updateField("company.logo", result);
      setLogoError("");
      resetLogoInput();
    });
    reader.addEventListener("error", () => {
      setLogoError("That image could not be read. Try another file.");
      resetLogoInput();
    });
    reader.readAsDataURL(file);
  }

  function removeLogo() {
    updateField("company.logo", "");
    setLogoError("");
    resetLogoInput();
  }

  function commitHexColor() {
    const normalized = normalizeHexColorInput(hexDraft);
    if (!normalized) {
      setHexError("Enter a 6-digit HEX color, such as #0F766E.");
      return;
    }

    setHexDraft(normalized);
    setHexError("");
    updateField("design.accentColor", normalized);
  }

  function handleHexChange(event) {
    const nextValue = event.target.value;
    const normalized = normalizeHexColorInput(nextValue);
    setHexDraft(nextValue);
    setHexError("");

    if (normalized) updateField("design.accentColor", normalized);
  }

  function handlePickerChange(event) {
    const normalized = event.target.value.toUpperCase();
    setHexDraft(normalized);
    setHexError("");
    updateField("design.accentColor", normalized);
  }

  return (
    <main className="company-profile-page" aria-labelledby="company-profile-title">
      <header className="company-profile-header">
        {typeof onBack === "function" && (
          <button className="company-profile-back" type="button" onClick={onBack}>
            <ArrowLeft size={18} aria-hidden="true" />
            <span>Back</span>
          </button>
        )}
        <div className="company-profile-heading">
          <span className="company-profile-heading-icon" aria-hidden="true">
            <Buildings size={24} weight="duotone" />
          </span>
          <div>
            <p className="company-profile-kicker">Business settings</p>
            <h1 id="company-profile-title">Company profile</h1>
            <p className="company-profile-description">
              These details are saved locally, reused for new invoices, and flow into the preview and exported PDF.
            </p>
          </div>
        </div>
      </header>

      <form className="company-profile-form" onSubmit={(event) => event.preventDefault()}>
        <section className="company-profile-section" aria-labelledby="company-profile-logo-title">
          <div className="company-profile-section-heading">
            <h2 id="company-profile-logo-title">Company logo</h2>
            <p>Add an image that will appear in the invoice header.</p>
          </div>

          <div className="company-profile-logo-row">
            <div className="company-profile-logo-preview">
              {invoice.company.logo ? (
                <img
                  src={invoice.company.logo}
                  alt={`${invoice.company.name || "Company"} logo`}
                />
              ) : (
                <>
                  <ImageSquare size={28} aria-hidden="true" />
                  <span>No logo uploaded</span>
                </>
              )}
            </div>
            <div className="company-profile-logo-actions">
              <label className="company-profile-logo-upload" htmlFor="company-profile-logo-input">
                <UploadSimple size={16} aria-hidden="true" />
                <span>{invoice.company.logo ? "Replace logo" : "Upload logo"}</span>
              </label>
              <input
                ref={logoInputRef}
                className="company-profile-logo-input"
                id="company-profile-logo-input"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                aria-describedby={`company-profile-logo-help${logoError ? " company-profile-logo-error" : ""}`}
                onChange={handleLogo}
              />
              {invoice.company.logo && (
                <button className="company-profile-logo-remove" type="button" onClick={removeLogo}>
                  <Trash size={16} aria-hidden="true" />
                  <span>Remove</span>
                </button>
              )}
              <p className="company-profile-logo-help" id="company-profile-logo-help">
                PNG, JPG, or WebP. Maximum 2.5 MB.
              </p>
              {logoError && (
                <p className="company-profile-error" id="company-profile-logo-error" role="alert">
                  {logoError}
                </p>
              )}
            </div>
          </div>
        </section>

        <section className="company-profile-section" aria-labelledby="company-profile-details-title">
          <div className="company-profile-section-heading">
            <h2 id="company-profile-details-title">Business details</h2>
            <p>Use the legal or public-facing details you want customers to see.</p>
          </div>

          <div className="company-profile-field-grid">
            <ProfileField
              id="company-profile-name"
              label="Company name"
              hint="Legal or public-facing name shown on invoices."
              className="company-profile-field-wide"
              value={invoice.company.name}
              autoComplete="organization"
              onChange={(event) => updateField("company.name", event.target.value)}
            />
            <ProfileField
              id="company-profile-email"
              label="Email"
              type="email"
              value={invoice.company.email}
              autoComplete="email"
              onChange={(event) => updateField("company.email", event.target.value)}
            />
            <ProfileField
              id="company-profile-phone"
              label="Phone"
              type="tel"
              value={invoice.company.phone}
              autoComplete="tel"
              onChange={(event) => updateField("company.phone", event.target.value)}
            />
            <ProfileField
              id="company-profile-website"
              label="Website"
              type="text"
              inputMode="url"
              value={invoice.company.website}
              autoComplete="url"
              placeholder="https://example.com"
              onChange={(event) => updateField("company.website", event.target.value)}
            />
            <ProfileField
              id="company-profile-tax-id"
              label="Tax ID"
              value={invoice.company.taxId}
              autoComplete="off"
              onChange={(event) => updateField("company.taxId", event.target.value)}
            />
            <label
              className="company-profile-field company-profile-field-wide"
              htmlFor="company-profile-address"
            >
              <span className="company-profile-field-label">Business address</span>
              <small className="company-profile-field-hint" id="company-profile-address-hint">
                Include street, city, state or region, postal code, and country as needed.
              </small>
              <textarea
                id="company-profile-address"
                rows="4"
                value={invoice.company.address}
                autoComplete="street-address"
                aria-describedby="company-profile-address-hint"
                onChange={(event) => updateField("company.address", event.target.value)}
              />
            </label>
          </div>
        </section>

        <section className="company-profile-section" aria-labelledby="company-profile-brand-title">
          <div className="company-profile-section-heading company-profile-section-heading-iconized">
            <Palette size={19} aria-hidden="true" />
            <div>
              <h2 id="company-profile-brand-title">Brand color</h2>
              <p>Choose the accent used for invoice headings, totals, and highlights.</p>
            </div>
          </div>

          <div className="company-profile-color-controls">
            <label className="company-profile-color-picker" htmlFor="company-profile-color-rgb">
              <span>RGB color picker</span>
              <input
                id="company-profile-color-rgb"
                type="color"
                value={committedColor}
                onChange={handlePickerChange}
              />
            </label>
            <label className="company-profile-color-hex" htmlFor="company-profile-color-hex">
              <span>HEX</span>
              <input
                id="company-profile-color-hex"
                type="text"
                value={hexDraft}
                inputMode="text"
                maxLength={7}
                pattern="#?[0-9A-Fa-f]{6}"
                spellCheck="false"
                autoComplete="off"
                autoCapitalize="characters"
                aria-invalid={Boolean(hexError)}
                aria-describedby={`company-profile-color-help${hexError ? " company-profile-color-error" : ""}`}
                onChange={handleHexChange}
                onBlur={commitHexColor}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    commitHexColor();
                  }
                  if (event.key === "Escape") {
                    event.preventDefault();
                    setHexDraft(committedColor);
                    setHexError("");
                  }
                }}
              />
            </label>
            <p className="company-profile-color-help" id="company-profile-color-help">
              Enter six HEX digits, with or without the # symbol.
            </p>
            {hexError && (
              <p className="company-profile-error" id="company-profile-color-error" role="alert">
                {hexError}
              </p>
            )}
          </div>
        </section>
      </form>
    </main>
  );
}
