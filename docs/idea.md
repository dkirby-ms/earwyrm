Yes. For short jingles, I actually think MIDI + a good software instrument is a very credible way around the GPU problem. And a strong text LLM can generate the MIDI arrangement without being a dedicated music-generation model.

The trick is: don't ask the LLM to output raw MIDI. Ask it to compose a structured musical score that deterministic code converts to MIDI.

I would build it like this

Foundry LLM → structured composition → MIDI renderer → high-quality synth/sample engine → WAV/MP3

For example, give a Foundry-managed GPT model a schema along these lines:

{
  "tempo": 128,
  "key": "C major",
  "time_signature": "4/4",
  "length_bars": 8,
  "tracks": [
    {
      "instrument": "bass",
      "program": 38,
      "notes": [
        {"pitch": "C2", "start": 0.0, "duration": 0.75, "velocity": 102}
      ]
    }
  ]
}


Then a small Python/TypeScript service translates that into an SMF .mid.

The LLM can do more composition than you might expect

For an 8–16 bar jingle, I'd have it explicitly compose:

Chord progression: e.g. C → Am → F → G.
Lead motif: memorable 3–7-note phrase, repeated with variation.
Bass: rhythmically connected to kick and harmony rather than just root notes.
Drums: kick, snare/clap, hi-hat, fills.
Arpeggio/pad: harmonic movement.
Dynamics: velocity variations and accents.
Humanization instructions: timing offsets of perhaps ±5–15 ms and small velocity changes.
Arrangement: intro → motif → variation → final sting/resolution.

That's dramatically easier for an LLM than generating a convincing 3-minute song.

Where "realistic" actually comes from

MIDI itself won't sound realistic. The important part becomes what plays it.

For the sort of electronic/synthy jingles I imagine you'd make, that's an advantage rather than a limitation.

You could have:

GPT → MIDI → virtual instruments → audio

For instance:

Part	RendererDrums	Sample kit
Bass	Surge XT / Vital / sampler
Pad	Surge XT
Lead	Surge XT or your Summit
Piano	Pianoteq / sampled piano
Orchestra	Spitfire-style sampled instruments

And here's where this intersects very nicely with PatchGator and your Summit work.

Instead of just:

LLM → MIDI

you could do:

LLM → composition + instrument descriptions

For example:

{
  "track": "lead",
  "notes": [...],
  "sound": {
    "description": "bright analog pluck",
    "attack_ms": 4,
    "decay_ms": 310,
    "sustain": 0.18,
    "release_ms": 190,
    "filter": "24dB lowpass",
    "cutoff_hz": 4200,
    "resonance": 0.22
  }
}


Then your existing patch-generation logic could translate the sound description into a Summit patch.

Suddenly the Foundry LLM isn't merely composing MIDI. It's acting as:

Composer + arranger + orchestrator + synth programmer.

I'd constrain the LLM pretty heavily

Rather than:

Write an upbeat corporate jingle as MIDI.

Give it a compositional grammar:

Create an 8-bar jingle at 122 BPM in D major.

Structure:
 Bars 1–2: establish hook
 Bars 3–4: repeat hook with variation
 Bars 5–6: harmonic lift
 Bars 7–8: logo sting resolving on tonic

Tracks: drums, bass, chords, lead, ear candy.

Requirements:

maximum polyphony 6 per track
lead melody has one recognizable motif
avoid continuous quantized eighth notes
bass follows harmony but includes passing tones
drum velocities must vary
leave rhythmic space around lead motif
strong final cadence
produce structured JSON only

That will produce vastly better results than saying "generate MIDI."

Then add a second LLM pass

This is where I think it gets genuinely interesting.

Have Composer produce the first JSON arrangement.

Then pass it to Producer:

Critique this as a commercially produced 15-second jingle. Identify problems with voice leading, melody repetition, rhythmic density, bass/drum interaction and cadence. Return a revised arrangement.

Potentially:

Composer → Music-theory validator → Producer → MIDI renderer

The validator doesn't even need AI. Code can detect:

notes outside key
overlapping notes
impossible ranges
excessive polyphony
weak final cadence
bass collisions
notes crossing bar boundaries
excessive simultaneous note-ons
GM drum mapping errors

So you retain deterministic control.

And this fits the Foundry constraint extremely well

The cool bit is that none of this needs GPU quota.

Your actual AI inference is just a normal Foundry-managed text model generating maybe 5–20 KB of structured data. Rendering MIDI and synthesizing audio are conventional CPU workloads.

Something like:

Foundry GPT model
 → JSON composition (~seconds)
 → Azure Function
 → .mid
 → software synth/sample renderer on CPU
 → mastering chain
 → .wav

The final mastering chain could even be deterministic:

EQ → compression → saturation → limiter → normalized WAV

At 10–30 second jingle lengths, that's tiny computationally compared with diffusion music generation.

I think there's an even better version for you

Don't make the unit of generation an arbitrary song.

Create a "jingle DSL."

Something like:

STYLE synthwave_corporate
TEMPO 118
KEY D_MAJOR

CHORDS
| D | Bm | G | A |

HOOK
F#5@0.0/0.5
A5@0.5/0.25
B5@0.75/0.75
A5@1.5/0.5
F#5@2.0/1.0

BASS
ROOT_PATTERN syncopated

DRUMS
PATTERN modern_pop
FILL bar8

SYNTH lead
PATCH bright_analog_pluck

SYNTH chords
PATCH warm_poly_pad

ENDING logo_sting


LLMs are extremely good at generating structured languages like this.

Then your renderer owns all the things an LLM is bad at: MIDI event ordering, ticks, channels, program changes, quantization, humanization and audio rendering.

And unlike an ACE-Step/Suno generation, the output is completely editable: change the chord, regenerate only the bass, replace the synth patch, transpose it, make it 10 seconds instead of 15, or send the MIDI straight to the Summit.

For short branded jingles rather than full songs, I actually like this architecture better than trying to get a generative-audio model into Foundry. It plays directly to what Foundry-managed LLMs are already very good at and what you've already built around synthesizers.