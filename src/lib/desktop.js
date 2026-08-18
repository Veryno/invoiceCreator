function downloadBlob(contents, filename, type = "application/octet-stream") {
  const blob = contents instanceof Blob ? contents : new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function isDesktopApp() {
  return Boolean(window.invoiceDesktop?.isDesktop);
}

export async function exportPdf({ suggestedName, pageSize = "Letter" }) {
  if (window.invoiceDesktop?.exportPdf) {
    return window.invoiceDesktop.exportPdf({ suggestedName, pageSize });
  }

  window.print();
  return { ok: true, method: "print-dialog" };
}

export async function saveTextFile({ suggestedName, contents, filters = [] }) {
  if (window.invoiceDesktop?.saveTextFile) {
    return window.invoiceDesktop.saveTextFile({ suggestedName, contents, filters });
  }

  const type = suggestedName?.toLowerCase().endsWith(".csv")
    ? "text/csv"
    : "application/json";
  downloadBlob(contents, suggestedName, type);
  return { ok: true, method: "download" };
}

export function downloadText(contents, suggestedName, type = "text/plain") {
  downloadBlob(contents, suggestedName, type);
}
