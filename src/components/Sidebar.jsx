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
  { label: "Overview", icon: House },
  { label: "Invoices", icon: FileText, active: true },
  { label: "Customers", icon: UsersThree },
  { label: "Company", icon: Buildings },
  { label: "Templates", icon: Palette },
];

export function Sidebar() {
  return (
    <aside className="app-sidebar" aria-label="Primary navigation">
      <div className="brand-mark" aria-label="Invoice Studio">
        <Receipt weight="fill" aria-hidden="true" />
      </div>

      <nav className="sidebar-nav">
        {navigation.map(({ label, icon: Icon, active }) => (
          <button
            className={`sidebar-button${active ? " is-active" : ""}`}
            type="button"
            aria-current={active ? "page" : undefined}
            aria-label={label}
            title={active ? label : `${label} — coming soon`}
            key={label}
          >
            <Icon size={22} weight={active ? "fill" : "regular"} aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      <button className="sidebar-button sidebar-settings" type="button" aria-label="Settings">
        <GearSix size={22} aria-hidden="true" />
        <span>Settings</span>
      </button>
    </aside>
  );
}
