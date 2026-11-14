---
title: Version-one service contracts
description: Canonical creative schemas, render envelopes, quality, provenance and approval boundaries.
---

## Canonical definitions

[audio_poc/contracts.py](../audio_poc/contracts.py) composes the platform schema
catalog from the existing Pydantic definitions. Consumers can fetch JSON Schema
from an authenticated scaffold's `/contracts` route or generate it locally:

```bash
uv run --locked python -c 'import json; from audio_poc.contracts import ServiceContracts; print(json.dumps(ServiceContracts.model_json_schema(), indent=2))'
```

Do not maintain a second handwritten JSON schema. The catalog is a definition
bundle, not the HTTP body expected by every service. Existing local POC imports
and request shapes are preserved.

| Contract | Canonical module | Purpose |
|---|---|---|
| `AdvertiserBrief`, `LyricRequest`, `LyricResult` | [lyrics.py](../audio_poc/lyrics.py) | Synthetic briefs, constrained lyric generation and checks |
| `CompositionRequest`, `SyllableNote` | [melody.py](../audio_poc/melody.py) | Deterministic arrangement input and syllable timing |
| `CompositionResult`, `Component` | [melody_service.py](../audio_poc/melody_service.py) | Composition output and audio component provenance |
| `VersionIdentity`, `ServiceError`, `BlobArtifact` | [contracts.py](../audio_poc/contracts.py) | Candidate identity, safe errors and authenticated artifact references |
| `RenderMessage`, `JobRecord` | [contracts.py](../audio_poc/contracts.py) | Queue envelope and separate durable status |
| `QualityCheck`, `QualityReport` | [contracts.py](../audio_poc/contracts.py) | Measurements, explicit bounds and fail/pending/pass aggregation |
| `RenderManifest`, `ApprovalRecord` | [contracts.py](../audio_poc/contracts.py) | Provenance, disclosure and version-bound human decisions |

Platform records carry `schema_version: 1` where applicable. Existing creative
contracts remain their canonical shapes rather than being copied into new
wrappers. Unknown fields and non-finite numeric values are rejected through the
existing shared `Contract` configuration.

## Identity, queue and status

Each candidate has UUID job/version IDs, a positive strict version number and a
synthetic brief ID (`brief-001` through the fixture naming pattern). Regeneration
creates a new version ID. Queue retries must retain the original IDs; schema
validation alone does not provide durable idempotency or enforce transitions.

The melody service owns render submission. `RenderMessage` carries candidate
identity, product path, composition artifact and a valid nonzero W3C trace/span
context, not an inline audio payload or credentials. `BlobArtifact` requires an
HTTPS URI without user info, query or fragment and a lowercase SHA-256 digest.
It is a private artifact reference, not a SAS link or proof of authorization.

`JobRecord` separates `queued`, `running`, `quality_failed`,
`awaiting_approval` and `failed` states. Attempts are bounded to 1-2; an integration
must define any fallback as a distinct candidate rather than silently increasing
that bound. Failed records require a safe `ServiceError`; completed render states
require a manifest reference. Unfinished states cannot claim a manifest, and
updated timestamps cannot precede creation.

The foundation provides no cloud persistence, transition controller or queue
consumer. A future implementation must atomically persist identity, validate
artifact integrity and authorize access before acknowledging a message.

## Quality and provenance

Each `QualityCheck` records a measurement, configured inclusive bounds, units,
status and evidence. Missing measurement or all missing bounds means Pending,
never Pass. A contradictory status or reversed interval is rejected.

Required checks are duration (seconds, 29.5-30.0 inclusive), loudness (LUFS),
intelligibility (dimensionless) and similarity (dimensionless). No arbitrary
loudness, intelligibility or similarity threshold is introduced by this
foundation. Set approved thresholds in later integration and retain the evidence.
Any failed check makes the report Fail; otherwise missing evidence means Pending;
only all passing checks yield Pass.

A `RenderManifest` binds audio digest, identity, product path, component sources,
tool versions, stock voice, Speech resource/result IDs and quality evidence.
It explicitly discloses an AI-generated review demo that is not cleared for
broadcast. Technical Pass is not rights clearance, advertiser approval or
professional mastering.

`ApprovalRecord` captures an authenticated human's object ID, role, decision,
aware timestamp and exact candidate/audio digest. A manifest rejects quality or
approval records for a different version and approvals for different audio.
Persist approvals separately and retain immutable provenance snapshots; these
schemas do not authenticate the actor or grant approval privileges.

## Runtime and integration boundaries

[platform_service.py](../audio_poc/platform_service.py) starts `web`, `lyric` and
`melody` roles on port 8080, bound to loopback locally. The container binds to
all interfaces; Azure ingress supplies HTTPS and Entra authentication.

* `/healthz` describes process health and explicitly disables generation.
* `/contracts` publishes the schema catalog.
* `POST /jobs` returns 501 without enqueueing work.
* Lyric and melody `/mcp` use real stateless Streamable HTTP. Their respective
  `write_lyrics` and `compose_arrangement` tools expose canonical inputs but
  return explicit not-integrated errors.
* The `render` role logs a bounded integration error and exits 2 without touching
  a queue message.

Local test services are not authentication boundaries. Do not expose them
directly to untrusted networks. Deployment uses APIM seller-token validation and
managed-identity-only backends, described in
[Azure deployment](./azure-deployment.md). It does not deploy the local SQLite
queue or imply that earlier local POC generation is production-integrated.
