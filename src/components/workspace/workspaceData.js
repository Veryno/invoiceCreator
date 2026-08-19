const DAY_MS = 24 * 60 * 60 * 1000;

export const INVOICE_STATUS_OPTIONS = [
  { value: "all", label: "All" },
  { value: "open", label: "Open" },
  { value: "draft", label: "Draft" },
  { value: "sent", label: "Sent" },
  { value: "paid", label: "Paid" },
  { value: "overdue", label: "Overdue" },
];

export const CUSTOMER_FILTER_OPTIONS = [
  { value: "all", label: "All" },
  { value: "unpaid", label: "Unpaid" },
  { value: "overdue", label: "Overdue" },
  { value: "recent", label: "Recent" },
];

const STATUS_LABELS = {
  draft: "Draft",
  sent: "Sent",
  paid: "Paid",
  overdue: "Overdue",
};

export function isRecordArchived(record) {
  return Boolean(record?.archivedAt || record?.archived);
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function timestamp(value) {
  if (!value) return 0;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(value))
    ? new Date(`${value}T12:00:00`)
    : new Date(value);
  const result = date.getTime();
  return Number.isFinite(result) ? result : 0;
}

export function normalizeInvoiceStatus(value) {
  const normalized = String(value || "draft").trim().toLowerCase();
  return STATUS_LABELS[normalized] ? normalized : "draft";
}

export function getInvoiceBalance(invoice) {
  if (invoice?.balance !== undefined && invoice?.balance !== null) {
    return finiteNumber(invoice.balance);
  }
  return normalizeInvoiceStatus(invoice?.status) === "paid" ? 0 : finiteNumber(invoice?.total);
}

export function isInvoiceOverdue(invoice, now = new Date()) {
  const status = normalizeInvoiceStatus(invoice?.status);
  if (status === "paid" || status === "draft" || getInvoiceBalance(invoice) <= 0) return false;
  if (status === "overdue") return true;
  const due = dayTimestamp(invoice?.dueDate);
  return due > 0 && due < startOfLocalDay(now).getTime();
}

export function getEffectiveInvoiceStatus(invoice, now = new Date()) {
  return isInvoiceOverdue(invoice, now) ? "overdue" : normalizeInvoiceStatus(invoice?.status);
}

export function getStatusLabel(invoice, now = new Date()) {
  return STATUS_LABELS[getEffectiveInvoiceStatus(invoice, now)] || "Draft";
}

export function formatCurrencyAmount(amount, currency = "USD", locale = "en-US") {
  const safeCurrency = /^[A-Z]{3}$/.test(String(currency || "").toUpperCase())
    ? String(currency).toUpperCase()
    : "USD";
  try {
    return new Intl.NumberFormat(locale || "en-US", {
      style: "currency",
      currency: safeCurrency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(finiteNumber(amount));
  } catch {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(finiteNumber(amount));
  }
}

export function formatWorkspaceDate(value, locale = "en-US") {
  const dateValue = timestamp(value);
  if (!dateValue) return "—";
  try {
    return new Intl.DateTimeFormat(locale || "en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(dateValue));
  } catch {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(dateValue));
  }
}

export function formatDueContext(invoice, now = new Date()) {
  const due = dayTimestamp(invoice?.dueDate);
  if (!due) return "No due date";
  const days = Math.round((due - startOfLocalDay(now).getTime()) / DAY_MS);
  if (days < 0) return `${Math.abs(days)} ${Math.abs(days) === 1 ? "day" : "days"} overdue`;
  if (days === 0) return "Due today";
  return `Due in ${days} ${days === 1 ? "day" : "days"}`;
}

export function compareInvoicesRecent(first, second) {
  return timestamp(second?.updatedAt || second?.issueDate)
    - timestamp(first?.updatedAt || first?.issueDate);
}

export function filterInvoices(invoices, { query = "", status = "all", currency = "all", now = new Date() } = {}) {
  const normalizedQuery = String(query).trim().toLocaleLowerCase();
  return [...(Array.isArray(invoices) ? invoices : [])]
    .filter((invoice) => {
      if (isRecordArchived(invoice)) return false;
      const effectiveStatus = getEffectiveInvoiceStatus(invoice, now);
      const matchesStatus = status === "all"
        || (status === "open"
          && effectiveStatus !== "draft"
          && effectiveStatus !== "paid"
          && getInvoiceBalance(invoice) > 0)
        || effectiveStatus === status;
      const matchesCurrency = currency === "all"
        || String(invoice?.currency || "USD").toUpperCase() === currency;
      const haystack = [invoice?.number, invoice?.customerName, invoice?.status]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase();
      return matchesStatus && matchesCurrency && (!normalizedQuery || haystack.includes(normalizedQuery));
    })
    .sort(compareInvoicesRecent);
}

export function groupInvoiceMetrics(invoices, now = new Date()) {
  const groups = new Map();
  for (const invoice of Array.isArray(invoices) ? invoices : []) {
    if (isRecordArchived(invoice)) continue;
    const currency = String(invoice?.currency || "USD").toUpperCase();
    const status = getEffectiveInvoiceStatus(invoice, now);
    const balance = Math.max(0, getInvoiceBalance(invoice));
    const current = groups.get(currency) || {
      currency,
      locale: invoice?.locale || "en-US",
      invoiceCount: 0,
      openBalance: 0,
      overdueBalance: 0,
      paidTotal: 0,
    };
    current.invoiceCount += 1;
    if (status !== "draft" && status !== "paid") current.openBalance += balance;
    if (status === "overdue") current.overdueBalance += balance;
    if (status === "paid") current.paidTotal += Math.max(0, finiteNumber(invoice?.total));
    groups.set(currency, current);
  }
  return [...groups.values()].sort((first, second) => first.currency.localeCompare(second.currency));
}

export function getNeedsAttention(invoices, { now = new Date(), limit = 5, dueSoonDays = 7 } = {}) {
  const today = startOfLocalDay(now).getTime();
  const cutoff = today + (dueSoonDays * DAY_MS);
  return [...(Array.isArray(invoices) ? invoices : [])]
    .filter((invoice) => {
      if (isRecordArchived(invoice)) return false;
      const status = getEffectiveInvoiceStatus(invoice, now);
      const due = dayTimestamp(invoice?.dueDate);
      const isOpen = getInvoiceBalance(invoice) > 0
        && status !== "draft"
        && status !== "paid";
      return isOpen && (status === "overdue" || (due > 0 && due <= cutoff));
    })
    .sort((first, second) => dayTimestamp(first?.dueDate) - dayTimestamp(second?.dueDate))
    .slice(0, Math.max(0, limit));
}

export function getRecentInvoices(invoices, limit = 6) {
  return [...(Array.isArray(invoices) ? invoices : [])]
    .filter((invoice) => !isRecordArchived(invoice))
    .sort(compareInvoicesRecent)
    .slice(0, Math.max(0, limit));
}

export function buildCustomerStats(customers, invoices, now = new Date()) {
  const stats = new Map();
  for (const customer of Array.isArray(customers) ? customers : []) {
    if (isRecordArchived(customer)) continue;
    stats.set(customer.id, {
      invoiceCount: 0,
      unpaidCount: 0,
      overdueCount: 0,
      latestActivity: customer.updatedAt || customer.createdAt || "",
      balances: new Map(),
    });
  }

  for (const invoice of Array.isArray(invoices) ? invoices : []) {
    if (isRecordArchived(invoice)) continue;
    if (!stats.has(invoice?.customerId)) continue;
    const customerStats = stats.get(invoice.customerId);
    const status = getEffectiveInvoiceStatus(invoice, now);
    const balance = Math.max(0, getInvoiceBalance(invoice));
    const currency = String(invoice?.currency || "USD").toUpperCase();
    customerStats.invoiceCount += 1;
    if (status !== "draft" && status !== "paid" && balance > 0) customerStats.unpaidCount += 1;
    if (status === "overdue" && balance > 0) customerStats.overdueCount += 1;
    if (timestamp(invoice?.updatedAt || invoice?.issueDate) > timestamp(customerStats.latestActivity)) {
      customerStats.latestActivity = invoice?.updatedAt || invoice?.issueDate;
    }
    const amounts = customerStats.balances.get(currency) || { currency, outstanding: 0, overdue: 0 };
    if (status !== "draft" && status !== "paid") amounts.outstanding += balance;
    if (status === "overdue") amounts.overdue += balance;
    customerStats.balances.set(currency, amounts);
  }

  for (const [customerId, customerStats] of stats) {
    stats.set(customerId, {
      ...customerStats,
      balances: [...customerStats.balances.values()].sort((a, b) => a.currency.localeCompare(b.currency)),
    });
  }
  return stats;
}

export function filterAndSortCustomers(customers, invoices, {
  query = "",
  filter = "all",
  sort = "name-asc",
  now = new Date(),
  recentDays = 30,
} = {}) {
  const normalizedQuery = String(query).trim().toLocaleLowerCase();
  const stats = buildCustomerStats(customers, invoices, now);
  const recentCutoff = startOfLocalDay(now).getTime() - (recentDays * DAY_MS);
  const filtered = (Array.isArray(customers) ? customers : []).filter((customer) => {
    if (isRecordArchived(customer)) return false;
    const customerStats = stats.get(customer.id);
    const haystack = [customer?.name, customer?.email, customer?.phone, customer?.address]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase();
    if (normalizedQuery && !haystack.includes(normalizedQuery)) return false;
    if (filter === "unpaid") return customerStats?.unpaidCount > 0;
    if (filter === "overdue") return customerStats?.overdueCount > 0;
    if (filter === "recent") return timestamp(customerStats?.latestActivity) >= recentCutoff;
    return true;
  });

  filtered.sort((first, second) => {
    const firstStats = stats.get(first.id);
    const secondStats = stats.get(second.id);
    if (sort === "recent-desc") {
      return timestamp(secondStats?.latestActivity) - timestamp(firstStats?.latestActivity);
    }
    if (sort === "invoice-count-desc") {
      return (secondStats?.invoiceCount || 0) - (firstStats?.invoiceCount || 0)
        || String(first?.name || "").localeCompare(String(second?.name || ""));
    }
    return String(first?.name || "").localeCompare(String(second?.name || ""));
  });

  return { customers: filtered, stats };
}

function startOfLocalDay(value) {
  const date = value instanceof Date ? new Date(value) : new Date(value || Date.now());
  date.setHours(0, 0, 0, 0);
  return date;
}

function dayTimestamp(value) {
  const valueTimestamp = timestamp(value);
  return valueTimestamp ? startOfLocalDay(new Date(valueTimestamp)).getTime() : 0;
}
