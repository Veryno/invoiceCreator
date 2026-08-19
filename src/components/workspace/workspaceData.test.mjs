import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCustomerStats,
  filterAndSortCustomers,
  filterInvoices,
  formatDueContext,
  getNeedsAttention,
  groupInvoiceMetrics,
} from "./workspaceData.js";

const now = new Date("2026-08-19T12:00:00");
const invoices = [
  {
    id: "usd-overdue",
    number: "INV-1",
    customerId: "customer-a",
    customerName: "Acme",
    status: "Sent",
    dueDate: "2026-08-10",
    issueDate: "2026-08-01",
    updatedAt: "2026-08-18",
    currency: "USD",
    total: 500,
    balance: 300,
  },
  {
    id: "usd-draft",
    number: "INV-2",
    customerId: "customer-a",
    customerName: "Acme",
    status: "Draft",
    dueDate: "2026-08-01",
    issueDate: "2026-08-15",
    currency: "USD",
    total: 100,
    balance: 100,
  },
  {
    id: "cad-paid",
    number: "INV-3",
    customerId: "customer-b",
    customerName: "Beacon",
    status: "Paid",
    dueDate: "2026-08-30",
    issueDate: "2026-08-11",
    updatedAt: "2026-08-19",
    currency: "CAD",
    total: 250,
    balance: 0,
  },
  {
    id: "archived",
    number: "INV-ARCHIVED",
    customerId: "customer-a",
    customerName: "Acme",
    status: "Sent",
    dueDate: "2026-08-01",
    issueDate: "2026-08-01",
    currency: "USD",
    total: 900,
    balance: 900,
    archivedAt: "2026-08-12T12:00:00.000Z",
  },
];

test("groups financial metrics by currency without counting drafts as open balance", () => {
  const groups = groupInvoiceMetrics(invoices, now);
  assert.deepEqual(groups.map((group) => group.currency), ["CAD", "USD"]);
  assert.equal(groups[0].paidTotal, 250);
  assert.equal(groups[1].openBalance, 300);
  assert.equal(groups[1].overdueBalance, 300);
  assert.equal(groups[1].invoiceCount, 2);
});

test("filters invoices by effective overdue status and search text", () => {
  assert.deepEqual(
    filterInvoices(invoices, { status: "overdue", now }).map((invoice) => invoice.id),
    ["usd-overdue"],
  );
  assert.deepEqual(
    filterInvoices(invoices, { query: "Beacon", now }).map((invoice) => invoice.id),
    ["cad-paid"],
  );
  assert.deepEqual(
    filterInvoices(invoices, { status: "open", currency: "USD", now }).map((invoice) => invoice.id),
    ["usd-overdue"],
  );
});

test("attention list excludes drafts and paid invoices", () => {
  assert.deepEqual(getNeedsAttention(invoices, { now }).map((invoice) => invoice.id), ["usd-overdue"]);
  assert.equal(formatDueContext({ dueDate: "2026-08-19" }, now), "Due today");
});

test("customer statistics preserve currency groups and drive directory filters", () => {
  const customers = [
    { id: "customer-a", name: "Acme", updatedAt: "2026-08-18" },
    { id: "customer-b", name: "Beacon", updatedAt: "2026-08-19" },
  ];
  const stats = buildCustomerStats(customers, invoices, now);
  assert.equal(stats.get("customer-a").invoiceCount, 2);
  assert.deepEqual(stats.get("customer-a").balances, [
    { currency: "USD", outstanding: 300, overdue: 300 },
  ]);
  assert.deepEqual(
    filterAndSortCustomers(customers, invoices, { filter: "overdue", now }).customers.map((customer) => customer.id),
    ["customer-a"],
  );
  assert.deepEqual(
    filterAndSortCustomers(customers, invoices, { filter: "unpaid", now }).customers.map((customer) => customer.id),
    ["customer-a"],
  );
});
