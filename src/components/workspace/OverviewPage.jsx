import {
  House,
  Plus,
  UploadSimple,
} from "@phosphor-icons/react";
import { useMemo } from "react";
import {
  PageHeader,
  WorkspaceButton,
  WorkspacePage,
} from "./WorkspaceUI.jsx";
import {
  CurrencyMetrics,
  NeedsAttention,
  RecentInvoices,
  SetupCard,
} from "./OverviewSections.jsx";
import {
  getNeedsAttention,
  getRecentInvoices,
  groupInvoiceMetrics,
} from "./workspaceData.js";

/**
 * @param {{
 *   invoices?: Array<object>,
 *   setup?: {status?: string, currentStep?: number, completedSteps?: number, totalSteps?: number, title?: string, description?: string},
 *   now?: Date,
 *   onResumeSetup?: Function,
 *   onNewInvoice?: Function,
 *   onImportInvoice?: Function,
 *   onOpenInvoice?: (invoiceId: string) => void,
 *   onViewInvoices?: Function,
 *   onMetricSelect?: ({metric: string, currency: string}) => void,
 * }} props
 */
export function OverviewPage({
  invoices = [],
  setup,
  now,
  onResumeSetup,
  onNewInvoice,
  onImportInvoice,
  onOpenInvoice,
  onViewInvoices,
  onMetricSelect,
}) {
  const currentDate = useMemo(() => now || new Date(), [now]);
  const metrics = useMemo(
    () => groupInvoiceMetrics(invoices, currentDate),
    [invoices, currentDate],
  );
  const attention = useMemo(
    () => getNeedsAttention(invoices, { now: currentDate }),
    [invoices, currentDate],
  );
  const recent = useMemo(() => getRecentInvoices(invoices), [invoices]);

  return (
    <WorkspacePage titleId="studio-overview-title" className="studio-overview-page">
      <PageHeader
        icon={House}
        eyebrow="Workspace"
        title="Overview"
        titleId="studio-overview-title"
        description="See what needs attention, resume recent work, or start a new invoice. Everything stays on this computer."
        actions={(
          <>
            {onImportInvoice ? (
              <WorkspaceButton icon={UploadSimple} onClick={onImportInvoice}>
                Import
              </WorkspaceButton>
            ) : null}
            {onNewInvoice ? (
              <WorkspaceButton icon={Plus} variant="primary" onClick={onNewInvoice}>
                New invoice
              </WorkspaceButton>
            ) : null}
          </>
        )}
      />

      <SetupCard setup={setup} onResume={onResumeSetup} />
      <CurrencyMetrics groups={metrics} onSelect={onMetricSelect} />

      <div className="studio-overview-grid">
        <NeedsAttention
          invoices={attention}
          now={currentDate}
          onOpenInvoice={onOpenInvoice}
        />
        <RecentInvoices
          invoices={recent}
          now={currentDate}
          onOpenInvoice={onOpenInvoice}
          onViewAll={onViewInvoices}
        />
      </div>
    </WorkspacePage>
  );
}
