<!-- markdownlint-disable-file -->
# General MIDI implementation

## Execution Status

Complete for the full plan (`P02`, `P02-T01`). No remaining markers or blockers.

## Completed Work

### Sampled backing matches the exported General MIDI palette

* Related task: `P02-T01`.
* [apps/api/src/dsp.ts](../../../apps/api/src/dsp.ts) exports seeded acoustic pop, bright commercial and electronic patch palettes; tick-zero Program Changes precede notes and percussion remains on channel 10.
* [apps/api/src/backing.ts](../../../apps/api/src/backing.ts), [apps/api/src/render.ts](../../../apps/api/src/render.ts), and [apps/api/src/melody_service.ts](../../../apps/api/src/melody_service.ts) share the backing renderer and record the palette and actual backend. Existing speech and immutable job retry behavior remain intact. Configuration errors fail explicitly.
* [Dockerfile](../../../Dockerfile) enables FluidSynth with the FluidR3 GM bank. Host setup and licensing are documented in [docs/audio-poc/rendering.md](../../../docs/audio-poc/rendering.md) and [docs/melody-mcp.md](../../../docs/melody-mcp.md).

## Implementation-Time Plan Updates

None beyond completion markers.

## Validation Record

* Affected API suites: 182 passed; one real PostgreSQL integration skipped.
* `npm run typecheck`, `npm run build`, and `git diff --check`: passed.
* Real backend Docker build and smoke as the image's non-root user with networking disabled: all three palettes rendered; the main web/CLI renderer produced a valid 16-second mono 24 kHz WAV, with matching palette provenance and different PCM from the oscillator path despite identical MIDI bytes. Melody MCP service committed a sampled 12-second WAV and served it unchanged after configuration changed.
* [renders/general-midi-preview-20261117/instrumental.Vpbgwt.wav](../../../renders/general-midi-preview-20261117/instrumental.Vpbgwt.wav): saved sampled preview; subjective listening not performed.

## Business Alignment

None.

## Follow-Up Items

None required. No deployment, paid Speech request, or additional formal session Review.
