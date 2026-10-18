# Lane A a_encoder_merge report
Prompt: prompts/a_encoder_merge.md
Status: done

Found: Progress was empty. encodeWebp and sha256Hex were still private in campaign/images.ts, and cover_image.ts still had its own copies. claims.md lists market/place.ts, not cover_image.ts.
Finished: both functions are exported from campaign/images.ts. cover_image.ts imports them and the local copies are deleted. COVER_LIMITS, COVER_QUALITIES and prepareCover's messages are unchanged. A bitmap with no pixels returns null, and prepareCover already says "This browser cannot encode WebP."
Backed out: nothing.

## Changed files
- apps/web/src/campaign/images.ts: encodeWebp and sha256Hex are exported. Their bodies are unchanged.
- apps/web/src/workspace/market/cover_image.ts: import lines only, plus the deleted local encodeWebp and sha256Hex. D's stream still names market/, so nothing else in that file was edited. place.ts was not touched.
- tests/web/encoder_merge.test.js: a 0-pixel bitmap encodes to null; prepareCover and prepareImage both refuse with "This browser cannot encode WebP." and neither builds a canvas.
- directives/reports/a_encoder_merge.md: this report.
- directives/prompts/a_encoder_merge.md: Progress lines.

## Gates
npm test:      pass (1879 pass, 0 fail, 38 skipped)
npm run check: pass (manifesto: clean)
typecheck:     pass (tsc --noEmit -p apps/api)
npm run build: pass (vue-tsc -b and vite build)

## Contract published
none

## Needs from others
none

## Questions for Johnny
none
