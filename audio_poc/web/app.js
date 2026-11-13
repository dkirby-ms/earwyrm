"use strict";

const apiScopes = {
  briefs: "briefs.read",
  reads: "renders.read",
  render: "renders.write",
  evaluate: "evaluations.write",
  output: "outputs.read",
};

const ui = Object.fromEntries(
  [
    "announcement",
    "error-message",
    "setup-panel",
    "setup-message",
    "sign-in-panel",
    "sign-in-button",
    "session-panel",
    "signed-in-user",
    "sign-out-button",
    "workspace",
    "brief-list",
    "selection-count",
    "offline-render-button",
    "paid-render-button",
    "render-options-message",
    "overall-status",
    "brief-status-list",
    "reconciliation-panel",
    "reconciliation-list",
    "comparison-rows",
    "output-count",
    "output-list",
    "run-list",
    "estimate-dialog",
    "estimate-summary",
    "cancel-estimate-button",
    "confirm-estimate-button",
  ].map((id) => [id, document.getElementById(id)]),
);

const state = {
  config: null,
  client: null,
  account: null,
  briefs: [],
  options: null,
  runs: [],
  outputs: [],
  rollup: null,
  selectedBriefIds: new Set(),
  audioUrls: new Map(),
  audioUrlTimers: new Map(),
  paidStatusUncertain: false,
  busy: false,
};

function announce(message) {
  ui.announcement.textContent = message;
}

function showError(message) {
  ui["error-message"].textContent = message;
  ui["error-message"].hidden = false;
}

function clearError() {
  ui["error-message"].textContent = "";
  ui["error-message"].hidden = true;
}

function setBusy(isBusy, message = "") {
  state.busy = isBusy;
  document.getElementById("main").setAttribute("aria-busy", String(isBusy));
  ui.workspace
    .querySelectorAll("button, input, textarea, select")
    .forEach((control) => {
      control.disabled = isBusy;
    });
  ui["offline-render-button"].disabled = isBusy || state.selectedBriefIds.size === 0;
  updateRenderButtons();
  if (message) announce(message);
}

function createElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = String(text);
  return element;
}

function releaseAudioUrl(outputId) {
  const timer = state.audioUrlTimers.get(outputId);
  if (timer !== undefined) window.clearTimeout(timer);
  state.audioUrlTimers.delete(outputId);
  const url = state.audioUrls.get(outputId);
  if (url) URL.revokeObjectURL(url);
  state.audioUrls.delete(outputId);
}

function storeAudioUrl(outputId, blob) {
  releaseAudioUrl(outputId);
  const url = URL.createObjectURL(blob);
  state.audioUrls.set(outputId, url);
  const timer = window.setTimeout(() => releaseAudioUrl(outputId), 120000);
  state.audioUrlTimers.set(outputId, timer);
  return url;
}

function scopeUri(suffix) {
  return `${state.config.scope_prefix}/${suffix}`;
}

async function getAccessToken(scopeSuffix) {
  const account = state.client.getActiveAccount() || state.account;
  if (!account) throw new Error("Sign in before using the workspace.");

  const request = { scopes: [scopeUri(scopeSuffix)], account };
  try {
    return await state.client.acquireTokenSilent(request);
  } catch (error) {
    if (!(error instanceof msal.InteractionRequiredAuthError)) throw error;
    return state.client.acquireTokenPopup(request);
  }
}

async function api(path, scopeSuffix, options = {}) {
  const endpoint = new URL(path, window.location.origin);
  if (endpoint.origin !== window.location.origin || !endpoint.pathname.startsWith("/api/")) {
    throw new Error("Refusing to send an API token outside this origin.");
  }

  const result = await getAccessToken(scopeSuffix);
  const headers = new Headers({ Authorization: `Bearer ${result.accessToken}` });
  const request = {
    method: options.method || "GET",
    headers,
    credentials: "same-origin",
    cache: "no-store",
  };
  if (options.body !== undefined) {
    headers.set("Content-Type", "application/json");
    request.body = JSON.stringify(options.body);
  }

  const response = await fetch(endpoint, request);
  if (!response.ok) {
    let detail = `Request failed (${response.status}).`;
    try {
      const payload = await response.json();
      if (typeof payload.detail === "string") detail = payload.detail;
      else if (typeof payload.detail?.message === "string") detail = payload.detail.message;
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
    }
    throw new Error(detail);
  }
  return options.responseType === "blob" ? response.blob() : response.json();
}

function selectedBriefs() {
  return state.briefs.filter((brief) => state.selectedBriefIds.has(brief.brief_id));
}

function renderBriefChoices() {
  ui["brief-list"].replaceChildren();
  for (const brief of state.briefs) {
    const label = createElement("label", "brief-choice");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = brief.brief_id;
    checkbox.checked = state.selectedBriefIds.has(brief.brief_id);
    checkbox.disabled = state.busy;
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) state.selectedBriefIds.add(brief.brief_id);
      else state.selectedBriefIds.delete(brief.brief_id);
      updateRenderButtons();
    });
    const content = document.createElement("div");
    content.append(
      createElement("strong", "", brief.name || brief.brief_id),
      createElement("span", "", brief.description || brief.brief_id),
    );
    label.append(checkbox, content);
    ui["brief-list"].append(label);
  }
  updateRenderButtons();
}

function unresolvedAttempts() {
  return state.runs.filter(
    (run) => run.attempt && run.attempt.status !== "reconciled",
  );
}

function updateRenderButtons() {
  const hasSelection = state.selectedBriefIds.size > 0;
  ui["selection-count"].textContent = hasSelection
    ? `${state.selectedBriefIds.size} brief${state.selectedBriefIds.size === 1 ? "" : "s"} selected.`
    : "No briefs selected.";
  ui["offline-render-button"].disabled = state.busy || !hasSelection;
  const paidAvailable =
    state.options?.speech_status === "available" &&
    unresolvedAttempts().length === 0 &&
    !state.paidStatusUncertain;
  ui["paid-render-button"].disabled = state.busy || !hasSelection || !paidAvailable;
}

async function loadWorkspaceData() {
  state.briefs = await api("/api/briefs", apiScopes.briefs);
  state.options = await api("/api/render-options", apiScopes.reads);
  const runResponse = await api("/api/renders", apiScopes.reads);
  const outputResponse = await api("/api/outputs", apiScopes.reads);
  state.runs = runResponse.runs;
  state.outputs = outputResponse.outputs;
  state.rollup = await api("/api/poc/status", apiScopes.reads);
  state.paidStatusUncertain = false;

  renderBriefChoices();
  renderRenderOptions();
  renderRollup();
  renderRuns();
  renderOutputs();
  ui.workspace.hidden = false;
  ui["session-panel"].hidden = false;
  ui["sign-in-panel"].hidden = true;
}

function renderRenderOptions() {
  const unresolved = unresolvedAttempts().length;
  if (state.paidStatusUncertain) {
    ui["render-options-message"].textContent =
      "The last paid-render result could not be confirmed. Paid rendering is paused until run status is recovered.";
  } else if (state.options.speech_status === "available" && unresolved === 0) {
    ui["render-options-message"].textContent =
      "Azure voice is server-enabled for this account. A fresh estimate and explicit confirmation are still required for every paid run.";
  } else if (state.options.speech_status === "busy") {
    ui["render-options-message"].textContent =
      "Azure voice is blocked while any paid attempt awaits metered-usage reconciliation.";
  } else if (unresolved > 0) {
    ui["render-options-message"].textContent =
      "Azure voice is blocked while a previous paid attempt awaits metered-usage reconciliation.";
  } else if (state.options.speech_status === "disabled") {
    ui["render-options-message"].textContent =
      "Azure voice is disabled on the server. Offline instrumental previews remain available.";
  } else {
    ui["render-options-message"].textContent =
      "Azure voice is unavailable because server-side spending prerequisites are incomplete.";
  }
  updateRenderButtons();
}

function setStatusBadge(element, status) {
  element.textContent = status;
  element.dataset.status = status;
}

function renderRollup() {
  setStatusBadge(ui["overall-status"], state.rollup.status);
  ui["brief-status-list"].replaceChildren();
  for (const brief of state.rollup.briefs) {
    const item = createElement(
      "li",
      "",
      `${brief.brief_id}: ${brief.status} (${brief.outputs.length} output${brief.outputs.length === 1 ? "" : "s"})`,
    );
    ui["brief-status-list"].append(item);
  }
}

function renderComparison() {
  ui["comparison-rows"].replaceChildren();
  const briefById = new Map(state.briefs.map((brief) => [brief.brief_id, brief]));
  for (const output of state.outputs) {
    const brief = briefById.get(output.brief_id);
    const row = document.createElement("tr");
    for (const value of [
      brief?.name || output.brief_id,
      output.variant,
      `${Number(output.duration_seconds).toFixed(2)} seconds`,
      output.numeric_gates,
      output.status,
    ]) {
      row.append(createElement("td", "", value));
    }
    ui["comparison-rows"].append(row);
  }
}

function renderEvaluation(output) {
  const section = createElement("section", "evaluation");
  section.append(createElement("h4", "", "Evaluation"));
  if (output.evaluation) {
    const result = createElement("p", "muted", "Evaluation submitted; this record is immutable.");
    const details = document.createElement("dl");
    for (const [label, value] of [
      ["Brand transcription", output.evaluation.brand_transcription],
      ["Brand match", output.evaluation.brand_match ? "Match" : "No match"],
      ["Call-to-action transcription", output.evaluation.cta_transcription],
      ["Call-to-action match", output.evaluation.cta_match ? "Match" : "No match"],
      ["Self-rating", output.evaluation.self_rating],
    ]) {
      details.append(
        createElement("dt", "", label),
        createElement("dd", "", value),
      );
    }
    section.append(result, details);
    return section;
  }

  const form = document.createElement("form");
  form.noValidate = false;
  const brandLabel = createElement("label", "", "Brand transcription");
  const brandInput = document.createElement("textarea");
  brandInput.name = "brand_transcription";
  brandInput.maxLength = 1000;
  brandInput.required = true;
  brandLabel.append(brandInput);

  const ctaLabel = createElement("label", "", "Call-to-action transcription");
  const ctaInput = document.createElement("textarea");
  ctaInput.name = "cta_transcription";
  ctaInput.maxLength = 2000;
  ctaInput.required = true;
  ctaLabel.append(ctaInput);

  const ratingLabel = createElement("label", "", "Usability rating");
  const rating = document.createElement("select");
  rating.name = "self_rating";
  rating.required = true;
  rating.append(new Option("Choose a rating", ""));
  for (const value of [
    "usable with minor edits",
    "usable with major edits",
    "not usable",
  ]) {
    rating.append(new Option(value, value));
  }
  ratingLabel.append(rating);

  const submit = createElement("button", "button button-primary", "Submit evaluation");
  submit.type = "submit";
  form.append(brandLabel, ctaLabel, ratingLabel, submit);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    await runAction("Submitting evaluation", async () => {
      await api(`/api/outputs/${encodeURIComponent(output.output_id)}/evaluation`, apiScopes.evaluate, {
        method: "POST",
        body: {
          brand_transcription: brandInput.value,
          cta_transcription: ctaInput.value,
          self_rating: rating.value,
        },
      });
      await loadWorkspaceData();
      announce("Evaluation saved. Match results and status have been updated.");
    });
  });
  section.append(form);
  return section;
}

function evidenceValue(value) {
  if (value === null || value === undefined || value === "") return "Not recorded";
  if (Array.isArray(value)) return value.map(evidenceValue).join("; ");
  if (typeof value === "object") {
    return Object.entries(value)
      .map(([key, item]) => `${key}: ${evidenceValue(item)}`)
      .join("; ");
  }
  return String(value);
}

function renderEvidence(output, container) {
  const controls = createElement("div", "button-row");
  const loadButton = createElement("button", "button button-secondary", "Load evidence");
  loadButton.type = "button";
  const downloadButton = createElement("button", "button button-secondary", "Download evidence JSON");
  downloadButton.type = "button";
  const evidenceText = createElement("pre");
  evidenceText.hidden = true;
  loadButton.addEventListener("click", async () => {
    await runAction("Loading protected evidence", async () => {
      const evidence = await api(output.evidence_url, apiScopes.output);
      evidenceText.textContent = JSON.stringify(evidence, null, 2);
      evidenceText.hidden = false;
      announce("Protected evidence loaded.");
    });
  });
  downloadButton.addEventListener("click", async () => {
    await runAction("Downloading protected evidence", async () => {
      const evidence = await api(output.evidence_url, apiScopes.output);
      downloadBlob(
        new Blob([JSON.stringify(evidence, null, 2)], { type: "application/json" }),
        `${output.output_id}-evidence.json`,
      );
      announce("Evidence download started.");
    });
  });
  controls.append(loadButton, downloadButton);
  container.append(controls, evidenceText);
}

function renderOutputs() {
  renderComparison();
  ui["output-count"].textContent = `${state.outputs.length} output${state.outputs.length === 1 ? "" : "s"}`;
  ui["output-list"].replaceChildren();
  const briefById = new Map(state.briefs.map((brief) => [brief.brief_id, brief]));
  for (const output of state.outputs) {
    const card = createElement("article", "output-card");
    const brief = briefById.get(output.brief_id);
    card.append(
      createElement("h3", "", `${brief?.name || output.brief_id} · ${output.variant}`),
    );
    const isInstrumental =
      Number(output.azure_usage?.submitted_characters || 0) === 0;
    card.append(
      createElement(
        "p",
        "notice",
        isInstrumental
          ? "Instrumental-only preview — not vocal proof. Evaluation remains Pending; playback is available."
          : "Azure voice output.",
      ),
    );
    const badge = createElement("p", "status-badge");
    setStatusBadge(badge, output.status);
    badge.textContent = `Evaluation: ${output.status}`;
    card.append(badge);

    let audioUrl = state.audioUrls.get(output.output_id);
    const audio = document.createElement("audio");
    audio.controls = true;
    audio.preload = "none";
    audio.setAttribute("aria-label", `Play ${brief?.name || output.brief_id}, ${output.variant}`);
    if (audioUrl) audio.src = audioUrl;
    audio.addEventListener("error", () => {
      showError("Audio playback failed. Try Load protected audio again, or download the WAV.");
    });
    audio.addEventListener("ended", () => {
      releaseAudioUrl(output.output_id);
      audio.removeAttribute("src");
      audio.load();
    });
    const playButton = createElement("button", "button button-secondary", "Load protected audio");
    playButton.type = "button";
    playButton.addEventListener("click", async () => {
      await runAction("Loading protected audio", async () => {
        const blob = await api(output.audio_url, apiScopes.output, { responseType: "blob" });
        audioUrl = storeAudioUrl(output.output_id, blob);
        audio.src = audioUrl;
        announce("Audio is ready. Use the audio controls to play it.");
      });
    });
    const downloadAudioButton = createElement("button", "button button-secondary", "Download WAV");
    downloadAudioButton.type = "button";
    downloadAudioButton.addEventListener("click", async () => {
      await runAction("Downloading protected audio", async () => {
        const blob = await api(output.audio_url, apiScopes.output, { responseType: "blob" });
        downloadBlob(blob, `${output.output_id}.wav`);
        announce("Audio download started.");
      });
    });
    card.append(audio, createElement("div", "button-row"));
    card.lastElementChild.append(playButton, downloadAudioButton);

    const facts = document.createElement("dl");
    const components = (output.components || []).map((component) => {
      const name = component.component || component.name || component.component_id || "Audio component";
      return `${name} — ${component.status}; source: ${evidenceValue(component.origin)}; rights evidence: ${evidenceValue(component.evidence)}; commercial-use basis: ${evidenceValue(component.commercial_use_basis)}`;
    });
    const usage = output.azure_usage || {};
    const meteredEvidence =
      Number(usage.submitted_characters || 0) === 0
        ? "No Azure request; instrumental-only."
        : [
            `${usage.submitted_characters} submitted characters`,
            `attempt: ${evidenceValue(usage.attempt_id)}`,
            `rate evidence: ${evidenceValue(usage.rate_evidence)}`,
            usage.billing_reconciled
              ? `actual allocated cost: $${usage.actual_allocated_cost_usd}; reconciliation reference: ${evidenceValue(usage.reconciliation_reference)}`
              : "Actual metered usage has not been reconciled.",
          ].join("; ");
    for (const [label, value] of [
      ["Duration", `${Number(output.duration_seconds).toFixed(2)} seconds`],
      ["Render time", `${Number(output.render_seconds).toFixed(2)} seconds`],
      ["Numeric gates", output.numeric_gates],
      ["Component and rights evidence", components.join("\n") || "Unavailable"],
      ["Metered usage evidence", meteredEvidence],
    ]) {
      facts.append(createElement("dt", "", label), createElement("dd", "", value));
    }
    card.append(facts, renderEvaluation(output));
    renderEvidence(output, card);
    ui["output-list"].append(card);
  }
}

function renderRuns() {
  ui["run-list"].replaceChildren();
  ui["reconciliation-list"].replaceChildren();
  const pending = unresolvedAttempts();
  ui["reconciliation-panel"].hidden = pending.length === 0;
  for (const run of state.runs) {
    const attempt = run.attempt;
    const item = createElement(
      "li",
      "",
      `${run.mode} · ${run.status} · ${run.brief_ids.join(", ")}` +
        (attempt ? ` · paid attempt ${attempt.status}` : ""),
    );
    ui["run-list"].append(item);
    if (!attempt || attempt.status === "reconciled") continue;
    const card = createElement("article", "reconciliation-card");
    card.append(
      createElement("h3", "", `Attempt ${attempt.attempt_id}`),
      createElement("p", "muted", `Status: ${attempt.status}. Estimated cost: $${attempt.estimated_cost_usd}.`),
    );
    const form = document.createElement("form");
    const costLabel = createElement("label", "", "Actual metered cost in USD");
    const costInput = document.createElement("input");
    costInput.type = "text";
    costInput.inputMode = "decimal";
    costInput.name = "actual_cost_usd";
    costInput.required = true;
    costInput.maxLength = 64;
    costLabel.append(costInput);
    const referenceLabel = createElement("label", "", "Billing evidence reference");
    const referenceInput = document.createElement("input");
    referenceInput.type = "text";
    referenceInput.name = "evidence_reference";
    referenceInput.required = true;
    referenceInput.maxLength = 500;
    referenceLabel.append(referenceInput);
    const submit = createElement("button", "button button-primary", "Record reconciliation");
    submit.type = "submit";
    form.append(costLabel, referenceLabel, submit);
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      await runAction("Recording metered usage", async () => {
        await api(`/api/attempts/${encodeURIComponent(attempt.attempt_id)}/reconcile`, apiScopes.render, {
          method: "POST",
          body: {
            actual_cost_usd: costInput.value,
            evidence_reference: referenceInput.value,
          },
        });
        await loadWorkspaceData();
        announce("Metered usage was reconciled. The paid-render gate has been refreshed.");
      });
    });
    card.append(form);
    ui["reconciliation-list"].append(card);
  }
  renderRenderOptions();
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10000);
}

async function runAction(label, action) {
  if (state.busy) return;
  clearError();
  setBusy(true, `${label}…`);
  try {
    await action();
  } catch (error) {
    showError(error instanceof Error ? error.message : "The request failed.");
  } finally {
    setBusy(false);
  }
}

async function renderOffline() {
  const briefIds = selectedBriefs().map((brief) => brief.brief_id);
  await runAction("Rendering instrumental preview", async () => {
    await api("/api/renders", apiScopes.render, {
      method: "POST",
      body: { brief_ids: briefIds, mode: "instrumental" },
    });
    await loadWorkspaceData();
    announce("Instrumental preview completed. Select Load protected audio, then press Play. Pending is evaluation status, not render progress.");
  });
}

function confirmEstimate(estimate) {
  const names = estimate.brief_ids
    .map((id) => state.briefs.find((brief) => brief.brief_id === id)?.name || id)
    .join(", ");
  ui["estimate-summary"].textContent =
    `Selected briefs: ${names}. Estimated total: $${estimate.estimated_cost_usd} USD.`;
  return new Promise((resolve) => {
    const dialog = ui["estimate-dialog"];
    dialog.addEventListener(
      "close",
      () => resolve(dialog.returnValue === "confirm"),
      { once: true },
    );
    dialog.showModal();
  });
}

async function renderAzure() {
  if (state.busy || unresolvedAttempts().length > 0) return;
  const briefIds = selectedBriefs().map((brief) => brief.brief_id);
  await runAction("Calculating Azure voice estimate", async () => {
    const estimate = await api("/api/renders/estimate", apiScopes.render, {
      method: "POST",
      body: { brief_ids: briefIds },
    });
    setBusy(false);
    if (!(await confirmEstimate(estimate))) {
      announce("Azure voice render was not started.");
      return;
    }
    state.paidStatusUncertain = true;
    setBusy(true, "Paid render in progress. Do not submit another render; status is recoverable after reload.");
    try {
      await api("/api/renders", apiScopes.render, {
        method: "POST",
        body: {
          brief_ids: estimate.brief_ids,
          mode: "azure",
          confirmation: {
            brief_ids: estimate.brief_ids,
            estimated_cost_usd: estimate.estimated_cost_usd,
          },
        },
      });
      await loadWorkspaceData();
      announce("Azure voice render completed. Reconcile actual metered usage before another paid attempt.");
    } catch (error) {
      try {
        await loadWorkspaceData();
      } catch {
        state.paidStatusUncertain = true;
        throw new Error(
          "The paid render outcome is unknown. Paid rendering is paused until run status is recovered; reload before any further attempt.",
        );
      }
      throw error;
    } finally {
      setBusy(false);
    }
  });
}

async function signIn() {
  clearError();
  try {
    const result = await state.client.loginPopup({
      scopes: [scopeUri(apiScopes.briefs)],
    });
    state.account = result.account;
    state.client.setActiveAccount(result.account);
    await loadWorkspaceData();
    announce("Signed in. Briefs and run status are ready.");
  } catch (error) {
    showError(error instanceof Error ? error.message : "Sign-in failed.");
  }
}

async function signOut() {
  if (!state.client || !state.account) return;
  try {
    await state.client.logoutPopup({
      account: state.account,
      postLogoutRedirectUri: window.location.origin,
    });
  } catch (error) {
    showError(error instanceof Error ? error.message : "Sign-out failed.");
    return;
  }
  for (const outputId of state.audioUrls.keys()) releaseAudioUrl(outputId);
  state.account = null;
  state.client.setActiveAccount(null);
  ui.workspace.hidden = true;
  ui["session-panel"].hidden = true;
  ui["sign-in-panel"].hidden = false;
  announce("Signed out.");
}

async function initialize() {
  try {
    const response = await fetch("/api/config", { cache: "no-store", credentials: "same-origin" });
    if (!response.ok) throw new Error(`Configuration request failed (${response.status}).`);
    state.config = await response.json();
    if (state.config.setup_status === "setup-needed") {
      ui["setup-message"].textContent =
        "Configure the existing Entra External ID tenant values on the API, then reload this page.";
      ui["setup-panel"].hidden = false;
      return;
    }
    if (state.config.setup_status !== "ready") {
      ui["setup-message"].textContent =
        "The API could not validate the External ID configuration. Check the server setup and reload this page.";
      ui["setup-panel"].hidden = false;
      return;
    }
    if (typeof msal === "undefined" || !state.config.client_id || !state.config.authority || !state.config.scope_prefix) {
      throw new Error("The pinned MSAL client or public identity configuration is unavailable.");
    }
    const authority = new URL(state.config.authority);
    if (authority.protocol !== "https:") throw new Error("The configured identity authority must use HTTPS.");
    state.client = new msal.PublicClientApplication({
      auth: {
        clientId: state.config.client_id,
        authority: state.config.authority,
        knownAuthorities: [authority.host],
        redirectUri: `${window.location.origin}/auth-callback.html`,
      },
      cache: { cacheLocation: msal.BrowserCacheLocation.SessionStorage },
    });
    await state.client.initialize();
    const redirectResult = await state.client.handleRedirectPromise();
    if (redirectResult?.account) state.client.setActiveAccount(redirectResult.account);
    state.account = state.client.getActiveAccount() || state.client.getAllAccounts()[0] || null;
    if (state.account) {
      state.client.setActiveAccount(state.account);
      ui["signed-in-user"].textContent = state.account.username || "Signed-in account";
      await loadWorkspaceData();
      announce("Signed-in workspace loaded.");
    } else {
      ui["sign-in-panel"].hidden = false;
    }
  } catch (error) {
    showError(error instanceof Error ? error.message : "The application could not start.");
  }
}

ui["sign-in-button"].addEventListener("click", signIn);
ui["sign-out-button"].addEventListener("click", signOut);
ui["offline-render-button"].addEventListener("click", renderOffline);
ui["paid-render-button"].addEventListener("click", renderAzure);
ui["cancel-estimate-button"].addEventListener("click", () => ui["estimate-dialog"].close("cancel"));
ui["confirm-estimate-button"].addEventListener("click", () => ui["estimate-dialog"].close("confirm"));
window.addEventListener("pagehide", () => {
  for (const outputId of state.audioUrls.keys()) releaseAudioUrl(outputId);
});

initialize();
