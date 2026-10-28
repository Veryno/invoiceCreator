import {
  Buildings,
  FileText,
  GearSix,
  House,
  Palette,
  Plus,
  Receipt,
  SlidersHorizontal,
  Toolbox,
  UsersThree,
} from "@phosphor-icons/react";

const navigation = [
  { id: "overview", label: "Dashboard", icon: House },
  { id: "invoices", label: "Invoices", icon: FileText },
  { id: "customers", label: "Customers", icon: UsersThree },
  { id: "products", label: "Products & services", icon: Toolbox },
  { id: "company", label: "Company", icon: Buildings },
  { id: "templates", label: "Templates", icon: Palette },
  { id: "customize", label: "Customize", icon: SlidersHorizontal },
];

export function Sidebar({ activePage = "invoices", onNavigate, onSettings, onNewInvoice, companyName }) {
  return (
    <aside className="app-sidebar" aria-label="Primary navigation">
      <div className="sidebar-brand">
        <div className="brand-mark" aria-hidden="true">
          <Receipt weight="fill" />
        </div>
        <div className="sidebar-brand-text">
          <strong>Invoice Studio</strong>
          <span>{companyName || "Contractor invoicing"}</span>
        </div>
      </div>

      {onNewInvoice ? (
        <button type="button" className="sidebar-new" onClick={onNewInvoice} title="New invoice" aria-label="New invoice">
          <Plus size={18} weight="bold" aria-hidden="true" />
          <span>New invoice</span>
        </button>
      ) : null}

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
              <Icon size={20} weight={active ? "fill" : "regular"} aria-hidden="true" />
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
        <GearSix size={20} weight={activePage === "settings" ? "fill" : "regular"} aria-hidden="true" />
        <span>Settings</span>
      </button>
    </aside>
  );
}
