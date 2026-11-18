---
title: Render and evaluate audio
description: Configure backing sounds, run the paid Speech comparison, and record POC evidence.
---

[Back to the README](../../README.md)

Use the [offline quickstart](../../README.md#try-it-without-azure) to render
the [three synthetic advertiser briefs](advertiser-briefs.json). Use the
[web workspace guide](web-app.md) for browser playback and review.

## Choose the backing sound

The CLI, web API, and Melody tool use an oscillator backing by default on a
host. To use General MIDI patches in the WAV backing, install FluidSynth
and set `EARWYRM_SOUNDFONT` to a local `.sf2` file. The backend container
ships with the [FluidR3 GM bank and its package notices](https://metadata.ftp-master.debian.org/changelogs/main/f/fluid-soundfont/fluid-soundfont_3.1-5.3_copyright).
A configured renderer failure is reported rather than silently falling back.

Each run keeps WAVs, a MIDI score per brief, and composition and evidence
metadata. The CLI writes to `renders/` by default; use `--output` to set a
different root. Keep its `.melody-history` to preserve comparison against prior
output. Music uses a recorded seed and whole-bar forms, not a fixed spot
length. The mono 24 kHz PCM16 mix is a review demo, not broadcast mastering.

## Render with paid Speech

Use an existing paid Azure Speech S0 resource only after spending is approved.
Supply `SPEECH_KEY` and `SPEECH_REGION` in the process environment. Keep the
key out of command arguments, evidence files, and source control.

Create a local JSON evidence file with these fields:

| Field | What to record |
|---|---|
| `tier`, `region` | `S0` and the configured resource region |
| `resource_reference` | Non-secret reference to the resource and tier evidence |
| `usd_per_million_characters` | Positive rate for that account, region, and voice |
| `rate_source`, `rate_checked_on` | Pricing evidence and the date checked (YYYY-MM-DD) |
| `commercial_use_basis` | A reviewed rights-evidence reference, or `null` if not established |

See [Azure Speech pricing](https://azure.microsoft.com/en-us/pricing/details/speech/)
and the [synthetic voice FAQ](https://learn.microsoft.com/azure/ai-services/speech-service/faq-tts).
The following cap is an example, not a price quote:

```bash
npm run render -- --azure \
  --evidence renders/speech-evidence.json \
  --max-cost-usd 0.05
```

Preflight checks the evidence and cap. The CLI makes one stock-voice request
per brief and reuses it for two treatments: a vocoded version and a spoken
tagline over the instrumental bed. Instrumental-only runs do not test vocal
quality. If a paid run times out or is interrupted, reconcile usage before
retrying.

## Evaluate output

Listen before checking the [expected brand and CTA](expected-brand-cta.json).
For a custom brief, compare against the input facts. Record the transcription
and a usability rating for each version, and label a solo review as unblinded
self-evaluation, not independent listener feedback.

For the original three-brief POC screen, a passing result matched both the
brand and CTA (ignoring case and surrounding whitespace, allowing only
preapproved CTA variants), rated **usable with minor edits**, documented rights
for every component, rendered in under five minutes, and cost less than
$0.50 in metered charges per render. Record fixed hosting costs separately.
Missing required evidence is **Pending**, not **Pass**; a known failed criterion
is **Fail**. These are POC evaluation criteria, not release approval.

Similarity screening covers a small reference set and retained outputs,
not the commercial music catalog. Disclose AI-generated material and obtain
human producer, advertiser, and rights review before distribution or broadcast.
