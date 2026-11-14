"""Private local artifact store and single-owner durable composition/render queue."""

from __future__ import annotations

import hashlib
import json
import logging
import os
import sqlite3
import uuid
from contextlib import closing
from dataclasses import asdict
from datetime import UTC, datetime
from pathlib import Path

from opentelemetry import trace

from audio_poc.dsp import normalize, synthesize, write_midi, write_wav
from audio_poc.melody import (
    Arrangement,
    Chord,
    CompositionRequest,
    Contract,
    ProductPath,
    SyllableNote,
    arrange,
)
from audio_poc.similarity import (
    SimilarityError,
    SimilarityReport,
    screen,
    select_screened,
)

LOGGER = logging.getLogger(__name__)
TRACER = trace.get_tracer(__name__)
ARTIFACT_TYPES = {
    "score.mid": "audio/midi",
    "score.json": "application/json",
    "timing.json": "application/json",
    "backing.wav": "audio/wav",
    "provenance.json": "application/json",
}


class JobConflict(ValueError):
    """A logical job identity was reused for a different composition request."""


class JobNotFound(LookupError):
    """No committed job or allowed artifact exists for this identity."""


class CompositionUnavailable(RuntimeError):
    """Composition storage or artifact generation could not complete."""


class Artifact(Contract):
    """Opaque MCP resource reference with integrity and media information."""

    uri: str
    media_type: str
    sha256: str


class Component(Contract):
    """An audio component's source, without making a legal ownership assertion."""

    component: str
    origin: str
    evidence: str
    commercial_use_basis: str | None = None
    status: str = "Pending human rights review"


class CompositionResult(Contract):
    """One screened arrangement and exactly one durable queued render identity."""

    schema_version: int = 1
    job_id: str
    logical_job_id: str
    status: str = "queued"
    queue_owner: str = "melody-arrangement"
    queue_backend: str = "sqlite-local"
    product_path: ProductPath
    seed: int
    duration_seconds: int = 30
    style: str = "retro-synth"
    midi: Artifact
    backing_tracks: list[Artifact]
    artifacts: dict[str, Artifact]
    chords: list[Chord]
    syllable_timing: list[SyllableNote]
    similarity: SimilarityReport
    components: list[Component]
    ai_generated: bool = True


def _json(value: object) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False)


class MelodyService:
    """Serialize screening/history and job insertion in one SQLite transaction.

    This is a local single-host queue, not an Azure broker. The workflow consumes
    the returned job identity and must not enqueue a second copy. No vocal or
    cloud render is started by this service.
    """

    def __init__(self, root: Path) -> None:
        self.root = root.expanduser().resolve()
        self.root.mkdir(parents=True, mode=0o700, exist_ok=True)
        self.root.chmod(0o700)
        self.artifact_dir = self.root / "artifacts"
        self.artifact_dir.mkdir(mode=0o700, exist_ok=True)
        self.database_path = self.root / "melody.sqlite3"
        descriptor = os.open(self.database_path, os.O_CREAT | os.O_RDWR, 0o600)
        os.close(descriptor)
        self.database_path.chmod(0o600)
        with closing(self._connect()) as connection, connection:
            connection.execute("""
                CREATE TABLE IF NOT EXISTS render_jobs (
                    job_id TEXT PRIMARY KEY,
                    logical_job_id TEXT NOT NULL UNIQUE,
                    request_json TEXT NOT NULL,
                    result_json TEXT NOT NULL,
                    melodies_json TEXT NOT NULL,
                    status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed')),
                    created_at TEXT NOT NULL
                )
            """)
            connection.execute("""
                CREATE TABLE IF NOT EXISTS local_outputs (
                    output_id TEXT PRIMARY KEY,
                    melodies_json TEXT NOT NULL
                )
            """)

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.database_path, timeout=60)
        connection.row_factory = sqlite3.Row
        return connection

    def submit(self, request: CompositionRequest) -> CompositionResult:
        """Validate, screen, persist assets and atomically enqueue one logical job.

        Retries of the same normalized request return its original identity and
        seed, including across restarts. Changed requests require a new identity.
        """
        with TRACER.start_as_current_span(
            "compose.arrangement", kind=trace.SpanKind.SERVER
        ):
            try:
                return self._submit(request)
            except (JobConflict, SimilarityError):
                LOGGER.warning(
                    "Composition request rejected; no new render job submitted"
                )
                raise
            except (OSError, sqlite3.Error) as error:
                LOGGER.error("Composition storage failed; no successful delivery")
                raise CompositionUnavailable(
                    "Composition storage is unavailable; retry the same logical job ID"
                ) from error

    def _submit(self, request: CompositionRequest) -> CompositionResult:
        canonical = _json(request.model_dump())
        with closing(self._connect()) as connection, connection:
            connection.execute("BEGIN IMMEDIATE")
            existing = connection.execute(
                "SELECT request_json, result_json, status FROM render_jobs WHERE logical_job_id = ?",
                (request.logical_job_id,),
            ).fetchone()
            if existing is not None:
                if canonical != existing["request_json"]:
                    raise JobConflict(
                        "Logical job ID already belongs to a different request"
                    )
                return CompositionResult.model_validate_json(
                    existing["result_json"]
                ).model_copy(update={"status": existing["status"]})

            def candidate(seed: int) -> tuple[Arrangement, dict[str, list[int]]]:
                arrangement = arrange(request, seed)
                return arrangement, {
                    "lead": [
                        note.pitch
                        for note in arrangement.backing
                        if note.instrument == "lead"
                    ],
                    "vocal": [note.pitch for note in arrangement.vocal],
                }

            seed, arrangement, melodies, report = select_screened(
                candidate, seed=request.seed, history=self._history(connection)
            )
            job_id = str(uuid.uuid4())
            directory = self.artifact_dir / job_id
            directory.mkdir(mode=0o700)
            components = [
                Component(
                    component="melody_and_chords",
                    origin="Seeded phrase composer in audio_poc/dsp.py and audio_poc/melody.py",
                    evidence="score.json, score.mid, timing.json and recorded seed",
                ),
                Component(
                    component="instruments",
                    origin="Harmonic oscillators, synthesized kick and seeded noise in audio_poc/dsp.py",
                    evidence="backing.wav; no samples, recordings or SoundFonts",
                ),
                Component(
                    component="lyrics",
                    origin="Caller-supplied lyric/timing contract",
                    evidence="Retained request; upstream moderation and rights review required",
                ),
            ]
            try:
                notes = arrangement.backing + arrangement.vocal
                write_midi(directory / "score.mid", notes)
                (directory / "score.json").write_text(
                    _json([asdict(note) for note in notes]), encoding="utf-8"
                )
                (directory / "timing.json").write_text(
                    _json([row.model_dump() for row in arrangement.timing]),
                    encoding="utf-8",
                )
                write_wav(
                    directory / "backing.wav",
                    normalize(synthesize(arrangement.backing, seed=seed)),
                )
                (directory / "provenance.json").write_text(
                    _json(
                        {
                            "ai_generated": True,
                            "seed": seed,
                            "components": [row.model_dump() for row in components],
                            "similarity": report.model_dump(),
                        }
                    ),
                    encoding="utf-8",
                )
                artifacts = {
                    name: Artifact(
                        uri=f"earwyrm://jobs/{job_id}/{name}",
                        media_type=media_type,
                        sha256=hashlib.sha256(
                            (directory / name).read_bytes()
                        ).hexdigest(),
                    )
                    for name, media_type in ARTIFACT_TYPES.items()
                }
                result = CompositionResult(
                    job_id=job_id,
                    logical_job_id=request.logical_job_id,
                    product_path=request.product_path,
                    seed=seed,
                    midi=artifacts["score.mid"],
                    backing_tracks=[artifacts["backing.wav"]],
                    artifacts=artifacts,
                    chords=arrangement.chords,
                    syllable_timing=arrangement.timing,
                    similarity=report,
                    components=components,
                )
                with TRACER.start_as_current_span(
                    "publish.render", kind=trace.SpanKind.PRODUCER
                ):
                    connection.execute(
                        "INSERT INTO render_jobs VALUES (?, ?, ?, ?, ?, 'queued', ?)",
                        (
                            job_id,
                            request.logical_job_id,
                            canonical,
                            result.model_dump_json(),
                            _json(melodies),
                            datetime.now(UTC).isoformat(),
                        ),
                    )
                    connection.commit()
            except (OSError, ValueError, sqlite3.Error):
                for name in ARTIFACT_TYPES:
                    (directory / name).unlink(missing_ok=True)
                directory.rmdir()
                raise
        LOGGER.info("Screened arrangement persisted and one local render job queued")
        return result

    @staticmethod
    def _history(connection: sqlite3.Connection) -> dict[str, list[int]]:
        return {
            f"earwyrm:{row['identity']}:{part}": pitches
            for row in connection.execute(
                "SELECT job_id AS identity, melodies_json FROM render_jobs "
                "UNION ALL SELECT output_id AS identity, melodies_json FROM local_outputs"
            )
            for part, pitches in json.loads(row["melodies_json"]).items()
        }

    def record_local_output(
        self, output_id: str, melodies: dict[str, list[int]]
    ) -> SimilarityReport:
        """Screen/archive the synchronous POC output without queueing another job."""
        try:
            with closing(self._connect()) as connection, connection:
                connection.execute("BEGIN IMMEDIATE")
                report = screen(melodies, self._history(connection))
                connection.execute(
                    "INSERT INTO local_outputs VALUES (?, ?)",
                    (output_id, _json(melodies)),
                )
                return report
        except (OSError, sqlite3.Error) as error:
            LOGGER.error("Melody history could not be recorded; delivery blocked")
            raise CompositionUnavailable("Melody history is unavailable") from error

    def history_snapshot(self) -> dict[str, list[int]]:
        """Read prior melodies for preflight; publication must recheck atomically."""
        try:
            with closing(self._connect()) as connection:
                return self._history(connection)
        except sqlite3.Error as error:
            LOGGER.error("Melody history is unavailable; composition blocked")
            raise CompositionUnavailable("Melody history is unavailable") from error

    def get_job(self, job_id: uuid.UUID) -> CompositionResult:
        """Read a committed result; unknown identities reveal no filesystem paths."""
        with closing(self._connect()) as connection:
            row = connection.execute(
                "SELECT result_json, status FROM render_jobs WHERE job_id = ?",
                (str(job_id),),
            ).fetchone()
        if row is None:
            raise JobNotFound("Composition job was not found")
        result = CompositionResult.model_validate_json(row["result_json"])
        return result.model_copy(update={"status": row["status"]})

    def read_artifact(self, job_id: uuid.UUID, name: str) -> bytes:
        """Read an allowlisted, integrity-checked resource from a committed job."""
        if name not in ARTIFACT_TYPES:
            raise JobNotFound("Composition artifact was not found")
        result = self.get_job(job_id)
        try:
            content = (self.artifact_dir / str(job_id) / name).read_bytes()
        except OSError as error:
            raise CompositionUnavailable(
                "Composition artifact is unavailable"
            ) from error
        if hashlib.sha256(content).hexdigest() != result.artifacts[name].sha256:
            raise CompositionUnavailable("Composition artifact integrity check failed")
        return content
