import {
  ArrowRight,
  CheckCircle,
  Clock,
  CurrencyDollar,
  FileText,
  WarningCircle,
} from "@phosphor-icons/react";
import {
  EmptyState,
  SectionHeader,
  StatusBadge,
  WorkspaceButton,
} from "./WorkspaceUI.jsx";
import {
  formatCurrencyAmount,
  formatDueContext,
  formatWorkspaceDate,
  getInvoiceBalance,
} from "./workspaceData.js";

export function SetupCard({ setup, onResume }) {
  if (!setup || setup.status === "complete") return null;
  const totalSteps = Math.max(1, Number(setup.totalSteps) || 4);
  const completedSteps = Math.min(
    totalSteps,
    Math.max(0, Number(setup.completedSteps ?? setup.currentStep) || 0),
  );
  return (
    <section className="studio-setup-card" aria-labelledby="studio-setup-title">
      <div className="studio-setup-icon" aria-hidden="true">
        <CheckCircle size={24} weight="duotone" />
      </div>
      <div className="studio-setup-copy">
        <p className="studio-card-kicker">Quick setup</p>
        <h2 id="studio-setup-title">{setup.title || "Finish setting up Invoice Studio"}</h2>
        <p>{setup.description || "Complete the remaining steps so every new invoice starts ready to send."}</p>
        <div className="studio-setup-progress">
          <progress
            value={completedSteps}
            max={totalSteps}
            aria-label={`Setup progress: ${completedSteps} of ${totalSteps} steps complete`}
          >
            {completedSteps} of {totalSteps} steps complete
          </progress>
          <span>{completedSteps} of {totalSteps} steps</span>
        </div>
      </div>
      {onResume ? (
        <WorkspaceButton icon={ArrowRight} variant="primary" onClick={onResume}>
          Resume setup
        </WorkspaceButton>
      ) : null}
    </section>
  );
}

function MetricCard({ icon: Icon, label, value, detail, onSelect }) {
  const content = (
    <>
      <span className="studio-metric-icon" aria-hidden="true">
        <Icon size={19} weight="duotone" />
      </span>
      <span className="studio-metric-copy">
        <small>{label}</small>
        <strong>{value}</strong>
        <span>{detail}</span>
      </span>
      {onSelect ? <ArrowRight className="studio-metric-arrow" size={16} aria-hidden="true" /> : null}
    </>
  );
  if (onSelect) {
    return (
      <button className="studio-metric" type="button" onClick={onSelect} aria-label={`${label}: ${value}. ${detail}`}>
        {content}
      </button>
    );
  }
  return <div className="studio-metric">{content}</div>;
}

export function CurrencyMetrics({ groups, onSelect }) {
  if (groups.length === 0) return null;
  return (
    <section className="studio-metrics-section" aria-labelledby="studio-metrics-title">
      <SectionHeader
        title="Invoice snapshot"
        titleId="studio-metrics-title"
        description="Each currency stays separate so totals remain accurate."
      />
      <div className="studio-currency-groups">
        {groups.map((group) => {
          const amount = (value) => formatCurrencyAmount(value, group.currency, group.locale);
          const select = (metric) => onSelect
            ? () => onSelect({ metric, currency: group.currency })
            : undefined;
          return (
            <section className="studio-currency-group" key={group.currency} aria-label={`${group.currency} invoice totals`}>
              <h3>{group.currency}</h3>
              <div className="studio-metric-grid">
                <MetricCard
                  icon={CurrencyDollar}
                  label="Open balance"
                  value={amount(group.openBalance)}
                  detail="Sent and overdue"
                  onSelect={select("open")}
                />
                <MetricCard
                  icon={WarningCircle}
                  label="Overdue"
                  value={amount(group.overdueBalance)}
                  detail="Needs follow-up"
                  onSelect={select("overdue")}
                />
                <MetricCard
                  icon={CheckCircle}
                  label="Paid"
                  value={amount(group.paidTotal)}
                  detail="Recorded as paid"
                  onSelect={select("paid")}
                />
                <MetricCard
                  icon={FileText}
                  label="Invoices"
                  value={String(group.invoiceCount)}
                  detail="All statuses"
                  onSelect={select("all")}
                />
              </div>
            </section>
          );
        })}
      </div>
    </section>
  );
}

export function NeedsAttention({ invoices, now, onOpenInvoice }) {
  return (
    <section className="studio-panel studio-attention" aria-labelledby="studio-attention-title">
      <SectionHeader
        title="Needs attention"
        titleId="studio-attention-title"
        description="Open invoices due soon or already overdue."
        count={invoices.length}
      />
      {invoices.length === 0 ? (
        <EmptyState
          icon={CheckCircle}
          title="Nothing needs attention"
          description="Invoices due within seven days will appear here."
          compact
          headingLevel={3}
        />
      ) : (
        <ul className="studio-attention-list">
          {invoices.map((invoice) => (
            <li key={invoice.id}>
              <span className="studio-attention-icon" aria-hidden="true">
                <Clock size={18} weight="duotone" />
              </span>
              <div>
                <strong>{invoice.customerName || "Customer not set"}</strong>
                <span>{invoice.number || "Draft invoice"} · {formatDueContext(invoice, now)}</span>
              </div>
              <div className="studio-attention-amount">
                <strong>{formatCurrencyAmount(getInvoiceBalance(invoice), invoice.currency, invoice.locale)}</strong>
                <StatusBadge invoice={invoice} now={now} />
              </div>
              {onOpenInvoice ? (
                <button type="button" onClick={() => onOpenInvoice(invoice.id)}>
                  Open<span className="studio-visually-hidden"> invoice {invoice.number || "draft"}</span>
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function RecentInvoices({ invoices, now, onOpenInvoice, onViewAll }) {
  return (
    <section className="studio-panel studio-recent" aria-labelledby="studio-recent-title">
      <SectionHeader
        title="Recent invoices"
        titleId="studio-recent-title"
        description="Your most recently updated work."
        action={onViewAll ? (
          <WorkspaceButton variant="quiet" onClick={onViewAll}>View all</WorkspaceButton>
        ) : null}
      />
      {invoices.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No invoices yet"
          description="Create or import an invoice to start your local library."
          compact
          headingLevel={3}
        />
      ) : (
        <div className="studio-table-scroll" role="region" aria-label="Recent invoices table" tabIndex="0">
          <table className="studio-table studio-table--recent">
            <caption className="studio-visually-hidden">Recently updated invoices</caption>
            <thead>
              <tr>
                <th scope="col">Invoice</th>
                <th scope="col">Customer</th>
                <th scope="col">Due</th>
                <th scope="col">Status</th>
                <th scope="col" className="studio-table-number">Balance</th>
                <th scope="col"><span className="studio-visually-hidden">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => (
                <tr key={invoice.id}>
                  <td><strong>{invoice.number || "Draft"}</strong></td>
                  <td>{invoice.customerName || "Customer not set"}</td>
                  <td>{formatWorkspaceDate(invoice.dueDate, invoice.locale)}</td>
                  <td><StatusBadge invoice={invoice} now={now} /></td>
                  <td className="studio-table-number">
                    {formatCurrencyAmount(getInvoiceBalance(invoice), invoice.currency, invoice.locale)}
                  </td>
                  <td className="studio-table-action">
                    {onOpenInvoice ? (
                      <button type="button" onClick={() => onOpenInvoice(invoice.id)}>
                        Open<span className="studio-visually-hidden"> invoice {invoice.number || "draft"}</span>
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
