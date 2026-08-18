# Invoice Studio

Invoice Studio is a Windows-first, offline invoice application for creating customizable, professional PDF invoices. It requires no account, keeps invoice data on the local computer, and also packages for macOS and Linux.

![Invoice Studio icon](build/icon.png)

## What it includes

- Editable company identity, logo, address, tax ID, and contact information
- Customer billing details, invoice number, dates, terms, purchase order, and currency
- Flexible line items with service date, product/service, description, quantity, rate, and taxable status
- Decimal-safe calculations for discounts, shipping or fees, taxes, deposits, totals, and balance due
- A reusable Company Profile page whose logo and details flow into every new invoice
- Three professional templates, HEX/RGB brand color controls, typography, column visibility, status, and Letter/A4 sizing
- Live document preview with searchable, vector-text PDF output
- CSV, XLSX, and JSON imports with common column-name aliases and spreadsheet-formula sanitization
- Local autosave plus portable JSON backup files
- Native desktop save dialogs and atomic file writes
- Windows update checks, consent-based downloads, progress, and restart-to-install

The interface takes inspiration from established accounting workflows, while using original Invoice Studio branding and templates.

## Download an installer

Tagged versions are packaged automatically by GitHub Actions. After this repository is pushed to GitHub, create a tag such as `v1.0.0`; the release workflow produces:

- macOS: DMG and ZIP
- Windows: per-user x64 NSIS Setup EXE plus updater metadata
- Linux: AppImage and DEB

Unsigned development installers work, but public macOS and Windows releases should be code-signed. macOS distribution also needs notarization credentials.

### Windows installation and automatic updates

Windows is the primary distribution target. Install `Invoice-Studio-Setup-<version>-x64.exe` once on the user's computer. It installs for that Windows user without requiring an installation-folder choice, creates Start menu and desktop shortcuts, and keeps app data during upgrades or uninstall unless the data is removed separately.

The installed app checks its public GitHub Releases feed shortly after launch and every six hours. **Settings → Software updates** also provides a manual check. When a newer version exists, the app asks before downloading it, shows progress, and offers **Restart & update** when ready. The invoice draft is saved immediately before restart.

To publish an update:

1. Make and test the change on `main`.
2. From a clean working tree, run `npm version patch` (or `minor`/`major`). This updates `package.json` and creates the matching `v<version>` Git tag.
3. Push both the commit and tag: `git push origin main --follow-tags`.
4. GitHub Actions builds the Windows installer, `.blockmap`, and `latest.yml`, verifies that the metadata and installer hash agree, then publishes one GitHub Release.
5. The installed app detects only versions higher than its current version. Never replace an old release in place; publish a new version instead.

The updater is configured automatically from GitHub Actions' `GITHUB_REPOSITORY` value, so no GitHub token is stored on the user's computer. The repository/release feed must be public for this family-friendly setup. This local workspace does not yet have a GitHub remote, so the updater becomes live after the repository is created and pushed.

Add an Authenticode certificate to GitHub repository secrets as `WIN_CSC_LINK` and its password as `WIN_CSC_KEY_PASSWORD`. Tagged releases require those secrets, force code signing, and verify the finished Setup EXE before publishing it to the automatic-update channel. Unsigned installers can still be built locally for testing, but Windows will show an unknown-publisher warning.

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

## Company profile and invoice entry

Open **Company** in the left navigation to enter the reusable business name, logo, address, tax ID, contact details, and brand color. The logo control accepts PNG, JPG, or WebP images up to 2.5 MB. New blank invoices retain this company profile and brand styling.

Open **Invoices** to use the clean entry form for the customer, invoice dates and terms, line items, notes, payment instructions, discounts, fees, tax, and deposit. Every field updates the invoice preview; **Preview** shows the composed document, and **Save PDF** exports that same result. Importing an Invoice Studio JSON backup restores that full saved invoice, including intentional blank fields and empty line items; CSV/XLSX imports update only the fields they contain.

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
- There are no analytics, cloud invoice storage, or external API keys. The installed Windows app contacts GitHub Releases only to check for software updates.

## License

[MIT](LICENSE)
