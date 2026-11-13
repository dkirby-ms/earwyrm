"""Private local storage for web-rendered audio and evaluation evidence."""

from __future__ import annotations

import json
import os
import sqlite3
import uuid
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path
from typing import Any


class StorageConflict(RuntimeError):
    """Raised when a paid render conflicts with the durable usage ledger."""


class StorageNotFound(LookupError):
    """Raised when a user-owned storage record does not exist."""


class WebStorage:
    """Store owner-scoped records in SQLite and media in a private directory."""

    def __init__(self, root: Path) -> None:
        self.root = root.expanduser().resolve()
        web_root = (Path(__file__).resolve().parent / "web").resolve()
        if self.root == web_root or web_root in self.root.parents:
            raise ValueError("Private data directory must be outside the web root")
        self.audio_dir = self.root / "audio"
        self.work_dir = self.root / "work"
        self.database_path = self.root / "earwyrm.sqlite3"
        self.root.mkdir(parents=True, mode=0o700, exist_ok=True)
        self.audio_dir.mkdir(mode=0o700, exist_ok=True)
        self.work_dir.mkdir(mode=0o700, exist_ok=True)
        self.root.chmod(0o700)
        self.audio_dir.chmod(0o700)
        self.work_dir.chmod(0o700)
        descriptor = os.open(self.database_path, os.O_CREAT | os.O_RDWR, 0o600)
        os.close(descriptor)
        self.database_path.chmod(0o600)
        self._initialize()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.database_path, timeout=5.0)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("PRAGMA busy_timeout = 5000")
        return connection

    def _initialize(self) -> None:
        with self._connect() as connection:
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS runs (
                    run_id TEXT PRIMARY KEY,
                    owner TEXT NOT NULL,
                    mode TEXT NOT NULL CHECK (mode IN ('instrumental', 'azure')),
                    brief_ids_json TEXT NOT NULL,
                    status TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS runs_owner_created
                    ON runs(owner, created_at);
                CREATE TABLE IF NOT EXISTS paid_attempts (
                    attempt_id TEXT PRIMARY KEY,
                    run_id TEXT NOT NULL UNIQUE REFERENCES runs(run_id),
                    owner TEXT NOT NULL,
                    brief_ids_json TEXT NOT NULL,
                    per_brief_estimates_json TEXT NOT NULL,
                    estimated_cost_usd TEXT NOT NULL,
                    submitted_characters INTEGER NOT NULL,
                    status TEXT NOT NULL,
                    evidence_json TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    actual_cost_usd TEXT,
                    reconciliation_reference TEXT,
                    reconciled_at TEXT
                );
                CREATE TABLE IF NOT EXISTS outputs (
                    output_id TEXT PRIMARY KEY,
                    run_id TEXT NOT NULL REFERENCES runs(run_id),
                    owner TEXT NOT NULL,
                    brief_id TEXT NOT NULL,
                    variant TEXT NOT NULL,
                    audio_filename TEXT NOT NULL UNIQUE,
                    manifest_json TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    UNIQUE(run_id, brief_id, variant)
                );
                CREATE INDEX IF NOT EXISTS outputs_owner_created
                    ON outputs(owner, created_at);
                CREATE TABLE IF NOT EXISTS evaluations (
                    output_id TEXT PRIMARY KEY REFERENCES outputs(output_id),
                    owner TEXT NOT NULL,
                    brand_transcription TEXT NOT NULL,
                    cta_transcription TEXT NOT NULL,
                    self_rating TEXT NOT NULL,
                    brand_match INTEGER NOT NULL,
                    cta_match INTEGER NOT NULL,
                    created_at TEXT NOT NULL
                );
                """
            )

    @staticmethod
    def _now() -> str:
        return datetime.now(UTC).isoformat()

    @staticmethod
    def _json(value: object) -> str:
        return json.dumps(value, separators=(",", ":"), allow_nan=False)

    def create_run(
        self, run_id: str, owner: str, mode: str, brief_ids: list[str]
    ) -> None:
        with self._connect() as connection:
            connection.execute(
                "INSERT INTO runs VALUES (?, ?, ?, ?, ?, ?)",
                (
                    run_id,
                    owner,
                    mode,
                    self._json(brief_ids),
                    "rendering",
                    self._now(),
                ),
            )

    def has_unreconciled_paid_attempt(self) -> bool:
        """Return whether any paid attempt still holds the global reservation."""
        with self._connect() as connection:
            row = connection.execute(
                "SELECT 1 FROM paid_attempts WHERE status != 'reconciled' LIMIT 1"
            ).fetchone()
        return row is not None

    def reserve_paid_run(
        self,
        *,
        run_id: str,
        attempt_id: str,
        owner: str,
        brief_ids: list[str],
        per_brief_estimates: dict[str, str],
        estimated_cost_usd: Decimal,
        submitted_characters: int,
        total_budget_usd: Decimal,
        evidence: dict[str, object],
    ) -> None:
        """Atomically reserve cumulative budget and persist the attempt first."""
        with self._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            unresolved = connection.execute(
                "SELECT 1 FROM paid_attempts WHERE status != 'reconciled' LIMIT 1"
            ).fetchone()
            if unresolved is not None:
                raise StorageConflict("A prior paid attempt needs reconciliation")

            spent = Decimal(0)
            for row in connection.execute(
                "SELECT status, estimated_cost_usd, actual_cost_usd FROM paid_attempts"
            ):
                cost = (
                    row["actual_cost_usd"]
                    if row["status"] == "reconciled"
                    else row["estimated_cost_usd"]
                )
                spent += Decimal(cost)
            if spent + estimated_cost_usd > total_budget_usd:
                raise StorageConflict("Cumulative Speech budget would be exceeded")

            now = self._now()
            connection.execute(
                "INSERT INTO runs VALUES (?, ?, ?, ?, ?, ?)",
                (
                    run_id,
                    owner,
                    "azure",
                    self._json(brief_ids),
                    "rendering",
                    now,
                ),
            )
            connection.execute(
                """
                INSERT INTO paid_attempts (
                    attempt_id, run_id, owner, brief_ids_json,
                    per_brief_estimates_json, estimated_cost_usd,
                    submitted_characters, status, evidence_json, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    attempt_id,
                    run_id,
                    owner,
                    self._json(brief_ids),
                    self._json(per_brief_estimates),
                    str(estimated_cost_usd),
                    submitted_characters,
                    "reserved",
                    self._json(evidence),
                    now,
                ),
            )

    def mark_attempt_submitted(self, attempt_id: str) -> None:
        self._update_attempt_status(attempt_id, "submitted")

    def finish_attempt(self, attempt_id: str, status: str) -> None:
        if status not in {"awaiting_reconciliation", "failed_or_unknown"}:
            raise ValueError("Invalid paid-attempt status")
        self._update_attempt_status(attempt_id, status)

    def _update_attempt_status(self, attempt_id: str, status: str) -> None:
        with self._connect() as connection:
            cursor = connection.execute(
                "UPDATE paid_attempts SET status = ? WHERE attempt_id = ?",
                (status, attempt_id),
            )
            if cursor.rowcount != 1:
                raise StorageNotFound("Paid attempt was not found")

    def set_run_status(self, run_id: str, status: str) -> None:
        with self._connect() as connection:
            cursor = connection.execute(
                "UPDATE runs SET status = ? WHERE run_id = ?",
                (status, run_id),
            )
            if cursor.rowcount != 1:
                raise StorageNotFound("Render run was not found")

    def save_output(
        self,
        *,
        run_id: str,
        owner: str,
        manifest: dict[str, Any],
        audio: bytes,
        attempt_id: str | None = None,
    ) -> dict[str, Any]:
        """Persist a generated WAV under a new ID and save its safe manifest."""
        output_id = str(uuid.uuid4())
        filename = f"{output_id}.wav"
        path = self.audio_dir / filename
        path.write_bytes(audio)
        path.chmod(0o600)
        manifest["output_id"] = output_id
        manifest["file"] = filename
        if attempt_id is not None:
            manifest["azure_usage"]["attempt_id"] = attempt_id
        try:
            with self._connect() as connection:
                connection.execute(
                    """
                    INSERT INTO outputs (
                        output_id, run_id, owner, brief_id, variant,
                        audio_filename, manifest_json, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        output_id,
                        run_id,
                        owner,
                        manifest["brief_id"],
                        manifest["variant"],
                        filename,
                        self._json(manifest),
                        self._now(),
                    ),
                )
        except sqlite3.Error:
            path.unlink(missing_ok=True)
            raise
        return manifest

    def _output(self, row: sqlite3.Row) -> dict[str, Any]:
        evaluation = None
        if row["evaluation_created_at"] is not None:
            evaluation = {
                "brand_transcription": row["brand_transcription"],
                "cta_transcription": row["cta_transcription"],
                "self_rating": row["self_rating"],
                "brand_match": bool(row["brand_match"]),
                "cta_match": bool(row["cta_match"]),
                "created_at": row["evaluation_created_at"],
            }
        attempt = None
        if row["attempt_id"] is not None:
            attempt = {
                "attempt_id": row["attempt_id"],
                "status": row["attempt_status"],
                "brief_ids": json.loads(row["attempt_brief_ids_json"]),
                "per_brief_estimates": json.loads(row["per_brief_estimates_json"]),
                "estimated_cost_usd": row["estimated_cost_usd"],
                "submitted_characters": row["submitted_characters"],
                "evidence": json.loads(row["attempt_evidence_json"]),
                "actual_cost_usd": row["actual_cost_usd"],
                "reconciliation_reference": row["reconciliation_reference"],
            }
        return {
            "output_id": row["output_id"],
            "run_id": row["run_id"],
            "brief_id": row["brief_id"],
            "variant": row["variant"],
            "audio_filename": row["audio_filename"],
            "manifest": json.loads(row["manifest_json"]),
            "evaluation": evaluation,
            "attempt": attempt,
        }

    @staticmethod
    def _output_select() -> str:
        return """
            SELECT o.*, e.brand_transcription, e.cta_transcription,
                e.self_rating, e.brand_match, e.cta_match,
                e.created_at AS evaluation_created_at,
                a.attempt_id, a.status AS attempt_status,
                a.brief_ids_json AS attempt_brief_ids_json,
                a.per_brief_estimates_json, a.estimated_cost_usd,
                a.submitted_characters, a.evidence_json AS attempt_evidence_json,
                a.actual_cost_usd, a.reconciliation_reference
            FROM outputs o
            LEFT JOIN evaluations e ON e.output_id = o.output_id
            LEFT JOIN paid_attempts a ON a.run_id = o.run_id
        """

    def get_output(self, output_id: str, owner: str) -> dict[str, Any] | None:
        with self._connect() as connection:
            row = connection.execute(
                self._output_select() + " WHERE o.output_id = ? AND o.owner = ?",
                (output_id, owner),
            ).fetchone()
        return self._output(row) if row is not None else None

    def list_outputs(self, owner: str) -> list[dict[str, Any]]:
        with self._connect() as connection:
            rows = connection.execute(
                self._output_select()
                + " WHERE o.owner = ? ORDER BY o.created_at, o.output_id",
                (owner,),
            ).fetchall()
        return [self._output(row) for row in rows]

    def audio_path(self, output: dict[str, Any]) -> Path:
        filename = output["audio_filename"]
        if Path(filename).name != filename or not filename.endswith(".wav"):
            raise ValueError("Stored audio filename is invalid")
        return self.audio_dir / filename

    def get_run(self, run_id: str, owner: str) -> dict[str, Any] | None:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT * FROM runs WHERE run_id = ? AND owner = ?",
                (run_id, owner),
            ).fetchone()
            if row is None:
                return None
            attempt = connection.execute(
                "SELECT * FROM paid_attempts WHERE run_id = ? AND owner = ?",
                (run_id, owner),
            ).fetchone()
        outputs = [
            output for output in self.list_outputs(owner) if output["run_id"] == run_id
        ]
        result: dict[str, Any] = {
            "run_id": row["run_id"],
            "mode": row["mode"],
            "brief_ids": json.loads(row["brief_ids_json"]),
            "status": row["status"],
            "created_at": row["created_at"],
            "outputs": outputs,
        }
        if attempt is not None:
            result["attempt"] = {
                "attempt_id": attempt["attempt_id"],
                "status": attempt["status"],
                "estimated_cost_usd": attempt["estimated_cost_usd"],
                "actual_cost_usd": attempt["actual_cost_usd"],
                "reconciliation_reference": attempt["reconciliation_reference"],
            }
        return result

    def list_runs(self, owner: str) -> list[dict[str, Any]]:
        """List a user's recent runs so a disconnected client can recover status."""
        with self._connect() as connection:
            rows = connection.execute(
                "SELECT run_id FROM runs WHERE owner = ? ORDER BY created_at DESC",
                (owner,),
            ).fetchall()
        return [
            result
            for row in rows
            if (result := self.get_run(row["run_id"], owner)) is not None
        ]

    def save_evaluation(
        self,
        *,
        output_id: str,
        owner: str,
        brand_transcription: str,
        cta_transcription: str,
        self_rating: str,
        brand_match: bool,
        cta_match: bool,
    ) -> bool:
        """Persist the first evaluation only; return false on resubmission."""
        with self._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            output = connection.execute(
                "SELECT 1 FROM outputs WHERE output_id = ? AND owner = ?",
                (output_id, owner),
            ).fetchone()
            if output is None:
                raise StorageNotFound("Output was not found")
            existing = connection.execute(
                "SELECT 1 FROM evaluations WHERE output_id = ?", (output_id,)
            ).fetchone()
            if existing is not None:
                return False
            connection.execute(
                """
                INSERT INTO evaluations (
                    output_id, owner, brand_transcription, cta_transcription,
                    self_rating, brand_match, cta_match, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    output_id,
                    owner,
                    brand_transcription,
                    cta_transcription,
                    self_rating,
                    int(brand_match),
                    int(cta_match),
                    self._now(),
                ),
            )
        return True

    def reconcile_attempt(
        self,
        *,
        attempt_id: str,
        owner: str,
        actual_cost_usd: Decimal,
        evidence_reference: str,
    ) -> dict[str, Any]:
        """Record one immutable actual-usage reconciliation for an owned attempt."""
        with self._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            row = connection.execute(
                "SELECT * FROM paid_attempts WHERE attempt_id = ? AND owner = ?",
                (attempt_id, owner),
            ).fetchone()
            if row is None:
                raise StorageNotFound("Paid attempt was not found")
            if row["status"] not in {
                "reserved",
                "submitted",
                "awaiting_reconciliation",
                "failed_or_unknown",
            }:
                raise StorageConflict("Paid attempt is not ready for reconciliation")
            connection.execute(
                """
                UPDATE paid_attempts SET status = 'reconciled',
                    actual_cost_usd = ?, reconciliation_reference = ?,
                    reconciled_at = ? WHERE attempt_id = ?
                """,
                (
                    str(actual_cost_usd),
                    evidence_reference,
                    self._now(),
                    attempt_id,
                ),
            )
            total_estimate = Decimal(row["estimated_cost_usd"])
            per_brief_estimates = json.loads(row["per_brief_estimates_json"])
            for output_row in connection.execute(
                "SELECT output_id, brief_id, manifest_json FROM outputs WHERE run_id = ?",
                (row["run_id"],),
            ):
                manifest = json.loads(output_row["manifest_json"])
                usage = manifest["azure_usage"]
                allocated = (
                    actual_cost_usd
                    * Decimal(per_brief_estimates[output_row["brief_id"]])
                    / total_estimate
                    / Decimal(2)
                )
                usage.update(
                    billing_reconciled=True,
                    actual_allocated_cost_usd=str(allocated),
                    reconciliation_reference=evidence_reference,
                    reconciliation_basis=(
                        "Actual batch meter allocated by estimated brief cost, "
                        "then 50/50 across paired outputs"
                    ),
                )
                connection.execute(
                    "UPDATE outputs SET manifest_json = ? WHERE output_id = ?",
                    (self._json(manifest), output_row["output_id"]),
                )
        result = self.get_attempt(attempt_id, owner)
        if result is None:
            raise StorageNotFound("Paid attempt was not found")
        return result

    def get_attempt(self, attempt_id: str, owner: str) -> dict[str, Any] | None:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT * FROM paid_attempts WHERE attempt_id = ? AND owner = ?",
                (attempt_id, owner),
            ).fetchone()
        if row is None:
            return None
        return {
            "attempt_id": row["attempt_id"],
            "run_id": row["run_id"],
            "owner": row["owner"],
            "brief_ids": json.loads(row["brief_ids_json"]),
            "per_brief_estimates": json.loads(row["per_brief_estimates_json"]),
            "estimated_cost_usd": row["estimated_cost_usd"],
            "submitted_characters": row["submitted_characters"],
            "status": row["status"],
            "evidence": json.loads(row["evidence_json"]),
            "actual_cost_usd": row["actual_cost_usd"],
            "reconciliation_reference": row["reconciliation_reference"],
        }
