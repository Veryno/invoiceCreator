export const BASE_TEMPLATE_OPTIONS = Object.freeze([
  { id: "modern", name: "Modern", description: "Bold, structured headings" },
  { id: "classic", name: "Classic", description: "Traditional invoice styling" },
  { id: "minimal", name: "Minimal", description: "Quiet, spacious presentation" },
]);

export const CURRENCY_OPTIONS = Object.freeze([
  { value: "USD", label: "USD — US Dollar" },
  { value: "CAD", label: "CAD — Canadian Dollar" },
  { value: "EUR", label: "EUR — Euro" },
  { value: "GBP", label: "GBP — Pound Sterling" },
  { value: "AUD", label: "AUD — Australian Dollar" },
]);

export const TERM_OPTIONS = Object.freeze([
  "Due on receipt",
  "Net 7",
  "Net 15",
  "Net 30",
  "Net 60",
]);

export const EMPTY_RECORD = Object.freeze({});
export const EMPTY_LIST = Object.freeze([]);

export function emitSetupChange({
  onChange,
  onAutosave,
  section,
  patch,
  step,
}) {
  onChange?.(patch);
  onAutosave?.({ section, patch, step });
}

export function presetDesign(preset) {
  const source = preset?.design && typeof preset.design === "object"
    ? preset.design
    : EMPTY_RECORD;
  return {
    template: source.template || preset?.template || preset?.baseTemplate || "modern",
    accentColor: source.accentColor || preset?.accentColor || "#0F766E",
    font: source.font || "Inter",
    paperSize: source.paperSize === "A4" ? "A4" : "Letter",
    showServiceDate: source.showServiceDate !== false,
    showItem: source.showItem !== false,
  };
}

export function presetContent(preset) {
  const source = preset?.content && typeof preset.content === "object"
    ? preset.content
    : EMPTY_RECORD;
  return {
    notes: typeof source.notes === "string" ? source.notes : "",
    paymentInstructions: typeof source.paymentInstructions === "string"
      ? source.paymentInstructions
      : "",
  };
}

export function numberingValues(defaults = EMPTY_RECORD) {
  const nested = defaults.numbering && typeof defaults.numbering === "object"
    ? defaults.numbering
    : EMPTY_RECORD;
  return {
    prefix: nested.prefix ?? defaults.numberPrefix ?? "",
    nextNumber: nested.nextNumber ?? defaults.nextNumber ?? 1,
    padding: nested.padding ?? defaults.numberPadding ?? 1,
    includeYear: nested.includeYear ?? defaults.includeYear ?? true,
  };
}

export function numberingExample(defaults = EMPTY_RECORD) {
  const { prefix, nextNumber, padding, includeYear } = numberingValues(defaults);
  const safeNumber = Math.max(1, Number.parseInt(nextNumber, 10) || 1);
  const safePadding = Math.max(1, Math.min(8, Number.parseInt(padding, 10) || 1));
  const safePrefix = String(prefix || "");
  const separator = /[-_/.\s]$/u.test(safePrefix) ? "" : "-";
  const sequence = String(safeNumber).padStart(safePadding, "0");
  return includeYear
    ? `${safePrefix}${separator}${new Date().getFullYear()}-${sequence}`
    : `${safePrefix}${separator}${sequence}`;
}

export function templateNameForId(templates, id) {
  const match = templates.find((template) => String(template.id) === String(id));
  return match?.name || match?.label || "Not selected";
}
