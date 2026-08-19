import { Archive, X } from "@phosphor-icons/react";
import { useEffect, useId, useRef, useState } from "react";
import { WorkspaceButton } from "./WorkspaceUI.jsx";

export function ArchiveCustomerDialog({ open, customer, onClose, onConfirm }) {
  const dialogRef = useRef(null);
  const cancelRef = useRef(null);
  const titleId = useId();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setWorking(false);
      setError("");
      dialog.showModal();
      window.requestAnimationFrame(() => cancelRef.current?.focus());
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  async function archiveCustomer() {
    if (!customer) return;
    setWorking(true);
    setError("");
    try {
      await onConfirm?.(customer.id);
      onClose?.();
    } catch (archiveError) {
      setError(archiveError?.message || "The customer could not be archived. Try again.");
      setWorking(false);
    }
  }

  return (
    <dialog
      className="studio-dialog studio-confirm-dialog"
      ref={dialogRef}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        if (!working) onClose?.();
      }}
      onClose={() => {
        if (open && !working) onClose?.();
      }}
    >
      <div className="studio-confirm-icon" aria-hidden="true">
        <Archive size={24} weight="duotone" />
      </div>
      <button className="studio-dialog-close" type="button" onClick={onClose} aria-label="Close archive confirmation" disabled={working}>
        <X size={18} weight="bold" aria-hidden="true" />
      </button>
      <h2 id={titleId}>Archive {customer?.name || "this customer"}?</h2>
      <p>The customer leaves the active directory. Existing invoices and their saved details remain unchanged.</p>
      {error ? <p className="studio-form-error" role="alert">{error}</p> : null}
      <div className="studio-confirm-actions">
        <WorkspaceButton buttonRef={cancelRef} onClick={onClose} disabled={working}>Cancel</WorkspaceButton>
        <WorkspaceButton variant="danger" icon={Archive} onClick={archiveCustomer} disabled={working}>
          {working ? "Archiving…" : "Archive customer"}
        </WorkspaceButton>
      </div>
    </dialog>
  );
}
