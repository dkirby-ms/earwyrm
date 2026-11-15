import { randomBytes } from "node:crypto";
import { z } from "zod";
import { parse_seed, type Seed } from "./dsp.js";

export const REFERENCE_VERSION = "earwyrm-reference-v1";
export const THRESHOLD = 0.85;
export const WINDOW = 7;
export const LIMITATION = "Limited reference-set screening only; not commercial-catalog or legal clearance. Human rights and producer review required.";
export const MAX_CANDIDATES = 8;
/** Public-domain pitch transcriptions, not recordings or arrangements. */
export const KNOWN_TUNES: Record<string, number[]> = {
  "traditional:twinkle-twinkle": [60, 60, 67, 67, 69, 69, 67, 65, 65, 64, 64, 62, 62, 60],
  "beethoven:ode-to-joy": [64, 64, 65, 67, 67, 65, 64, 62, 60, 60, 62, 64, 64, 62, 62],
  "traditional:frere-jacques": [60, 62, 64, 60, 60, 62, 64, 60, 64, 65, 67, 64, 65, 67],
};
/** Retired hook patterns screened in every cyclic rotation. */
export const LEGACY_MOTIFS = [[0, 7, 12, 4, 9, 7, 4, 2], [0, 4, 7, 9, 7, 4, 2, 0]];
/** Versioned bounded reference corpus; not a commercial catalog. */
export const REFERENCES: Record<string, number[]> = { ...KNOWN_TUNES };
LEGACY_MOTIFS.forEach((motif, kind) => {
  for (let rotation = 0; rotation < 8; rotation++) {
    const rotated = [...motif.slice(rotation), ...motif.slice(0, rotation)];
    REFERENCES[`earwyrm:legacy-${kind}-rotation-${rotation}`] = [...rotated, ...rotated, ...rotated];
  }
});

/** Strongest reference match and exact screening policy; passing is not rights clearance. */
export const SimilarityReport = z.strictObject({
  reference_version: z.string().default(REFERENCE_VERSION),
  method: z.string().default("max-seven-interval-window-sequence-ratio"),
  threshold: z.number().default(THRESHOLD),
  maximum_similarity: z.number().min(0).max(1),
  closest_reference: z.string(), references_checked: z.number().int().nonnegative(), passed: z.boolean(),
  limitation: z.string().default(LIMITATION),
});
export type SimilarityReport = z.infer<typeof SimilarityReport>;
/** Rejection carrying the auditable report; rejected music must not be delivered. */
export class SimilarityError extends Error {
  constructor(public readonly report: SimilarityReport) {
    super(`Melody similarity rejected: ${report.closest_reference} scored ${report.maximum_similarity.toFixed(3)} >= ${report.threshold}. ${LIMITATION}`);
    this.name = "SimilarityError";
  }
}

function windows(pitches: readonly number[]): number[][] {
  if (pitches.length < 8 || !pitches.every(Number.isFinite)) throw new RangeError("Similarity screening requires at least eight finite notes per melody");
  const intervals = pitches.slice(1).map((right, i) => right - pitches[i]);
  const unique = new Map<string, number[]>();
  for (let i = 0; i <= intervals.length - WINDOW; i++) {
    const window = intervals.slice(i, i + WINDOW);
    unique.set(JSON.stringify(window), window);
  }
  return [...unique.values()].sort((a, b) => {
    for (let i = 0; i < WINDOW; i++) if (a[i] !== b[i]) return a[i] - b[i];
    return 0;
  });
}

/** Ratcliff–Obershelp matching blocks with Python's earliest-a/earliest-b tie break, not LCS. */
function sequence_ratio(a: readonly number[], b: readonly number[]): number {
  const queue: [number, number, number, number][] = [[0, a.length, 0, b.length]];
  let matches = 0;
  while (queue.length) {
    const [alo, ahi, blo, bhi] = queue.pop()!;
    let bestA = alo, bestB = blo, bestSize = 0;
    let previous = new Map<number, number>();
    for (let i = alo; i < ahi; i++) {
      const next = new Map<number, number>();
      for (let j = blo; j < bhi; j++) if (a[i] === b[j]) {
        const size = (previous.get(j - 1) ?? 0) + 1;
        next.set(j, size);
        if (size > bestSize) { bestA = i - size + 1; bestB = j - size + 1; bestSize = size; }
      }
      previous = next;
    }
    if (!bestSize) continue;
    matches += bestSize;
    if (alo < bestA && blo < bestB) queue.push([alo, bestA, blo, bestB]);
    if (bestA + bestSize < ahi && bestB + bestSize < bhi) queue.push([bestA + bestSize, ahi, bestB + bestSize, bhi]);
  }
  return 2 * matches / (a.length + b.length);
}

/** Compare seven-interval windows independent of transposition and tempo. */
export function similarity(left: readonly number[], right: readonly number[]): number {
  const a = windows(left), b = windows(right);
  let maximum = 0;
  for (const x of a) for (const y of b) {
    maximum = Math.max(maximum, sequence_ratio(x, y));
    if (maximum === 1) return maximum;
  }
  return maximum;
}

/** Screen every supplied part against the corpus and history; one failure blocks all parts. */
export function screen(melodies: Readonly<Record<string, readonly number[]>>, history: Readonly<Record<string, readonly number[]>> | null = null): SimilarityReport {
  const references = { ...REFERENCES, ...history };
  let maximum = -1, closest = "";
  for (const [part, pitches] of Object.entries(melodies)) for (const [name, reference] of Object.entries(references)) {
    const score = similarity(pitches, reference);
    if (score > maximum) { maximum = score; closest = `${part}/${name}`; }
  }
  if (maximum < 0) throw new RangeError("No melodies supplied for similarity screening");
  const report = SimilarityReport.parse({ maximum_similarity: maximum, closest_reference: closest, references_checked: Object.keys(references).length, passed: maximum < THRESHOLD });
  if (!report.passed) throw new SimilarityError(report);
  return report;
}

/** Select at most eight local candidates; explicit seeds never silently change.
 * @returns Seed, candidate, melodic parts and passing report, in that order.
 */
export function select_screened<Candidate>(build: (seed: Seed) => [Candidate, Record<string, number[]>], { seed, history = null }: { seed: Seed | null; history?: Readonly<Record<string, readonly number[]>> | null }): [Seed, Candidate, Record<string, number[]>, SimilarityReport] {
  if (seed !== null) seed = parse_seed(seed);
  for (let attempt = 1; attempt <= MAX_CANDIDATES; attempt++) {
    const chosen_seed = seed ?? randomBytes(7).readUIntBE(0, 6) * 32 + (randomBytes(1)[0] & 31);
    const [candidate, melodies] = build(chosen_seed);
    try { return [chosen_seed, candidate, melodies, screen(melodies, history)]; }
    catch (error) {
      if (!(error instanceof SimilarityError) || seed !== null || attempt === MAX_CANDIDATES) throw error;
    }
  }
  throw new Error("Candidate selection exhausted without a screening result");
}
