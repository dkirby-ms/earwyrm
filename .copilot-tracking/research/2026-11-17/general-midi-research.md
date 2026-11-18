<!-- markdownlint-disable-file -->
# General MIDI rendering research

## Executive Summary

Share a deterministic General MIDI palette between the exported score and a FluidSynth backing render. Enable it in the backend container; keep host runs without a configured SoundFont on the existing oscillator backend.

## What You May Not Know

Program Changes alone would only affect external MIDI playback, not the audio heard in the app.

## Findings

* F4 / C7: apps/api/src/render.ts `render_brief` renders web and CLI WAVs and may refit the arrangement after speech. Change the backing renderer, not the vocal carrier or alignment.
* F5 / C8: apps/api/src/melody_service.ts `submit` produces a separate backing WAV and persists artifacts once. Apply the same palette here without changing request identity or regenerating stored jobs.
* F6 / C9: apps/api/src/dsp.ts `write_midi` already separates melodic channels and uses the drum channel. Add melodic programs at tick zero, with no change to pitches or durations.
* F7 / W1–W3: General MIDI defines instruments; FluidSynth fast-renders with a local SoundFont. Debian distributes FluidR3 GM under MIT for the bank itself. Preserve the packaged notice and do not infer broadcast clearance.

## Recommendation and Alternatives

Use asynchronous FluidSynth CLI with Linux container defaults, no Node dependency, and a deployment-owned SoundFont path. Reject configured failures, shape successful PCM to the score duration, and record the backend used. Reject export-only because the app would still sound the same. Reject requiring the binary on every development host because it would break existing local workflows.

## Decisions and Feedback

The user approved the MIDI-plus-WAV proposal. Choose cohesive acoustic pop, bright commercial and electronic palettes by seed. No new user-facing picker or request fields.

## Risks and Open Questions

Test real fast-render output and verify 24 kHz mono duration, PCM activity and manifest provenance. SoundFont output can differ by installation. Human listening and rights approval remain separate.

## Planning Readiness and Next Step

Complete; ready for Plan. No blockers.

## Scope and Questions

Which exports need patch assignments and sample rendering? How can environments without sample assets retain explicit compatibility?

## Research Record

Focused local implementation investigation, using prior walkthrough evidence and official MIDI and FluidSynth references. Root: repository `.copilot-tracking/research`; date from active RPI conversation. Follows memorable-jingles research (C1–C6); no user decision needed for research intake.

1. Wider: C7–C9 established both audible paths and shared MIDI serialization; W1 confirmed the portable sound set.
2. Deeper: W2 confirmed non-interactive offline rendering, sample rate and raw output options; C10 (`Dockerfile`) provides a Debian-based runtime and non-root user.
3. Contrarian: MIDI-only cannot satisfy audible change; system-wide install is unnecessary for tests when Docker is available. W3–W4 distinguish permissive FluidR3 from the GPL-2 TimGM bank. No further wave needed; executable integration belongs to validation.

| ID | Source (retrieved 2026-11-17) |
|---|---|
| W1 | https://midi.org/general-midi |
| W2 | https://manpages.debian.org/bookworm/fluidsynth/fluidsynth.1.en.html |
| W3 | https://metadata.ftp-master.debian.org/changelogs/main/f/fluid-soundfont/fluid-soundfont_3.1-5.3_copyright |
| W4 | https://metadata.ftp-master.debian.org/changelogs/main/t/timgm6mb-soundfont/timgm6mb-soundfont_1.3-5_copyright |
