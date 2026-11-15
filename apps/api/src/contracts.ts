import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { AdvertiserBrief, LyricRequest, LyricResult } from './lyrics.js';
import { CompositionRequest } from './melody.js';
import { Component, CompositionResult } from './melody_service.js';

const Identifier = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/);
const Digest = z.string().regex(/^[0-9a-f]{64}$/);
const Text = z.string().min(1).max(1000);
const Timestamp = z.iso.datetime({ offset: true });

/** Immutable candidate identity; regeneration must receive a new version UUID. */
export const VersionIdentity = z.strictObject({
  job_id: z.uuid(),
  version_id: z.uuid(),
  version_number: z.number().int().min(1),
  brief_id: z.string().regex(/^brief-[0-9]{3}$/),
});
export type VersionIdentity = z.infer<typeof VersionIdentity>;

/** Public failure metadata must contain no provider response or credential. */
export const ServiceError = z.strictObject({
  code: Identifier,
  message: Text,
  retryable: z.boolean(),
  trace_id: z.string().regex(/^[0-9a-f]{32}$/),
});

/** Private artifact reference, never a credential-bearing or SAS URL. */
export const BlobArtifact = z.strictObject({
  uri: z.string().max(2000).refine((value) => {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && !!url.hostname &&
        !url.username && !url.password && !url.search && !url.hash &&
        !value.includes('?') && !value.includes('#');
    } catch (error) {
      if (error instanceof TypeError) return false;
      throw error;
    }
  }, 'Artifact references require HTTPS without credentials or queries'),
  media_type: z.string().min(1).max(100),
  sha256: Digest,
});
export type BlobArtifact = z.infer<typeof BlobArtifact>;

/** Small version-one queue envelope; only the melody service owns submission. */
export const RenderMessage = z.strictObject({
  schema_version: z.literal(1).default(1),
  identity: VersionIdentity,
  composition: BlobArtifact,
  product_path: z.enum(['vocoded', 'spoken']),
  traceparent: z.string().regex(/^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/)
    .refine((value) => value.split('-')[1] !== '0'.repeat(32) &&
      value.split('-')[2] !== '0'.repeat(16), 'Trace and span IDs must be nonzero'),
});

/** Inclusive measured interval; missing evidence or bounds remain pending. */
export const QualityCheck = z.strictObject({
  measured: z.number().nullable().default(null),
  minimum: z.number().nullable().default(null),
  maximum: z.number().nullable().default(null),
  unit: z.enum(['s', 'LUFS', '1']),
  status: z.enum(['pass', 'fail', 'pending']),
  evidence: Text,
}).superRefine((check, context) => {
  if (check.minimum !== null && check.maximum !== null && check.minimum > check.maximum) {
    context.addIssue({ code: 'custom', message: 'Quality minimum exceeds maximum' });
  }
  const measurable = check.measured !== null && (check.minimum !== null || check.maximum !== null);
  const within = check.measured !== null &&
    (check.minimum === null || check.measured >= check.minimum) &&
    (check.maximum === null || check.measured <= check.maximum);
  const expected = !measurable ? 'pending' : within ? 'pass' : 'fail';
  if (check.status !== expected) {
    context.addIssue({ code: 'custom', message: 'Quality status must agree with measurements and configured limits' });
  }
});
export type QualityCheck = z.infer<typeof QualityCheck>;

/** Technical quality is independent of broadcast and rights approval. */
export const QualityReport = z.strictObject({
  schema_version: z.literal(1).default(1),
  identity: VersionIdentity,
  duration: QualityCheck,
  loudness: QualityCheck,
  intelligibility: QualityCheck,
  similarity: QualityCheck,
  status: z.enum(['pass', 'fail', 'pending']),
  checked_at: Timestamp,
}).superRefine((report, context) => {
  const statuses = [report.duration, report.loudness, report.intelligibility, report.similarity]
    .map((check) => check.status);
  const expected = statuses.includes('fail') ? 'fail' : statuses.includes('pending') ? 'pending' : 'pass';
  if (report.status !== expected) {
    context.addIssue({ code: 'custom', message: 'Overall quality must fail on failure and remain pending on missing evidence' });
  }
  if (report.duration.unit !== 's' || report.duration.minimum !== 29.5 ||
    report.duration.maximum !== 30 || report.loudness.unit !== 'LUFS' ||
    report.intelligibility.unit !== '1' || report.similarity.unit !== '1') {
    context.addIssue({ code: 'custom', message: 'Quality units and duration limits must match the v1 contract' });
  }
});

/** Authenticated human decision bound to an exact candidate and audio digest. */
export const ApprovalRecord = z.strictObject({
  schema_version: z.literal(1).default(1),
  approval_id: z.uuid(),
  identity: VersionIdentity,
  actor_object_id: z.uuid(),
  role: z.enum(['seller', 'advertiser', 'producer']),
  decision: z.enum(['approved', 'rejected']),
  artifact_sha256: Digest,
  recorded_at: Timestamp,
  note: z.string().max(1000).nullable().default(null),
});

function same_identity(left: VersionIdentity, right: VersionIdentity): boolean {
  return left.job_id === right.job_id && left.version_id === right.version_id &&
    left.version_number === right.version_number && left.brief_id === right.brief_id;
}

/** Immutable provenance joins only matching quality and approval versions. */
export const RenderManifest = z.strictObject({
  schema_version: z.literal(1).default(1),
  identity: VersionIdentity,
  product_path: z.enum(['vocoded', 'spoken']),
  audio: BlobArtifact,
  created_at: Timestamp,
  ai_generated: z.literal(true).default(true),
  disclosure: z.literal('AI-generated review demo; not cleared for broadcast')
    .default('AI-generated review demo; not cleared for broadcast'),
  components: z.array(Component).min(1),
  tool_versions: z.record(Identifier, Text).refine((value) => Object.keys(value).length > 0),
  speech_resource_id: Text,
  speech_result_id: Text,
  voice: z.literal('en-US-JennyNeural').default('en-US-JennyNeural'),
  quality: QualityReport,
  approvals: z.array(ApprovalRecord).default([]),
}).superRefine((manifest, context) => {
  if (!same_identity(manifest.quality.identity, manifest.identity) ||
    manifest.approvals.some((approval) => !same_identity(approval.identity, manifest.identity) ||
      approval.artifact_sha256 !== manifest.audio.sha256)) {
    context.addIssue({ code: 'custom', message: 'Quality and approvals must reference this exact version and audio' });
  }
});

/** Durable status is separate from queue delivery and human approval. */
export const JobRecord = z.strictObject({
  schema_version: z.literal(1).default(1),
  identity: VersionIdentity,
  status: z.enum(['queued', 'running', 'quality_failed', 'awaiting_approval', 'failed']),
  attempt: z.number().int().min(1).max(2),
  created_at: Timestamp,
  updated_at: Timestamp,
  error: ServiceError.nullable().default(null),
  manifest: BlobArtifact.nullable().default(null),
}).superRefine((job, context) => {
  if (Date.parse(job.updated_at) < Date.parse(job.created_at)) {
    context.addIssue({ code: 'custom', message: 'Job update cannot precede creation' });
  }
  if ((job.status === 'failed') !== (job.error !== null)) {
    context.addIssue({ code: 'custom', message: 'Only failed jobs require an error' });
  }
  if (['quality_failed', 'awaiting_approval'].includes(job.status) !== (job.manifest !== null)) {
    context.addIssue({ code: 'custom', message: 'Finished render states require a manifest; unfinished states cannot have one' });
  }
});

/** Schema catalog reuses the creative services' canonical definitions. */
export const ServiceContracts = z.strictObject({
  brief: AdvertiserBrief,
  lyric_request: LyricRequest,
  lyric_result: LyricResult,
  composition_request: CompositionRequest,
  composition_result: CompositionResult,
  render_message: RenderMessage,
  job: JobRecord,
  quality_report: QualityReport,
  manifest: RenderManifest,
  approval: ApprovalRecord,
});

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(JSON.stringify(z.toJSONSchema(ServiceContracts), null, 2));
}
