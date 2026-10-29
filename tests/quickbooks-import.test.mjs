import assert from "node:assert/strict";
import test from "node:test";
import { applyQuickBooksImport, findHeaderRow, parseQuickBooksMatrix } from "../src/lib/importQuickBooks.js";
import { calculateInvoice } from "../src/lib/invoice.js";
import { createWorkspace } from "../src/lib/workspace.js";

const SALES_BY_CUSTOMER_DETAIL = [
  ["REEM Construction"],
  ["Sales by Customer Detail"],
  ["January - October, 2026"],
  [],
  ["", "Date", "Transaction Type", "Num", "Product/Service", "Memo/Description", "Qty", "Sales Price", "Amount", "Balance"],
  ["Space Club Greenpoint"],
  ["", "10/01/2026", "Invoice", "1001", "Labor", "Framing crew", 40, "85.00", "3,400.00", "3,400.00"],
  ["", "10/01/2026", "Invoice", "1001", "Materials", "Lumber", "", "", "1,250.50", "4,650.50"],
  ["", "10/05/2026", "Payment", "", "", "", "", "", "-500.00", "4,150.50"],
  ["Total for Space Club Greenpoint", "", "", "", "", "", "", "", "4,650.50"],
  ["Smith Homes:Kitchen"],
  ["", "10/09/2026", "Invoice", "1002", "Demolition", "", 1, "1,850.00", "1,850.00", ""],
  ["TOTAL", "", "", "", "", "", "", "", "6,500.50"],
  [],
  ["Accrual basis Wednesday, October 28, 2026"],
];

test("finds the header row below QuickBooks report titles", () => {
  assert.equal(findHeaderRow(SALES_BY_CUSTOMER_DETAIL).index, 4);
});

test("groups sales detail rows into invoices under their customer heading", () => {
  const result = parseQuickBooksMatrix(SALES_BY_CUSTOMER_DETAIL);
  assert.equal(result.kind, "transactions");
  assert.equal(result.nonInvoice, 1);
  assert.deepEqual(result.invoices.map((invoice) => invoice.meta.number), ["1001", "1002"]);

  const [first, second] = result.invoices;
  assert.equal(first.customer.name, "Space Club Greenpoint");
  assert.equal(first.meta.issueDate, "2026-10-01");
  assert.deepEqual(first.lineItems.map(({ item, quantity, rate }) => [item, quantity, rate]), [
    ["Labor", 40, 85],
    ["Materials", 1, 1250.5],
  ]);
  assert.equal(calculateInvoice(first).total, 4650.5);
  assert.equal(second.customer.name, "Smith Homes");
  assert.equal(second.job.name, "Kitchen");
});

test("reads QuickBooks Online customer exports with split address columns", () => {
  const result = parseQuickBooksMatrix([
    ["Name", "Company name", "Street Address", "City", "State", "Country", "Zip", "Phone", "Email", "Open Balance"],
    ["Jane Doe", "", "12 Oak St", "Queens", "NY", "USA", "11101", "555-1212", "jane@example.com", "0.00"],
    ["Total", "", "", "", "", "", "", "", "", "0.00"],
  ]);
  assert.equal(result.kind, "customers");
  assert.deepEqual(result.customers, [{
    name: "Jane Doe",
    jobName: "",
    email: "jane@example.com",
    phone: "555-1212",
    address: "12 Oak St\nQueens, NY 11101",
    notes: "",
  }]);
});

test("rejects files that are not QuickBooks lists or reports", () => {
  assert.throws(() => parseQuickBooksMatrix([["hello"], ["world"]], "notes.csv"), /notes\.csv/);
});

test("imports customers and invoices once, keeping invoice numbering", () => {
  const workspace = createWorkspace({ now: "2026-10-28T12:00:00.000Z" });
  const parsed = parseQuickBooksMatrix(SALES_BY_CUSTOMER_DETAIL);
  const data = {
    customers: [{ name: "Space Club Greenpoint", email: "ops@spaceclub.example", phone: "", address: "220 Newel St", notes: "" }],
    invoices: parsed.invoices,
  };

  const first = applyQuickBooksImport(workspace, data);
  assert.deepEqual(first.summary, { customersCreated: 2, customersUpdated: 0, invoicesCreated: 2, invoicesSkipped: 0 });
  const record = first.workspace.invoices.find((entry) => entry.invoice.meta.number === "1001");
  const customer = first.workspace.customers.find((entry) => entry.id === record.customerId);
  assert.equal(customer.email, "ops@spaceclub.example");
  assert.equal(record.invoice.customer.address, "220 Newel St");
  assert.equal(first.workspace.preferences.numbering.nextSequence, workspace.preferences.numbering.nextSequence);

  const again = applyQuickBooksImport(first.workspace, data);
  assert.equal(again.summary.invoicesCreated, 0);
  assert.equal(again.summary.invoicesSkipped, 2);
  assert.equal(again.workspace.customers.length, 2);
});

test("an Invoice List report adds due dates and paid status to detail invoices", async () => {
  const { mergeInvoicesByNumber } = await import("../src/lib/importQuickBooks.js");
  const detail = parseQuickBooksMatrix(SALES_BY_CUSTOMER_DETAIL).invoices;
  const list = parseQuickBooksMatrix([
    ["Invoice List"],
    [],
    ["Date", "Transaction type", "Num", "Customer", "Due date", "Amount", "Open balance"],
    ["10/01/2026", "Invoice", "1001", "Space Club Greenpoint", "10/31/2026", "4,650.50", "0.00"],
    ["10/09/2026", "Invoice", "1002", "Smith Homes:Kitchen", "11/08/2026", "1,850.00", "1,850.00"],
  ]).invoices;

  const merged = mergeInvoicesByNumber([...list, ...detail]);
  assert.equal(merged.length, 2);
  const first = merged.find((invoice) => invoice.meta.number === "1001");
  assert.equal(first.lineItems.length, 2);
  assert.equal(first.meta.dueDate, "2026-10-31");
  assert.equal(first.meta.status, "paid");
  const second = merged.find((invoice) => invoice.meta.number === "1002");
  assert.equal(second.meta.status, "sent");
  assert.equal(second.meta.dueDate, "2026-11-08");
});
