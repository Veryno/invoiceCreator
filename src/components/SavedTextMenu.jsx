import { BookmarkSimple, CaretDown, GearSix, Plus } from "@phosphor-icons/react";
import { useEffect, useId, useRef, useState } from "react";

/**
 * "Saved text" button beside a message field. Picking an entry adds it to the
 * field; the current text can be saved to the list in one click.
 */
export function SavedTextMenu({ fieldLabel, savedText = [], currentText = "", onInsert, onSaveCurrent, onManage }) {
  const menuId = useId();
  const rootRef = useRef(null);
  const [open, setOpen] = useState(false);
  const trimmed = String(currentText || "").trim();
  const alreadySaved = savedText.some((entry) => entry.body.trim() === trimmed);

  useEffect(() => {
    if (!open) return undefined;
    const closeOutside = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  function run(action) {
    setOpen(false);
    action();
  }

  return (
    <div className="saved-text" ref={rootRef}>
      <button
        type="button"
        className="saved-text-toggle"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={`Saved text for ${fieldLabel}`}
        onClick={() => setOpen((value) => !value)}
      >
        <BookmarkSimple size={14} weight="bold" aria-hidden="true" />
        Saved text
        <CaretDown size={12} weight="bold" aria-hidden="true" />
      </button>
      {open ? (
        <div className="saved-text-menu" id={menuId} role="menu" aria-label={`Saved text for ${fieldLabel}`}>
          {savedText.length ? savedText.map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="menuitem"
              className="saved-text-option"
              onClick={() => run(() => onInsert(entry.body))}
            >
              <strong>{entry.title}</strong>
              <span>{entry.body}</span>
            </button>
          )) : <p className="saved-text-empty">Nothing saved yet.</p>}
          <div className="saved-text-actions">
            <button
              type="button"
              role="menuitem"
              disabled={!trimmed || alreadySaved}
              onClick={() => run(onSaveCurrent)}
            >
              <Plus size={14} weight="bold" aria-hidden="true" />
              {alreadySaved ? "This text is already saved" : "Save what’s typed here"}
            </button>
            {onManage ? (
              <button type="button" role="menuitem" onClick={() => run(onManage)}>
                <GearSix size={14} aria-hidden="true" />
                Edit saved text
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
