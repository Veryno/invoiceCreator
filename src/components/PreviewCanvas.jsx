import { ArrowsOutSimple, Printer } from "@phosphor-icons/react";
import { InvoiceDocument } from "./InvoiceDocument.jsx";

export function PreviewCanvas({ invoice, onExport }) {
  return (
    <section className="preview-workspace" aria-labelledby="preview-heading">
      <div className="preview-toolbar">
        <div>
          <ArrowsOutSimple size={18} aria-hidden="true" />
          <div>
            <h2 id="preview-heading">PDF preview</h2>
            <span>{invoice.design.paperSize || "Letter"} · updates live</span>
          </div>
        </div>
        <button type="button" className="quiet-button" onClick={onExport}>
          <Printer size={16} aria-hidden="true" />
          Export this PDF
        </button>
      </div>
      <div className="document-stage">
        <InvoiceDocument invoice={invoice} />
      </div>
    </section>
  );
}
