import assert from "node:assert/strict";
import test from "node:test";
import {
  commitImportedCustomers,
  importedCustomersMatch,
  resolveImportedCustomer,
} from "../src/lib/importCustomers.js";
import { createWorkspace } from "../src/lib/workspace.js";

test("same-name customers without email stay distinct when phone or address conflicts", () => {
  let workspace = createWorkspace();
  const first = resolveImportedCustomer(workspace, {
    name: "John Smith",
    phone: "(212) 555-0100",
    address: "One Main Street",
  });
  workspace = first.workspace;
  const second = resolveImportedCustomer(workspace, {
    name: " john   smith ",
    phone: "212-555-0199",
    address: "Two Main Street",
  });

  assert.equal(second.workspace.customers.length, 2);
  assert.notEqual(first.customerId, second.customerId);
  assert.equal(importedCustomersMatch(first.record, second.record), false);
});

test("normalized contact details reuse one unambiguous imported customer", () => {
  const initial = createWorkspace();
  const first = resolveImportedCustomer(initial, {
    name: "Riverside Property Group",
    phone: "+1 (212) 555-0100",
    address: "420  Harbor Avenue",
  });
  const retried = resolveImportedCustomer(first.workspace, {
    name: " riverside property group ",
    phone: "1-212-555-0100",
    address: "420 harbor avenue",
  });

  assert.equal(retried.workspace.customers.length, 1);
  assert.equal(retried.customerId, first.customerId);
  assert.equal(retried.created, false);
});

test("onboarding customer batches use one atomic update and retries do not duplicate", async () => {
  let workspace = createWorkspace();
  let updateCalls = 0;
  let failNextCommit = true;
  const workspaceState = {
    async update(updater) {
      updateCalls += 1;
      const candidate = updater(workspace);
      if (failNextCommit) {
        failNextCommit = false;
        throw new Error("simulated storage failure");
      }
      workspace = candidate;
      return workspace;
    },
  };
  const customers = [
    { name: "Acme", email: "billing@acme.test" },
    { name: "Beta", phone: "555-0102", address: "Two Oak Road" },
  ];

  await assert.rejects(
    commitImportedCustomers(workspaceState, customers),
    /simulated storage failure/,
  );
  assert.equal(workspace.customers.length, 0);

  const imported = await commitImportedCustomers(workspaceState, customers);
  assert.equal(imported.createdCount, 2);
  assert.equal(workspace.customers.length, 2);

  const retried = await commitImportedCustomers(workspaceState, customers);
  assert.equal(retried.createdCount, 0);
  assert.equal(retried.matchedCount, 2);
  assert.equal(workspace.customers.length, 2);
  assert.equal(updateCalls, 3);
});
