import ExcelJS from "exceljs";
import Papa from "papaparse";
import { sanitizeSpreadsheetText } from "./importInvoice.js";
import { createInvoiceInWorkspace, upsertWorkspaceRecord } from "./workspace.js";

/**
 * Reads the files QuickBooks Online and QuickBooks Desktop produce from their
 * built-in "Export to Excel/CSV" buttons:
 *
 * - Customer lists (Sales → Customers → Export, or Customer Contact List).
 * - Transaction detail reports that include line items, such as
 *   "Sales by Customer Detail", "Sales by Product/Service Detail",
 *   "Invoices and Received Payments", or "Transaction List by Customer".
 *
 * Those reports start with title rows, group rows under a customer or product
 * heading, and end each group with a "Total for …" row. This module finds the
 * real header row, carries group headings down, and skips totals.
 */

const MAX_HEADER_SCAN = 30;

const COLUMN_ALIASES = Object.freeze({
  customer: ["customer", "customer name", "customer full name", "name", "display name", "customer display name", "client", "customer:job", "customer job", "full name"],
  company: ["company", "company name"],
  email: ["email", "email address", "main email", "e-mail", "customer email"],
  phone: ["phone", "phone numbers", "main phone", "phone number", "mobile", "work phone"],
  billingAddress: ["billing address", "bill to", "bill address", "address"],
  street: ["street address", "billing street", "bill street", "street", "billing address line 1", "address line 1", "bill to 1"],
  street2: ["billing address line 2", "address line 2", "bill to 2"],
  city: ["city", "billing city", "bill city"],
  state: ["state", "billing state", "bill state", "province", "state/province"],
  zip: ["zip", "zip code", "billing zip", "postal code", "billing zip code", "bill zip"],
  country: ["country", "billing country", "bill country"],
  shippingAddress: ["shipping address", "ship to", "ship address", "job site", "job address", "location"],
  notes: ["notes", "note"],
  openBalance: ["open balance"],
  date: ["date", "invoice date", "transaction date", "txn date"],
  type: ["transaction type", "type", "txn type"],
  number: ["num", "no", "number", "invoice no", "invoice number", "invoice #", "ref no", "doc num"],
  dueDate: ["due date"],
  terms: ["terms"],
  product: ["product/service", "product service", "item", "product", "service", "product/service name", "item name"],
  description: ["memo/description", "memo description", "description", "memo", "line description", "item description"],
  quantity: ["qty", "quantity"],
  rate: ["sales price", "rate", "price", "unit price"],
  amount: ["amount", "line amount", "total amount", "total"],
  taxable: ["taxable", "tax", "sales tax"],
  poNumber: ["p.o. number", "po number", "po", "p.o. no.", "purchase order"],
  status: ["status", "payment status"],
});

const CUSTOMER_COLUMNS = new Set(["customer", "company", "email", "phone", "billingAddress", "street", "city", "zip"]);
const LINE_COLUMNS = new Set(["date", "number", "product", "description", "quantity", "rate", "amount", "type"]);

function normalizeHeader(value) {
  return String(value ?? "")
    .replace(/ /g, " ")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

const ALIAS_LOOKUP = (() => {
  const lookup = new Map();
  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    for (const alias of aliases) {
      if (!lookup.has(alias)) lookup.set(alias, field);
    }
  }
  return lookup;
})();

function cellText(value) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return sanitizeSpreadsheetText(String(value)).replace(/ /g, " ").trim();
}

function columnsFor(headerRow) {
  const columns = {};
  headerRow.forEach((value, index) => {
    const field = ALIAS_LOOKUP.get(normalizeHeader(value));
    if (field && columns[field] === undefined) columns[field] = index;
  });
  return columns;
}

/** Picks the row within the first lines that names the most known columns. */
export function findHeaderRow(matrix) {
  let best = { index: -1, score: 0, columns: {} };
  matrix.slice(0, MAX_HEADER_SCAN).forEach((row, index) => {
    const columns = columnsFor(row || []);
    const score = Object.keys(columns).length;
    if (score > best.score) best = { index, score, columns };
  });
  return best.score >= 2 ? best : null;
}

function parseMoney(value) {
  const text = cellText(value);
  if (!text) return null;
  const negative = /^\(.*\)$/.test(text) || text.startsWith("-");
  const digits = text.replace(/[^0-9.]/g, "");
  if (!digits || !/^\d*\.?\d+$/.test(digits)) return null;
  const parsed = Number(digits);
  if (!Number.isFinite(parsed)) return null;
  return negative ? -parsed : parsed;
}

function parseDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const text = cellText(value);
  if (!text) return "";
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const us = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(text);
  if (us) {
    const year = us[3].length === 2 ? `20${us[3]}` : us[3];
    return `${year}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}`;
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
}

function joinAddress(parts) {
  const [street, street2, city, state, zip, country] = parts.map((part) => cellText(part));
  const cityLine = [city, [state, zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return [street, street2, cityLine, country && !/^(us|usa|united states)$/i.test(country) ? country : ""]
    .filter(Boolean)
    .join("\n");
}

function isTotalRow(text) {
  return /^(total\b|total for\b|grand total\b)/i.test(text);
}

/** A grouping row has text in the first cell only (QuickBooks section heading). */
function groupHeading(row) {
  const values = (row || []).map(cellText);
  const filled = values.map((value, index) => (value ? index : -1)).filter((index) => index >= 0);
  if (filled.length !== 1 || filled[0] > 1) return null;
  const text = values[filled[0]];
  if (isTotalRow(text)) return null;
  return text;
}

function readValue(row, columns, field) {
  return columns[field] === undefined ? "" : row[columns[field]];
}

function customerFromRow(row, columns, groupName) {
  const name = cellText(readValue(row, columns, "customer")) || groupName || cellText(readValue(row, columns, "company"));
  const address = cellText(readValue(row, columns, "billingAddress"))
    || joinAddress(["street", "street2", "city", "state", "zip", "country"].map((field) => readValue(row, columns, field)));
  // QuickBooks Desktop writes sub-customers (jobs) as "Customer:Job".
  const [customerName, ...jobParts] = name.replace(/\s*\(deleted\)\s*$/i, "").split(":");
  return {
    name: customerName.trim(),
    jobName: jobParts.join(":").trim(),
    email: cellText(readValue(row, columns, "email")).split(/[,;\s]+/)[0] || "",
    phone: cellText(readValue(row, columns, "phone")).replace(/^(phone|mobile|work):\s*/i, ""),
    address,
    notes: cellText(readValue(row, columns, "notes")),
  };
}

function detectKind(columns) {
  const lineScore = [...LINE_COLUMNS].filter((field) => columns[field] !== undefined).length;
  const hasLineMoney = columns.amount !== undefined || columns.rate !== undefined || columns.openBalance !== undefined;
  if (hasLineMoney && (columns.number !== undefined || columns.date !== undefined) && lineScore >= 3) return "transactions";
  const customerScore = [...CUSTOMER_COLUMNS].filter((field) => columns[field] !== undefined).length;
  if (customerScore >= 2 || columns.customer !== undefined) return "customers";
  return null;
}

function parseCustomerList(rows, columns) {
  const customers = [];
  const seen = new Set();
  let skipped = 0;
  for (const row of rows) {
    if (groupHeading(row)) continue;
    const firstText = cellText(row?.find((value) => cellText(value)));
    if (isTotalRow(firstText)) continue;
    const customer = customerFromRow(row, columns, "");
    if (!customer.name) {
      skipped += 1;
      continue;
    }
    const key = customer.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    customers.push(customer);
  }
  return { customers, skipped };
}

function parseTransactions(rows, columns) {
  const invoices = new Map();
  const customers = new Map();
  let group = "";
  let skipped = 0;
  let nonInvoice = 0;

  for (const row of rows) {
    const heading = groupHeading(row);
    if (heading) {
      group = heading;
      continue;
    }
    const firstText = cellText(row?.find((value) => cellText(value)));
    if (!firstText || isTotalRow(firstText)) continue;

    const type = cellText(readValue(row, columns, "type"));
    if (type && !/invoice/i.test(type)) {
      nonInvoice += 1;
      continue;
    }
    const customer = customerFromRow(row, columns, columns.customer === undefined ? group : "");
    const productColumnMissing = columns.product === undefined;
    const product = cellText(readValue(row, columns, "product")) || (productColumnMissing && columns.customer !== undefined ? group : "");
    const description = cellText(readValue(row, columns, "description"));
    const openBalance = parseMoney(readValue(row, columns, "openBalance"));
    // Open-invoice reports carry only the unpaid balance; use it as the line
    // amount when no other money column exists.
    const balanceOnly = columns.amount === undefined && columns.rate === undefined;
    const amount = balanceOnly ? openBalance : parseMoney(readValue(row, columns, "amount"));
    let quantity = parseMoney(readValue(row, columns, "quantity"));
    let rate = parseMoney(readValue(row, columns, "rate"));
    if (amount === null && rate === null) {
      skipped += 1;
      continue;
    }
    if (quantity === null || quantity === 0) quantity = rate && amount ? Number((amount / rate).toFixed(4)) || 1 : 1;
    if (rate === null) rate = Number(((amount || 0) / quantity).toFixed(6));
    const number = cellText(readValue(row, columns, "number"));
    const date = parseDate(readValue(row, columns, "date"));
    const key = number || `${customer.name}|${date}`;
    if (!invoices.has(key)) {
      invoices.set(key, {
        customer: { name: customer.name, email: customer.email, phone: customer.phone, address: customer.address },
        job: { name: customer.jobName, address: cellText(readValue(row, columns, "shippingAddress")), info: "" },
        meta: {
          ...(number ? { number } : {}),
          issueDate: date,
          dueDate: parseDate(readValue(row, columns, "dueDate")) || date,
          terms: cellText(readValue(row, columns, "terms")),
          poNumber: cellText(readValue(row, columns, "poNumber")),
          status: "sent",
        },
        lineItems: [],
        adjustments: { taxRate: 0 },
        openBalance,
      });
    }
    const invoice = invoices.get(key);
    invoice.lineItems.push({
      serviceDate: date,
      item: product,
      description: description || (product ? "" : balanceOnly ? "Open balance" : "Imported line"),
      quantity,
      rate,
      taxable: /^(y|yes|true|tax|1)$/i.test(cellText(readValue(row, columns, "taxable"))),
    });
    if (customer.name && !customers.has(customer.name.toLowerCase())) {
      customers.set(customer.name.toLowerCase(), customer);
    }
  }

  const result = [...invoices.values()].map(({ openBalance, ...invoice }) => ({
    ...invoice,
    meta: {
      ...invoice.meta,
      terms: invoice.meta.terms || undefined,
      status: openBalance === 0 ? "paid" : invoice.meta.status,
    },
  }));
  return { invoices: result, customers: [...customers.values()], skipped, nonInvoice };
}

/** Parses a QuickBooks export already read into rows of cell values. */
export function parseQuickBooksMatrix(matrix, fileName = "QuickBooks export") {
  const header = findHeaderRow(matrix);
  if (!header) {
    throw new Error(`${fileName} doesn’t look like a QuickBooks customer list or sales detail report.`);
  }
  const kind = detectKind(header.columns);
  if (!kind) {
    throw new Error(`${fileName} has no customer or invoice line columns that Invoice Studio recognizes.`);
  }
  const rows = matrix.slice(header.index + 1);
  if (kind === "customers") {
    const { customers, skipped } = parseCustomerList(rows, header.columns);
    return { kind, fileName, customers, invoices: [], skipped, nonInvoice: 0 };
  }
  return { kind, fileName, ...parseTransactions(rows, header.columns) };
}

async function readMatrix(file) {
  const name = String(file?.name || "");
  const lower = name.toLowerCase();
  if (lower.endsWith(".xls")) {
    throw new Error("Save legacy .xls exports as .xlsx or .csv in Excel, then import that file.");
  }
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 4));
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  if (isZip || lower.endsWith(".xlsx")) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const worksheet = workbook.worksheets[0];
    if (!worksheet) throw new Error(`${name} has no worksheet.`);
    const matrix = [];
    worksheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
      matrix[rowNumber - 1] = Array.from({ length: worksheet.columnCount }, (_, index) => {
        const value = row.getCell(index + 1).value;
        if (value && typeof value === "object" && !(value instanceof Date)) {
          if (Array.isArray(value.richText)) return value.richText.map((part) => part.text).join("");
          if ("result" in value) return value.result;
          if (typeof value.text === "string") return value.text;
        }
        return value;
      });
    });
    return Array.from(matrix, (row) => row || []);
  }
  const text = new TextDecoder("utf-8").decode(buffer).replace(/^﻿/, "");
  return Papa.parse(text, { header: false, skipEmptyLines: false }).data;
}

function lineDetail(invoice) {
  return invoice.lineItems.filter((line) => line.item).length * 1000 + invoice.lineItems.length;
}

/**
 * Combines the same invoice found in two reports: line items come from the
 * detail report (Sales by Customer Detail), while due date, terms, and paid
 * status come from a summary report (Invoice List) when one is included.
 */
export function mergeInvoicesByNumber(invoices) {
  const merged = [];
  const byNumber = new Map();
  for (const invoice of invoices) {
    const number = String(invoice.meta.number || "").trim().toLowerCase();
    if (!number) {
      merged.push(invoice);
      continue;
    }
    const existing = byNumber.get(number);
    if (!existing) {
      const copy = { ...invoice, meta: { ...invoice.meta } };
      byNumber.set(number, copy);
      merged.push(copy);
      continue;
    }
    const [detail, summary] = lineDetail(invoice) > lineDetail(existing) ? [invoice, existing] : [existing, invoice];
    const dueFrom = [summary, detail].find((entry) => entry.meta.dueDate && entry.meta.dueDate !== entry.meta.issueDate);
    Object.assign(existing, {
      customer: detail.customer.name ? detail.customer : summary.customer,
      job: detail.job.name || detail.job.address ? detail.job : summary.job,
      lineItems: detail.lineItems,
      meta: {
        ...detail.meta,
        dueDate: dueFrom?.meta.dueDate || detail.meta.dueDate,
        terms: detail.meta.terms || summary.meta.terms,
        poNumber: detail.meta.poNumber || summary.meta.poNumber,
        status: [detail, summary].some((entry) => entry.meta.status === "paid") ? "paid" : detail.meta.status,
      },
    });
  }
  return merged;
}

/** Reads and combines one or more QuickBooks export files. */
export async function readQuickBooksFiles(files) {
  const results = [];
  for (const file of files) {
    if (file.size > 25 * 1024 * 1024) throw new Error(`${file.name} is larger than 25 MB.`);
    results.push(parseQuickBooksMatrix(await readMatrix(file), file.name));
  }
  const customers = new Map();
  for (const result of results) {
    for (const customer of result.customers) {
      const key = customer.name.toLowerCase();
      const existing = customers.get(key);
      if (!existing) customers.set(key, { ...customer });
      else {
        for (const field of ["email", "phone", "address", "notes"]) {
          if (!existing[field] && customer[field]) existing[field] = customer[field];
        }
      }
    }
  }
  return {
    invoices: mergeInvoicesByNumber(results.flatMap((result) => result.invoices)),
    files: results.map(({ kind, fileName, customers: list, invoices, skipped, nonInvoice }) => ({
      kind,
      fileName,
      customerCount: list.length,
      invoiceCount: invoices.length,
      skipped,
      nonInvoice,
    })),
    customers: [...customers.values()],
  };
}

function nameKey(value) {
  return String(value || "").normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

/**
 * Adds imported customers and invoices to a workspace in one pass. Customers
 * match saved ones by name (QuickBooks names are unique) and only fill blank
 * fields; invoices whose number already exists are skipped so re-importing the
 * same report is safe.
 */
export function applyQuickBooksImport(workspace, data, { includeCustomers = true, includeInvoices = true } = {}) {
  let next = workspace;
  const summary = { customersCreated: 0, customersUpdated: 0, invoicesCreated: 0, invoicesSkipped: 0 };
  const byName = new Map(next.customers.filter((record) => !record.archivedAt).map((record) => [nameKey(record.name), record]));
  const importedByName = new Map(data.customers.map((customer) => [nameKey(customer.name), customer]));

  function ensureCustomer(customer) {
    const key = nameKey(customer.name);
    if (!key) return null;
    const existing = byName.get(key);
    if (existing) {
      const patch = {};
      for (const field of ["email", "phone", "address", "notes"]) {
        if (!existing[field] && customer[field]) patch[field] = customer[field];
      }
      if (Object.keys(patch).length) {
        const saved = upsertWorkspaceRecord(next, "customers", { id: existing.id, ...patch });
        next = saved.workspace;
        byName.set(key, saved.record);
        summary.customersUpdated += 1;
        return saved.record;
      }
      return existing;
    }
    const saved = upsertWorkspaceRecord(next, "customers", {
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      address: customer.address,
      notes: customer.notes,
    });
    next = saved.workspace;
    byName.set(key, saved.record);
    summary.customersCreated += 1;
    return saved.record;
  }

  if (includeCustomers) {
    for (const customer of data.customers) ensureCustomer(customer);
  }

  if (includeInvoices) {
    const activeId = workspace.preferences.activeInvoiceId;
    const existingNumbers = new Set(next.invoices.map((record) => nameKey(record.invoice.meta.number)).filter(Boolean));
    for (const invoice of data.invoices) {
      const number = nameKey(invoice.meta.number);
      if (number && existingNumbers.has(number)) {
        summary.invoicesSkipped += 1;
        continue;
      }
      const details = importedByName.get(nameKey(invoice.customer.name)) || {};
      const customer = {
        ...invoice.customer,
        email: invoice.customer.email || details.email || "",
        phone: invoice.customer.phone || details.phone || "",
        address: invoice.customer.address || details.address || "",
      };
      const record = ensureCustomer(customer);
      const created = createInvoiceInWorkspace(next, {
        ...invoice,
        customer: record
          ? { name: record.name, email: record.email || customer.email, phone: record.phone || customer.phone, address: record.address || customer.address }
          : customer,
      }, { customerId: record?.id });
      next = created.workspace;
      if (number) existingNumbers.add(number);
      summary.invoicesCreated += 1;
    }
    // Imported invoices keep their QuickBooks numbers, so they shouldn't push
    // the next Invoice Studio number forward.
    next = {
      ...next,
      preferences: {
        ...next.preferences,
        numbering: workspace.preferences.numbering,
        activeInvoiceId: activeId && next.invoices.some((record) => record.id === activeId)
          ? activeId
          : next.preferences.activeInvoiceId,
      },
    };
  }

  return { workspace: next, summary };
}
