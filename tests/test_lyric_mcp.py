"""Verify the writer through the actual MCP protocol with fake Azure transport."""

from __future__ import annotations

import json

import httpx
import pytest
from azure.core.credentials import AccessToken
from mcp.shared.memory import create_connected_server_and_client_session

from audio_poc.lyric_cloud import AzureLyricBackend, LyricCloudSettings
from audio_poc.lyric_mcp import create_server
from audio_poc.lyrics import LyricDraft, LyricRequest


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


class Credential:
    def get_token(self, *scopes: str, **kwargs: object) -> AccessToken:
        return AccessToken("test-token", 2**31)


@pytest.mark.anyio
async def test_given_mcp_request_when_written_then_fixed_output_and_complete_screening(
    lyric_request: LyricRequest,
    lyric_draft: LyricDraft,
) -> None:
    # Arrange
    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        if request.url.path.endswith("text:analyze"):
            return httpx.Response(
                200,
                json={
                    "categoriesAnalysis": [
                        {"category": category, "severity": 0}
                        for category in ("Hate", "SelfHarm", "Sexual", "Violence")
                    ]
                },
            )
        if request.url.path.endswith("text:detectProtectedMaterial"):
            return httpx.Response(
                200, json={"protectedMaterialAnalysis": {"detected": False}}
            )
        payload = json.loads(request.content)
        schema = payload["response_format"]["json_schema"]["name"]
        outputs = {
            "Preflight": {
                "english": True,
                "artist_imitation": False,
                "risky_claims": False,
            },
            "LyricDraft": lyric_draft.model_dump(),
            "Assessment": {"english": True, "grounded": True, "risky_claims": False},
        }
        return httpx.Response(
            200,
            json={
                "choices": [
                    {
                        "finish_reason": "stop",
                        "message": {"content": json.dumps(outputs[schema])},
                    }
                ]
            },
        )

    with httpx.Client(transport=httpx.MockTransport(handler)) as http:
        backend = AzureLyricBackend(
            LyricCloudSettings(
                "https://model.openai.azure.com",
                "test",
                "https://safety.cognitiveservices.azure.com",
            ),
            Credential(),
            http,
        )
        server = create_server(backend=backend)
        async with create_connected_server_and_client_session(server) as client:
            # Act
            initialized = await client.initialize()
            tools = await client.list_tools()
            response = await client.call_tool(
                "write_lyrics",
                {"request": lyric_request.model_dump()},
            )

            # Assert
            assert initialized.protocolVersion >= "2025-06-18"
            assert len(tools.tools) == 1 and tools.tools[0].outputSchema
            assert not response.isError and response.structuredContent
            assert response.structuredContent["status"] == "accepted"
            assert response.structuredContent["output"] == lyric_draft.model_dump()
            assert len(calls) == 5
            invalid = await client.call_tool(
                "write_lyrics",
                {"request": {**lyric_request.model_dump(), "prompt": "free text"}},
            )
            assert invalid.isError and len(calls) == 5


@pytest.mark.anyio
async def test_given_missing_cloud_configuration_when_called_then_explicit_unavailable(
    lyric_request: LyricRequest,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Arrange
    monkeypatch.delenv("LYRIC_FOUNDRY_ENDPOINT", raising=False)
    server = create_server()

    async with create_connected_server_and_client_session(server) as client:
        # Act
        await client.initialize()
        response = await client.call_tool(
            "write_lyrics", {"request": lyric_request.model_dump()}
        )

        # Assert
        assert not response.isError and response.structuredContent
        assert response.structuredContent["status"] == "unavailable"
        assert response.structuredContent["output"] is None
        assert response.structuredContent["reasons"] == [
            "missing_lyric_cloud_configuration"
        ]
