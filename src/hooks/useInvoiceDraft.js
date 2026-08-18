import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createDefaultInvoice,
  duplicateLineItem,
  makeLineItem,
  normalizeInvoice,
} from "../lib/invoice.js";

const STORAGE_KEY = "invoice-studio:draft:v1";

function readDraft() {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored ? normalizeInvoice(JSON.parse(stored)) : createDefaultInvoice();
  } catch {
    return createDefaultInvoice();
  }
}

function setAtPath(source, path, value) {
  const keys = path.split(".");
  const clone = { ...source };
  let cursor = clone;

  keys.forEach((key, index) => {
    if (index === keys.length - 1) {
      cursor[key] = value;
      return;
    }
    cursor[key] = { ...cursor[key] };
    cursor = cursor[key];
  });

  return clone;
}

export function useInvoiceDraft() {
  const [invoice, setInvoice] = useState(readDraft);
  const [savedAt, setSavedAt] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setTimeout(() => {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(invoice));
      setSavedAt(new Date());
    }, 350);

    return () => window.clearTimeout(timer);
  }, [invoice]);

  const saveNow = useCallback(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(invoice));
    setSavedAt(new Date());
  }, [invoice]);

  const updateField = useCallback((path, value) => {
    setInvoice((current) => setAtPath(current, path, value));
  }, []);

  const updateLine = useCallback((id, field, value) => {
    setInvoice((current) => ({
      ...current,
      lineItems: current.lineItems.map((line) =>
        line.id === id ? { ...line, [field]: value } : line,
      ),
    }));
  }, []);

  const addLine = useCallback(() => {
    setInvoice((current) => ({
      ...current,
      lineItems: [...current.lineItems, makeLineItem()],
    }));
  }, []);

  const duplicateLine = useCallback((id) => {
    setInvoice((current) => {
      const index = current.lineItems.findIndex((line) => line.id === id);
      if (index < 0) return current;
      const lineItems = [...current.lineItems];
      lineItems.splice(index + 1, 0, duplicateLineItem(current.lineItems[index]));
      return { ...current, lineItems };
    });
  }, []);

  const removeLine = useCallback((id) => {
    setInvoice((current) => {
      if (current.lineItems.length === 1) {
        return { ...current, lineItems: [makeLineItem()] };
      }
      return {
        ...current,
        lineItems: current.lineItems.filter((line) => line.id !== id),
      };
    });
  }, []);

  const replaceInvoice = useCallback((nextInvoice) => {
    setInvoice(normalizeInvoice(nextInvoice));
  }, []);

  const resetInvoice = useCallback(() => {
    setInvoice((current) => normalizeInvoice({
      company: current.company,
      design: current.design,
      lineItems: [makeLineItem()],
    }));
  }, []);

  return useMemo(
    () => ({
      invoice,
      savedAt,
      saveNow,
      updateField,
      updateLine,
      addLine,
      duplicateLine,
      removeLine,
      replaceInvoice,
      resetInvoice,
    }),
    [
      invoice,
      savedAt,
      saveNow,
      updateField,
      updateLine,
      addLine,
      duplicateLine,
      removeLine,
      replaceInvoice,
      resetInvoice,
    ],
  );
}
