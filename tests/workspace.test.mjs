import assert from "node:assert/strict";
import test from "node:test";
import {
  WORKSPACE_COLLECTIONS,
  WorkspaceVersionError,
  archiveWorkspaceRecord,
  createInvoiceInWorkspace,
  createWorkspace,
  migrateLegacyDraft,
  normalizeWorkspace,
  setWorkspaceOnboarding,
  upsertWorkspaceRecord,
} from "../src/lib/workspace.js";

function deterministicOptions(now = "2026-08-19T12:00:00.000Z") {
  let sequence = 0;
  return {
    now,
    idFactory(prefix) {
      sequence += 1;
      return `${prefix}:test-${sequence}`;
    },
  };
}

test("creates a complete versioned workspace with bounded defaults", () => {
  const workspace = createWorkspace(deterministicOptions());

  assert.equal(workspace.schemaVersion, 1);
  assert.equal(workspace.revision, 0);
  assert.match(workspace.installId, /^install:/);
  assert.deepEqual(
    Object.fromEntries(WORKSPACE_COLLECTIONS.map((collection) => [collection, workspace[collection]])),
    Object.fromEntries(WORKSPACE_COLLECTIONS.map((collection) => [collection, []])),
  );
  assert.deepEqual(workspace.preferences.numbering, {
    prefix: "INV",
    nextSequence: 1,
    padding: 3,
    includeYear: true,
  });
  assert.deepEqual(workspace.preferences.onboarding.draft, {
    customerMode: "manual",
    selectedCustomerId: null,
    customer: { name: "", email: "", phone: "", address: "" },
  });
});

test("invoice creation captures immutable company, customer, template design, and content snapshots", () => {
  const options = deterministicOptions();
  let workspace = normalizeWorkspace({
    ...createWorkspace(options),
    profile: {
      company: { name: "Snapshot Studio", email: "old@studio.test" },
      defaults: {
        currency: "USD",
        terms: "Net 15",
        content: { notes: "Profile note", paymentInstructions: "ACH" },
        design: { accentColor: "#112233" },
      },
    },
  }, options);

  ({ workspace } = upsertWorkspaceRecord(workspace, "customers", {
    id: "customer:one",
    name: "Original Customer",
    email: "billing@customer.test",
  }, options));
  ({ workspace } = upsertWorkspaceRecord(workspace, "templates", {
    id: "template:one",
    name: "Retainer",
    accentMode: "fixed",
    design: { template: "classic", accentColor: "#445566", font: "Georgia" },
    content: { notes: "Template note", paymentInstructions: "Wire only" },
  }, options));

  const created = createInvoiceInWorkspace(workspace, {
    lineItems: [{ id: "line:one", item: "Service", quantity: 1, rate: 125 }],
  }, {
    ...options,
    id: "invoice:snapshot",
    customerId: "customer:one",
    templateId: "template:one",
  });
  workspace = created.workspace;

  assert.equal(created.record.invoice.company.name, "Snapshot Studio");
  assert.equal(created.record.invoice.customer.name, "Original Customer");
  assert.equal(created.record.invoice.design.template, "classic");
  assert.equal(created.record.invoice.design.accentColor, "#445566");
  assert.deepEqual(created.record.invoice.content, {
    notes: "Template note",
    paymentInstructions: "Wire only",
  });

  ({ workspace } = upsertWorkspaceRecord(workspace, "customers", {
    id: "customer:one",
    name: "Renamed Customer",
  }, { ...options, now: "2026-08-20T12:00:00.000Z" }));
  ({ workspace } = upsertWorkspaceRecord(workspace, "templates", {
    id: "template:one",
    content: { notes: "Changed template note" },
    design: { accentColor: "#AABBCC" },
  }, { ...options, now: "2026-08-20T12:00:00.000Z" }));
  workspace = normalizeWorkspace({
    ...workspace,
    profile: {
      ...workspace.profile,
      company: { ...workspace.profile.company, name: "Renamed Studio" },
    },
  }, options);

  const persisted = workspace.invoices.find(({ id }) => id === "invoice:snapshot");
  assert.equal(persisted.invoice.company.name, "Snapshot Studio");
  assert.equal(persisted.invoice.customer.name, "Original Customer");
  assert.equal(persisted.invoice.design.accentColor, "#445566");
  assert.equal(persisted.invoice.content.notes, "Template note");
  assert.equal(workspace.templates[0].content.paymentInstructions, "Wire only");

  const secondInvoice = createInvoiceInWorkspace(workspace, {}, {
    ...options,
    id: "invoice:second-snapshot",
  });
  assert.equal(secondInvoice.workspace.invoices.length, 2);
});

test("record upserts preserve stable ids and creation timestamps", () => {
  const firstOptions = deterministicOptions("2026-08-19T12:00:00.000Z");
  const secondOptions = deterministicOptions("2026-08-21T09:30:00.000Z");
  let workspace = createWorkspace(firstOptions);

  const fixtures = {
    invoices: { id: "invoice:stable", invoice: { meta: { number: "INV-1" } } },
    customers: { id: "customer:stable", name: "First" },
    templates: { id: "template:stable", name: "First" },
    catalog: { id: "catalog:stable", name: "First" },
    payments: { id: "payment:stable", amount: 50 },
    recurring: { id: "recurring:stable", name: "First" },
    estimates: { id: "estimate:stable", estimate: { meta: { number: "EST-1" } } },
  };

  for (const collection of WORKSPACE_COLLECTIONS) {
    const first = upsertWorkspaceRecord(workspace, collection, fixtures[collection], firstOptions);
    workspace = first.workspace;
    const second = upsertWorkspaceRecord(workspace, collection, {
      ...fixtures[collection],
      name: "Updated",
    }, secondOptions);
    workspace = second.workspace;
    assert.equal(second.record.id, fixtures[collection].id);
    assert.equal(second.record.createdAt, "2026-08-19T12:00:00.000Z");
    assert.equal(second.record.updatedAt, "2026-08-21T09:30:00.000Z");
  }
});

test("number formatting honors prefix, year choice, and bounded padding", () => {
  const options = deterministicOptions();
  const workspace = normalizeWorkspace({
    ...createWorkspace(options),
    preferences: {
      ...createWorkspace(options).preferences,
      numbering: { prefix: "BILL", nextSequence: 7, padding: 5, includeYear: false },
    },
  }, options);

  const created = createInvoiceInWorkspace(workspace, {}, { ...options, id: "invoice:numbered" });
  assert.equal(created.record.invoice.meta.number, "BILL-00007");
  assert.equal(created.workspace.preferences.numbering.nextSequence, 8);

  const bounded = normalizeWorkspace({
    ...workspace,
    preferences: {
      ...workspace.preferences,
      numbering: { ...workspace.preferences.numbering, padding: 99 },
    },
  }, options);
  assert.equal(bounded.preferences.numbering.padding, 8);
});

test("onboarding is skippable and resumable with a deep-merged customer draft", () => {
  const initial = createWorkspace(deterministicOptions());
  const started = setWorkspaceOnboarding(initial, {
    status: "inProgress",
    currentStep: "customer",
    completedSteps: ["welcome"],
    draft: {
      customerMode: "manual",
      customer: { name: "Partially Entered", email: "draft@example.test" },
    },
  }, deterministicOptions("2026-08-19T13:00:00.000Z"));
  const resumed = setWorkspaceOnboarding(started, {
    currentStep: "customer",
    draft: { customer: { phone: "555-0123" } },
  }, deterministicOptions("2026-08-20T13:00:00.000Z"));

  assert.equal(resumed.preferences.onboarding.status, "inProgress");
  assert.equal(resumed.preferences.onboarding.startedAt, "2026-08-19T13:00:00.000Z");
  assert.deepEqual(resumed.preferences.onboarding.draft, {
    customerMode: "manual",
    selectedCustomerId: null,
    customer: {
      name: "Partially Entered",
      email: "draft@example.test",
      phone: "555-0123",
      address: "",
    },
  });

  const bounded = setWorkspaceOnboarding(resumed, {
    draft: { customer: { address: "x".repeat(5_000) } },
  }, deterministicOptions("2026-08-20T14:00:00.000Z"));
  assert.equal(bounded.preferences.onboarding.draft.customer.address.length, 4_000);

  const skipped = setWorkspaceOnboarding(bounded, {
    status: "skipped",
    skipReason: "later",
  }, deterministicOptions("2026-08-21T13:00:00.000Z"));
  assert.equal(skipped.preferences.onboarding.skippedAt, "2026-08-21T13:00:00.000Z");

  const cleared = setWorkspaceOnboarding(skipped, {
    status: "completed",
    completedSteps: ["welcome", "company", "customer", "finish"],
    draft: null,
  }, deterministicOptions("2026-08-22T13:00:00.000Z"));
  assert.equal(cleared.preferences.onboarding.completedAt, "2026-08-22T13:00:00.000Z");
  assert.deepEqual(cleared.preferences.onboarding.draft.customer, {
    name: "",
    email: "",
    phone: "",
    address: "",
  });
});

test("legacy draft migration imports once and preserves the existing draft snapshot", () => {
  const options = deterministicOptions();
  const legacy = JSON.stringify({
    company: { name: "Legacy Company" },
    customer: { name: "Legacy Customer" },
    meta: { number: "INV-2026-042" },
    lineItems: [{ id: "old-line", item: "Consulting", quantity: 2, rate: 75 }],
  });
  const first = migrateLegacyDraft(createWorkspace(options), legacy, options);

  assert.equal(first.migrated, true);
  assert.equal(first.workspace.invoices.length, 1);
  assert.equal(first.workspace.customers.length, 1);
  assert.equal(first.workspace.invoices[0].invoice.meta.number, "INV-2026-042");
  assert.equal(first.workspace.migrations.legacyDraftV1.completed, true);
  assert.equal(first.workspace.preferences.onboarding.status, "skipped");
  assert.equal(first.workspace.preferences.numbering.nextSequence, 43);

  const nextInvoice = createInvoiceInWorkspace(first.workspace, {}, {
    ...options,
    id: "invoice:after-migration",
  });
  assert.equal(nextInvoice.record.invoice.meta.number, "INV-2026-043");

  const second = migrateLegacyDraft(first.workspace, legacy, options);
  assert.equal(second.migrated, false);
  assert.equal(second.reason, "already-migrated");
  assert.equal(second.workspace.invoices.length, 1);

  const invalid = migrateLegacyDraft(createWorkspace(options), "{not json", options);
  assert.equal(invalid.migrated, false);
  assert.equal(invalid.workspace.migrations.legacyDraftV1.completed, false);
});

test("archiving an active invoice selects another live invoice and rejects future schemas", () => {
  const options = deterministicOptions();
  let workspace = createWorkspace(options);
  workspace = createInvoiceInWorkspace(workspace, {}, { ...options, id: "invoice:first" }).workspace;
  workspace = createInvoiceInWorkspace(workspace, {}, { ...options, id: "invoice:second" }).workspace;
  assert.equal(workspace.preferences.activeInvoiceId, "invoice:second");

  workspace = archiveWorkspaceRecord(workspace, "invoices", "invoice:second", options);
  assert.equal(workspace.preferences.activeInvoiceId, "invoice:first");

  assert.throws(
    () => normalizeWorkspace({ ...workspace, schemaVersion: 99 }, options),
    WorkspaceVersionError,
  );
});
