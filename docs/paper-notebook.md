# สมุดกระดาษ: implementation and handoff

The notebook opens in a full-screen paper workspace. Text boxes, pressure-aware vector strokes and Storage image references share 900 × 1273 page coordinates. On desktop, pages are visible at left; on phones the page drawer is toggled from the toolbar. Pin/archive/export/delete remain in the notebook menu. The status and explicit Save button reflect cloud acknowledgement; offline work remains queued locally.

## Ownership and modules

- `paper-core.js`: validated version 1 page/object schema, deterministic legacy conversion, geometry, bounded per-page history, three-way object merge.
- `paper-render.js`: escaped SVG/text rendering and ruled/grid/dot templates. No saved HTML is trusted.
- `paper-editor.js`: pointer input, text editing, selection/lasso, moves and resize, gestures, image hydration and lifecycle.
- `paper-view.js`, `paper.css`: responsive workspace.
- `paper-legacy.js`: read-only Quill original, with original rich formatting and image references.
- `notebook-core.js`: preserves and validates optional `note.paper`; search/export/import include paper text and images.
- `study-space.js`: authoritative shared Supabase workspace, revision compare-and-swap, autosave/explicit `flush`, local recovery cache. Existing migrations/receipts remain intact.

## Data contract and limits

A note retains its original `delta` unchanged and optionally has `paper: {version:1,pages:[{id,template,objects}]}`. Objects have stable IDs, type, x/y/w/h. Strokes retain tool, color, width, normalized points and pressure. Text retains text, size, bold, color. Images reference Storage IDs, not base64 payloads. Template changes do not transform content. Eraser removes entire strokes; selected objects may be moved/resized/duplicated/deleted.

Legacy conversion creates deterministic IDs across devices. Converted text is plain text; the original styles and complete original Delta remain available from “ดูต้นฉบับเดิม”. If the original is too large to convert, it remains intact in the original viewer and a new blank paper workspace is offered with an explicit notice.

The existing Edge API writes the whole workspace and caps requests at 4 MB. This version deliberately enforces 3.8 MB of UTF-8 JSON before replacing notebook state or sending, with headroom for transport metadata. A notebook supports 100 pages / 120,000 sampled ink points, but the workspace byte limit may be reached first. Do not advertise unlimited notes or page-level cloud persistence. Images remain in Storage (existing 5 MB/image limit). Large rejected changes can be exported using “สำรองงานค้าง”; that recovery file imports as a new note, retaining the saved original. Rejected drafts are cached separately on the device where storage is available.

## Sync and failure behavior

The existing public shared workspace is retained as explicitly requested: all visitors see and may modify the same data, without login or per-device workspace keys. Do not introduce service-role secrets into the browser.

Remote refresh updates the paper model without destroying the active editor. While a gesture or text edit is underway it defers refresh and merges independent object changes on commit. Concurrent edits to the same object reject rather than silently overwrite. Workspace-level revision conflicts retain both snapshots through the existing conflict-resolution screen. Local history refuses to replay over an externally modified page. Deletions use an in-page confirmation that works when native confirm dialogs are unavailable.

## Verification

- `npm run check`, `npm test`: schema, migration, original preservation, image references, undo conflict protection, capacity, offline flush and two-device cloud roundtrip.
- `node tests/browser/paper.mjs` after installing Playwright 1.62.1 and its Chromium/WebKit browsers: actual DOM/pointer flows against an intercepted Supabase endpoint, never production data. Separate browser contexts, desktop and iPhone viewport, text/ink, images, pages, confirmation, offline and remote refresh. Screenshots uploaded by `Notebook browser checks` CI.
- Browser emulation does not certify physical Apple Pencil latency, palm rejection or a real iPhone keyboard; those need physical-device checks.

## Follow-up work

OCR, audio, PDF import, multipage PDF export, richer formatting inside each text box, page reordering, offline image uploads and large-document/page-level backend persistence are separate follow-up work. Current print exports the visible page only. Keep original notes and existing public workspace identifiers intact when adding those features.
