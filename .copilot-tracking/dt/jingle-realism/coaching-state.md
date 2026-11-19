---
title: Jingle Realism coaching state
description: Discovery session for defining realistic musical jingle quality.
project:
  name: Jingle Realism
  slug: jingle-realism
  created: "2026-11-19"
  initial_request: >-
    The current way we have jingles generated musically lacks the feel of an actual jingle. I want to make sure our generator creates realistic jingles and would "sound like a jingle".
  initial_classification: fluid
current:
  method: 1
  space: problem
  phase: "Technical assessment complete; proposed changes awaiting decision"
  disclaimerShownAt: "2026-11-19T01:16:51Z"
methods_completed: []
transition_log:
  - from_method: null
    to_method: 1
    rationale: Project initialized to clarify the desired listening experience before choosing changes.
    date: "2026-11-19"
hint_calibration:
  level: 1
  pattern_notes: ""
session_log:
  - date: "2026-11-19"
    method: 1
    summary: >-
      User reports that generated music does not feel like a real jingle.
      Read guided arrangement and render entrypoints for context; no audio
      has been auditioned and no cause has been established.
      User identifies no memorable hook, mechanical rhythm, and synthetic
      instruments as the listening gaps and offers an example WAV file.
      Supplied example is renders/20261117-phrase-v2-preview-747579a7/brief-001/instrumental.wav.
      Inspected format and companion evidence, not perceptual playback:
      16-second mono PCM, 24 kHz, phrase-v2 seed 42. Summary records oscillator
      instruments and synthesized percussion without samples or SoundFonts.
      Score and current generator show grid-aligned repeating percussion;
      the recorded hook section begins at 6 seconds. These are candidate
      contributors, not a verified explanation of perceived quality.
      User names Stanley Steemer, Liberty Mutual, Farmers Insurance, the NFL
      theme, and McDonald's as desired musical references. Specific NFL
      theme is unspecified. Working interpretation, pending confirmation:
      recognizable musical identity rather than generic backing music.
      User confirms both a sung brand hook and a recognizable instrumental
      signature as the musical identity target. Desired qualities remain
      memorability, a less mechanical groove, and natural-sounding instruments.
      Listening acceptance criteria, genre range, and implementation approach
      have not yet been agreed. No generator code has been changed.
      User approved a focused technical assessment and concrete recommendations.
      Verified the supplied WAV hash against summary evidence and confirmed its
      saved score exactly matches current compose(42, 16). All 71 percussion
      events lie on the 125 ms grid; snare gains are identical, with two fixed
      gain levels each for kick and hat.
      Current backing supports FluidSynth and three General MIDI palettes;
      the backend Dockerfile already configures FluidR3_GM. The supplied old
      oscillator render does not establish current deployed sound quality.
      Current guided previews already repeat a three-note opening on lines
      zero and two and double vocal guide notes instrumentally. Legacy phrase
      generation also repeats motif material, so missing repetition alone is
      not an established explanation of poor memorability.
      All compositions retain fixed 120 BPM and the same percussion vocabulary;
      the request style only permits retro-synth. Timing generation does not
      map lexical stress to musical emphasis. Azure uses speakTextAsync;
      aligned speech and oscillator carriers feed a vocoder, not a natural
      singing synthesis engine.
      Proposed priorities, not yet approved: explicit short brand-signature
      motifs and recall; coherent style-specific arrangement and seeded groove;
      benchmark existing SoundFont output before new instrument infrastructure;
      evaluate a genuine singing path separately from legacy spoken/vocoded
      modes. Preserve deterministic artifacts and commit groove before preview
      binding. Use staged listening comparisons to isolate timbre, composition,
      and vocal changes; numerical score tests cannot prove memorability.
      Validation: creative-audio.test.ts passed all 67 tests. No application
      code was changed, no paid requests were made, and no audio was auditioned.
artifacts: []
canonical_deck:
  snapshots: []
  last_offered_at: null
  last_offered_response: null
  last_generated_at: null
customer_card_render:
  last_offered_at: null
  last_offered_response: null
  last_generated_at: null
  decline_final: false
  output_path: null
---
