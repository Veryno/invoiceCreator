import assert from "node:assert/strict";
import test from "node:test";
import { buildProductOptions, filterProductOptions, findProductOption } from "../src/lib/catalog.js";

test("saved items replace common items with the same name", () => {
  const options = buildProductOptions([
    { id: "catalog:1", name: "labor", rate: 95, taxable: false },
    { id: "catalog:2", name: "Old item", archivedAt: "2026-01-01T00:00:00.000Z" },
  ]);
  assert.deepEqual(options.saved.map(({ name }) => name), ["labor"]);
  assert.equal(options.common.some(({ name }) => name === "Labor"), false);
  assert.equal(findProductOption(options, "LABOR").rate, 95);
  assert.equal(findProductOption(options, "Drywall").source, "common");
});

test("filters by name or description", () => {
  const options = buildProductOptions([]);
  assert.deepEqual(filterProductOptions(options, "haul").common.map(({ name }) => name), ["Dumpster & debris removal"]);
});
