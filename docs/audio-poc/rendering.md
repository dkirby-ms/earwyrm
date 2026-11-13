---
title: Run the local audio proof
description: Render original MIDI and synthesized instruments with paired Azure vocal treatments and auditable evidence
---

## What this produces

The local Python renderer uses only original note patterns, harmonic oscillators,
a synthesized kick and seeded noise. It loads no samples or SoundFonts and has
no cloning, custom voice or artist-imitation interface.

Each run gets a unique directory under `renders/`. Each brief gets a MIDI score,
JSON notes, a script, an alignment map and an evidence manifest.

* Instrumental-only mode exports three 30-second instrumental WAVs without
  network access. These are not vocal proof results.
* Azure mode makes three stock-voice requests, one per brief, and exports six
  30-second WAVs: one vocoded and one instrumental-bed/spoken-tagline version
  per brief. Source and aligned speech WAVs are also retained for diagnosis.

Outputs are mono 24 kHz PCM16 review demos, peak-normalized to -1 dBFS.
This is not LUFS normalization, broadcast mastering, melody-similarity clearance
or a claim of natural singing. Listen at a comfortable volume.

## Install and render without Azure

From the repository root, with Python 3.11+ and
[uv](https://docs.astral.sh/uv/) installed:

```bash
uv sync --locked
uv run python -m audio_poc --instrumental-only
```

The log identifies the run directory. Open each brief's `instrumental.wav` to
hear the bed and `score.mid` to inspect its notes. Generated files and the local
virtual environment are ignored by Git.

```bash
uv run pytest -q
uv run ruff check audio_poc tests
uv run ruff format --check audio_poc tests
```

Tests generate their own tone-only speech substitute. Those test outputs are
not Azure audio and are never evidence that the live vocal proof passed.

## Configure a live render

Use an existing paid S0 Azure Speech resource. No resources are provisioned by
this command. Set `SPEECH_KEY` and `SPEECH_REGION` in your local shell using your
usual secret-management mechanism. Never paste a key into chat, a command
argument, a JSON evidence file or source control. The only configured voice is
the stock `en-US-JennyNeural` voice.

Create a local evidence file, for example `renders/speech-evidence.json`.
Replace the placeholder values and set the rate to a positive JSON number or
decimal string obtained for your account, region and stock neural voice:

```json
{
  "tier": "S0",
  "region": "your-region",
  "resource_reference": "your non-secret resource and paid-tier evidence reference",
  "usd_per_million_characters": null,
  "rate_source": "dated quote, Azure pricing calculator or account price-sheet reference",
  "rate_checked_on": "2026-11-12",
  "commercial_use_basis": null
}
```

A null rate intentionally fails preflight. There is no assumed list price or
free-tier allowance. Use the actual date you checked the rate.

`commercial_use_basis` may remain null while experimenting locally. To record a
basis, supply a nonempty string referencing your review of all original score,
script and instrument material and the applicable paid Speech output terms,
with review date and any restrictions. This is a human assertion, not an
automatic legal approval. The ledger records the basis for each component but
still requires human review. Do not distribute or broadcast until appropriate
rights, disclosure and producer reviews are complete.

Relevant sources:

* [Azure Speech pricing](https://azure.microsoft.com/en-us/pricing/details/speech/)
* [TTS billing and synthetic-voice disclosure FAQ](https://learn.microsoft.com/azure/ai-services/speech-service/faq-tts)
* [Microsoft Azure Product Terms, MCA](https://www.microsoft.com/licensing/terms/productoffering/MicrosoftAzure/MCA)
  (select the agreement that actually applies to your account)
* [Microsoft AI responsible-use guidance](https://learn.microsoft.com/azure/ai-foundry/responsible-use-of-ai-overview)

After checking the evidence, explicitly authorize a budget in the command:

```bash
uv run python -m audio_poc --azure \
  --evidence renders/speech-evidence.json \
  --max-cost-usd 0.05
```

The budget above is an example cap, not a quoted price. Preflight calculates the
three requests from the supplied rate and rejects a cap below that estimate.
It also checks the resource tier, region, credentials and evidence before any
request. There are no hidden retries. Each request waits at most 60 seconds;
canceled or timed-out usage must be reconciled in Azure before another attempt.
An interrupted run is incomplete even if some WAVs already exist.

## How the comparison works

The generator reads [advertiser-briefs.json](advertiser-briefs.json) and separately
authored [generation-scripts.json](generation-scripts.json). It never loads
[expected-brand-cta.json](expected-brand-cta.json). Scripts use the approved
brief facts and do not call a lyric model.

The fixed score is 120 BPM. Azure word events supply source offsets, durations
and text positions. The renderer rejects missing, overlapping or mismatched
word events instead of silently omitting speech. Complete word intervals are
resampled into quarter-second note slots between seconds 3 and 25. An 18-band
vocoder transfers those speech envelopes to the synthesized melody carrier;
high-frequency speech preserves unvoiced consonants. Resampling changes the
modulator pitch, so this path is an intelligibility experiment, not a
pitch-preserving singer. The spoken alternative retains the original speech
rate and ends one second before the spot finishes.

## Evidence and evaluation

`attempt.json` is written before each Azure request. It records submission,
quantity, configured rate evidence and the provider result ID on completion.
The estimated charge uses every submitted ASCII character, including spaces
and punctuation. It is not an authoritative invoice meter. Failed or canceled
requests retain unknown charge, not zero. Check Azure billing and retain that
reconciliation separately; failed attempts from older runs still count toward
your experiment's total spending.

Each pair shares one synthesis request. Its manifests show the full request
quantity and a 50/50 allocated quantity and charge for each output. Sum allocated
charges, not the repeated request charges. Numeric gates conservatively check
the full request cost, not half. Render time is shared elapsed wall-clock time
for producing the brief's score, speech and both mixes, not a claim that two
independent full renders occurred.

Each output manifest includes:

* Duration, render seconds, SHA-256, peak and RMS level
* Azure request and allocated usage, configured rate source and date
* Audio-component origin, evidence and unresolved commercial-use basis
* Synthetic-audio disclosure and blank unblinded self-evaluation fields
* Numeric duration, `<300` second and `<USD 0.50` checks

Fixed gateway and hosting charges are zero because this local command provisions
neither; local hardware, electricity and human time are explicitly excluded.
Instrumental mode records zero Azure requests, not a successful vocal proof.

Use the [evaluation protocol](protocol.md) for your brand-and-CTA transcription
and usability rating. Do not open the expected-answer fixture until after
transcribing. All outputs remain Pending until rights and actual listening
evidence exist. A failed numeric gate sets Fail; a successful numeric check alone
never sets the output or overall POC to Pass.

## Software and origin evidence

The MIDI and WAV writers use Python's standard library. DSP uses NumPy and
SciPy; Speech uses Microsoft's SDK. These are software tools, not licensed
musical samples. Dependency versions and hashes are pinned by the repository's
`uv.lock`; retain dependency license notices if redistributing the software.

* [Python license](https://docs.python.org/3/license.html)
* [NumPy BSD license](https://numpy.org/doc/stable/license.html)
* [SciPy license](https://github.com/scipy/scipy/blob/main/LICENSE.txt)
* [Speech SDK license terms](https://aka.ms/csspeech/license)

The repository does not yet grant a blanket distribution license for generated
music or code. Original source provenance is not proof of exclusive copyright,
trademark clearance or commercial output rights.
