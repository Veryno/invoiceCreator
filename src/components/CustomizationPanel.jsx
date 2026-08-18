import {
  CaretDown,
  Check,
  FileText,
  Palette,
  TextAa,
  X,
} from "@phosphor-icons/react";

const templates = [
  { id: "modern", label: "Modern", detail: "Bold header" },
  { id: "classic", label: "Classic", detail: "Traditional" },
  { id: "minimal", label: "Minimal", detail: "Quiet & clean" },
];

const colors = [
  { value: "#2563EB", name: "Cobalt", className: "swatch--cobalt" },
  { value: "#0F766E", name: "Teal", className: "swatch--teal" },
  { value: "#2F3542", name: "Charcoal", className: "swatch--charcoal" },
  { value: "#B45309", name: "Amber", className: "swatch--amber" },
  { value: "#9F1239", name: "Berry", className: "swatch--berry" },
];

function Switch({ id, checked, onChange, children }) {
  return (
    <label className="switch-row" htmlFor={id}>
      <span>{children}</span>
      <span className="switch-control">
        <input id={id} type="checkbox" checked={checked} onChange={onChange} />
        <span aria-hidden="true" />
      </span>
    </label>
  );
}

export function CustomizationPanel({ invoice, updateField, isOpen, onClose }) {
  return (
    <aside className={`customization-panel${isOpen ? " is-open" : ""}`} aria-label="Invoice customization">
      <div className="customizer-header">
        <div>
          <span>PDF appearance</span>
          <h2>Customize</h2>
        </div>
        <button className="icon-button customizer-close" type="button" onClick={onClose} aria-label="Close customization">
          <X size={18} aria-hidden="true" />
        </button>
      </div>

      <section className="customizer-section" aria-labelledby="template-heading">
        <div className="customizer-section-title">
          <FileText size={18} aria-hidden="true" />
          <h3 id="template-heading">Template</h3>
        </div>
        <div className="template-options" role="radiogroup" aria-label="Invoice template">
          {templates.map((template) => (
            <button
              key={template.id}
              type="button"
              role="radio"
              aria-checked={invoice.design.template === template.id}
              className={`template-option template-option--${template.id}${invoice.design.template === template.id ? " is-selected" : ""}`}
              onClick={() => updateField("design.template", template.id)}
            >
              <span className="template-thumbnail" aria-hidden="true">
                <FileText size={28} weight={template.id === "modern" ? "fill" : "regular"} />
              </span>
              <span>
                <strong>{template.label}</strong>
                <small>{template.detail}</small>
              </span>
              {invoice.design.template === template.id && <Check size={15} weight="bold" aria-hidden="true" />}
            </button>
          ))}
        </div>
      </section>

      <section className="customizer-section" aria-labelledby="brand-heading">
        <div className="customizer-section-title">
          <Palette size={18} aria-hidden="true" />
          <h3 id="brand-heading">Brand color</h3>
        </div>
        <div className="color-options">
          {colors.map((color) => (
            <button
              key={color.value}
              type="button"
              className={`color-swatch ${color.className}${invoice.design.accentColor === color.value ? " is-selected" : ""}`}
              aria-label={`Use ${color.name}`}
              aria-pressed={invoice.design.accentColor === color.value}
              onClick={() => updateField("design.accentColor", color.value)}
            >
              {invoice.design.accentColor === color.value && <Check size={14} weight="bold" aria-hidden="true" />}
            </button>
          ))}
          <label className="custom-color" htmlFor="custom-accent-color" title="Choose a custom color">
            <input
              id="custom-accent-color"
              type="color"
              value={invoice.design.accentColor}
              onChange={(event) => updateField("design.accentColor", event.target.value.toUpperCase())}
            />
            <span>Custom</span>
          </label>
        </div>
      </section>

      <section className="customizer-section" aria-labelledby="typography-heading">
        <div className="customizer-section-title">
          <TextAa size={18} aria-hidden="true" />
          <h3 id="typography-heading">Typography</h3>
        </div>
        <label className="select-row" htmlFor="invoice-font">
          <span>Font style</span>
          <span className="select-wrapper">
            <select
              id="invoice-font"
              value={invoice.design.font}
              onChange={(event) => updateField("design.font", event.target.value)}
            >
              <option value="Inter">Clean sans</option>
              <option value="Georgia">Editorial serif</option>
              <option value="Arial">Classic sans</option>
            </select>
            <CaretDown size={14} aria-hidden="true" />
          </span>
        </label>
      </section>

      <section className="customizer-section" aria-labelledby="columns-heading">
        <div className="customizer-section-title">
          <FileText size={18} aria-hidden="true" />
          <h3 id="columns-heading">Visible columns</h3>
        </div>
        <Switch
          id="show-service-date"
          checked={invoice.design.showServiceDate}
          onChange={(event) => updateField("design.showServiceDate", event.target.checked)}
        >
          Service date
        </Switch>
        <Switch
          id="show-product"
          checked={invoice.design.showItem}
          onChange={(event) => updateField("design.showItem", event.target.checked)}
        >
          Product / service
        </Switch>
      </section>

      <section className="customizer-section customizer-section--last" aria-labelledby="document-heading">
        <div className="customizer-section-title">
          <FileText size={18} aria-hidden="true" />
          <h3 id="document-heading">Document</h3>
        </div>
        <label className="select-row" htmlFor="invoice-status">
          <span>Status</span>
          <span className="select-wrapper">
            <select
              id="invoice-status"
              value={invoice.meta.status}
              onChange={(event) => updateField("meta.status", event.target.value)}
            >
              <option>Draft</option>
              <option>Sent</option>
              <option>Paid</option>
              <option>Overdue</option>
            </select>
            <CaretDown size={14} aria-hidden="true" />
          </span>
        </label>
        <label className="select-row" htmlFor="paper-size">
          <span>Paper size</span>
          <span className="select-wrapper">
            <select
              id="paper-size"
              value={invoice.design.paperSize || "Letter"}
              onChange={(event) => updateField("design.paperSize", event.target.value)}
            >
              <option value="Letter">US Letter</option>
              <option value="A4">A4</option>
            </select>
            <CaretDown size={14} aria-hidden="true" />
          </span>
        </label>
      </section>
    </aside>
  );
}
