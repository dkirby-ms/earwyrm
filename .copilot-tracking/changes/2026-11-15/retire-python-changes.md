<!-- markdownlint-disable-file -->
# RPI Changes: Retire Python

## Metadata

* Task ID: retire-python
* Related plan: [.copilot-tracking/plans/2026-11-15/retire-python-plan.md](../../plans/2026-11-15/retire-python-plan.md)
* Implementation date: 2026-11-15

## Execution Status

* Status: Complete
* Declared scope: full plan
* Completed scope markers: P01-P04 and all seven Pxx-Txx tasks
* Remaining: none
* First active item: none; ready for Review

## Execution Summary

Implemented the full TypeScript runtime from the ready plan and Complete/Pass standard critique. Existing frontend, infrastructure changes and private data were preserved. Three independent ports had disjoint creative, storage and web ownership; the parent integrated platform/MCP/render and operations. Superseded Python was removed only after replacement tests passed, with an original-source backup retained in this session outside the application.

## Completed Work

### P01-T01: Node runtime and strict build foundation

* Files: [package.json](../../../package.json), [tsconfig.json](../../../tsconfig.json), [tsconfig.build.json](../../../tsconfig.build.json), [vitest.config.ts](../../../vitest.config.ts).
* Node 24 ESM scripts, backend test ownership and strict TypeScript build are established. Root dependencies installed with a lockfile; existing frontend package preserved.
* Validation: `npm install --no-audit --no-fund` and `npm run typecheck` passed.

### P02-T01: Native creative generation and bounded provider adapters

* Files: [src/dsp.ts](../../../src/dsp.ts), [src/melody.ts](../../../src/melody.ts), [src/similarity.ts](../../../src/similarity.ts), [src/speech.ts](../../../src/speech.ts), [src/lyrics.ts](../../../src/lyrics.ts), [src/lyric_cloud.ts](../../../src/lyric_cloud.ts), [src/lyric_service.ts](../../../src/lyric_service.ts).
* Original synthesis, 18-band vocoding, PCM/MIDI, syllable timing, ordered similarity windows and deterministic safe seeds run natively. Async lyric/Speech adapters retain bounded attempts, independent safety gates and private errors.
* Shared `Seed` schema/type and `parse_seed` retain safe numeric streams and support deterministic oversized decimal strings through signed-63-bit maximum. Unsafe numeric inputs still reject.
* Validation: parent reran creative and actual large-seed MCP tests (166 cases across three files), followed by successful strict typecheck. Actual Azure/paid effectiveness is not claimed.

### P02-T02: Durable stores, jobs and administration

* Files: [src/persistence.ts](../../../src/persistence.ts), [src/sqlite_files.ts](../../../src/sqlite_files.ts), [src/web_storage.ts](../../../src/web_storage.ts), [src/melody_service.ts](../../../src/melody_service.ts), [src/bootstrap_database.ts](../../../src/bootstrap_database.ts).
* SQLite/PostgreSQL schemas, markers, ownership, paid-ledger serialization, idempotency, imports and operator commands remain supported. Historical oversized numeric seed tokens are losslessly exposed as exact strings before rounding. Original stored JSON/media remain unchanged; retry normalization is in memory only.
* Validation includes 58 storage cases, isolated PostgreSQL schemas, real cross-process SQLite contention, legacy retrieval/artifact/retry/import, rollback and source-byte immutability.

### P03-T01: Protected Express API and identity

* Files: [src/web_app.ts](../../../src/web_app.ts), [src/web_auth.ts](../../../src/web_auth.ts), [src/cloud_web.ts](../../../src/cloud_web.ts).
* Preserved issuer/subject access, delegated scope/token-kind checks, guarded offline/paid rendering, evaluations, protected downloads, static controls and cloud lifetime flock.
* Validation includes 57 web/auth cases, real offline render/download/evaluation flow, actual inherited-descriptor flock contention, container API checks and the existing Vite UI in an integrated browser.

### P03-T02: Canonical contracts, real MCP and rendering

* Files: [src/contracts.ts](../../../src/contracts.ts), [src/platform_service.ts](../../../src/platform_service.ts), [src/lyric_mcp.ts](../../../src/lyric_mcp.ts), [src/melody_mcp.ts](../../../src/melody_mcp.ts), [src/render.ts](../../../src/render.ts), [src/cli.ts](../../../src/cli.ts).
* Zod schemas, actual SDK stdio/HTTP tools and binary resources, lossless large-seed protocol round trips, offline rendering and paid preflight work without Python. Scaffolds remain explicitly unintegrated, not successful fallbacks.
* Validation: actual client negotiation/calls/resource reads, executable three-fixture CLI, PCM/MIDI dimensions/peak/provenance and parseable contract-catalog CLI.

### P04-T01: Node deployment and supported commands

* Files: [Dockerfile](../../../Dockerfile), [Dockerfile.web](../../../Dockerfile.web), [azure.yaml](../../../azure.yaml), [.github/workflows/deploy-web.yml](../../../.github/workflows/deploy-web.yml), [scripts/deployment_gate.ts](../../../scripts/deployment_gate.ts), [docs/](../../../docs/).
* Multi-stage Node images retain UID10001, CA certificates and util-linux. npm hooks preserve OIDC, maintenance, writer exclusion, pinned-secret and exact-firewall gates. Related operating/provenance documentation now uses Node commands and documents precision/generator boundaries.
* Validation: both final image builds, runtime checks, negative deployment tests and pinned container actionlint passed without live Azure calls.

### P04-T02: Proven Python retirement

* Removed 39 superseded Python source/test/script files, Python manifests/lock and five generated egg-info files. Removed only verified obsolete bytecode and empty retired directories; private data and existing frontend were not deleted.
* Eight backend test files pass all 309 cases after removal, including dedicated real PostgreSQL. Strict typecheck/build, existing frontend tests/build, actual CLI/MCP/browser and final Node image checks pass.
* Application/script/test source scan finds no `.py`; active docs/configuration scan finds no old Python package/command/manifest references. Historical evidence and ignored developer caches are not executable application dependencies.

## Implementation-Time Plan Updates

P03 source ports may proceed independently after P01 using the binding export convention; acceptance still requires completed P02 and integration validation. This clarifies dependency staging without changing requirements or scope.

Operational source/document preparation is independent of unfinished ports; P04 acceptance and Python removal still require P03. Native TypeScript generation preserves repeatability within the new implementation, not historical NumPy bytes. Historical artifacts retain their original provenance.

Material precision discovery: safe-only numeric seeds would make historical 63-bit jobs and imports unavailable. User chose lossless decimal strings for oversized seeds. P02-T01/P02-T02 were revalidated, including legacy recovery/import and unchanged original data. Parent render types derive from the shared schema. Safe seeds retain numeric representation and current deterministic stream. Unsafe numeric inputs still reject.

## Business Alignment

* None

## Validation Record

* Passed: all 309 backend cases across eight files after Python removal, with isolated PostgreSQL and no skips. Earlier intermediate checks passed 271 before the approved seed extension; the final result supersedes that baseline.
* Passed: root `npm run typecheck` and `npm run build`.
* Passed: actual stdio/HTTP/in-memory MCP, exact large-seed recovery/resources, executable offline three-fixture render, PCM/MIDI/provenance, contract-catalog CLI and negative paid/deployment gates.
* Passed: existing frontend tests (3) and production typecheck/Vite build.
* Passed: web owner added a real authorized offline render/download/owner-isolation/evaluation/evidence flow; cloud-lock tests use actual util-linux and an inherited descriptor in a spawned Node process.
* Passed: GitHub workflow syntax/expressions through a pinned disposable actionlint container. Host actionlint and Go were unavailable; the container alternative succeeded.
* Passed: both final Node image builds, UID10001, installed CA/flock, no Python binary. Actual container health/config/protected-route/static-client checks and integrated browser setup-needed view passed.
* Passed: final rebuilt non-root web runtime after precision changes/removal and explicit render-scaffold exit 2. Disposable database and service containers were stopped.
* Skipped intentionally: live Azure deployment, live identity-provider effectiveness and paid Speech/model calls. No cloud mutation, production-store access or paid requests were performed.

## Pre-Review Reconciliation

Ready: all plan markers, completed-work evidence, supported precision/generator boundaries and final validation are reconciled. No BRD/PRD/ADR source requirements are cited; Business Alignment is none. No required implementation work remains.

## Blockers

* None; historical seed decision resolved by user-approved decimal strings.

## Remaining Work

* None

## Follow-Up Items

* None

## Return-to-Caller State

Full-plan implementation is Complete and Review-ready. Automatic parent proceeds to the task's one standard acceptance Review.
