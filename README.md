# Invoice Studio

Invoice Studio is a desktop invoicing app for contractors. Add your company and logo, bill customers with job site details and a product/service list built for construction, then save the invoice as a PDF or email it straight from the app.

Moving from QuickBooks? Export your customer list and the Sales by Customer Detail report, and import both in one step. Invoices can also be entered by hand or imported from CSV, XLSX, and JSON files.

Your data stays on your computer. There are no accounts, analytics, or cloud storage. Email goes out through your own Gmail, Outlook, or other email account.

## Download

Download the latest Windows installer from the [Releases page](https://github.com/Veryno/invoiceCreator/releases/latest).

Open the `.exe` file and follow the installer. Git, Node.js, and npm are not needed to use the installed app.

## Development

Developers will need [Node.js 22 or newer](https://nodejs.org/).

```bash
git clone https://github.com/Veryno/invoiceCreator.git
cd invoiceCreator
npm ci
npm run desktop:dev
```

Run the automated checks with:

```bash
npm test
npm run build
```

## License

[MIT](LICENSE)
