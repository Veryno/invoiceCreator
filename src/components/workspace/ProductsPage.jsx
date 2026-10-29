import {
  Archive,
  PencilSimple,
  Plus,
  Toolbox,
  X,
} from "@phosphor-icons/react";
import { useDeferredValue, useEffect, useId, useMemo, useRef, useState } from "react";
import { buildProductOptions, filterProductOptions } from "../../lib/catalog.js";
import { formatMoney } from "../../lib/invoice.js";
import { NumberField } from "../NumberField.jsx";
import {
  EmptyState,
  PageHeader,
  SearchField,
  SectionHeader,
  WorkspaceButton,
  WorkspacePage,
} from "./WorkspaceUI.jsx";

const UNITS = ["each", "hour", "day", "sq ft", "linear ft", "square", "cubic yd", "lot"];

function ProductDialog({ open, product, onClose, onSubmit }) {
  const dialogRef = useRef(null);
  const nameRef = useRef(null);
  const titleId = useId();
  const [values, setValues] = useState({ name: "", description: "", unit: "each", rate: 0, taxable: false });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setValues({
      name: product?.name || "",
      description: product?.description || "",
      unit: product?.unit || "each",
      rate: Number(product?.rate) || 0,
      taxable: Boolean(product?.taxable),
    });
    setError("");
    setSaving(false);
  }, [open, product]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      window.requestAnimationFrame(() => nameRef.current?.focus());
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  async function submit(event) {
    event.preventDefault();
    if (!values.name.trim()) {
      setError("Enter a name for this product or service.");
      return;
    }
    setSaving(true);
    try {
      await onSubmit({ ...values, name: values.name.trim(), description: values.description.trim() });
      onClose();
    } catch (submitError) {
      setError(submitError?.message || "It couldn’t be saved. Try again.");
      setSaving(false);
    }
  }

  const update = (field, value) => setValues((current) => ({ ...current, [field]: value }));

  return (
    <dialog
      className="studio-dialog"
      ref={dialogRef}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        if (!saving) onClose();
      }}
    >
      <form className="studio-dialog-form" onSubmit={submit}>
        <header className="studio-dialog-header">
          <div>
            <p>Products &amp; services</p>
            <h2 id={titleId}>{product?.id && !product.id.startsWith("common:") ? "Edit item" : "New product or service"}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" disabled={saving}>
            <X size={19} weight="bold" aria-hidden="true" />
          </button>
        </header>
        <div className="studio-dialog-fields">
          <label className="studio-field studio-field--wide">
            <span>Name</span>
            <input ref={nameRef} value={values.name} onChange={(event) => update("name", event.target.value)} />
          </label>
          <label className="studio-field studio-field--wide">
            <span>Description on invoices</span>
            <textarea rows="2" value={values.description} onChange={(event) => update("description", event.target.value)} />
          </label>
          <label className="studio-field">
            <span>Default rate</span>
            <NumberField value={values.rate} decimals={2} onValue={(rate) => update("rate", rate)} />
          </label>
          <label className="studio-field">
            <span>Unit</span>
            <select value={values.unit} onChange={(event) => update("unit", event.target.value)}>
              {[...new Set([...UNITS, values.unit])].map((unit) => <option key={unit}>{unit}</option>)}
            </select>
          </label>
          <label className="studio-checkbox-field studio-field--wide">
            <input type="checkbox" checked={values.taxable} onChange={(event) => update("taxable", event.target.checked)} />
            Charge sales tax on this item
          </label>
          {error ? <p className="studio-form-error studio-field--wide" role="alert">{error}</p> : null}
        </div>
        <footer className="studio-dialog-footer">
          <WorkspaceButton onClick={onClose} disabled={saving}>Cancel</WorkspaceButton>
          <WorkspaceButton variant="primary" type="submit" disabled={saving}>{saving ? "Saving…" : "Save"}</WorkspaceButton>
        </footer>
      </form>
    </dialog>
  );
}

export function ProductsPage({ catalog = [], onSaveProduct, onArchiveProduct }) {
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(null);
  const deferredSearch = useDeferredValue(search);
  const options = useMemo(() => buildProductOptions(catalog), [catalog]);
  const filtered = useMemo(() => filterProductOptions(options, deferredSearch), [options, deferredSearch]);

  return (
    <WorkspacePage titleId="studio-products-title" className="studio-products-page">
      <PageHeader
        icon={Toolbox}
        eyebrow="Price list"
        title="Products & services"
        titleId="studio-products-title"
        description="Save the work and materials you bill for, with default rates, so invoice lines fill in with one pick."
        actions={(
          <WorkspaceButton icon={Plus} variant="primary" onClick={() => setEditing({})}>
            New item
          </WorkspaceButton>
        )}
      />

      <section className="studio-panel" aria-labelledby="studio-saved-products-title">
        <SectionHeader
          title="My products & services"
          titleId="studio-saved-products-title"
          description="These appear first in every invoice line’s product/service dropdown."
          count={options.saved.length}
          action={options.saved.length > 6 ? (
            <SearchField label="Search products and services" value={search} onChange={setSearch} placeholder="Search" />
          ) : null}
        />
        {options.saved.length === 0 ? (
          <EmptyState
            icon={Toolbox}
            title="No saved items yet"
            description="Add your own, or save one of the common construction items below with your usual rate."
            headingLevel={3}
            compact
          />
        ) : (
          <div className="studio-table-scroll">
            <table className="studio-table products-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Description</th>
                  <th>Unit</th>
                  <th className="studio-table-number">Rate</th>
                  <th>Tax</th>
                  <th><span className="studio-visually-hidden">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {filtered.saved.map((item) => (
                  <tr key={item.id}>
                    <td><strong>{item.name}</strong></td>
                    <td className="products-description">{item.description || "—"}</td>
                    <td>{item.unit}</td>
                    <td className="studio-table-number">{item.rate ? formatMoney(item.rate) : "—"}</td>
                    <td>{item.taxable ? "Taxable" : "—"}</td>
                    <td className="studio-table-action">
                      <button type="button" aria-label={`Edit ${item.name}`} title="Edit" onClick={() => setEditing(item)}>
                        <PencilSimple size={16} aria-hidden="true" />
                      </button>
                      <button type="button" aria-label={`Remove ${item.name}`} title="Remove" onClick={() => onArchiveProduct(item.id)}>
                        <Archive size={16} aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="studio-panel" aria-labelledby="studio-common-products-title">
        <SectionHeader
          title="Common construction items"
          titleId="studio-common-products-title"
          description="Always available in the dropdown. Save one to give it your default rate and description."
          count={options.common.length}
        />
        <div className="products-common-grid">
          {filtered.common.map((item) => (
            <button type="button" key={item.id} className="products-common-item" onClick={() => setEditing({ ...item })}>
              <span>
                <strong>{item.name}</strong>
                <small>{item.description}</small>
              </span>
              <Plus size={14} weight="bold" aria-hidden="true" />
            </button>
          ))}
        </div>
      </section>

      <ProductDialog
        open={Boolean(editing)}
        product={editing}
        onClose={() => setEditing(null)}
        onSubmit={(values) => onSaveProduct({
          ...(editing?.id && !editing.id.startsWith("common:") ? { id: editing.id } : {}),
          ...values,
        })}
      />
    </WorkspacePage>
  );
}
