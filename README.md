# Invoice Studio

Invoice Studio is an offline desktop app for creating professional PDF invoices. Add your company details and logo, enter the invoice, customize the design, and save the finished document as a PDF.

Invoices can be entered manually or imported from CSV, XLSX, and JSON files. Everything stays on the computer—there are no accounts, analytics, or cloud storage.

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
