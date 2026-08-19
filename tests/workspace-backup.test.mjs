import assert from "node:assert/strict";
import test from "node:test";
import {
  LOGO_ASSET_REF_PREFIX,
  WORKSPACE_BACKUP_VERSION,
  WorkspaceBackupError,
  createInvoiceInWorkspace,
  createWorkspace,
  createWorkspaceBackup,
  hydrateWorkspaceLogoAssets,
  normalizeWorkspace,
  parseWorkspaceBackup,
  setWorkspaceOnboarding,
  upsertWorkspaceRecord,
} from "../src/lib/workspace.js";

function deterministicOptions(now = "2026-08-19T12:00:00.000Z") {
  let sequence = 0;
  return {
    now,
    idFactory(prefix) {
      sequence += 1;
      return `${prefix}:backup-${sequence}`;
    },
  };
}

function makePopulatedWorkspace() {
  const options = deterministicOptions();
  let workspace = normalizeWorkspace({
    ...createWorkspace(options),
    revision: 12,
    profile: {
      company: {
        name: "Harbor & Pine",
        email: "billing@harbor-pine.test",
        logo: "data:image/png;base64,c2FmZQ==",
      },
      defaults: {
        currency: "CAD",
        locale: "en-CA",
        terms: "Net 15",
        taxRate: 13,
        content: { notes: "Thank you", paymentInstructions: "E-transfer" },
        design: { template: "classic", accentColor: "#123456", paperSize: "A4" },
      },
    },
  }, options);

  ({ workspace } = upsertWorkspaceRecord(workspace, "customers", {
    id: "customer:backup",
    name: "Riverside Group",
    email: "accounts@riverside.test",
  }, options));
  ({ workspace } = upsertWorkspaceRecord(workspace, "templates", {
    id: "template:backup",
    name: "Retainer",
    accentMode: "fixed",
    design: { template: "classic", accentColor: "#654321" },
  }, options));
  ({ workspace } = upsertWorkspaceRecord(workspace, "catalog", {
    id: "catalog:backup",
    name: "Consulting",
    rate: 175,
  }, options));
  ({ workspace } = createInvoiceInWorkspace(workspace, {
    meta: { number: "INV-2026-012" },
    lineItems: [{ id: "line:backup", item: "Consulting", quantity: 2, rate: 175 }],
  }, {
    ...options,
    id: "invoice:backup",
    customerId: "customer:backup",
    templateId: "template:backup",
  }));
  ({ workspace } = upsertWorkspaceRecord(workspace, "payments", {
    id: "payment:backup",
    invoiceId: "invoice:backup",
    amount: 100,
    currency: "CAD",
    date: "2026-08-19",
  }, options));
  ({ workspace } = upsertWorkspaceRecord(workspace, "recurring", {
    id: "recurring:backup",
    name: "Monthly retainer",
    customerId: "customer:backup",
    schedule: { unit: "month", interval: 1 },
    invoiceSeed: workspace.invoices[0].invoice,
  }, options));
  ({ workspace } = upsertWorkspaceRecord(workspace, "estimates", {
    id: "estimate:backup",
    customerId: "customer:backup",
    estimate: workspace.invoices[0].invoice,
  }, options));
  workspace = setWorkspaceOnboarding(workspace, {
    status: "completed",
    completedSteps: ["company", "defaults", "customer", "review"],
    draft: null,
  }, options);
  return { options, workspace };
}

test("full workspace backups survive a JSON round-trip without losing local records or settings", () => {
  const { options, workspace } = makePopulatedWorkspace();
  const envelope = createWorkspaceBackup(workspace, options);

  assert.deepEqual(Object.keys(envelope), ["app", "backupVersion", "workspace"]);
  assert.equal(envelope.app, "Invoice Studio");
  assert.equal(envelope.backupVersion, WORKSPACE_BACKUP_VERSION);

  const restored = parseWorkspaceBackup(
    JSON.parse(JSON.stringify(envelope)),
    options,
  );
  const expectedVisible = hydrateWorkspaceLogoAssets(envelope.workspace, options);
  assert.deepEqual(restored, expectedVisible);
  assert.equal(envelope.workspace.assets.logos.length, 1);
  assert.ok(envelope.workspace.profile.company.logo.startsWith(LOGO_ASSET_REF_PREFIX));
  assert.equal(
    JSON.stringify(envelope).split("data:image/png;base64,c2FmZQ==").length - 1,
    1,
  );
  assert.equal(expectedVisible.assets.logos.length, 1);
  assert.deepEqual(
    restored.invoices.map(({ id }) => id),
    ["invoice:backup"],
  );
  assert.deepEqual(
    restored.customers.map(({ id }) => id),
    ["customer:backup"],
  );
  assert.deepEqual(
    restored.templates.map(({ id }) => id),
    ["template:backup"],
  );
  assert.equal(restored.profile.company.logo, "data:image/png;base64,c2FmZQ==");
  assert.equal(restored.preferences.onboarding.status, "completed");
  assert.equal(restored.revision, workspace.revision);

  envelope.workspace.profile.company.name = "Changed envelope";
  restored.profile.company.name = "Changed result";
  assert.equal(workspace.profile.company.name, "Harbor & Pine");
});

test("backup parsing rejects unrelated JSON and malformed envelopes", () => {
  const { options, workspace } = makePopulatedWorkspace();
  const valid = createWorkspaceBackup(workspace, options);
  const malformedAssets = structuredClone(valid);
  malformedAssets.workspace.assets.logos[0].dataUrl = "data:image/png;base64,not valid!";
  const invalidValues = [
    null,
    [],
    workspace,
    { company: { name: "Just one invoice" }, lineItems: [] },
    { ...valid, app: "Another app" },
    { ...valid, backupVersion: String(WORKSPACE_BACKUP_VERSION) },
    { ...valid, backupVersion: WORKSPACE_BACKUP_VERSION + 1 },
    { ...valid, workspace: null },
    { ...valid, workspace: [] },
    { ...valid, workspace: {} },
    malformedAssets,
  ];

  for (const value of invalidValues) {
    assert.throws(
      () => parseWorkspaceBackup(value, options),
      (error) => error instanceof WorkspaceBackupError
        && error.code === "WORKSPACE_BACKUP_INVALID",
    );
  }
});

test("backup parsing rejects sparse workspaces instead of filling missing data with defaults", () => {
  const { options, workspace } = makePopulatedWorkspace();
  const valid = createWorkspaceBackup(workspace, options);
  const sparseButContainerShaped = {
    schemaVersion: 1,
    profile: { company: {}, defaults: {} },
    preferences: { numbering: {}, onboarding: {} },
    migrations: {},
    invoices: [],
    customers: [],
    templates: [],
    catalog: [],
    payments: [],
    recurring: [],
    estimates: [],
  };
  const missingInstallId = structuredClone(valid);
  delete missingInstallId.workspace.installId;
  const missingDesign = structuredClone(valid);
  delete missingDesign.workspace.profile.defaults.design;
  const missingMigrationMarker = structuredClone(valid);
  delete missingMigrationMarker.workspace.migrations.legacyDraftV1;
  const wrongCollectionShape = structuredClone(valid);
  wrongCollectionShape.workspace.customers = {};
  const futureWorkspace = structuredClone(valid);
  futureWorkspace.workspace.schemaVersion = 2;

  for (const value of [
    { ...valid, workspace: sparseButContainerShaped },
    missingInstallId,
    missingDesign,
    missingMigrationMarker,
    wrongCollectionShape,
    futureWorkspace,
  ]) {
    assert.throws(
      () => parseWorkspaceBackup(value, options),
      (error) => error instanceof WorkspaceBackupError
        && error.code === "WORKSPACE_BACKUP_INVALID",
    );
  }
});
