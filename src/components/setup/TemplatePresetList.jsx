import {
  FileText,
  MagnifyingGlass,
  Plus,
  Star,
} from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { BASE_TEMPLATE_OPTIONS, presetDesign } from "./setupModel.js";

export function TemplatePresetList({
  presets,
  selectedId,
  defaultPresetId,
  onSelect,
  onCreatePreset,
}) {
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [baseTemplate, setBaseTemplate] = useState("modern");
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  const visiblePresets = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    return term
      ? presets.filter((preset) => (preset.name || "Untitled preset").toLocaleLowerCase().includes(term))
      : presets;
  }, [presets, query]);

  async function submitPreset(event) {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName || isCreating) return;
    setIsCreating(true);
    setCreateError("");
    try {
      await onCreatePreset?.({
        name: trimmedName,
        accentMode: "fixed",
        design: {
          template: baseTemplate,
          accentColor: "#0F766E",
          font: "Inter",
          paperSize: "Letter",
          showServiceDate: true,
          showItem: true,
        },
        content: { notes: "", paymentInstructions: "" },
      });
      setName("");
      setBaseTemplate("modern");
      setCreating(false);
    } catch (error) {
      setCreateError(error?.message || "The template could not be created.");
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <aside className="setup-template-library" aria-labelledby="template-library-title">
      <div className="setup-template-library-heading">
        <div>
          <p>Saved styles</p>
          <h2 id="template-library-title">Template presets</h2>
        </div>
        {onCreatePreset ? (
          <button className="setup-icon-button" type="button" aria-label="Create template preset" onClick={() => setCreating((value) => !value)}>
            <Plus size={18} weight="bold" aria-hidden="true" />
          </button>
        ) : null}
      </div>

      {creating ? (
        <form className="setup-new-preset" onSubmit={submitPreset}>
          <label htmlFor="new-template-name">Preset name</label>
          <input
            id="new-template-name"
            value={name}
            autoFocus
            maxLength={80}
            placeholder="Name this style"
            onChange={(event) => setName(event.target.value)}
          />
          <label htmlFor="new-template-base">Start from</label>
          <select id="new-template-base" value={baseTemplate} onChange={(event) => setBaseTemplate(event.target.value)}>
            {BASE_TEMPLATE_OPTIONS.map((template) => (
              <option key={template.id} value={template.id}>{template.name}</option>
            ))}
          </select>
          <div>
            <button type="button" disabled={isCreating} onClick={() => setCreating(false)}>Cancel</button>
            <button type="submit" disabled={!name.trim() || isCreating}>{isCreating ? "Creating…" : "Create"}</button>
          </div>
          {createError ? <p className="setup-field-error" role="alert">{createError}</p> : null}
        </form>
      ) : null}

      <label className="setup-template-search" htmlFor="template-preset-search">
        <MagnifyingGlass size={16} aria-hidden="true" />
        <span className="visually-hidden">Search template presets</span>
        <input
          id="template-preset-search"
          type="search"
          value={query}
          placeholder="Search presets"
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>

      {visiblePresets.length > 0 ? (
        <ul className="setup-preset-list" aria-label="Template presets">
          {visiblePresets.map((preset) => {
            const design = presetDesign(preset);
            const isSelected = String(selectedId) === String(preset.id);
            const isDefault = String(defaultPresetId) === String(preset.id);
            return (
              <li key={preset.id}>
                <button
                  className={`setup-preset-option${isSelected ? " is-selected" : ""}`}
                  type="button"
                  aria-current={isSelected ? "true" : undefined}
                  onClick={() => onSelect?.(preset.id)}
                >
                  <span className={`setup-preset-thumbnail setup-preset-thumbnail--${design.template}`} style={{ "--preset-accent": design.accentColor }}>
                    <FileText size={25} weight={design.template === "modern" ? "fill" : "regular"} aria-hidden="true" />
                  </span>
                  <span className="setup-preset-copy">
                    <strong>{preset.name || "Untitled preset"}</strong>
                    <small>{BASE_TEMPLATE_OPTIONS.find((option) => option.id === design.template)?.name || "Modern"}</small>
                  </span>
                  {isDefault ? <span className="setup-default-chip"><Star size={12} weight="fill" aria-hidden="true" />Default</span> : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="setup-template-empty" role="status">
          <FileText size={28} weight="duotone" aria-hidden="true" />
          <strong>{presets.length > 0 ? "No matching presets" : "No presets yet"}</strong>
          <span>{presets.length > 0 ? "Try another search." : "Create a named style from Modern, Classic, or Minimal."}</span>
        </div>
      )}
    </aside>
  );
}
