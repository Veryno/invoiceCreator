import {
  ArrowCounterClockwise,
  Check,
  DownloadSimple,
  Eye,
  FileArrowDown,
  FloppyDisk,
  PaintBrush,
} from "@phosphor-icons/react";

function ToolbarButton({ children, icon: Icon, variant = "quiet", ...props }) {
  const accessibleLabel = typeof children === "string" ? children.replace("…", "") : undefined;
  return (
    <button
      className={`toolbar-button toolbar-button--${variant}`}
      type="button"
      aria-label={props["aria-label"] || accessibleLabel}
      title={props.title || accessibleLabel}
      {...props}
    >
      <Icon size={17} weight="bold" aria-hidden="true" />
      <span>{children}</span>
    </button>
  );
}

export function Topbar({
  invoiceNumber,
  savedAt,
  viewMode,
  onViewMode,
  onImport,
  onSaveJson,
  onExport,
  onNew,
  onCustomize,
  isExporting,
}) {
  return (
    <header className="topbar">
      <div className="topbar-title">
        <div>
          <div className="eyebrow">Invoice Studio</div>
          <h1>Invoice {invoiceNumber || "Draft"}</h1>
        </div>
        <div className="autosave-status" role="status">
          <Check size={14} weight="bold" aria-hidden="true" />
          Saved locally {savedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
        </div>
      </div>

      <div className="topbar-actions" aria-label="Invoice actions">
        <ToolbarButton icon={ArrowCounterClockwise} onClick={onNew} title="Start a new invoice">
          New
        </ToolbarButton>
        <ToolbarButton icon={FileArrowDown} onClick={onImport}>
          Import
        </ToolbarButton>
        <ToolbarButton icon={FloppyDisk} onClick={onSaveJson}>
          Save data
        </ToolbarButton>
        <ToolbarButton
          icon={viewMode === "preview" ? PaintBrush : Eye}
          onClick={() => onViewMode(viewMode === "preview" ? "editor" : "preview")}
        >
          {viewMode === "preview" ? "Edit" : "Preview"}
        </ToolbarButton>
        <ToolbarButton icon={PaintBrush} onClick={onCustomize} variant="mobile-only">
          Customize
        </ToolbarButton>
        <ToolbarButton icon={DownloadSimple} onClick={onExport} variant="primary" disabled={isExporting}>
          {isExporting ? "Creating…" : "Save PDF"}
        </ToolbarButton>
      </div>
    </header>
  );
}
