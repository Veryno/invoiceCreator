import { CheckCircle, WarningCircle, X } from "@phosphor-icons/react";
import { useEffect } from "react";

export function Toast({ toast, onClose }) {
  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(onClose, 4500);
    return () => window.clearTimeout(timer);
  }, [toast, onClose]);

  if (!toast) return null;
  const Icon = toast.type === "error" ? WarningCircle : CheckCircle;

  return (
    <div className={`toast toast--${toast.type || "success"}`} role={toast.type === "error" ? "alert" : "status"}>
      <Icon size={21} weight="fill" aria-hidden="true" />
      <div>
        <strong>{toast.title}</strong>
        {toast.message && <span>{toast.message}</span>}
      </div>
      <button type="button" onClick={onClose} aria-label="Dismiss notification">
        <X size={16} weight="bold" aria-hidden="true" />
      </button>
    </div>
  );
}
