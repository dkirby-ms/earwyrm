"""Verify actual MCP initialize/tool/resource contracts rather than Python proxies."""

from __future__ import annotations

import base64
import uuid
from pathlib import Path

import pytest
from mcp.shared.memory import create_connected_server_and_client_session
from mcp.types import BlobResourceContents

from audio_poc.melody_mcp import create_server


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


def _request() -> dict:
    return {
        "logical_job_id": "mcp-test-v1",
        "product_path": "vocoded",
        "seed": 42,
        "lyrics": "One bright song for your shop every day",
        "lines": [
            {
                "text": "One bright song for your shop every day",
                "syllables": [
                    "One",
                    "bright",
                    "song",
                    "for",
                    "your",
                    "shop",
                    "ev",
                    "ery",
                    "day",
                ],
                "start_seconds": 3,
                "end_seconds": 7,
            }
        ],
    }


@pytest.mark.anyio
async def test_given_mcp_client_when_calling_then_typed_result_and_binary_resources(
    tmp_path: Path,
) -> None:
    # Arrange
    server = create_server(tmp_path)
    async with create_connected_server_and_client_session(server) as client:
        # Act
        initialized = await client.initialize()
        tools = await client.list_tools()
        result = await client.call_tool("compose_arrangement", {"request": _request()})

        # Assert
        assert initialized.protocolVersion >= "2025-06-18"
        tool = next(tool for tool in tools.tools if tool.name == "compose_arrangement")
        assert "request" in tool.inputSchema["properties"] and tool.outputSchema
        assert not result.isError and result.structuredContent
        output = result.structuredContent
        assert (
            output["status"] == "queued"
            and output["queue_owner"] == "melody-arrangement"
        )
        assert len(output["syllable_timing"]) == 9
        retry = await client.call_tool("compose_arrangement", {"request": _request()})
        assert retry.structuredContent == output
        recovered = await client.call_tool(
            "get_render_job", {"job_id": output["job_id"]}
        )
        assert recovered.structuredContent == output
        resource = await client.read_resource(output["midi"]["uri"])
        assert isinstance(resource.contents[0], BlobResourceContents)
        assert resource.contents[0].mimeType == "audio/midi"
        assert base64.b64decode(resource.contents[0].blob).startswith(b"MThd")
        backing = await client.read_resource(output["backing_tracks"][0]["uri"])
        assert isinstance(backing.contents[0], BlobResourceContents)
        assert base64.b64decode(backing.contents[0].blob).startswith(b"RIFF")


@pytest.mark.anyio
async def test_given_invalid_or_similar_request_when_called_then_mcp_reports_error(
    tmp_path: Path,
) -> None:
    # Arrange
    server = create_server(tmp_path)
    async with create_connected_server_and_client_session(server) as client:
        invalid = _request()
        invalid["lines"][0]["end_seconds"] = 3.125

        # Act & Assert
        rejected = await client.call_tool("compose_arrangement", {"request": invalid})
        assert rejected.isError
        assert not list((tmp_path / "artifacts").iterdir())
        first = await client.call_tool("compose_arrangement", {"request": _request()})
        assert not first.isError
        duplicate = {**_request(), "logical_job_id": "mcp-test-v2"}
        similar = await client.call_tool("compose_arrangement", {"request": duplicate})
        assert similar.isError and "similarity rejected" in str(similar.content)
        conflict = {**_request(), "seed": 43}
        assert (
            await client.call_tool("compose_arrangement", {"request": conflict})
        ).isError
        missing = await client.call_tool(
            "get_render_job", {"job_id": str(uuid.uuid4())}
        )
        assert missing.isError
