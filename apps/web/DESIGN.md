---
name: Earwyrm
description: Campaign Color advertiser workspace with paper work areas and restrained native controls.
colors:
  ink: "#222b35"
  muted: "#655b5b"
  paper: "#fffdf9"
  surface: "#ffffff"
  line: "#ded5d2"
  accent: "#b82732"
  accent-strong: "#8f1d26"
  highlight: "#f5d654"
  selected: "#fff3bf"
  danger: "#8f1d26"
  shell-copy: "#ffe7e8"
  shell-line: "#e89ba1"
  hover: "#faeeed"
  control-line: "#aaa09e"
  field-line: "#928383"
  notice-ink: "#5a4949"
  notice-bg: "#f8f2f0"
  alert-line: "#b75a63"
  alert-bg: "#fff0ee"
  selection-line: "#ad8d17"
  pass-ink: "#15552f"
  pass-line: "#9ac5a5"
  pass-bg: "#e6f4e9"
  focus: "#634a00"
  evidence-bg: "#f5eeeb"
typography:
  display:
    fontFamily: '"Helvetica Neue", Arial, sans-serif'
    fontSize: "clamp(1.7rem, 3.2vw, 2.4rem)"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.035em"
  headline:
    fontFamily: '"Helvetica Neue", Arial, sans-serif'
    fontSize: "1.65rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  title:
    fontFamily: '"Helvetica Neue", Arial, sans-serif'
    fontSize: "1.25rem"
    fontWeight: 700
    lineHeight: 1.2
  body:
    fontFamily: '"Helvetica Neue", Arial, sans-serif'
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.55
  body-compact:
    fontSize: "0.95rem"
    fontWeight: 400
    lineHeight: 1.55
  supporting:
    fontSize: "0.9rem"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontSize: "0.85rem"
    fontWeight: 700
    lineHeight: 1.55
  metadata:
    fontSize: "0.8rem"
    fontWeight: 400
    lineHeight: 1.55
  button:
    fontSize: "1rem"
    fontWeight: 700
    lineHeight: 1.4
  wordmark:
    fontSize: "2rem"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "-0.04em"
  run-id:
    fontFamily: "ui-monospace, monospace"
    fontSize: "0.8rem"
    fontWeight: 400
    lineHeight: 1.55
rounded:
  square: "0"
  control: "4px"
  dialog: "6px"
spacing:
  quarter: "0.25rem"
  label-gap: "0.4rem"
  half: "0.5rem"
  control-gap: "0.65rem"
  three-quarter: "0.75rem"
  unit: "1rem"
  comfortable: "1.25rem"
  section: "1.5rem"
  major: "2rem"
  work: "2.5rem"
  wide: "3.5rem"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.surface}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "0.65rem 1rem"
  button-primary-hover:
    backgroundColor: "{colors.accent-strong}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "0.65rem 1rem"
  button-secondary-hover:
    backgroundColor: "{colors.hover}"
  button-shell:
    backgroundColor: "transparent"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
    padding: "0.65rem 1rem"
  field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0.65rem 0.75rem"
    width: "100%"
  navigation-item:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    rounded: "{rounded.square}"
    padding: "0.6rem 1rem"
  navigation-item-selected:
    textColor: "{colors.accent-strong}"
  lyric-selected:
    backgroundColor: "{colors.selected}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "1.5rem 1.25rem"
  status-badge:
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0.2rem 0.6rem"
  review-disclosure:
    textColor: "{colors.muted}"
    padding: "0.5rem 0"
  audio-version:
    textColor: "{colors.ink}"
    padding: "1.5rem 1rem"
  estimate-dialog:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.dialog}"
    padding: "0"
    width: "min(100% - 2rem, 35rem)"
---

# Design System: Earwyrm

## Overview

**Creative North Star: "Campaign Color"**

A red brand block anchors a warm white workspace with dark ink.
The interface is precise, restrained, and familiar to ad sellers. Color supplies
orientation; a workhorse sans-serif carries the working content without spectacle.

Controls retain native expectations, compact proportions, thin rules, and small
corners. The prompt, estimate, and primary action form one group. The result
list keeps playback, cost, and review status distinct.

**Key Characteristics:**

* Red branding and paper work areas
* Dark ink and approved workhorse sans-serif typography
* Flat sections, thin rules, and small control corners
* Native controls and explicit human approval safeguards

Source authority is the shipped [stylesheet](src/index.css) and
[workspace components](src/App.tsx).
[Product truth](PRODUCT.md) and the
[direction contract](.impeccable/surfaces/src-app-tsx.md) constrain their use.
The approved direction is code-led (seed `seed:317be641a22c37aa`), not a catalog
world import. No catalog `world` or `seededFrom` provenance is inferred.

## Colors

Campaign red provides orientation; warm whites and dark ink carry the work.
Frontmatter values are normative, including colors declared literally in CSS.

### Primary

* Advertiser red (`accent`) fills the wordmark, advertiser rail, and primary actions.
* Deep advertiser red (`accent-strong`) supplies action hover, links, and active navigation text.
* Pale shell copy (`shell-copy`) and shell outlines (`shell-line`) remain legible on red.
* Warm hover (`hover`) supports secondary actions and navigation without yellow decoration.

### Secondary

* Selection yellow (`highlight`) supplies browser text selection.
* Selected paper (`selected`) marks the chosen lyric, inspected audio, and estimate lyric context; it also starts the source-reveal animation.
* Selection edge (`selection-line`) defines selected content without relying on fill alone.

### Tertiary

* Danger ink (`danger`), alert edge (`alert-line`), and alert paper (`alert-bg`) identify failures.
* Pass ink (`pass-ink`), pass edge (`pass-line`), and pass paper (`pass-bg`) identify evaluation Pass, not broadcast approval.
* Focus brown (`focus`) supplies keyboard focus contrast, not a decorative accent.

### Neutral

* Dark ink (`ink`) carries primary text and the sticky working announcement.
* Muted ink (`muted`) carries supporting explanations and metadata.
* Warm paper (`paper`) grounds the workspace; white surface (`surface`) carries fields and header.
* Neutral rule (`line`), control edge (`control-line`), and field edge (`field-line`) separate content and controls.
* Notice ink (`notice-ink`), notice paper (`notice-bg`), and evidence paper (`evidence-bg`) distinguish supporting information.

**The Selection Has Meaning Rule.** Reserve yellow emphasis for selected lyrics,
linked audio, and source context, not decoration or general success.

## Typography

Display and body share the frontmatter body family. Helvetica Neue with Arial
and sans-serif fallbacks is the approved Operate workhorse, not an unresolved
font warning. Run identifiers alone use the monospace role.

### Hierarchy

* Display supplies the advertiser heading with fluid sizing.
* Headline supplies section headings; title supplies card and version headings.
* Body supplies working text with a paragraph measure capped at (72ch).
* Compact body supplies descriptions and source text; supporting supplies guidance.
* Label supplies selected state and compact review labels; metadata supplies provenance and footer text.
* Button supplies bold action labels with a tighter line height than body.
* Wordmark supplies the product name; run ID supplies technical identifiers.

Heading weights resolve to the browser's native bold (700); no font file is
bundled. Headings balance and wrap anywhere. Local heading exceptions are the
lyric hook (1.3rem), output review (1.5rem), and fourth-level heading (1.1rem).
Sign-in headings use `clamp(2rem, 5vw, 3.5rem)`. Standard form labels use body size
and bold weight; the smaller label role is not a universal form-label size.

**The Working Type Rule.** Keep the approved sans-serif for display and controls;
use size, weight, and spacing rather than an ornamental display face.

## Layout

The header puts the red brand block beside account controls on desktop and
above them on small screens. The centered work area uses one vertical flow:
prompt and estimate, then results. A thin rule separates the result list from
the composer. The textarea and estimate share a left edge; the cost breakdown
wraps at narrow widths. Review and billing details expand inline.

## Elevation & Depth

Work surfaces are flat at rest. Rules, paper tones, and selected fills establish
grouping. Only the modal receives a diffuse shadow; an active navigation item
uses an inset underline, not raised elevation.

### Shadow Vocabulary

* Modal lift uses `0 1.5rem 5rem rgb(0 0 0 / 25%)`.
* Active navigation uses `inset 0 -3px var(--accent)`.
* Modal backdrop uses `rgb(34 43 53 / 65%)`.

**The Flat Work Area Rule.** Keep working sections flat; reserve lifted depth for
the confirmation dialog.

The only authored animation reveals lyric source, from selected paper to
transparent over (0.6s) with `cubic-bezier(0.16, 1, 0.3, 1)`. It conveys context,
not status. There are no authored hover transitions. Reduced motion disables
animation and transitions and restores automatic scrolling.

## Shapes

Controls, badges, notices, collection selections, and selected content use the
control radius. Navigation remains square; the confirmation dialog uses the
slightly larger dialog radius. Rules and control borders are (1px).

Keyboard focus uses a solid outline (3px) offset (4px). On the red rail the
outline is white; the wordmark places its white outline inside (offset -6px).
Selected content has an inset selection outline (1px, offset -1px).
Native audio controls retain browser-owned geometry.

## Components

### Buttons

Bold, compact, and conventional. Primary actions use advertiser red and turn
deep red on hover. Secondary actions use white, ink, and a control edge; hover
adds warm paper and an advertiser-red edge. Shell actions are transparent with
white copy and pale outlines, turning deep red on hover.

Buttons have a minimum height (2.75rem). Disabled controls use opacity (0.6) and
a not-allowed cursor; hover treatments exclude disabled buttons. Shell action
labels use (0.85rem), changing to (0.8rem) on mobile. General mobile navigation
and session actions use (0.85rem).

### Inputs / Fields

Familiar native inputs and textareas retain their semantics. Text fields have
a field edge, white fill, and minimum height
(2.75rem). Textareas start at (5rem) and resize vertically. Placeholder text uses
muted ink at full opacity. Checkboxes use advertiser red and measure (1.1rem).
Focus follows the shared outline; disabled fields use native behavior.

### Navigation

Text buttons wrap without clipping. Active buttons expose `aria-pressed` and
the red inset underline; hover adds warm paper. Access administration stays
separate from the composer.

### Chips / Status

Small outlined badges use bold metadata-sized text (0.8rem), a control radius,
and no pill silhouette. Pending and lyric screening badges stay neutral.
Evaluation Pass and Fail use their semantic palettes and visible status words.
Screening, render readiness, and human evaluation are separate from approval.

### Cards / Containers

Working containers are open sections separated by rules. Notices use padding (0.85rem 1rem),
supporting text, and a neutral border. Alerts use unit padding and failure colors.
Do not turn every section into a raised card.

### Review Disclosure

Native `details` and `summary` hold optional billing and audio details.
Review summaries are muted supporting text. Preserve the native disclosure
marker, keyboard behavior, and accessible content relationship.

### Lyrics and Audio Source

Only screened, accepted lyrics can produce a jingle. The result shows the
linked lyrics and protected playback controls. A ready demo still requires
approval before broadcast.

Protected audio loading and one-player-at-a-time behavior remain application
responsibilities. Sidecar examples illustrate appearance, not authorization.

### Generation Costs

Show the estimated maximum and its provider breakdown beside **Generate
jingle**, without a modal or checkbox. In the result list, show recorded
charges separately and label missing charges as pending or unavailable.

### Permissions and Human Review

Keep sign-in and application-access boundaries, spending limits, and accessible
progress and error announcements. Preserve protected access to audio and usage
evidence.

## Do's and Don'ts

### Do

* Do use red branding, paper work areas, and dark working text.
* Do preserve native inputs, audio controls, and disclosure.
* Do pair selection color with explicit state text and accessible control state.
* Do show estimated spend before generation and display actual charges separately.
* Do distinguish screened lyrics and generated audio from broadcast approval.
* Do respect reduced motion and retain visible keyboard focus.

### Don't

* Don't use yellow as decoration or as a substitute for approval.
* Don't add raised shadows to ordinary work sections.
* Don't replace the approved workhorse type with an ornamental display face.
* Don't turn generated, screened, or playable status into broadcast approval.
* Don't treat the sidecar's illustrative tonal ramps as additional shipped colors.

Not canonized or repaired: the history run selector also uses selected paper.
That existing source behavior is not a license to extend yellow beyond lyric and
audio provenance. No application changes were authorized. The approved Helvetica
warning is not a defect. Browser evidence is synthetic and isolated; it does not
prove real cloud execution or billing.
