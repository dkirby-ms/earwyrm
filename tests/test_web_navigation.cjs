"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const webDir = path.join(__dirname, "..", "audio_poc", "web");
const html = fs.readFileSync(path.join(webDir, "index.html"), "utf8");
const app = fs.readFileSync(path.join(webDir, "app.js"), "utf8");

function element(id, hidden = false) {
  return {
    id,
    hidden,
    dataset: {},
    attributes: {},
    listeners: {},
    addEventListener(type, listener) {
      this.listeners[type] = listener;
    },
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
    click() {
      this.listeners.click();
    },
  };
}

function workspaceFixture() {
  const elements = new Map();
  for (const match of html.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)) {
    elements.set(match[1], element(match[1], /\bhidden\b/.test(match[0])));
  }
  const buttons = [...html.matchAll(/<button class="workspace-nav-button"[^>]+>/g)].map(
    ([tag]) => {
      const button = element("");
      button.dataset.view = tag.match(/data-view="([^"]+)"/)[1];
      button.attributes["aria-pressed"] = tag.match(/aria-pressed="([^"]+)"/)[1];
      return button;
    },
  );
  const views = buttons.map((button) => elements.get(button.dataset.view));
  const workspace = elements.get("workspace");
  workspace.querySelectorAll = (selector) => {
    if (selector === ".workspace-view") return views;
    if (selector === ".workspace-nav-button") return buttons;
    throw new Error(`Unexpected selector: ${selector}`);
  };
  const context = vm.createContext({
    document: { getElementById: (id) => elements.get(id) },
    window: { addEventListener() {} },
    fetch: async () => ({
      ok: true,
      json: async () => ({ setup_status: "setup-needed" }),
    }),
    URL,
  });
  vm.runInContext(app, context);
  return { buttons, views, elements };
}

test("workspace views switch without hiding reconciliation or resetting entered data", () => {
  const { buttons, views, elements } = workspaceFixture();
  const reconciliation = elements.get("reconciliation-panel");
  reconciliation.hidden = false;
  const selection = { checked: true };
  const evaluation = { value: "unfinished transcription" };
  views[0].children = [selection];
  views[2].children = [evaluation];

  assert.deepEqual(views.map((view) => view.hidden), [false, true, true, true]);
  for (const [index, button] of buttons.entries()) {
    button.click();
    assert.deepEqual(views.map((view) => view.hidden), views.map((_, i) => i !== index));
    assert.deepEqual(
      buttons.map((item) => item.attributes["aria-pressed"]),
      buttons.map((_, i) => String(i === index)),
    );
    assert.equal(reconciliation.hidden, false);
  }
  assert.equal(views[0].children[0].checked, true);
  assert.equal(views[2].children[0].value, "unfinished transcription");
});
