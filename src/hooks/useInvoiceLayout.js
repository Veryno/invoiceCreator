import { createContext, createElement, useContext } from "react";
import { createDefaultLayout } from "../lib/layout.js";

const DEFAULT_LAYOUT = createDefaultLayout();
const InvoiceLayoutContext = createContext(DEFAULT_LAYOUT);

/** Shares the workspace's labels, columns, and custom fields with every invoice view. */
export function InvoiceLayoutProvider({ layout, children }) {
  return createElement(InvoiceLayoutContext.Provider, { value: layout || DEFAULT_LAYOUT }, children);
}

export function useInvoiceLayout() {
  return useContext(InvoiceLayoutContext);
}
