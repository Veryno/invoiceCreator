import { CheckCircle, WarningCircle, X } from "@phosphor-icons/react";
import { useEffect } from "react";

export function Toast({ toast, onClose }) {
  useEffect(() => {
    if (!toast) return undefined;
    // Leave time to reach an Undo button.
    const timer = window.setTimeout(onClose, toast.action ? 10_000 : 4500);
    return () => window.clearTimeout(timer);
  }, [toast, onClose]);

  if (!toast) return null;
  const Icon = toast.type === "error" ? WarningCircle : CheckCircle;

  return (
    <div
      className={`toast toast--${toast.type || "success"}${toast.action ? " toast--action" : ""}`}
      role={toast.type === "error" ? "alert" : "status"}
    >
      <Icon size={21} weight="fill" aria-hidden="true" />
      <div>
        <strong>{toast.title}</strong>
        {toast.message && <span>{toast.message}</span>}
      </div>
      {toast.action ? (
        <button
          type="button"
          className="toast-action"
          onClick={() => {
            onClose();
            toast.action.onClick();
          }}
        >
          {toast.action.label}
        </button>
      ) : null}
      <button type="button" onClick={onClose} aria-label="Dismiss notification">
        <X size={16} weight="bold" aria-hidden="true" />
      </button>
    </div>
  );
}
