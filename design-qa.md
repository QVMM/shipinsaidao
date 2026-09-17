# Design QA — 方案 1「东方科研指挥舱」高度与主视觉复核

## Comparison target

- Source visual truth: `/Users/liuyixing/.codex/generated_images/01a0aaf9-80e8-7063-a3dc-33c8302357c4/exec-b0ebaf37-b790-4fb9-8684-448275bd9599.png`
- Normalized source crop: `/Users/liuyixing/.codex/visualizations/2026/09/16/01a0aaf9-80e8-7063-a3dc-33c8302357c4/tihua-build-qa/concept-stage-crop.png`
- Source crop pixels: `1041 × 585`
- User-marked evidence: `/var/folders/gh/b2f_yv7j1y3dx23jh8835rb80000gn/T/codex-clipboard-d75cbebb-39f6-428d-882b-b80413d71ae1.png`
- Final browser capture: `/Users/liuyixing/.codex/visualizations/2026/09/16/01a0aaf9-80e8-7063-a3dc-33c8302357c4/tihua-build-qa/stage-user-viewport-hero-final.png`
- Detection-card correction capture: `/Users/liuyixing/.codex/visualizations/2026/09/16/01a0aaf9-80e8-7063-a3dc-33c8302357c4/tihua-build-qa/process-after-fix.png`
- Final normalized comparison: `/Users/liuyixing/.codex/visualizations/2026/09/16/01a0aaf9-80e8-7063-a3dc-33c8302357c4/tihua-build-qa/stage-reference-vs-final.png`
- CSS viewport: `1512 × 829`; browser capture backing pixels: `1890 × 1035`; the implementation region was cropped to `945 × 518` and compared against a same-size normalized source crop.
- State: local offline runtime; focus batch `蓟化-2026-0812`; the broken evidence seal correctly keeps the verdict at `证据封存待核验` instead of copying the mock's qualified state.

## Findings and fixes

1. **P1 — Short-wide layout used rigid heights.** At `1512 × 829`, the trace path was compressed while the lower evidence row was too tall. Replaced fixed tracks with proportional `fr` tracks, yielding approximately `269 / 205 / 238px` for hero, trace path, and evidence.
2. **P1 — Left focus record was visibly clipped.** The focus record overflowed by `43px`, and the chicken-house card also overflowed. Rebalanced the left tracks and tightened only non-critical camera spacing; both regions now report zero overflow.
3. **P1 — Portrait thistle photo created a hard vertical seam.** The source asset did not fit a landscape hero. Generated a project-local `2167 × 726` landscape milk-thistle image with right-weighted subject placement and continuous dark-green negative space, then used it edge-to-edge.
4. **P2 — Major-region rhythm drifted from the selected concept.** Increased the trace path height, reduced the oversized lower row, and vertically centered the seven-step rail so the page reads in the same hero → provenance → evidence rhythm as the source.
5. **P2 — Height fixes were breakpoint-specific rather than fluid.** Replaced the short-wide fixed values with bounded fractional tracks so the composition scales between `761px` and `900px` tall instead of matching only one screenshot.
6. **P1 — Detection details were hidden inside a non-overflowing outer card.** The inner grid auto-created a third row for the verdict and collapsed its second column to `0px`; the conditions row then extended `13px` past the hidden dock. Explicitly placed sample and verdict in row one, assay steps in row two, and conditions below. All internal regions now report zero overflow.
7. **P1 — The speaking avatar jumped between two independently generated faces.** Replaced the exaggerated open-mouth frame with a restrained lip-parting frame, limited the blend to a feathered mouth oval, added RMS hysteresis for real audio, and replaced the fixed `350ms` blink-like toggle with a syllabic short/long rhythm for browser speech.
8. **P1 — The embedded assistant clipped its composer at a 1512 × 829 browser viewport.** The panel exceeded its available height by `13px` because the scrollable conversation log retained a `62px` minimum while every following control remained in the same hidden-overflow flex column. The log is now the shrinkable/scrollable region and the composer is explicitly non-shrinking; the form and visible voice-status line remain inside the panel.

## Required fidelity surfaces

| Surface | Final result | Evidence |
| --- | --- | --- |
| Fonts and typography | Passed | Brand, verdict, and section hierarchy remain consistent with the selected concept; no critical copy clips or wraps unexpectedly at the target viewport. |
| Spacing and layout rhythm | Passed | Final browser measurements: hero `268.7px`, trace `204.5px`, evidence `237.8px`; focus record and chicken-house overflow are both `0px`. |
| Colors and tokens | Passed | Deep pine panels, warm ivory verdict text, jade evidence states, and brass actions retain the source's restrained scientific-control-room direction. |
| Image quality and asset fidelity | Passed | The hero now uses a dedicated local landscape thistle asset with continuous edge-to-edge imagery and no hard image boundary; flock, report, laboratory, and assistant assets remain local and offline-capable. |
| Speaking-avatar motion | Passed | The closed portrait remains fixed; only a feathered lip region crossfades over `110ms`, while timed speech uses varied syllabic phases and analyser speech uses smoothed open/close thresholds. |
| Copy and content | Passed with intentional state difference | No Demo language is present. The mock says qualified, while the product truthfully shows a hold because the current evidence seal is broken. |

## Comparison history

- **Pass 0:** User evidence showed a hard hero-image boundary, clipped left records, compressed provenance, and unbalanced lower cards. Result blocked.
- **Pass 1:** Added a short-wide rule that prevented bottom clipping, but it still used rigid heights and left the focus record clipped. Result blocked.
- **Pass 2:** Converted center and left tracks to bounded proportional sizing. All measured regions fit, but the portrait hero asset still differed materially from the concept. Result blocked.
- **Pass 3:** Added the dedicated landscape thistle asset, captured the same viewport in the in-app browser, and compared the normalized source and implementation in one image. No remaining actionable P0/P1/P2 issue in the user-marked regions.
- **Pass 4:** A later annotation exposed inner clipping in the detection card that the outer-card check missed. Added inner-region assertions, corrected the grid placement, and verified the verdict plus all six condition cells remain inside the dock. No remaining actionable issue in that card.
- **Pass 5:** Reworked the assistant's speaking motion after the user identified an unnatural mouth jump. Rejected the original wide-open frame, localized the replacement to the lips, and added a browser regression that verifies the closed portrait never changes during mouth animation.

## Verification

- Browser-rendered implementation inspected at `1512 × 829`.
- Primary page state, evidence links, AI session controls, full-screen analysis entry, and voice controls remain present.
- Browser console errors: none.
- Focus record overflow: `0px`; chicken-house overflow: `0px`; center-region overflow: `0px`.
- Detection dock overflow: `0px`; detection bay overflow: `0px`; conditions remain `13px` above the dock bottom.
- Speaking-avatar regression passes at both `1440 × 900` and `1041 × 1001`: local lip frame loaded, radial mask active, `110ms` crossfade active, and the closed portrait transform remains `none` while speaking.
- At `1512 × 829`, the embedded assistant panel reports zero overflow and keeps both the `36px` composer and a visible voice-status line above the viewport edge.
- Automated result: `24` unit tests, `14` functional/component/browser tests, and `4` visual regression tests passed; lint and production build passed.
- The final source/implementation comparison is recorded in `stage-reference-vs-final.png`.

final result: passed
