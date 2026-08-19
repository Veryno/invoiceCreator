import assert from "node:assert/strict";
import test from "node:test";
import {
  archiveWorkspaceRecord,
  createInvoiceInWorkspace,
  createWorkspace,
  normalizeWorkspace,
  upsertWorkspaceRecord,
} from "../src/lib/workspace.js";

function deterministicOptions(now = "2026-08-19T12:00:00.000Z") {
  let sequence = 0;
  return {
    now,
    idFactory(prefix) {
      sequence += 1;
      return `${prefix}:regression-${sequence}`;
    },
  };
}

test("explicit invoice numbers advance the sequence without allowing it to move backward", () => {
  const options = deterministicOptions();
  let workspace = createWorkspace(options);

  workspace = createInvoiceInWorkspace(workspace, {
    meta: { number: "INV-2026-042" },
  }, {
    ...options,
    id: "invoice:imported",
  }).workspace;

  assert.equal(workspace.preferences.numbering.nextSequence, 43);

  const generated = createInvoiceInWorkspace(workspace, {}, {
    ...options,
    id: "invoice:generated",
  });
  assert.equal(generated.record.invoice.meta.number, "INV-2026-043");

  const highSequenceWorkspace = normalizeWorkspace({
    ...generated.workspace,
    preferences: {
      ...generated.workspace.preferences,
      numbering: {
        ...generated.workspace.preferences.numbering,
        nextSequence: 500,
      },
    },
  }, options);
  const olderImport = createInvoiceInWorkspace(highSequenceWorkspace, {
    meta: { number: "INV-2026-010" },
  }, {
    ...options,
    id: "invoice:older-import",
  });
  assert.equal(olderImport.workspace.preferences.numbering.nextSequence, 501);
});

test("prefixes ending in separators format invoice numbers without doubling the separator", () => {
  const cases = [
    { prefix: "INV-", includeYear: true, expected: "INV-2026-007" },
    { prefix: "JOB/", includeYear: true, expected: "JOB/2026-007" },
    { prefix: "BILL-", includeYear: false, expected: "BILL-007" },
    { prefix: "EST_", includeYear: false, expected: "EST_007" },
  ];

  for (const [index, fixture] of cases.entries()) {
    const options = deterministicOptions();
    const initial = createWorkspace(options);
    const workspace = normalizeWorkspace({
      ...initial,
      preferences: {
        ...initial.preferences,
        numbering: {
          prefix: fixture.prefix,
          nextSequence: 7,
          padding: 3,
          includeYear: fixture.includeYear,
        },
      },
    }, options);
    const created = createInvoiceInWorkspace(workspace, {}, {
      ...options,
      id: `invoice:separator-${index}`,
    });

    assert.equal(created.record.invoice.meta.number, fixture.expected);
    assert.equal(created.workspace.preferences.numbering.nextSequence, 8);
  }
});

test("an imported number still advances numbering when the configured prefix owns its separator", () => {
  const options = deterministicOptions();
  const initial = createWorkspace(options);
  const workspace = normalizeWorkspace({
    ...initial,
    preferences: {
      ...initial.preferences,
      numbering: {
        prefix: "INV-",
        nextSequence: 1,
        padding: 3,
        includeYear: true,
      },
    },
  }, options);

  const imported = createInvoiceInWorkspace(workspace, {
    meta: { number: "INV-2026-042" },
  }, {
    ...options,
    id: "invoice:separator-import",
  });
  const generated = createInvoiceInWorkspace(imported.workspace, {}, {
    ...options,
    id: "invoice:separator-next",
  });

  assert.equal(imported.workspace.preferences.numbering.nextSequence, 43);
  assert.equal(generated.record.invoice.meta.number, "INV-2026-043");
});

test("archiving the default custom template repairs future defaults without rewriting history", () => {
  const options = deterministicOptions();
  let workspace = createWorkspace(options);
  ({ workspace } = upsertWorkspaceRecord(workspace, "templates", {
    id: "template:retainer",
    name: "Retainer",
    accentMode: "fixed",
    design: { template: "classic", accentColor: "#123456" },
    content: { notes: "Historical note" },
  }, options));
  workspace = normalizeWorkspace({
    ...workspace,
    preferences: {
      ...workspace.preferences,
      defaultTemplateId: "template:retainer",
    },
  }, options);
  workspace = createInvoiceInWorkspace(workspace, {}, {
    ...options,
    id: "invoice:historical",
  }).workspace;

  const archived = archiveWorkspaceRecord(
    workspace,
    "templates",
    "template:retainer",
    deterministicOptions("2026-08-20T12:00:00.000Z"),
  );

  assert.equal(archived.preferences.defaultTemplateId, "builtin:modern");
  assert.equal(archived.invoices[0].templateId, "template:retainer");
  assert.equal(archived.invoices[0].invoice.design.template, "classic");
  assert.equal(archived.invoices[0].invoice.design.accentColor, "#123456");
  assert.equal(archived.invoices[0].invoice.content.notes, "Historical note");
});

test("future-feature records keep bounded financial and schedule values across partial updates", () => {
  const firstOptions = deterministicOptions();
  let workspace = createWorkspace(firstOptions);

  ({ workspace } = upsertWorkspaceRecord(workspace, "catalog", {
    id: "catalog:service",
    name: "Inspection",
    rate: -25,
    taxable: false,
  }, firstOptions));
  ({ workspace } = upsertWorkspaceRecord(workspace, "payments", {
    id: "payment:one",
    invoiceId: "invoice:missing",
    amount: Number.POSITIVE_INFINITY,
    currency: "cad",
  }, firstOptions));
  ({ workspace } = upsertWorkspaceRecord(workspace, "recurring", {
    id: "recurring:monthly",
    name: "Monthly service",
    schedule: { unit: "month", interval: 999 },
  }, firstOptions));

  const updated = upsertWorkspaceRecord(workspace, "recurring", {
    id: "recurring:monthly",
    schedule: { interval: 2 },
  }, deterministicOptions("2026-08-20T12:00:00.000Z"));

  assert.equal(updated.workspace.catalog[0].rate, 0);
  assert.equal(updated.workspace.catalog[0].taxable, false);
  assert.equal(updated.workspace.payments[0].amount, 0);
  assert.equal(updated.workspace.payments[0].currency, "CAD");
  assert.deepEqual(updated.record.schedule, { unit: "month", interval: 2 });
});
