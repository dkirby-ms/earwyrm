import { SpanKind, trace } from "@opentelemetry/api";
import { z } from "zod";
import { Assessment, CloudFailure, ModelRefusal, Preflight, Screening, type LyricBackend } from "./lyric_cloud.js";
import { GuidedLyricCandidate, LyricDraft, LyricRequest, LyricResult, LyricRuleError, validate_draft } from "./lyrics.js";

export const IMITATION = /\b(in (?:the )?style of|sound(?:s)? like|inspired by|imitat\w*|channel(?:ing)?|sing like|write like|tribute to)\b/i;
export const RISK = /[$%]|\b(dollars?|cents?|pounds?|euros?|price|free|discount|sale|best|finest|cheapest|fastest|greatest|leading|guarantee\w*|health|medical|dental|clinic|pharmacy|wellness|medicine|treatment|supplement|cure|financial|insurance|investment|loan|credit|bank|mortgage|alcohol|beer|wine|spirits|brewery|pub|bar|cannabis|gambling|casino|vape|tobacco)\b/i;
const TRACER = trace.getTracer("earwyrm.lyric_service");
const GuidedBackendDraft = GuidedLyricCandidate.extend({ hook: z.unknown().optional() });

function parse_candidate(request: LyricRequest, data: unknown): LyricDraft | undefined {
  if (request.arrangement) {
    const parsed = GuidedBackendDraft.safeParse(data);
    if (!parsed.success) return undefined;
    data = { ...parsed.data, hook: parsed.data.lyrics.split("\n", 1)[0] };
  }
  const parsed = LyricDraft.safeParse(data);
  return parsed.success ? parsed.data : undefined;
}

function brief_text(request: LyricRequest): string {
  const brief = request.brief;
  return [brief.name, brief.offer, brief.location, brief.tone, ...brief.approved_claims, request.cta, request.creative_direction ?? ""].join("\n");
}

/** Fail-closed writer owning one initial generation attempt and exactly three retries. */
export class LyricWriter {
  constructor(readonly backend: LyricBackend) {}

  /** Resolve to screened lyrics or an explicit safe outcome; notify immediately before external safety checks. */
  async write(request: LyricRequest, on_screen?: () => void): Promise<LyricResult> {
    request = LyricRequest.parse(request);
    return TRACER.startActiveSpan("create.lyrics", { kind: SpanKind.SERVER }, async span => {
      try { return await this.write_candidate(request, on_screen); }
      finally { span.end(); }
    });
  }

  private async write_candidate(request: LyricRequest, on_screen?: () => void): Promise<LyricResult> {
    let attempts = 0, feedback: string[] = [], pronunciation_line: number | undefined;
    const text = brief_text(request);
    const result = (status: LyricResult["status"], reasons: string[], output: LyricDraft | null = null): LyricResult => LyricResult.parse({ status, attempts, reasons, output });
    if (IMITATION.test(text)) return result("rejected", ["artist_imitation"]);
    try {
      const preflight = parse_evidence(Preflight, await this.backend.preflight(request), "malformed_assessment");
      if (preflight.artist_imitation || !preflight.english) return result("rejected", [preflight.artist_imitation ? "artist_imitation" : "unsupported_language"]);
      for (attempts = 1; attempts <= 4; attempts++) {
        let draft: LyricDraft;
        try {
          const previous_pronunciation_line = pronunciation_line;
          pronunciation_line = undefined;
          const raw = await this.backend.generate(request, feedback, previous_pronunciation_line);
          let data: unknown;
          try { data = JSON.parse(raw); }
          catch (error) { if (!(error instanceof SyntaxError)) throw error; feedback = ["malformed_lyric_output"]; continue; }
          const parsed = parse_candidate(request, data);
          if (!parsed) { feedback = ["malformed_lyric_output"]; continue; }
          draft = validate_draft(request, parsed);
        } catch (error) {
          if (error instanceof LyricRuleError) {
            feedback = [error.message];
            pronunciation_line = request.arrangement && error.message === "unknown_pronunciation" ? error.line : undefined;
            continue;
          }
          if (error instanceof CloudFailure && !(error instanceof ModelRefusal) && error.retryable) { feedback = [error.code]; continue; }
          throw error;
        }
        const assessment = parse_evidence(Assessment, await this.backend.assess(request, draft), "malformed_assessment");
        if (!assessment.english) return result("rejected", ["unsupported_output_language"]);
        if (!assessment.grounded) { feedback = ["unsupported_claims"]; continue; }
        on_screen?.();
        const screening = parse_evidence(Screening, await this.backend.screen(draft.lyrics), "malformed_safety_response");
        const reasons: string[] = [];
        if (!screening.moderation_passed) reasons.push("moderation_rejected");
        if (screening.protected_material_detected) reasons.push("protected_material");
        if (reasons.length) return result("rejected", reasons);
        const held = preflight.risky_claims || assessment.risky_claims || RISK.test(text) || RISK.test(draft.lyrics);
        return result(held ? "human_review_required" : "accepted", held ? ["risky_claims_require_human_review"] : [], draft);
      }
    } catch (error) {
      if (error instanceof ModelRefusal) return result("rejected", ["model_refusal"]);
      if (error instanceof CloudFailure) return result("unavailable", [error.code]);
      throw error;
    }
    attempts = 4;
    return result("retry_exhausted", feedback);
  }
}

function parse_evidence<T>(schema: z.ZodType<T>, value: unknown, code: string): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new CloudFailure(code);
  return parsed.data;
}
