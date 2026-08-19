import {
  MagnifyingGlass,
  Receipt,
} from "@phosphor-icons/react";
import { useId } from "react";
import { formatCurrencyAmount, getStatusLabel } from "./workspaceData.js";
import "./workspace.css";

export function WorkspacePage({ titleId, children, className = "" }) {
  return (
    <main
      className={`studio-page${className ? ` ${className}` : ""}`}
      aria-labelledby={titleId}
    >
      <div className="studio-page-inner">{children}</div>
    </main>
  );
}

export function PageHeader({
  icon: Icon,
  eyebrow,
  title,
  titleId,
  description,
  actions,
}) {
  return (
    <header className="studio-page-header">
      <div className="studio-page-heading">
        {Icon ? (
          <span className="studio-page-heading-icon" aria-hidden="true">
            <Icon size={24} weight="duotone" />
          </span>
        ) : null}
        <div>
          {eyebrow ? <p className="studio-page-kicker">{eyebrow}</p> : null}
          <h1 id={titleId}>{title}</h1>
          {description ? <p className="studio-page-description">{description}</p> : null}
        </div>
      </div>
      {actions ? <div className="studio-page-actions">{actions}</div> : null}
    </header>
  );
}

export function WorkspaceButton({
  icon: Icon,
  variant = "secondary",
  children,
  className = "",
  buttonRef,
  ...buttonProps
}) {
  return (
    <button
      ref={buttonRef}
      className={`studio-button studio-button--${variant}${className ? ` ${className}` : ""}`}
      type="button"
      {...buttonProps}
    >
      {Icon ? <Icon size={17} weight="bold" aria-hidden="true" /> : null}
      <span>{children}</span>
    </button>
  );
}

export function SectionHeader({ title, titleId, description, action, count }) {
  return (
    <div className="studio-section-header">
      <div>
        <div className="studio-section-title-line">
          <h2 id={titleId}>{title}</h2>
          {Number.isFinite(count) ? <span className="studio-count">{count}</span> : null}
        </div>
        {description ? <p>{description}</p> : null}
      </div>
      {action ? <div className="studio-section-action">{action}</div> : null}
    </div>
  );
}

export function SearchField({ label, value, onChange, placeholder }) {
  const generatedId = useId();
  return (
    <label className="studio-search" htmlFor={generatedId}>
      <span className="studio-visually-hidden">{label}</span>
      <MagnifyingGlass size={17} aria-hidden="true" />
      <input
        id={generatedId}
        type="search"
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

export function FilterGroup({ legend, options, value, onChange, name }) {
  const generatedName = useId();
  const radioName = name || generatedName;
  return (
    <fieldset className="studio-filter-group">
      <legend className="studio-visually-hidden">{legend}</legend>
      {options.map((option) => (
        <label key={option.value}>
          <input
            type="radio"
            name={radioName}
            value={option.value}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
          />
          <span>
            {option.label}
            {Number.isFinite(option.count) ? <small>{option.count}</small> : null}
          </span>
        </label>
      ))}
    </fieldset>
  );
}

export function EmptyState({
  icon: Icon = Receipt,
  title,
  description,
  actions,
  compact = false,
  headingLevel = 2,
}) {
  const Heading = headingLevel === 3 ? "h3" : "h2";
  return (
    <div className={`studio-empty${compact ? " studio-empty--compact" : ""}`} role="status">
      <span className="studio-empty-icon" aria-hidden="true">
        <Icon size={28} weight="duotone" />
      </span>
      <Heading>{title}</Heading>
      {description ? <p>{description}</p> : null}
      {actions ? <div className="studio-empty-actions">{actions}</div> : null}
    </div>
  );
}

export function StatusBadge({ invoice, now }) {
  const label = getStatusLabel(invoice, now);
  return (
    <span className={`studio-status studio-status--${label.toLowerCase()}`}>
      <span className="studio-status-dot" aria-hidden="true" />
      {label}
    </span>
  );
}

export function MoneyStack({ amounts, field = "outstanding", emptyLabel = "—" }) {
  const visibleAmounts = (Array.isArray(amounts) ? amounts : [])
    .filter((amount) => Number(amount?.[field]) !== 0);
  if (visibleAmounts.length === 0) return <span className="studio-muted-value">{emptyLabel}</span>;
  return (
    <span className="studio-money-stack">
      {visibleAmounts.map((amount) => (
        <span key={amount.currency}>
          {formatCurrencyAmount(amount[field], amount.currency, amount.locale)}
          {visibleAmounts.length > 1 ? <small>{amount.currency}</small> : null}
        </span>
      ))}
    </span>
  );
}
