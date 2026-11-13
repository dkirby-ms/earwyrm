"""Fail-closed External ID access-token validation for the local web API."""

from __future__ import annotations

import json
import os
import threading
import time
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from urllib.parse import urlsplit

import httpx
import jwt
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

ALGORITHM = "RS256"
REQUIRED_SCOPE_SUFFIXES = (
    "briefs.read",
    "renders.read",
    "renders.write",
    "evaluations.write",
    "outputs.read",
)
CACHE_SECONDS = 300


class AuthConfigurationError(RuntimeError):
    """Raised when identity configuration or discovery metadata is unusable."""


class InvalidAccessToken(ValueError):
    """Raised when a bearer token does not meet the API token contract."""


def _https_origin(value: str, field: str) -> str:
    """Return a validated HTTPS origin for an identity endpoint."""
    try:
        parsed = urlsplit(value)
        hostname = parsed.hostname
        port = parsed.port
    except ValueError as error:
        raise AuthConfigurationError(f"{field} is not a valid HTTPS URL") from error
    if (
        parsed.scheme != "https"
        or not hostname
        or parsed.username
        or parsed.password
        or parsed.query
        or parsed.fragment
    ):
        raise AuthConfigurationError(f"{field} must be an HTTPS URL without user info")
    suffix = f":{port}" if port is not None and port != 443 else ""
    return f"https://{hostname.lower()}{suffix}"


@dataclass(frozen=True)
class AuthSettings:
    """Non-secret identity settings required to validate API access tokens."""

    client_id: str
    authority: str
    metadata_url: str
    expected_issuer: str
    audience: str
    scope_prefix: str

    @classmethod
    def from_environment(
        cls, environ: Mapping[str, str] | None = None
    ) -> AuthSettings | None:
        """Read and validate the External ID settings without fetching metadata."""
        source = os.environ if environ is None else environ
        names = (
            "ENTRA_CLIENT_ID",
            "ENTRA_AUTHORITY",
            "ENTRA_METADATA_URL",
            "ENTRA_EXPECTED_ISSUER",
            "ENTRA_AUDIENCE",
            "ENTRA_API_SCOPE_PREFIX",
        )
        values = {name: (source.get(name) or "").strip() for name in names}
        if not any(values.values()):
            return None
        missing = [name for name, value in values.items() if not value]
        if missing:
            raise AuthConfigurationError("External ID configuration is incomplete")

        authority_origin = _https_origin(values["ENTRA_AUTHORITY"], "ENTRA_AUTHORITY")
        metadata_origin = _https_origin(
            values["ENTRA_METADATA_URL"], "ENTRA_METADATA_URL"
        )
        _https_origin(values["ENTRA_EXPECTED_ISSUER"], "ENTRA_EXPECTED_ISSUER")
        if authority_origin != metadata_origin:
            raise AuthConfigurationError(
                "External ID authority and metadata origins must match"
            )
        if values["ENTRA_API_SCOPE_PREFIX"].endswith("/"):
            raise AuthConfigurationError(
                "ENTRA_API_SCOPE_PREFIX must not end with a slash"
            )

        return cls(
            client_id=values["ENTRA_CLIENT_ID"],
            authority=values["ENTRA_AUTHORITY"],
            metadata_url=values["ENTRA_METADATA_URL"],
            expected_issuer=values["ENTRA_EXPECTED_ISSUER"],
            audience=values["ENTRA_AUDIENCE"],
            scope_prefix=values["ENTRA_API_SCOPE_PREFIX"],
        )

    @property
    def scopes(self) -> dict[str, str]:
        """Return full API scopes keyed by their delegated permission suffix."""
        return {
            suffix: f"{self.scope_prefix}/{suffix}"
            for suffix in REQUIRED_SCOPE_SUFFIXES
        }


def _fetch_json(url: str) -> Mapping[str, object]:
    """Fetch one HTTPS JSON document without following redirects."""
    try:
        response = httpx.get(url, timeout=5.0, follow_redirects=False)
        response.raise_for_status()
        payload = response.json()
    except (httpx.HTTPError, json.JSONDecodeError) as error:
        raise AuthConfigurationError("External ID metadata is unavailable") from error
    if not isinstance(payload, dict):
        raise AuthConfigurationError("External ID metadata must be a JSON object")
    return payload


def _is_compatible_signing_key(jwk: dict[str, object]) -> bool:
    """Return whether a JWK can verify a token under the fixed RS256 policy."""
    if (
        jwk.get("kty") != "RSA"
        or jwk.get("alg") not in (None, ALGORITHM)
        or jwk.get("use") not in (None, "sig")
        or (
            "key_ops" in jwk
            and (not isinstance(jwk["key_ops"], list) or "verify" not in jwk["key_ops"])
        )
    ):
        return False
    try:
        jwt.PyJWK.from_dict(jwk, algorithm=ALGORITHM)
    except (jwt.PyJWTError, TypeError, ValueError):
        return False
    return True


class TokenValidator:
    """Validate RS256 access tokens against the configured tenant discovery keys."""

    def __init__(
        self,
        settings: AuthSettings,
        *,
        metadata_fetcher: Callable[[str], Mapping[str, object]] = _fetch_json,
        jwks_fetcher: Callable[[str], Mapping[str, object]] = _fetch_json,
    ) -> None:
        self.settings = settings
        self._metadata_fetcher = metadata_fetcher
        self._jwks_fetcher = jwks_fetcher
        self._lock = threading.Lock()
        self._metadata_cache: tuple[float, dict[str, object]] | None = None
        self._jwks_cache: tuple[float, list[dict[str, object]]] | None = None

    def preflight(self) -> None:
        """Fetch and validate discovery metadata and its signing-key set."""
        metadata = self._load_metadata()
        keys = self._load_jwks(metadata)
        if not any(_is_compatible_signing_key(key) for key in keys):
            raise AuthConfigurationError(
                "External ID JWKS has no compatible RSA signing key"
            )

    def allowed_identity_origins(self) -> set[str]:
        """Return HTTPS origins declared by validated tenant discovery metadata."""
        metadata = self._load_metadata()
        origins = {_https_origin(self.settings.authority, "ENTRA_AUTHORITY")}
        for field in (
            "authorization_endpoint",
            "token_endpoint",
            "end_session_endpoint",
        ):
            endpoint = metadata.get(field)
            if endpoint is None:
                continue
            if not isinstance(endpoint, str):
                raise AuthConfigurationError(
                    f"External ID metadata has an invalid {field}"
                )
            origins.add(_https_origin(endpoint, field))
        return origins

    def verify(self, token: str) -> dict[str, object]:
        """Validate token signature and claims; never log token contents."""
        metadata = self._load_metadata()
        try:
            header = jwt.get_unverified_header(token)
        except jwt.PyJWTError as error:
            raise InvalidAccessToken("Invalid access token") from error
        if header.get("alg") != ALGORITHM or not isinstance(header.get("kid"), str):
            raise InvalidAccessToken("Unsupported access-token header")

        kid = header["kid"]
        keys = self._load_jwks(metadata)
        matching = [key for key in keys if key.get("kid") == kid]
        if not matching:
            keys = self._load_jwks(metadata, force=True)
            matching = [key for key in keys if key.get("kid") == kid]
        if not matching:
            raise InvalidAccessToken("Signing key was not found")
        if len(matching) != 1:
            raise AuthConfigurationError("External ID JWKS contains duplicate key IDs")

        jwk = matching[0]
        if not _is_compatible_signing_key(jwk):
            raise AuthConfigurationError("External ID signing key is incompatible")

        try:
            signing_key = jwt.PyJWK.from_dict(jwk, algorithm=ALGORITHM).key
            claims = jwt.decode(
                token,
                signing_key,
                algorithms=[ALGORITHM],
                audience=self.settings.audience,
                issuer=self.settings.expected_issuer,
                options={"require": ["iss", "aud", "exp", "sub"]},
            )
        except jwt.PyJWTError as error:
            raise InvalidAccessToken("Invalid access token") from error
        subject = claims.get("sub")
        if not isinstance(subject, str) or not subject.strip():
            raise InvalidAccessToken("Access token has no subject")
        return claims

    def _load_metadata(self, *, force: bool = False) -> dict[str, object]:
        now = time.monotonic()
        with self._lock:
            if (
                not force
                and self._metadata_cache is not None
                and now - self._metadata_cache[0] < CACHE_SECONDS
            ):
                return self._metadata_cache[1]

            payload = self._metadata_fetcher(self.settings.metadata_url)
            issuer = payload.get("issuer")
            jwks_uri = payload.get("jwks_uri")
            algorithms = payload.get("id_token_signing_alg_values_supported")
            if issuer != self.settings.expected_issuer:
                raise AuthConfigurationError("External ID metadata issuer mismatch")
            if not isinstance(jwks_uri, str):
                raise AuthConfigurationError("External ID metadata has no JWKS URI")
            if _https_origin(jwks_uri, "jwks_uri") != _https_origin(
                self.settings.authority, "ENTRA_AUTHORITY"
            ):
                raise AuthConfigurationError("External ID JWKS origin mismatch")
            if not isinstance(algorithms, list) or ALGORITHM not in algorithms:
                raise AuthConfigurationError(
                    "External ID metadata does not support the configured algorithm"
                )
            for field in (
                "authorization_endpoint",
                "token_endpoint",
                "end_session_endpoint",
            ):
                endpoint = payload.get(field)
                if endpoint is not None:
                    if not isinstance(endpoint, str):
                        raise AuthConfigurationError(
                            f"External ID metadata has an invalid {field}"
                        )
                    _https_origin(endpoint, field)
            metadata = dict(payload)
            self._metadata_cache = (time.monotonic(), metadata)
            self._jwks_cache = None
            return metadata

    def _load_jwks(
        self, metadata: Mapping[str, object], *, force: bool = False
    ) -> list[dict[str, object]]:
        now = time.monotonic()
        with self._lock:
            if (
                not force
                and self._jwks_cache is not None
                and now - self._jwks_cache[0] < CACHE_SECONDS
            ):
                return self._jwks_cache[1]

            jwks_uri = metadata["jwks_uri"]
            payload = self._jwks_fetcher(str(jwks_uri))
            keys = payload.get("keys")
            if not isinstance(keys, list) or not all(
                isinstance(key, dict) for key in keys
            ):
                raise AuthConfigurationError("External ID JWKS has an invalid shape")
            result = [dict(key) for key in keys]
            self._jwks_cache = (time.monotonic(), result)
            return result


_bearer = HTTPBearer(auto_error=False)


def require_scope(scope_suffix: str):
    """Create a FastAPI dependency enforcing one delegated scope suffix."""
    if scope_suffix not in REQUIRED_SCOPE_SUFFIXES:
        raise ValueError(f"Unknown API scope: {scope_suffix}")

    async def dependency(
        request: Request,
        credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    ) -> dict[str, object]:
        validator: TokenValidator | None = request.app.state.token_validator
        if validator is None:
            raise HTTPException(
                status_code=503,
                detail="External ID authentication is not configured",
            )
        if credentials is None:
            raise HTTPException(
                status_code=401,
                detail="Bearer access token required",
                headers={"WWW-Authenticate": "Bearer"},
            )
        try:
            claims = validator.verify(credentials.credentials)
        except AuthConfigurationError as error:
            raise HTTPException(
                status_code=503,
                detail="External ID authentication is unavailable",
            ) from error
        except InvalidAccessToken as error:
            raise HTTPException(
                status_code=401,
                detail="Invalid access token",
                headers={"WWW-Authenticate": "Bearer"},
            ) from error

        scope_claim = claims.get("scp")
        token_scopes = scope_claim.split() if isinstance(scope_claim, str) else []
        if scope_suffix not in token_scopes:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return claims

    return dependency
