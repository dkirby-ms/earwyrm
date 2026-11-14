"""Exercise deployment maintenance gates without Azure access."""

from __future__ import annotations

import subprocess
from typing import Any

import pytest

from scripts import deployment_gate as gate

SUBSCRIPTION = "subscription"
GROUP = "rg-earwyrm-test"
APP = {
    "name": "web",
    "id": f"/subscriptions/{SUBSCRIPTION}/resourceGroups/{GROUP}/providers/Microsoft.App/containerApps/web",
    "tags": {"azd-env-name": "test", "azd-service-name": "web"},
}


@pytest.fixture
def deployment(monkeypatch: pytest.MonkeyPatch) -> list[tuple[str, ...]]:
    for name, value in {
        "AZURE_SUBSCRIPTION_ID": SUBSCRIPTION,
        "AZURE_TENANT_ID": "tenant",
        "AZURE_CLIENT_ID": "client",
        "AZURE_PRINCIPAL_ID": "principal",
        "AZURE_ENV_NAME": "test",
        "GITHUB_ACTIONS": "true",
        "ACTIONS_ID_TOKEN_REQUEST_URL": "https://oidc.example.test",
        "ACTIONS_ID_TOKEN_REQUEST_TOKEN": "test-only",
        "EARWYRM_MAINTENANCE_APPROVED": "true",
        "EARWYRM_OTHER_WRITERS_STOPPED": "true",
    }.items():
        monkeypatch.setenv(name, value)
    calls: list[tuple[str, ...]] = []

    def azure(subscription: str, *arguments: str) -> Any:
        assert subscription == SUBSCRIPTION
        calls.append(arguments)
        if arguments[:2] == ("account", "show"):
            return {
                "id": SUBSCRIPTION,
                "tenantId": "tenant",
                "user": {"type": "servicePrincipal", "name": "client"},
            }
        if arguments[:2] == ("group", "exists"):
            return True
        if arguments[:2] == ("containerapp", "list"):
            return [APP]
        if arguments[:2] == ("containerapp", "show"):
            return {"properties": {"runningStatus": "Stopped"}}
        if arguments[:3] == ("containerapp", "revision", "list"):
            assert "--all" in arguments
            return [{"name": "old"}, {"name": "new"}]
        if arguments[:3] == ("containerapp", "replica", "list"):
            return []
        if arguments[0] == "rest":
            return None
        raise AssertionError(arguments)

    monkeypatch.setattr(gate, "azure", azure)
    return calls


@pytest.mark.parametrize(
    "setting",
    [
        "GITHUB_ACTIONS",
        "ACTIONS_ID_TOKEN_REQUEST_TOKEN",
        "EARWYRM_MAINTENANCE_APPROVED",
        "EARWYRM_OTHER_WRITERS_STOPPED",
    ],
)
def test_given_unapproved_or_non_oidc_run_when_verifying_then_fail_before_azure(
    deployment: list[tuple[str, ...]], monkeypatch: pytest.MonkeyPatch, setting: str
) -> None:
    monkeypatch.delenv(setting)

    with pytest.raises(RuntimeError):
        gate.run("verify")

    assert deployment == []


@pytest.mark.parametrize(
    "failure", ["user", "other-app", "replica", "cli", "inventory", "running-empty"]
)
def test_given_unsafe_or_unknown_target_when_verifying_then_block_deployment(
    deployment: list[tuple[str, ...]], monkeypatch: pytest.MonkeyPatch, failure: str
) -> None:
    original = gate.azure

    def azure(subscription: str, *arguments: str) -> Any:
        result = original(subscription, *arguments)
        if failure == "user" and arguments[:2] == ("account", "show"):
            result["user"]["type"] = "user"
        if failure == "other-app" and arguments[:2] == ("containerapp", "list"):
            return [APP, APP]
        if failure == "running-empty" and arguments[:2] == ("containerapp", "show"):
            return {"properties": {"runningStatus": "Running"}}
        if failure == "replica" and arguments[:3] == (
            "containerapp",
            "replica",
            "list",
        ):
            return [{"name": "still-running"}] if arguments[-1] == "old" else []
        if failure == "cli" and arguments[:3] == ("containerapp", "replica", "list"):
            raise subprocess.CalledProcessError(1, ["az"])
        if failure == "inventory" and arguments[:3] == (
            "containerapp",
            "revision",
            "list",
        ):
            return {}
        return result

    monkeypatch.setattr(gate, "azure", azure)

    with pytest.raises((RuntimeError, subprocess.CalledProcessError)):
        gate.run("verify")

    assert not any(call[0] == "rest" for call in deployment)


@pytest.mark.parametrize("action", ["verify", "quiesce"])
def test_given_stopped_revisions_when_gating_then_verify_every_revision(
    deployment: list[tuple[str, ...]], action: str
) -> None:
    gate.run(action)

    revisions = [
        call[-1]
        for call in deployment
        if call[:3] == ("containerapp", "replica", "list")
    ]
    assert revisions == ["old", "new"]
    stops = [call for call in deployment if call[0] == "rest"]
    assert len(stops) == (1 if action == "quiesce" else 0)


def test_given_stop_accepted_but_replicas_remain_when_quiescing_then_timeout(
    deployment: list[tuple[str, ...]], monkeypatch: pytest.MonkeyPatch
) -> None:
    original = gate.azure

    def azure(subscription: str, *arguments: str) -> Any:
        result = original(subscription, *arguments)
        return (
            [{"name": "writer"}]
            if arguments[:3] == ("containerapp", "replica", "list")
            else result
        )

    clock = iter([0, 301])
    monkeypatch.setattr(gate, "azure", azure)
    monkeypatch.setattr(gate.time, "monotonic", lambda: next(clock))

    with pytest.raises(RuntimeError, match="Writer exclusion"):
        gate.run("quiesce")

    assert any(call[0] == "rest" for call in deployment)
