"""Start one web worker only when its persistent mount is available and unlocked."""

from __future__ import annotations

import fcntl
import os
import sqlite3
from contextlib import closing
from pathlib import Path

from audio_poc.melody_service import MelodyService
from audio_poc.web_storage import WebStorage


def _is_mounted(data_dir: Path) -> bool:
    mount_path = str(data_dir.resolve())
    escaped_path = (
        mount_path.replace("\\", "\\134")
        .replace(" ", "\\040")
        .replace("\t", "\\011")
        .replace("\n", "\\012")
    )
    with Path("/proc/self/mountinfo").open(encoding="utf-8") as mounts:
        return any(line.split()[4] == escaped_path for line in mounts)


def acquire_writer_lock(data_dir: Path) -> int:
    """Return an inheritable descriptor holding the mount's exclusive writer lock."""
    if not data_dir.is_absolute():
        raise ValueError("EARWYRM_DATA_DIR must be an absolute mount path")
    if not _is_mounted(data_dir):
        raise RuntimeError(f"Data directory is not a mounted volume: {data_dir}")

    descriptor = os.open(
        data_dir / ".earwyrm-writer.lock",
        os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW,
        0o600,
    )
    try:
        fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
        os.set_inheritable(descriptor, True)
    except OSError:
        os.close(descriptor)
        raise
    return descriptor


def prepare_databases(data_dir: Path) -> None:
    """Initialize a new store or validate both existing rollback-journal databases."""
    databases = (data_dir / "earwyrm.sqlite3", data_dir / "melody" / "melody.sqlite3")
    marker = data_dir / ".earwyrm-initialized"
    if marker.exists() and not all(path.is_file() for path in databases):
        raise RuntimeError("Initialized data store is missing a database")

    def check_journals() -> None:
        for path in databases:
            if path.exists():
                with closing(sqlite3.connect(f"{path.as_uri()}?mode=rw", uri=True)) as db:
                    mode = db.execute("PRAGMA journal_mode").fetchone()[0]
                    if mode not in {"delete", "truncate", "persist"}:
                        raise RuntimeError(f"Unsupported SQLite journal mode: {mode}")

    check_journals()
    WebStorage(data_dir)
    MelodyService(data_dir / "melody")
    check_journals()
    marker.touch(mode=0o600, exist_ok=True)


def main() -> None:
    """Hold the mount lock for the lifetime of the single Uvicorn process."""
    value = os.environ.get("EARWYRM_DATA_DIR")
    if not value:
        raise RuntimeError("EARWYRM_DATA_DIR must name the mounted volume")
    descriptor = acquire_writer_lock(Path(value))
    try:
        prepare_databases(Path(value))
        os.execvp(
            "uvicorn",
            [
                "uvicorn",
                "audio_poc.web_app:app",
                "--host",
                "0.0.0.0",
                "--port",
                "8080",
                "--workers",
                "1",
                "--no-access-log",
            ],
        )
    finally:
        os.close(descriptor)


if __name__ == "__main__":
    main()
