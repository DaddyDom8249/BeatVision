# Arcane Cinema storyboard reconstruction

Editable design: [BeatVision / Arcane Cinema](https://www.figma.com/design/HuYlkHczDthwcdR3rRwWbo).
Desktop node `2:17`; mobile `2:18`; Classic comparison `2:19`.
Local reusable scene-card variants, status, navigation, preview and Director components are on the same canvas. These are editable Figma frames, text, instances and local variables, not flattened screenshots. Classic's Figma frame is a comparison specimen; the browser captures below are the authoritative unchanged-Classic comparison.

## Implemented

- Dynamic scene grid shared by Visual Plan and Production Workspace. Large saved-image thumbnails, accurate fractional timestamps and durations, camera/visual direction, locked/draft state and independent selection.
- Subtle sequential connections, selected-frame emphasis, wide selected-scene image/video preview, native playable video controls, measured media duration and uncovered scene time.
- Expandable Scene Director with saved direction/context. The original scene editor and save path remain mounted, preserving unsaved drafts across appearance changes. Approved scenes remain disabled; revisions use the existing workflow.
- Existing production actions, media history, approvals and provider provenance remain below the storyboard. The shared Arcane stylesheet carries the identity across the existing studio pages without duplicating their application logic.
- Classic stylesheet SHA-256 remains `cd0bd4cf0f25fbe5f29f6e8bc1aab59d6701486902d40845911da13f07835b02`. Appearance persistence/provider architecture is reused.
- Manrope is self-hosted for Arcane functional text, with its OFL license. Existing licensed blackletter/decorative artwork remains. Decorative artwork is never presented as a scene result.

Only saved approved images are fetched by the board. Selected production candidates can be previewed with their actual status through the existing workspace. Motion lookup occurs on explicit Motion selection and calls only saved-media playback refresh actions. No generation, approval, job-state, schema, provider-contract or authentication change is part of this reconstruction.

## Visual evidence

| View | Design | Implemented |
| --- | --- | --- |
| Desktop | [Figma capture](figma-desktop.png) | [Storyboard](implemented-desktop.png) |
| Mobile | [Figma capture](figma-mobile.png) | [Storyboard](implemented-mobile.png) |
| Production | Same reusable composition | [Desktop](production-desktop.png), [mobile](production-mobile.png) |
| Classic | [Before](classic-before-desktop.png) | [After](classic-after-desktop.png) |

The reference's scene-grid → preview → Director composition is implemented with restrained frames/connections. Functional controls and database-derived text replace illustrative design labels. Mobile thumbnails use a shorter, responsive media region to leave room for readable timing and shot text. Desktop uses three columns, mobile two, and screens under 359px one. Real scene count is never fixed to the reference's nine cards.

Screenshots use explicitly synthetic project/scene/approval records. The only actual media is the owner's previously supplied saved Ghast MP4 and its first frame. Its 1.90-second duration is real; fixture approval labels do not assert that this clip is approved in production. Seven empty cards deliberately remain empty. No reference illustration, stock scene replacement or fake motion is used. The source video is not committed.

Personally inspected desktop/mobile captures against the Figma compositions and reference, plus production and failure-state captures. The large image region, sequence, selected frame, preview and Director are all visible. Corrected mobile containment, production Director focus, expired-image fallback and candidate-preview isolation before publication. [Broken image](state-broken-mobile.png), [missing images](state-empty-mobile.png), [read failure](state-error-mobile.png), and [real playback](real-media-playback-fixture.png) are included.

## Executed verification

Baseline checkout: `feature/arcane-cinema-theme` at `9a1088321b713c733f60221438448cf12106b8b3`; main observed at `f2e137584d18ed222ca702b89cd8430c3b06b506` before and after development. Baseline: 289 tests, build and production audit passed.

| Command/check | Result |
| --- | --- |
| `npm test` | 293 passed, zero failures; exit 0 |
| `node --test scripts/test/integration-repair-20261011/*.test.mjs` | 6 passed; exit 0 |
| `npm run build` | TypeScript project checks and Vite production build pass; exit 0 |
| `npm run production-audit` | PASS; exit 0 |
| `git diff --check` | exit 0 |
| `ARCANE_REUSE_BASELINE=1 node scripts/qa/arcane-cinema-browser.mjs` | Chromium 153 PASS; details in [browser-results.json](browser-results.json) |

Three storyboard acceptance regressions first failed against the old board, then passed. A fourth regression reproduced an expired approved thumbnail hiding a separate production candidate and verifies the fix plus honest failure state.

Real Chromium verified 1440/768/390/360/320px without document or main-content horizontal overflow; sequence navigation; keyboard End; locked editor review/focus; Appearance switching and reload persistence; OS reduced motion; unsaved draft preservation; exactly one intercepted draft-save update; honest empty/broken/read-error states. Production at 1440/390px also verified shared scene selection, Director focus and existing controls without creative writes. Arcane's mobile pipeline wraps into two rows: all six stage buttons stay fully visible with 44px targets. Classic retains its original navigation.

Classic's original 1440px screenshot and candidate screenshot have the same dimensions and **zero changed RGB pixels**. The retained `classic-before-desktop.png` was captured from the pre-change build before `dist` was replaced. The browser script supports `ARCANE_BASELINE_URL` for an independently served baseline or `ARCANE_REUSE_BASELINE=1` to compare against that retained capture.

Real MP4 decoded at 704×512, duration 1.9 seconds, native controls enabled, no media error; playback advanced, pause worked, selecting another scene removed the old video. All backend requests were intercepted locally. No real user authentication, paid provider request, generation, production database write or creative approval was performed.

No dependency was added to the application. Browser tooling was installed outside the checkout. Existing large JavaScript bundle warning remains (about 931 kB uncompressed); there is no repository lint command.

## Scope and remaining limits

Implemented and locally tested; preview publication is recorded separately below when available. This is not a production release. Main must remain unmerged and the production domain must not be reassigned.

Authenticated live project/media access, cross-origin playback on the eventual preview, account preference persistence against real Supabase, physical Android/iOS and all-page authenticated production workflows remain **UNVERIFIED**. Local fixtures prove UI behavior and real-media decoding, not provider availability or final assembly. Other studio screens receive the shared appearance layer; this verification concentrates on the requested storyboard and production centerpiece.

Reused Jules session `13242114808289394820` only; its returned completed output references earlier PR #81 and is not evidence for this candidate. No new Jules task or additional worker was created; candidate implementation and verification were performed locally.

## Published preview and CI

Implementation commit: `4af36dca8e575772079743ca74a93ba1fa62d9e3`, tree `e2bbb877b1530131e9daec35a0630131dc1cd206`. All 27 published blob hashes and the complete Git tree match the tested local tree exactly. Local HTTPS push had no configured credentials; the connected GitHub app published the same files and advanced the existing branch normally, with an expected-head check and no force push.

[Preview](https://beat-vision-g5oaxy4eu-beat-vision.vercel.app/) — deployment `dpl_2rgEGfUN21QHkC4R9YPwxX8HoWjg`, **READY**, Vite, preview target (API `target: null`), existing Hobby team/project. Remote logs confirm clone of `4af36dc`, TypeScript + Vite build success and deployment completion (about 17 seconds). No production domain assignment or promotion.

GitHub Actions all succeeded for that exact commit: Production CI [38737019692](https://github.com/DaddyDom8249/BeatVision/actions/runs/38737019692), Generation enqueue security [38737020168](https://github.com/DaddyDom8249/BeatVision/actions/runs/38737020168), Legacy storage ownership security [38737019730](https://github.com/DaddyDom8249/BeatVision/actions/runs/38737019730), Database migration replay [38737019807](https://github.com/DaddyDom8249/BeatVision/actions/runs/38737019807).

Vercel protects preview URLs with its existing authentication setting. Using the connected deployment tool's temporary share access, the actual deployed app rendered in the browser. Appearance changed to Arcane, its radio selection and `html[data-theme="arcane"]` were verified, and reload retained it. The signed-out landing page truthfully reports missing BeatVision auth; no account or production credentials were entered. Live authenticated storyboard/media and real-account preference sync are still UNVERIFIED. Main remains `f2e1375`; the production domain still resolves to separate deployment `dpl_3BKMriaiWYF44CJ3qBeqviSpgXnW` / `a02f746`, not this preview.

An independent read-only review was sent to the same existing Jules session for `4af36dc`; no candidate review result has been accepted. This publication record is a documentation-only follow-up to the previewed implementation.

Final mobile follow-up: all six Arcane workflow stages now wrap into two rows with 44px targets instead of a clipped horizontal strip. Figma mobile and implementation captures are refreshed. Browser bounds/text-containment checks pass at390/360/320px, and the full293 tests,6 integration checks, TypeScript/build, audit and browser suite were rerun successfully. Classic still has zero changed pixels. The preview above documents the initial reconstruction; PR #108's current description links the latest preview including this correction.
