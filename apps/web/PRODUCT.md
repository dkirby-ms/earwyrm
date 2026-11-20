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

Turn a plain-language description into an original jingle demo with AI-composed
music and synthetic voice.

## Operating Context

Describe the jingle, check the estimate, generate, and listen on the same page.
The description can include a business name, message, mood, or exact call to
action. No structured brief or upload is required.

## Capabilities and Constraints

* Preserve Microsoft Entra sign-in, application access, and protected audio.
* Enabled users can generate without a paid-request checkbox. Server service
  settings and spending limits still apply.
* The server screens lyrics and renders the AI-composed score with voice. If a
  required stage fails, it does not substitute seeded music.
* Show generation estimates separately from reconciled provider charges. An
  unverified charge is not a zero charge.
* Keep access administration separate from creation.
* A generated or technically accepted demo is not broadcast approval.
* Available musical styles, voices, and durations must reflect server-supported
  capabilities, not controls invented for the redesign.

## Brand Commitments

Retain the Earwyrm product name and Campaign Color palette: red branding, warm
white work areas, dark ink, and workhorse sans-serif typography.

## Evidence on Hand

* [Current workspace](src/App.tsx)
* [Current API types](src/types.ts)
* [Web workspace guide](../../docs/audio-poc/web-app.md)

## Product Principles

* Make the prompt and the cost of generating visible together.
* Keep listening and reviewing on the creation page.
* Distinguish render progress, lyric screening, human evaluation, and broadcast
  approval.
