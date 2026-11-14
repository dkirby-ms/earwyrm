"""Initialize SQLite files without recreating an initialized cloud store."""

from __future__ import annotations

import os
import sqlite3
from pathlib import Path


def prepare_database_file(path: Path, marker: Path) -> None:
    """Create only a fresh store's database; a marked store must already exist."""
    flags = os.O_RDWR
    if not marker.exists():
        flags |= os.O_CREAT
    try:
        descriptor = os.open(path, flags, 0o600)
    except OSError as error:
        raise sqlite3.OperationalError(
            "Persistent database file is unavailable"
        ) from error
    os.close(descriptor)
    path.chmod(0o600)
