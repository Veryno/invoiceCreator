import { InvoiceHeaderForm } from "./InvoiceHeaderForm.jsx";
import { LineItemsTable } from "./LineItemsTable.jsx";
import { NotesAndTotals } from "./NotesAndTotals.jsx";

export function InvoiceEditor({
  draft,
  customers,
  selectedCustomerId,
  onSelectCustomer,
  catalog,
  onSaveCatalogItem,
  onRemoveLine,
  savedText,
}) {
  return (
    <div className="editor-stack">
      <InvoiceHeaderForm
        invoice={draft.invoice}
        updateField={draft.updateField}
        customers={customers}
        selectedCustomerId={selectedCustomerId}
        onSelectCustomer={onSelectCustomer}
      />
      <LineItemsTable
        invoice={draft.invoice}
        updateLine={draft.updateLine}
        addLine={draft.addLine}
        duplicateLine={draft.duplicateLine}
        removeLine={onRemoveLine || draft.removeLine}
        catalog={catalog}
        onSaveCatalogItem={onSaveCatalogItem}
      />
      <NotesAndTotals invoice={draft.invoice} updateField={draft.updateField} savedText={savedText} />
    </div>
  );
}
