"""Verify External ID token validation and protected brief access."""

from __future__ import annotations

import time
from collections.abc import Mapping
from typing import Any

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient

from audio_poc.web_app import create_app
from audio_poc.web_auth import AuthConfigurationError, AuthSettings, TokenValidator

AUTHORITY = "https://tenant.ciamlogin.com/tenant-id"
ISSUER = "https://tenant.ciamlogin.com/tenant-id/v2.0"
AUDIENCE = "api://audio-api"
METADATA_URL = (
    "https://tenant.ciamlogin.com/tenant-id/v2.0/.well-known/openid-configuration"
)
JWKS_URI = "https://tenant.ciamlogin.com/tenant-id/discovery/v2.0/keys"


@pytest.fixture
def signing_material() -> tuple[Any, dict[str, object]]:
    """Create a local-only RSA signing key and matching public JWK."""
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    public_jwk = jwt.algorithms.RSAAlgorithm.to_jwk(
        private_key.public_key(), as_dict=True
    )
    public_jwk.update({"kid": "test-key", "alg": "RS256", "use": "sig"})
    return private_key, public_jwk


@pytest.fixture
def auth_environment() -> dict[str, str]:
    """Supply fictional tenant settings for isolated API tests."""
    return {
        "ENTRA_CLIENT_ID": "local-spa-client",
        "ENTRA_AUTHORITY": AUTHORITY,
        "ENTRA_METADATA_URL": METADATA_URL,
        "ENTRA_EXPECTED_ISSUER": ISSUER,
        "ENTRA_AUDIENCE": AUDIENCE,
        "ENTRA_API_SCOPE_PREFIX": AUDIENCE,
    }


def _client(
    environ: Mapping[str, str],
    signing_material: tuple[Any, dict[str, object]],
    *,
    metadata: Mapping[str, object] | None = None,
    jwks: Mapping[str, object] | None = None,
) -> TestClient:
    """Build a test API with injected discovery documents and signing keys."""
    _, public_jwk = signing_material
    discovery = metadata or {
        "issuer": ISSUER,
        "jwks_uri": JWKS_URI,
        "id_token_signing_alg_values_supported": ["RS256"],
    }
    key_set = jwks or {"keys": [public_jwk]}
    app = create_app(
        environ=environ,
        metadata_fetcher=lambda _url: discovery,
        jwks_fetcher=lambda _url: key_set,
    )
    return TestClient(app)


def _token(
    private_key: Any,
    *,
    scopes: str = "briefs.read",
    overrides: Mapping[str, object] | None = None,
) -> str:
    """Sign one short-lived access-token fixture with a local test key."""
    claims: dict[str, object] = {
        "iss": ISSUER,
        "aud": AUDIENCE,
        "exp": int(time.time()) + 60,
        "sub": "local-test-user",
        "scp": scopes,
    }
    if overrides is not None:
        claims.update(overrides)
    return jwt.encode(
        claims,
        private_key,
        algorithm="RS256",
        headers={"kid": "test-key"},
    )


def test_given_valid_token_when_listing_briefs_then_returns_only_brief_fields(
    auth_environment: dict[str, str],
    signing_material: tuple[Any, dict[str, object]],
) -> None:
    # Arrange
    private_key, _ = signing_material
    client = _client(auth_environment, signing_material)
    token = _token(private_key)

    # Act
    config = client.get("/api/config")
    response = client.get("/api/briefs", headers={"Authorization": f"Bearer {token}"})

    # Assert
    assert config.json() == {
        "client_id": "local-spa-client",
        "authority": AUTHORITY,
        "scope_prefix": AUDIENCE,
        "setup_status": "ready",
    }
    assert response.status_code == 200
    briefs = response.json()
    assert len(briefs) == 3
    assert all("brief_id" in brief and "name" in brief for brief in briefs)
    assert all(
        "script" not in brief and "expected_brand" not in brief for brief in briefs
    )


def test_given_cross_origin_issuer_when_it_matches_discovery_then_validates_token(
    auth_environment: dict[str, str],
    signing_material: tuple[Any, dict[str, object]],
) -> None:
    issuer = "https://issuer.example.test/tenant-id/v2.0"
    auth_environment["ENTRA_EXPECTED_ISSUER"] = issuer
    metadata = {
        "issuer": issuer,
        "jwks_uri": JWKS_URI,
        "id_token_signing_alg_values_supported": ["RS256"],
    }
    client = _client(auth_environment, signing_material, metadata=metadata)
    token = _token(signing_material[0], overrides={"iss": issuer})
    wrong_issuer_token = _token(signing_material[0])

    assert client.get("/api/config").json()["setup_status"] == "ready"
    assert (
        client.get(
            "/api/briefs", headers={"Authorization": f"Bearer {token}"}
        ).status_code
        == 200
    )
    assert (
        client.get(
            "/api/briefs", headers={"Authorization": f"Bearer {wrong_issuer_token}"}
        ).status_code
        == 401
    )


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("ENTRA_EXPECTED_ISSUER", "http://issuer.example.test/tenant-id/v2.0"),
        ("ENTRA_METADATA_URL", "https://other.example.test/discovery"),
    ],
)
def test_given_untrusted_identity_configuration_when_starting_then_fails_closed(
    auth_environment: dict[str, str],
    signing_material: tuple[Any, dict[str, object]],
    field: str,
    value: str,
) -> None:
    auth_environment[field] = value
    client = _client(auth_environment, signing_material)

    assert client.get("/api/config").json()["setup_status"] == "unavailable"


def test_given_discovery_auth_endpoints_when_building_csp_allowlist_then_returns_https_origins(
    auth_environment: dict[str, str],
) -> None:
    # Arrange
    settings = AuthSettings.from_environment(auth_environment)
    assert settings is not None
    metadata = {
        "issuer": ISSUER,
        "jwks_uri": JWKS_URI,
        "id_token_signing_alg_values_supported": ["RS256"],
        "authorization_endpoint": "https://login.example.test/tenant/authorize",
        "token_endpoint": "https://login.example.test/tenant/token",
    }
    validator = TokenValidator(settings, metadata_fetcher=lambda _url: metadata)

    # Act
    origins = validator.allowed_identity_origins()

    # Assert
    assert origins == {"https://tenant.ciamlogin.com", "https://login.example.test"}


def test_given_insecure_discovery_endpoint_when_building_csp_allowlist_then_fails_closed(
    auth_environment: dict[str, str],
) -> None:
    # Arrange
    settings = AuthSettings.from_environment(auth_environment)
    assert settings is not None
    metadata = {
        "issuer": ISSUER,
        "jwks_uri": JWKS_URI,
        "id_token_signing_alg_values_supported": ["RS256"],
        "authorization_endpoint": "http://login.example.test/authorize",
    }
    validator = TokenValidator(settings, metadata_fetcher=lambda _url: metadata)

    # Act & Assert
    with pytest.raises(AuthConfigurationError, match="HTTPS"):
        validator.allowed_identity_origins()


@pytest.mark.parametrize(
    "overrides",
    [
        {"iss": "https://attacker.example/issuer"},
        {"aud": "api://different-api"},
        {"exp": int(time.time()) - 1},
    ],
)
def test_given_invalid_claims_when_listing_briefs_then_rejects_token(
    auth_environment: dict[str, str],
    signing_material: tuple[Any, dict[str, object]],
    overrides: Mapping[str, object],
) -> None:
    # Arrange
    private_key, _ = signing_material
    client = _client(auth_environment, signing_material)
    token = _token(private_key, overrides=overrides)

    # Act
    response = client.get("/api/briefs", headers={"Authorization": f"Bearer {token}"})

    # Assert
    assert response.status_code == 401


def test_given_missing_scope_when_listing_briefs_then_forbids_request(
    auth_environment: dict[str, str],
    signing_material: tuple[Any, dict[str, object]],
) -> None:
    # Arrange
    private_key, _ = signing_material
    client = _client(auth_environment, signing_material)
    token = _token(private_key, scopes="renders.read")

    # Act
    response = client.get("/api/briefs", headers={"Authorization": f"Bearer {token}"})

    # Assert
    assert response.status_code == 403


def test_given_wrong_signing_key_when_listing_briefs_then_rejects_token(
    auth_environment: dict[str, str],
    signing_material: tuple[Any, dict[str, object]],
) -> None:
    # Arrange
    attacker_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    client = _client(auth_environment, signing_material)
    token = _token(attacker_key)

    # Act
    response = client.get("/api/briefs", headers={"Authorization": f"Bearer {token}"})

    # Assert
    assert response.status_code == 401


def test_given_unsupported_token_algorithm_when_listing_briefs_then_rejects_token(
    auth_environment: dict[str, str],
    signing_material: tuple[Any, dict[str, object]],
) -> None:
    # Arrange
    client = _client(auth_environment, signing_material)
    token = jwt.encode(
        {
            "iss": ISSUER,
            "aud": AUDIENCE,
            "exp": int(time.time()) + 60,
            "sub": "local-test-user",
            "scp": "briefs.read",
        },
        "test-secret-for-algorithm-rejection",
        algorithm="HS256",
        headers={"kid": "test-key"},
    )

    # Act
    response = client.get("/api/briefs", headers={"Authorization": f"Bearer {token}"})

    # Assert
    assert response.status_code == 401


def test_given_missing_configuration_when_accessing_api_then_returns_setup_status(
    signing_material: tuple[Any, dict[str, object]],
) -> None:
    # Arrange
    client = _client({}, signing_material)

    # Act
    config = client.get("/api/config")
    protected = client.get("/api/briefs")
    health = client.get("/healthz")

    # Assert
    assert config.json()["setup_status"] == "setup-needed"
    assert set(config.json()) == {
        "client_id",
        "authority",
        "scope_prefix",
        "setup_status",
    }
    assert protected.status_code == 503
    assert health.status_code == 200


def test_given_auth_callback_when_served_then_disables_cache_and_allows_same_origin_frame(
    signing_material: tuple[Any, dict[str, object]],
) -> None:
    client = _client({}, signing_material)

    callback = client.get("/auth-callback.html")
    main_page = client.get("/")

    assert callback.status_code == 200
    assert callback.headers["cache-control"] == "private, no-store"
    assert "frame-ancestors 'self'" in callback.headers["content-security-policy"]
    assert "frame-ancestors 'none'" in main_page.headers["content-security-policy"]
    assert "cross-origin-opener-policy" not in callback.headers
    assert client.get("/vendor/msal-redirect-bridge.min.js").status_code == 200


def test_given_issuer_mismatch_when_loading_config_then_fails_closed(
    auth_environment: dict[str, str],
    signing_material: tuple[Any, dict[str, object]],
) -> None:
    # Arrange
    metadata = {
        "issuer": "https://other.ciamlogin.com/tenant-id/v2.0",
        "jwks_uri": JWKS_URI,
        "id_token_signing_alg_values_supported": ["RS256"],
    }
    client = _client(auth_environment, signing_material, metadata=metadata)

    # Act
    response = client.get("/api/config")

    # Assert
    assert response.json()["setup_status"] == "unavailable"


@pytest.mark.parametrize(
    "metadata",
    [
        {
            "issuer": ISSUER,
            "jwks_uri": "http://tenant.ciamlogin.com/keys",
            "id_token_signing_alg_values_supported": ["RS256"],
        },
        {
            "issuer": ISSUER,
            "jwks_uri": JWKS_URI,
            "id_token_signing_alg_values_supported": ["ES256"],
        },
    ],
)
def test_given_unsupported_discovery_when_accessing_briefs_then_returns_unavailable(
    auth_environment: dict[str, str],
    signing_material: tuple[Any, dict[str, object]],
    metadata: Mapping[str, object],
) -> None:
    # Arrange
    client = _client(auth_environment, signing_material, metadata=metadata)
    token = _token(signing_material[0])

    # Act
    config = client.get("/api/config")
    protected = client.get("/api/briefs", headers={"Authorization": f"Bearer {token}"})

    # Assert
    assert config.json()["setup_status"] == "unavailable"
    assert protected.status_code == 503


def test_given_partial_configuration_when_starting_app_then_marks_unavailable(
    signing_material: tuple[Any, dict[str, object]],
) -> None:
    # Arrange
    client = _client({"ENTRA_CLIENT_ID": "partial"}, signing_material)

    # Act
    response = client.get("/api/config")

    # Assert
    assert response.json()["setup_status"] == "unavailable"
    assert set(response.json()) == {
        "client_id",
        "authority",
        "scope_prefix",
        "setup_status",
    }


@pytest.mark.parametrize(
    "jwks",
    [
        {"keys": []},
        {"keys": [{"kid": "test-key", "kty": "EC", "use": "sig"}]},
    ],
)
def test_given_unusable_jwks_when_loading_config_then_fails_closed(
    auth_environment: dict[str, str],
    signing_material: tuple[Any, dict[str, object]],
    jwks: Mapping[str, object],
) -> None:
    # Arrange
    client = _client(auth_environment, signing_material, jwks=jwks)

    # Act
    response = client.get("/api/config")

    # Assert
    assert response.json()["setup_status"] == "unavailable"
