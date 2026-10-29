// Workspace-wide invoice layout: the words, columns, and extra fields the owner
// chose. These apply to every invoice on screen and in the PDF.

export const LABEL_FIELDS = Object.freeze([
  { key: "documentTitle", fallback: "Invoice", hint: "Big title at the top of the PDF" },
  { key: "billTo", fallback: "Bill to" },
  { key: "jobSite", fallback: "Job site" },
  { key: "poNumber", fallback: "P.O. / contract no." },
  { key: "serviceDate", fallback: "Service date" },
  { key: "item", fallback: "Product / service" },
  { key: "description", fallback: "Description" },
  { key: "quantity", fallback: "Qty" },
  { key: "rate", fallback: "Rate" },
  { key: "amount", fallback: "Amount" },
  { key: "notes", fallback: "Note", hint: "Heading over the message on the PDF" },
  { key: "paymentInstructions", fallback: "Payment instructions" },
]);

export const COLUMN_FIELDS = Object.freeze([
  { key: "serviceDate", hint: "When each line’s work was done" },
  { key: "item", hint: "The product / service dropdown" },
  { key: "quantity", hint: "Hide for lump-sum lines; the amount stays editable" },
  { key: "rate", hint: "Hide to show only the line amount" },
  { key: "tax", label: "Taxable checkbox", hint: "Screen only; hidden lines keep their tax setting" },
]);

export const CUSTOM_FIELD_SECTIONS = Object.freeze([
  { value: "invoice", label: "Invoice information" },
  { value: "job", label: "Job site" },
]);

export const MAX_CUSTOM_FIELDS = 12;
export const MAX_SAVED_TEXT = 100;
export const CUSTOM_FIELD_ID_PATTERN = /^field-[a-z0-9-]{1,48}$/u;

const LABEL_KEYS = new Set(LABEL_FIELDS.map(({ key }) => key));
const SAVED_TEXT_ID_PATTERN = /^text-[a-z0-9-]{1,48}$/u;

export const DEFAULT_SAVED_TEXT = Object.freeze([
  {
    id: "text-payment",
    title: "Payment options",
    body: "Please make checks payable to the company name above, or pay by Zelle or bank transfer. Include the invoice number with your payment.",
  },
  {
    id: "text-change-orders",
    title: "Change orders",
    body: "Any work beyond the scope described above requires a written change order and will be billed separately.",
  },
  {
    id: "text-warranty",
    title: "Workmanship warranty",
    body: "Workmanship is warranted for one (1) year from completion. Materials carry the manufacturer’s warranty.",
  },
  {
    id: "text-thanks",
    title: "Thank you",
    body: "Thank you for your business. We appreciate the opportunity to work on your project.",
  },
]);

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cleanText(value, maximum) {
  if (value === null || value === undefined) return "";
  return String(value).trim().slice(0, maximum);
}

function randomSuffix() {
  const random = globalThis.crypto?.randomUUID?.();
  return (random || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`).toLowerCase();
}

export function newCustomFieldId() {
  return `field-${randomSuffix()}`.slice(0, 54);
}

export function newSavedTextId() {
  return `text-${randomSuffix()}`.slice(0, 53);
}

/**
 * Column defaults follow the company's default design so workspaces that hid
 * the service date or product column before this setting existed keep that look.
 */
export function createDefaultLayout(design = {}) {
  return {
    labels: {},
    columns: {
      serviceDate: design?.showServiceDate !== false,
      item: design?.showItem !== false,
      quantity: true,
      rate: true,
      tax: true,
    },
    fields: [],
  };
}

export function normalizeLayout(value, design = {}) {
  const source = isRecord(value) ? value : {};
  const defaults = createDefaultLayout(design);
  const sourceLabels = isRecord(source.labels) ? source.labels : {};
  const sourceColumns = isRecord(source.columns) ? source.columns : {};
  const labels = {};
  for (const [key, label] of Object.entries(sourceLabels)) {
    const text = cleanText(label, 60);
    if (LABEL_KEYS.has(key) && text) labels[key] = text;
  }
  const columns = {};
  for (const key of Object.keys(defaults.columns)) {
    columns[key] = typeof sourceColumns[key] === "boolean" ? sourceColumns[key] : defaults.columns[key];
  }
  const usedIds = new Set();
  const fields = (Array.isArray(source.fields) ? source.fields : [])
    .filter((field) => isRecord(field) && CUSTOM_FIELD_ID_PATTERN.test(field.id) && !usedIds.has(field.id) && usedIds.add(field.id))
    .slice(0, MAX_CUSTOM_FIELDS)
    .map((field) => ({
      id: field.id,
      label: cleanText(field.label, 60) || "Custom field",
      section: field.section === "job" ? "job" : "invoice",
      showOnPdf: typeof field.showOnPdf === "boolean" ? field.showOnPdf : true,
    }));
  return { labels, columns, fields };
}

export function labelFor(layout, key) {
  const custom = layout?.labels?.[key];
  if (custom) return custom;
  return LABEL_FIELDS.find((field) => field.key === key)?.fallback || key;
}

export function normalizeSavedText(value) {
  if (!Array.isArray(value)) return DEFAULT_SAVED_TEXT.map((entry) => ({ ...entry }));
  const usedIds = new Set();
  return value
    .filter((entry) => isRecord(entry) && SAVED_TEXT_ID_PATTERN.test(entry.id) && !usedIds.has(entry.id) && usedIds.add(entry.id))
    .slice(0, MAX_SAVED_TEXT)
    .map((entry) => ({
      id: entry.id,
      title: cleanText(entry.title, 80) || "Saved text",
      body: cleanText(entry.body, 4_000),
    }));
}

/** Adds saved text to whatever is already in a field, separated by a blank line. */
export function appendSavedText(current, body) {
  const existing = String(current || "").trimEnd();
  return existing ? `${existing}\n\n${body}` : body;
}

/** Names saved text from its opening words so saving takes one click. */
export function savedTextTitle(body) {
  const words = String(body || "").trim().split(/\s+/u).filter(Boolean);
  let title = "";
  for (const word of words) {
    const next = title ? `${title} ${word}` : word;
    if (next.length > 40) break;
    title = next;
    if (title.split(" ").length >= 6) break;
  }
  if (!title) return "Saved text";
  return title.length < String(body).trim().length ? `${title}…` : title;
}

/** Custom field values that are filled in, in the order the fields are set up. */
export function filledCustomFields(layout, invoice, section, { pdf = false } = {}) {
  const values = invoice?.customFields || {};
  return (layout?.fields || [])
    .filter((field) => field.section === section && (!pdf || field.showOnPdf))
    .map((field) => ({ ...field, value: values[field.id] || "" }))
    .filter((field) => field.value);
}
