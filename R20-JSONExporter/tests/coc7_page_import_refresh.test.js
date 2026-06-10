const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(
  path.join(__dirname, "..", "js", "content", "import", "coc7_page_import.js"),
  "utf8"
);

class TestCustomEvent extends Event {
  constructor(type, options = {}) {
    super(type);
    this.detail = options.detail;
  }
}

function createModel(attrs) {
  return {
    attributes: { ...attrs },
    triggerCalls: [],
    get(key) {
      return this.attributes[key];
    },
    save(next) {
      Object.assign(this.attributes, next);
      this.trigger("change", this);
    },
    trigger(name) {
      this.triggerCalls.push(name);
    },
  };
}

function createCollection(models = []) {
  return {
    models,
    triggerCalls: [],
    create(attrs) {
      const model = createModel(attrs);
      this.models.push(model);
      this.trigger("add", model);
      return model;
    },
    add(model) {
      this.models.push(model);
      this.trigger("add", model);
      return model;
    },
    trigger(name) {
      this.triggerCalls.push(name);
    },
  };
}

function runPageImporter({ document }) {
  const window = new EventTarget();
  window.window = window;
  window.document = document;
  window.CustomEvent = TestCustomEvent;
  window.setTimeout = (fn) => {
    fn();
    return 0;
  };
  window.Campaign = {
    characters: createCollection(),
    abilities: createCollection(),
    attribs: createCollection(),
  };

  const character = createModel({
    id: "-rose",
    name: "로즈",
  });
  window.Campaign.characters.models.push(character);

  const context = {
    window,
    document,
    CustomEvent: TestCustomEvent,
    console,
  };
  vm.runInNewContext(source, context);
  return { window, character };
}

function dispatchImport(window, payload) {
  return new Promise((resolve) => {
    window.addEventListener("R20JE_COC7_IMPORT_RESPONSE", (event) => {
      resolve(event.detail.result);
    });

    window.dispatchEvent(
      new TestCustomEvent("R20JE_COC7_IMPORT_REQUEST", {
        detail: {
          requestId: "refresh-test",
          payload,
        },
      })
    );
  });
}

test("page import reopens an open sheet instead of forcing an in-place refresh", async () => {
  let closeClicked = false;
  let renderCalled = false;
  const closeButton = {
    click() {
      closeClicked = true;
    },
  };
  const openDialog = {
    textContent: "로즈",
    querySelector(selector) {
      if (selector.includes("attr_character_name")) {
        return { value: "로즈", textContent: "" };
      }
      if (selector.includes("Close") || selector.includes("close")) {
        return closeButton;
      }
      return null;
    },
  };

  const { window, character } = runPageImporter({
    document: {
      querySelectorAll(selector) {
        if (selector.includes(".ui-dialog")) return [openDialog];
        return [];
      },
    },
  });
  character.view = {
    render() {
      renderCalled = true;
    },
  };

  const response = await dispatchImport(window, {
    characterName: "로즈",
    attributes: [],
    abilities: [
      {
        name: "R20JE-테스트",
        action: "/em test",
        istokenaction: false,
      },
    ],
  });

  assert.equal(response.ok, true);
  assert.equal(JSON.stringify(response.abilities.applied), JSON.stringify(["R20JE-테스트"]));
  assert.equal(response.sheetUi.liveRefreshAttempted, false);
  assert.equal(response.sheetUi.autoReopenAttempted, true);
  assert.equal(response.sheetUi.reopened, true);
  assert.equal(closeClicked, true);
  assert.equal(renderCalled, true);
  assert.equal(character.triggerCalls.includes("change"), false);
});

test("page import reports a reopen hint when no sheet is open", async () => {
  const { window, character } = runPageImporter({
    document: {
      querySelectorAll() {
        return [];
      },
    },
  });

  const response = await dispatchImport(window, {
    characterName: "로즈",
    attributes: [],
    abilities: [
      {
        name: "R20JE-테스트",
        action: "/em test",
        istokenaction: false,
      },
    ],
  });

  assert.equal(response.ok, true);
  assert.equal(JSON.stringify(response.abilities.applied), JSON.stringify(["R20JE-테스트"]));
  assert.equal(response.sheetUi.liveRefreshAttempted, false);
  assert.equal(response.sheetUi.autoReopenAttempted, false);
  assert.equal(response.sheetUi.needsReopen, false);
  assert.equal(character.triggerCalls.includes("change"), false);
});
