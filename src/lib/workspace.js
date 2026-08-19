import { normalizeInvoice } from "./invoice.js";

export const WORKSPACE_SCHEMA_VERSION = 1;
export const ONBOARDING_FLOW_VERSION = 1;
export const WORKSPACE_BACKUP_VERSION = 1;
export const LOGO_ASSET_REF_PREFIX = "invoice-studio-logo:";
export const MAX_LOGO_ASSET_BYTES = 2_500_000;
export const MAX_LOGO_ASSETS = 5_000;
export const LEGACY_DRAFT_STORAGE_KEY = "invoice-studio:draft:v1";
export const BUILTIN_TEMPLATE_IDS = Object.freeze([
  "builtin:modern",
  "builtin:classic",
  "builtin:minimal",
]);
export const WORKSPACE_COLLECTIONS = Object.freeze([
  "invoices",
  "customers",
  "templates",
  "catalog",
  "payments",
  "recurring",
  "estimates",
]);

const TEMPLATE_LAYOUTS = new Set(["modern", "classic", "minimal"]);
const ONBOARDING_STATUSES = new Set(["notStarted", "inProgress", "completed", "skipped"]);
const ONBOARDING_CUSTOMER_MODES = new Set(["manual", "import", "skip"]);
const RECURRING_UNITS = new Set(["week", "month", "year"]);
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const EMBEDDED_LOGO_PATTERN = /^data:image\/(?:png|jpeg|webp);base64,([A-Za-z0-9+/]*={0,2})$/iu;
const MAX_SHORT_TEXT = 240;
const MAX_LONG_TEXT = 20_000;

export class WorkspaceVersionError extends Error {
  constructor(version) {
    super(`Workspace schema version ${String(version)} is newer than this app supports.`);
    this.name = "WorkspaceVersionError";
    this.code = "WORKSPACE_VERSION_UNSUPPORTED";
  }
}

export class WorkspaceBackupError extends Error {
  constructor(message) {
    super(message);
    this.name = "WorkspaceBackupError";
    this.code = "WORKSPACE_BACKUP_INVALID";
  }
}

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function safeText(value, fallback = "", maximum = MAX_SHORT_TEXT) {
  if (value === null || value === undefined) return fallback;
  return String(value).trim().slice(0, maximum);
}

function safeNullableText(value, maximum = MAX_SHORT_TEXT) {
  const result = safeText(value, "", maximum);
  return result || null;
}

function safeNumber(value, fallback = 0, { minimum = -Number.MAX_SAFE_INTEGER, maximum = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, parsed));
}

function safeInteger(value, fallback = 0, bounds = {}) {
  return Math.trunc(safeNumber(value, fallback, bounds));
}

function safeBoolean(value, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function safeIso(value, fallback) {
  if (typeof value !== "string" || !value.trim()) return fallback;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : fallback;
}

function resolveNow(options = {}) {
  const value = typeof options.now === "function" ? options.now() : options.now;
  const timestamp = value instanceof Date ? value : value ? new Date(value) : new Date();
  if (Number.isNaN(timestamp.getTime())) return new Date().toISOString();
  return timestamp.toISOString();
}

function fallbackId(prefix = "record") {
  const random = globalThis.crypto?.randomUUID?.();
  if (random) return `${prefix}:${random}`;
  return `${prefix}:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function createId(prefix, options = {}) {
  const generated = typeof options.idFactory === "function"
    ? options.idFactory(prefix)
    : fallbackId(prefix);
  const id = safeText(generated, "", 128);
  return ID_PATTERN.test(id) ? id : fallbackId(prefix);
}

function safeId(value, fallback = null) {
  const id = safeText(value, "", 128);
  return ID_PATTERN.test(id) ? id : fallback;
}

function safeTemplateId(value, fallback = "builtin:modern") {
  const id = safeId(value);
  if (!id) return fallback;
  if (id.startsWith("builtin:") && !BUILTIN_TEMPLATE_IDS.includes(id)) return fallback;
  return id;
}

function isEmbeddedLogo(value) {
  if (typeof value !== "string") return false;
  const match = EMBEDDED_LOGO_PATTERN.exec(value);
  if (!match || match[1].length % 4 !== 0) return false;
  const padding = match[1].endsWith("==") ? 2 : match[1].endsWith("=") ? 1 : 0;
  return (match[1].length / 4) * 3 - padding <= MAX_LOGO_ASSET_BYTES;
}

function isDataImageCandidate(value) {
  return typeof value === "string" && /^data:image\//iu.test(value);
}

function logoAssetReference(id) {
  return `${LOGO_ASSET_REF_PREFIX}${id}`;
}

function logoAssetIdFromReference(value) {
  if (typeof value !== "string" || !value.startsWith(LOGO_ASSET_REF_PREFIX)) return null;
  return safeId(value.slice(LOGO_ASSET_REF_PREFIX.length));
}

function normalizeAssets(value) {
  const source = isPlainObject(value) ? value : {};
  const logos = [];
  const seenIds = new Set();
  for (const candidate of Array.isArray(source.logos) ? source.logos : []) {
    if (!isPlainObject(candidate)) continue;
    const id = safeId(candidate.id);
    if (!id || seenIds.has(id) || !isEmbeddedLogo(candidate.dataUrl)) continue;
    seenIds.add(id);
    logos.push({ id, dataUrl: candidate.dataUrl });
  }
  return { logos };
}

function logoAssetsHaveValidShape(value) {
  if (!isPlainObject(value) || !Array.isArray(value.logos) || value.logos.length > MAX_LOGO_ASSETS) {
    return false;
  }
  const ids = new Set();
  const dataUrls = new Set();
  return value.logos.every((asset) => {
    if (!isPlainObject(asset)) return false;
    const id = safeId(asset.id);
    if (!id || id !== asset.id || ids.has(id) || !isEmbeddedLogo(asset.dataUrl) || dataUrls.has(asset.dataUrl)) {
      return false;
    }
    ids.add(id);
    dataUrls.add(asset.dataUrl);
    return true;
  });
}

function mapDocumentLogo(document, mapper) {
  if (!isPlainObject(document) || !isPlainObject(document.company)) return document;
  const logo = mapper(document.company.logo);
  if (logo === document.company.logo) return document;
  return { ...document, company: { ...document.company, logo } };
}

function mapWorkspaceLogos(workspace, mapper) {
  const profileLogo = mapper(workspace.profile.company.logo);
  return {
    ...workspace,
    profile: profileLogo === workspace.profile.company.logo
      ? workspace.profile
      : {
          ...workspace.profile,
          company: { ...workspace.profile.company, logo: profileLogo },
        },
    invoices: workspace.invoices.map((record) => {
      const invoice = mapDocumentLogo(record.invoice, mapper);
      return invoice === record.invoice ? record : { ...record, invoice };
    }),
    recurring: workspace.recurring.map((record) => {
      const invoiceSeed = mapDocumentLogo(record.invoiceSeed, mapper);
      return invoiceSeed === record.invoiceSeed ? record : { ...record, invoiceSeed };
    }),
    estimates: workspace.estimates.map((record) => {
      const estimate = mapDocumentLogo(record.estimate, mapper);
      return estimate === record.estimate ? record : { ...record, estimate };
    }),
  };
}

function uniqueAssetId(options, usedIds) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const id = createId("logo", options);
    if (!usedIds.has(id)) return id;
  }
  let id = fallbackId("logo");
  while (usedIds.has(id)) id = fallbackId("logo");
  return id;
}

function cloneInvoice(invoice) {
  return normalizeInvoice(invoice);
}

function copyDesign(design) {
  return cloneInvoice({ design, lineItems: [] }).design;
}

function copyContent(content) {
  return cloneInvoice({ content, lineItems: [] }).content;
}

function contactHasData(contact) {
  return Boolean(contact && Object.values(contact).some((value) => safeText(value)));
}

function uniqueRecords(records, normalizer, options) {
  const byId = new Map();
  if (!Array.isArray(records)) return [];
  for (const value of records) {
    const normalized = normalizer(value, options);
    if (!byId.has(normalized.id)) byId.set(normalized.id, normalized);
  }
  return [...byId.values()];
}

function makeTimestamps(source, options) {
  const now = resolveNow(options);
  const createdAt = safeIso(source?.createdAt, now);
  return {
    createdAt,
    updatedAt: safeIso(source?.updatedAt, createdAt),
  };
}

function normalizeCustomerContact(value) {
  const source = isPlainObject(value) ? value : {};
  return {
    name: safeText(source.name, "", MAX_SHORT_TEXT),
    email: safeText(source.email, "", MAX_SHORT_TEXT),
    phone: safeText(source.phone, "", MAX_SHORT_TEXT),
    address: safeText(source.address, "", 4_000),
  };
}

function normalizeOnboarding(value, options = {}) {
  const source = isPlainObject(value) ? value : {};
  const sourceDraft = isPlainObject(source.draft) ? source.draft : {};
  const customerMode = ONBOARDING_CUSTOMER_MODES.has(sourceDraft.customerMode)
    ? sourceDraft.customerMode
    : "manual";
  const status = ONBOARDING_STATUSES.has(source.status) ? source.status : "notStarted";
  const completedSteps = Array.isArray(source.completedSteps)
    ? [...new Set(source.completedSteps.map((step) => safeText(step, "", 80)).filter(Boolean))].slice(0, 32)
    : [];

  return {
    flowVersion: safeInteger(source.flowVersion, ONBOARDING_FLOW_VERSION, { minimum: 1, maximum: 100 }),
    status,
    currentStep: safeNullableText(source.currentStep, 80),
    completedSteps,
    startedAt: safeIso(source.startedAt, null),
    completedAt: safeIso(source.completedAt, null),
    skippedAt: safeIso(source.skippedAt, null),
    skipReason: safeNullableText(source.skipReason, 120),
    draft: {
      customerMode,
      selectedCustomerId: safeId(sourceDraft.selectedCustomerId),
      customer: normalizeCustomerContact(sourceDraft.customer),
    },
    updatedAt: safeIso(source.updatedAt, resolveNow(options)),
  };
}

function normalizeProfile(value) {
  const source = isPlainObject(value) ? value : {};
  const defaults = isPlainObject(source.defaults) ? source.defaults : {};
  const normalized = cloneInvoice({
    company: source.company,
    meta: {
      currency: defaults.currency,
      locale: defaults.locale,
      terms: defaults.terms,
    },
    adjustments: { taxRate: defaults.taxRate },
    content: defaults.content,
    design: defaults.design,
    lineItems: [],
  });

  return {
    company: normalized.company,
    defaults: {
      currency: normalized.meta.currency,
      locale: normalized.meta.locale,
      terms: normalized.meta.terms,
      taxRate: normalized.adjustments.taxRate,
      content: normalized.content,
      design: normalized.design,
    },
  };
}

export function createInvoiceRecord(value = {}, options = {}) {
  const source = isPlainObject(value) ? value : {};
  const timestamps = makeTimestamps(source, options);
  const invoiceSource = isPlainObject(source.invoice)
    ? source.invoice
    : isPlainObject(source.document)
      ? source.document
      : source;

  return {
    id: safeId(source.id, createId("invoice", options)),
    customerId: safeId(source.customerId),
    templateId: safeTemplateId(source.templateId || `builtin:${safeText(invoiceSource?.design?.template, "modern", 32)}`),
    createdAt: timestamps.createdAt,
    updatedAt: timestamps.updatedAt,
    lastExportedAt: safeIso(source.lastExportedAt, null),
    archivedAt: safeIso(source.archivedAt, null),
    invoice: cloneInvoice(invoiceSource),
  };
}

export function createCustomerRecord(value = {}, options = {}) {
  const source = isPlainObject(value) ? value : {};
  const timestamps = makeTimestamps(source, options);
  return {
    id: safeId(source.id, createId("customer", options)),
    name: safeText(source.name, "", MAX_SHORT_TEXT),
    email: safeText(source.email, "", MAX_SHORT_TEXT),
    phone: safeText(source.phone, "", MAX_SHORT_TEXT),
    address: safeText(source.address, "", 4_000),
    notes: safeText(source.notes, "", MAX_LONG_TEXT),
    createdAt: timestamps.createdAt,
    updatedAt: timestamps.updatedAt,
    archivedAt: safeIso(source.archivedAt, null),
  };
}

export function createTemplateRecord(value = {}, options = {}) {
  const source = isPlainObject(value) ? value : {};
  const timestamps = makeTimestamps(source, options);
  const requestedLayout = safeText(source.design?.template || source.baseLayout, "modern", 32);
  const baseLayout = TEMPLATE_LAYOUTS.has(requestedLayout) ? requestedLayout : "modern";
  const design = copyDesign({ ...(isPlainObject(source.design) ? source.design : {}), template: baseLayout });
  return {
    id: safeId(source.id, createId("template", options)),
    name: safeText(source.name, "Custom template", 120) || "Custom template",
    baseLayout,
    accentMode: source.accentMode === "fixed" ? "fixed" : "inherit",
    design,
    content: copyContent(source.content),
    createdAt: timestamps.createdAt,
    updatedAt: timestamps.updatedAt,
    archivedAt: safeIso(source.archivedAt, null),
  };
}

export function createCatalogRecord(value = {}, options = {}) {
  const source = isPlainObject(value) ? value : {};
  const timestamps = makeTimestamps(source, options);
  return {
    id: safeId(source.id, createId("catalog", options)),
    name: safeText(source.name, "", MAX_SHORT_TEXT),
    sku: safeText(source.sku, "", 120),
    description: safeText(source.description, "", MAX_LONG_TEXT),
    unit: safeText(source.unit, "each", 60) || "each",
    rate: safeNumber(source.rate, 0, { minimum: 0, maximum: 1_000_000_000 }),
    taxable: safeBoolean(source.taxable, true),
    createdAt: timestamps.createdAt,
    updatedAt: timestamps.updatedAt,
    archivedAt: safeIso(source.archivedAt, null),
  };
}

export function createPaymentRecord(value = {}, options = {}) {
  const source = isPlainObject(value) ? value : {};
  const timestamps = makeTimestamps(source, options);
  const normalized = cloneInvoice({ meta: { currency: source.currency }, lineItems: [] });
  return {
    id: safeId(source.id, createId("payment", options)),
    invoiceId: safeId(source.invoiceId),
    amount: safeNumber(source.amount, 0, { minimum: 0, maximum: 1_000_000_000 }),
    currency: normalized.meta.currency,
    date: safeText(source.date, "", 32),
    method: safeText(source.method, "", 120),
    reference: safeText(source.reference, "", MAX_SHORT_TEXT),
    notes: safeText(source.notes, "", MAX_LONG_TEXT),
    createdAt: timestamps.createdAt,
    updatedAt: timestamps.updatedAt,
    voidedAt: safeIso(source.voidedAt, null),
  };
}

export function createRecurringRecord(value = {}, options = {}) {
  const source = isPlainObject(value) ? value : {};
  const timestamps = makeTimestamps(source, options);
  const schedule = isPlainObject(source.schedule) ? source.schedule : {};
  const unit = RECURRING_UNITS.has(schedule.unit) ? schedule.unit : "month";
  return {
    id: safeId(source.id, createId("recurring", options)),
    name: safeText(source.name, "Recurring invoice", 120) || "Recurring invoice",
    enabled: safeBoolean(source.enabled, false),
    customerId: safeId(source.customerId),
    templateId: safeTemplateId(source.templateId),
    schedule: {
      unit,
      interval: safeInteger(schedule.interval, 1, { minimum: 1, maximum: 365 }),
    },
    nextRunDate: safeText(source.nextRunDate, "", 32),
    lastRunAt: safeIso(source.lastRunAt, null),
    invoiceSeed: cloneInvoice(source.invoiceSeed),
    createdAt: timestamps.createdAt,
    updatedAt: timestamps.updatedAt,
    archivedAt: safeIso(source.archivedAt, null),
  };
}

export function createEstimateRecord(value = {}, options = {}) {
  const source = isPlainObject(value) ? value : {};
  const timestamps = makeTimestamps(source, options);
  return {
    id: safeId(source.id, createId("estimate", options)),
    customerId: safeId(source.customerId),
    templateId: safeTemplateId(source.templateId),
    convertedInvoiceId: safeId(source.convertedInvoiceId),
    createdAt: timestamps.createdAt,
    updatedAt: timestamps.updatedAt,
    archivedAt: safeIso(source.archivedAt, null),
    estimate: cloneInvoice(source.estimate || source.invoice || source.document),
  };
}

const COLLECTION_NORMALIZERS = Object.freeze({
  invoices: createInvoiceRecord,
  customers: createCustomerRecord,
  templates: createTemplateRecord,
  catalog: createCatalogRecord,
  payments: createPaymentRecord,
  recurring: createRecurringRecord,
  estimates: createEstimateRecord,
});

export function createWorkspace(options = {}) {
  const now = resolveNow(options);
  const initial = {
    schemaVersion: WORKSPACE_SCHEMA_VERSION,
    revision: 0,
    installId: createId("install", options),
    createdAt: now,
    updatedAt: now,
    profile: normalizeProfile(options.profile),
    assets: { logos: [] },
    preferences: {
      activeInvoiceId: null,
      defaultTemplateId: "builtin:modern",
      numbering: { prefix: "INV", nextSequence: 1, padding: 3, includeYear: true },
      onboarding: normalizeOnboarding({}, options),
    },
    invoices: [],
    customers: [],
    templates: [],
    catalog: [],
    payments: [],
    recurring: [],
    estimates: [],
    migrations: {
      legacyDraftV1: {
        completed: false,
        importedAt: null,
        invoiceId: null,
      },
    },
  };

  return normalizeWorkspace(initial, options);
}

export function normalizeWorkspace(value, options = {}) {
  if (!isPlainObject(value)) return createWorkspace(options);
  const version = safeInteger(value.schemaVersion, WORKSPACE_SCHEMA_VERSION, { minimum: 0, maximum: 1_000_000 });
  if (version > WORKSPACE_SCHEMA_VERSION) throw new WorkspaceVersionError(version);

  const now = resolveNow(options);
  const createdAt = safeIso(value.createdAt, now);
  const sourcePreferences = isPlainObject(value.preferences) ? value.preferences : {};
  const sourceNumbering = isPlainObject(sourcePreferences.numbering) ? sourcePreferences.numbering : {};
  const sourceMigrations = isPlainObject(value.migrations) ? value.migrations : {};
  const sourceLegacyMigration = isPlainObject(sourceMigrations.legacyDraftV1)
    ? sourceMigrations.legacyDraftV1
    : {};

  const workspace = {
    schemaVersion: WORKSPACE_SCHEMA_VERSION,
    revision: safeInteger(value.revision, 0, { minimum: 0, maximum: Number.MAX_SAFE_INTEGER }),
    installId: safeId(value.installId, createId("install", options)),
    createdAt,
    updatedAt: safeIso(value.updatedAt, createdAt),
    profile: normalizeProfile(value.profile),
    assets: normalizeAssets(value.assets),
    preferences: {
      activeInvoiceId: safeId(sourcePreferences.activeInvoiceId),
      defaultTemplateId: safeTemplateId(sourcePreferences.defaultTemplateId),
      numbering: {
        prefix: safeText(sourceNumbering.prefix, "INV", 24) || "INV",
        nextSequence: safeInteger(sourceNumbering.nextSequence, 1, { minimum: 1, maximum: 999_999_999 }),
        padding: safeInteger(sourceNumbering.padding, 3, { minimum: 1, maximum: 8 }),
        includeYear: safeBoolean(sourceNumbering.includeYear, true),
      },
      onboarding: normalizeOnboarding(sourcePreferences.onboarding, options),
    },
    invoices: uniqueRecords(value.invoices, createInvoiceRecord, options),
    customers: uniqueRecords(value.customers, createCustomerRecord, options),
    templates: uniqueRecords(value.templates, createTemplateRecord, options),
    catalog: uniqueRecords(value.catalog, createCatalogRecord, options),
    payments: uniqueRecords(value.payments, createPaymentRecord, options),
    recurring: uniqueRecords(value.recurring, createRecurringRecord, options),
    estimates: uniqueRecords(value.estimates, createEstimateRecord, options),
    migrations: {
      legacyDraftV1: {
        completed: safeBoolean(sourceLegacyMigration.completed, false),
        importedAt: safeIso(sourceLegacyMigration.importedAt, null),
        invoiceId: safeId(sourceLegacyMigration.invoiceId),
      },
    },
  };

  const customerIds = new Set(workspace.customers.map(({ id }) => id));
  const customTemplateIds = new Set(workspace.templates.map(({ id }) => id));
  const liveCustomTemplateIds = new Set(
    workspace.templates.filter(({ archivedAt }) => !archivedAt).map(({ id }) => id),
  );
  workspace.invoices = workspace.invoices.map((record) => ({
    ...record,
    customerId: customerIds.has(record.customerId) ? record.customerId : null,
    templateId: BUILTIN_TEMPLATE_IDS.includes(record.templateId) || customTemplateIds.has(record.templateId)
      ? record.templateId
      : "builtin:modern",
  }));
  const liveInvoiceIds = new Set(
    workspace.invoices.filter(({ archivedAt }) => !archivedAt).map(({ id }) => id),
  );
  if (!liveInvoiceIds.has(workspace.preferences.activeInvoiceId)) {
    workspace.preferences.activeInvoiceId = workspace.invoices.find(({ archivedAt }) => !archivedAt)?.id || null;
  }
  if (
    !BUILTIN_TEMPLATE_IDS.includes(workspace.preferences.defaultTemplateId)
    && !liveCustomTemplateIds.has(workspace.preferences.defaultTemplateId)
  ) {
    workspace.preferences.defaultTemplateId = "builtin:modern";
  }

  return workspace;
}

/**
 * Replaces repeated embedded logo data with references to one workspace asset.
 * This is the canonical form written by repositories and workspace backups.
 */
export function compactWorkspaceLogoAssets(value, options = {}) {
  const workspace = normalizeWorkspace(value, options);
  const logos = [];
  const usedIds = new Set();
  const idAliases = new Map();
  const dataToId = new Map();
  const referencedIds = new Set();
  let changed = false;

  for (const asset of workspace.assets.logos) {
    const existingId = dataToId.get(asset.dataUrl);
    if (existingId) {
      idAliases.set(asset.id, existingId);
      changed = true;
      continue;
    }
    usedIds.add(asset.id);
    dataToId.set(asset.dataUrl, asset.id);
    logos.push(asset);
  }

  const compactLogo = (logo) => {
    const referencedId = logoAssetIdFromReference(logo);
    if (referencedId) {
      const canonicalId = idAliases.get(referencedId) || referencedId;
      if (canonicalId !== referencedId) changed = true;
      if (!usedIds.has(canonicalId)) {
        changed = true;
        return "";
      }
      referencedIds.add(canonicalId);
      return logoAssetReference(canonicalId);
    }
    if (typeof logo === "string" && logo.startsWith(LOGO_ASSET_REF_PREFIX)) {
      changed = true;
      return "";
    }
    if (!isEmbeddedLogo(logo)) {
      if (isDataImageCandidate(logo)) {
        changed = true;
        return "";
      }
      return logo;
    }
    let id = dataToId.get(logo);
    if (!id) {
      id = uniqueAssetId(options, usedIds);
      usedIds.add(id);
      dataToId.set(logo, id);
      logos.push({ id, dataUrl: logo });
    }
    referencedIds.add(id);
    changed = true;
    return logoAssetReference(id);
  };

  const compacted = mapWorkspaceLogos(workspace, compactLogo);
  const referencedLogos = logos.filter(({ id }) => referencedIds.has(id));
  if (referencedLogos.length !== logos.length) changed = true;
  return {
    changed,
    workspace: { ...compacted, assets: { logos: referencedLogos } },
  };
}

/** Restores logo data URLs at the repository boundary for existing UI/PDF code. */
export function hydrateWorkspaceLogoAssets(value, options = {}) {
  const workspace = normalizeWorkspace(value, options);
  const dataById = new Map(
    workspace.assets.logos.map(({ id, dataUrl }) => [id, dataUrl]),
  );
  return mapWorkspaceLogos(workspace, (logo) => {
    const id = logoAssetIdFromReference(logo);
    return id && dataById.has(id) ? dataById.get(id) : logo;
  });
}

/**
 * Produces the complete, versioned envelope used by Settings backup/restore.
 */
export function createWorkspaceBackup(value, options = {}) {
  const compacted = compactWorkspaceLogoAssets(value, options).workspace;
  return {
    app: "Invoice Studio",
    backupVersion: WORKSPACE_BACKUP_VERSION,
    workspace: compacted,
  };
}

/**
 * Accepts only backups produced by createWorkspaceBackup. Sparse or unrelated
 * JSON must never normalize into an empty workspace and replace local data.
 */
export function parseWorkspaceBackup(value, options = {}) {
  if (!isPlainObject(value)
    || value.app !== "Invoice Studio"
    || value.backupVersion !== WORKSPACE_BACKUP_VERSION
    || !isPlainObject(value.workspace)) {
    throw new WorkspaceBackupError("That file is not an Invoice Studio workspace backup.");
  }

  const source = value.workspace;
  const hasCompleteShape = source.schemaVersion === WORKSPACE_SCHEMA_VERSION
    && Number.isSafeInteger(source.revision)
    && source.revision >= 0
    && typeof source.installId === "string"
    && ID_PATTERN.test(source.installId)
    && typeof source.createdAt === "string"
    && Number.isFinite(Date.parse(source.createdAt))
    && typeof source.updatedAt === "string"
    && Number.isFinite(Date.parse(source.updatedAt))
    && isPlainObject(source.profile)
    && isPlainObject(source.profile.company)
    && isPlainObject(source.profile.defaults)
    && isPlainObject(source.profile.defaults.content)
    && isPlainObject(source.profile.defaults.design)
    && (source.assets === undefined || logoAssetsHaveValidShape(source.assets))
    && isPlainObject(source.preferences)
    && isPlainObject(source.preferences.numbering)
    && isPlainObject(source.preferences.onboarding)
    && isPlainObject(source.migrations)
    && isPlainObject(source.migrations.legacyDraftV1)
    && WORKSPACE_COLLECTIONS.every((collection) => Array.isArray(source[collection]));

  if (!hasCompleteShape) {
    throw new WorkspaceBackupError("This backup is incomplete or uses an unsupported format.");
  }

  const compacted = compactWorkspaceLogoAssets(source, options).workspace;
  return hydrateWorkspaceLogoAssets(compacted, options);
}

function formatNextInvoiceNumber(workspace, date = new Date()) {
  const { prefix, nextSequence, padding, includeYear } = workspace.preferences.numbering;
  const sequence = String(nextSequence).padStart(padding, "0");
  const separator = /[-_/.\s]$/u.test(prefix) ? "" : "-";
  return includeYear
    ? `${prefix}${separator}${date.getFullYear()}-${sequence}`
    : `${prefix}${separator}${sequence}`;
}

function numberingAfterImportedInvoice(workspace, invoiceNumber) {
  const current = workspace.preferences.numbering;
  const escapedPrefix = current.prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const separator = /[-_/.\s]$/u.test(current.prefix) ? "" : "-";
  const match = new RegExp(`^${escapedPrefix}${separator}(?:\\d{4}-)?(\\d{1,9})$`, "u").exec(
    safeText(invoiceNumber, "", 120),
  );
  if (!match) return current;
  const importedSequence = safeInteger(match[1], 0, { minimum: 0, maximum: 999_999_998 });
  return {
    ...current,
    nextSequence: Math.max(current.nextSequence, importedSequence + 1),
    padding: Math.max(current.padding, Math.min(8, match[1].length)),
  };
}

function templateDesignFor(workspace, templateId) {
  if (BUILTIN_TEMPLATE_IDS.includes(templateId)) {
    return copyDesign({
      ...workspace.profile.defaults.design,
      template: templateId.slice("builtin:".length),
    });
  }
  const template = workspace.templates.find((record) => record.id === templateId && !record.archivedAt);
  if (!template) return workspace.profile.defaults.design;
  return {
    ...template.design,
    accentColor: template.accentMode === "fixed"
      ? template.design.accentColor
      : workspace.profile.defaults.design.accentColor,
  };
}

function templateContentFor(workspace, templateId) {
  if (BUILTIN_TEMPLATE_IDS.includes(templateId)) return workspace.profile.defaults.content;
  const template = workspace.templates.find((record) => record.id === templateId && !record.archivedAt);
  return template?.content || workspace.profile.defaults.content;
}

export function createInvoiceInWorkspace(value, invoiceInput = {}, options = {}) {
  const workspace = normalizeWorkspace(value, options);
  const now = resolveNow(options);
  const customerId = safeId(options.customerId);
  const customer = workspace.customers.find((record) => record.id === customerId && !record.archivedAt);
  const templateId = safeTemplateId(options.templateId || workspace.preferences.defaultTemplateId);
  const defaults = workspace.profile.defaults;
  const source = isPlainObject(invoiceInput) ? invoiceInput : {};
  const invoice = cloneInvoice({
    company: { ...workspace.profile.company, ...(isPlainObject(source.company) ? source.company : {}) },
    customer: { ...(customer || {}), ...(isPlainObject(source.customer) ? source.customer : {}) },
    meta: {
      terms: defaults.terms,
      currency: defaults.currency,
      locale: defaults.locale,
      number: formatNextInvoiceNumber(workspace, new Date(now)),
      ...(isPlainObject(source.meta) ? source.meta : {}),
    },
    lineItems: Array.isArray(source.lineItems) ? source.lineItems : [],
    adjustments: { taxRate: defaults.taxRate, ...(isPlainObject(source.adjustments) ? source.adjustments : {}) },
    content: { ...templateContentFor(workspace, templateId), ...(isPlainObject(source.content) ? source.content : {}) },
    design: { ...templateDesignFor(workspace, templateId), ...(isPlainObject(source.design) ? source.design : {}) },
  });
  const record = createInvoiceRecord({
    id: options.id,
    customerId: customer?.id || null,
    templateId,
    invoice,
    createdAt: now,
    updatedAt: now,
  }, options);
  const importedNumbering = numberingAfterImportedInvoice(workspace, invoice.meta.number);
  const next = {
    ...workspace,
    updatedAt: now,
    invoices: [...workspace.invoices, record],
    preferences: {
      ...workspace.preferences,
      activeInvoiceId: record.id,
      numbering: {
        ...importedNumbering,
        nextSequence: Math.max(
          workspace.preferences.numbering.nextSequence + 1,
          importedNumbering.nextSequence,
        ),
      },
    },
  };
  const normalized = normalizeWorkspace(next, options);
  return {
    workspace: normalized,
    record: normalized.invoices.find(({ id }) => id === record.id),
  };
}

export function upsertWorkspaceRecord(value, collection, recordValue, options = {}) {
  if (!WORKSPACE_COLLECTIONS.includes(collection)) {
    throw new TypeError(`Unknown workspace collection: ${String(collection)}`);
  }
  const workspace = normalizeWorkspace(value, options);
  const normalizer = COLLECTION_NORMALIZERS[collection];
  const requestedId = safeId(recordValue?.id);
  const existing = requestedId
    ? workspace[collection].find((record) => record.id === requestedId)
    : null;
  const now = resolveNow(options);
  const sourceRecord = isPlainObject(recordValue) ? recordValue : {};
  const nestedMerge = existing && collection === "templates"
    ? {
        design: {
          ...existing.design,
          ...(isPlainObject(sourceRecord.design) ? sourceRecord.design : {}),
        },
        content: {
          ...existing.content,
          ...(isPlainObject(sourceRecord.content) ? sourceRecord.content : {}),
        },
      }
    : existing && collection === "recurring"
      ? {
          schedule: {
            ...existing.schedule,
            ...(isPlainObject(sourceRecord.schedule) ? sourceRecord.schedule : {}),
          },
        }
      : {};
  const record = normalizer({
    ...(existing || {}),
    ...sourceRecord,
    ...nestedMerge,
    id: requestedId || undefined,
    createdAt: existing?.createdAt,
    updatedAt: now,
  }, options);
  const records = existing
    ? workspace[collection].map((candidate) => candidate.id === record.id ? record : candidate)
    : [...workspace[collection], record];
  const next = normalizeWorkspace({ ...workspace, [collection]: records, updatedAt: now }, options);
  return {
    workspace: next,
    record: next[collection].find(({ id }) => id === record.id),
  };
}

export function archiveWorkspaceRecord(value, collection, id, options = {}) {
  if (!WORKSPACE_COLLECTIONS.includes(collection)) {
    throw new TypeError(`Unknown workspace collection: ${String(collection)}`);
  }
  const workspace = normalizeWorkspace(value, options);
  const recordId = safeId(id);
  if (!recordId) return workspace;
  const now = resolveNow(options);
  const records = workspace[collection].map((record) => record.id === recordId
    ? { ...record, archivedAt: now, updatedAt: now }
    : record);
  return normalizeWorkspace({ ...workspace, [collection]: records, updatedAt: now }, options);
}

export function setWorkspaceOnboarding(value, patch, options = {}) {
  const workspace = normalizeWorkspace(value, options);
  const now = resolveNow(options);
  const current = workspace.preferences.onboarding;
  const requested = isPlainObject(patch) ? patch : {};
  const status = ONBOARDING_STATUSES.has(requested.status) ? requested.status : current.status;
  const requestedDraft = isPlainObject(requested.draft) ? requested.draft : {};
  const draft = requested.draft === null
    ? {}
    : {
        ...current.draft,
        ...requestedDraft,
        customer: {
          ...current.draft.customer,
          ...(isPlainObject(requestedDraft.customer) ? requestedDraft.customer : {}),
        },
      };
  const onboarding = normalizeOnboarding({
    ...current,
    ...requested,
    status,
    startedAt: status === "inProgress" ? current.startedAt || now : current.startedAt,
    completedAt: status === "completed" ? current.completedAt || now : requested.completedAt ?? current.completedAt,
    skippedAt: status === "skipped" ? current.skippedAt || now : requested.skippedAt ?? current.skippedAt,
    draft,
    updatedAt: now,
  }, options);
  return normalizeWorkspace({
    ...workspace,
    updatedAt: now,
    preferences: { ...workspace.preferences, onboarding },
  }, options);
}

export function migrateLegacyDraft(value, legacyValue, options = {}) {
  const workspace = normalizeWorkspace(value, options);
  if (workspace.migrations.legacyDraftV1.completed) {
    return { workspace, migrated: false, reason: "already-migrated" };
  }
  if (legacyValue === null || legacyValue === undefined || legacyValue === "") {
    return { workspace, migrated: false, reason: "not-found" };
  }

  let parsed = legacyValue;
  if (typeof legacyValue === "string") {
    try {
      parsed = JSON.parse(legacyValue);
    } catch {
      return { workspace, migrated: false, reason: "invalid-json" };
    }
  }
  if (!isPlainObject(parsed)) {
    return { workspace, migrated: false, reason: "invalid-shape" };
  }

  const now = resolveNow(options);
  const invoice = cloneInvoice(parsed);
  let customerId = null;
  let customers = workspace.customers;
  if (contactHasData(invoice.customer)) {
    const customer = createCustomerRecord({ ...invoice.customer, createdAt: now, updatedAt: now }, options);
    customerId = customer.id;
    customers = [...customers, customer];
  }
  const templateId = safeTemplateId(`builtin:${invoice.design.template}`);
  const invoiceRecord = createInvoiceRecord({
    invoice,
    customerId,
    templateId,
    createdAt: now,
    updatedAt: now,
  }, options);
  const next = {
    ...workspace,
    updatedAt: now,
    profile: normalizeProfile({
      company: invoice.company,
      defaults: {
        currency: invoice.meta.currency,
        locale: invoice.meta.locale,
        terms: invoice.meta.terms,
        taxRate: invoice.adjustments.taxRate,
        content: invoice.content,
        design: invoice.design,
      },
    }),
    customers,
    invoices: [...workspace.invoices, invoiceRecord],
    preferences: {
      ...workspace.preferences,
      activeInvoiceId: invoiceRecord.id,
      defaultTemplateId: templateId,
      numbering: numberingAfterImportedInvoice(workspace, invoice.meta.number),
      onboarding: normalizeOnboarding({
        ...workspace.preferences.onboarding,
        status: "skipped",
        skippedAt: now,
        skipReason: "legacy-migration",
        updatedAt: now,
      }, options),
    },
    migrations: {
      ...workspace.migrations,
      legacyDraftV1: {
        completed: true,
        importedAt: now,
        invoiceId: invoiceRecord.id,
      },
    },
  };

  return {
    workspace: normalizeWorkspace(next, options),
    migrated: true,
    invoiceId: invoiceRecord.id,
    customerId,
  };
}
