import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  duplicateLineItem,
  makeLineItem,
  normalizeInvoice,
} from "../lib/invoice.js";
import { useWorkspace } from "./useWorkspace.js";

function setAtPath(source, path, value) {
  const keys = path.split(".");
  const clone = { ...source };
  let cursor = clone;
  keys.forEach((key, index) => {
    if (index === keys.length - 1) cursor[key] = value;
    else {
      cursor[key] = { ...cursor[key] };
      cursor = cursor[key];
    }
  });
  return clone;
}

/**
 * Keeps editor typing immediate while persisting the active invoice through the
 * ordered workspace repository. Records change only after a successful commit;
 * historical customer/company/template values remain embedded snapshots.
 */
export function useWorkspaceInvoiceDraft() {
  const workspaceState = useWorkspace();
  const activeRecord = workspaceState.activeInvoiceRecord;
  const [invoice, setInvoice] = useState(() => normalizeInvoice(activeRecord?.invoice));
  const [recordId, setRecordId] = useState(activeRecord?.id || null);
  const [savedAt, setSavedAt] = useState(() => (
    activeRecord?.updatedAt ? new Date(activeRecord.updatedAt) : new Date()
  ));
  const [saveStatus, setSaveStatus] = useState("saved");
  const invoiceRef = useRef(invoice);
  const recordIdRef = useRef(recordId);
  const editVersionRef = useRef(0);
  const dirtyRef = useRef(false);
  const timerRef = useRef(null);

  invoiceRef.current = invoice;
  recordIdRef.current = recordId;

  useEffect(() => {
    const persistPendingRecord = () => {
      const previousId = recordIdRef.current;
      if (!previousId || !dirtyRef.current) return;
      const snapshot = normalizeInvoice(invoiceRef.current);
      void workspaceState.saveInvoice(previousId, snapshot).catch(() => {});
    };

    if (!activeRecord) {
      persistPendingRecord();
      if (timerRef.current) window.clearTimeout(timerRef.current);
      setRecordId(null);
      recordIdRef.current = null;
      dirtyRef.current = false;
      return;
    }
    if (activeRecord.id !== recordIdRef.current) {
      persistPendingRecord();
      const nextInvoice = normalizeInvoice(activeRecord.invoice);
      setRecordId(activeRecord.id);
      recordIdRef.current = activeRecord.id;
      setInvoice(nextInvoice);
      invoiceRef.current = nextInvoice;
      dirtyRef.current = false;
      editVersionRef.current += 1;
      setSavedAt(new Date(activeRecord.updatedAt));
      setSaveStatus("saved");
      if (timerRef.current) window.clearTimeout(timerRef.current);
      return;
    }
    if (!dirtyRef.current && activeRecord.updatedAt) {
      const nextInvoice = normalizeInvoice(activeRecord.invoice);
      if (JSON.stringify(nextInvoice) !== JSON.stringify(invoiceRef.current)) {
        setInvoice(nextInvoice);
        invoiceRef.current = nextInvoice;
      }
      setSavedAt(new Date(activeRecord.updatedAt));
    }
  }, [activeRecord, workspaceState.saveInvoice]);

  useEffect(() => () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    const id = recordIdRef.current;
    if (!id || !dirtyRef.current) return;
    const snapshot = normalizeInvoice(invoiceRef.current);
    void workspaceState.saveInvoice(id, snapshot).catch(() => {});
  }, [workspaceState.saveInvoice]);

  const persist = useCallback(async () => {
    const id = recordIdRef.current;
    if (!id || !dirtyRef.current) return null;
    const capturedVersion = editVersionRef.current;
    const snapshot = normalizeInvoice(invoiceRef.current);
    setSaveStatus("saving");
    try {
      const result = await workspaceState.saveInvoice(id, snapshot);
      if (editVersionRef.current === capturedVersion) {
        dirtyRef.current = false;
        setSaveStatus("saved");
        setSavedAt(new Date(result.record.updatedAt));
      }
      return result;
    } catch (error) {
      setSaveStatus("error");
      throw error;
    }
  }, [workspaceState.saveInvoice]);

  useEffect(() => {
    if (!recordId || !dirtyRef.current) return undefined;
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      void persist().catch(() => {});
    }, 350);
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [invoice, persist, recordId]);

  const mutate = useCallback((updater) => {
    editVersionRef.current += 1;
    dirtyRef.current = true;
    setSaveStatus("saving");
    const next = normalizeInvoice(updater(invoiceRef.current));
    invoiceRef.current = next;
    setInvoice(next);
  }, []);

  const updateField = useCallback((path, value) => {
    mutate((current) => setAtPath(current, path, value));
  }, [mutate]);

  const updateLine = useCallback((id, field, value) => {
    mutate((current) => ({
      ...current,
      lineItems: current.lineItems.map((line) => (
        line.id === id ? { ...line, [field]: value } : line
      )),
    }));
  }, [mutate]);

  const addLine = useCallback(() => {
    mutate((current) => ({ ...current, lineItems: [...current.lineItems, makeLineItem()] }));
  }, [mutate]);

  const duplicateLine = useCallback((id) => {
    mutate((current) => {
      const index = current.lineItems.findIndex((line) => line.id === id);
      if (index < 0) return current;
      const lineItems = [...current.lineItems];
      lineItems.splice(index + 1, 0, duplicateLineItem(current.lineItems[index]));
      return { ...current, lineItems };
    });
  }, [mutate]);

  const removeLine = useCallback((id) => {
    mutate((current) => ({
      ...current,
      lineItems: current.lineItems.length === 1
        ? [makeLineItem()]
        : current.lineItems.filter((line) => line.id !== id),
    }));
  }, [mutate]);

  const replaceInvoice = useCallback((nextInvoice) => {
    mutate(() => normalizeInvoice(nextInvoice));
  }, [mutate]);

  const saveNow = useCallback(async () => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const result = await persist();
    await workspaceState.flush();
    return result;
  }, [persist, workspaceState.flush]);

  return useMemo(() => ({
    addLine,
    duplicateLine,
    invoice,
    isDirty: dirtyRef.current,
    record: activeRecord,
    recordId,
    removeLine,
    replaceInvoice,
    saveNow,
    savedAt,
    saveStatus,
    updateField,
    updateLine,
  }), [
    activeRecord,
    addLine,
    duplicateLine,
    invoice,
    recordId,
    removeLine,
    replaceInvoice,
    saveNow,
    savedAt,
    saveStatus,
    updateField,
    updateLine,
  ]);
}
