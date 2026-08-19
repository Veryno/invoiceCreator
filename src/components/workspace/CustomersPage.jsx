import {
  Plus,
  UsersThree,
} from "@phosphor-icons/react";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { ArchiveCustomerDialog } from "./ArchiveCustomerDialog.jsx";
import { CustomerDetail } from "./CustomerDetail.jsx";
import { CustomerDialog } from "./CustomerDialog.jsx";
import { CustomerDirectory } from "./CustomerDirectory.jsx";
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
  CUSTOMER_FILTER_OPTIONS,
  filterAndSortCustomers,
  isRecordArchived,
} from "./workspaceData.js";

/**
 * @param {{
 *   customers?: Array<object>,
 *   invoices?: Array<object>,
 *   now?: Date,
 *   initialSelectedCustomerId?: string,
 *   onCreateCustomer?: (values: object) => object|Promise<object>,
 *   onUpdateCustomer?: (customerId: string, patch: object) => void|Promise<void>,
 *   onArchiveCustomer?: (customerId: string) => void|Promise<void>,
 *   onCreateInvoice?: (customerId: string) => void,
 *   onOpenInvoice?: (invoiceId: string) => void,
 *   onSelectCustomer?: (customerId: string) => void,
 * }} props
 */
export function CustomersPage({
  customers = [],
  invoices = [],
  now,
  initialSelectedCustomerId,
  onCreateCustomer,
  onUpdateCustomer,
  onArchiveCustomer,
  onCreateInvoice,
  onOpenInvoice,
  onSelectCustomer,
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("name-asc");
  const [selectedCustomerId, setSelectedCustomerId] = useState(initialSelectedCustomerId || null);
  const [customerDialog, setCustomerDialog] = useState(null);
  const [archiveCustomer, setArchiveCustomer] = useState(null);
  const detailRef = useRef(null);
  const deferredSearch = useDeferredValue(search);
  const currentDate = useMemo(() => now || new Date(), [now]);
  const result = useMemo(
    () => filterAndSortCustomers(customers, invoices, {
      query: deferredSearch,
      filter,
      sort,
      now: currentDate,
    }),
    [currentDate, customers, deferredSearch, filter, invoices, sort],
  );
  const filterOptions = useMemo(() => CUSTOMER_FILTER_OPTIONS.map((option) => ({
    ...option,
    count: filterAndSortCustomers(customers, invoices, {
      filter: option.value,
      now: currentDate,
    }).customers.length,
  })), [currentDate, customers, invoices]);
  const selectedCustomer = customers.find(
    (customer) => customer.id === selectedCustomerId && !isRecordArchived(customer),
  ) || null;

  useEffect(() => {
    if (initialSelectedCustomerId) setSelectedCustomerId(initialSelectedCustomerId);
  }, [initialSelectedCustomerId]);

  useEffect(() => {
    if (selectedCustomerId && !selectedCustomer) setSelectedCustomerId(null);
  }, [selectedCustomer, selectedCustomerId]);

  function selectCustomer(customerId) {
    setSelectedCustomerId(customerId);
    onSelectCustomer?.(customerId);
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 1180px)").matches) {
      window.requestAnimationFrame(() => {
        detailRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
        detailRef.current?.focus?.({ preventScroll: true });
      });
    }
  }

  function clearFilters() {
    setSearch("");
    setFilter("all");
    setSort("name-asc");
  }

  async function createCustomer(values) {
    const created = await onCreateCustomer?.(values);
    if (created?.id) selectCustomer(created.id);
    return created;
  }

  async function updateCustomer(values) {
    if (!customerDialog?.customer) return;
    await onUpdateCustomer?.(customerDialog.customer.id, values);
  }

  async function confirmArchive(customerId) {
    await onArchiveCustomer?.(customerId);
    if (selectedCustomerId === customerId) setSelectedCustomerId(null);
  }

  const activeCustomerCount = customers.filter((customer) => !isRecordArchived(customer)).length;
  const hasFilters = Boolean(search) || filter !== "all" || sort !== "name-asc";

  return (
    <WorkspacePage titleId="studio-customers-title" className="studio-customers-page">
      <PageHeader
        icon={UsersThree}
        eyebrow="Customer directory"
        title="Customers"
        titleId="studio-customers-title"
        description="Keep billing details, private notes, balances, and invoice history together on this computer."
        actions={onCreateCustomer ? (
          <WorkspaceButton
            icon={Plus}
            variant="primary"
            onClick={() => setCustomerDialog({ mode: "create", customer: null })}
          >
            Add customer
          </WorkspaceButton>
        ) : null}
      />

      <div className="studio-customers-layout">
        <section className="studio-panel studio-directory-panel" aria-labelledby="studio-directory-title">
          <SectionHeader
            title="Directory"
            titleId="studio-directory-title"
            description="Search contact details or filter by invoice activity."
            count={activeCustomerCount}
          />

          {activeCustomerCount > 0 ? (
            <div className="studio-directory-toolbar">
              <SearchField
                label="Search customers"
                value={search}
                onChange={setSearch}
                placeholder="Search name, email, phone, or address"
              />
              <FilterGroup
                legend="Filter customers"
                options={filterOptions}
                value={filter}
                onChange={setFilter}
                name="customer-filter"
              />
              <label className="studio-select-field">
                <span>Sort</span>
                <select value={sort} onChange={(event) => setSort(event.target.value)}>
                  <option value="name-asc">Name A–Z</option>
                  <option value="recent-desc">Most recent</option>
                  <option value="invoice-count-desc">Most invoices</option>
                </select>
              </label>
            </div>
          ) : null}

          {activeCustomerCount === 0 ? (
            <EmptyState
              icon={UsersThree}
              title="No customers saved"
              description="Add a customer once, then reuse their billing details on future invoices."
              headingLevel={3}
              actions={onCreateCustomer ? (
                <WorkspaceButton
                  icon={Plus}
                  variant="primary"
                  onClick={() => setCustomerDialog({ mode: "create", customer: null })}
                >
                  Add first customer
                </WorkspaceButton>
              ) : null}
            />
          ) : result.customers.length === 0 ? (
            <EmptyState
              icon={UsersThree}
              title="No customers match"
              description="Try a different search or clear the current filters."
              headingLevel={3}
              compact
              actions={<WorkspaceButton variant="quiet" onClick={clearFilters}>Clear filters</WorkspaceButton>}
            />
          ) : (
            <>
              <p className="studio-results-summary" role="status">
                Showing {result.customers.length} of {activeCustomerCount} customers
                {hasFilters ? " with the current filters" : ""}.
              </p>
              <CustomerDirectory
                customers={result.customers}
                stats={result.stats}
                selectedCustomerId={selectedCustomerId}
                onSelectCustomer={selectCustomer}
              />
            </>
          )}
        </section>

        {activeCustomerCount > 0 ? (
          <CustomerDetail
            detailRef={detailRef}
            customer={selectedCustomer}
            stats={selectedCustomer ? result.stats.get(selectedCustomer.id) : null}
            invoices={invoices}
            now={currentDate}
            onEdit={onUpdateCustomer ? (customer) => setCustomerDialog({ mode: "edit", customer }) : null}
            onArchive={onArchiveCustomer ? setArchiveCustomer : null}
            onCreateInvoice={onCreateInvoice}
            onOpenInvoice={onOpenInvoice}
            onUpdateCustomer={onUpdateCustomer}
          />
        ) : null}
      </div>

      <CustomerDialog
        open={Boolean(customerDialog)}
        mode={customerDialog?.mode}
        customer={customerDialog?.customer}
        onClose={() => setCustomerDialog(null)}
        onSubmit={customerDialog?.mode === "edit" ? updateCustomer : createCustomer}
      />
      <ArchiveCustomerDialog
        open={Boolean(archiveCustomer)}
        customer={archiveCustomer}
        onClose={() => setArchiveCustomer(null)}
        onConfirm={confirmArchive}
      />
    </WorkspacePage>
  );
}
