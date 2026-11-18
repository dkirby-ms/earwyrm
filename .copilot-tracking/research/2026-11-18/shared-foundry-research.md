<!-- markdownlint-disable-file -->
# Task Research: Shared Foundry provisioning

| Date | Researcher | Output mode |
|---|---|---|
| 2026-11-18 | Copilot | convergence |

## Planning Readiness

Ready for local implementation. Azure compatibility and subscription quota are rollout gates, not established by local validation.

* **E1**: Microsoft's [multi-service resource guide](https://learn.microsoft.com/azure/ai-services/multi-service-resource) lists Speech and Content Safety on `AIServices`; the app can route separately within one account. The [protected-material quickstart](https://learn.microsoft.com/azure/ai-services/content-safety/quickstart-protected-material) describes a dedicated resource and does not establish parity for the chosen shared account.
* **E2**: The [Speech Entra guide](https://learn.microsoft.com/azure/ai-services/speech-service/how-to-configure-azure-ad-auth) documents custom-domain Speech synthesizer authentication. The installed JavaScript SDK accepts a `TokenCredential`, routes synthesis over WebSocket and uses the Cognitive Services scope. Live synthesis and word events remain unverified.
* **E3**: The [Azure built-in role reference](https://learn.microsoft.com/azure/role-based-access-control/built-in-roles/ai-machine-learning) identifies Cognitive Services Speech User, Cognitive Services OpenAI User and Cognitive Services User. Scope these roles to the Foundry account.

**Decision**: The user chose shared Foundry provisioning instead of a separate or pre-created Speech account.
