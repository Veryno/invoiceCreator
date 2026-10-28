import { ArrowCounterClockwise, TrashSimple } from "@phosphor-icons/react";

const KIND_LABELS = {
  invoices: "Invoice",
  customers: "Customer",
  catalog: "Product / service",
  templates: "Template",
};

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}

/** Everything that was archived or deleted, newest first, with a Restore button. */
export function DeletedItemsCard({ items = [], onRestore }) {
  return (
    <section className="setup-settings-card setup-settings-card--wide" aria-labelledby="settings-deleted-title">
      <div className="setup-settings-card-heading">
        <span><TrashSimple size={20} weight="duotone" aria-hidden="true" /></span>
        <div>
          <h2 id="settings-deleted-title">Archived items</h2>
          <p>Archived or deleted invoices, customers, products, and templates are kept here. Restore puts one back where it was.</p>
        </div>
      </div>
      {items.length ? (
        <ul className="setup-deleted-list">
          {items.map((item) => (
            <li key={`${item.collection}:${item.id}`}>
              <span className="setup-deleted-kind">{KIND_LABELS[item.collection]}</span>
              <span className="setup-deleted-name">
                <strong>{item.name}</strong>
                {item.detail ? <small>{item.detail}</small> : null}
              </span>
              <span className="setup-deleted-date">Archived {formatDate(item.archivedAt)}</span>
              <button
                className="setup-button setup-button--secondary"
                type="button"
                onClick={() => onRestore?.(item)}
              >
                <ArrowCounterClockwise size={16} aria-hidden="true" />
                Restore
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="setup-autobackup-note">Nothing is archived.</p>
      )}
    </section>
  );
}
