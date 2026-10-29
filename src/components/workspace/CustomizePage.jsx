import {
  ArrowCounterClockwise,
  BookmarkSimple,
  Columns,
  Plus,
  SlidersHorizontal,
  TextAa,
  Trash,
} from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import {
  COLUMN_FIELDS,
  CUSTOM_FIELD_SECTIONS,
  LABEL_FIELDS,
  MAX_CUSTOM_FIELDS,
  MAX_SAVED_TEXT,
  labelFor,
  newCustomFieldId,
  newSavedTextId,
} from "../../lib/layout.js";
import { PageHeader, SectionHeader, WorkspaceButton, WorkspacePage } from "./WorkspaceUI.jsx";
import "./customize.css";

const FIELD_SUGGESTIONS = [
  { label: "Permit #", section: "job" },
  { label: "Lot #", section: "job" },
  { label: "Unit", section: "job" },
  { label: "Superintendent", section: "job" },
  { label: "Project #", section: "invoice" },
];

/**
 * Text input that saves when the person leaves the field (or presses Enter),
 * so every keystroke doesn't rewrite the workspace.
 */
function CommitText({ value, onCommit, multiline = false, ...props }) {
  const [text, setText] = useState(value);
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setText(value);
  }, [value]);

  const shared = {
    ...props,
    value: text,
    onFocus: () => {
      focused.current = true;
    },
    onChange: (event) => setText(event.target.value),
    onBlur: () => {
      focused.current = false;
      if (text !== value) onCommit(text);
    },
  };

  if (multiline) return <textarea {...shared} />;
  return (
    <input
      {...shared}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
      }}
    />
  );
}

function Toggle({ id, checked, onChange, label, hint }) {
  return (
    <label className="customize-toggle" htmlFor={id}>
      <span>
        <strong>{label}</strong>
        {hint ? <small>{hint}</small> : null}
      </span>
      <span className="switch-control">
        <input id={id} type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
        <span aria-hidden="true" />
      </span>
    </label>
  );
}

export function CustomizePage({ layout, savedText, onUpdateLayout, onUpdateSavedText, onNotify }) {
  const fieldsFull = layout.fields.length >= MAX_CUSTOM_FIELDS;
  const usedFieldLabels = new Set(layout.fields.map((field) => field.label.toLowerCase()));

  function setLabel(key, text) {
    const labels = { ...layout.labels };
    const fallback = LABEL_FIELDS.find((field) => field.key === key)?.fallback;
    if (!text.trim() || text.trim() === fallback) delete labels[key];
    else labels[key] = text.trim();
    onUpdateLayout({ labels });
  }

  function addField(field = {}) {
    if (fieldsFull) return;
    onUpdateLayout({
      fields: [
        ...layout.fields,
        { id: newCustomFieldId(), label: field.label || "New field", section: field.section || "invoice", showOnPdf: true },
      ],
    });
  }

  function updateField(id, patch) {
    onUpdateLayout({
      fields: layout.fields.map((field) => (field.id === id ? { ...field, ...patch } : field)),
    });
  }

  function removeField(id) {
    const previous = layout.fields;
    const removed = previous.find((field) => field.id === id);
    onUpdateLayout({ fields: previous.filter((field) => field.id !== id) });
    onNotify?.({
      title: `“${removed?.label || "Field"}” removed`,
      message: "Anything typed in it is kept and comes back if you undo.",
      action: { label: "Undo", onClick: () => onUpdateLayout({ fields: previous }) },
    });
  }

  function updateText(id, patch) {
    onUpdateSavedText(savedText.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)));
  }

  function removeText(id) {
    const previous = savedText;
    const removed = previous.find((entry) => entry.id === id);
    onUpdateSavedText(previous.filter((entry) => entry.id !== id));
    onNotify?.({
      title: `“${removed?.title || "Saved text"}” deleted`,
      action: { label: "Undo", onClick: () => onUpdateSavedText(previous) },
    });
  }

  return (
    <WorkspacePage titleId="customize-title" className="studio-customize-page">
      <PageHeader
        icon={SlidersHorizontal}
        eyebrow="Make it yours"
        title="Customize"
        titleId="customize-title"
        description="Rename words, choose columns, add your own fields, and keep text you reuse. Changes apply to every invoice, on screen and on the PDF."
      />

      <section className="studio-panel" aria-labelledby="customize-labels-title">
        <SectionHeader
          title="Words on your invoices"
          titleId="customize-labels-title"
          description="Type your own word, like Hours instead of Qty. Leave a box empty to use the standard word."
        />
        <div className="customize-labels">
          {LABEL_FIELDS.map((field) => (
            <label className="customize-label-row" key={field.key} htmlFor={`label-${field.key}`}>
              <span>
                <TextAa size={16} aria-hidden="true" />
                <strong>{field.fallback}</strong>
                {field.hint ? <small>{field.hint}</small> : null}
              </span>
              <span className="customize-label-input">
                <CommitText
                  id={`label-${field.key}`}
                  maxLength={60}
                  placeholder={field.fallback}
                  value={layout.labels[field.key] || ""}
                  onCommit={(text) => setLabel(field.key, text)}
                />
                {layout.labels[field.key] ? (
                  <button
                    type="button"
                    className="icon-button"
                    title={`Change back to ${field.fallback}`}
                    aria-label={`Change ${field.fallback} back to the standard word`}
                    onClick={() => setLabel(field.key, "")}
                  >
                    <ArrowCounterClockwise size={15} aria-hidden="true" />
                  </button>
                ) : null}
              </span>
            </label>
          ))}
        </div>
      </section>

      <section className="studio-panel" aria-labelledby="customize-columns-title">
        <SectionHeader
          title="Line item columns"
          titleId="customize-columns-title"
          description="Turn off columns you don’t use. Description and amount always show."
        />
        <div className="customize-toggles">
          {COLUMN_FIELDS.map((column) => (
            <Toggle
              key={column.key}
              id={`column-${column.key}`}
              checked={layout.columns[column.key]}
              label={column.label || labelFor(layout, column.key)}
              hint={column.hint}
              onChange={(checked) => onUpdateLayout({ columns: { ...layout.columns, [column.key]: checked } })}
            />
          ))}
        </div>
      </section>

      <section className="studio-panel" aria-labelledby="customize-fields-title">
        <SectionHeader
          title="Your own fields"
          titleId="customize-fields-title"
          description="Add boxes like Permit # or Lot #. They show on every invoice under Job site or Invoice information, and print when filled in."
          count={layout.fields.length}
          action={(
            <WorkspaceButton icon={Plus} onClick={() => addField()} disabled={fieldsFull}>
              Add field
            </WorkspaceButton>
          )}
        />
        {layout.fields.length ? (
          <div className="customize-fields">
            <div className="customize-fields-head" aria-hidden="true">
              <span>Field name</span>
              <span>Shows under</span>
              <span>On PDF</span>
              <span />
            </div>
            {layout.fields.map((field) => (
              <div className="customize-field-row" key={field.id}>
                <CommitText
                  aria-label="Field name"
                  maxLength={60}
                  value={field.label}
                  onCommit={(text) => updateField(field.id, { label: text.trim() || field.label })}
                />
                <select
                  aria-label={`Where ${field.label} shows`}
                  value={field.section}
                  onChange={(event) => updateField(field.id, { section: event.target.value })}
                >
                  {CUSTOM_FIELD_SECTIONS.map((section) => (
                    <option key={section.value} value={section.value}>{section.label}</option>
                  ))}
                </select>
                <label className="customize-check">
                  <input
                    type="checkbox"
                    checked={field.showOnPdf}
                    onChange={(event) => updateField(field.id, { showOnPdf: event.target.checked })}
                  />
                  <span className="visually-hidden">Print {field.label} on the PDF</span>
                </label>
                <button
                  type="button"
                  className="icon-button icon-button--danger"
                  aria-label={`Remove ${field.label}`}
                  title="Remove field"
                  onClick={() => removeField(field.id)}
                >
                  <Trash size={16} aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        ) : null}
        <div className="customize-suggestions">
          <span>Quick add:</span>
          {FIELD_SUGGESTIONS.filter((suggestion) => !usedFieldLabels.has(suggestion.label.toLowerCase())).map((suggestion) => (
            <button type="button" key={suggestion.label} onClick={() => addField(suggestion)} disabled={fieldsFull}>
              <Plus size={12} weight="bold" aria-hidden="true" />
              {suggestion.label}
            </button>
          ))}
        </div>
      </section>

      <section className="studio-panel" aria-labelledby="customize-text-title">
        <SectionHeader
          title="Saved text"
          titleId="customize-text-title"
          description="Terms, warranty wording, and payment instructions you reuse. Pick them from the Saved text button on any invoice."
          count={savedText.length}
          action={(
            <WorkspaceButton
              icon={Plus}
              disabled={savedText.length >= MAX_SAVED_TEXT}
              onClick={() => onUpdateSavedText([...savedText, { id: newSavedTextId(), title: "New saved text", body: "" }])}
            >
              Add saved text
            </WorkspaceButton>
          )}
        />
        {savedText.length ? (
          <div className="customize-texts">
            {savedText.map((entry) => (
              <div className="customize-text" key={entry.id}>
                <div className="customize-text-head">
                  <BookmarkSimple size={16} aria-hidden="true" />
                  <CommitText
                    aria-label="Saved text name"
                    maxLength={80}
                    value={entry.title}
                    onCommit={(text) => updateText(entry.id, { title: text.trim() || entry.title })}
                  />
                  <button
                    type="button"
                    className="icon-button icon-button--danger"
                    aria-label={`Delete ${entry.title}`}
                    title="Delete"
                    onClick={() => removeText(entry.id)}
                  >
                    <Trash size={16} aria-hidden="true" />
                  </button>
                </div>
                <CommitText
                  multiline
                  rows={3}
                  aria-label={`${entry.title} text`}
                  maxLength={4000}
                  placeholder="Type the wording you want to reuse"
                  value={entry.body}
                  onCommit={(text) => updateText(entry.id, { body: text })}
                />
              </div>
            ))}
          </div>
        ) : (
          <p className="customize-empty">
            <Columns size={18} aria-hidden="true" />
            No saved text yet. Add some here, or use “Save what’s typed here” on an invoice.
          </p>
        )}
      </section>
    </WorkspacePage>
  );
}
