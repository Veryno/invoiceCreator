import assert from "node:assert/strict";
import test from "node:test";
import ExcelJS from "exceljs";
import {
  buildMappedRows,
  extractCustomersFromPreview,
  importMappedPreview,
  inspectImportFile,
  suggestImportMapping,
  validateImportMapping,
  validateImportRows,
} from "../src/lib/importPreview.js";

function fileLike(name, contents, type = "") {
  const buffer = typeof contents === "string"
    ? new TextEncoder().encode(contents)
    : new Uint8Array(contents);
  return {
    name,
    type,
    size: buffer.byteLength,
    async arrayBuffer() {
      return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    },
  };
}

test("suggests common invoice mappings without reusing targets", () => {
  assert.deepEqual(
    suggestImportMapping(["Invoice #", "Customer", "Description", "Qty", "Rate", "RATE"]),
    {
      "Invoice #": "meta.number",
      Customer: "customer.name",
      Description: "lineItems.description",
      Qty: "lineItems.quantity",
      Rate: "lineItems.rate",
      RATE: "",
    },
  );
});

test("inspects CSV with a selected header row and imports only included valid rows", async () => {
  const file = fileLike(
    "work.csv",
    "Exported from Job Book,,,,\nCustomer,Description,Qty,Rate,Taxable\nAcme,Framing,2,125,true\nAcme,Bad row,nope,50,false\n",
    "text/csv",
  );
  const preview = await inspectImportFile(file, { headerRow: 2 });

  assert.equal(preview.kind, "tabular");
  assert.equal(preview.headerRow, 2);
  assert.deepEqual(preview.headers, ["Customer", "Description", "Qty", "Rate", "Taxable"]);
  assert.equal(preview.mapping.Customer, "customer.name");
  assert.equal(preview.rows.length, 2);
  assert.deepEqual(validateImportMapping(preview, preview.mapping), []);
  assert.deepEqual(validateImportRows(preview, preview.mapping).map((issue) => issue.row), [1]);

  const excluded = new Set([1]);
  assert.deepEqual(buildMappedRows(preview, preview.mapping, excluded), [{
    "customer.name": "Acme",
    "lineItems.description": "Framing",
    "lineItems.quantity": "2",
    "lineItems.rate": "125",
    "lineItems.taxable": "true",
  }]);

  const result = await importMappedPreview(preview, preview.mapping, excluded);
  assert.equal(result.rowCount, 1);
  assert.equal(result.invoicePatch.customer.name, "Acme");
  assert.equal(result.invoicePatch.lineItems[0].description, "Framing");
  assert.equal(result.invoicePatch.lineItems[0].quantity, 2);
  assert.equal(result.invoicePatch.lineItems[0].rate, 125);
});

test("reports incomplete mapping and invalid rows without coercing them", async () => {
  const preview = await inspectImportFile(fileLike(
    "minimal.csv",
    "Description,Rate\nConsulting,not-money\n,50",
  ));
  assert.deepEqual(validateImportMapping(preview, { Description: "lineItems.description", Rate: "" }), [
    "Map a Rate column.",
  ]);
  const issues = validateImportRows(preview, preview.mapping);
  assert.equal(issues.length, 2);
  assert.match(issues[0].message, /valid number/i);
  assert.match(issues[1].message, /product\/service or description/i);
  await assert.rejects(
    importMappedPreview(preview, preview.mapping),
    /Fix or exclude 2 invalid cells/,
  );
});

test("returns canonical Invoice Studio JSON as a replacement import", async () => {
  const canonical = {
    schemaVersion: 1,
    company: { name: "Backup Company", logo: "" },
    customer: { name: "" },
    meta: { number: "INV-9", issueDate: "", dueDate: "", terms: "" },
    lineItems: [],
    adjustments: {},
    content: { notes: "" },
    design: {},
  };
  const preview = await inspectImportFile(fileLike(
    "invoice.json",
    JSON.stringify(canonical),
    "application/json",
  ));
  assert.equal(preview.kind, "canonical");
  assert.equal(preview.result.mergeStrategy, "replace");
  assert.equal(preview.result.invoicePatch.company.name, "Backup Company");
  assert.equal(preview.result.invoicePatch.meta.issueDate, "");
  assert.deepEqual(preview.result.invoicePatch.lineItems, []);
});

test("inspects a selected XLSX sheet and header row", async () => {
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet("Read me").addRow(["Choose the Jobs sheet"]);
  const sheet = workbook.addWorksheet("Jobs");
  sheet.addRow(["August export"]);
  sheet.addRow(["Customer", "Item", "Description", "Quantity", "Rate"]);
  sheet.addRow(["Riverside", "Labor", "Site work", 3, 90]);
  const bytes = await workbook.xlsx.writeBuffer();

  const preview = await inspectImportFile(fileLike("jobs.xlsx", bytes), {
    sheetName: "Jobs",
    headerRow: 2,
  });
  assert.equal(preview.format, "xlsx");
  assert.deepEqual(preview.sheetNames, ["Read me", "Jobs"]);
  assert.equal(preview.sheetName, "Jobs");
  assert.equal(preview.rows[0].Rate, 90);
  assert.equal(preview.mapping.Item, "lineItems.item");
});

test("rejects legacy XLS before showing a misleading preview", async () => {
  await assert.rejects(
    inspectImportFile(fileLike("old.xls", new Uint8Array([0xd0, 0xcf, 0x11, 0xe0]))),
    /Legacy XLS is not supported/,
  );
});

test("groups mapped spreadsheet rows into multiple invoices by invoice number", async () => {
  const preview = await inspectImportFile(fileLike(
    "batch.csv",
    "Invoice number,Customer,Description,Quantity,Rate\nINV-1,Acme,Design,1,100\nINV-1,Acme,Build,2,50\nINV-2,Beta,Review,1,75",
  ));
  const result = await importMappedPreview(preview, preview.mapping);
  assert.equal(result.mergeStrategy, "multiple");
  assert.equal(result.invoiceCount, 2);
  assert.equal(result.rowCount, 3);
  assert.deepEqual(result.invoices.map((entry) => entry.invoicePatch.meta.number), ["INV-1", "INV-2"]);
  assert.deepEqual(result.invoices.map((entry) => entry.invoicePatch.lineItems.length), [2, 1]);
});

test("extracts and de-duplicates reusable customers from a tabular preview", async () => {
  const preview = await inspectImportFile(fileLike(
    "customers.csv",
    "Customer name,Email,Phone,Billing address\nAcme,hello@acme.test,555-0100,One Main St\nAcme,hello@acme.test,555-0100,One Main St\nBeta,beta@example.test,,Two Oak Rd\n,,,",
  ));
  const result = extractCustomersFromPreview(preview);
  assert.deepEqual(result.customers.map(({ name }) => name), ["Acme", "Beta"]);
  assert.equal(result.warnings.length, 1);
});

test("customer extraction keeps same-name contacts with distinct phone and address", async () => {
  const preview = await inspectImportFile(fileLike(
    "same-name-customers.csv",
    "Customer name,Phone,Billing address\nJohn Smith,(212) 555-0100,One Main St\nJohn Smith,212-555-0199,Two Main St",
  ));
  const result = extractCustomersFromPreview(preview);

  assert.equal(result.customers.length, 2);
  assert.deepEqual(result.customers.map(({ phone }) => phone), ["(212) 555-0100", "212-555-0199"]);
  assert.deepEqual(result.warnings, []);
});
