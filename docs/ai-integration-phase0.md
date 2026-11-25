# AI integration — phase 0 findings (2026-11-25)

Status: isolated layout prototype only. Not approved for production. No production database calls, migrations, credentials, or note changes.

## Observed implementation
- Main uses static browser ES modules in dist/, Vercel build runs npm run check && npm test.
- dist/shared-space.js intentionally exposes a shared workspace capability; every visitor can read/write/delete that workspace. It is NOT an AI-only credential.
- dist/personal-client.js calls the Supabase personal-study Edge Function for workspace and image storage.
- Handler uses workspace-level revision compare-and-swap and 4 MiB request / 5 MiB image limits. Existing browser docs describe a 3.8 MB workspace guard. Inspect live configuration before release.
- Paper supports versions 1 (pages) and 2 (continuous). Images reference Storage IDs. Existing insertImages positions each image relative to viewport, so a batch may overlap.
- Preview builds use the existing browser configuration unless explicitly isolated. Do not use a normal preview to write test notes to the production workspace.

## Platform gate
- OpenAI custom MCP write: Business/Enterprise/Edu; personal Plus not listed. https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt
- GPT Actions historically support conversation file references, including generated images (temporary links). https://developers.openai.com/api/docs/actions/sending-files
- Current documentation says personal accounts cannot create new GPTs; standard GPT retirement Dec 11 2026. https://help.openai.com/en/articles/20001519-custom-gpt-retirement-and-migration-faq
- API billing is separate from Plus. No paid service authorized. No end-to-end Project file transfer proven.
- Prioritize native batch import UI, then revisit private/published plugin eligibility. Do not advertise direct ChatGPT writes.

## Prototype
dist/ai-append-layout.js is pure layout, not a network endpoint. Six in-memory assertions executed: original unchanged, four ordered non-overlapping images, aspect ratio, identical request no duplicates, conflicting request rejected, paged original retained. tests/ai-append-layout.test.js adds Node cases with existing validatePaper; full CI not yet verified.
Layout request IDs alone are not durable API-level idempotency: edits/deletions or concurrent calls require server-side receipts and CAS. Upload bytes, MIME verification, authorization, rate limits, audit, storage cleanup, readback, undo, and browser integration remain outstanding.
No application entrypoint imports this prototype yet; no behavior change on existing UI.

## Next implementation gate
1. Isolate test backend (fixture/intercepted cloud first). Never use production shared capability as an AI secret.
2. Wire native batch selection/reordering/preview and a single editor commit, using existing storage and revision handling; verify cloud acknowledgement and readback. Preserve paged and continuous undo/redo; handle orphan uploads.
3. Only after a supported external connection is proven, implement scoped server credentials, note lookup/read, append-only routes, transactional receipts and real file bytes; deny unauthorized requests.
4. Run npm run check, npm test and browser QA; verify physical devices separately. No merge to main until approval and regression checks.
