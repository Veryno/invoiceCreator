import { useEffect, useRef, useState } from "react";
import { parseNumberInput } from "../lib/invoice.js";

function display(value, decimals) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "";
  if (decimals === undefined) return String(number);
  return number.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: Math.max(decimals, 6),
    useGrouping: true,
  });
}

/**
 * A text input for numbers that keeps exactly what the person types ("1.",
 * "$1,200", an empty field) while editing and reports each complete number.
 * Native number inputs reject partial values, which made amounts snap back.
 */
export function NumberField({
  value,
  onValue,
  decimals,
  emptyValue = 0,
  className = "",
  ...inputProps
}) {
  const [text, setText] = useState(() => display(value, decimals));
  const focused = useRef(false);

  useEffect(() => {
    if (focused.current) return;
    setText(display(value, decimals));
  }, [value, decimals]);

  return (
    <input
      {...inputProps}
      className={className}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={text}
      onFocus={(event) => {
        focused.current = true;
        inputProps.onFocus?.(event);
        event.target.select();
      }}
      onChange={(event) => {
        const next = event.target.value;
        setText(next);
        if (!next.trim()) {
          onValue(emptyValue);
          return;
        }
        const parsed = parseNumberInput(next);
        if (parsed !== null) onValue(parsed);
      }}
      onBlur={(event) => {
        focused.current = false;
        const parsed = parseNumberInput(text);
        setText(display(parsed === null ? value : parsed, decimals));
        inputProps.onBlur?.(event);
      }}
    />
  );
}
