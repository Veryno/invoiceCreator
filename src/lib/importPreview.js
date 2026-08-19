import ExcelJS from "exceljs";
import Papa from "papaparse";
import {
  FIELD_ALIASES,
  importInvoice,
} from "./importInvoice.js";
import { findMatchingImportedCustomer } from "./importCustomers.js";

const LEGACY_XLS_MESSAGE = "Legacy XLS is not supported; save as XLSX or CSV.";
const MAX_HEADER_ROW = 25;

export const IMPORT_FIELDS = Object.freeze([
  { path: "meta.number", label: "Invoice number", group: "Invoice" },
  { path: "meta.issueDate", label: "Issue date", group: "Invoice" },
  { path: "meta.dueDate", label: "Due date", group: "Invoice" },
  { path: "meta.terms", label: "Terms", group: "Invoice" },
  { path: "meta.poNumber", label: "Purchase order", group: "Invoice" },
  { path: "meta.currency", label: "Currency", group: "Invoice" },
  { path: "company.name", label: "Company name", group: "Company" },
  { path: "company.email", label: "Company email", group: "Company" },
  { path: "company.phone", label: "Company phone", group: "Company" },
  { path: "company.address", label: "Company address", group: "Company" },
  { path: "company.taxId", label: "Company tax ID", group: "Company" },
  { path: "customer.name", label: "Customer name", group: "Customer" },
  { path: "customer.email", label: "Customer email", group: "Customer" },
  { path: "customer.phone", label: "Customer phone", group: "Customer" },
  { path: "customer.address", label: "Billing address", group: "Customer" },
  { path: "lineItems.serviceDate", label: "Service date", group: "Line item" },
  { path: "lineItems.item", label: "Product / service", group: "Line item" },
  { path: "lineItems.description", label: "Description", group: "Line item" },
  { path: "lineItems.quantity", label: "Quantity", group: "Line item" },
  { path: "lineItems.rate", label: "Rate", group: "Line item" },
  { path: "lineItems.taxable", label: "Taxable", group: "Line item" },
  { path: "settings.taxRate", label: "Tax rate", group: "Totals" },
  { path: "settings.discountRate", label: "Discount percent", group: "Totals" },
  { path: "settings.discountAmount", label: "Discount amount", group: "Totals" },
  { path: "settings.shipping", label: "Shipping / fees", group: "Totals" },
  { path: "settings.deposit", label: "Deposit / payment", group: "Totals" },
  { path: "notes", label: "Customer note", group: "Content" },
  { path: "paymentInstructions", label: "Payment instructions", group: "Content" },
]);

const FIELD_BY_PATH = new Map(IMPORT_FIELDS.map((field) => [field.path, field]));
const VALID_TARGETS = new Set(IMPORT_FIELDS.map((field) => field.path));

function normalizeHeader(value) {
  return String(value ?? "")
    .replace(/([a-z\d])([A-Z])/g, "$1 $2")
    .replace(/[#№]/g, " number ")
    .replace(/&/g, " and ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const ALIAS_TO_PATH = (() => {
  const index = new Map();
  for (const [path, aliases] of Object.entries(FIELD_ALIASES)) {
    if (!VALID_TARGETS.has(path)) continue;
    for (const alias of [path, ...aliases]) {
      const key = normalizeHeader(alias);
      if (key && !index.has(key)) index.set(key, path);
    }
  }
  return index;
})();

function extensionOf(name) {
  return String(name || "").toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] || "";
}

function detectFormat(file, bytes, text) {
  const extension = extensionOf(file?.name);
  if (extension === "xls") throw new TypeError(LEGACY_XLS_MESSAGE);
  if (["csv", "json", "xlsx"].includes(extension)) return extension;

  if (
    bytes?.length >= 8
    && [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]
      .every((byte, index) => bytes[index] === byte)
  ) {
    throw new TypeError(LEGACY_XLS_MESSAGE);
  }
  if (bytes?.[0] === 0x50 && bytes?.[1] === 0x4b) return "xlsx";

  const mime = String(file?.type || "").toLowerCase();
  if (mime.includes("spreadsheetml")) return "xlsx";
  if (mime.includes("excel")) throw new TypeError(LEGACY_XLS_MESSAGE);
  if (mime.includes("json")) return "json";
  if (mime.includes("csv")) return "csv";
  return String(text || "").trimStart().match(/^[{[]/) ? "json" : "csv";
}

function exactArrayBuffer(value) {
  if (value instanceof ArrayBuffer) return value;
  if (ArrayBuffer.isView(value)) {
    return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
  }
  return null;
}

async function readSource(file) {
  if (!file) throw new TypeError("Choose a CSV, XLSX, or JSON file.");
  let arrayBuffer = exactArrayBuffer(file);
  if (!arrayBuffer && typeof file.arrayBuffer === "function") {
    arrayBuffer = await file.arrayBuffer();
  }
  if (!arrayBuffer && typeof file === "string") {
    arrayBuffer = new TextEncoder().encode(file).buffer;
  }
  if (!arrayBuffer) throw new TypeError("That file could not be read.");
  const bytes = new Uint8Array(arrayBuffer, 0, Math.min(arrayBuffer.byteLength, 8));
  const text = new TextDecoder("utf-8").decode(arrayBuffer).replace(/^\uFEFF/, "");
  return {
    arrayBuffer,
    text,
    format: detectFormat(file, bytes, text),
    fileName: file?.name || "invoice-data",
  };
}

function valueFromCell(cell) {
  const value = cell.value;
  if (value instanceof Date && !Number.isNaN(value.valueOf())) {
    return value.toISOString().slice(0, 10);
  }
  if (value && typeof value === "object") {
    if (value.formula || value.sharedFormula) {
      return `=${value.formula || value.sharedFormula}`;
    }
    if (Array.isArray(value.richText)) {
      return value.richText.map((part) => part?.text || "").join("");
    }
    if (typeof value.text === "string") return value.text;
    if (value.error) return value.error;
  }
  return value ?? "";
}

function uniqueHeaders(values) {
  const counts = new Map();
  return values.map((value, index) => {
    const base = String(value ?? "").trim() || `Column ${index + 1}`;
    const key = normalizeHeader(base);
    const count = (counts.get(key) || 0) + 1;
    counts.set(key, count);
    return count === 1 ? base : `${base} (${count})`;
  });
}

function matrixToRows(matrix, headerRow = 1) {
  const headerIndex = Math.max(0, Math.min(MAX_HEADER_ROW - 1, Number(headerRow || 1) - 1));
  const sourceHeaders = matrix[headerIndex] || [];
  const lastHeader = sourceHeaders.reduce(
    (last, value, index) => (String(value ?? "").trim() ? index : last),
    -1,
  );
  if (lastHeader < 0) return { headers: [], rows: [] };
  const headers = uniqueHeaders(sourceHeaders.slice(0, lastHeader + 1));
  const rows = matrix.slice(headerIndex + 1).flatMap((values) => {
    const row = {};
    let hasValue = false;
    headers.forEach((header, index) => {
      const value = values[index] ?? "";
      row[header] = value;
      if (String(value).trim()) hasValue = true;
    });
    return hasValue ? [row] : [];
  });
  return { headers, rows };
}

function objectRows(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") {
    if (Array.isArray(value.rows)) return value.rows;
    if (Array.isArray(value.data)) return value.data;
    return [value];
  }
  return [];
}

function isCanonicalJson(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Number(value.schemaVersion) === 1
    || ["company", "customer", "meta", "lineItems", "adjustments", "content", "design"]
      .some((key) => Object.hasOwn(value, key));
}

function headersForRows(rows) {
  const seen = new Set();
  const headers = [];
  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) continue;
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) {
        seen.add(key);
        headers.push(key);
      }
    }
  }
  return headers;
}

export function suggestImportMapping(headers) {
  const used = new Set();
  const mapping = {};
  for (const header of headers) {
    const target = ALIAS_TO_PATH.get(normalizeHeader(header)) || "";
    if (target && !used.has(target)) {
      mapping[header] = target;
      used.add(target);
    } else {
      mapping[header] = "";
    }
  }
  return mapping;
}

function previewResult({ format, fileName, sheetNames = [], sheetName = "", headerRow, headers, rows }) {
  return {
    kind: "tabular",
    format,
    fileName,
    sheetNames,
    sheetName,
    headerRow,
    headers,
    rows,
    mapping: suggestImportMapping(headers),
  };
}

export async function inspectImportFile(file, options = {}) {
  const source = await readSource(file);
  const requestedHeaderRow = Math.max(
    1,
    Math.min(MAX_HEADER_ROW, Number(options.headerRow || 1)),
  );

  if (source.format === "json") {
    let value;
    try {
      value = JSON.parse(source.text);
    } catch (error) {
      throw new Error(`Unable to parse the JSON invoice: ${error.message}`, { cause: error });
    }
    const candidate = value?.invoice && typeof value.invoice === "object" ? value.invoice : value;
    if (isCanonicalJson(candidate) || (Array.isArray(candidate) && isCanonicalJson(candidate[0]))) {
      const result = await importInvoice(value, { format: "json" });
      return {
        kind: "canonical",
        format: "json",
        fileName: source.fileName,
        result,
      };
    }
    const rows = objectRows(value).filter((row) => row && typeof row === "object" && !Array.isArray(row));
    const headers = headersForRows(rows);
    return previewResult({
      format: "json",
      fileName: source.fileName,
      headerRow: 1,
      headers,
      rows,
    });
  }

  if (source.format === "csv") {
    const parsed = Papa.parse(source.text, { header: false, skipEmptyLines: "greedy" });
    if (parsed.errors.length && !parsed.data.length) {
      throw new Error(parsed.errors[0].message);
    }
    const { headers, rows } = matrixToRows(parsed.data, requestedHeaderRow);
    return previewResult({
      format: "csv",
      fileName: source.fileName,
      headerRow: requestedHeaderRow,
      headers,
      rows,
    });
  }

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(source.arrayBuffer);
  } catch (error) {
    throw new Error(`Unable to read the XLSX spreadsheet: ${error.message}`, { cause: error });
  }
  if (!workbook.worksheets.length) throw new Error("The spreadsheet does not contain a worksheet.");
  const sheetNames = workbook.worksheets.map((worksheet) => worksheet.name);
  const worksheet = options.sheetName
    ? workbook.getWorksheet(options.sheetName)
    : workbook.worksheets[0];
  if (!worksheet) throw new Error("Choose a worksheet that exists in this file.");
  const matrix = [];
  worksheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    matrix[rowNumber - 1] = Array.from(
      { length: worksheet.columnCount },
      (_, index) => valueFromCell(row.getCell(index + 1)),
    );
  });
  const { headers, rows } = matrixToRows(matrix, requestedHeaderRow);
  return previewResult({
    format: "xlsx",
    fileName: source.fileName,
    sheetNames,
    sheetName: worksheet.name,
    headerRow: requestedHeaderRow,
    headers,
    rows,
  });
}

export function validateImportMapping(preview, mapping) {
  const errors = [];
  const used = new Map();
  for (const header of preview.headers || []) {
    const target = mapping?.[header] || "";
    if (!target) continue;
    if (!VALID_TARGETS.has(target)) {
      errors.push(`${header} is mapped to an unsupported field.`);
      continue;
    }
    if (used.has(target)) {
      errors.push(`${header} and ${used.get(target)} are both mapped to ${FIELD_BY_PATH.get(target)?.label || target}.`);
    } else {
      used.set(target, header);
    }
  }
  if (!used.has("lineItems.item") && !used.has("lineItems.description")) {
    errors.push("Map a Product / service or Description column.");
  }
  if (!used.has("lineItems.rate")) errors.push("Map a Rate column.");
  return errors;
}

function mappedValue(row, mapping, path) {
  const header = Object.keys(mapping || {}).find((key) => mapping[key] === path);
  return header ? row?.[header] : undefined;
}

function validNumber(value) {
  if (value === "" || value === null || value === undefined) return true;
  const normalized = String(value).replace(/[,$£€%\s]/g, "");
  return Number.isFinite(Number(normalized));
}

export function validateImportRows(preview, mapping, excludedRows = new Set()) {
  const issues = [];
  (preview.rows || []).forEach((row, index) => {
    if (excludedRows.has(index)) return;
    const item = mappedValue(row, mapping, "lineItems.item");
    const description = mappedValue(row, mapping, "lineItems.description");
    if (!String(item || description || "").trim()) {
      issues.push({ row: index, field: "description", message: "Add a product/service or description." });
    }
    for (const [path, label] of [["lineItems.quantity", "quantity"], ["lineItems.rate", "rate"]]) {
      const value = mappedValue(row, mapping, path);
      if (!validNumber(value)) {
        issues.push({ row: index, field: path, message: `The ${label} is not a valid number.` });
      }
    }
  });
  return issues;
}

export function buildMappedRows(preview, mapping, excludedRows = new Set()) {
  return (preview.rows || []).flatMap((row, index) => {
    if (excludedRows.has(index)) return [];
    const output = {};
    for (const [header, target] of Object.entries(mapping || {})) {
      if (target && VALID_TARGETS.has(target)) output[target] = row?.[header] ?? "";
    }
    return [output];
  });
}

export async function importMappedPreview(preview, mapping, excludedRows = new Set()) {
  if (preview.kind === "canonical") return preview.result;
  const mappingErrors = validateImportMapping(preview, mapping);
  if (mappingErrors.length) throw new Error(mappingErrors[0]);
  const rowIssues = validateImportRows(preview, mapping, excludedRows);
  if (rowIssues.length) throw new Error(`Fix or exclude ${rowIssues.length} invalid ${rowIssues.length === 1 ? "cell" : "cells"} before importing.`);
  const rows = buildMappedRows(preview, mapping, excludedRows);
  const invoiceNumberHeader = Object.keys(mapping || {})
    .find((header) => mapping[header] === "meta.number");
  const groups = new Map();
  if (invoiceNumberHeader) {
    for (const row of rows) {
      const number = String(row["meta.number"] || "").trim();
      const key = number || "__blank_invoice__";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    }
  }
  if (groups.size > 1) {
    const invoices = await Promise.all(
      [...groups.values()].map((groupRows) => importInvoice(groupRows, { format: "json" })),
    );
    return {
      mergeStrategy: "multiple",
      invoices,
      invoiceCount: invoices.length,
      rowCount: rows.length,
      warnings: invoices.flatMap((result) => result.warnings || []),
    };
  }

  const result = await importInvoice(rows, { format: "json" });
  return {
    ...result,
    rowCount: rows.length,
  };
}

/** Extracts a reusable customer list from an inspected tabular file. */
export function extractCustomersFromPreview(preview, mapping = preview?.mapping || {}) {
  if (preview?.kind !== "tabular") {
    throw new TypeError("Choose a tabular CSV, XLSX, or JSON customer file.");
  }
  const customerPaths = ["customer.name", "customer.email", "customer.phone", "customer.address"];
  const headers = new Map(customerPaths.map((path) => [
    path,
    Object.keys(mapping).find((header) => mapping[header] === path),
  ]));
  if (!headers.get("customer.name")) {
    throw new Error("Map or name a column Customer, Customer name, Client, or Bill to.");
  }
  const customers = [];
  const warnings = [];
  preview.rows.forEach((row, index) => {
    const customer = {
      name: String(row?.[headers.get("customer.name")] ?? "").trim(),
      email: headers.get("customer.email") ? String(row?.[headers.get("customer.email")] ?? "").trim() : "",
      phone: headers.get("customer.phone") ? String(row?.[headers.get("customer.phone")] ?? "").trim() : "",
      address: headers.get("customer.address") ? String(row?.[headers.get("customer.address")] ?? "").trim() : "",
    };
    if (!customer.name) {
      warnings.push(`Row ${index + 1} was skipped because the customer name is blank.`);
      return;
    }
    const duplicate = findMatchingImportedCustomer(customers, customer);
    if (duplicate) {
      for (const field of ["email", "phone", "address"]) {
        if (!duplicate[field] && customer[field]) duplicate[field] = customer[field];
      }
      warnings.push(`Row ${index + 1} duplicates ${customer.name} and was skipped.`);
      return;
    }
    customers.push(customer);
  });
  return { customers, warnings, rowCount: preview.rows.length };
}
