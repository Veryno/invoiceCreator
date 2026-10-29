import { CaretDown, Plus, Star } from "@phosphor-icons/react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { filterProductOptions, findProductOption } from "../lib/catalog.js";

/**
 * Type-ahead product/service field. Lists the owner's saved items first, then
 * common construction items, and offers to save anything new that is typed.
 */
export function ProductServicePicker({
  value,
  options,
  onChange,
  onPick,
  onSaveNew,
  label,
}) {
  const listId = useId();
  const inputRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const [menuStyle, setMenuStyle] = useState(null);
  const filtered = useMemo(() => filterProductOptions(options, query), [options, query]);
  const flat = useMemo(() => [...filtered.saved, ...filtered.common], [filtered]);
  const trimmed = String(value || "").trim();
  const canSave = Boolean(onSaveNew && trimmed && findProductOption(options, trimmed)?.source !== "saved");

  // The line table scrolls horizontally, which would clip an absolutely
  // positioned menu, so the menu is placed against the viewport instead.
  useEffect(() => {
    if (!open) return undefined;
    const place = () => {
      const rect = inputRef.current?.getBoundingClientRect();
      if (!rect) return;
      const below = window.innerHeight - rect.bottom;
      const height = Math.min(340, Math.max(below, rect.top) - 12);
      setMenuStyle({
        position: "fixed",
        left: rect.left,
        width: Math.max(rect.width + 30, 320),
        maxHeight: height,
        ...(below >= 220 || below >= rect.top
          ? { top: rect.bottom + 4 }
          : { bottom: window.innerHeight - rect.top + 4 }),
      });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  function choose(option) {
    onPick(option);
    setOpen(false);
    setQuery("");
    setActiveIndex(-1);
  }

  function handleKeyDown(event) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((index) => Math.min(flat.length - 1, index + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(-1, index - 1));
    } else if (event.key === "Enter" && open && activeIndex >= 0 && flat[activeIndex]) {
      event.preventDefault();
      choose(flat[activeIndex]);
    } else if (event.key === "Escape" && open) {
      event.preventDefault();
      setOpen(false);
    }
  }

  function renderGroup(title, items, offset) {
    if (!items.length) return null;
    return (
      <div className="product-picker-group" role="group" aria-label={title}>
        <p>{title}</p>
        {items.map((item, index) => {
          const position = offset + index;
          return (
            <button
              type="button"
              role="option"
              id={`${listId}-${position}`}
              aria-selected={position === activeIndex}
              className={`product-picker-option${position === activeIndex ? " is-active" : ""}`}
              key={item.id}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(item)}
            >
              <span>
                {item.source === "saved" ? <Star size={12} weight="fill" aria-hidden="true" /> : null}
                <strong>{item.name}</strong>
                {item.description && item.description !== item.name ? <small>{item.description}</small> : null}
              </span>
              {item.rate ? <em>${Number(item.rate).toLocaleString("en-US", { minimumFractionDigits: 2 })}</em> : null}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="product-picker">
      <div className="product-picker-control">
        <input
          ref={inputRef}
          role="combobox"
          aria-label={label}
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
          value={value}
          placeholder="Choose or type"
          autoComplete="off"
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onKeyDown={handleKeyDown}
          onChange={(event) => {
            onChange(event.target.value);
            setQuery(event.target.value);
            setOpen(true);
            setActiveIndex(-1);
          }}
        />
        <button
          type="button"
          tabIndex={-1}
          className="product-picker-toggle"
          aria-label={`Show products and services for ${label}`}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            setQuery("");
            setOpen((current) => !current);
            inputRef.current?.focus();
          }}
        >
          <CaretDown size={13} weight="bold" aria-hidden="true" />
        </button>
      </div>
      {open ? (
        <div className="product-picker-menu" style={menuStyle || undefined} id={listId} role="listbox" aria-label="Products and services">
          {canSave ? (
            <button
              type="button"
              className="product-picker-add"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onSaveNew(trimmed);
                setOpen(false);
              }}
            >
              <Plus size={14} weight="bold" aria-hidden="true" />
              Save “{trimmed}” to my products &amp; services
            </button>
          ) : null}
          {renderGroup("My products & services", filtered.saved, 0)}
          {renderGroup("Common construction items", filtered.common, filtered.saved.length)}
          {!flat.length ? <p className="product-picker-empty">No matches. Keep typing to use a custom name.</p> : null}
        </div>
      ) : null}
    </div>
  );
}
