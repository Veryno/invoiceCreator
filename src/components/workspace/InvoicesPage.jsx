import {
  FileText,
  Plus,
  UploadSimple,
} from "@phosphor-icons/react";
import { useDeferredValue, useMemo, useState } from "react";
import { InvoiceTable } from "./InvoiceTable.jsx";
import {
  EmptyState,
  FilterGroup,
  PageHeader,
  SearchField,
  SectionHeader,
  WorkspaceButton,
  WorkspacePage,
} from "./WorkspaceUI.jsx";
import {
  filterInvoices,
  getEffectiveInvoiceStatus,
  INVOICE_STATUS_OPTIONS,
  isRecordArchived,
} from "./workspaceData.js";

/**
 * @param {{
 *   invoices?: Array<object>,
 *   now?: Date,
 *   initialSearch?: string,
 *   initialStatusFilter?: string,
 *   initialCurrencyFilter?: string,
 *   onNewInvoice?: Function,
 *   onImportInvoice?: Function,
 *   onOpenInvoice?: (invoiceId: string) => void,
 *   onDuplicateInvoice?: (invoiceId: string) => void,
 *   onExportInvoice?: (invoiceId: string) => void,
 *   onArchiveInvoice?: (invoiceId: string) => void,
 * }} props
 */
export function InvoicesPage({
  invoices = [],
  now,
  initialSearch = "",
  initialStatusFilter = "all",
  initialCurrencyFilter = "all",
  onNewInvoice,
  onImportInvoice,
  onOpenInvoice,
  onDuplicateInvoice,
  onExportInvoice,
  onArchiveInvoice,
}) {
  const [search, setSearch] = useState(initialSearch);
  const [statusFilter, setStatusFilter] = useState(initialStatusFilter);
  const [currencyFilter, setCurrencyFilter] = useState(initialCurrencyFilter);
  const deferredSearch = useDeferredValue(search);
  const currentDate = useMemo(() => now || new Date(), [now]);
  const activeInvoices = useMemo(
    () => invoices.filter((invoice) => !isRecordArchived(invoice)),
    [invoices],
  );
  const currencies = useMemo(
    () => [...new Set(activeInvoices.map((invoice) => String(invoice?.currency || "USD").toUpperCase()))].sort(),
    [activeInvoices],
  );
  const statusOptions = useMemo(() => INVOICE_STATUS_OPTIONS.map((option) => ({
    ...option,
    count: option.value === "all"
      ? activeInvoices.length
      : option.value === "open"
        ? filterInvoices(activeInvoices, { status: "open", now: currentDate }).length
        : activeInvoices.filter((invoice) => getEffectiveInvoiceStatus(invoice, currentDate) === option.value).length,
  })), [activeInvoices, currentDate]);
  const filteredInvoices = useMemo(
    () => filterInvoices(activeInvoices, {
      query: deferredSearch,
      status: statusFilter,
      currency: currencyFilter,
      now: currentDate,
    }),
    [activeInvoices, currencyFilter, currentDate, deferredSearch, statusFilter],
  );
  const hasFilters = Boolean(search) || statusFilter !== "all" || currencyFilter !== "all";

  function clearFilters() {
    setSearch("");
    setStatusFilter("all");
    setCurrencyFilter("all");
  }

  return (
    <WorkspacePage titleId="studio-invoices-title" className="studio-invoices-page">
      <PageHeader
        icon={FileText}
        eyebrow="Local library"
        title="Invoices"
        titleId="studio-invoices-title"
        description="Find, review, export, and continue every invoice saved on this computer."
        actions={(
          <>
            {onImportInvoice ? (
              <WorkspaceButton icon={UploadSimple} onClick={onImportInvoice}>Import</WorkspaceButton>
            ) : null}
            {onNewInvoice ? (
              <WorkspaceButton icon={Plus} variant="primary" onClick={onNewInvoice}>New invoice</WorkspaceButton>
            ) : null}
          </>
        )}
      />

      <section className="studio-panel studio-library-panel" aria-labelledby="studio-library-title">
        <SectionHeader
          title="Invoice library"
          titleId="studio-library-title"
          description="Search by invoice number or customer, then narrow by status."
          count={activeInvoices.length}
        />

        {activeInvoices.length > 0 ? (
          <div className="studio-library-toolbar">
            <SearchField
              label="Search invoices"
              value={search}
              onChange={setSearch}
              placeholder="Search invoices or customers"
            />
            <FilterGroup
              legend="Filter invoices by status"
              options={statusOptions}
              value={statusFilter}
              onChange={setStatusFilter}
              name="invoice-status-filter"
            />
            {currencies.length > 1 || currencyFilter !== "all" ? (
              <label className="studio-select-field">
                <span>Currency</span>
                <select value={currencyFilter} onChange={(event) => setCurrencyFilter(event.target.value)}>
                  <option value="all">All currencies</option>
                  {currencies.map((currency) => <option key={currency}>{currency}</option>)}
                </select>
              </label>
            ) : null}
          </div>
        ) : null}

        {activeInvoices.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="Your invoice library is empty"
            description="Create an invoice from scratch or import an existing CSV, XLSX, or JSON file."
            headingLevel={3}
            actions={(
              <>
                {onNewInvoice ? (
                  <WorkspaceButton icon={Plus} variant="primary" onClick={onNewInvoice}>New invoice</WorkspaceButton>
                ) : null}
                {onImportInvoice ? (
                  <WorkspaceButton icon={UploadSimple} onClick={onImportInvoice}>Import invoice</WorkspaceButton>
                ) : null}
              </>
            )}
          />
        ) : filteredInvoices.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No invoices match"
            description="Try a different search or clear the current filters."
            headingLevel={3}
            compact
            actions={(
              <WorkspaceButton variant="quiet" onClick={clearFilters}>Clear filters</WorkspaceButton>
            )}
          />
        ) : (
          <>
            <p className="studio-results-summary" role="status">
              Showing {filteredInvoices.length} of {activeInvoices.length} invoices
              {hasFilters ? " with the current filters" : ""}.
            </p>
            <InvoiceTable
              invoices={filteredInvoices}
              now={currentDate}
              onOpenInvoice={onOpenInvoice}
              onDuplicateInvoice={onDuplicateInvoice}
              onExportInvoice={onExportInvoice}
              onArchiveInvoice={onArchiveInvoice}
            />
          </>
        )}
      </section>
    </WorkspacePage>
  );
}
