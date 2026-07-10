const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(
  path.join(__dirname, "..", "js", "content", "import", "macro_page_import.js"),
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

function runPageImporter() {
  const window = new EventTarget();
  const macros = createCollection([
    createModel({
      id: "-existing",
      name: "관찰력",
      action: "/roll 1d100",
      visibleto: "",
      istokenaction: false,
    }),
  ]);
  window.window = window;
  window.CustomEvent = TestCustomEvent;
  window.Campaign = { macros };

  const context = {
    window,
    CustomEvent: TestCustomEvent,
    console,
  };
  vm.runInNewContext(source, context);
  return { window, macros };
}

function dispatchImport(window, payload) {
  return new Promise((resolve) => {
    window.addEventListener("R20JE_MACRO_IMPORT_RESPONSE", (event) => {
      resolve(event.detail.result);
    });

    window.dispatchEvent(
      new TestCustomEvent("R20JE_MACRO_IMPORT_REQUEST", {
        detail: {
          requestId: "macro-test",
          payload,
        },
      })
    );
  });
}

test("page import updates existing global macros and creates missing ones", async () => {
  const { window, macros } = runPageImporter();

  const response = await dispatchImport(window, {
    macros: [
      {
        name: "관찰력",
        action: "/roll 1d100 + 10",
        visibleto: "all",
        istokenaction: true,
      },
      {
        name: "SAN 체크",
        action: "/roll 1d100",
        visibleto: "",
        istokenaction: false,
      },
    ],
  });

  assert.equal(response.ok, true);
  assert.equal(JSON.stringify(response.macros.updated), JSON.stringify(["관찰력"]));
  assert.equal(JSON.stringify(response.macros.created), JSON.stringify(["SAN 체크"]));
  assert.equal(JSON.stringify(response.macros.applied), JSON.stringify(["관찰력", "SAN 체크"]));
  assert.equal(macros.models.length, 2);
  assert.deepEqual(macros.models[0].attributes, {
    id: "-existing",
    name: "관찰력",
    action: "/roll 1d100 + 10",
    visibleto: "all",
    istokenaction: true,
  });
  assert.equal(macros.models[1].attributes.name, "SAN 체크");
  assert.equal(macros.models[1].attributes.action, "/roll 1d100");
  assert.equal(macros.triggerCalls.includes("add"), true);
});
