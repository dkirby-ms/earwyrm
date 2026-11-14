"""Exercise foundation HTTP and actual MCP without Azure calls."""

from __future__ import annotations

import sys

import pytest
from fastapi.testclient import TestClient
from mcp.shared.memory import create_connected_server_and_client_session

from audio_poc.lyrics import LyricRequest
from audio_poc.platform_service import create_app, create_mcp, main


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


@pytest.mark.parametrize("role", ["web", "lyric", "melody"])
def test_given_scaffold_when_called_then_health_is_not_generation_readiness(
    role: str,
) -> None:
    with TestClient(create_app(role)) as client:
        health = client.get("/healthz")
        failed = client.post("/jobs")
        catalog = client.get("/contracts").json()

    assert health.json() == {
        "status": "scaffold",
        "service": role,
        "generation_available": False,
    }
    assert (
        failed.status_code == 501
        and "no render job was queued" in failed.json()["detail"]
    )
    assert {
        "AdvertiserBrief",
        "LyricRequest",
        "CompositionRequest",
        "SyllableNote",
        "RenderMessage",
        "JobRecord",
        "RenderManifest",
        "ApprovalRecord",
    } <= catalog["$defs"].keys()


@pytest.mark.parametrize("role", ["lyric", "melody"])
def test_given_http_mcp_when_initialized_then_supported_protocol_negotiates(
    role: str,
) -> None:
    with TestClient(create_app(role), base_url="http://127.0.0.1") as client:
        response = client.post(
            "/mcp",
            headers={"Accept": "application/json, text/event-stream"},
            json={
                "jsonrpc": "2.0",
                "id": 1,
                "method": "initialize",
                "params": {
                    "protocolVersion": "2025-06-18",
                    "capabilities": {},
                    "clientInfo": {"name": "foundation-smoke", "version": "1"},
                },
            },
        )
        denied = client.post(
            "/mcp",
            headers={
                "Host": "untrusted.example",
                "Accept": "application/json, text/event-stream",
            },
            json={},
        )

    assert (
        response.status_code == 200
        and response.json()["result"]["protocolVersion"] >= "2025-06-18"
    )
    assert denied.status_code == 421


@pytest.mark.anyio
async def test_given_lyric_scaffold_when_tool_called_then_no_successful_generation(
    lyric_request: LyricRequest,
) -> None:
    server = create_mcp("lyric", allowed_host="127.0.0.1")

    async with create_connected_server_and_client_session(server) as client:
        await client.initialize()
        result = await client.call_tool(
            "write_lyrics", {"request": lyric_request.model_dump()}
        )

    assert result.isError and "not_integrated" in result.content[0].text


def test_given_render_scaffold_when_started_then_fails_without_acknowledgement(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(sys, "argv", ["platform_service", "--role", "render"])

    assert main() == 2
