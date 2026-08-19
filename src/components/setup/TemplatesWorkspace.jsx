import {
  Check,
  Copy,
  PencilSimple,
  Star,
  Trash,
  X,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import { normalizeInvoice } from "../../lib/invoice.js";
import { InvoiceDocument } from "../InvoiceDocument.jsx";
import { AutosaveStatus } from "./SetupControls.jsx";
import { TemplateEditor } from "./TemplateEditor.jsx";
import { TemplatePresetList } from "./TemplatePresetList.jsx";
import { EMPTY_LIST, presetContent, presetDesign } from "./setupModel.js";
import "./setup.css";

function findPreset(presets, id) {
  return presets.find((preset) => String(preset.id) === String(id));
}

export function TemplatesWorkspace({
  presets = EMPTY_LIST,
  defaultPresetId = null,
  previewInvoice,
  selectedPresetId,
  isSaving = false,
  onSelectPreset,
  onCreatePreset,
  onUpdatePreset,
  onRenamePreset,
  onDuplicatePreset,
  onDeletePreset,
  onSetDefault,
  onApplyToCurrent,
}) {
  const preferredInitialId = findPreset(presets, defaultPresetId)?.id ?? presets[0]?.id ?? null;
  const [internalSelectedId, setInternalSelectedId] = useState(preferredInitialId);
  const [renaming, setRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [isActing, setIsActing] = useState(false);
  const [actionError, setActionError] = useState("");
  const selectionIsControlled = selectedPresetId !== undefined;
  const requestedId = selectionIsControlled ? selectedPresetId : internalSelectedId;
  const selectedPreset = findPreset(presets, requestedId) || presets[0] || null;
  const resolvedSelectedId = selectedPreset?.id ?? null;

  useEffect(() => {
    if (!selectionIsControlled && !findPreset(presets, internalSelectedId)) {
      setInternalSelectedId(presets[0]?.id ?? null);
    }
  }, [internalSelectedId, presets, selectionIsControlled]);

  useEffect(() => {
    setRenaming(false);
    setConfirmingDelete(false);
    setActionError("");
  }, [resolvedSelectedId]);

  const isolatedPreview = useMemo(() => {
    const source = previewInvoice && typeof previewInvoice === "object" ? previewInvoice : {};
    if (!selectedPreset) return normalizeInvoice(source);

    const resolvedDesign = presetDesign(selectedPreset);
    if (!selectedPreset.locked && selectedPreset.accentMode !== "fixed") {
      resolvedDesign.accentColor = source.design?.accentColor || resolvedDesign.accentColor;
    }
    return normalizeInvoice({
      ...source,
      design: { ...(source.design || {}), ...resolvedDesign },
      content: { ...(source.content || {}), ...presetContent(selectedPreset) },
    });
  }, [previewInvoice, selectedPreset]);

  function selectPreset(id) {
    if (!selectionIsControlled) setInternalSelectedId(id);
    onSelectPreset?.(id);
  }

  function beginRename() {
    if (!selectedPreset || selectedPreset.locked) return;
    setConfirmingDelete(false);
    setRenameDraft(selectedPreset.name || "");
    setRenaming(true);
  }

  async function runAction(action) {
    if (isActing) return false;
    setIsActing(true);
    setActionError("");
    try {
      await action?.();
      return true;
    } catch (error) {
      setActionError(error?.message || "That template change could not be saved.");
      return false;
    } finally {
      setIsActing(false);
    }
  }

  async function submitRename(event) {
    event.preventDefault();
    const name = renameDraft.trim();
    if (!selectedPreset || !name) return;
    if (await runAction(() => onRenamePreset?.(selectedPreset.id, name))) setRenaming(false);
  }

  async function deleteSelectedPreset() {
    if (!selectedPreset || selectedPreset.locked) return;
    if (await runAction(() => onDeletePreset?.(selectedPreset.id))) setConfirmingDelete(false);
  }

  const isDefault = selectedPreset
    ? String(defaultPresetId) === String(selectedPreset.id)
    : false;

  return (
    <section className="setup-templates-workspace" aria-labelledby="templates-workspace-title">
      <header className="setup-workspace-header">
        <div>
          <p>Reusable invoice styles</p>
          <h1 id="templates-workspace-title">Templates</h1>
          <span>Browse and refine saved presets without changing your open invoice.</span>
        </div>
        <AutosaveStatus isSaving={isSaving} />
      </header>

      <div className="setup-templates-grid">
        <TemplatePresetList
          presets={presets}
          selectedId={resolvedSelectedId}
          defaultPresetId={defaultPresetId}
          onSelect={selectPreset}
          onCreatePreset={onCreatePreset}
        />

        <div className="setup-template-controls-column">
          {selectedPreset ? (
            <div className="setup-template-actions" aria-label={`Actions for ${selectedPreset.name || "untitled preset"}`}>
              {renaming ? (
                <form className="setup-rename-form" onSubmit={submitRename}>
                  <label htmlFor="setup-template-rename">Preset name</label>
                  <div>
                    <input
                      id="setup-template-rename"
                      value={renameDraft}
                      maxLength={80}
                      autoFocus
                      onChange={(event) => setRenameDraft(event.target.value)}
                    />
                    <button className="setup-icon-button" type="submit" aria-label="Save preset name" disabled={!renameDraft.trim()}>
                      <Check size={17} weight="bold" aria-hidden="true" />
                    </button>
                    <button className="setup-icon-button" type="button" aria-label="Cancel rename" onClick={() => setRenaming(false)}>
                      <X size={17} weight="bold" aria-hidden="true" />
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  <div className="setup-action-button-row">
                    <button className="setup-button setup-button--secondary" type="button" disabled={isActing} onClick={() => runAction(() => onDuplicatePreset?.(selectedPreset.id))}>
                      <Copy size={16} aria-hidden="true" />
                      Duplicate
                    </button>
                    <button className="setup-icon-button" type="button" aria-label="Rename preset" disabled={selectedPreset.locked || isActing} onClick={beginRename}>
                      <PencilSimple size={17} aria-hidden="true" />
                    </button>
                    <button
                      className="setup-icon-button setup-icon-button--danger"
                      type="button"
                      aria-label="Delete preset"
                      disabled={selectedPreset.locked || isActing}
                      onClick={() => {
                        setRenaming(false);
                        setConfirmingDelete(true);
                      }}
                    >
                      <Trash size={17} aria-hidden="true" />
                    </button>
                  </div>
                  <button
                    className="setup-button setup-button--secondary"
                    type="button"
                    disabled={isDefault || isActing}
                    onClick={() => runAction(() => onSetDefault?.(selectedPreset.id))}
                  >
                    <Star size={16} weight={isDefault ? "fill" : "regular"} aria-hidden="true" />
                    {isDefault ? "Default preset" : "Set as default"}
                  </button>
                </>
              )}
            </div>
          ) : null}

          {actionError ? <p className="setup-template-action-error" role="alert">{actionError}</p> : null}

          {confirmingDelete && selectedPreset ? (
            <div className="setup-delete-confirmation" role="alert">
              <div>
                <strong>Delete “{selectedPreset.name || "Untitled preset"}”?</strong>
                <span>Existing invoices keep their current design.</span>
              </div>
              <div>
                <button className="setup-button setup-button--secondary" type="button" disabled={isActing} onClick={() => setConfirmingDelete(false)}>Cancel</button>
                <button className="setup-button setup-button--danger" type="button" disabled={isActing} onClick={deleteSelectedPreset}>{isActing ? "Deleting…" : "Delete"}</button>
              </div>
            </div>
          ) : null}

          <TemplateEditor preset={selectedPreset} onUpdatePreset={onUpdatePreset} />
        </div>

        <section className="setup-template-preview" aria-labelledby="template-preview-heading">
          <div className="setup-template-preview-heading">
            <div>
              <p>Live preview</p>
              <h2 id="template-preview-heading">{selectedPreset?.name || "Invoice preview"}</h2>
            </div>
            <span>Preview only</span>
          </div>
          <p className="setup-template-preview-note">Preset browsing is isolated from the invoice you are editing.</p>
          <div className="setup-template-preview-stage">
            <InvoiceDocument invoice={isolatedPreview} className="setup-template-preview-document" />
          </div>
          <div className="setup-template-preview-footer">
            <span>{selectedPreset ? "Apply only when you’re ready." : "Create a preset to begin."}</span>
            <button
              className="setup-button setup-button--primary"
              type="button"
              disabled={!selectedPreset || isActing}
              onClick={() => runAction(() => onApplyToCurrent?.(selectedPreset.id))}
            >
              Apply to current invoice
            </button>
          </div>
        </section>
      </div>
    </section>
  );
}
