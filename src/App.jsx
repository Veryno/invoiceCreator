import { Receipt } from "@phosphor-icons/react";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { CompanyProfile } from "./components/CompanyProfile.jsx";
import { CustomizationPanel } from "./components/CustomizationPanel.jsx";
import { InvoiceDocument } from "./components/InvoiceDocument.jsx";
import { InvoiceEditor } from "./components/InvoiceEditor.jsx";
import { PreviewCanvas } from "./components/PreviewCanvas.jsx";
import {
  OnboardingFlow,
  SettingsWorkspace,
  TemplatesWorkspace,
} from "./components/setup/index.js";
import { Sidebar } from "./components/Sidebar.jsx";
import { Toast } from "./components/Toast.jsx";
import { Topbar } from "./components/Topbar.jsx";
import { UpdateDialog } from "./components/UpdateDialog.jsx";
import {
  CustomersPage,
  InvoicesPage,
  OverviewPage,
} from "./components/workspace/index.js";
import { useAppUpdater } from "./hooks/useAppUpdater.js";
import { useWorkspace } from "./hooks/useWorkspace.js";
import { useWorkspaceInvoiceDraft } from "./hooks/useWorkspaceInvoiceDraft.js";
import {
  exportPdf,
  registerDesktopCloseSaveHandler,
  saveTextFile,
} from "./lib/desktop.js";
import {
  calculateInvoice,
  createDefaultInvoice,
  makeLineItem,
  normalizeInvoice,
  sanitizeFilenamePart,
  validateInvoiceForExport,
} from "./lib/invoice.js";
import {
  commitImportedCustomers,
  resolveImportedCustomer,
} from "./lib/importCustomers.js";
import {
  createInvoiceInWorkspace,
  createWorkspaceBackup,
  parseWorkspaceBackup,
  upsertWorkspaceRecord,
} from "./lib/workspace.js";

const ImportWizard = lazy(() => import("./components/importing/ImportWizard.jsx")
  .then((module) => ({ default: module.ImportWizard })));

const BUILTIN_PRESETS = [
  { id: "builtin:modern", name: "Modern", template: "modern" },
  { id: "builtin:classic", name: "Classic", template: "classic" },
  { id: "builtin:minimal", name: "Minimal", template: "minimal" },
];

function mergeInvoice(current, patch) {
  return normalizeInvoice({
    ...current,
    ...patch,
    company: { ...current.company, ...patch.company },
    customer: { ...current.customer, ...patch.customer },
    meta: { ...current.meta, ...patch.meta },
    adjustments: { ...current.adjustments, ...patch.adjustments },
    content: { ...current.content, ...patch.content },
    design: { ...current.design, ...patch.design },
    lineItems: Array.isArray(patch.lineItems) && patch.lineItems.length
      ? patch.lineItems
      : current.lineItems,
  });
}

function buildPresetList(workspace) {
  if (!workspace) return [];
  const defaults = workspace.profile.defaults;
  const builtins = BUILTIN_PRESETS.map((preset) => ({
    id: preset.id,
    name: preset.name,
    locked: true,
    design: { ...defaults.design, template: preset.template },
    content: { ...defaults.content },
  }));
  return [
    ...builtins,
    ...workspace.templates
      .filter((preset) => !preset.archivedAt)
      .map((preset) => ({ ...preset, locked: false })),
  ];
}

function buildInvoiceViewModels(workspace) {
  if (!workspace) return [];
  const payments = new Map();
  workspace.payments.filter((payment) => !payment.voidedAt).forEach((payment) => {
    payments.set(payment.invoiceId, (payments.get(payment.invoiceId) || 0) + Number(payment.amount || 0));
  });
  return workspace.invoices.filter((record) => !record.archivedAt).map((record) => {
    const calculation = calculateInvoice(record.invoice);
    const balance = Math.max(0, calculation.balance - (payments.get(record.id) || 0));
    const requestedStatus = String(record.invoice.meta.status || "draft").toLowerCase();
    return {
      id: record.id,
      customerId: record.customerId,
      number: record.invoice.meta.number,
      customerName: record.invoice.customer.name,
      issueDate: record.invoice.meta.issueDate,
      dueDate: record.invoice.meta.dueDate,
      status: balance <= 0 && calculation.total > 0 && requestedStatus !== "void"
        ? "paid"
        : requestedStatus,
      currency: record.invoice.meta.currency,
      locale: record.invoice.meta.locale,
      total: calculation.total,
      balance,
      updatedAt: record.updatedAt,
      archivedAt: record.archivedAt,
    };
  });
}

function pageTitle(page, number) {
  if (page === "invoice-editor") return `${number || "Draft"} · Invoice Studio`;
  const labels = {
    overview: "Overview",
    invoices: "Invoices",
    customers: "Customers",
    company: "Company",
    templates: "Templates",
    settings: "Settings",
  };
  return `${labels[page] || "Invoice Studio"} · Invoice Studio`;
}

function LoadingWorkspace() {
  return (
    <main className="workspace-state-page" aria-busy="true" aria-label="Loading Invoice Studio">
      <span className="workspace-state-logo"><Receipt size={28} weight="fill" aria-hidden="true" /></span>
      <h1>Opening your workspace</h1>
      <p>Loading the invoices saved on this computer…</p>
    </main>
  );
}

function WorkspaceFailure({ error }) {
  return (
    <main className="workspace-state-page" role="alert">
      <span className="workspace-state-logo"><Receipt size={28} weight="fill" aria-hidden="true" /></span>
      <h1>Invoice Studio could not open its local data</h1>
      <p>{error?.message || "Close and reopen the app. Your backup file has not been changed."}</p>
    </main>
  );
}

function CompanyWorkspace({ workspaceState, onBack }) {
  const { profile } = workspaceState.workspace;
  const [localInvoice, setLocalInvoice] = useState(() => normalizeInvoice({
    company: profile.company,
    design: profile.defaults.design,
    lineItems: [],
  }));

  useEffect(() => {
    setLocalInvoice((current) => normalizeInvoice({
      ...current,
      company: profile.company,
      design: { ...current.design, ...profile.defaults.design },
      lineItems: [],
    }));
  }, [profile]);

  const updateField = useCallback((path, value) => {
    const [section, field] = path.split(".");
    setLocalInvoice((current) => ({
      ...current,
      [section]: { ...current[section], [field]: value },
    }));
    if (section === "company") {
      void workspaceState.updateProfile({ company: { [field]: value } });
    } else if (section === "design") {
      void workspaceState.updateProfile({ defaults: { design: { [field]: value } } });
    }
  }, [workspaceState.updateProfile]);

  return <CompanyProfile draft={{ invoice: localInvoice, updateField }} onBack={onBack} />;
}

function OnboardingController({ workspaceState, presets, onNavigate, onCreateInvoice, setToast }) {
  const onboarding = workspaceState.workspace.preferences.onboarding;
  const [step, setStep] = useState(() => Number.parseInt(onboarding.currentStep, 10) || 0);
  const [company, setCompany] = useState(workspaceState.workspace.profile.company);
  const [brandColor, setBrandColor] = useState(workspaceState.workspace.profile.defaults.design.accentColor);
  const [defaults, setDefaults] = useState(() => ({
    terms: workspaceState.workspace.profile.defaults.terms,
    currency: workspaceState.workspace.profile.defaults.currency,
    taxRate: workspaceState.workspace.profile.defaults.taxRate,
    paperSize: workspaceState.workspace.profile.defaults.design.paperSize,
    defaultTemplateId: workspaceState.workspace.preferences.defaultTemplateId,
    numbering: {
      prefix: workspaceState.workspace.preferences.numbering.prefix,
      nextNumber: workspaceState.workspace.preferences.numbering.nextSequence,
      padding: workspaceState.workspace.preferences.numbering.padding || 3,
      includeYear: workspaceState.workspace.preferences.numbering.includeYear !== false,
    },
  }));
  const [customer, setCustomer] = useState(onboarding.draft?.customer || {});
  const [customerMode, setCustomerMode] = useState(onboarding.draft?.customerMode || "manual");
  const [customerImportSummary, setCustomerImportSummary] = useState("");
  const [customerImportError, setCustomerImportError] = useState("");
  const [isImportingCustomers, setIsImportingCustomers] = useState(false);
  const firstCustomerIdRef = useRef(onboarding.draft?.selectedCustomerId || null);
  const customerPromiseRef = useRef(null);
  const completionPromiseRef = useRef(null);

  function persistOnboardingDraft(mode, nextCustomer, selectedCustomerId = firstCustomerIdRef.current) {
    void workspaceState.updateOnboarding({
      status: "inProgress",
      draft: { customerMode: mode, customer: nextCustomer, selectedCustomerId },
    });
  }

  function updateCompany(patch) {
    setCompany((current) => ({ ...current, ...patch }));
    void workspaceState.updateProfile({ company: patch });
  }

  function updateBrandColor(value) {
    setBrandColor(value);
    void workspaceState.updateProfile({ defaults: { design: { accentColor: value } } });
  }

  function updateDefaults(patch) {
    setDefaults((current) => ({
      ...current,
      ...patch,
      numbering: patch.numbering ? { ...current.numbering, ...patch.numbering } : current.numbering,
    }));
    const profilePatch = {};
    if (patch.terms !== undefined) profilePatch.terms = patch.terms;
    if (patch.currency !== undefined) profilePatch.currency = patch.currency;
    if (patch.taxRate !== undefined) profilePatch.taxRate = Number(patch.taxRate) || 0;
    if (patch.paperSize !== undefined) profilePatch.design = { paperSize: patch.paperSize };
    if (Object.keys(profilePatch).length) void workspaceState.updateProfile({ defaults: profilePatch });

    const preferencePatch = {};
    if (patch.defaultTemplateId !== undefined) preferencePatch.defaultTemplateId = patch.defaultTemplateId;
    if (patch.numbering) {
      preferencePatch.numbering = {
        prefix: patch.numbering.prefix,
        nextSequence: Number.parseInt(patch.numbering.nextNumber, 10) || 1,
        padding: Number.parseInt(patch.numbering.padding, 10) || 3,
        includeYear: patch.numbering.includeYear !== false,
      };
    }
    if (Object.keys(preferencePatch).length) void workspaceState.updatePreferences(preferencePatch);
  }

  function updateCustomer(patch) {
    const next = { ...customer, ...patch };
    setCustomer(next);
    persistOnboardingDraft(customerMode, next);
  }

  function changeCustomerMode(mode) {
    if (mode !== "import") firstCustomerIdRef.current = null;
    setCustomerMode(mode);
    persistOnboardingDraft(mode, customer, mode === "import" ? firstCustomerIdRef.current : null);
  }

  async function importCustomers(file) {
    if (file.size > 10 * 1024 * 1024) {
      setCustomerImportError("Choose a file smaller than 10 MB.");
      return;
    }
    setIsImportingCustomers(true);
    setCustomerImportError("");
    try {
      const { inspectImportFile, extractCustomersFromPreview } = await import("./lib/importPreview.js");
      const preview = await inspectImportFile(file);
      const result = extractCustomersFromPreview(preview);
      if (!result.customers.length) throw new Error("No customer rows were found.");
      const imported = await commitImportedCustomers(workspaceState, result.customers);
      const firstRecord = imported.records[0] || null;
      firstCustomerIdRef.current = firstRecord?.id || null;
      setCustomer(firstRecord || {});
      const summary = [];
      if (imported.createdCount) summary.push(`${imported.createdCount} imported`);
      if (imported.matchedCount) summary.push(`${imported.matchedCount} already saved`);
      if (result.warnings.length) summary.push(`${result.warnings.length} skipped`);
      setCustomerImportSummary(`${summary.join(" · ")}.`);
      persistOnboardingDraft("import", firstRecord || {}, firstCustomerIdRef.current);
    } catch (error) {
      setCustomerImportError(error?.message || "The customer file could not be imported.");
    } finally {
      setIsImportingCustomers(false);
    }
  }

  function ensureCustomerSaved() {
    if (customerPromiseRef.current) return customerPromiseRef.current;
    const save = (async () => {
      let customerId = customerMode === "import" ? firstCustomerIdRef.current : null;
      const importedCustomerStillExists = customerId && workspaceState.workspace.customers.some(
        (entry) => entry.id === customerId && !entry.archivedAt,
      );
      if (!importedCustomerStillExists) customerId = null;
      if (customerMode === "manual" && customer.name?.trim()) {
        const saved = await workspaceState.saveRecord("customers", customer);
        customerId = saved.record.id;
      }
      firstCustomerIdRef.current = customerId;
      return customerId;
    })();
    customerPromiseRef.current = save;
    save.catch(() => {
      if (customerPromiseRef.current === save) customerPromiseRef.current = null;
    });
    return save;
  }

  function ensureCompleted() {
    if (completionPromiseRef.current) return completionPromiseRef.current;
    const completion = (async () => {
      const customerId = await ensureCustomerSaved();
      await workspaceState.updateOnboarding({
        status: "completed",
        currentStep: "3",
        completedSteps: ["company", "defaults", "customer", "review"],
        draft: null,
      });
      return customerId;
    })();
    completionPromiseRef.current = completion;
    completion.catch(() => {
      if (completionPromiseRef.current === completion) completionPromiseRef.current = null;
    });
    return completion;
  }

  return (
    <OnboardingFlow
      step={step}
      company={company}
      brandColor={brandColor}
      defaults={defaults}
      templates={presets}
      customer={customer}
      customerMode={customerMode}
      customerImportSummary={customerImportSummary}
      customerImportError={customerImportError}
      isImportingCustomers={isImportingCustomers}
      isSaving={workspaceState.saveStatus === "saving"}
      savedAt={workspaceState.savedAt}
      onStepChange={(nextStep) => {
        setStep(nextStep);
        void workspaceState.updateOnboarding({
          status: "inProgress",
          currentStep: String(nextStep),
          completedSteps: ["company", "defaults", "customer", "review"].slice(0, nextStep),
        });
      }}
      onUpdateCompany={updateCompany}
      onUpdateBrandColor={updateBrandColor}
      onUpdateDefaults={updateDefaults}
      onCustomerModeChange={changeCustomerMode}
      onUpdateCustomer={updateCustomer}
      onImportCustomerFile={importCustomers}
      onSkipCustomer={() => changeCustomerMode("skip")}
      onSkip={async () => {
        await workspaceState.updateOnboarding({ status: "skipped", currentStep: String(step) });
        setToast({ title: "Setup skipped", message: "You can restart the guided setup from Settings at any time." });
        onNavigate("overview");
      }}
      onComplete={async () => {
        await ensureCompleted();
        onNavigate("overview");
      }}
      onCreateInvoice={async () => {
        const customerId = await ensureCustomerSaved();
        const created = await onCreateInvoice(customerId);
        if (!created) throw new Error("The first invoice could not be created. Please try again.");
        await ensureCompleted();
      }}
    />
  );
}

export function App() {
  const workspaceState = useWorkspace();
  const draft = useWorkspaceInvoiceDraft();
  const updater = useAppUpdater();
  const restoreInputRef = useRef(null);
  const [viewMode, setViewMode] = useState("editor");
  const [activePage, setActivePage] = useState("overview");
  const [invoicePageFilter, setInvoicePageFilter] = useState({ status: "all", currency: "all", key: 0 });
  const [importOpen, setImportOpen] = useState(false);
  const [importTarget, setImportTarget] = useState("library");
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [updatesOpen, setUpdatesOpen] = useState(false);
  const [selectedPresetId, setSelectedPresetId] = useState(undefined);
  const [toast, setToast] = useState(null);
  const [printInvoice, setPrintInvoice] = useState(() => createDefaultInvoice());
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [lastBackupAt, setLastBackupAt] = useState(null);

  const isPrintFixture = useMemo(
    () => new URLSearchParams(window.location.search).get("fixture") === "print",
    [],
  );
  const isIconFixture = useMemo(
    () => new URLSearchParams(window.location.search).get("fixture") === "icon",
    [],
  );
  const workspace = workspaceState.workspace;
  const presets = useMemo(() => buildPresetList(workspace), [workspace]);
  const invoices = useMemo(() => buildInvoiceViewModels(workspace), [workspace]);
  const customers = useMemo(() => (workspace?.customers || []).map((customer) => ({
    ...customer,
    archived: Boolean(customer.archivedAt),
  })), [workspace]);

  useEffect(() => {
    document.title = isPrintFixture
      ? `${createDefaultInvoice().meta.number} · Invoice Studio`
      : pageTitle(activePage, draft.invoice.meta.number);
  }, [activePage, draft.invoice.meta.number, isPrintFixture]);

  useEffect(() => {
    if (["available", "ready"].includes(updater.state.status)) setUpdatesOpen(true);
  }, [updater.state.status]);

  useEffect(() => {
    const root = document.getElementById("root");
    const lock = () => {
      root?.setAttribute("inert", "");
      root?.setAttribute("aria-busy", "true");
      document.body.classList.add("app-close-saving");
    };
    const release = () => {
      root?.removeAttribute("inert");
      root?.removeAttribute("aria-busy");
      document.body.classList.remove("app-close-saving");
    };
    const unregister = registerDesktopCloseSaveHandler(() => draft.saveNow(), {
      onLock: lock,
      onRelease: release,
    });
    return () => {
      unregister();
      release();
    };
  }, [draft.saveNow]);

  const navigate = useCallback((page) => {
    setCustomizeOpen(false);
    setActivePage(page);
  }, []);

  const createInvoice = useCallback(async (customerId = null, source = {}, options = {}) => {
    try {
      await draft.saveNow();
      const result = await workspaceState.createInvoice({
        ...source,
        lineItems: Array.isArray(source.lineItems) ? source.lineItems : [makeLineItem()],
      }, {
        ...options,
        customerId: customerId || options.customerId || undefined,
      });
      setViewMode("editor");
      navigate("invoice-editor");
      return result.record;
    } catch (error) {
      setToast({ type: "error", title: "Couldn’t create the invoice", message: error?.message || "The current invoice could not be saved." });
      return null;
    }
  }, [draft.saveNow, navigate, workspaceState.createInvoice]);

  const openInvoice = useCallback(async (id) => {
    try {
      await draft.saveNow();
      await workspaceState.setActiveInvoice(id);
      setViewMode("editor");
      navigate("invoice-editor");
    } catch (error) {
      setToast({ type: "error", title: "Couldn’t open the invoice", message: error?.message || "The current invoice could not be saved." });
    }
  }, [draft.saveNow, navigate, workspaceState.setActiveInvoice]);

  function openImport(target) {
    setImportTarget(target);
    setImportOpen(true);
  }

  function filenameFor(invoice) {
    const number = sanitizeFilenamePart(invoice.meta.number || "Draft");
    const customer = sanitizeFilenamePart(invoice.customer.name || "Customer");
    return `Invoice-${number}-${customer}`;
  }

  const exportInvoiceDocument = useCallback(async (invoice, recordId = null) => {
    const normalized = normalizeInvoice(invoice);
    const issues = validateInvoiceForExport(normalized);
    if (issues.length) {
      setToast({
        type: "error",
        title: "Finish the invoice before exporting",
        message: `${issues[0].message}${issues.length > 1 ? ` ${issues.length - 1} more ${issues.length - 1 === 1 ? "item needs" : "items need"} attention.` : ""}`,
      });
      if (recordId) await openInvoice(recordId);
      return;
    }
    setIsExporting(true);
    try {
      setPrintInvoice(normalized);
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const result = await exportPdf({
        suggestedName: `${filenameFor(normalized)}.pdf`,
        pageSize: normalized.design.paperSize || "Letter",
      });
      if (!result?.canceled) {
        if (recordId) {
          await workspaceState.saveRecord("invoices", {
            id: recordId,
            lastExportedAt: new Date().toISOString(),
          });
        }
        setToast({ title: "PDF ready", message: result?.filePath ? "Saved to the location you selected." : "Your print dialog is open." });
      }
    } catch (error) {
      setToast({ type: "error", title: "Couldn’t create the PDF", message: error.message });
    } finally {
      setIsExporting(false);
    }
  }, [openInvoice, workspaceState.saveRecord]);

  const exportCurrent = useCallback(async () => {
    try {
      await draft.saveNow();
      await exportInvoiceDocument(draft.invoice, draft.recordId);
    } catch (error) {
      setToast({ type: "error", title: "Save failed", message: error?.message || "The invoice could not be saved before export." });
    }
  }, [draft.invoice, draft.recordId, draft.saveNow, exportInvoiceDocument]);

  async function saveCurrentJson() {
    try {
      await draft.saveNow();
      const result = await saveTextFile({
        suggestedName: `${filenameFor(draft.invoice)}.json`,
        contents: JSON.stringify({ schemaVersion: 1, ...draft.invoice }, null, 2),
        filters: [{ name: "Invoice Studio data", extensions: ["json"] }],
      });
      if (!result?.canceled) setToast({ title: "Invoice data saved", message: "You can import this JSON file again at any time." });
    } catch (error) {
      setToast({ type: "error", title: "Couldn’t save invoice data", message: error.message });
    }
  }

  async function saveSample(type) {
    const isCsv = type === "csv";
    const contents = isCsv
      ? "invoice_number,issue_date,due_date,currency,company_name,customer_name,customer_email,billing_address,service_date,item,description,quantity,rate,taxable,tax_rate\nINV-1001,2026-08-17,2026-09-16,USD,Northstar Studio,Riverside Property Group,accounts@example.com,420 Harbor Avenue,2026-08-17,Consulting,Design consultation,10,125,true,8.25"
      : JSON.stringify({ schemaVersion: 1, ...createDefaultInvoice() }, null, 2);
    const extension = isCsv ? "csv" : "json";
    try {
      const result = await saveTextFile({
        suggestedName: `invoice-studio-sample.${extension}`,
        contents,
        filters: [{ name: isCsv ? "CSV spreadsheet" : "Invoice Studio data", extensions: [extension] }],
      });
      if (!result?.canceled) setToast({ title: "Sample saved", message: `The ${extension.toUpperCase()} sample is ready to edit.` });
    } catch (error) {
      setToast({ type: "error", title: "Couldn’t save the sample", message: error.message });
    }
  }

  async function createImportedInvoices(invoicePatches) {
    const createdRecords = [];
    await workspaceState.update((current) => {
      let nextWorkspace = current;
      for (const patch of invoicePatches) {
        const customer = resolveImportedCustomer(nextWorkspace, patch.customer);
        nextWorkspace = customer.workspace;
        const created = createInvoiceInWorkspace(nextWorkspace, patch, {
          customerId: customer.customerId || undefined,
        });
        nextWorkspace = created.workspace;
        createdRecords.push(created.record);
      }
      return nextWorkspace;
    });
    return createdRecords;
  }

  async function handleImportResult(result, context) {
    try {
      if (result.mergeStrategy === "multiple") {
        await createImportedInvoices(result.invoices.map(({ invoicePatch }) => invoicePatch));
        navigate("invoices");
        setToast({ title: `${result.invoiceCount} invoices imported`, message: `${result.rowCount} spreadsheet rows were grouped by invoice number.` });
      } else if (importTarget === "active" && draft.recordId) {
        const next = result.mergeStrategy === "replace"
          ? normalizeInvoice(result.invoicePatch)
          : mergeInvoice(draft.invoice, result.invoicePatch);
        draft.replaceInvoice(next);
        await draft.saveNow();
        await workspaceState.update((current) => {
          const customer = resolveImportedCustomer(current, next.customer);
          const updated = upsertWorkspaceRecord(customer.workspace, "invoices", {
            id: draft.recordId,
            customerId: customer.customerId,
            invoice: next,
          });
          return updated.workspace;
        });
        navigate("invoice-editor");
        setToast({ title: `Imported ${result.rowCount || 1} ${result.rowCount === 1 ? "row" : "rows"}`, message: "Review the imported fields before exporting." });
      } else {
        const [created] = await createImportedInvoices([result.invoicePatch]);
        if (!created) throw new Error("The imported invoice could not be created.");
        navigate("invoice-editor");
        setToast({ title: "Invoice imported", message: `${context.fileName} is ready to review.` });
      }
      setImportOpen(false);
      if (result.warnings?.length) {
        window.setTimeout(() => setToast({
          title: "Import completed with warnings",
          message: `${result.warnings.length} ${result.warnings.length === 1 ? "warning was" : "warnings were"} handled safely. ${result.warnings[0]}`,
        }), 1200);
      }
    } catch (error) {
      setToast({ type: "error", title: "Import failed", message: error.message });
      throw error;
    }
  }

  async function duplicateInvoice(id) {
    const record = workspace.invoices.find((entry) => entry.id === id);
    if (!record) return;
    const { number: _number, ...meta } = record.invoice.meta;
    const duplicated = await workspaceState.createInvoice({
      ...record.invoice,
      meta: { ...meta, status: "draft" },
    }, { customerId: record.customerId || undefined, templateId: record.templateId });
    setToast({ title: "Invoice duplicated", message: `${duplicated.record.invoice.meta.number} is ready to edit.` });
    await openInvoice(duplicated.record.id);
  }

  async function archiveInvoice(id) {
    const record = workspace.invoices.find((entry) => entry.id === id);
    if (!record || !window.confirm(`Archive invoice ${record.invoice.meta.number || "Draft"}? You can still recover it from a workspace backup.`)) return;
    await workspaceState.archiveRecord("invoices", id);
    setToast({ title: "Invoice archived", message: "Its saved PDF and workspace backups are unchanged." });
  }

  async function selectSavedCustomer(id) {
    const customer = workspace.customers.find((entry) => entry.id === id && !entry.archivedAt);
    const next = normalizeInvoice({
      ...draft.invoice,
      customer: customer
        ? { name: customer.name, email: customer.email, phone: customer.phone, address: customer.address }
        : { name: "", email: "", phone: "", address: "" },
    });
    draft.replaceInvoice(next);
    if (draft.recordId) await workspaceState.saveInvoice(draft.recordId, next, { customerId: customer?.id || null });
  }

  function presetById(id) {
    return presets.find((preset) => preset.id === id);
  }

  async function applyPreset(id) {
    const preset = presetById(id);
    if (!preset) return;
    const resolvedDesign = {
      ...preset.design,
      ...(!preset.locked && preset.accentMode !== "fixed"
        ? { accentColor: workspace.profile.defaults.design.accentColor }
        : {}),
    };
    if (!draft.recordId) {
      await createInvoice(null, { design: resolvedDesign, content: preset.content }, { templateId: id });
    } else {
      const next = normalizeInvoice({
        ...draft.invoice,
        design: { ...draft.invoice.design, ...resolvedDesign },
        content: { ...draft.invoice.content, ...preset.content },
      });
      draft.replaceInvoice(next);
      await workspaceState.saveInvoice(draft.recordId, next, { templateId: id });
    }
    setToast({ title: "Template applied", message: `${preset.name} is now used by the current invoice.` });
  }

  async function updateSettings(patch) {
    if (patch.defaults) {
      const { terms, currency, taxRate, paperSize, defaultTemplateId } = patch.defaults;
      await workspaceState.updateProfile({
        defaults: {
          ...(terms !== undefined ? { terms } : {}),
          ...(currency !== undefined ? { currency } : {}),
          ...(taxRate !== undefined ? { taxRate: Number(taxRate) || 0 } : {}),
          ...(paperSize !== undefined ? { design: { paperSize } } : {}),
        },
      });
      if (defaultTemplateId !== undefined) await workspaceState.updatePreferences({ defaultTemplateId });
    }
    if (patch.numbering) {
      const numberingPatch = {};
      if (patch.numbering.prefix !== undefined) numberingPatch.prefix = patch.numbering.prefix;
      if (patch.numbering.nextNumber !== undefined) {
        numberingPatch.nextSequence = Number.parseInt(patch.numbering.nextNumber, 10) || 1;
      }
      if (patch.numbering.padding !== undefined) {
        numberingPatch.padding = Number.parseInt(patch.numbering.padding, 10) || 3;
      }
      if (patch.numbering.includeYear !== undefined) {
        numberingPatch.includeYear = patch.numbering.includeYear !== false;
      }
      await workspaceState.updatePreferences({
        numbering: numberingPatch,
      });
    }
  }

  async function createBackup() {
    setIsBackingUp(true);
    try {
      await draft.saveNow();
      const authoritativeWorkspace = workspaceState.getSnapshot();
      if (!authoritativeWorkspace) throw new Error("The workspace is not ready to back up.");
      const date = new Date().toISOString().slice(0, 10);
      const result = await saveTextFile({
        suggestedName: `Invoice-Studio-Backup-${date}.json`,
        contents: JSON.stringify(createWorkspaceBackup(authoritativeWorkspace), null, 2),
        filters: [{ name: "Invoice Studio workspace backup", extensions: ["json"] }],
      });
      if (!result?.canceled) {
        setLastBackupAt(new Date());
        setToast({ title: "Backup created", message: "Keep this file somewhere safe. It contains your full local workspace." });
      }
    } catch (error) {
      setToast({ type: "error", title: "Backup failed", message: error.message });
    } finally {
      setIsBackingUp(false);
    }
  }

  async function restoreBackup(file) {
    if (!file) return;
    if (file.size > 64 * 1024 * 1024) {
      setToast({ type: "error", title: "Backup is too large", message: "Choose an Invoice Studio backup smaller than 64 MB." });
      return;
    }
    setIsRestoring(true);
    try {
      const value = JSON.parse(await file.text());
      const normalized = parseWorkspaceBackup(value);
      if (!window.confirm(`Restore ${normalized.invoices.length} invoices and ${normalized.customers.length} customers from this backup? This replaces the current workspace.`)) return;
      await workspaceState.replaceWorkspace(normalized);
      navigate("overview");
      setToast({ title: "Workspace restored", message: "Invoices, customers, templates, and settings were restored from the backup." });
    } catch (error) {
      setToast({ type: "error", title: "Restore failed", message: error.message || "That file is not a valid Invoice Studio backup." });
    } finally {
      setIsRestoring(false);
      if (restoreInputRef.current) restoreInputRef.current.value = "";
    }
  }

  async function handleUpdateAction(action, fallbackMessage) {
    try {
      await action();
    } catch (error) {
      setToast({ type: "error", title: "Update couldn’t continue", message: error?.message || fallbackMessage });
    }
  }

  if (isPrintFixture) return <main className="print-fixture"><InvoiceDocument invoice={createDefaultInvoice()} /></main>;
  if (isIconFixture) return <main className="icon-fixture" aria-label="Invoice Studio application icon"><Receipt weight="fill" aria-hidden="true" /></main>;
  if (workspaceState.status === "loading" || !workspace) return <LoadingWorkspace />;
  if (workspaceState.status === "error") return <WorkspaceFailure error={workspaceState.error} />;

  const onboardingStatus = workspace.preferences.onboarding.status;
  if (["notStarted", "inProgress"].includes(onboardingStatus)) {
    return (
      <OnboardingController
        workspaceState={workspaceState}
        presets={presets}
        onNavigate={navigate}
        onCreateInvoice={createInvoice}
        setToast={setToast}
      />
    );
  }

  const activeSidebarPage = activePage === "invoice-editor" ? "invoices" : activePage;
  const currentRecord = workspace.invoices.find(({ id }) => id === draft.recordId);
  const templatePreview = normalizeInvoice({ ...createDefaultInvoice(), company: workspace.profile.company });
  const settingsPreferences = {
    defaults: {
      terms: workspace.profile.defaults.terms,
      currency: workspace.profile.defaults.currency,
      taxRate: workspace.profile.defaults.taxRate,
      paperSize: workspace.profile.defaults.design.paperSize,
      defaultTemplateId: workspace.preferences.defaultTemplateId,
    },
    numbering: {
      prefix: workspace.preferences.numbering.prefix,
      nextNumber: workspace.preferences.numbering.nextSequence,
      padding: workspace.preferences.numbering.padding || 3,
      includeYear: workspace.preferences.numbering.includeYear !== false,
    },
  };

  return (
    <div className="app-shell">
      <Sidebar activePage={activeSidebarPage} onNavigate={navigate} onSettings={() => navigate("settings")} />
      <div className="app-main">
        {activePage === "overview" ? (
          <OverviewPage
            invoices={invoices}
            setup={onboardingStatus === "completed" ? { status: "complete" } : {
              status: onboardingStatus,
              currentStep: Number.parseInt(workspace.preferences.onboarding.currentStep, 10) || 0,
              completedSteps: workspace.preferences.onboarding.completedSteps.length,
              totalSteps: 4,
            }}
            onResumeSetup={() => workspaceState.updateOnboarding({ status: "inProgress" })}
            onNewInvoice={() => createInvoice()}
            onImportInvoice={() => openImport("library")}
            onOpenInvoice={openInvoice}
            onViewInvoices={() => navigate("invoices")}
            onMetricSelect={({ metric, currency }) => {
              setInvoicePageFilter({ status: metric, currency, key: Date.now() });
              navigate("invoices");
            }}
          />
        ) : null}

        {activePage === "invoices" ? (
          <InvoicesPage
            key={`${invoicePageFilter.key}-${invoicePageFilter.status}-${invoicePageFilter.currency}`}
            invoices={invoices}
            initialStatusFilter={invoicePageFilter.status}
            initialCurrencyFilter={invoicePageFilter.currency}
            onNewInvoice={() => createInvoice()}
            onImportInvoice={() => openImport("library")}
            onOpenInvoice={openInvoice}
            onDuplicateInvoice={duplicateInvoice}
            onExportInvoice={(id) => {
              const record = workspace.invoices.find((entry) => entry.id === id);
              if (record) void exportInvoiceDocument(record.invoice, record.id);
            }}
            onArchiveInvoice={archiveInvoice}
          />
        ) : null}

        {activePage === "customers" ? (
          <CustomersPage
            customers={customers}
            invoices={invoices}
            onCreateCustomer={async (values) => (await workspaceState.saveRecord("customers", values)).record}
            onUpdateCustomer={async (id, patch) => {
              await workspaceState.saveRecord("customers", { id, ...patch });
            }}
            onArchiveCustomer={(id) => workspaceState.archiveRecord("customers", id)}
            onCreateInvoice={(customerId) => createInvoice(customerId)}
            onOpenInvoice={openInvoice}
          />
        ) : null}

        {activePage === "company" ? <CompanyWorkspace workspaceState={workspaceState} onBack={() => navigate("overview")} /> : null}

        {activePage === "templates" ? (
          <TemplatesWorkspace
            presets={presets}
            defaultPresetId={workspace.preferences.defaultTemplateId}
            previewInvoice={templatePreview}
            selectedPresetId={selectedPresetId}
            isSaving={workspaceState.saveStatus === "saving"}
            onSelectPreset={setSelectedPresetId}
            onCreatePreset={async (preset) => {
              const saved = await workspaceState.saveRecord("templates", preset);
              setSelectedPresetId(saved.record.id);
              return saved.record;
            }}
            onUpdatePreset={async (id, patch) => {
              try {
                await workspaceState.saveRecord("templates", { id, ...patch });
              } catch (error) {
                setToast({ type: "error", title: "Template wasn’t saved", message: error?.message || "Try that change again." });
              }
            }}
            onRenamePreset={async (id, name) => {
              try {
                await workspaceState.saveRecord("templates", { id, name });
              } catch (error) {
                setToast({ type: "error", title: "Template wasn’t renamed", message: error?.message || "Try again." });
              }
            }}
            onDuplicatePreset={async (id) => {
              const current = presets.find((preset) => preset.id === id);
              if (!current) return;
              const saved = await workspaceState.saveRecord("templates", {
                name: `${current.name} copy`,
                accentMode: current.accentMode,
                design: current.design,
                content: current.content,
              });
              setSelectedPresetId(saved.record.id);
            }}
            onDeletePreset={async (id) => {
              await workspaceState.archiveRecord("templates", id);
              setSelectedPresetId(undefined);
            }}
            onSetDefault={(id) => workspaceState.updatePreferences({ defaultTemplateId: id })}
            onApplyToCurrent={applyPreset}
          />
        ) : null}

        {activePage === "settings" ? (
          <SettingsWorkspace
            preferences={settingsPreferences}
            presets={presets}
            updateState={updater.state}
            isBackingUp={isBackingUp}
            isRestoring={isRestoring}
            lastBackupAt={lastBackupAt}
            onUpdatePreferences={updateSettings}
            onBackup={createBackup}
            onRestore={() => restoreInputRef.current?.click()}
            onOpenUpdates={() => setUpdatesOpen(true)}
            onRestartOnboarding={() => workspaceState.updateOnboarding({ status: "inProgress", currentStep: "0" })}
          />
        ) : null}

        {activePage === "invoice-editor" && draft.recordId ? (
          <>
            <Topbar
              invoiceNumber={draft.invoice.meta.number}
              savedAt={draft.savedAt}
              saveStatus={draft.saveStatus}
              viewMode={viewMode}
              onViewMode={setViewMode}
              onBack={async () => {
                await draft.saveNow().catch(() => {});
                navigate("invoices");
              }}
              onImport={() => openImport("active")}
              onSaveJson={saveCurrentJson}
              onExport={exportCurrent}
              onNew={() => createInvoice()}
              onCustomize={() => setCustomizeOpen(true)}
              isExporting={isExporting}
            />
            <main className="workspace">
              <div className="workspace-content">
                {viewMode === "editor" ? (
                  <InvoiceEditor
                    draft={draft}
                    customers={workspace.customers.filter((customer) => !customer.archivedAt)}
                    selectedCustomerId={currentRecord?.customerId || ""}
                    onSelectCustomer={selectSavedCustomer}
                  />
                ) : <PreviewCanvas invoice={draft.invoice} onExport={exportCurrent} />}
              </div>
              <CustomizationPanel
                invoice={draft.invoice}
                updateField={draft.updateField}
                isOpen={customizeOpen}
                onClose={() => setCustomizeOpen(false)}
              />
            </main>
          </>
        ) : null}
      </div>

      <div className="print-root" aria-hidden="true"><InvoiceDocument invoice={printInvoice} /></div>
      <input
        ref={restoreInputRef}
        className="visually-hidden"
        type="file"
        accept=".json,application/json"
        aria-label="Choose Invoice Studio backup"
        onChange={(event) => restoreBackup(event.target.files?.[0])}
      />
      {importOpen ? (
        <Suspense fallback={null}>
          <ImportWizard open={importOpen} onClose={() => setImportOpen(false)} onImport={handleImportResult} onSample={saveSample} />
        </Suspense>
      ) : null}
      <Toast toast={toast} onClose={() => setToast(null)} />
      <UpdateDialog
        open={updatesOpen}
        onClose={() => setUpdatesOpen(false)}
        updateState={updater.state}
        onCheck={() => handleUpdateAction(updater.checkForUpdates, "Try checking again in a moment.")}
        onDownload={() => handleUpdateAction(updater.downloadUpdate, "Try downloading the update again.")}
        onRestart={async () => {
          await handleUpdateAction(async () => {
            await draft.saveNow();
            return updater.restartAndInstall();
          }, "Close and reopen Invoice Studio, then try the update again.");
        }}
      />
    </div>
  );
}
