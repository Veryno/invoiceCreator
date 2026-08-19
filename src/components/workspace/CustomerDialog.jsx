import { X } from "@phosphor-icons/react";
import { useEffect, useId, useRef, useState } from "react";
import { WorkspaceButton } from "./WorkspaceUI.jsx";

const EMPTY_CUSTOMER = {
  name: "",
  email: "",
  phone: "",
  address: "",
  notes: "",
};

function editableCustomer(customer) {
  return {
    name: customer?.name || "",
    email: customer?.email || "",
    phone: customer?.phone || "",
    address: customer?.address || "",
    notes: customer?.notes || "",
  };
}

export function CustomerDialog({ open, mode = "create", customer, onClose, onSubmit }) {
  const dialogRef = useRef(null);
  const nameRef = useRef(null);
  const titleId = useId();
  const errorId = useId();
  const [values, setValues] = useState(EMPTY_CUSTOMER);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setValues(mode === "edit" ? editableCustomer(customer) : EMPTY_CUSTOMER);
    setError("");
    setSaving(false);
  }, [customer, mode, open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      window.requestAnimationFrame(() => nameRef.current?.focus());
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  function updateValue(field, value) {
    setValues((current) => ({ ...current, [field]: value }));
    if (error) setError("");
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const name = values.name.trim();
    if (!name) {
      setError("Enter a customer or company name.");
      nameRef.current?.focus();
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSubmit?.({
        name,
        email: values.email.trim(),
        phone: values.phone.trim(),
        address: values.address.trim(),
        notes: values.notes.trim(),
      });
      onClose?.();
    } catch (submitError) {
      setError(submitError?.message || "The customer could not be saved. Try again.");
      setSaving(false);
    }
  }

  return (
    <dialog
      className="studio-dialog"
      ref={dialogRef}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        if (!saving) onClose?.();
      }}
      onClose={() => {
        if (open && !saving) onClose?.();
      }}
    >
      <form className="studio-dialog-form" onSubmit={handleSubmit}>
        <header className="studio-dialog-header">
          <div>
            <p>{mode === "edit" ? "Customer details" : "Customer directory"}</p>
            <h2 id={titleId}>{mode === "edit" ? "Edit customer" : "Add customer"}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close customer form" disabled={saving}>
            <X size={19} weight="bold" aria-hidden="true" />
          </button>
        </header>

        <div className="studio-dialog-fields">
          <label className="studio-field studio-field--wide">
            <span>Customer or company name</span>
            <input
              ref={nameRef}
              value={values.name}
              autoComplete="organization"
              required
              aria-invalid={Boolean(error && !values.name.trim())}
              aria-describedby={error ? errorId : undefined}
              onChange={(event) => updateValue("name", event.target.value)}
            />
          </label>
          <label className="studio-field">
            <span>Email</span>
            <input
              type="email"
              value={values.email}
              autoComplete="email"
              onChange={(event) => updateValue("email", event.target.value)}
            />
          </label>
          <label className="studio-field">
            <span>Phone</span>
            <input
              type="tel"
              value={values.phone}
              autoComplete="tel"
              onChange={(event) => updateValue("phone", event.target.value)}
            />
          </label>
          <label className="studio-field studio-field--wide">
            <span>Billing address</span>
            <textarea
              rows="3"
              value={values.address}
              autoComplete="street-address"
              onChange={(event) => updateValue("address", event.target.value)}
            />
          </label>
          <label className="studio-field studio-field--wide">
            <span>Private notes</span>
            <small>Notes stay in Invoice Studio and never appear on the customer’s invoice.</small>
            <textarea
              rows="3"
              value={values.notes}
              onChange={(event) => updateValue("notes", event.target.value)}
            />
          </label>
          {error ? <p className="studio-form-error" id={errorId} role="alert">{error}</p> : null}
        </div>

        <footer className="studio-dialog-footer">
          <WorkspaceButton onClick={onClose} disabled={saving}>Cancel</WorkspaceButton>
          <WorkspaceButton variant="primary" type="submit" disabled={saving}>
            {saving ? "Saving…" : mode === "edit" ? "Save changes" : "Add customer"}
          </WorkspaceButton>
        </footer>
      </form>
    </dialog>
  );
}
