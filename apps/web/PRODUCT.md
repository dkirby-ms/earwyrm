---
title: Earwyrm product context
description: Confirmed audience, workflow goals, and implementation boundaries for the web app.
---

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Ad sellers creating and comparing jingles for an advertiser.

## Product Purpose

Turn an advertiser brief into audio demos that a seller can listen to and review
without losing the advertiser's context.

## Operating Context

The confirmed workflow is advertiser-first: open a brief, create jingles, then
listen to and review its versions. The requested redesign replaces both the
workflow presentation and the visual identity.

## Capabilities and Constraints

* Preserve Microsoft Entra sign-in, application permissions, protected audio,
  explicit paid-request consent, server-computed voice estimates, usage
  reconciliation, and human evaluation.
* Keep administration and technical evidence available outside the main creative
  path.
* Capabilities include sample and custom briefs, saved lyric options,
  instrumental previews, and server-gated paid voice rendering.
* Accepted lyric drafts can be selected for voice generation. The server
  validates owner-scoped saved options, binds estimates to their exact identity
  and text, and retains the lyric source with each audio version.
* Secondary batch tools retain the original brief-script rendering path.
* A generated or technically accepted demo is not broadcast approval.
* Available musical styles, voices, and durations must reflect server-supported
  capabilities, not controls invented for the redesign.

## Brand Commitments

Retain the Earwyrm product name. The approved Campaign Color direction uses a red
advertiser rail, white work areas, dark ink, workhorse sans-serif typography, and
yellow reserved for selected lyrics and their audio source.

## Evidence on Hand

* [Current workspace](src/App.tsx)
* [Brief entry](src/BriefEditor.tsx)
* [Current API types](src/types.ts)
* [Product proposal](../../docs/design-proposal.md), which includes future
  capabilities and must not be treated as proof of implemented features

## Product Principles

* Keep the advertiser and brief visible through creation and review.
* Make listening and comparing the central review tasks.
* Explain paid actions before submission.
* Distinguish render progress, lyric screening, human evaluation, and broadcast
  approval.
* Preserve the selected lyric's identity from generation through audio output.
