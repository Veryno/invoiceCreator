import { upsertWorkspaceRecord } from "./workspace.js";

function normalizedText(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/gu, " ")
    .toLocaleLowerCase();
}

function normalizedPhone(value) {
  const source = normalizedText(value);
  if (!source) return "";
  const extension = /(?:\bext(?:ension)?\.?|\bx)\s*(\d+)\s*$/iu.exec(source);
  const main = extension ? source.slice(0, extension.index) : source;
  const digits = main.replace(/\D/gu, "");
  if (!digits) return source;
  return extension ? `${digits}x${extension[1]}` : digits;
}

/** Normalizes only stable contact fields; it intentionally avoids fuzzy address matching. */
export function normalizeImportedCustomerIdentity(customer = {}) {
  return {
    name: normalizedText(customer.name),
    email: normalizedText(customer.email),
    phone: normalizedPhone(customer.phone),
    address: normalizedText(customer.address),
  };
}

export function importedCustomerIdentityKey(customer = {}) {
  const identity = normalizeImportedCustomerIdentity(customer);
  if (!Object.values(identity).some(Boolean)) return "";
  return JSON.stringify(identity);
}

function conflicts(left, right, field) {
  return Boolean(left[field] && right[field] && left[field] !== right[field]);
}

/**
 * Matches exact normalized records first, then only records that share a strong
 * contact field and have no conflicting populated fields. This prefers a safe
 * duplicate over attaching an invoice to the wrong customer.
 */
export function importedCustomersMatch(first, second) {
  const left = normalizeImportedCustomerIdentity(first);
  const right = normalizeImportedCustomerIdentity(second);
  const leftKey = importedCustomerIdentityKey(left);
  if (leftKey && leftKey === importedCustomerIdentityKey(right)) return true;

  for (const field of ["name", "email", "phone", "address"]) {
    if (conflicts(left, right, field)) return false;
  }

  if (left.email && left.email === right.email) return true;

  const sameName = left.name && left.name === right.name;
  const samePhone = left.phone && left.phone === right.phone;
  const sameAddress = left.address && left.address === right.address;
  if (sameName && (samePhone || sameAddress)) return true;

  return !left.name && !right.name && samePhone && sameAddress;
}

export function findMatchingImportedCustomer(customers, customerSnapshot) {
  const liveCustomers = (Array.isArray(customers) ? customers : [])
    .filter((customer) => !customer.archivedAt);
  const targetKey = importedCustomerIdentityKey(customerSnapshot);
  if (!targetKey) return null;

  const exact = liveCustomers.find(
    (customer) => importedCustomerIdentityKey(customer) === targetKey,
  );
  if (exact) return exact;

  const compatible = liveCustomers.filter(
    (customer) => importedCustomersMatch(customer, customerSnapshot),
  );
  return compatible.length === 1 ? compatible[0] : null;
}

export function resolveImportedCustomer(workspace, customerSnapshot) {
  if (!importedCustomerIdentityKey(customerSnapshot)) {
    return { workspace, customerId: null, record: null, created: false };
  }
  const existing = findMatchingImportedCustomer(workspace.customers, customerSnapshot);
  if (existing) {
    return { workspace, customerId: existing.id, record: existing, created: false };
  }
  const saved = upsertWorkspaceRecord(workspace, "customers", customerSnapshot);
  return {
    workspace: saved.workspace,
    customerId: saved.record.id,
    record: saved.record,
    created: true,
  };
}

export function upsertImportedCustomers(workspace, customerValues) {
  let nextWorkspace = workspace;
  const records = [];
  let createdCount = 0;
  let matchedCount = 0;

  for (const customer of Array.isArray(customerValues) ? customerValues : []) {
    const resolved = resolveImportedCustomer(nextWorkspace, customer);
    nextWorkspace = resolved.workspace;
    if (!resolved.record) continue;
    records.push(resolved.record);
    if (resolved.created) createdCount += 1;
    else matchedCount += 1;
  }

  return { workspace: nextWorkspace, records, createdCount, matchedCount };
}

/** Commits the entire onboarding customer batch through one repository update. */
export async function commitImportedCustomers(workspaceState, customerValues) {
  if (!workspaceState || typeof workspaceState.update !== "function") {
    throw new TypeError("A workspace update function is required.");
  }
  let batch = null;
  const workspace = await workspaceState.update((current) => {
    batch = upsertImportedCustomers(current, customerValues);
    return batch.workspace;
  });
  const savedById = new Map(workspace.customers.map((record) => [record.id, record]));
  return {
    ...batch,
    workspace,
    records: batch.records.map((record) => savedById.get(record.id) || record),
  };
}
