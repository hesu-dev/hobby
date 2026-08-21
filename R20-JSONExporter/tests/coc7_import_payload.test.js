const test = require("node:test");
const assert = require("node:assert/strict");

const importer = require("../js/content/import/coc7_import.js");

test("coc7 import parser accepts wrapped JSON and normalizes attributes and abilities", () => {
  const payload = importer.parseCoc7ImportText(`
[R20JE:COC7_IMPORT:1]
{
  "character": "로즈",
  "fields": [
    { "name": "attr_str", "value": 65 }
  ],
  "attributes": {
    "san": { "current": 50, "max": 99 }
  },
  "abilities": {
    "R20JE-테스트": "/em R20JE 테스트 [[1d100]]"
  }
}
[/R20JE]
`);

  assert.equal(payload.characterName, "로즈");
  assert.deepEqual(payload.attributes, [
    {
      inputName: "attr_str",
      roll20Name: "str",
      current: "65",
      max: "",
    },
    {
      inputName: "attr_san",
      roll20Name: "san",
      current: "50",
      max: "99",
    },
  ]);
  assert.deepEqual(payload.abilities, [
    {
      name: "R20JE-테스트",
      action: "/em R20JE 테스트 [[1d100]]",
      istokenaction: false,
    },
  ]);
});

test("coc7 importer does not expose a built-in Rose sample generator", () => {
  assert.equal(importer.buildCoc7ImportSampleText, undefined);
});

test("coc7 import parser allows missing character names for active sheet targeting", () => {
  const payload = importer.parseCoc7ImportText(`
{
  "attributes": {
    "str": { "current": 65 }
  }
}
`);

  assert.equal(payload.characterName, "");
  assert.deepEqual(payload.attributes, [
    {
      inputName: "attr_str",
      roll20Name: "str",
      current: "65",
      max: "",
    },
  ]);
});

test("coc7 import parser normalizes external avatar image urls", () => {
  const payload = importer.parseCoc7ImportText(`
{
  "character": "로즈",
  "iconUrl": " https://images.example.com/rose.png "
}
`);

  assert.equal(payload.characterName, "로즈");
  assert.equal(payload.avatarUrl, "https://images.example.com/rose.png");
  assert.deepEqual(payload.attributes, []);
  assert.deepEqual(payload.abilities, []);
});

test("coc7 import parser falls through an empty avatarUrl to a valid iconUrl", () => {
  const payload = importer.normalizeCoc7ImportPayload({
    avatarUrl: "",
    iconUrl: "https://images.example.com/icon.png",
  });

  assert.equal(payload.avatarUrl, "https://images.example.com/icon.png");
});

test("coc7 import parser falls through an invalid avatarUrl to a valid iconUrl", () => {
  const payload = importer.normalizeCoc7ImportPayload({
    avatarUrl: "javascript:alert(1)",
    iconUrl: "https://images.example.com/icon.png",
  });

  assert.equal(payload.avatarUrl, "https://images.example.com/icon.png");
});

test("coc7 import parser falls through invalid top-level avatar aliases to nested data", () => {
  const payload = importer.normalizeCoc7ImportPayload({
    avatarUrl: "not-a-url",
    iconUrl: "also-not-a-url",
    imageUrl: "invalid-image-url",
    avatar: "invalid-avatar",
    characterAvatarUrl: "invalid-character-avatar",
    portraitUrl: "invalid-portrait",
    data: {
      avatarUrl: "https://images.example.com/nested-avatar.png",
    },
  });

  assert.equal(payload.avatarUrl, "https://images.example.com/nested-avatar.png");
});

test("coc7 import summary reports the actual page target and avatar counts", async () => {
  const originalGlobals = {
    chrome: global.chrome,
    CustomEvent: global.CustomEvent,
    document: global.document,
    window: global.window,
  };

  class TestCustomEvent extends Event {
    constructor(type, options = {}) {
      super(type);
      this.detail = options.detail;
    }
  }

  const pageResult = {
    ok: true,
    characterName: "앨리스",
    attributes: { applied: [] },
    abilities: { applied: [] },
    avatar: {
      applied: true,
      url: "https://images.example.com/alice.png",
    },
  };
  const pageWindow = new EventTarget();
  pageWindow.__r20jeCoc7PageImporterReady = true;
  pageWindow.addEventListener("R20JE_COC7_IMPORT_REQUEST", (event) => {
    pageWindow.dispatchEvent(
      new TestCustomEvent("R20JE_COC7_IMPORT_RESPONSE", {
        detail: {
          requestId: event.detail.requestId,
          result: pageResult,
        },
      })
    );
  });

  try {
    global.chrome = { runtime: { getURL() {} } };
    global.CustomEvent = TestCustomEvent;
    global.document = {
      activeElement: null,
      querySelectorAll() {
        return [];
      },
    };
    global.window = pageWindow;

    const result = await importer.applyCoc7ImportText(`
{
  "character": "로즈",
  "avatarUrl": "https://images.example.com/alice.png"
}
`);

    assert.deepEqual(
      {
        characterName: result.characterName,
        requestedAvatar: result.requested.avatar,
        appliedPageAvatar: result.applied.pageAvatar,
      },
      {
        characterName: "앨리스",
        requestedAvatar: 1,
        appliedPageAvatar: 1,
      }
    );
  } finally {
    Object.entries(originalGlobals).forEach(([name, value]) => {
      if (value === undefined) {
        delete global[name];
      } else {
        global[name] = value;
      }
    });
  }
});

test("open sheet DOM import applies attributes to the active sheet before a name match", () => {
  const originalGlobals = {
    document: global.document,
    Event: global.Event,
    HTMLInputElement: global.HTMLInputElement,
    HTMLSelectElement: global.HTMLSelectElement,
    HTMLTextAreaElement: global.HTMLTextAreaElement,
  };

  class FakeInput {
    constructor(name, value = "") {
      this.name = name;
      this.value = value;
      this.textContent = "";
      this.parent = null;
      this.events = [];
    }

    closest(selector) {
      return this.parent?.matches?.(selector) ? this.parent : null;
    }

    dispatchEvent(event) {
      this.events.push(event.type);
    }
  }

  class FakeRoot {
    constructor(nameValue, strValue) {
      this.className = "charsheet";
      this.nameInput = new FakeInput("attr_character_name", nameValue);
      this.strInput = new FakeInput("attr_str", strValue);
      this.nameInput.parent = this;
      this.strInput.parent = this;
      this.inputs = [this.nameInput, this.strInput];
    }

    matches(selector) {
      return selector === ".charsheet";
    }

    contains(node) {
      return this.inputs.includes(node);
    }

    querySelector(selector) {
      if (selector === '[name^="attr_"]') return this.inputs.find((input) => input.name.startsWith("attr_"));
      const nameMatch = selector.match(/^\[name="(.+)"\]$/);
      if (!nameMatch) return null;
      return this.inputs.find((input) => input.name === nameMatch[1]) || null;
    }
  }

  const activeSheet = new FakeRoot("앨리스", "");
  const roseSheet = new FakeRoot("로즈", "");

  try {
    global.Event = class {
      constructor(type) {
        this.type = type;
      }
    };
    global.HTMLInputElement = FakeInput;
    global.HTMLSelectElement = class {};
    global.HTMLTextAreaElement = class {};
    global.document = {
      activeElement: activeSheet.strInput,
      querySelectorAll(selector) {
        if (selector === ".charsheet") return [roseSheet, activeSheet];
        if (selector.includes('[name="attr_character_name"]')) {
          return [roseSheet.nameInput, activeSheet.nameInput];
        }
        return [];
      },
    };

    const result = importer.applyAttributesToOpenSheet({
      characterName: "로즈",
      attributes: [
        {
          inputName: "attr_str",
          roll20Name: "str",
          current: "65",
          max: "",
        },
      ],
    });

    assert.equal(result.ok, true);
    assert.equal(activeSheet.strInput.value, "65");
    assert.equal(roseSheet.strInput.value, "");
  } finally {
    Object.assign(global, originalGlobals);
  }
});
