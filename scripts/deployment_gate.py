"""Fail-closed GitHub OIDC maintenance gate for the isolated web deployment.

Run through azd hooks or the approved GitHub workflow, never as a local login
workaround. Verification is read-only; quiesce and resume mutate the selected app.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import re
import subprocess
import time
from typing import Any

LOGGER = logging.getLogger(__name__)


def azure(subscription: str, *arguments: str) -> Any:
    """Run Azure CLI against the explicit subscription, propagating failures."""
    result = subprocess.run(
        ["az", *arguments, "--subscription", subscription, "--output", "json"],
        capture_output=True,
        text=True,
        check=True,
        timeout=120,
    )
    if arguments[0] == "rest" and not result.stdout.strip():
        return None
    return json.loads(result.stdout)


def deployment_target() -> tuple[str, str, dict[str, Any] | None]:
    """Validate the approved OIDC account and inventory the isolated target."""
    for name in (
        "AZURE_SUBSCRIPTION_ID",
        "AZURE_TENANT_ID",
        "AZURE_CLIENT_ID",
        "AZURE_PRINCIPAL_ID",
        "AZURE_ENV_NAME",
    ):
        if not os.environ.get(name):
            raise RuntimeError(f"Required deployment setting is missing: {name}")
    if (
        os.environ.get("GITHUB_ACTIONS") != "true"
        or not os.environ.get("ACTIONS_ID_TOKEN_REQUEST_URL")
        or not os.environ.get("ACTIONS_ID_TOKEN_REQUEST_TOKEN")
    ):
        raise RuntimeError("Deployment requires the GitHub OIDC workflow")
    if (
        os.environ.get("EARWYRM_MAINTENANCE_APPROVED") != "true"
        or os.environ.get("EARWYRM_OTHER_WRITERS_STOPPED") != "true"
    ):
        raise RuntimeError(
            "Approved maintenance and stopped external writers are required"
        )
    environment = os.environ["AZURE_ENV_NAME"]
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]{1,18}[a-z0-9]", environment):
        raise RuntimeError("Use a 3-20 character lowercase azd environment name")
    subscription = os.environ["AZURE_SUBSCRIPTION_ID"]
    account = azure(subscription, "account", "show")
    if (
        account["id"].lower() != subscription.lower()
        or account["tenantId"].lower() != os.environ["AZURE_TENANT_ID"].lower()
        or account["user"]["type"] != "servicePrincipal"
        or account["user"]["name"].lower() != os.environ["AZURE_CLIENT_ID"].lower()
    ):
        raise RuntimeError(
            "Azure CLI account is not the configured deployment service principal"
        )
    group = f"rg-earwyrm-{environment}"
    exists = azure(subscription, "group", "exists", "--name", group)
    if exists is False:
        return subscription, group, None
    if exists is not True:
        raise RuntimeError("Invalid resource group inventory response")
    apps = azure(subscription, "containerapp", "list", "--resource-group", group)
    if not isinstance(apps, list):
        raise RuntimeError("Invalid Container Apps inventory response")
    if not apps:
        return subscription, group, None
    if len(apps) != 1 or (
        apps[0].get("tags", {}).get("azd-env-name") != environment
        or apps[0].get("tags", {}).get("azd-service-name") != "web"
    ):
        raise RuntimeError("Target must contain only the isolated, tagged web app")
    app = apps[0]
    expected_id = (
        f"/subscriptions/{subscription}/resourceGroups/{group}"
        f"/providers/Microsoft.App/containerApps/{app['name']}"
    )
    if app["id"].lower() != expected_id.lower():
        raise RuntimeError("Container app inventory does not match the selected target")
    return subscription, group, app


def replica_count(subscription: str, group: str, app: str) -> int:
    """Count replicas across every revision, including inactive revisions."""
    arguments = ("--resource-group", group, "--name", app)
    revisions = azure(
        subscription, "containerapp", "revision", "list", *arguments, "--all"
    )
    if not isinstance(revisions, list) or not revisions:
        raise RuntimeError("No verifiable revision inventory")
    count = 0
    for revision in revisions:
        replicas = azure(
            subscription,
            "containerapp",
            "replica",
            "list",
            *arguments,
            "--revision",
            revision["name"],
        )
        if not isinstance(replicas, list):
            raise RuntimeError("Invalid replica inventory response")
        count += len(replicas)
    return count


def run(action: str) -> None:
    """Verify zero writers, or explicitly stop/start the approved target app."""
    subscription, group, app = deployment_target()
    if app is None:
        if action == "resume":
            raise RuntimeError("Cannot resume an app that has not been provisioned")
        LOGGER.info("No existing web app in the selected isolated target")
        return
    if action in {"quiesce", "resume"}:
        operation = "stop" if action == "quiesce" else "start"
        azure(
            subscription,
            "rest",
            "--method",
            "post",
            "--url",
            f"https://management.azure.com{app['id']}/{operation}?api-version=2026-07-01",
        )
    deadline = time.monotonic() + 300
    while True:
        state = azure(
            subscription,
            "containerapp",
            "show",
            "--resource-group",
            group,
            "--name",
            app["name"],
        )["properties"]["runningStatus"]
        count = replica_count(subscription, group, app["name"])
        if action == "resume":
            if count > 1:
                raise RuntimeError(
                    "Multiple replicas detected; stop writers before recovery"
                )
            if count == 1 and state == "Running":
                LOGGER.info(
                    "One replica present; application and SMB acceptance remain separate"
                )
                return
        elif count == 0 and state == "Stopped":
            LOGGER.info("Verified zero replicas across all web app revisions")
            return
        if action == "verify" or time.monotonic() >= deadline:
            raise RuntimeError("Writer exclusion could not be verified")
        time.sleep(5)


def create_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("verify", "quiesce", "resume"))
    return parser


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
    try:
        run(create_parser().parse_args().action)
    except (
        RuntimeError,
        KeyError,
        TypeError,
        ValueError,
        OSError,
        subprocess.SubprocessError,
    ) as error:
        LOGGER.error("Deployment gate failed: %s", error)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
