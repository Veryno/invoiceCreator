import Decimal from "decimal.js";

const InvoiceDecimal = Decimal.clone({
  precision: 40,
  rounding: Decimal.ROUND_HALF_UP,
});

const MONEY_PLACES = 2;

function localDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(dateString, days) {
  const date = new Date(`${dateString}T12:00:00`);
  date.setDate(date.getDate() + days);
  return localDateString(date);
}

function asString(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  return String(value).trim();
}

function asNumber(value, fallback = 0) {
  if (value === "" || value === null || value === undefined) return fallback;

  try {
    const decimal = new InvoiceDecimal(value);
    return decimal.isFinite() ? decimal.toNumber() : fallback;
  } catch {
    return fallback;
  }
}

function asBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (value === 1 || value === "1" || value === "true") return true;
  if (value === 0 || value === "0" || value === "false") return false;
  return fallback;
}

function asDecimal(value) {
  try {
    const decimal = new InvoiceDecimal(value ?? 0);
    return decimal.isFinite() ? decimal : new InvoiceDecimal(0);
  } catch {
    return new InvoiceDecimal(0);
  }
}

function rounded(value) {
  return asDecimal(value).toDecimalPlaces(MONEY_PLACES, InvoiceDecimal.ROUND_HALF_UP);
}

function moneyNumber(value) {
  const result = Number(rounded(value).toFixed(MONEY_PLACES));
  return Object.is(result, -0) ? 0 : result;
}

function normalizedCurrency(value, fallback = "USD") {
  const currency = asString(value, fallback).toUpperCase();
  return /^[A-Z]{3}$/.test(currency) ? currency : fallback;
}

function normalizedLocale(value, fallback = "en-US") {
  const locale = asString(value, fallback);

  try {
    new Intl.NumberFormat(locale);
    return locale;
  } catch {
    return fallback;
  }
}

function makeCanonicalDefaults() {
  const issueDate = localDateString();

  return {
    company: {
      name: "",
      email: "",
      phone: "",
      website: "",
      address: "",
      taxId: "",
      logo: "",
    },
    customer: {
      name: "",
      email: "",
      phone: "",
      address: "",
    },
    meta: {
      number: "",
      issueDate,
      dueDate: addDays(issueDate, 30),
      terms: "Net 30",
      poNumber: "",
      currency: "USD",
      locale: "en-US",
      status: "Draft",
    },
    lineItems: [],
    adjustments: {
      discountType: "percent",
      discountValue: 0,
      shipping: 0,
      deposit: 0,
      taxRate: 0,
    },
    content: {
      notes: "",
      paymentInstructions: "",
    },
    design: {
      template: "modern",
      accentColor: "#2563EB",
      font: "Inter",
      paperSize: "Letter",
      showServiceDate: true,
      showItem: true,
    },
  };
}

function makeDefaultData() {
  const issueDate = localDateString();

  return {
    company: {
      name: "Northstar Studio & Build",
      email: "hello@northstarbuild.com",
      phone: "(415) 555-0138",
      website: "northstarbuild.com",
      address: "1800 Montgomery Street\nSan Francisco, CA 94111",
      taxId: "94-3812740",
      logo: "",
    },
    customer: {
      name: "Riverside Property Group",
      email: "accounts@riversideproperty.com",
      phone: "(510) 555-0184",
      address: "420 Harbor Avenue\nOakland, CA 94607",
    },
    meta: {
      number: `INV-${issueDate.slice(0, 4)}-001`,
      issueDate,
      dueDate: addDays(issueDate, 30),
      terms: "Net 30",
      poNumber: "PO-1048",
      currency: "USD",
      locale: "en-US",
      status: "Draft",
    },
    lineItems: [
      {
        id: "line-design",
        serviceDate: issueDate,
        item: "Design consultation",
        description: "Space planning, finish selections, and project specifications",
        quantity: 10,
        rate: 125,
        taxable: true,
      },
      {
        id: "line-materials",
        serviceDate: issueDate,
        item: "Materials & finishes",
        description: "Custom millwork samples and approved finish materials",
        quantity: 1,
        rate: 1850,
        taxable: true,
      },
      {
        id: "line-coordination",
        serviceDate: issueDate,
        item: "Project coordination",
        description: "Vendor scheduling, site coordination, and progress reporting",
        quantity: 6,
        rate: 85,
        taxable: false,
      },
    ],
    adjustments: {
      discountType: "percent",
      discountValue: 5,
      shipping: 65,
      deposit: 500,
      taxRate: 8.25,
    },
    content: {
      notes: "Thank you for choosing Northstar Studio & Build. We appreciate your business.",
      paymentInstructions: "Payment is due within 30 days. Please include the invoice number with your payment.",
    },
    design: {
      template: "modern",
      accentColor: "#2563EB",
      font: "Inter",
      paperSize: "Letter",
      showServiceDate: true,
      showItem: true,
    },
  };
}

/**
 * Creates a normalized line item suitable for an invoice draft.
 */
export function makeLineItem(overrides = {}) {
  const source = overrides && typeof overrides === "object" ? overrides : {};
  const fallbackId = globalThis.crypto?.randomUUID?.() ?? `line-${Date.now()}`;

  return {
    id: asString(source.id, fallbackId),
    serviceDate: asString(source.serviceDate),
    item: asString(source.item),
    description: asString(source.description),
    quantity: asNumber(source.quantity, 1),
    rate: asNumber(source.rate, 0),
    taxable: asBoolean(source.taxable, true),
  };
}

/**
 * Creates an independent copy of a line item with a new stable identity.
 */
export function duplicateLineItem(lineItem = {}) {
  const source = lineItem && typeof lineItem === "object" ? lineItem : {};
  const { id: _discardedId, ...copy } = source;
  return makeLineItem(copy);
}

export function normalizeHexColorInput(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  const digits = trimmed.startsWith("#") ? trimmed.slice(1) : trimmed;
  return /^[0-9a-f]{6}$/i.test(digits) ? `#${digits.toUpperCase()}` : null;
}

function normalizedHexColor(value, fallback = "#2563EB") {
  return normalizeHexColorInput(asString(value, fallback)) || fallback;
}

function colorChannels(hexColor) {
  const value = Number.parseInt(normalizedHexColor(hexColor).slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function relativeLuminance(hexColor) {
  const channels = colorChannels(hexColor).map((channel) => {
    const component = channel / 255;
    return component <= 0.04045
      ? component / 12.92
      : ((component + 0.055) / 1.055) ** 2.4;
  });
  return (0.2126 * channels[0]) + (0.7152 * channels[1]) + (0.0722 * channels[2]);
}

function contrastRatio(first, second) {
  const light = Math.max(relativeLuminance(first), relativeLuminance(second));
  const dark = Math.min(relativeLuminance(first), relativeLuminance(second));
  return (light + 0.05) / (dark + 0.05);
}

/**
 * Chooses readable text for an accent-colored background.
 */
export function getAccentInkColor(accentColor) {
  const accent = normalizedHexColor(accentColor);
  const lightInk = "#FFFFFF";
  const darkInk = "#000000";
  return contrastRatio(accent, lightInk) >= contrastRatio(accent, darkInk)
    ? lightInk
    : darkInk;
}

/**
 * Returns the selected accent when it reads clearly on white, otherwise a
 * progressively darkened version of the same hue for labels and headings.
 */
export function getReadableAccentColor(accentColor) {
  const accent = normalizedHexColor(accentColor);
  if (contrastRatio(accent, "#FFFFFF") >= 4.5) return accent;

  const channels = colorChannels(accent);
  for (let step = 1; step <= 20; step += 1) {
    const factor = 1 - (step * 0.05);
    const candidate = `#${channels
      .map((channel) => Math.max(0, Math.round(channel * factor)).toString(16).padStart(2, "0"))
      .join("")}`.toUpperCase();
    if (contrastRatio(candidate, "#FFFFFF") >= 4.5) return candidate;
  }

  return "#172B2D";
}

/**
 * Returns a fresh, realistic invoice draft. No object references are shared
 * between calls.
 */
export function createDefaultInvoice() {
  return normalizeInvoice(makeDefaultData());
}

/**
 * Coerces a partial invoice into the canonical, serializable invoice shape.
 */
export function normalizeInvoice(input = {}) {
  const defaults = makeCanonicalDefaults();
  const source = input && typeof input === "object" ? input : {};
  const company = source.company && typeof source.company === "object" ? source.company : {};
  const customer = source.customer && typeof source.customer === "object" ? source.customer : {};
  const meta = source.meta && typeof source.meta === "object" ? source.meta : {};
  const adjustments =
    source.adjustments && typeof source.adjustments === "object" ? source.adjustments : {};
  const content = source.content && typeof source.content === "object" ? source.content : {};
  const design = source.design && typeof source.design === "object" ? source.design : {};
  const sourceLineItems = Array.isArray(source.lineItems) ? source.lineItems : defaults.lineItems;
  const discountType = adjustments.discountType === "fixed" ? "fixed" : "percent";
  const accentColor = asString(design.accentColor, defaults.design.accentColor);
  const usedLineIds = new Set();
  const lineItems = sourceLineItems.map((lineItem, index) => {
    const sourceId = asString(lineItem?.id, `line-${index + 1}`) || `line-${index + 1}`;
    let id = sourceId;
    let suffix = 2;
    while (usedLineIds.has(id)) {
      id = `${sourceId}-${suffix}`;
      suffix += 1;
    }
    usedLineIds.add(id);
    return makeLineItem({
      ...(lineItem && typeof lineItem === "object" ? lineItem : {}),
      id,
    });
  });

  return {
    company: {
      name: asString(company.name, defaults.company.name),
      email: asString(company.email, defaults.company.email),
      phone: asString(company.phone, defaults.company.phone),
      website: asString(company.website, defaults.company.website),
      address: asString(company.address, defaults.company.address),
      taxId: asString(company.taxId, defaults.company.taxId),
      logo: asString(company.logo, defaults.company.logo),
    },
    customer: {
      name: asString(customer.name, defaults.customer.name),
      email: asString(customer.email, defaults.customer.email),
      phone: asString(customer.phone, defaults.customer.phone),
      address: asString(customer.address, defaults.customer.address),
    },
    meta: {
      number: asString(meta.number, defaults.meta.number),
      issueDate: asString(meta.issueDate, defaults.meta.issueDate),
      dueDate: asString(meta.dueDate, defaults.meta.dueDate),
      terms: asString(meta.terms, defaults.meta.terms),
      poNumber: asString(meta.poNumber, defaults.meta.poNumber),
      currency: normalizedCurrency(meta.currency, defaults.meta.currency),
      locale: normalizedLocale(meta.locale, defaults.meta.locale),
      status: asString(meta.status, defaults.meta.status),
    },
    lineItems,
    adjustments: {
      discountType,
      discountValue: asNumber(adjustments.discountValue, defaults.adjustments.discountValue),
      shipping: asNumber(adjustments.shipping, defaults.adjustments.shipping),
      deposit: asNumber(adjustments.deposit, defaults.adjustments.deposit),
      taxRate: asNumber(adjustments.taxRate, defaults.adjustments.taxRate),
    },
    content: {
      notes: asString(content.notes, defaults.content.notes),
      paymentInstructions: asString(
        content.paymentInstructions,
        defaults.content.paymentInstructions,
      ),
    },
    design: {
      template: asString(design.template, defaults.design.template),
      accentColor: normalizeHexColorInput(accentColor) || defaults.design.accentColor,
      font: asString(design.font, defaults.design.font),
      paperSize: design.paperSize === "A4" ? "A4" : "Letter",
      showServiceDate: asBoolean(design.showServiceDate, defaults.design.showServiceDate),
      showItem: asBoolean(design.showItem, defaults.design.showItem),
    },
  };
}

/**
 * Calculates all invoice money using decimal arithmetic and HALF_UP rounding.
 * Shipping is not taxable because the invoice schema has no shipping tax flag.
 */
export function calculateInvoice(invoice) {
  const normalized = normalizeInvoice(invoice);
  const calculatedLineItems = normalized.lineItems.map((lineItem) => ({
    ...lineItem,
    amount: moneyNumber(asDecimal(lineItem.quantity).times(asDecimal(lineItem.rate))),
  }));

  const subtotal = calculatedLineItems.reduce(
    (sum, lineItem) => sum.plus(asDecimal(lineItem.amount)),
    new InvoiceDecimal(0),
  );
  const positiveSubtotal = InvoiceDecimal.max(subtotal, 0);
  const requestedDiscount = InvoiceDecimal.max(asDecimal(normalized.adjustments.discountValue), 0);
  const discount = normalized.adjustments.discountType === "percent"
    ? positiveSubtotal.times(InvoiceDecimal.min(requestedDiscount, 100)).dividedBy(100)
    : InvoiceDecimal.min(requestedDiscount, positiveSubtotal);
  const roundedDiscount = rounded(discount);
  const taxableSubtotal = calculatedLineItems.reduce(
    (sum, lineItem) => (lineItem.taxable ? sum.plus(asDecimal(lineItem.amount)) : sum),
    new InvoiceDecimal(0),
  );
  const taxableDiscount = positiveSubtotal.greaterThan(0)
    ? rounded(roundedDiscount.times(taxableSubtotal).dividedBy(positiveSubtotal))
    : new InvoiceDecimal(0);
  const taxableBase = rounded(InvoiceDecimal.max(taxableSubtotal.minus(taxableDiscount), 0));
  const taxRate = InvoiceDecimal.max(asDecimal(normalized.adjustments.taxRate), 0);
  const tax = rounded(taxableBase.times(taxRate).dividedBy(100));
  const shipping = rounded(InvoiceDecimal.max(asDecimal(normalized.adjustments.shipping), 0));
  const deposit = rounded(InvoiceDecimal.max(asDecimal(normalized.adjustments.deposit), 0));
  const total = rounded(subtotal.minus(roundedDiscount).plus(shipping).plus(tax));
  const balance = rounded(total.minus(deposit));

  return {
    lineItems: calculatedLineItems,
    subtotal: moneyNumber(subtotal),
    discount: moneyNumber(roundedDiscount),
    shipping: moneyNumber(shipping),
    taxableSubtotal: moneyNumber(taxableSubtotal),
    taxableDiscount: moneyNumber(taxableDiscount),
    taxableBase: moneyNumber(taxableBase),
    tax: moneyNumber(tax),
    total: moneyNumber(total),
    deposit: moneyNumber(deposit),
    balance: moneyNumber(balance),
  };
}

/**
 * Formats a HALF_UP rounded amount using the requested currency and locale.
 */
export function formatMoney(amount, currency = "USD", locale = "en-US") {
  const safeCurrency = normalizedCurrency(currency);
  const safeLocale = normalizedLocale(locale);
  const value = moneyNumber(amount);

  return new Intl.NumberFormat(safeLocale, {
    style: "currency",
    currency: safeCurrency,
    minimumFractionDigits: MONEY_PLACES,
    maximumFractionDigits: MONEY_PLACES,
  }).format(value);
}

/**
 * Returns actionable issues that should be resolved before a document is
 * presented as a finished PDF. Drafts may remain incomplete while editing.
 */
export function validateInvoiceForExport(invoice) {
  const normalized = normalizeInvoice(invoice);
  const issues = [];
  const requireText = (path, label, value) => {
    if (!String(value || "").trim()) issues.push({ path, label, message: `${label} is required.` });
  };

  requireText("company.name", "Company name", normalized.company.name);
  requireText("customer.name", "Customer name", normalized.customer.name);
  requireText("meta.number", "Invoice number", normalized.meta.number);
  requireText("meta.issueDate", "Issue date", normalized.meta.issueDate);
  requireText("meta.dueDate", "Due date", normalized.meta.dueDate);

  if (!normalized.lineItems.length) {
    issues.push({ path: "lineItems", label: "Line item", message: "Add at least one line item." });
  } else {
    normalized.lineItems.forEach((line, index) => {
      if (!String(line.item || line.description || "").trim()) {
        issues.push({
          path: `lineItems.${index}.description`,
          label: `Line ${index + 1}`,
          message: `Line ${index + 1} needs a product, service, or description.`,
        });
      }
      if (!Number.isFinite(Number(line.quantity)) || Number(line.quantity) === 0) {
        issues.push({
          path: `lineItems.${index}.quantity`,
          label: `Line ${index + 1} quantity`,
          message: `Line ${index + 1} needs a non-zero quantity.`,
        });
      }
      if (!Number.isFinite(Number(line.rate))) {
        issues.push({
          path: `lineItems.${index}.rate`,
          label: `Line ${index + 1} rate`,
          message: `Line ${index + 1} needs a valid rate.`,
        });
      }
    });
  }

  return issues;
}

/**
 * Produces a portable filename segment while retaining readable Unicode text.
 */
export function sanitizeFilenamePart(value) {
  let result = asString(value)
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]+/g, "-")
    .replace(/\s+/g, " ")
    .replace(/-+/g, "-")
    .replace(/^[.\s-]+|[.\s-]+$/g, "")
    .slice(0, 96)
    .replace(/[.\s-]+$/g, "");

  if (!result) result = "invoice";
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(result)) {
    result = `_${result}`.slice(0, 96);
  }

  return result;
}
