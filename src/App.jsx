import { Receipt } from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CustomizationPanel } from "./components/CustomizationPanel.jsx";
import { CompanyProfile } from "./components/CompanyProfile.jsx";
import { ImportDialog } from "./components/ImportDialog.jsx";
import { InvoiceDocument } from "./components/InvoiceDocument.jsx";
import { InvoiceEditor } from "./components/InvoiceEditor.jsx";
import { PreviewCanvas } from "./components/PreviewCanvas.jsx";
import { Sidebar } from "./components/Sidebar.jsx";
import { Toast } from "./components/Toast.jsx";
import { Topbar } from "./components/Topbar.jsx";
import { UpdateDialog } from "./components/UpdateDialog.jsx";
import { useAppUpdater } from "./hooks/useAppUpdater.js";
import { useInvoiceDraft } from "./hooks/useInvoiceDraft.js";
import { exportPdf, saveTextFile } from "./lib/desktop.js";
import {
  createDefaultInvoice,
  normalizeInvoice,
  sanitizeFilenamePart,
} from "./lib/invoice.js";

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
    lineItems: patch.lineItems?.length ? patch.lineItems : current.lineItems,
  });
}

export function App() {
  const draft = useInvoiceDraft();
  const updater = useAppUpdater();
  const [viewMode, setViewMode] = useState("editor");
  const [activePage, setActivePage] = useState("invoices");
  const [importOpen, setImportOpen] = useState(false);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [updatesOpen, setUpdatesOpen] = useState(false);
  const [toast, setToast] = useState(null);

  const isPrintFixture = useMemo(
    () => new URLSearchParams(window.location.search).get("fixture") === "print",
    [],
  );
  const isIconFixture = useMemo(
    () => new URLSearchParams(window.location.search).get("fixture") === "icon",
    [],
  );

  useEffect(() => {
    document.title = `${draft.invoice.meta.number || "Draft"} · Invoice Studio`;
  }, [draft.invoice.meta.number]);

  useEffect(() => {
    if (["available", "ready"].includes(updater.state.status)) {
      setUpdatesOpen(true);
    }
  }, [updater.state.status]);

  const filenameBase = useMemo(() => {
    const number = sanitizeFilenamePart(draft.invoice.meta.number || "Draft");
    const customer = sanitizeFilenamePart(draft.invoice.customer.name || "Customer");
    return `Invoice-${number}-${customer}`;
  }, [draft.invoice.meta.number, draft.invoice.customer.name]);

  const handleExport = useCallback(async () => {
    setIsExporting(true);
    try {
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const result = await exportPdf({
        suggestedName: `${filenameBase}.pdf`,
        pageSize: draft.invoice.design.paperSize || "Letter",
      });
      if (!result?.canceled) {
        setToast({ title: "PDF ready", message: result?.filePath ? "Saved to the location you selected." : "Your print dialog is open." });
      }
    } catch (error) {
      setToast({ type: "error", title: "Couldn’t create the PDF", message: error.message });
    } finally {
      setIsExporting(false);
    }
  }, [draft.invoice.design.paperSize, filenameBase]);

  const handleSaveJson = useCallback(async () => {
    try {
      const contents = JSON.stringify({ schemaVersion: 1, ...draft.invoice }, null, 2);
      const result = await saveTextFile({
        suggestedName: `${filenameBase}.json`,
        contents,
        filters: [{ name: "Invoice Studio data", extensions: ["json"] }],
      });
      if (!result?.canceled) setToast({ title: "Invoice data saved", message: "You can import this JSON file again at any time." });
    } catch (error) {
      setToast({ type: "error", title: "Couldn’t save invoice data", message: error.message });
    }
  }, [draft.invoice, filenameBase]);

  const handleUpdateAction = useCallback(async (action, fallbackMessage) => {
    try {
      await action();
    } catch (error) {
      setToast({
        type: "error",
        title: "Update couldn’t continue",
        message: error?.message || fallbackMessage,
      });
    }
  }, []);

  const handleRestartUpdate = useCallback(async () => {
    draft.saveNow();
    await handleUpdateAction(
      updater.restartAndInstall,
      "Close and reopen Invoice Studio, then try the update again.",
    );
  }, [draft, handleUpdateAction, updater.restartAndInstall]);

  const handleImport = useCallback(async (file) => {
    if (file.size > 10 * 1024 * 1024) {
      setToast({ type: "error", title: "File is too large", message: "Choose a file smaller than 10 MB." });
      return;
    }
    setIsImporting(true);
    try {
      const { importInvoiceFile } = await import("./lib/importInvoice.js");
      const result = await importInvoiceFile(file);
      const nextInvoice = result.mergeStrategy === "replace"
        ? normalizeInvoice(result.invoicePatch)
        : mergeInvoice(draft.invoice, result.invoicePatch);
      draft.replaceInvoice(nextInvoice);
      setImportOpen(false);
      const warningText = result.warnings?.length
        ? ` ${result.warnings.length} import ${result.warnings.length === 1 ? "warning" : "warnings"}: ${result.warnings.slice(0, 2).join(" ")}`
        : "";
      setToast({ title: `Imported ${result.rowCount || 1} ${result.rowCount === 1 ? "row" : "rows"}`, message: `Review the imported fields before exporting.${warningText}` });
    } catch (error) {
      setToast({ type: "error", title: "Import failed", message: error.message });
    } finally {
      setIsImporting(false);
    }
  }, [draft]);

  async function handleSample(type) {
    const isCsv = type === "csv";
    const contents = isCsv
      ? "invoice_number,issue_date,due_date,currency,company_name,customer_name,customer_email,billing_address,service_date,item,description,quantity,rate,taxable,tax_rate\nINV-1001,2026-08-17,2026-09-16,USD,Northstar Studio,Riverside Property Group,accounts@example.com,420 Harbor Avenue,2026-08-17,Consulting,Design consultation,10,125,true,8.25"
      : JSON.stringify({ schemaVersion: 1, ...createDefaultInvoice() }, null, 2);
    const extension = isCsv ? "csv" : "json";

    try {
      const result = await saveTextFile({
        suggestedName: `invoice-studio-sample.${extension}`,
        contents,
        filters: [{
          name: isCsv ? "CSV spreadsheet" : "Invoice Studio data",
          extensions: [extension],
        }],
      });
      if (!result?.canceled) {
        setToast({ title: "Sample saved", message: `The ${extension.toUpperCase()} sample is ready to edit.` });
      }
    } catch (error) {
      setToast({ type: "error", title: "Couldn’t save the sample", message: error.message });
    }
  }

  function handleNew() {
    if (window.confirm("Start a new blank invoice? This replaces the current draft. Save the data first if you need a backup. Your company profile and branding will be kept.")) {
      draft.resetInvoice();
      setActivePage("invoices");
      setViewMode("editor");
      setToast({ title: "Blank invoice created", message: "Company details and branding were carried into the new draft." });
    }
  }

  if (isPrintFixture) {
    return (
      <main className="print-fixture">
        <InvoiceDocument invoice={createDefaultInvoice()} />
      </main>
    );
  }

  if (isIconFixture) {
    return (
      <main className="icon-fixture" aria-label="Invoice Studio application icon">
        <Receipt weight="fill" aria-hidden="true" />
      </main>
    );
  }

  return (
    <div className="app-shell">
      <Sidebar
        activePage={activePage}
        onNavigate={(page) => setActivePage(page)}
        onSettings={() => setUpdatesOpen(true)}
      />
      <div className="app-main">
        {activePage === "company" ? (
          <CompanyProfile draft={draft} onBack={() => setActivePage("invoices")} />
        ) : (
          <>
            <Topbar
              invoiceNumber={draft.invoice.meta.number}
              savedAt={draft.savedAt}
              viewMode={viewMode}
              onViewMode={setViewMode}
              onImport={() => setImportOpen(true)}
              onSaveJson={handleSaveJson}
              onExport={handleExport}
              onNew={handleNew}
              onCustomize={() => setCustomizeOpen(true)}
              isExporting={isExporting}
            />
            <main className="workspace">
              <div className="workspace-content">
                {viewMode === "editor" ? <InvoiceEditor draft={draft} /> : <PreviewCanvas invoice={draft.invoice} onExport={handleExport} />}
              </div>
              <CustomizationPanel
                invoice={draft.invoice}
                updateField={draft.updateField}
                isOpen={customizeOpen}
                onClose={() => setCustomizeOpen(false)}
              />
            </main>
          </>
        )}
      </div>

      <div className="print-root" aria-hidden="true">
        <InvoiceDocument invoice={draft.invoice} />
      </div>

      <ImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onFile={handleImport}
        onSample={handleSample}
        isImporting={isImporting}
      />
      <Toast toast={toast} onClose={() => setToast(null)} />
      <UpdateDialog
        open={updatesOpen}
        onClose={() => setUpdatesOpen(false)}
        updateState={updater.state}
        onCheck={() => handleUpdateAction(updater.checkForUpdates, "Try checking again in a moment.")}
        onDownload={() => handleUpdateAction(updater.downloadUpdate, "Try downloading the update again.")}
        onRestart={handleRestartUpdate}
      />
    </div>
  );
}
