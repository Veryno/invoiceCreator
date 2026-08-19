import assert from "node:assert/strict";
import test from "node:test";
import ExcelJS from "exceljs";
import {
  importMappedPreview,
  inspectImportFile,
  validateImportMapping,
} from "../src/lib/importPreview.js";

function fileLike(name, contents, type = "") {
  const bytes = typeof contents === "string"
    ? new TextEncoder().encode(contents)
    : new Uint8Array(contents);
  return {
    name,
    type,
    size: bytes.byteLength,
    async arrayBuffer() {
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    },
  };
}

test("manual mappings reject duplicate and unsupported target fields", async () => {
  const preview = await inspectImportFile(fileLike(
    "duplicate.csv",
    "Item,Description,Rate\nConsulting,Planning,100",
  ));
  const mapping = {
    Item: "lineItems.description",
    Description: "lineItems.description",
    Rate: "not.a.real.field",
  };

  const errors = validateImportMapping(preview, mapping);
  assert.ok(errors.some((message) => /both mapped to Description/.test(message)));
  assert.ok(errors.some((message) => /unsupported field/.test(message)));
  assert.ok(errors.some((message) => /Map a Rate column/.test(message)));
  await assert.rejects(importMappedPreview(preview, mapping), /both mapped to Description/);
});

test("the preview-to-import path neutralizes XLSX formula cells", async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Invoice rows");
  sheet.addRow(["Description", "Rate"]);
  sheet.getCell("A2").value = {
    formula: "HYPERLINK(\"https://example.invalid\")",
    result: "unsafe link",
  };
  sheet.getCell("B2").value = 125;
  const bytes = await workbook.xlsx.writeBuffer();

  const preview = await inspectImportFile(fileLike("formula.xlsx", bytes));
  assert.equal(preview.rows[0].Description.startsWith("="), true);

  const result = await importMappedPreview(preview, preview.mapping);
  assert.equal(result.invoicePatch.lineItems[0].description.startsWith("'="), true);
  assert.ok(result.warnings.some((warning) => /spreadsheet formula/i.test(warning)));
});
