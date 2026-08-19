import {
  FileText,
  Palette,
  TextAa,
} from "@phosphor-icons/react";
import { useId, useState } from "react";
import {
  BrandColorField,
  SetupSelectField,
  SetupSwitch,
  SetupTextField,
} from "./SetupControls.jsx";
import {
  BASE_TEMPLATE_OPTIONS,
  presetContent,
  presetDesign,
} from "./setupModel.js";

const EDITOR_TABS = ["design", "content"];

export function TemplateEditor({ preset, onUpdatePreset }) {
  const generatedId = useId().replace(/:/g, "");
  const [activeTab, setActiveTab] = useState("design");
  const design = presetDesign(preset);
  const content = presetContent(preset);
  const disabled = Boolean(preset?.locked);

  if (!preset) {
    return (
      <section className="setup-template-editor setup-template-editor--empty" aria-label="Template controls">
        <FileText size={28} weight="duotone" aria-hidden="true" />
        <strong>Select a preset to edit</strong>
        <span>Browsing a preset won’t change the invoice you are working on.</span>
      </section>
    );
  }

  function updateDesign(patch) {
    onUpdatePreset?.(preset.id, {
      ...(Object.hasOwn(patch, "accentColor") ? { accentMode: "fixed" } : {}),
      design: patch,
    });
  }

  function updateContent(patch) {
    onUpdatePreset?.(preset.id, { content: patch });
  }

  function handleTabKey(event, index) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    let nextIndex = index;
    if (event.key === "ArrowLeft") nextIndex = (index - 1 + EDITOR_TABS.length) % EDITOR_TABS.length;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % EDITOR_TABS.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = EDITOR_TABS.length - 1;
    setActiveTab(EDITOR_TABS[nextIndex]);
    event.currentTarget.parentElement?.querySelectorAll('[role="tab"]')[nextIndex]?.focus();
  }

  return (
    <section className="setup-template-editor" aria-labelledby={`template-editor-${generatedId}`}>
      <div className="setup-template-editor-heading">
        <div>
          <p>Preset controls</p>
          <h2 id={`template-editor-${generatedId}`}>{preset.name || "Untitled preset"}</h2>
        </div>
        {disabled ? <span className="setup-readonly-chip">Built in</span> : null}
      </div>

      <div className="setup-tabs" role="tablist" aria-label="Template control sections">
        {EDITOR_TABS.map((tab, index) => {
          const selected = activeTab === tab;
          return (
            <button
              key={tab}
              id={`${generatedId}-${tab}-tab`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`${generatedId}-${tab}-panel`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActiveTab(tab)}
              onKeyDown={(event) => handleTabKey(event, index)}
            >
              {tab === "design" ? <Palette size={16} aria-hidden="true" /> : <TextAa size={16} aria-hidden="true" />}
              {tab === "design" ? "Design" : "Content"}
            </button>
          );
        })}
      </div>

      <div
        id={`${generatedId}-design-panel`}
        role="tabpanel"
        aria-labelledby={`${generatedId}-design-tab`}
        hidden={activeTab !== "design"}
        tabIndex="0"
      >
        <fieldset className="setup-template-fieldset" disabled={disabled}>
          <legend className="visually-hidden">Design controls</legend>
          <div className="setup-control-group">
            <h3>Foundation</h3>
            <div className="setup-base-template-grid" role="radiogroup" aria-label="Base template">
              {BASE_TEMPLATE_OPTIONS.map((template) => (
                <label key={template.id} className={`setup-base-template${design.template === template.id ? " is-selected" : ""}`}>
                  <input
                    type="radio"
                    name={`${generatedId}-base-template`}
                    checked={design.template === template.id}
                    onChange={() => updateDesign({ template: template.id })}
                  />
                  <FileText size={22} weight={template.id === "modern" ? "fill" : "regular"} aria-hidden="true" />
                  <span><strong>{template.name}</strong><small>{template.description}</small></span>
                </label>
              ))}
            </div>
          </div>

          <div className="setup-control-group">
            <h3>Brand color</h3>
            <BrandColorField
              idPrefix={`${generatedId}-preset-color`}
              value={design.accentColor}
              onChange={(accentColor) => updateDesign({ accentColor })}
            />
          </div>

          <div className="setup-control-group setup-field-grid">
            <h3>Page</h3>
            <SetupSelectField
              id={`${generatedId}-font`}
              label="Font style"
              value={design.font}
              onChange={(event) => updateDesign({ font: event.target.value })}
            >
              <option value="Inter">Clean sans</option>
              <option value="Georgia">Editorial serif</option>
              <option value="Arial">Classic sans</option>
            </SetupSelectField>
            <SetupSelectField
              id={`${generatedId}-paper`}
              label="Paper size"
              value={design.paperSize}
              onChange={(event) => updateDesign({ paperSize: event.target.value })}
            >
              <option value="Letter">Letter</option>
              <option value="A4">A4</option>
            </SetupSelectField>
          </div>
        </fieldset>
      </div>

      <div
        id={`${generatedId}-content-panel`}
        role="tabpanel"
        aria-labelledby={`${generatedId}-content-tab`}
        hidden={activeTab !== "content"}
        tabIndex="0"
      >
        <fieldset className="setup-template-fieldset" disabled={disabled}>
          <legend className="visually-hidden">Content controls</legend>
          <div className="setup-control-group">
            <h3>Table columns</h3>
            <SetupSwitch
              id={`${generatedId}-service-date`}
              checked={design.showServiceDate}
              label="Service date"
              description="Show when each line item was delivered."
              onChange={(event) => updateDesign({ showServiceDate: event.target.checked })}
            />
            <SetupSwitch
              id={`${generatedId}-item-name`}
              checked={design.showItem}
              label="Product or service"
              description="Keep a short item name beside its description."
              onChange={(event) => updateDesign({ showItem: event.target.checked })}
            />
          </div>

          <div className="setup-control-group setup-field-grid">
            <h3>Reusable copy</h3>
            <SetupTextField
              id={`${generatedId}-notes`}
              label="Default customer note"
              hint="Leave blank when the template should not add a note."
              multiline
              rows={4}
              value={content.notes}
              onChange={(event) => updateContent({ notes: event.target.value })}
            />
            <SetupTextField
              id={`${generatedId}-payment`}
              label="Default payment instructions"
              hint="These can still be changed on an individual invoice."
              multiline
              rows={4}
              value={content.paymentInstructions}
              onChange={(event) => updateContent({ paymentInstructions: event.target.value })}
            />
          </div>
        </fieldset>
      </div>
    </section>
  );
}
