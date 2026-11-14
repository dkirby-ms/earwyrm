"""Run the Lyric and Hook Writer: uv run python -m audio_poc.lyric_mcp."""

from __future__ import annotations

import argparse
import logging
from typing import Literal

from mcp.server.fastmcp import FastMCP

from audio_poc.lyric_cloud import CloudFailure, LyricBackend, azure_backend
from audio_poc.lyric_service import LyricWriter
from audio_poc.lyrics import LyricRequest, LyricResult


def create_server(*, backend: LyricBackend | None = None, port: int = 8002) -> FastMCP:
    """Expose one independent generation tool; HTTP binds to loopback only."""
    server = FastMCP(
        "Earwyrm Lyric and Hook Writer",
        instructions=(
            "Generate original English lyrics from a structured brief. Only status=accepted "
            "passes technical gates; human_review_required must not proceed automatically. "
            "All output still needs producer and advertiser approval before broadcast. "
            "The tool owns at most three lyric retries; do not wrap it in another retry loop."
        ),
        host="127.0.0.1",
        port=port,
        json_response=True,
    )

    @server.tool()
    def write_lyrics(request: LyricRequest) -> LyricResult:
        """Write a hook and spoken/vocoded lyrics with verified metadata and safety gates.

        Uses paid Foundry and Content Safety calls when configured. Never request
        a named artist's style. Missing configuration returns unavailable.
        """
        if backend is not None:
            return LyricWriter(backend).write(request)
        try:
            with azure_backend() as cloud:
                return LyricWriter(cloud).write(request)
        except CloudFailure as error:
            logging.getLogger(__name__).error("Lyric cloud configuration unavailable")
            return LyricResult(status="unavailable", attempts=0, reasons=[error.code])

    return server


def create_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--transport", choices=["stdio", "streamable-http"], default="stdio"
    )
    parser.add_argument("--port", type=int, default=8002)
    return parser


def main() -> int:
    """Serve locally without public unauthenticated exposure or paid startup calls."""
    args = create_parser().parse_args()
    if not 1 <= args.port <= 65535:
        raise SystemExit("--port must be between 1 and 65535")
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
    transport: Literal["stdio", "streamable-http"] = args.transport
    create_server(port=args.port).run(transport=transport)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
