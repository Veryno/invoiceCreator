import assert from "node:assert/strict";
import test from "node:test";
import ExcelJS from "exceljs";
import {
  FIELD_ALIASES,
  SUPPORTED_IMPORT_FORMATS,
  importInvoice,
  sanitizeSpreadsheetText,
} from "../src/lib/importInvoice.js";

function asArrayBuffer(text) {
  return new TextEncoder().encode(text).buffer;
}

test("exports documented aliases and neutralizes formula-like text", () => {
  assert.deepEqual(SUPPORTED_IMPORT_FORMATS, ["csv", "json", "xlsx"]);
  assert.ok(FIELD_ALIASES["company.name"].includes("company name"));
  assert.ok(FIELD_ALIASES["lineItems.quantity"].includes("qty"));
  assert.equal(sanitizeSpreadsheetText("=WEBSERVICE(\"https://example.test\")"), "'=WEBSERVICE(\"https://example.test\")");
  assert.equal(sanitizeSpreadsheetText("-1+2"), "'-1+2");
  assert.equal(sanitizeSpreadsheetText("-125.50"), "-125.50");
  assert.equal(sanitizeSpreadsheetText(12), 12);
});

test("imports CSV aliases, shared first nonblank fields, and safe numeric values", async () => {
  const csv = [
    "Company Name,Customer,Invoice #,Currency,Service Date,Product/Service,Description,Qty,Unit Price,Taxable,Notes",
    "Acme Studio,,INV-1042,usd,2026-08-17,Design,Brand concepts,2,\"$1,234.50\",yes,",
    ",Northwind Labs,,,,Hosting,=HYPERLINK(\"https://bad.test\"),not-a-number,25,no,Thank you",
  ].join("\n");

  const { invoicePatch, warnings, rowCount } = await importInvoice(asArrayBuffer(csv), {
    fileName: "invoice.csv",
  });

  assert.equal(rowCount, 2);
  assert.deepEqual(invoicePatch.company, { name: "Acme Studio" });
  assert.deepEqual(invoicePatch.customer, { name: "Northwind Labs" });
  assert.equal(invoicePatch.meta.number, "INV-1042");
  assert.equal(invoicePatch.meta.currency, "USD");
  assert.equal(invoicePatch.content.notes, "Thank you");
  assert.equal(invoicePatch.lineItems.length, 2);
  assert.deepEqual(invoicePatch.lineItems[0], {
    id: "imported-1",
    serviceDate: "2026-08-17",
    item: "Design",
    description: "Brand concepts",
    quantity: 2,
    rate: 1234.5,
    taxable: true,
  });
  assert.equal(invoicePatch.lineItems[1].description.startsWith("'="), true);
  assert.equal(invoicePatch.lineItems[1].quantity, 1);
  assert.equal(invoicePatch.lineItems[1].rate, 25);
  assert.equal(invoicePatch.lineItems[1].taxable, false);
  assert.ok(warnings.some((warning) => warning.includes("spreadsheet formula")));
  assert.ok(warnings.some((warning) => warning.includes("Invalid number in quantity")));
  assert.ok(invoicePatch.lineItems.every((line) => Number.isFinite(line.quantity) && Number.isFinite(line.rate)));
});

test("imports a canonical JSON File while preserving nested settings safely", async () => {
  const json = {
    company: {
      name: "Harbor & Pine",
      email: "hello@example.test",
      address: { line1: "12 Main St", city: "Portland", state: "ME", postalCode: "04101" },
    },
    customer: { name: "Atlas Coffee", phone: "555-0100" },
    meta: {
      number: "HP-88",
      issueDate: "2026-08-17",
      dueDate: "2026-09-16",
      terms: "Net 30",
      poNumber: "PO-9",
      currency: "cad",
    },
    lineItems: [
      {
        id: "custom-line",
        serviceDate: "2026-08-10",
        item: "Photography",
        description: "Product shoot",
        quantity: "3",
        rate: "$450.00",
        taxable: "Y",
      },
    ],
    notes: ["Thank you", "Questions? Email us."],
    paymentInstructions: "@SUM(A1:A2)",
    settings: {
      taxRate: "7.5%",
      showLogo: "yes",
      accentColor: "#0b6bcb",
      customFooter: "=CMD()",
    },
  };
  const file = new File([JSON.stringify(json)], "invoice.json", { type: "application/json" });

  const { invoicePatch, warnings, rowCount } = await importInvoice(file);

  assert.equal(rowCount, 1);
  assert.deepEqual(invoicePatch.company, {
    name: "Harbor & Pine",
    email: "hello@example.test",
    address: "12 Main St\nPortland, ME, 04101",
  });
  assert.deepEqual(invoicePatch.customer, { name: "Atlas Coffee", phone: "555-0100" });
  assert.equal(invoicePatch.meta.currency, "CAD");
  assert.deepEqual(invoicePatch.lineItems[0], {
    id: "custom-line",
    serviceDate: "2026-08-10",
    item: "Photography",
    description: "Product shoot",
    quantity: 3,
    rate: 450,
    taxable: true,
  });
  assert.equal(invoicePatch.content.notes, "Thank you\nQuestions? Email us.");
  assert.equal(invoicePatch.content.paymentInstructions, "'@SUM(A1:A2)");
  assert.equal(invoicePatch.adjustments.taxRate, 7.5);
  assert.equal(invoicePatch.design.accentColor, "#0b6bcb");
  assert.ok(warnings.filter((warning) => warning.includes("formula")).length >= 2);
});

test("uses only the first canonical invoice in a JSON array", async () => {
  const invoices = [
    {
      company: { name: "First Co" },
      meta: { number: "FIRST" },
      lineItems: [{ item: "Consulting", quantity: 1, rate: 100 }],
    },
    {
      company: { name: "Second Co" },
      meta: { number: "SECOND" },
      lineItems: [{ item: "Ignored", quantity: 1, rate: 999 }],
    },
  ];

  const result = await importInvoice(asArrayBuffer(JSON.stringify(invoices)));

  assert.equal(result.rowCount, 1);
  assert.equal(result.invoicePatch.company.name, "First Co");
  assert.equal(result.invoicePatch.meta.number, "FIRST");
  assert.ok(result.warnings.some((warning) => warning.includes("only the first was imported")));
});

test("round-trips the app's content, adjustments, and design sections", async () => {
  const result = await importInvoice({
    schemaVersion: 1,
    company: { name: "Round Trip Co", taxId: "12-3456789", logo: "data:image/png;base64,safe" },
    meta: { number: "RT-1", locale: "en-CA", status: "Draft" },
    adjustments: {
      discountType: "fixed",
      discountValue: "125.50",
      shipping: "20",
      deposit: "50",
      taxRate: "13",
    },
    content: { notes: "Saved note", paymentInstructions: "Wire transfer" },
    design: {
      template: "classic",
      accentColor: "#112233",
      font: "Inter",
      paperSize: "A4",
      showServiceDate: false,
      showItem: true,
    },
    lineItems: [{ item: "Service", quantity: 1, rate: 300, taxable: true }],
  });

  assert.deepEqual(result.invoicePatch.adjustments, {
    discountType: "fixed",
    discountValue: 125.5,
    shipping: 20,
    deposit: 50,
    taxRate: 13,
  });
  assert.deepEqual(result.invoicePatch.content, {
    notes: "Saved note",
    paymentInstructions: "Wire transfer",
  });
  assert.deepEqual(result.invoicePatch.design, {
    template: "classic",
    accentColor: "#112233",
    font: "Inter",
    paperSize: "A4",
    showServiceDate: false,
    showItem: true,
  });
  assert.equal(result.invoicePatch.company.taxId, "12-3456789");
  assert.equal(result.invoicePatch.meta.locale, "en-CA");
});

test("treats flat JSON arrays as line-item rows", async () => {
  const rows = [
    { client_name: "Bright Goods", invoice_no: "B-10", item: "Audit", qty: "1", rate: "500" },
    { item: "Workshop", qty: "2", rate: "350", taxable: "true" },
  ];

  const result = await importInvoice(rows);

  assert.equal(result.rowCount, 2);
  assert.equal(result.invoicePatch.customer.name, "Bright Goods");
  assert.equal(result.invoicePatch.meta.number, "B-10");
  assert.deepEqual(
    result.invoicePatch.lineItems.map(({ item, quantity, rate, taxable }) => ({ item, quantity, rate, taxable })),
    [
      { item: "Audit", quantity: 1, rate: 500, taxable: false },
      { item: "Workshop", quantity: 2, rate: 350, taxable: true },
    ],
  );
});

test("imports XLSX ArrayBuffers and sanitizes workbook formula cells", async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Invoice");
  sheet.addRows([
    ["Business Name", "Bill To", "Invoice Date", "Item", "Quantity", "Rate", "Taxable", "Extra"],
    ["Bluebird LLC", "Cedar Market", "2026-08-17", "Planning", 4, 125, "yes", ""],
    ["", "", "", "Implementation", 1, 800, "no", ""],
  ]);
  sheet.getCell("H2").value = { formula: "2+2", result: 4 };
  workbook.addWorksheet("Other").addRow(["Ignored"]);
  const bytes = await workbook.xlsx.writeBuffer();

  const result = await importInvoice(bytes, { fileName: "invoice.xlsx" });

  assert.equal(result.rowCount, 2);
  assert.equal(result.invoicePatch.company.name, "Bluebird LLC");
  assert.equal(result.invoicePatch.customer.name, "Cedar Market");
  assert.equal(result.invoicePatch.lineItems[0].quantity, 4);
  assert.equal(result.invoicePatch.lineItems[0].rate, 125);
  assert.equal(result.invoicePatch.lineItems[1].item, "Implementation");
  assert.equal(result.invoicePatch.lineItems[1].quantity, 1);
  assert.ok(result.warnings.some((warning) => warning.includes("first worksheet")));
  assert.ok(result.warnings.some((warning) => warning.includes("cell H2")));
  assert.ok(result.invoicePatch.lineItems.every((line) => !Number.isNaN(line.quantity) && !Number.isNaN(line.rate)));
});

test("rejects legacy XLS input and malformed JSON clearly", async () => {
  const legacyXlsMagic = Uint8Array.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  await assert.rejects(
    importInvoice(legacyXlsMagic, { fileName: "invoice.xls" }),
    /legacy XLS is not supported; save as XLSX or CSV/i,
  );

  await assert.rejects(
    importInvoice(asArrayBuffer("{not valid json"), { format: "json" }),
    /Unable to parse the JSON invoice/,
  );
});
