---
title: Melody and Arrangement MCP
description: Run the local composition service, validate lyric timing and recover one screened arrangement and durable render job
ms.date: 2026-11-13
ms.topic: how-to
---

## What is implemented

The independent Melody and Arrangement server generates a 30-second, 120 BPM
retro-synth arrangement. A seed chooses the scale, hook intervals and rhythm,
chord progression and voicings. An intro, recurring two-bar hook, contrasting
bridge and closing tonic provide structure rather than unrelated random notes.
New requests without a seed get fresh musical identities; an explicit seed
reproduces the score. Different versions must use different logical job IDs.
Without an explicit seed, up to eight local candidates may be screened before
delivery; a failed candidate is discarded, never delivered or queued. Exhaustion
returns an explicit similarity error. An explicit seed gets exactly one attempt.
These composition attempts make no Speech or other paid API calls.

The server validates lyrics and timing, screens both lead and vocal melodies,
renders a backing WAV and MIDI, and commits exactly one local render-queue row.
It does not call Azure Speech or render the final vocal/mix. All instruments are
harmonic oscillators, a synthesized kick and seeded noise: no samples,
recordings, voice clones or SoundFonts.

Issue #4 is still the platform integration dependency. The contract below is
provisional v1, not a claim that the shared platform schema has been agreed.
The SQLite queue is a working single-host implementation, not Azure Queue
Storage. Cloud transport, APIM authentication, deployment and the queue-triggered
vocal worker remain separate platform/render work.

## Start locally

```bash
uv sync --locked
uv run python -m audio_poc.melody_mcp
```

The default transport is MCP stdio. Configure an MCP client with command `uv`
and arguments `run`, `python`, `-m`, `audio_poc.melody_mcp`, using this repository
as its working directory. Logs go to stderr, not the protocol stream.

For Streamable HTTP:

```bash
uv run python -m audio_poc.melody_mcp \
  --transport streamable-http --port 8001 \
  --data-dir .earwyrm-data/melody
```

Connect to `http://127.0.0.1:8001/mcp`. The supported SDK negotiates MCP
2025-06-18 or later. This unauthenticated local server binds only loopback.
Do not expose it through a public proxy; deployment needs an authenticated,
authorized gateway and tenant-scoped storage. Its artifact references are
private MCP resources, not public download links.

## Tool contract

`compose_arrangement` takes one `request` object:

```json
{
  "request": {
    "schema_version": 1,
    "logical_job_id": "cedar-loop-campaign-v1",
    "product_path": "vocoded",
    "duration_seconds": 30,
    "style": "retro-synth",
    "lyrics": "Cedar Loop brings bright sound to your day",
    "lines": [
      {
        "text": "Cedar Loop brings bright sound to your day",
        "syllables": [
          "Ce", "dar", "Loop", "brings", "bright", "sound", "to", "your", "day"
        ],
        "start_seconds": 3,
        "end_seconds": 7
      }
    ]
  }
}
```

Optional `seed` is an integer from 0 to 9223372036854775807. Omit it for a fresh
composition. The returned seed is retained even when a lost-response retry
again omits the seed.

Rules:

* `logical_job_id` is 1-100 ASCII letters, digits, dots, underscores or hyphens;
  its first character must be alphanumeric.
* `product_path` is `vocoded` or `spoken`. The worker must honor it: vocode the
  mapped carrier for `vocoded`, retain natural speech for `spoken`. The guide
  vocal MIDI/map is returned for either path, not claimed as sung audio.
* Supply 1-8 ordered, non-overlapping line windows within seconds 3-25, on a
  0.125-second grid. Every syllable gets 0.125-1 second. A seeded allocator
  varies the rhythm while filling each window exactly.
* Supply 8-176 syllables total and at most 88 per line. Eight notes are the
  minimum local similarity comparison. Unfit short or crowded inputs fail
  rather than silently dropping syllables or inventing melismas.
* Lyrics are ASCII, at most 400 characters. Joining lines and joining each
  line's syllables must reproduce the lyric's letters/digits in order, ignoring
  punctuation, spaces and case. Explicit syllables come from the upstream
  lyric writer; no claim of automatic linguistic syllabification is made.
* Unknown fields, unsupported versions/styles/paths, nonfinite timings,
  overlaps and missing lyric coverage are errors. Upstream moderation, brand
  and claim validation remain the lyric service's responsibility.

The structured result includes:

* `job_id`, `logical_job_id`, `status`, `queue_owner: "melody-arrangement"` and
  `queue_backend: "sqlite-local"`
* Recorded seed, product path, duration and style
* `midi` and `backing_tracks` references with URI, media type and SHA-256
* Fifteen chord spans with actual MIDI root and pad voicing pitches
* `syllable_timing`, containing zero-based line/syllable indexes, text, onset,
  duration and MIDI pitch for every syllable
* `artifacts` for `score.mid`, `score.json`, `timing.json`, `backing.wav` and
  `provenance.json`
* The similarity report and component origins, with human rights review pending

Read binary artifacts using MCP `resources/read`, for example
`earwyrm://jobs/<job_id>/score.mid`. WAV is mono PCM16, 24 kHz, exactly 30 seconds,
peak-normalized to -1 dBFS, not broadcast/LUFS mastered.
`get_render_job` takes `{"job_id": "<returned UUID>"}` to recover a committed
result. MCP `tools/list` publishes the input and structured output JSON schemas;
`resources/templates/list` describes the five artifact templates.

## Queue ownership and retries

Only Melody and Arrangement enqueues the logical render. The workflow retains
the returned `job_id`; it must not publish the same request to another queue.
SQLite serializes identity checking, comparison against prior output, and job
insertion across local service processes.

An identical normalized request and `logical_job_id` returns the existing job,
assets and seed, even after restart or concurrent submission. Changed payloads
under that ID fail with an explicit conflict. A new ID with the same melody
fails screening rather than creating a duplicate render.

The private database is `<data-dir>/melody.sqlite3`. `render_jobs` contains:

* `job_id` and unique `logical_job_id`
* `request_json`, `result_json` and `melodies_json`
* `status` (`queued`, `running`, `completed`, `failed`) and UTC `created_at`

The future local worker claims a queued row in a `BEGIN IMMEDIATE` transaction,
updates that row to `running` and processes its retained request/result. It
updates the same row to `completed` or `failed`, never inserts a second job.
Use the live status column (and `get_render_job`), not the creation-time status
inside immutable `result_json`. Worker execution, leases and crash recovery
are not implemented here; no final-vocal completion is implied by `queued`.
An Azure adapter needs an outbox/deduplicating consumer keyed by this same job
ID rather than an uncoordinated database-write-plus-broker-send.

Assets are served only for committed jobs, with allowlisted names and checksum
verification. Screening failures create no job or asset directory. Handled
write failures roll back and remove partial files. A process crash may leave
private orphan files; without a committed job they cannot be read as resources.
Retry the same logical ID after an uncertain/lost response; do not invent a
new ID to bypass uncertainty.

The existing synchronous CLI/web POC uses the same composer and screening but
does not enqueue jobs. It archives generated melody sequences in `local_outputs`
in its selected private store. The web's default store is shared with the
default MCP store; the CLI uses `<output-root>/.melody-history`. Screening checks
both committed MCP jobs and archived POC output in that store. Do not delete the
database to work around a rejected melody.

## Similarity reference set and threshold

Policy `earwyrm-reference-v1` screens every seven-interval (eight-note) window,
using signed semitone differences between successive pitches. For every
candidate/reference window pair it measures the ordered matching-interval ratio
with Python `SequenceMatcher(autojunk=False)`, taking the maximum. Equal
transpositions score 1.0; six matching intervals out of seven score about 0.857.
The arrangement fails at a score **greater than or equal to 0.85**, for either
the lead or guide vocal. Rhythm is deliberately ignored so tempo/rhythm changes
cannot hide the same pitch sequence. Shorter melodies are rejected as unfit.

The versioned, manually encoded composition excerpts in
[similarity.py](../audio_poc/similarity.py) are:

| Reference | Composition origin | Scope |
|---|---|---|
| Twinkle, Twinkle / Ah! vous dirai-je, maman | Traditional French melody published in the 18th century | Fourteen opening notes |
| Ode to Joy | Beethoven, Symphony No. 9, 1824 | Fifteen theme notes |
| Frere Jacques | Traditional round published before 1900 | Fourteen opening notes |
| Earlier Earwyrm backing and vocal motifs | Original fixed patterns formerly in this repository | Both eight-note patterns, all eight rotations repeated |
| Prior Earwyrm output | Persisted lead/vocal pitch sequences in this store | All committed service jobs and archived synchronous output |

These are public-domain compositions or repository-generated note sequences,
not copied audio recordings or modern arrangements. Background information:
[Ah! vous dirai-je, maman](https://en.wikipedia.org/wiki/Ah!_vous_dirai-je,_maman),
[Symphony No. 9](https://en.wikipedia.org/wiki/Symphony_No._9_(Beethoven)) and
[Frere Jacques](https://en.wikipedia.org/wiki/Fr%C3%A8re_Jacques).
Retain the reference version, method, threshold, strongest match and count in
each report. Legacy motifs cover the old transposed/rotated POC outputs;
new earlier-output coverage is limited to the retained store, not every partner
deployment or an external music catalog.

This is a small, conservative engineering screen. It can reject unrelated
phrases and miss familiar tunes absent from the reference set, longer-range
resemblances, ornamental variations, harmony or audio-level similarities.
A pass is **not commercial-catalog, copyright, trademark or legal clearance**.
No automatic commercial-use or exclusive-authorship claim is made. Producer,
listening, advertiser and rights review remain required before distribution.

## Validation and operations

```bash
uv run pytest -q
uv run ruff check audio_poc tests
uv run ruff format --check audio_poc tests
```

Tests measure variation in normalized intervals and rhythm, syllable timing fit,
transposed/near-copy and prior-output rejection, PCM/MIDI output, concurrent and
restart idempotency, failure rollback, and actual MCP tool/resource sessions.
Tone-only speech tests do not establish singing quality or Azure proof success.

The service emits OpenTelemetry `server` and `producer` spans for composition
and queue submission through `opentelemetry-api`; an embedding deployment must
configure its tracer provider/exporter and resource attributes (`service.name`,
`service.version`, `deployment.environment`). No telemetry exporter or network
collector runs by default. Local logs report lifecycle/failure categories, not
lyrics, credentials or advertiser data.

Stop the process normally to shut down. Removing the specific private data
directory is a separate operator action that removes assets, queue identities
and similarity history; never treat it as a routine retry.
