/**
 * Common construction products and services offered in every product/service
 * picker. They carry no rate because pricing is specific to each business;
 * saving one to the catalog lets the owner store a default rate.
 */
export const COMMON_CONSTRUCTION_ITEMS = Object.freeze([
  { name: "Labor", description: "Labor", unit: "hour", taxable: false },
  { name: "Materials", description: "Materials and supplies", unit: "each", taxable: true },
  { name: "General contracting", description: "General contracting and project management", unit: "each", taxable: false },
  { name: "Demolition", description: "Demolition and removal", unit: "each", taxable: false },
  { name: "Framing", description: "Framing", unit: "each", taxable: false },
  { name: "Drywall", description: "Drywall hang, tape, and finish", unit: "each", taxable: false },
  { name: "Painting", description: "Interior and exterior painting", unit: "each", taxable: false },
  { name: "Electrical", description: "Electrical work", unit: "each", taxable: false },
  { name: "Plumbing", description: "Plumbing work", unit: "each", taxable: false },
  { name: "HVAC", description: "Heating, ventilation, and air conditioning", unit: "each", taxable: false },
  { name: "Roofing", description: "Roofing", unit: "square", taxable: false },
  { name: "Flooring", description: "Flooring installation", unit: "sq ft", taxable: false },
  { name: "Tile", description: "Tile installation", unit: "sq ft", taxable: false },
  { name: "Concrete", description: "Concrete and masonry", unit: "each", taxable: false },
  { name: "Carpentry", description: "Finish carpentry", unit: "each", taxable: false },
  { name: "Cabinets & countertops", description: "Cabinet and countertop installation", unit: "each", taxable: false },
  { name: "Windows & doors", description: "Window and door installation", unit: "each", taxable: false },
  { name: "Insulation", description: "Insulation", unit: "sq ft", taxable: false },
  { name: "Excavation & site work", description: "Excavation, grading, and site work", unit: "each", taxable: false },
  { name: "Landscaping", description: "Landscaping", unit: "each", taxable: false },
  { name: "Equipment rental", description: "Equipment rental", unit: "day", taxable: true },
  { name: "Dumpster & debris removal", description: "Dumpster rental and debris haul-away", unit: "each", taxable: false },
  { name: "Permit fees", description: "Building permit and inspection fees", unit: "each", taxable: false },
  { name: "Subcontractor", description: "Subcontracted work", unit: "each", taxable: false },
  { name: "Change order", description: "Approved change order", unit: "each", taxable: false },
  { name: "Cleanup", description: "Job site cleanup", unit: "each", taxable: false },
  { name: "Inspection", description: "Inspection", unit: "each", taxable: false },
  { name: "Service call", description: "Service call / trip charge", unit: "each", taxable: false },
  { name: "Deposit", description: "Deposit toward contract", unit: "each", taxable: false },
  { name: "Progress billing", description: "Progress billing — % complete", unit: "each", taxable: false },
]);

function key(value) {
  return String(value ?? "").trim().toLocaleLowerCase();
}

/**
 * Merges the owner's saved catalog with the common list. Saved items win when a
 * name matches, so a stored default rate replaces the blank common entry.
 */
export function buildProductOptions(catalog = []) {
  const saved = (Array.isArray(catalog) ? catalog : [])
    .filter((record) => record && !record.archivedAt && String(record.name || "").trim())
    .map((record) => ({ ...record, source: "saved" }))
    .sort((left, right) => left.name.localeCompare(right.name));
  const savedNames = new Set(saved.map((record) => key(record.name)));
  const common = COMMON_CONSTRUCTION_ITEMS
    .filter((item) => !savedNames.has(key(item.name)))
    .map((item) => ({ ...item, id: `common:${key(item.name)}`, rate: 0, source: "common" }));
  return { saved, common };
}

export function findProductOption(options, name) {
  const target = key(name);
  if (!target) return null;
  return options.saved.find((item) => key(item.name) === target)
    || options.common.find((item) => key(item.name) === target)
    || null;
}

export function filterProductOptions(options, query) {
  const target = key(query);
  if (!target) return options;
  const matches = (item) => key(item.name).includes(target) || key(item.description).includes(target);
  return { saved: options.saved.filter(matches), common: options.common.filter(matches) };
}
