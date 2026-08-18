# Invoice Studio

Invoice Studio is a Windows-first desktop app for creating professional PDF invoices. It works offline, keeps invoice data on the computer, and does not require an account.

You can enter an invoice manually or import CSV, XLSX, and JSON files. Company details, logos, customer information, line items, taxes, discounts, payment instructions, colors, and PDF layouts are all customizable.

## Run it locally

You will need [Node.js 22 or newer](https://nodejs.org/) and npm.

```bash
git clone https://github.com/Veryno/invoiceCreator.git
cd invoiceCreator
npm ci
npm run desktop:dev
```

The last command starts the local interface and opens the Electron desktop app.

## Build and test

```bash
npm test
npm run build
```

To create a Windows installer on Windows:

```bash
npm run dist:win
```

The project also includes a GitHub Actions release workflow that builds Windows, macOS, and Linux installers when a version tag is pushed.

## Windows releases and updates

The Windows app installs per user and checks GitHub Releases for updates. When a new version is available, the user can download it in the app and restart to install it.

Public Windows releases must be signed. Add these GitHub repository secrets before pushing a release tag:

- `WIN_CSC_LINK` — the Authenticode certificate
- `WIN_CSC_KEY_PASSWORD` — the certificate password

Then publish a new version:

```bash
npm version patch
git push origin main --follow-tags
```

Use `minor` or `major` instead of `patch` when appropriate.

## Data and privacy

Drafts stay on the local computer. PDFs and JSON backups are saved only where the user chooses. The app has no accounts, analytics, cloud storage, or invoice-data transmission.

## License

[MIT](LICENSE)
