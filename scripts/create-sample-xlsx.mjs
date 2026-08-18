import ExcelJS from "exceljs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = path.join(projectRoot, "fixtures", "sample-invoice.xlsx");

const workbook = new ExcelJS.Workbook();
workbook.creator = "Invoice Studio";
workbook.created = new Date("2026-08-18T00:00:00Z");

const worksheet = workbook.addWorksheet("Invoice");
worksheet.columns = [
  { header: "Invoice Number", key: "invoiceNumber", width: 18 },
  { header: "Issue Date", key: "issueDate", width: 14 },
  { header: "Due Date", key: "dueDate", width: 14 },
  { header: "Currency", key: "currency", width: 12 },
  { header: "Company Name", key: "companyName", width: 28 },
  { header: "Customer Name", key: "customerName", width: 28 },
  { header: "Customer Email", key: "customerEmail", width: 30 },
  { header: "Billing Address", key: "billingAddress", width: 32 },
  { header: "Service Date", key: "serviceDate", width: 14 },
  { header: "Product / Service", key: "item", width: 24 },
  { header: "Description", key: "description", width: 48 },
  { header: "Quantity", key: "quantity", width: 12 },
  { header: "Rate", key: "rate", width: 14 },
  { header: "Taxable", key: "taxable", width: 12 },
  { header: "Tax Rate", key: "taxRate", width: 12 },
];

const shared = {
  invoiceNumber: "INV-2026-001",
  issueDate: "2026-08-17",
  dueDate: "2026-09-16",
  currency: "USD",
  companyName: "Northstar Studio & Build",
  customerName: "Riverside Property Group",
  customerEmail: "accounts@riversideproperty.com",
  billingAddress: "420 Harbor Avenue, Oakland, CA 94607",
  taxRate: 8.25,
};

worksheet.addRow({
  ...shared,
  serviceDate: "2026-08-17",
  item: "Design consultation",
  description: "Space planning, finish selections, and project specifications",
  quantity: 10,
  rate: 125,
  taxable: true,
});
worksheet.addRow({
  serviceDate: "2026-08-17",
  item: "Materials & finishes",
  description: "Custom millwork samples and approved finish materials",
  quantity: 1,
  rate: 1850,
  taxable: true,
});
worksheet.addRow({
  serviceDate: "2026-08-17",
  item: "Project coordination",
  description: "Vendor scheduling, site coordination, and progress reporting",
  quantity: 6,
  rate: 85,
  taxable: false,
});

worksheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
worksheet.getRow(1).fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF0B6B61" },
};
worksheet.views = [{ state: "frozen", ySplit: 1 }];

await mkdir(path.dirname(outputPath), { recursive: true });
await workbook.xlsx.writeFile(outputPath);
process.stdout.write(`Created ${outputPath}\n`);

