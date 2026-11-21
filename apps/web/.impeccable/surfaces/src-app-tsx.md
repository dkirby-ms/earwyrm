---
version: 1
slug: "src-app-tsx"
primary_target: "src/App.tsx"
related_targets: ["src/index.css","src/BriefEditor.tsx"]
---

## Scope

Mode: Operate. Ad sellers create and compare jingles for one advertiser.
Replace the visual identity and connect selected, eligible lyrics to audio.
Retain permissions, paid confirmations, screening, evaluation, and secondary batch operations.

## Direction contract

THESIS: An advertiser-first workspace connects brief, chosen lyrics, and audio.
Refuse the technical comparison table as the primary review experience.

OWN-WORLD: Campaign Color uses a flat red navigation shell (#B82732), white work
areas (#FFFDF9), dark ink (#222B35), and yellow (#F5D654) reserved for selection.
Workhorse sans typography, compact controls, thin neutral rules, and small corners.

STORY: Open an advertiser, inspect its brief, generate and choose screened lyrics,
confirm any paid voice work, then listen and review linked audio versions.
Render progress, human evaluation, and broadcast approval remain distinct.

FIRST VIEWPORT: A roughly 264px advertiser rail anchors a wide, fluid work area.
The advertiser heading and brief summary sit above Create and Listen & review.
Review leads with playable version rows, selected lyric source, and review action.
Signature interaction: choosing a lyric visibly marks it in yellow; its exact,
server-owned identity follows the estimate, audio generation, and resulting version.
Use a brief nonessential reveal for the selected source; respect reduced motion.
Mobile collapses advertiser navigation and stacks version controls without clipping.

FORM: Campaign Color, grounded direction 5 of 7, seed:317be641a22c37aa.
Approved sketch: .impeccable/mocks/decision/campaign-circular.html.
Code-led; no approved image comp or raster assets are required.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Admin direction contract

THESIS: Administrators select one operational task at a time instead of navigating
an undifferentiated page of unrelated controls.

OWN-WORLD: Retain Campaign Color: a flat red rail, warm paper, dark ink, workhorse
sans, neutral rules, and yellow for selection, using familiar native controls.

STORY: An administrator checks the diagnostic ID, understands the recorded outcome
and provider evidence, then separately manages budgets and application access.

FIRST VIEWPORT: A red 264px task rail anchors a spacious lookup area. A diagnostic
ID field and check action precede an explicit result with stage and provider
evidence. The signature move is the selected task appearing on a white field within
the red rail. On mobile, navigation and content stack without horizontal overflow.

FORM: Task rail, grounded direction 6 of 7, seed:94a148e642ce6896.
Chosen sketch: .impeccable/mocks/decision/admin-task-rail.html.
Code-led, selected by the user in the surface decision round.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Implementation boundaries

Persist server-owned lyric results and select only accepted drafts; do not turn
held results into renderable text. Bind paid estimates to immutable lyric content.
Preserve batch rendering as a secondary path, without silently applying a single
advertiser's lyric choice to a batch. Keep protected playback and source evidence.
Handle empty, loading, failed, unavailable, ready, and reconciliation-blocked states.
Preserve all admin permission, budget, reservation, and dialog operations.
