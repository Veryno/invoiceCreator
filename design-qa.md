# Design QA - Invoice Studio

## Comparison target

- Source visual truth: `/Users/yaacob/Documents/Codefolder/invoice/.design-qa/reference-intuit-workflow.png`
- Final editor implementation: `/Users/yaacob/Documents/Codefolder/invoice/.design-qa/implementation-editor-final.png`
- Final document preview: `/Users/yaacob/Documents/Codefolder/invoice/.design-qa/implementation-preview-final.png`
- Focused source region: `/Users/yaacob/Documents/Codefolder/invoice/.design-qa/reference-line-editor-focus.png`
- Focused implementation region: `/Users/yaacob/Documents/Codefolder/invoice/.design-qa/implementation-line-editor-focus.png`
- Viewport: 1600 x 900 CSS px
- Source pixels: 1600 x 900
- Implementation pixels: 1600 x 900
- Device density normalization: implementation screenshot pixel dimensions equal the CSS viewport (1:1). The supplied 1600 x 900 source bitmap was compared at its native pixel dimensions.
- State: populated invoice editor with company/customer details, three line items, and the customization rail open. Browser chrome in the source and the source's 30% browser zoom are outside the app-owned comparison surface.

## Full-view comparison evidence

The supplied reference and implementation were opened together in the same comparison pass. Invoice Studio preserves the reference workflow's principal composition: a persistent left navigation rail, a compact action toolbar, a pale invoice-details region, a dense editable line-item table, and a right-side customization rail. The implementation intentionally uses original branding and a readable native desktop scale instead of copying Intuit branding or the reference's unusually zoomed-out text.

No actionable P0/P1/P2 mismatch remains. The implementation has clearer hierarchy, larger usable controls, stronger contrast, and a less crowded editing surface while retaining the requested accounting-app structure.

## Focused region comparison evidence

The line-item editor and adjacent customization controls were cropped and reviewed at 1450 x 360 pixels. The implementation retains the reference's service date, product/service, description, quantity, rate, tax, amount, row actions, and customization affordances. Unlike the 30%-zoom source, labels and entered values remain legible at the intended desktop scale. Standard Phosphor icons are used consistently; the source product logo and proprietary visual assets are not reproduced.

## Required fidelity surfaces

- Fonts and typography: System UI/Inter-style sans typography matches the reference's neutral accounting-product tone. Weights, small uppercase labels, table density, wrapping, and numeric alignment are consistent and legible. Optional serif and classic sans choices affect the invoice document only.
- Spacing and layout rhythm: The left rail, header, main editor, and 304px customization rail form a stable desktop grid. Card spacing, dividers, input heights, and table rhythm are consistent. Responsive checks at 320, 390, 768, 1024, 1440, and 1600 pixels show no body-level overflow after the fix below.
- Colors and visual tokens: Deep teal navigation, white surfaces, pale blue-green detail areas, restrained borders, and selectable PDF accent colors fit the source's professional financial-product palette. Contrast is sufficient and state is never communicated by color alone.
- Image quality and asset fidelity: The workflow reference contains product chrome rather than required photographic assets. The original Intuit/QuickBooks logo was deliberately not copied. User-uploaded logos remain sharp in the live document and PDF; app/UI symbols come from one real icon library rather than CSS or inline-SVG approximations.
- Copy and content: All app-owned text is original, specific to Invoice Studio, and uses realistic invoice content. Field labels, import guidance, status, calculations, and PDF copy are coherent outside the reference context.
- Interactions and states: Manual editing updates the document preview; line duplication was verified to create an independent row; template selection, contrast-safe brand controls, visible-column toggles, CSV/JSON parsing, live XLSX import, local autosave, preview switching, and PDF fixture export were exercised successfully. Browser console check: zero warnings or errors.
- Accessibility: Native buttons, inputs, selects, checkboxes, fieldsets, table semantics, headings, dialog semantics, status messages, accessible names, visible focus styles, and reduced-motion handling are present. Compact toolbar controls retain explicit labels and titles when visible text is constrained. The PDF contains selectable/searchable text, but it is not a tagged PDF and is not represented here as screen-reader optimized.

## Comparison history

### Pass 1

- [P2] Compact viewport overflow. At a 390px viewport, the toolbar's flex min-content width expanded the page to 584px and clipped app content.
  - Fix: constrained the toolbar to the viewport, allowed its action group to shrink, and wrapped all six actions into two visible rows on compact screens.
  - Post-fix evidence: body `scrollWidth` equals `innerWidth` at both 320px and 390px; all actions, including Customize and Save PDF, remain visible.
- [P2] Compact toolbar names could become visually hidden without guaranteed control labels.
  - Fix: every toolbar action now receives an explicit `aria-label` and title derived from its visible action name.
  - Post-fix evidence: the compact toolbar exposes New, Import, Save data, Preview, Customize, and Save PDF as named buttons.

### Pass 2

- Re-captured the 1600 x 900 editor and preview after the responsive fixes.
- Re-tested 320, 1024, and 1440 breakpoints; body-level horizontal overflow is zero at each breakpoint.
- Re-tested live editing, template switching, column visibility, and JSON import.
- No actionable P0/P1/P2 differences remain.

### Pass 3

- [P1] Duplicated line items originally reused the source row ID, which could couple edits or deletion across two rows.
  - Fix: duplication now discards the source identity and creates a fresh line ID.
  - Post-fix evidence: browser acceptance check duplicated line 1, edited only the copy, and removed only the copy; row counts moved 3 → 4 → 3 and the original stayed unchanged. A regression test covers identity and copied values.
- [P1] A pale custom brand color could make white table and balance text unreadable and could make accent-colored labels disappear on the page.
  - Fix: invoice rendering now derives a high-contrast foreground for accent backgrounds and a darkened same-hue accent for text on white. Preset colors are unchanged.
  - Post-fix evidence: unit coverage checks dark ink for white accents, white ink for cobalt, and automatic darkening for pale yellow.
- [P2] Desktop security intentionally blocks renderer downloads, so the import dialog's sample buttons could not use anchor downloads.
  - Fix: sample CSV/JSON files now use the same validated native save flow as invoice backups, with browser download fallback during UI development.
- [P2] The visually hidden import input lacked a visible keyboard-focus location.
  - Fix: the full drop zone now receives a clear focus ring through `:focus-within`, and small helper text colors were strengthened.

## Follow-up polish

- [P3] Public macOS and Windows releases should add organization-owned signing/notarization credentials before broad distribution.
- [P3] A future tagged-PDF renderer would improve screen-reader navigation beyond the current searchable, selectable text output.

## Final result

final result: passed
