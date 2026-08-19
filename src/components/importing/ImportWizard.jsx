import {
  ArrowLeft,
  ArrowRight,
  BracketsCurly,
  Check,
  FileCsv,
  FileXls,
  Info,
  UploadSimple,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  IMPORT_FIELDS,
  importMappedPreview,
  inspectImportFile,
  validateImportMapping,
  validateImportRows,
} from "../../lib/importPreview.js";
import "./import-wizard.css";

const STEPS = ["Choose file", "Preview", "Map fields", "Review"];

function formatName(format) {
  if (format === "xlsx") return "Excel workbook";
  if (format === "json") return "JSON data";
  return "CSV spreadsheet";
}

function rowHasIssue(issues, index) {
  return issues.some((issue) => issue.row === index);
}

export function ImportWizard({ open, onClose, onImport, onSample }) {
  const dialogRef = useRef(null);
  const fileInputRef = useRef(null);
  const [step, setStep] = useState(0);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [mapping, setMapping] = useState({});
  const [excludedRows, setExcludedRows] = useState(() => new Set());
  const [invalidOnly, setInvalidOnly] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setStep(0);
    setFile(null);
    setPreview(null);
    setMapping({});
    setExcludedRows(new Set());
    setInvalidOnly(false);
    setBusy(false);
    setError("");
  }, [open]);

  const mappingErrors = useMemo(
    () => (preview?.kind === "tabular" ? validateImportMapping(preview, mapping) : []),
    [mapping, preview],
  );
  const rowIssues = useMemo(
    () => (preview?.kind === "tabular" ? validateImportRows(preview, mapping, excludedRows) : []),
    [excludedRows, mapping, preview],
  );
  const includedCount = preview?.kind === "tabular"
    ? preview.rows.length - excludedRows.size
    : 1;

  async function readFile(nextFile, options = {}) {
    if (!nextFile) return;
    if (nextFile.size > 10 * 1024 * 1024) {
      setError("Choose a file smaller than 10 MB.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const nextPreview = await inspectImportFile(nextFile, options);
      setFile(nextFile);
      setPreview(nextPreview);
      setMapping(nextPreview.kind === "tabular" ? nextPreview.mapping : {});
      setExcludedRows(new Set());
      setStep(nextPreview.kind === "canonical" ? 3 : 1);
    } catch (nextError) {
      setError(nextError?.message || "That file could not be read.");
    } finally {
      setBusy(false);
    }
  }

  async function rereadSource(next = {}) {
    await readFile(file, {
      sheetName: next.sheetName ?? preview?.sheetName,
      headerRow: next.headerRow ?? preview?.headerRow,
    });
  }

  function closeWizard() {
    if (!busy) onClose?.();
  }

  function toggleExcluded(index) {
    setExcludedRows((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function updateCell(rowIndex, header, value) {
    setPreview((current) => ({
      ...current,
      rows: current.rows.map((row, index) => (
        index === rowIndex ? { ...row, [header]: value } : row
      )),
    }));
  }

  async function finishImport() {
    setBusy(true);
    setError("");
    try {
      const result = preview.kind === "canonical"
        ? preview.result
        : await importMappedPreview(preview, mapping, excludedRows);
      await onImport?.(result, {
        fileName: preview.fileName,
        format: preview.format,
        includedRows: includedCount,
      });
    } catch (nextError) {
      setError(nextError?.message || "The import could not be completed.");
    } finally {
      setBusy(false);
    }
  }

  const reviewRows = preview?.kind === "tabular"
    ? preview.rows
      .map((row, index) => ({ row, index }))
      .filter(({ index }) => !invalidOnly || rowHasIssue(rowIssues, index))
      .slice(0, 200)
    : [];

  return (
    <dialog
      className="import-wizard"
      ref={dialogRef}
      aria-labelledby="import-wizard-title"
      onClose={onClose}
      onCancel={(event) => {
        event.preventDefault();
        closeWizard();
      }}
    >
      <header className="import-wizard__header">
        <div>
          <span>Spreadsheet import</span>
          <h2 id="import-wizard-title">Bring invoice data into Invoice Studio</h2>
        </div>
        <button type="button" className="icon-button" onClick={closeWizard} aria-label="Close import">
          <X size={20} aria-hidden="true" />
        </button>
      </header>

      <ol className="import-steps" aria-label="Import progress">
        {STEPS.map((label, index) => (
          <li className={`${index === step ? "is-current" : ""}${index < step ? " is-complete" : ""}`} key={label}>
            <span>{index < step ? <Check size={12} weight="bold" aria-hidden="true" /> : index + 1}</span>
            <strong>{label}</strong>
          </li>
        ))}
      </ol>

      <div className="import-wizard__body">
        {error ? (
          <div className="import-message import-message--error" role="alert">
            <WarningCircle size={19} weight="fill" aria-hidden="true" />
            <span>{error}</span>
          </div>
        ) : null}

        {step === 0 ? (
          <section className="import-choose" aria-labelledby="import-choose-heading">
            <div className="import-choose__intro">
              <p className="import-eyebrow">Start with your existing file</p>
              <h3 id="import-choose-heading">Choose a CSV, XLSX, or JSON file</h3>
              <p>Nothing is changed until you review the columns and approve the import.</p>
            </div>
            <button
              type="button"
              className="import-drop-zone"
              disabled={busy}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                readFile(event.dataTransfer.files?.[0]);
              }}
            >
              <UploadSimple size={34} weight="duotone" aria-hidden="true" />
              <strong>{busy ? "Reading your file…" : "Drop a file here or browse"}</strong>
              <span>Maximum file size: 10 MB</span>
            </button>
            <input
              ref={fileInputRef}
              className="visually-hidden"
              type="file"
              accept=".csv,.xlsx,.json,text/csv,application/json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(event) => readFile(event.target.files?.[0])}
            />
            <div className="import-format-cards" aria-label="Supported file formats">
              <div><FileCsv size={22} aria-hidden="true" /><span><strong>CSV</strong><small>Rows from Excel or another spreadsheet</small></span></div>
              <div><FileXls size={22} aria-hidden="true" /><span><strong>XLSX</strong><small>Choose a worksheet and header row</small></span></div>
              <div><BracketsCurly size={22} aria-hidden="true" /><span><strong>JSON</strong><small>Flat rows or an Invoice Studio backup</small></span></div>
            </div>
            <div className="import-samples">
              <span>Need a starting point?</span>
              <button type="button" onClick={() => onSample?.("csv")}>Save CSV sample</button>
              <button type="button" onClick={() => onSample?.("json")}>Save JSON sample</button>
            </div>
          </section>
        ) : null}

        {step === 1 && preview?.kind === "tabular" ? (
          <section className="import-preview" aria-labelledby="import-preview-heading">
            <div className="import-section-heading">
              <div>
                <p className="import-eyebrow">{formatName(preview.format)} · {preview.fileName}</p>
                <h3 id="import-preview-heading">Confirm where your table begins</h3>
                <p>Pick the worksheet and row that contains your column headings.</p>
              </div>
              <div className="import-source-controls">
                {preview.format === "xlsx" ? (
                  <label>
                    <span>Worksheet</span>
                    <select value={preview.sheetName} onChange={(event) => rereadSource({ sheetName: event.target.value })}>
                      {preview.sheetNames.map((name) => <option value={name} key={name}>{name}</option>)}
                    </select>
                  </label>
                ) : null}
                {preview.format !== "json" ? (
                  <label>
                    <span>Header row</span>
                    <input
                      type="number"
                      min="1"
                      max="25"
                      value={preview.headerRow}
                      onChange={(event) => rereadSource({ headerRow: Number(event.target.value) })}
                    />
                  </label>
                ) : null}
              </div>
            </div>
            <DataPreviewTable preview={preview} rows={preview.rows.slice(0, 12).map((row, index) => ({ row, index }))} readOnly />
            <p className="import-table-caption">Showing up to 12 of {preview.rows.length} data rows.</p>
          </section>
        ) : null}

        {step === 2 && preview?.kind === "tabular" ? (
          <section className="import-mapping" aria-labelledby="import-mapping-heading">
            <div className="import-section-heading">
              <div>
                <p className="import-eyebrow">Match your columns</p>
                <h3 id="import-mapping-heading">Tell us what each column means</h3>
                <p>We suggested matches from the headings. Choose “Ignore” for anything you do not need.</p>
              </div>
              <div className="import-summary-pill">{Object.values(mapping).filter(Boolean).length} of {preview.headers.length} mapped</div>
            </div>
            {mappingErrors.length ? (
              <div className="import-message import-message--warning" role="status">
                <Info size={18} weight="fill" aria-hidden="true" />
                <span>{mappingErrors.join(" ")}</span>
              </div>
            ) : null}
            <div className="mapping-grid">
              {preview.headers.map((header) => (
                <label className="mapping-row" key={header}>
                  <span title={header}>{header}</span>
                  <ArrowRight size={16} aria-hidden="true" />
                  <select
                    value={mapping[header] || ""}
                    onChange={(event) => setMapping((current) => ({ ...current, [header]: event.target.value }))}
                  >
                    <option value="">Ignore this column</option>
                    {Array.from(new Set(IMPORT_FIELDS.map((field) => field.group))).map((group) => (
                      <optgroup label={group} key={group}>
                        {IMPORT_FIELDS.filter((field) => field.group === group).map((field) => (
                          <option value={field.path} key={field.path}>{field.label}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </section>
        ) : null}

        {step === 3 ? (
          <section className="import-review" aria-labelledby="import-review-heading">
            <div className="import-section-heading">
              <div>
                <p className="import-eyebrow">Final check</p>
                <h3 id="import-review-heading">Review what will be imported</h3>
                <p>{preview?.kind === "canonical" ? "This complete backup will replace the open invoice data." : "Edit a cell or exclude a row before continuing."}</p>
              </div>
              {preview?.kind === "tabular" ? (
                <label className="invalid-filter">
                  <input type="checkbox" checked={invalidOnly} onChange={(event) => setInvalidOnly(event.target.checked)} />
                  Show invalid only
                </label>
              ) : null}
            </div>
            {preview?.kind === "canonical" ? (
              <div className="canonical-import-card">
                <BracketsCurly size={30} weight="duotone" aria-hidden="true" />
                <div>
                  <strong>{preview.fileName}</strong>
                  <span>Complete Invoice Studio invoice · exact replacement</span>
                </div>
                <Check size={20} weight="bold" aria-hidden="true" />
              </div>
            ) : (
              <>
                <div className={`import-message ${rowIssues.length ? "import-message--warning" : "import-message--success"}`} role="status">
                  {rowIssues.length ? <WarningCircle size={19} weight="fill" aria-hidden="true" /> : <Check size={18} weight="bold" aria-hidden="true" />}
                  <span>{rowIssues.length ? `${rowIssues.length} ${rowIssues.length === 1 ? "cell needs" : "cells need"} attention. Fix the values or exclude those rows.` : `${includedCount} ${includedCount === 1 ? "row is" : "rows are"} ready to import.`}</span>
                </div>
                <DataPreviewTable
                  preview={preview}
                  rows={reviewRows}
                  issues={rowIssues}
                  excludedRows={excludedRows}
                  onToggleExcluded={toggleExcluded}
                  onChange={updateCell}
                />
                {preview.rows.length > 200 ? <p className="import-table-caption">Showing the first 200 matching rows.</p> : null}
              </>
            )}
          </section>
        ) : null}
      </div>

      {step > 0 ? (
        <footer className="import-wizard__footer">
          <button
            type="button"
            className="import-button import-button--secondary"
            disabled={busy}
            onClick={() => {
              setError("");
              setStep((current) => Math.max(0, current - 1));
            }}
          >
            <ArrowLeft size={16} aria-hidden="true" /> Back
          </button>
          <div>
            <span>{preview?.kind === "tabular" ? `${includedCount} of ${preview.rows.length} rows selected` : "1 invoice selected"}</span>
            {step < 3 ? (
              <button
                type="button"
                className="import-button import-button--primary"
                disabled={busy || (step === 1 && !preview.headers.length) || (step === 2 && mappingErrors.length > 0)}
                onClick={() => setStep((current) => current + 1)}
              >
                Continue <ArrowRight size={16} aria-hidden="true" />
              </button>
            ) : (
              <button
                type="button"
                className="import-button import-button--primary"
                disabled={busy || includedCount < 1 || rowIssues.length > 0}
                onClick={finishImport}
              >
                {busy ? "Importing…" : preview?.kind === "canonical" ? "Restore invoice" : `Import ${includedCount} ${includedCount === 1 ? "row" : "rows"}`}
              </button>
            )}
          </div>
        </footer>
      ) : null}
    </dialog>
  );
}

function DataPreviewTable({
  preview,
  rows,
  readOnly = false,
  issues = [],
  excludedRows = new Set(),
  onToggleExcluded,
  onChange,
}) {
  return (
    <div className="import-table-wrap" tabIndex="0" role="region" aria-label="Spreadsheet data preview">
      <table className="import-data-table">
        <thead>
          <tr>
            {!readOnly ? <th scope="col">Use</th> : null}
            <th scope="col">Row</th>
            {preview.headers.map((header) => <th scope="col" key={header}>{header}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.length ? rows.map(({ row, index }) => {
            const invalid = rowHasIssue(issues, index);
            const excluded = excludedRows.has(index);
            return (
              <tr className={`${invalid ? "is-invalid" : ""}${excluded ? " is-excluded" : ""}`} key={index}>
                {!readOnly ? (
                  <td>
                    <input
                      type="checkbox"
                      checked={!excluded}
                      onChange={() => onToggleExcluded?.(index)}
                      aria-label={`Use row ${index + 1}`}
                    />
                  </td>
                ) : null}
                <th scope="row">{index + 1}</th>
                {preview.headers.map((header) => (
                  <td key={header}>
                    {readOnly ? String(row?.[header] ?? "") : (
                      <input
                        value={String(row?.[header] ?? "")}
                        disabled={excluded}
                        aria-label={`Row ${index + 1}, ${header}`}
                        onChange={(event) => onChange?.(index, header, event.target.value)}
                      />
                    )}
                  </td>
                ))}
              </tr>
            );
          }) : (
            <tr><td colSpan={preview.headers.length + (readOnly ? 1 : 2)}>No rows match this view.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
