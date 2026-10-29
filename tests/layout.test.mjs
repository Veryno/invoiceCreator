import assert from "node:assert/strict";
import test from "node:test";
import { normalizeInvoice } from "../src/lib/invoice.js";
import {
  DEFAULT_SAVED_TEXT,
  appendSavedText,
  filledCustomFields,
  labelFor,
  normalizeLayout,
  normalizeSavedText,
  savedTextTitle,
} from "../src/lib/layout.js";
import {
  archiveWorkspaceRecord,
  createWorkspace,
  normalizeWorkspace,
  restoreWorkspaceRecord,
  upsertWorkspaceRecord,
} from "../src/lib/workspace.js";

const fixedOptions = { now: "2026-10-28T12:00:00.000Z", idFactory: (prefix) => `${prefix}:fixed` };

test("new workspaces get standard labels, all columns, and starter saved text", () => {
  const workspace = createWorkspace(fixedOptions);
  assert.deepEqual(workspace.preferences.layout, {
    labels: {},
    columns: { serviceDate: true, item: true, quantity: true, rate: true, tax: true },
    fields: [],
  });
  assert.deepEqual(workspace.preferences.savedText, DEFAULT_SAVED_TEXT);
  assert.equal(labelFor(workspace.preferences.layout, "quantity"), "Qty");
});

test("existing workspaces keep columns they hid before the shared setting existed", () => {
  const base = createWorkspace(fixedOptions);
  const { layout: _layout, savedText: _savedText, ...preferences } = base.preferences;
  const legacy = normalizeWorkspace({
    ...base,
    profile: { ...base.profile, defaults: { ...base.profile.defaults, design: { ...base.profile.defaults.design, showServiceDate: false } } },
    preferences,
  }, fixedOptions);
  assert.equal(legacy.preferences.layout.columns.serviceDate, false);
  assert.equal(legacy.preferences.layout.columns.item, true);
  assert.equal(legacy.preferences.savedText.length, DEFAULT_SAVED_TEXT.length);
});

test("layout keeps only known labels, valid fields, and boolean columns", () => {
  const layout = normalizeLayout({
    labels: { quantity: "  Hours ", rate: "", bogus: "x", constructor: "y" },
    columns: { quantity: false, rate: "no" },
    fields: [
      { id: "field-permit", label: " Permit # ", section: "job", showOnPdf: true },
      { id: "field-permit", label: "Duplicate" },
      { id: "constructor", label: "Bad id" },
      { id: "field-lot", label: "", section: "elsewhere" },
    ],
  });
  assert.deepEqual(layout.labels, { quantity: "Hours" });
  assert.equal(labelFor(layout, "quantity"), "Hours");
  assert.equal(labelFor(layout, "rate"), "Rate");
  assert.equal(layout.columns.quantity, false);
  assert.equal(layout.columns.rate, true);
  assert.deepEqual(layout.fields, [
    { id: "field-permit", label: "Permit #", section: "job", showOnPdf: true },
    { id: "field-lot", label: "Custom field", section: "invoice", showOnPdf: true },
  ]);
});

test("invoices keep custom field values only under field ids", () => {
  const invoice = normalizeInvoice({
    customFields: { "field-permit": " B-24-1187 ", "field-empty": "  ", constructor: "x", __proto__: { polluted: true } },
  });
  assert.deepEqual(invoice.customFields, { "field-permit": "B-24-1187" });
  assert.equal({}.polluted, undefined);
});

test("filled custom fields follow the layout order, section, and PDF setting", () => {
  const layout = normalizeLayout({
    fields: [
      { id: "field-permit", label: "Permit #", section: "job" },
      { id: "field-gate", label: "Gate code", section: "job", showOnPdf: false },
      { id: "field-project", label: "Project #", section: "invoice" },
    ],
  });
  const invoice = { customFields: { "field-gate": "4410", "field-permit": "B-1", "field-project": "" } };
  assert.deepEqual(filledCustomFields(layout, invoice, "job").map(({ label, value }) => [label, value]), [
    ["Permit #", "B-1"],
    ["Gate code", "4410"],
  ]);
  assert.deepEqual(filledCustomFields(layout, invoice, "job", { pdf: true }).map(({ label }) => label), ["Permit #"]);
  assert.deepEqual(filledCustomFields(layout, invoice, "invoice"), []);
});

test("saved text keeps an emptied list and drops invalid entries", () => {
  assert.deepEqual(normalizeSavedText([]), []);
  assert.deepEqual(normalizeSavedText([
    { id: "text-a", title: "", body: " Net 30 " },
    { id: "text-a", title: "Dupe", body: "x" },
    { id: "nope", title: "Bad", body: "x" },
  ]), [{ id: "text-a", title: "Saved text", body: "Net 30" }]);
});

test("saved text is appended after existing text and titled from its first words", () => {
  assert.equal(appendSavedText("", "Thanks"), "Thanks");
  assert.equal(appendSavedText("Line one\n", "Thanks"), "Line one\n\nThanks");
  assert.equal(savedTextTitle("Net 30"), "Net 30");
  assert.equal(savedTextTitle("All work is warranted for one year from the date of completion."), "All work is warranted for one…");
  assert.equal(savedTextTitle("   "), "Saved text");
});

test("deleted records can be restored", () => {
  const created = upsertWorkspaceRecord(createWorkspace(fixedOptions), "customers", { name: "Riverside" }, fixedOptions);
  const id = created.record.id;
  const archived = archiveWorkspaceRecord(created.workspace, "customers", id, fixedOptions);
  assert.ok(archived.customers[0].archivedAt);
  const restored = restoreWorkspaceRecord(archived, "customers", id, fixedOptions);
  assert.equal(restored.customers[0].archivedAt, null);
  assert.throws(() => restoreWorkspaceRecord(archived, "nothing", id), TypeError);
});
