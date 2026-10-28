# Prototype Instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.

## Product decisions

- This is a cross-platform, installable Electron desktop application, not a browser-only product.
- It is built for construction contractors. The owner wants it to work like a better QuickBooks Online invoicing workflow (customer → bill to / job site / invoice info → line items → send), while keeping Invoice Studio's own name, branding, icons, copy, and PDF templates. Do not copy Intuit branding or assets.
- Invoices carry a job site (job name, job site address, job info such as permit # or gate code) next to Bill to, and it prints on the PDF.
- There is no shipping/fees total. Extra charges are line items; older invoices with shipping are migrated to a non-taxable "Fees" line so totals don't change.
- Line items use a product/service dropdown: the owner's saved catalog first, then common construction items, with "save to my list". Amount is editable and back-calculates the rate.
- Right-click must offer the standard edit menu (cut, copy, paste, select all, spelling) in every text field.
- Core input methods are manual entry plus CSV, XLSX, and JSON import. Legacy `.xls` files should be converted to XLSX or CSV before import.
- Core output is a customizable, searchable professional PDF saved through a native file dialog.
- The product is offline-first and single-user. Do not add cloud sync, accounts, analytics, or external data transmission without an explicit request.
- The owner explicitly requested in-app email: invoices are sent over SMTP from the owner's own mailbox with the PDF attached. A test copy goes to the owner first, and sending to the customer unlocks after it (setting: on by default). The SMTP password lives only in the main process, encrypted with Electron safeStorage, never in the workspace or backups.
- Switching from QuickBooks is file-based: customer list exports plus the Sales by Customer Detail report (optionally Invoice List / Open Invoices for due dates and paid status). A direct QuickBooks API connection would need an Intuit developer app and OAuth and is not built.
- Keep the public README concise and conversational. Lead with the installer download, keep developer setup brief, and leave maintainer-only release, signing, and update details out of it.
- Unsigned GitHub installers are acceptable for the initial personal Windows release. Preserve optional Authenticode signing and signature verification for future releases.
- Overview, Customers, and Templates should be complete working product areas, not disabled navigation or decorative placeholder screens. Their data must come from the local invoice library.
- Include a quick, skippable, resumable first-run onboarding flow for company/logo/brand setup, invoice defaults and default template, the first customer, and the first invoice. Keep it available later from Overview or Settings.
- Use current Excel and QuickBooks interaction patterns as workflow inspiration for tables, imports, customer management, and dashboards while preserving Invoice Studio's original visual identity.
- Visual identity: navy sidebar (`--sidebar`) with labeled navigation, construction-orange primary actions (`--brand`), neutral gray canvas, 14px base text. Colors are tokens in `src/styles.css` `:root`; app-shell and editor overrides live in `src/theme.css`, loaded last.
