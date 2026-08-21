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
  return { window, character, campaign: window.Campaign };
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

test("page import targets the active open sheet before matching the payload name", async () => {
  const activeElement = {};
  const activeDialog = {
    textContent: "앨리스",
    dataset: { characterid: "-alice" },
    style: { zIndex: "200" },
    contains(node) {
      return node === activeElement;
    },
    getAttribute(name) {
      if (name === "data-characterid") return "-alice";
      return "";
    },
    querySelector(selector) {
      if (selector.includes("attr_character_name")) {
        return { value: "앨리스", textContent: "" };
      }
      return null;
    },
  };
  const roseDialog = {
    textContent: "로즈",
    dataset: { characterid: "-rose" },
    style: { zIndex: "100" },
    contains() {
      return false;
    },
    getAttribute(name) {
      if (name === "data-characterid") return "-rose";
      return "";
    },
    querySelector(selector) {
      if (selector.includes("attr_character_name")) {
        return { value: "로즈", textContent: "" };
      }
      return null;
    },
  };

  const { window, campaign } = runPageImporter({
    document: {
      activeElement,
      querySelectorAll(selector) {
        if (selector.includes(".ui-dialog")) return [roseDialog, activeDialog];
        return [];
      },
    },
  });
  campaign.characters.models.push(
    createModel({
      id: "-alice",
      name: "앨리스",
    })
  );

  const response = await dispatchImport(window, {
    characterName: "로즈",
    attributes: [
      {
        inputName: "attr_str",
        roll20Name: "str",
        current: "65",
        max: "",
      },
    ],
    abilities: [
      {
        name: "R20JE-활성시트",
        action: "/em active sheet",
        istokenaction: false,
      },
    ],
  });

  assert.equal(response.ok, true);
  assert.equal(response.characterId, "-alice");
  assert.equal(response.characterName, "앨리스");
  assert.equal(campaign.attribs.models[0].attributes.characterid, "-alice");
  assert.equal(campaign.abilities.models[0].attributes.characterid, "-alice");
});

test("page import falls back to payload name when only a journal character node exists", async () => {
  const journalNode = {
    textContent: "앨리스",
    dataset: { characterid: "-alice" },
    style: {},
    contains() {
      return false;
    },
    getAttribute(name) {
      if (name === "data-characterid") return "-alice";
      return "";
    },
    querySelector() {
      return null;
    },
  };

  const { window, campaign } = runPageImporter({
    document: {
      activeElement: null,
      querySelectorAll(selector) {
        if (selector === "[data-characterid]") return [journalNode];
        return [];
      },
    },
  });
  campaign.characters.models.push(
    createModel({
      id: "-alice",
      name: "앨리스",
    })
  );

  const response = await dispatchImport(window, {
    characterName: "로즈",
    attributes: [],
    abilities: [
      {
        name: "R20JE-이름기준",
        action: "/em payload name",
        istokenaction: false,
      },
    ],
  });

  assert.equal(response.ok, true);
  assert.equal(response.characterId, "-rose");
  assert.equal(response.targetStrategy, "payload-name");
  assert.equal(campaign.abilities.models[0].attributes.characterid, "-rose");
});

test("page import saves an external avatar url on the target character", async () => {
  const activeElement = {};
  const activeDialog = {
    textContent: "앨리스",
    dataset: { characterid: "-alice" },
    style: { zIndex: "200" },
    contains(node) {
      return node === activeElement;
    },
    getAttribute(name) {
      if (name === "data-characterid") return "-alice";
      return "";
    },
    querySelector(selector) {
      if (selector.includes("attr_character_name")) {
        return { value: "앨리스", textContent: "" };
      }
      return null;
    },
  };

  const { window, campaign } = runPageImporter({
    document: {
      activeElement,
      querySelectorAll(selector) {
        if (selector.includes(".ui-dialog")) return [activeDialog];
        return [];
      },
    },
  });
  const alice = createModel({
    id: "-alice",
    name: "앨리스",
    avatar: "",
  });
  campaign.characters.models.push(alice);

  const response = await dispatchImport(window, {
    characterName: "로즈",
    avatarUrl: "https://images.example.com/alice.png",
    attributes: [],
    abilities: [],
  });

  assert.equal(response.ok, true);
  assert.equal(response.characterId, "-alice");
  assert.equal(response.avatar.applied, true);
  assert.equal(response.avatar.url, "https://images.example.com/alice.png");
  assert.equal(alice.attributes.avatar, "https://images.example.com/alice.png");
});
