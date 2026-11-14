"""Run the independent local MCP server: uv run python -m audio_poc.melody_mcp."""

from __future__ import annotations

import argparse
import logging
import sqlite3
import uuid
from pathlib import Path
from typing import Literal

from mcp.server.fastmcp import FastMCP
from mcp.server.fastmcp.exceptions import ToolError

from audio_poc.melody import CompositionRequest
from audio_poc.melody_service import (
    ARTIFACT_TYPES,
    CompositionResult,
    CompositionUnavailable,
    JobConflict,
    JobNotFound,
    MelodyService,
)
from audio_poc.similarity import SimilarityError


def create_server(data_dir: Path, *, port: int = 8001) -> FastMCP:
    """Create tools and binary resources backed by one private durable queue."""
    service = MelodyService(data_dir)
    server = FastMCP(
        "Earwyrm Melody and Arrangement",
        instructions="Compose a 30-second retro-synth arrangement. This service owns render-job submission: use its returned job_id, never enqueue a second copy. Screening is limited, not legal clearance.",
        host="127.0.0.1",
        port=port,
        json_response=True,
    )

    @server.tool()
    def compose_arrangement(request: CompositionRequest) -> CompositionResult:
        """Validate syllable windows, screen melodies, return artifacts and queue one job.

        Reuse logical_job_id only for an identical retry; a new version needs a
        new ID. Product path is vocoded or spoken. This tool never calls Speech.
        """
        try:
            return service.submit(request)
        except (JobConflict, SimilarityError, CompositionUnavailable) as error:
            raise ToolError(str(error)) from error

    @server.tool()
    def get_render_job(job_id: uuid.UUID) -> CompositionResult:
        """Recover the same committed arrangement/job after a lost response."""
        try:
            return service.get_job(job_id)
        except JobNotFound as error:
            raise ToolError(str(error)) from error
        except sqlite3.Error as error:
            raise ToolError("Composition storage is unavailable") from error

    def register_artifact(name: str, media_type: str) -> None:
        def read_artifact(job_id: uuid.UUID) -> bytes:
            try:
                return service.read_artifact(job_id, name)
            except (JobNotFound, CompositionUnavailable) as error:
                raise ValueError(str(error)) from error
            except sqlite3.Error as error:
                raise ValueError("Composition storage is unavailable") from error

        server.resource(
            f"earwyrm://jobs/{{job_id}}/{name}",
            name=f"composition_{name}",
            mime_type=media_type,
        )(read_artifact)

    for name, media_type in ARTIFACT_TYPES.items():
        register_artifact(name, media_type)
    return server


def create_parser() -> argparse.ArgumentParser:
    """Parse local-only transport and private storage options."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", type=Path, default=Path(".earwyrm-data/melody"))
    parser.add_argument(
        "--transport", choices=["stdio", "streamable-http"], default="stdio"
    )
    parser.add_argument("--port", type=int, default=8001)
    return parser


def main() -> int:
    """Run on stdio or loopback HTTP; never expose an unauthenticated public host."""
    args = create_parser().parse_args()
    if not 1 <= args.port <= 65535:
        raise SystemExit("--port must be between 1 and 65535")
    transport: Literal["stdio", "streamable-http"] = args.transport
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
    try:
        create_server(args.data_dir, port=args.port).run(transport=transport)
    except (OSError, sqlite3.Error):
        logging.getLogger(__name__).error(
            "Melody service failed; inspect local storage configuration"
        )
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
