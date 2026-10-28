import { calculateInvoice, formatMoney } from "./invoice.js";

function formatDate(value, locale) {
  if (!value) return "";
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale || "en-US", { month: "long", day: "numeric", year: "numeric" }).format(date);
}

/** Values available as {placeholders} in email subjects and messages. */
export function emailPlaceholders(invoice) {
  const totals = calculateInvoice(invoice);
  const money = (value) => formatMoney(value, invoice.meta.currency, invoice.meta.locale);
  return {
    number: invoice.meta.number || "Draft",
    company: invoice.company.name || "our team",
    customer: invoice.customer.name || "there",
    job: invoice.job.name || invoice.job.address.split("\n")[0] || "your project",
    total: money(totals.total),
    balance: money(totals.balance),
    dueDate: formatDate(invoice.meta.dueDate, invoice.meta.locale) || "on receipt",
  };
}

export function fillEmailTemplate(template, invoice) {
  const values = emailPlaceholders(invoice);
  return String(template || "").replace(/\{(\w+)\}/g, (match, key) => (
    Object.hasOwn(values, key) ? values[key] : match
  ));
}

export function splitEmailList(value) {
  return String(value || "")
    .split(/[,;\n]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

const EMAIL_PATTERN = /^[^\s@<>()[\],;:"]+@[^\s@<>()[\],;:"]+\.[^\s@<>()[\],;:"]+$/u;

export function invalidEmails(value) {
  return splitEmailList(value).filter((entry) => !EMAIL_PATTERN.test(entry));
}

/** A fingerprint of what the customer will receive, so edits after a test are noticed. */
export function emailFingerprint({ invoice, subject, message }) {
  return JSON.stringify([calculateInvoice(invoice).total, invoice.meta.number, invoice.customer.name, subject, message]);
}
