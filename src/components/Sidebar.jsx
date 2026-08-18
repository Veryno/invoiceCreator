import {
  Buildings,
  FileText,
  GearSix,
  House,
  Palette,
  Receipt,
  UsersThree,
} from "@phosphor-icons/react";

const navigation = [
  { id: "overview", label: "Overview", icon: House },
  { id: "invoices", label: "Invoices", icon: FileText, enabled: true },
  { id: "customers", label: "Customers", icon: UsersThree },
  { id: "company", label: "Company", icon: Buildings, enabled: true },
  { id: "templates", label: "Templates", icon: Palette },
];

export function Sidebar({ activePage = "invoices", onNavigate, onSettings }) {
  return (
    <aside className="app-sidebar" aria-label="Primary navigation">
      <div className="brand-mark" aria-label="Invoice Studio">
        <Receipt weight="fill" aria-hidden="true" />
      </div>

      <nav className="sidebar-nav">
        {navigation.map(({ id, label, icon: Icon, enabled }) => {
          const active = id === activePage;
          return (
            <button
              className={`sidebar-button${active ? " is-active" : ""}`}
              type="button"
              aria-current={active ? "page" : undefined}
              aria-disabled={!enabled || undefined}
              aria-label={label}
              title={enabled ? label : `${label} — coming soon`}
              key={id}
              onClick={enabled ? () => onNavigate?.(id) : undefined}
            >
              <Icon size={22} weight={active ? "fill" : "regular"} aria-hidden="true" />
              <span>{label}</span>
            </button>
          );
        })}
      </nav>

      <button
        className="sidebar-button sidebar-settings"
        type="button"
        aria-label="Settings and software updates"
        title="Settings and software updates"
        onClick={onSettings}
      >
        <GearSix size={22} aria-hidden="true" />
        <span>Settings</span>
      </button>
    </aside>
  );
}
