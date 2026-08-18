import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateInvoice,
  createDefaultInvoice,
  duplicateLineItem,
  formatMoney,
  getAccentInkColor,
  getReadableAccentColor,
  makeLineItem,
  normalizeInvoice,
  sanitizeFilenamePart,
} from "../src/lib/invoice.js";

test("createDefaultInvoice returns independent, realistic drafts", () => {
  const first = createDefaultInvoice();
  const second = createDefaultInvoice();

  assert.equal(first.company.name, "Northstar Studio & Build");
  assert.equal(first.meta.currency, "USD");
  assert.match(first.meta.number, /^INV-\d{4}-001$/);
  assert.ok(first.lineItems.length >= 3);
  assert.notStrictEqual(first, second);
  assert.notStrictEqual(first.company, second.company);
  assert.notStrictEqual(first.lineItems, second.lineItems);

  first.company.name = "Changed";
  first.lineItems[0].description = "Changed";
  assert.equal(second.company.name, "Northstar Studio & Build");
  assert.notEqual(second.lineItems[0].description, "Changed");
});

test("normalizeInvoice merges partial data and coerces imported values", () => {
  const invoice = normalizeInvoice({
    company: { name: "  Acme Works  " },
    meta: { currency: "cad", locale: "en-CA" },
    lineItems: [
      {
        id: "custom-line",
        description: "  Installation  ",
        quantity: "2.5",
        rate: "19.99",
        taxable: "false",
      },
    ],
    adjustments: {
      discountType: "fixed",
      discountValue: "5.25",
      shipping: "10",
      deposit: "20",
      taxRate: "13",
    },
    design: { accentColor: "#abcdef", showItem: "false" },
  });

  assert.equal(invoice.company.name, "Acme Works");
  assert.equal(invoice.meta.currency, "CAD");
  assert.equal(invoice.lineItems[0].quantity, 2.5);
  assert.equal(invoice.lineItems[0].rate, 19.99);
  assert.equal(invoice.lineItems[0].taxable, false);
  assert.equal(invoice.adjustments.discountValue, 5.25);
  assert.equal(invoice.design.accentColor, "#ABCDEF");
  assert.equal(invoice.design.showItem, false);
});

test("normalizeInvoice does not inject sample financial values into partial input", () => {
  const invoice = normalizeInvoice({
    company: { name: "Acme Works" },
    lineItems: [],
  });

  assert.equal(invoice.customer.name, "");
  assert.equal(invoice.adjustments.discountValue, 0);
  assert.equal(invoice.adjustments.shipping, 0);
  assert.equal(invoice.adjustments.deposit, 0);
  assert.equal(invoice.adjustments.taxRate, 0);
});

test("makeLineItem provides editable defaults without discarding overrides", () => {
  const lineItem = makeLineItem({ item: "Consulting", quantity: "3", rate: "125.5" });

  assert.ok(lineItem.id);
  assert.equal(lineItem.item, "Consulting");
  assert.equal(lineItem.quantity, 3);
  assert.equal(lineItem.rate, 125.5);
  assert.equal(lineItem.taxable, true);
});

test("duplicateLineItem preserves content but always creates a new identity", () => {
  const original = makeLineItem({ id: "line-original", item: "Consulting", quantity: 2, rate: 125 });
  const duplicate = duplicateLineItem(original);

  assert.notEqual(duplicate.id, original.id);
  assert.equal(duplicate.item, original.item);
  assert.equal(duplicate.quantity, original.quantity);
  assert.equal(duplicate.rate, original.rate);
});

test("accent color helpers preserve readable invoice text", () => {
  assert.equal(getAccentInkColor("#FFFFFF"), "#000000");
  assert.equal(getAccentInkColor("#2563EB"), "#FFFFFF");
  assert.equal(getAccentInkColor("#808080"), "#000000");
  assert.equal(getReadableAccentColor("#2563EB"), "#2563EB");
  assert.notEqual(getReadableAccentColor("#FFFFCC"), "#FFFFCC");
});

test("calculateInvoice uses HALF_UP rounding and allocates discounts proportionally", () => {
  const calculation = calculateInvoice({
    lineItems: [
      makeLineItem({ id: "taxable", quantity: 1, rate: 100, taxable: true }),
      makeLineItem({ id: "non-taxable", quantity: 1, rate: 100, taxable: false }),
      makeLineItem({ id: "rounding", quantity: 1, rate: "10.005", taxable: false }),
    ],
    adjustments: {
      discountType: "fixed",
      discountValue: 20,
      shipping: 10,
      deposit: 50,
      taxRate: 10,
    },
  });

  assert.deepEqual(
    calculation.lineItems.map(({ amount }) => amount),
    [100, 100, 10.01],
  );
  assert.equal(calculation.subtotal, 210.01);
  assert.equal(calculation.discount, 20);
  assert.equal(calculation.taxableSubtotal, 100);
  assert.equal(calculation.taxableDiscount, 9.52);
  assert.equal(calculation.taxableBase, 90.48);
  assert.equal(calculation.tax, 9.05);
  assert.equal(calculation.shipping, 10);
  assert.equal(calculation.total, 209.06);
  assert.equal(calculation.deposit, 50);
  assert.equal(calculation.balance, 159.06);
});

test("calculateInvoice caps percent discounts and fixed discounts at the subtotal", () => {
  const percent = calculateInvoice({
    lineItems: [makeLineItem({ quantity: 1, rate: 80, taxable: true })],
    adjustments: { discountType: "percent", discountValue: 125, taxRate: 8 },
  });
  const fixed = calculateInvoice({
    lineItems: [makeLineItem({ quantity: 1, rate: 80, taxable: true })],
    adjustments: { discountType: "fixed", discountValue: 100, taxRate: 8 },
  });

  assert.equal(percent.discount, 80);
  assert.equal(percent.taxableBase, 0);
  assert.equal(percent.total, 0);
  assert.equal(fixed.discount, 80);
  assert.equal(fixed.total, 0);
});

test("formatMoney rounds HALF_UP and falls back for invalid locale/currency", () => {
  assert.equal(formatMoney("1234.565", "USD", "en-US"), "$1,234.57");
  assert.equal(formatMoney(12, "not-a-currency", "not-a-locale"), "$12.00");
});

test("sanitizeFilenamePart removes filesystem-reserved characters", () => {
  assert.equal(sanitizeFilenamePart(" Acme / West: INV*001? "), "Acme - West- INV-001");
  assert.equal(sanitizeFilenamePart("..."), "invoice");
  assert.equal(sanitizeFilenamePart("CON"), "_CON");
});
