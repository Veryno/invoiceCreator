# Prototype Instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.

## Product decisions

- This is a cross-platform, installable Electron desktop application, not an Intuit/QuickBooks clone or a browser-only product.
- The supplied Intuit screenshot is a workflow and layout reference only. Preserve original Invoice Studio branding, icons, copy, and PDF templates.
- Core input methods are manual entry plus CSV, XLSX, and JSON import. Legacy `.xls` files should be converted to XLSX or CSV before import.
- Core output is a customizable, searchable professional PDF saved through a native file dialog.
- The product is offline-first and single-user. Do not add cloud sync, accounts, analytics, or external data transmission without an explicit request.
- Keep the public README concise and conversational: describe the app, local setup, release setup, and privacy without turning it into full product documentation.
