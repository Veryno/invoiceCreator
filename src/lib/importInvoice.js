import Papa from "papaparse";
import ExcelJS from "exceljs";
import { normalizeInvoice } from "./invoice.js";

/**
 * Accepted column/header aliases for tabular and flat-JSON imports.
 *
 * Keys are logical import paths. The legacy-friendly `notes`,
 * `paymentInstructions`, and `settings.*` keys are mapped into the current
 * `content`, `adjustments`, and `design` sections of `invoicePatch`. Alias matching is
 * case-insensitive and ignores punctuation, whitespace, underscores, and
 * camel-case differences. Keeping this map exported gives the UI one source
 * of truth for import help and sample-file documentation.
 */
export const FIELD_ALIASES = freezeAliasMap({
  "company.name": [
    "company.name",
    "company",
    "company name",
    "business",
    "business name",
    "seller name",
    "sender name",
    "from name",
  ],
  "company.email": [
    "company.email",
    "company email",
    "business email",
    "seller email",
    "sender email",
    "from email",
  ],
  "company.phone": [
    "company.phone",
    "company phone",
    "business phone",
    "seller phone",
    "sender phone",
    "from phone",
  ],
  "company.website": [
    "company.website",
    "company website",
    "business website",
    "seller website",
    "website",
    "web site",
    "url",
  ],
  "company.address": [
    "company.address",
    "company address",
    "business address",
    "seller address",
    "sender address",
    "from address",
  ],
  "company.taxId": [
    "company.taxId",
    "company tax id",
    "business tax id",
    "tax id",
    "vat number",
    "ein",
  ],
  "company.logo": ["company.logo", "company logo", "logo", "logo url", "logo uri"],
  "customer.name": [
    "customer.name",
    "customer",
    "customer name",
    "client",
    "client name",
    "bill to",
    "billing name",
    "recipient name",
  ],
  "customer.email": [
    "customer.email",
    "customer email",
    "client email",
    "bill to email",
    "billing email",
    "recipient email",
    "email",
  ],
  "customer.phone": [
    "customer.phone",
    "customer phone",
    "client phone",
    "bill to phone",
    "billing phone",
    "recipient phone",
    "phone",
  ],
  "customer.address": [
    "customer.address",
    "customer address",
    "client address",
    "bill to address",
    "billing address",
    "recipient address",
    "address",
  ],
  "meta.number": [
    "meta.number",
    "invoice number",
    "invoice no",
    "invoice num",
    "invoice id",
    "invoice #",
    "number",
  ],
  "meta.issueDate": [
    "meta.issueDate",
    "issue date",
    "issued date",
    "invoice date",
    "date issued",
    "date",
  ],
  "meta.dueDate": [
    "meta.dueDate",
    "due date",
    "payment due",
    "pay by",
  ],
  "meta.terms": [
    "meta.terms",
    "terms",
    "payment terms",
    "invoice terms",
  ],
  "meta.poNumber": [
    "meta.poNumber",
    "po number",
    "po no",
    "po #",
    "purchase order",
    "purchase order number",
  ],
  "meta.currency": [
    "meta.currency",
    "currency",
    "currency code",
    "invoice currency",
  ],
  "meta.locale": ["meta.locale", "locale", "invoice locale", "number locale"],
  "meta.status": ["meta.status", "status", "invoice status"],
  "lineItems.id": ["lineItems.id", "line id", "line item id", "row id", "id"],
  "lineItems.serviceDate": [
    "lineItems.serviceDate",
    "service date",
    "item date",
    "work date",
  ],
  "lineItems.item": [
    "lineItems.item",
    "item",
    "item name",
    "product",
    "product name",
    "service",
    "service name",
    "product/service",
    "sku",
  ],
  "lineItems.description": [
    "lineItems.description",
    "description",
    "item description",
    "service description",
    "details",
    "line description",
  ],
  "lineItems.quantity": [
    "lineItems.quantity",
    "quantity",
    "qty",
    "units",
    "hours",
  ],
  "lineItems.rate": [
    "lineItems.rate",
    "rate",
    "unit rate",
    "unit price",
    "price",
    "unit cost",
    "cost",
    "amount",
  ],
  "lineItems.taxable": [
    "lineItems.taxable",
    "taxable",
    "is taxable",
    "apply tax",
    "tax eligible",
  ],
  notes: ["notes", "note", "invoice notes", "memo", "message"],
  paymentInstructions: [
    "paymentInstructions",
    "payment instructions",
    "how to pay",
    "remittance instructions",
    "bank instructions",
  ],
  "settings.taxRate": [
    "settings.taxRate",
    "tax rate",
    "sales tax rate",
    "invoice tax rate",
  ],
  "settings.discountRate": [
    "settings.discountRate",
    "discount rate",
    "discount percent",
    "discount percentage",
  ],
  "settings.discountAmount": [
    "settings.discountAmount",
    "discount amount",
    "invoice discount",
    "discount",
  ],
  "settings.shipping": [
    "settings.shipping",
    "shipping",
    "shipping amount",
    "delivery fee",
  ],
  "settings.deposit": [
    "settings.deposit",
    "deposit",
    "deposit amount",
    "amount paid",
    "paid amount",
  ],
  "settings.accentColor": [
    "settings.accentColor",
    "accent color",
    "brand color",
    "invoice color",
  ],
  "settings.template": [
    "settings.template",
    "template",
    "invoice template",
    "layout",
  ],
  "settings.logoUrl": [
    "settings.logoUrl",
    "logo url",
    "logo uri",
    "company logo",
  ],
  "settings.showLogo": [
    "settings.showLogo",
    "show logo",
    "display logo",
    "include logo",
  ],
});

export const SUPPORTED_IMPORT_FORMATS = Object.freeze(["csv", "json", "xlsx"]);

const LEGACY_XLS_ERROR = "Legacy XLS is not supported; save as XLSX or CSV.";

const SHARED_PATHS = Object.freeze(
  Object.keys(FIELD_ALIASES).filter((path) => !path.startsWith("lineItems.")),
);
const LINE_PATHS = Object.freeze(
  Object.keys(FIELD_ALIASES).filter((path) => path.startsWith("lineItems.")),
);
const OUTPUT_PATHS = Object.freeze({
  notes: "content.notes",
  paymentInstructions: "content.paymentInstructions",
  "settings.taxRate": "adjustments.taxRate",
  "settings.discountRate": "adjustments.discountValue",
  "settings.discountAmount": "adjustments.discountValue",
  "settings.shipping": "adjustments.shipping",
  "settings.deposit": "adjustments.deposit",
  "settings.accentColor": "design.accentColor",
  "settings.template": "design.template",
  "settings.logoUrl": "company.logo",
  "settings.showLogo": "design.showLogo",
});
const DANGEROUS_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const SKIP = Symbol("skip-import-value");

const NESTED_ALIASES = Object.freeze({
  company: {
    name: ["name", "company name", "business name", "legal name"],
    email: ["email", "email address", "company email"],
    phone: ["phone", "phone number", "telephone", "company phone"],
    website: ["website", "web site", "url", "company website"],
    address: ["address", "company address", "mailing address"],
    taxId: ["taxId", "tax id", "vat number", "ein"],
    logo: ["logo", "company logo", "logo url", "logo uri"],
  },
  customer: {
    name: ["name", "customer name", "client name", "billing name"],
    email: ["email", "email address", "customer email", "client email"],
    phone: ["phone", "phone number", "telephone", "customer phone"],
    address: ["address", "customer address", "billing address", "mailing address"],
  },
  meta: {
    number: ["number", "invoice number", "invoice no", "invoice id", "id"],
    issueDate: ["issueDate", "issue date", "invoice date", "date"],
    dueDate: ["dueDate", "due date", "payment due"],
    terms: ["terms", "payment terms"],
    poNumber: ["poNumber", "po number", "po no", "purchase order"],
    currency: ["currency", "currency code"],
    locale: ["locale", "invoice locale", "number locale"],
    status: ["status", "invoice status"],
  },
});

const SETTING_DEFINITIONS = Object.freeze({
  taxRate: { aliases: ["taxRate", "tax rate", "sales tax rate"], type: "number" },
  discountRate: {
    aliases: ["discountRate", "discount rate", "discount percent"],
    type: "number",
  },
  discountAmount: {
    aliases: ["discountAmount", "discount amount", "discount"],
    type: "number",
  },
  shipping: { aliases: ["shipping", "shipping amount", "delivery fee"], type: "number" },
  deposit: { aliases: ["deposit", "deposit amount", "amount paid"], type: "number" },
  showLogo: { aliases: ["showLogo", "show logo", "display logo"], type: "boolean" },
  accentColor: { aliases: ["accentColor", "accent color", "brand color"], type: "text" },
  template: { aliases: ["template", "invoice template", "layout"], type: "text" },
  logoUrl: { aliases: ["logoUrl", "logo url", "logo uri"], type: "text" },
});

function freezeAliasMap(map) {
  for (const aliases of Object.values(map)) Object.freeze(aliases);
  return Object.freeze(map);
}

function addWarning(warnings, message) {
  if (!warnings.includes(message)) warnings.push(message);
}

function normalizeHeader(value) {
  return String(value ?? "")
    .replace(/([a-z\d])([A-Z])/g, "$1 $2")
    .replace(/[#№]/g, " number ")
    .replace(/&/g, " and ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isPlainObject(value) {
  if (value === null || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isBlank(value) {
  if (value === null || value === undefined) return true;
  return typeof value === "string" ? value.trim() === "" : false;
}

function isFinitePrimitive(value) {
  return typeof value !== "number" || Number.isFinite(value);
}

function looksLikeSpreadsheetFormula(value) {
  const candidate = value.replace(/^[\u0000-\u0020]+/, "");
  if (candidate.startsWith("'")) return false;
  if (/^[=@]/.test(candidate)) return true;
  if (/^[+-]/.test(candidate)) return parseLocalizedNumber(candidate) === undefined;
  return false;
}

/**
 * Neutralizes strings that spreadsheet programs could interpret as formulas.
 * Non-string values are returned unchanged.
 */
export function sanitizeSpreadsheetText(value) {
  if (typeof value !== "string") return value;
  const clean = value.replaceAll("\u0000", "");
  return looksLikeSpreadsheetFormula(clean) ? `'${clean}` : clean;
}

function normalizeText(value, warnings, context, { multiline = false } = {}) {
  if (isBlank(value)) return "";
  if (value instanceof Date && !Number.isNaN(value.valueOf())) {
    return value.toISOString().slice(0, 10);
  }
  if (Array.isArray(value) && multiline) {
    return value
      .map((entry, index) => normalizeText(entry, warnings, `${context} ${index + 1}`))
      .filter(Boolean)
      .join("\n");
  }
  if (typeof value === "object" || typeof value === "function" || typeof value === "symbol") {
    return SKIP;
  }
  if (!isFinitePrimitive(value)) {
    addWarning(warnings, `Ignored a non-finite value in ${context}.`);
    return SKIP;
  }

  const clean = String(value).trim();
  const sanitized = sanitizeSpreadsheetText(clean);
  if (sanitized !== clean) {
    addWarning(warnings, `Sanitized a possible spreadsheet formula in ${context}.`);
  }
  return sanitized;
}

function normalizeDate(value, warnings, context) {
  if (value instanceof Date) {
    if (Number.isNaN(value.valueOf())) {
      addWarning(warnings, `Ignored an invalid date in ${context}.`);
      return SKIP;
    }
    return value.toISOString().slice(0, 10);
  }
  return normalizeText(value, warnings, context);
}

function parseLocalizedNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value !== "string") return undefined;

  let candidate = value.trim();
  if (!candidate) return undefined;

  let negative = false;
  if (/^\(.*\)$/.test(candidate)) {
    negative = true;
    candidate = candidate.slice(1, -1).trim();
  }

  candidate = candidate
    .replace(/[\p{Sc}]/gu, "")
    .replace(/^(?:USD|CAD|EUR|GBP|AUD|NZD|JPY|CNY|INR)\s*/i, "")
    .replace(/\s*(?:USD|CAD|EUR|GBP|AUD|NZD|JPY|CNY|INR)$/i, "")
    .replace(/[\s'’]/g, "")
    .replace(/%$/, "");

  if (!candidate) return undefined;

  const commaCount = (candidate.match(/,/g) || []).length;
  const dotCount = (candidate.match(/\./g) || []).length;

  if (commaCount && dotCount) {
    if (candidate.lastIndexOf(",") > candidate.lastIndexOf(".")) {
      candidate = candidate.replaceAll(".", "").replace(",", ".");
    } else {
      candidate = candidate.replaceAll(",", "");
    }
  } else if (commaCount) {
    if (/^[+-]?\d{1,3}(?:,\d{3})+$/.test(candidate)) {
      candidate = candidate.replaceAll(",", "");
    } else if (commaCount === 1) {
      candidate = candidate.replace(",", ".");
    } else {
      return undefined;
    }
  } else if (dotCount > 1) {
    if (/^[+-]?\d{1,3}(?:\.\d{3})+$/.test(candidate)) {
      candidate = candidate.replaceAll(".", "");
    } else {
      return undefined;
    }
  }

  if (!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(candidate)) return undefined;
  const parsed = Number(candidate);
  if (!Number.isFinite(parsed)) return undefined;
  return negative ? -Math.abs(parsed) : parsed;
}

function normalizeNumber(value, fallback, warnings, context) {
  if (isBlank(value)) return fallback;
  const parsed = parseLocalizedNumber(value);
  if (parsed !== undefined) return parsed;

  const suffix = fallback === undefined ? "ignored the value" : `used ${fallback} instead`;
  addWarning(warnings, `Invalid number in ${context}; ${suffix}.`);
  return fallback === undefined ? SKIP : fallback;
}

function normalizeBoolean(value, fallback, warnings, context) {
  if (isBlank(value)) return fallback;
  if (typeof value === "boolean") return value;
  if (value === 1) return true;
  if (value === 0) return false;

  const normalized = String(value).trim().toLowerCase();
  if (["true", "yes", "y", "1", "on", "x", "taxable"].includes(normalized)) return true;
  if (["false", "no", "n", "0", "off", "non-taxable", "nontaxable", "exempt"].includes(normalized)) {
    return false;
  }

  const suffix = fallback === undefined ? "ignored the value" : `used ${fallback} instead`;
  addWarning(warnings, `Invalid yes/no value in ${context}; ${suffix}.`);
  return fallback === undefined ? SKIP : fallback;
}

function createObjectReader(source) {
  const values = new Map();
  if (!isPlainObject(source)) return values;

  for (const [key, value] of Object.entries(source)) {
    const normalized = normalizeHeader(key);
    if (!normalized) continue;
    if (!values.has(normalized) || isBlank(values.get(normalized))) values.set(normalized, value);
  }
  return values;
}

function readAliases(reader, aliases) {
  for (const alias of aliases) {
    const value = reader.get(normalizeHeader(alias));
    if (!isBlank(value)) return value;
  }
  return undefined;
}

function readPath(source, path) {
  return readAliases(createObjectReader(source), FIELD_ALIASES[path]);
}

function assignPath(target, path, value) {
  const keys = path.split(".");
  let cursor = target;
  for (let index = 0; index < keys.length - 1; index += 1) {
    const key = keys[index];
    if (!isPlainObject(cursor[key])) cursor[key] = {};
    cursor = cursor[key];
  }
  cursor[keys.at(-1)] = value;
}

function formatAddress(value, warnings, context) {
  if (isBlank(value)) return "";
  if (!isPlainObject(value)) return normalizeText(value, warnings, context, { multiline: true });

  const reader = createObjectReader(value);
  const formatted = readAliases(reader, ["formatted", "full", "full address", "display"]);
  if (!isBlank(formatted)) return normalizeText(formatted, warnings, context, { multiline: true });

  const line1 = readAliases(reader, ["line1", "line 1", "address1", "address 1", "street"]);
  const line2 = readAliases(reader, ["line2", "line 2", "address2", "address 2", "suite", "unit"]);
  const city = readAliases(reader, ["city", "town"]);
  const region = readAliases(reader, ["state", "province", "region"]);
  const postal = readAliases(reader, ["postalCode", "postal code", "zip", "zip code"]);
  const country = readAliases(reader, ["country", "country name"]);

  const lines = [line1, line2]
    .map((part, index) => normalizeText(part, warnings, `${context} line ${index + 1}`))
    .filter((part) => part && part !== SKIP);
  const locality = [city, region, postal]
    .map((part) => normalizeText(part, warnings, context))
    .filter((part) => part && part !== SKIP)
    .join(", ");
  if (locality) lines.push(locality);
  const countryText = normalizeText(country, warnings, context);
  if (countryText && countryText !== SKIP) lines.push(countryText);

  if (lines.length) return lines.join("\n");

  return Object.values(value)
    .map((part) => normalizeText(part, warnings, context))
    .filter((part) => part && part !== SKIP)
    .join(", ");
}

function normalizeContact(value, kind, warnings) {
  if (isBlank(value)) return {};
  if (!isPlainObject(value)) {
    const name = normalizeText(value, warnings, `${kind} name`);
    return name === SKIP || !name ? {} : { name };
  }

  const reader = createObjectReader(value);
  const output = {};
  for (const [field, aliases] of Object.entries(NESTED_ALIASES[kind])) {
    const raw = readAliases(reader, aliases);
    if (isBlank(raw)) continue;
    const normalized =
      field === "address"
        ? formatAddress(raw, warnings, `${kind} address`)
        : normalizeText(raw, warnings, `${kind} ${field}`);
    if (normalized !== SKIP && normalized !== "") output[field] = normalized;
  }
  return output;
}

function normalizeMeta(value, warnings) {
  if (!isPlainObject(value)) return {};
  const reader = createObjectReader(value);
  const output = {};

  for (const [field, aliases] of Object.entries(NESTED_ALIASES.meta)) {
    const raw = readAliases(reader, aliases);
    if (isBlank(raw)) continue;
    let normalized = field.endsWith("Date")
      ? normalizeDate(raw, warnings, `invoice ${field}`)
      : normalizeText(raw, warnings, `invoice ${field}`);
    if (field === "currency" && typeof normalized === "string" && /^[a-z]{3}$/i.test(normalized)) {
      normalized = normalized.toUpperCase();
    }
    if (normalized !== SKIP && normalized !== "") output[field] = normalized;
  }
  return output;
}

function sanitizeDeep(value, warnings, context, seen = new WeakSet()) {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return normalizeText(value, warnings, context);
  if (typeof value === "number") {
    if (Number.isFinite(value)) return value;
    addWarning(warnings, `Ignored a non-finite value in ${context}.`);
    return null;
  }
  if (["boolean", "bigint"].includes(typeof value)) {
    return typeof value === "bigint" ? String(value) : value;
  }
  if (value instanceof Date) return normalizeDate(value, warnings, context);
  if (typeof value !== "object") return undefined;
  if (seen.has(value)) {
    addWarning(warnings, `Ignored a circular value in ${context}.`);
    return null;
  }

  seen.add(value);
  if (Array.isArray(value)) {
    const result = value.map((entry, index) => sanitizeDeep(entry, warnings, `${context}[${index}]`, seen));
    seen.delete(value);
    return result;
  }

  const result = {};
  for (const [key, entry] of Object.entries(value)) {
    if (DANGEROUS_KEYS.has(key)) continue;
    const sanitized = sanitizeDeep(entry, warnings, `${context}.${key}`, seen);
    if (sanitized !== undefined && sanitized !== SKIP) result[key] = sanitized;
  }
  seen.delete(value);
  return result;
}

function normalizeSettings(value, warnings) {
  if (!isPlainObject(value)) {
    if (!isBlank(value)) addWarning(warnings, "Ignored settings because they were not an object.");
    return {};
  }

  const output = sanitizeDeep(value, warnings, "settings");
  const reader = createObjectReader(value);

  for (const [field, definition] of Object.entries(SETTING_DEFINITIONS)) {
    const raw = readAliases(reader, definition.aliases);
    if (isBlank(raw)) continue;
    let normalized;
    if (definition.type === "number") {
      normalized = normalizeNumber(raw, undefined, warnings, `settings.${field}`);
    } else if (definition.type === "boolean") {
      normalized = normalizeBoolean(raw, undefined, warnings, `settings.${field}`);
    } else {
      normalized = normalizeText(raw, warnings, `settings.${field}`);
    }
    if (normalized !== SKIP) output[field] = normalized;

    for (const key of Object.keys(output)) {
      if (key !== field && definition.aliases.some((alias) => normalizeHeader(alias) === normalizeHeader(key))) {
        delete output[key];
      }
    }
  }
  return output;
}

function normalizeAdjustments(value, warnings) {
  if (!isPlainObject(value)) {
    if (!isBlank(value)) addWarning(warnings, "Ignored adjustments because they were not an object.");
    return {};
  }

  const reader = createObjectReader(value);
  const output = {};
  const discountType = readAliases(reader, ["discountType", "discount type"]);
  if (!isBlank(discountType)) {
    const normalized = String(discountType).trim().toLowerCase();
    if (["fixed", "flat", "amount", "currency"].includes(normalized)) output.discountType = "fixed";
    else if (["percent", "percentage", "%", "rate"].includes(normalized)) output.discountType = "percent";
    else addWarning(warnings, "Ignored an invalid adjustments.discountType value.");
  }

  for (const [field, aliases] of Object.entries({
    discountValue: ["discountValue", "discount value", "discount amount", "discount"],
    shipping: ["shipping", "shipping amount", "delivery fee"],
    deposit: ["deposit", "deposit amount", "amount paid"],
    taxRate: ["taxRate", "tax rate", "sales tax rate"],
  })) {
    const raw = readAliases(reader, aliases);
    if (isBlank(raw)) continue;
    const normalized = normalizeNumber(raw, undefined, warnings, `adjustments.${field}`);
    if (normalized !== SKIP) output[field] = normalized;
  }
  return output;
}

function normalizeContent(value, warnings) {
  if (!isPlainObject(value)) {
    if (!isBlank(value)) addWarning(warnings, "Ignored content because it was not an object.");
    return {};
  }

  const reader = createObjectReader(value);
  const output = {};
  for (const [field, aliases] of Object.entries({
    notes: ["notes", "note", "invoice notes", "memo"],
    paymentInstructions: [
      "paymentInstructions",
      "payment instructions",
      "how to pay",
      "remittance instructions",
    ],
  })) {
    const raw = readAliases(reader, aliases);
    if (isBlank(raw)) continue;
    const normalized = normalizeText(raw, warnings, `content.${field}`, { multiline: true });
    if (normalized !== SKIP) output[field] = normalized;
  }
  return output;
}

function normalizeDesign(value, warnings) {
  if (!isPlainObject(value)) {
    if (!isBlank(value)) addWarning(warnings, "Ignored design because it was not an object.");
    return {};
  }

  const reader = createObjectReader(value);
  const output = {};
  for (const [field, aliases] of Object.entries({
    template: ["template", "invoice template", "layout"],
    accentColor: ["accentColor", "accent color", "brand color"],
    font: ["font", "font family", "typeface"],
    paperSize: ["paperSize", "paper size", "page size"],
  })) {
    const raw = readAliases(reader, aliases);
    if (isBlank(raw)) continue;
    const normalized = normalizeText(raw, warnings, `design.${field}`);
    if (normalized !== SKIP) output[field] = normalized;
  }
  for (const [field, aliases] of Object.entries({
    showServiceDate: ["showServiceDate", "show service date"],
    showItem: ["showItem", "show item", "show item column"],
  })) {
    const raw = readAliases(reader, aliases);
    if (isBlank(raw)) continue;
    const normalized = normalizeBoolean(raw, undefined, warnings, `design.${field}`);
    if (normalized !== SKIP) output[field] = normalized;
  }
  return output;
}

function applyLegacySettings(patch, settings) {
  const adjustments = {};
  if (settings.taxRate !== undefined) adjustments.taxRate = settings.taxRate;
  if (settings.shipping !== undefined) adjustments.shipping = settings.shipping;
  if (settings.deposit !== undefined) adjustments.deposit = settings.deposit;
  if (settings.discountAmount !== undefined) {
    adjustments.discountType = "fixed";
    adjustments.discountValue = settings.discountAmount;
  } else if (settings.discountRate !== undefined) {
    adjustments.discountType = "percent";
    adjustments.discountValue = settings.discountRate;
  }
  mergeSection(patch, "adjustments", adjustments);

  mergeSection(patch, "design", {
    ...(settings.template !== undefined ? { template: settings.template } : {}),
    ...(settings.accentColor !== undefined ? { accentColor: settings.accentColor } : {}),
  });
  if (settings.logoUrl !== undefined) mergeSection(patch, "company", { logo: settings.logoUrl });
}

function normalizeSharedValue(path, value, warnings, rowNumber) {
  const context = `${path} from row ${rowNumber}`;
  if (path === "company.address" || path === "customer.address") {
    return formatAddress(value, warnings, context);
  }
  if (path === "meta.issueDate" || path === "meta.dueDate") {
    return normalizeDate(value, warnings, context);
  }
  if ([
    "settings.taxRate",
    "settings.discountRate",
    "settings.discountAmount",
    "settings.shipping",
    "settings.deposit",
  ].includes(path)) {
    return normalizeNumber(value, undefined, warnings, context);
  }
  if (path === "settings.showLogo") {
    return normalizeBoolean(value, undefined, warnings, context);
  }
  const normalized = normalizeText(value, warnings, context, {
    multiline: path === "notes" || path === "paymentInstructions",
  });
  if (path === "meta.currency" && typeof normalized === "string" && /^[a-z]{3}$/i.test(normalized)) {
    return normalized.toUpperCase();
  }
  return normalized;
}

function extractSharedFields(rows, warnings) {
  const patch = {};
  for (const path of SHARED_PATHS) {
    for (let index = 0; index < rows.length; index += 1) {
      const value = readPath(rows[index], path);
      if (isBlank(value)) continue;
      const normalized = normalizeSharedValue(path, value, warnings, index + 1);
      if (normalized !== SKIP && normalized !== "") {
        assignPath(patch, OUTPUT_PATHS[path] || path, normalized);
        if (path === "settings.discountRate") assignPath(patch, "adjustments.discountType", "percent");
        if (path === "settings.discountAmount") assignPath(patch, "adjustments.discountType", "fixed");
      }
      break;
    }
  }
  return patch;
}

function normalizeLineItem(row, rowIndex, warnings, usedIds) {
  if (!isPlainObject(row)) {
    addWarning(warnings, `Ignored row ${rowIndex} because it was not an object.`);
    return null;
  }

  const values = Object.fromEntries(LINE_PATHS.map((path) => [path, readPath(row, path)]));
  const hasLineContent = LINE_PATHS.some(
    (path) => path !== "lineItems.id" && !isBlank(values[path]),
  );
  if (!hasLineContent) return null;

  let id = normalizeText(values["lineItems.id"], warnings, `line item id in row ${rowIndex}`);
  if (!id || id === SKIP) id = `imported-${rowIndex}`;
  const baseId = id;
  let suffix = 2;
  while (usedIds.has(id)) {
    id = `${baseId}-${suffix}`;
    suffix += 1;
  }
  if (id !== baseId) addWarning(warnings, `Renamed a duplicate line item id in row ${rowIndex} to "${id}".`);
  usedIds.add(id);

  const serviceDate = normalizeDate(
    values["lineItems.serviceDate"],
    warnings,
    `service date in row ${rowIndex}`,
  );
  const item = normalizeText(values["lineItems.item"], warnings, `item in row ${rowIndex}`);
  const description = normalizeText(
    values["lineItems.description"],
    warnings,
    `description in row ${rowIndex}`,
    { multiline: true },
  );

  return {
    id,
    serviceDate: serviceDate === SKIP ? "" : serviceDate,
    item: item === SKIP ? "" : item,
    description: description === SKIP ? "" : description,
    quantity: normalizeNumber(
      values["lineItems.quantity"],
      1,
      warnings,
      `quantity in row ${rowIndex}`,
    ),
    rate: normalizeNumber(values["lineItems.rate"], 0, warnings, `rate in row ${rowIndex}`),
    taxable: normalizeBoolean(
      values["lineItems.taxable"],
      false,
      warnings,
      `taxable in row ${rowIndex}`,
    ),
  };
}

function normalizeLineItems(rows, warnings) {
  const lineItems = [];
  const usedIds = new Set();
  for (let index = 0; index < rows.length; index += 1) {
    const lineItem = normalizeLineItem(rows[index], index + 1, warnings, usedIds);
    if (lineItem) lineItems.push(lineItem);
  }
  return lineItems;
}

function mergeSection(patch, key, values) {
  if (values && Object.keys(values).length) patch[key] = { ...(patch[key] || {}), ...values };
}

function findOwnValue(source, aliases) {
  if (!isPlainObject(source)) return { present: false, value: undefined };
  const keys = new Map(Object.keys(source).map((key) => [normalizeHeader(key), key]));
  for (const alias of aliases) {
    const key = keys.get(normalizeHeader(alias));
    if (key !== undefined) return { present: true, value: source[key] };
  }
  return { present: false, value: undefined };
}

function normalizeCanonicalInvoice(source, warnings) {
  const patch = extractSharedFields([source], warnings);

  const company = findOwnValue(source, ["company", "business", "seller", "sender"]);
  if (company.present) mergeSection(patch, "company", normalizeContact(company.value, "company", warnings));

  const customer = findOwnValue(source, ["customer", "client", "billTo", "bill to", "recipient"]);
  if (customer.present) mergeSection(patch, "customer", normalizeContact(customer.value, "customer", warnings));

  const meta = findOwnValue(source, ["meta", "invoice meta", "invoice details"]);
  if (meta.present) mergeSection(patch, "meta", normalizeMeta(meta.value, warnings));

  const settings = findOwnValue(source, ["settings", "invoice settings", "preferences"]);
  if (settings.present) applyLegacySettings(patch, normalizeSettings(settings.value, warnings));

  const adjustments = findOwnValue(source, ["adjustments", "invoice adjustments"]);
  if (adjustments.present) {
    mergeSection(patch, "adjustments", normalizeAdjustments(adjustments.value, warnings));
  }

  const content = findOwnValue(source, ["content", "invoice content", "copy"]);
  if (content.present) mergeSection(patch, "content", normalizeContent(content.value, warnings));

  const design = findOwnValue(source, ["design", "invoice design", "appearance"]);
  if (design.present) mergeSection(patch, "design", normalizeDesign(design.value, warnings));

  const notes = findOwnValue(source, ["notes", "note", "memo", "message"]);
  if (notes.present) {
    const normalized = normalizeText(notes.value, warnings, "notes", { multiline: true });
    if (normalized !== SKIP) mergeSection(patch, "content", { notes: normalized });
  }

  const paymentInstructions = findOwnValue(source, [
    "paymentInstructions",
    "payment instructions",
    "how to pay",
    "remittance instructions",
  ]);
  if (paymentInstructions.present) {
    const normalized = normalizeText(
      paymentInstructions.value,
      warnings,
      "payment instructions",
      { multiline: true },
    );
    if (normalized !== SKIP) {
      mergeSection(patch, "content", { paymentInstructions: normalized });
    }
  }

  const lineItems = findOwnValue(source, ["lineItems", "line items", "invoiceItems", "items", "lines"]);
  if (lineItems.present) {
    if (Array.isArray(lineItems.value)) {
      patch.lineItems = normalizeLineItems(lineItems.value, warnings);
    } else if (!isBlank(lineItems.value)) {
      addWarning(warnings, "Ignored lineItems because it was not an array.");
    }
  } else {
    const singleLine = normalizeLineItems([source], warnings);
    if (singleLine.length) patch.lineItems = singleLine;
  }

  return patch;
}

function normalizeCanonicalSource(source, warnings) {
  const schemaVersion = findOwnValue(source, ["schemaVersion", "schema version"]);
  if (!schemaVersion.present) return normalizeCanonicalInvoice(source, warnings);

  if (Number(schemaVersion.value) !== 1) {
    addWarning(
      warnings,
      `Invoice Studio schema version ${String(schemaVersion.value)} is not supported; imported compatible fields only.`,
    );
    return normalizeCanonicalInvoice(source, warnings);
  }

  const sanitized = sanitizeDeep(source, warnings, "invoice backup");
  if (!isPlainObject(sanitized)) return {};
  delete sanitized.schemaVersion;
  return normalizeInvoice(sanitized);
}

function hasRecognizedData(patch) {
  return Object.keys(patch).some((key) => {
    const value = patch[key];
    return Array.isArray(value) ? value.length > 0 : !isPlainObject(value) || Object.keys(value).length > 0;
  });
}

function normalizeFlatRows(rows, warnings) {
  const objectRows = [];
  rows.forEach((row, index) => {
    if (isPlainObject(row)) objectRows.push(row);
    else addWarning(warnings, `Ignored row ${index + 1} because it was not an object.`);
  });

  const patch = extractSharedFields(objectRows, warnings);
  const lineItems = normalizeLineItems(objectRows, warnings);
  if (lineItems.length) patch.lineItems = lineItems;
  if (!hasRecognizedData(patch)) addWarning(warnings, "No recognized invoice fields were found.");
  return patch;
}

function looksLikeCanonicalInvoice(value) {
  if (!isPlainObject(value)) return false;
  const entries = new Map(Object.entries(value).map(([key, entry]) => [normalizeHeader(key), entry]));
  return [
    ["company", (entry) => isPlainObject(entry)],
    ["customer", (entry) => isPlainObject(entry)],
    ["meta", (entry) => isPlainObject(entry)],
    ["settings", (entry) => isPlainObject(entry)],
    ["adjustments", (entry) => isPlainObject(entry)],
    ["content", (entry) => isPlainObject(entry)],
    ["design", (entry) => isPlainObject(entry)],
    ["line items", (entry) => Array.isArray(entry)],
    ["invoice items", (entry) => Array.isArray(entry)],
  ].some(([key, predicate]) => entries.has(key) && predicate(entries.get(key)));
}

function normalizeJsonValue(value, warnings) {
  if (Array.isArray(value)) {
    if (!value.length) {
      addWarning(warnings, "The JSON array was empty.");
      return { invoicePatch: {}, rowCount: 0, mergeStrategy: "patch" };
    }
    if (looksLikeCanonicalInvoice(value[0])) {
      if (value.length > 1) {
        addWarning(warnings, `The JSON contained ${value.length} invoices; only the first was imported.`);
      }
      return {
        invoicePatch: normalizeCanonicalSource(value[0], warnings),
        rowCount: 1,
        mergeStrategy: "replace",
      };
    }
    return {
      invoicePatch: normalizeFlatRows(value, warnings),
      rowCount: value.length,
      mergeStrategy: "patch",
    };
  }

  if (!isPlainObject(value)) {
    throw new TypeError("JSON invoice data must be an object or an array.");
  }

  const wrappedInvoice = findOwnValue(value, ["invoice"]);
  if (wrappedInvoice.present && isPlainObject(wrappedInvoice.value)) {
    return {
      invoicePatch: normalizeCanonicalSource(wrappedInvoice.value, warnings),
      rowCount: 1,
      mergeStrategy: "replace",
    };
  }

  const wrappedInvoices = findOwnValue(value, ["invoices"]);
  if (wrappedInvoices.present && Array.isArray(wrappedInvoices.value)) {
    if (!wrappedInvoices.value.length) {
      addWarning(warnings, "The invoices array was empty.");
      return { invoicePatch: {}, rowCount: 0, mergeStrategy: "patch" };
    }
    if (wrappedInvoices.value.length > 1) {
      addWarning(
        warnings,
        `The JSON contained ${wrappedInvoices.value.length} invoices; only the first was imported.`,
      );
    }
    return {
      invoicePatch: normalizeCanonicalSource(wrappedInvoices.value[0], warnings),
      rowCount: 1,
      mergeStrategy: "replace",
    };
  }

  const wrappedRows = findOwnValue(value, ["rows", "data"]);
  if (wrappedRows.present && Array.isArray(wrappedRows.value)) {
    return {
      invoicePatch: normalizeFlatRows(wrappedRows.value, warnings),
      rowCount: wrappedRows.value.length,
      mergeStrategy: "patch",
    };
  }

  if (looksLikeCanonicalInvoice(value)) {
    return {
      invoicePatch: normalizeCanonicalSource(value, warnings),
      rowCount: 1,
      mergeStrategy: "replace",
    };
  }
  return {
    invoicePatch: normalizeFlatRows([value], warnings),
    rowCount: 1,
    mergeStrategy: "patch",
  };
}

function rowHasData(row) {
  return isPlainObject(row) && Object.values(row).some((value) => !isBlank(value));
}

function parseCsv(text, warnings) {
  const parsed = Papa.parse(text.replace(/^\uFEFF/, ""), {
    header: true,
    skipEmptyLines: "greedy",
    dynamicTyping: false,
    transformHeader: (header) => header.trim(),
  });

  for (const error of parsed.errors) {
    const row = Number.isInteger(error.row) ? ` on CSV row ${error.row + 1}` : "";
    addWarning(warnings, `${error.message}${row}.`);
  }
  if (parsed.meta?.renamedHeaders) {
    addWarning(warnings, "Duplicate CSV headers were renamed before import.");
  }

  return parsed.data.filter(rowHasData);
}

function excelFormula(cell) {
  const value = cell.value;
  if (!value || typeof value !== "object" || value instanceof Date) return "";
  if (typeof value.formula === "string") return value.formula;
  if (!value.sharedFormula) return "";

  try {
    if (typeof cell.formula === "string" && cell.formula) return cell.formula;
  } catch {
    // ExcelJS cannot expand a shared formula if its master cell is unavailable.
  }
  return `[shared formula ${value.sharedFormula}]`;
}

function readExcelCellValue(cell, warnings) {
  const value = cell.value;
  if (value === null || value === undefined) return "";

  const formula = excelFormula(cell);
  if (formula) {
    addWarning(warnings, `Sanitized a spreadsheet formula in cell ${cell.address}.`);
    return sanitizeSpreadsheetText(`=${formula}`);
  }

  if (value instanceof Date) return value;
  if (typeof value !== "object") return value;

  if (Array.isArray(value.richText)) {
    return value.richText.map((part) => part?.text || "").join("");
  }
  if (typeof value.text === "string") return value.text;
  if (value.error) {
    addWarning(warnings, `Ignored spreadsheet error ${value.error} in cell ${cell.address}.`);
    return "";
  }

  return cell.text || "";
}

function excelHeader(value) {
  if (value instanceof Date && !Number.isNaN(value.valueOf())) return value.toISOString().slice(0, 10);
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

async function parseWorkbook(arrayBuffer, warnings) {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(arrayBuffer);
  } catch (error) {
    throw new Error(`Unable to read the XLSX spreadsheet: ${error.message}`, { cause: error });
  }

  if (!workbook.worksheets.length) throw new Error("The spreadsheet does not contain a worksheet.");
  if (workbook.worksheets.length > 1) {
    addWarning(warnings, "Only the first worksheet was imported.");
  }

  const worksheet = workbook.worksheets[0];
  const columnCount = worksheet.columnCount;
  const headerRow = worksheet.getRow(1);
  const headers = [];
  const headerCounts = new Map();

  for (let column = 1; column <= columnCount; column += 1) {
    const header = excelHeader(readExcelCellValue(headerRow.getCell(column), warnings));
    if (!header) {
      headers[column] = "";
      continue;
    }

    const normalized = normalizeHeader(header);
    const count = (headerCounts.get(normalized) || 0) + 1;
    headerCounts.set(normalized, count);
    headers[column] = count === 1 ? header : `${header} (${count})`;
    if (count === 2) addWarning(warnings, "Duplicate XLSX headers were renamed before import.");
  }

  if (!headers.some(Boolean)) {
    addWarning(warnings, "The first worksheet did not contain a header row.");
    return [];
  }

  const rows = [];
  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const output = {};
    for (let column = 1; column <= columnCount; column += 1) {
      const value = readExcelCellValue(row.getCell(column), warnings);
      const header = headers[column];
      if (header) output[header] = value;
    }
    if (rowHasData(output)) rows.push(output);
  });
  return rows;
}

function extensionOf(fileName) {
  const match = String(fileName || "").toLowerCase().match(/\.([a-z0-9]+)$/);
  return match?.[1] || "";
}

function normalizeRequestedFormat(format) {
  if (!format) return "";
  const normalized = String(format).toLowerCase().replace(/^\./, "");
  if (normalized === "xls") throw new TypeError(LEGACY_XLS_ERROR);
  if (normalized === "excel" || normalized === "spreadsheet") return "xlsx";
  if (!SUPPORTED_IMPORT_FORMATS.includes(normalized)) {
    throw new TypeError(`Unsupported invoice import format: ${format}`);
  }
  return normalized;
}

function hasXlsxMagic(bytes) {
  return bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

function hasLegacyXlsMagic(bytes) {
  const signature = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
  return signature.every((byte, index) => bytes[index] === byte);
}

function decodeText(arrayBuffer) {
  return new TextDecoder("utf-8").decode(arrayBuffer).replace(/^\uFEFF/, "");
}

function detectFormat({ requestedFormat, fileName, mimeType, arrayBuffer, text }) {
  if (requestedFormat) return requestedFormat;

  const extension = extensionOf(fileName);
  if (extension === "xls") throw new TypeError(LEGACY_XLS_ERROR);
  if (SUPPORTED_IMPORT_FORMATS.includes(extension)) return extension;

  if (arrayBuffer) {
    const bytes = new Uint8Array(arrayBuffer, 0, Math.min(arrayBuffer.byteLength, 8));
    if (hasLegacyXlsMagic(bytes)) throw new TypeError(LEGACY_XLS_ERROR);
    if (hasXlsxMagic(bytes)) return "xlsx";
  }

  const mime = String(mimeType || "").toLowerCase();
  if (mime.includes("json")) return "json";
  if (mime.includes("csv")) return "csv";
  if (mime.includes("spreadsheetml")) return "xlsx";
  if (mime.includes("excel")) throw new TypeError(LEGACY_XLS_ERROR);

  const sample = String(text || "").trimStart();
  return sample.startsWith("{") || sample.startsWith("[") ? "json" : "csv";
}

function exactArrayBuffer(value) {
  if (value instanceof ArrayBuffer) return value;
  if (ArrayBuffer.isView(value)) {
    return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
  }
  return null;
}

async function readImportSource(input, options) {
  const requestedFormat = normalizeRequestedFormat(options.format);
  const isFileLike = input && typeof input === "object" && typeof input.arrayBuffer === "function";

  if (isPlainObject(input) && !isFileLike) {
    return { format: requestedFormat || "json", jsonValue: input };
  }
  if (Array.isArray(input)) return { format: requestedFormat || "json", jsonValue: input };

  let fileName = options.fileName || "";
  let mimeType = options.mimeType || "";
  let arrayBuffer = exactArrayBuffer(input);
  let text = typeof input === "string" ? input : "";

  if (isFileLike) {
    fileName ||= input.name || "";
    mimeType ||= input.type || "";
    arrayBuffer = await input.arrayBuffer();
  }

  if (!arrayBuffer && !text) {
    throw new TypeError("Invoice import input must be a File, Blob, ArrayBuffer, typed array, string, object, or array.");
  }
  if (!text && arrayBuffer) text = decodeText(arrayBuffer);

  const format = detectFormat({ requestedFormat, fileName, mimeType, arrayBuffer, text });
  return { format, fileName, arrayBuffer, text };
}

/**
 * Imports one invoice from CSV, XLSX, or JSON data.
 *
 * `input` may be a browser File/Blob, ArrayBuffer, typed array, raw string, or
 * already-parsed JSON value. For an ambiguous ArrayBuffer, pass
 * `{ fileName: "invoice.csv" }` or `{ format: "csv" }`; otherwise magic bytes
 * and content are used to detect the format.
 *
 * `rowCount` is the number of tabular/flat-JSON source rows considered. A
 * canonical invoice object (or the first object in an invoice array) counts as
 * one source record. `mergeStrategy` is `"replace"` for canonical JSON backups
 * and `"patch"` for row-based CSV, XLSX, and flat JSON imports.
 */
export async function importInvoice(input, options = {}) {
  const warnings = [];
  const source = await readImportSource(input, options);
  let normalized;

  if (source.format === "json") {
    let value = source.jsonValue;
    if (value === undefined) {
      try {
        value = JSON.parse(source.text.replace(/^\uFEFF/, ""));
      } catch (error) {
        throw new Error(`Unable to parse the JSON invoice: ${error.message}`, { cause: error });
      }
    }
    normalized = normalizeJsonValue(value, warnings);
  } else if (source.format === "csv") {
    const rows = parseCsv(source.text, warnings);
    normalized = {
      invoicePatch: normalizeFlatRows(rows, warnings),
      rowCount: rows.length,
      mergeStrategy: "patch",
    };
  } else {
    if (!source.arrayBuffer) {
      throw new TypeError("XLSX imports require a File, Blob, ArrayBuffer, or typed array.");
    }
    const rows = await parseWorkbook(source.arrayBuffer, warnings);
    normalized = {
      invoicePatch: normalizeFlatRows(rows, warnings),
      rowCount: rows.length,
      mergeStrategy: "patch",
    };
  }

  return {
    invoicePatch: normalized.invoicePatch,
    warnings,
    rowCount: normalized.rowCount,
    mergeStrategy: normalized.mergeStrategy,
  };
}

export const importInvoiceFile = importInvoice;
export default importInvoice;
