import {
  Check,
  ImageSquare,
  Trash,
  UploadSimple,
  WarningCircle,
} from "@phosphor-icons/react";
import { useEffect, useId, useState } from "react";
import { normalizeHexColorInput } from "../../lib/invoice.js";

const ACCEPTED_LOGO_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_LOGO_BYTES = 2_500_000;

function colorAsRgb(value) {
  const normalized = normalizeHexColorInput(value) || "#0F766E";
  const numeric = Number.parseInt(normalized.slice(1), 16);
  return `${(numeric >> 16) & 255}, ${(numeric >> 8) & 255}, ${numeric & 255}`;
}

export function SetupField({
  id,
  label,
  hint,
  error,
  className = "",
  children,
}) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={`setup-field ${className}`.trim()}>
      <label className="setup-field-label" htmlFor={id}>{label}</label>
      {hint ? <p className="setup-field-hint" id={hintId}>{hint}</p> : null}
      {typeof children === "function"
        ? children({ describedBy, invalid: Boolean(error) })
        : children}
      {error ? (
        <p className="setup-field-error" id={errorId} role="alert">
          <WarningCircle size={14} weight="fill" aria-hidden="true" />
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function SetupTextField({
  id,
  label,
  hint,
  error,
  className = "",
  multiline = false,
  rows = 3,
  ...inputProps
}) {
  return (
    <SetupField id={id} label={label} hint={hint} error={error} className={className}>
      {({ describedBy, invalid }) => multiline ? (
        <textarea
          id={id}
          rows={rows}
          aria-describedby={describedBy}
          aria-invalid={invalid}
          {...inputProps}
        />
      ) : (
        <input
          id={id}
          aria-describedby={describedBy}
          aria-invalid={invalid}
          {...inputProps}
        />
      )}
    </SetupField>
  );
}

export function SetupSelectField({
  id,
  label,
  hint,
  error,
  className = "",
  children,
  ...selectProps
}) {
  return (
    <SetupField id={id} label={label} hint={hint} error={error} className={className}>
      {({ describedBy, invalid }) => (
        <select
          id={id}
          aria-describedby={describedBy}
          aria-invalid={invalid}
          {...selectProps}
        >
          {children}
        </select>
      )}
    </SetupField>
  );
}

export function SetupSwitch({ id, checked, onChange, label, description }) {
  return (
    <label className="setup-switch" htmlFor={id}>
      <span className="setup-switch-copy">
        <strong>{label}</strong>
        {description ? <small>{description}</small> : null}
      </span>
      <span className="setup-switch-control">
        <input id={id} type="checkbox" checked={checked} onChange={onChange} />
        <span aria-hidden="true" />
      </span>
    </label>
  );
}

export function BrandColorField({ idPrefix, value, onChange }) {
  const fallbackId = useId().replace(/:/g, "");
  const prefix = idPrefix || `brand-${fallbackId}`;
  const committed = normalizeHexColorInput(value) || "#0F766E";
  const [hexDraft, setHexDraft] = useState(committed);
  const [error, setError] = useState("");

  useEffect(() => {
    setHexDraft(committed);
    setError("");
  }, [committed]);

  function commitHex() {
    const normalized = normalizeHexColorInput(hexDraft);
    if (!normalized) {
      setError("Enter six HEX digits, such as #0F766E.");
      return;
    }
    setHexDraft(normalized);
    setError("");
    onChange?.(normalized);
  }

  return (
    <div className="setup-color-field">
      <div className="setup-color-inputs">
        <label className="setup-color-picker" htmlFor={`${prefix}-rgb`}>
          <span>RGB color picker</span>
          <span className="setup-color-picker-row">
            <input
              id={`${prefix}-rgb`}
              type="color"
              value={committed}
              onChange={(event) => onChange?.(event.target.value.toUpperCase())}
            />
            <code>{colorAsRgb(committed)}</code>
          </span>
        </label>
        <label className="setup-color-hex" htmlFor={`${prefix}-hex`}>
          <span>HEX</span>
          <input
            id={`${prefix}-hex`}
            type="text"
            value={hexDraft}
            maxLength={7}
            inputMode="text"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck="false"
            pattern="#?[0-9A-Fa-f]{6}"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? `${prefix}-error` : `${prefix}-help`}
            onChange={(event) => {
              setHexDraft(event.target.value);
              if (error) setError("");
            }}
            onBlur={commitHex}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commitHex();
              }
              if (event.key === "Escape") {
                event.preventDefault();
                setHexDraft(committed);
                setError("");
              }
            }}
          />
        </label>
      </div>
      <p className="setup-color-help" id={`${prefix}-help`}>
        Used for headings, totals, and invoice highlights.
      </p>
      {error ? <p className="setup-field-error" id={`${prefix}-error`} role="alert">{error}</p> : null}
    </div>
  );
}

export function LogoUploadField({
  id = "setup-company-logo",
  logo,
  companyName,
  onChange,
}) {
  const [error, setError] = useState("");

  function handleFile(event) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    if (!ACCEPTED_LOGO_TYPES.has(file.type) || file.size > MAX_LOGO_BYTES) {
      setError("Choose a PNG, JPG, or WebP image smaller than 2.5 MB.");
      input.value = "";
      return;
    }

    const reader = new FileReader();
    reader.addEventListener("load", () => {
      setError("");
      onChange?.(String(reader.result || ""));
      input.value = "";
    });
    reader.addEventListener("error", () => {
      setError("Invoice Studio couldn’t read that image. Choose another file.");
      input.value = "";
    });
    reader.readAsDataURL(file);
  }

  return (
    <div className="setup-logo-field">
      <div className={`setup-logo-preview${logo ? " has-logo" : ""}`}>
        {logo ? (
          <img src={logo} alt={`${companyName || "Company"} logo`} />
        ) : (
          <>
            <ImageSquare size={30} weight="duotone" aria-hidden="true" />
            <span>No logo added</span>
          </>
        )}
      </div>
      <div className="setup-logo-actions">
        <label className="setup-button setup-button--secondary" htmlFor={id}>
          <UploadSimple size={17} aria-hidden="true" />
          {logo ? "Replace logo" : "Choose logo"}
        </label>
        <input
          className="visually-hidden"
          id={id}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          aria-describedby={`${id}-help${error ? ` ${id}-error` : ""}`}
          onChange={handleFile}
        />
        {logo ? (
          <button className="setup-button setup-button--danger-quiet" type="button" onClick={() => onChange?.("")}>
            <Trash size={16} aria-hidden="true" />
            Remove
          </button>
        ) : null}
        <p id={`${id}-help`}>PNG, JPG, or WebP · maximum 2.5 MB</p>
        {error ? <p className="setup-field-error" id={`${id}-error`} role="alert">{error}</p> : null}
      </div>
    </div>
  );
}

export function AutosaveStatus({ isSaving = false, savedAt }) {
  const message = isSaving
    ? "Saving locally…"
    : savedAt
      ? "Saved locally"
      : "Changes save automatically";

  return (
    <span className="setup-autosave" role="status" aria-live="polite">
      <Check size={14} weight="bold" aria-hidden="true" />
      {message}
    </span>
  );
}
