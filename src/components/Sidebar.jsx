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
  { id: "invoices", label: "Invoices", icon: FileText },
  { id: "customers", label: "Customers", icon: UsersThree },
  { id: "company", label: "Company", icon: Buildings },
  { id: "templates", label: "Templates", icon: Palette },
];

export function Sidebar({ activePage = "invoices", onNavigate, onSettings }) {
  return (
    <aside className="app-sidebar" aria-label="Primary navigation">
      <div className="brand-mark" aria-label="Invoice Studio">
        <Receipt weight="fill" aria-hidden="true" />
      </div>

      <nav className="sidebar-nav">
        {navigation.map(({ id, label, icon: Icon }) => {
          const active = id === activePage;
          return (
            <button
              className={`sidebar-button${active ? " is-active" : ""}`}
              type="button"
              aria-current={active ? "page" : undefined}
              aria-label={label}
              title={label}
              key={id}
              onClick={() => onNavigate?.(id)}
            >
              <Icon size={22} weight={active ? "fill" : "regular"} aria-hidden="true" />
              <span>{label}</span>
            </button>
          );
        })}
      </nav>

      <button
        className={`sidebar-button sidebar-settings${activePage === "settings" ? " is-active" : ""}`}
        type="button"
        aria-current={activePage === "settings" ? "page" : undefined}
        aria-label="Settings"
        title="Settings"
        onClick={onSettings}
      >
        <GearSix size={22} aria-hidden="true" />
        <span>Settings</span>
      </button>
    </aside>
  );
}
