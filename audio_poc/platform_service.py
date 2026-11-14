"""Foundation container: health, schemas and explicit non-generating MCP scaffolds.

Run locally with ``uv run python -m audio_poc.platform_service --role lyric``.
Azure ingress authentication is configured by the deployment, not trusted headers.
"""

from __future__ import annotations

import argparse
import logging
import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Literal

import uvicorn
from fastapi import FastAPI, HTTPException
from mcp.server.fastmcp import FastMCP
from mcp.server.fastmcp.exceptions import ToolError
from mcp.server.transport_security import TransportSecuritySettings
from opentelemetry import trace
from starlette.requests import Request
from starlette.responses import JSONResponse

from audio_poc.contracts import ServiceContracts
from audio_poc.lyrics import LyricRequest
from audio_poc.melody import CompositionRequest

ServiceRole = Literal["web", "lyric", "melody"]
LOGGER = logging.getLogger(__name__)
TRACER = trace.get_tracer(__name__)


def create_mcp(role: Literal["lyric", "melody"], *, allowed_host: str) -> FastMCP:
    """Negotiate real MCP while refusing generation until durable integration exists."""
    server = FastMCP(
        f"Earwyrm {role} foundation",
        stateless_http=True,
        json_response=True,
        transport_security=TransportSecuritySettings(
            enable_dns_rebinding_protection=True,
            allowed_hosts=[allowed_host, f"{allowed_host}:*"],
            allowed_origins=[f"https://{allowed_host}", f"http://{allowed_host}:*"],
        ),
    )

    @server.custom_route("/healthz", methods=["GET"])
    async def health(_request: Request) -> JSONResponse:
        return JSONResponse(
            {"status": "scaffold", "service": role, "generation_available": False}
        )

    if role == "lyric":

        @server.tool()
        def write_lyrics(request: LyricRequest) -> None:
            """Not integrated in this foundation; use the local writer separately."""
            LOGGER.error("lyric_service_not_integrated")
            raise ToolError(
                "lyric_service_not_integrated: generation is disabled in this scaffold"
            )
    else:

        @server.tool()
        def compose_arrangement(request: CompositionRequest) -> None:
            """Not integrated: no durable cloud artifacts or queue submission yet."""
            LOGGER.error("melody_service_not_integrated")
            raise ToolError("melody_service_not_integrated: no render job was queued")

    return server


def create_app(role: ServiceRole, *, allowed_host: str = "127.0.0.1") -> FastAPI:
    """Build a process-health surface; it never claims cloud dependencies are ready."""
    mcp = create_mcp(role, allowed_host=allowed_host) if role != "web" else None
    mcp_app = mcp.streamable_http_app() if mcp else None

    @asynccontextmanager
    async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
        if mcp:
            async with mcp.session_manager.run():
                yield
        else:
            yield

    app = FastAPI(title=f"Earwyrm {role} foundation", lifespan=lifespan)

    @app.get("/healthz")
    def health() -> dict:
        return {"status": "scaffold", "service": role, "generation_available": False}

    @app.get("/contracts")
    def contracts() -> dict:
        with TRACER.start_as_current_span("GET /contracts", kind=trace.SpanKind.SERVER):
            return ServiceContracts.model_json_schema()

    @app.post("/jobs")
    def submit_job() -> None:
        LOGGER.error("workflow_not_integrated")
        raise HTTPException(
            501, detail="workflow_not_integrated: no render job was queued"
        )

    if mcp_app:
        app.mount("/", mcp_app)
    return app


def create_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--role",
        choices=["web", "lyric", "melody", "render"],
        default=os.environ.get("SERVICE_ROLE", "web"),
    )
    parser.add_argument("--host", default=os.environ.get("HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=os.environ.get("PORT", "8080"))
    return parser


def main() -> int:
    """Start an HTTP scaffold, or fail the worker without consuming/acking messages."""
    args = create_parser().parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
    if (
        args.role not in {"web", "lyric", "melody", "render"}
        or not 1 <= args.port <= 65535
    ):
        LOGGER.error("invalid_platform_configuration")
        return 2
    if args.role == "render":
        LOGGER.error(
            "render_worker_not_integrated: no message was consumed or acknowledged"
        )
        return 2
    uvicorn.run(
        create_app(
            args.role, allowed_host=os.environ.get("PLATFORM_ALLOWED_HOST", args.host)
        ),
        host=args.host,
        port=args.port,
        access_log=False,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
