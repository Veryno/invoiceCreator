import {
  BracketsCurly,
  FileCsv,
  FileXls,
  UploadSimple,
  X,
} from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";

export function ImportDialog({ open, onClose, onFile, onSample, isImporting }) {
  const dialogRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  function useFileList(files) {
    const file = files?.[0];
    if (file) onFile(file);
  }

  return (
    <dialog
      className="import-dialog"
      ref={dialogRef}
      onClose={onClose}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      aria-labelledby="import-title"
    >
      <div className="dialog-header">
        <div>
          <span>Bring your own data</span>
          <h2 id="import-title">Import an invoice</h2>
        </div>
        <button className="icon-button" type="button" onClick={onClose} aria-label="Close import dialog">
          <X size={19} aria-hidden="true" />
        </button>
      </div>

      <p className="dialog-intro">
        Import a spreadsheet of line items or a complete Invoice Studio JSON file. We’ll map common column names automatically.
      </p>

      <label
        className={`drop-zone${dragging ? " is-dragging" : ""}${isImporting ? " is-loading" : ""}`}
        htmlFor="invoice-file-import"
        onDragEnter={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          useFileList(event.dataTransfer.files);
        }}
      >
        <UploadSimple size={28} weight="duotone" aria-hidden="true" />
        <strong>{isImporting ? "Reading your data…" : "Drop a file here or choose a file"}</strong>
        <span>CSV, XLSX, or JSON · up to 10 MB</span>
        <input
          className="visually-hidden"
          id="invoice-file-import"
          type="file"
          accept=".csv,.xlsx,.json,application/json,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          disabled={isImporting}
          onChange={(event) => useFileList(event.target.files)}
        />
      </label>

      <div className="file-type-grid" aria-label="Supported import formats">
        <div><FileCsv size={20} aria-hidden="true" /><span><strong>CSV</strong><small>Flat line-item rows</small></span></div>
        <div><FileXls size={20} aria-hidden="true" /><span><strong>Excel</strong><small>First worksheet</small></span></div>
        <div><BracketsCurly size={20} aria-hidden="true" /><span><strong>JSON</strong><small>Complete invoice data</small></span></div>
      </div>

      <div className="dialog-footer">
        <span>Need the right columns?</span>
        <button type="button" onClick={() => onSample("csv")}>Download CSV sample</button>
        <button type="button" onClick={() => onSample("json")}>Download JSON sample</button>
      </div>
    </dialog>
  );
}
