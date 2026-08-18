# Invoice Studio

Invoice Studio is a private, offline-first desktop application for creating customizable, professional PDF invoices. It runs on macOS, Windows, and Linux, requires no account, and keeps draft data on the local computer.

![Invoice Studio icon](build/icon.png)

## What it includes

- Editable company identity, logo, address, tax ID, and contact information
- Customer billing details, invoice number, dates, terms, purchase order, and currency
- Flexible line items with service date, product/service, description, quantity, rate, and taxable status
- Decimal-safe calculations for discounts, shipping or fees, taxes, deposits, totals, and balance due
- Three professional templates, custom brand color, typography, column visibility, status, and Letter/A4 sizing
- Live document preview with searchable, vector-text PDF output
- CSV, XLSX, and JSON imports with common column-name aliases and spreadsheet-formula sanitization
- Local autosave plus portable JSON backup files
- Native desktop save dialogs and atomic file writes

The interface takes inspiration from established accounting workflows, while using original Invoice Studio branding and templates.

## Download an installer

Tagged versions are packaged automatically by GitHub Actions. After this repository is pushed to GitHub, create a tag such as `v1.0.0`; the release workflow produces:

- macOS: DMG and ZIP
- Windows: NSIS installer and portable EXE
- Linux: AppImage and DEB

Unsigned development installers work, but public macOS and Windows releases should be code-signed. macOS distribution also needs notarization credentials.

## Run locally

Requirements: Node.js 22 or newer and npm.

```bash
npm install
npm run desktop:dev
```

The second command starts the Vite renderer and the Electron desktop window together.

For browser-only interface development:

```bash
npm run dev
```

## Build installers

Build for the current operating system:

```bash
npm run dist
```

Platform-specific commands are also available:

```bash
npm run dist:mac
npm run dist:win
npm run dist:linux
```

Cross-platform releases should be built through the included GitHub Actions workflow because each installer is produced on its native runner.

## Importing data

Use **Import** in the toolbar to choose CSV, XLSX, or JSON. Ready-to-use examples are available at [`fixtures/sample-invoice.json`](fixtures/sample-invoice.json) and [`fixtures/sample-invoice.xlsx`](fixtures/sample-invoice.xlsx). For older `.xls` workbooks, use Excel’s **Save As** command to save as `.xlsx` or CSV first.

For spreadsheets, each row represents a line item. The importer recognizes aliases including:

| Invoice field | Common headings |
| --- | --- |
| Invoice number | `invoice_number`, `invoice #`, `invoice no` |
| Company | `company_name`, `business name`, `seller name` |
| Customer | `customer_name`, `client`, `bill to` |
| Dates | `issue_date`, `invoice date`, `due_date`, `service_date` |
| Line item | `item`, `product/service`, `description` |
| Values | `quantity`, `qty`, `rate`, `unit price`, `taxable` |
| Adjustments | `tax_rate`, `discount`, `shipping`, `deposit` |

Shared invoice fields use the first non-empty value in the file. Invalid numbers receive a safe fallback and a warning; spreadsheet formulas are never executed.

## PDF verification

Generate the included sample invoice with the same Chromium print engine used by the desktop app:

```bash
npm run pdf:sample
```

The result is written to `output/pdf/sample-professional-invoice.pdf`.

## Tests

```bash
npm test
npm run build
```

The automated suite covers invoice calculations and rounding, import normalization and safety, Excel parsing, JSON round trips, and packaged static-site behavior.

## Privacy and security

- Drafts are saved in the app's local browser storage; they are not uploaded.
- JSON backups and PDFs are written only where the user chooses.
- Electron uses context isolation, renderer sandboxing, disabled Node integration, denied permissions, restricted navigation, allowlisted IPC, and validated native file operations.
- There are no analytics, cloud services, or external API keys.

## License

[MIT](LICENSE)
