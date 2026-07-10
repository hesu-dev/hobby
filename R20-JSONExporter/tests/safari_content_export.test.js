const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const safariContentPath = path.join(
  __dirname,
  "..",
  "..",
  "R20-JSONExporter-safari-app",
  "ios",
  "Roll20SafariExtension",
  "Resources",
  "js",
  "content.js"
);
const safariVendorPath = path.join(
  __dirname,
  "..",
  "..",
  "R20-JSONExporter-safari-app",
  "ios",
  "Roll20SafariExtension",
  "Resources",
  "js",
  "vendor",
  "roll20-json-core.js"
);

const {
  SAFARI_MEASURE_MESSAGE,
  SAFARI_EXPORT_JSON_MESSAGE,
  SAFARI_COLLECT_AVATAR_CANDIDATES_MESSAGE,
  measureSafariExport,
  buildSafariExportPayload,
  collectAvatarCandidatesFromRoot,
  collectAvatarMappingsFromRoot,
  createRuntimeMessageHandler,
} = require(safariContentPath);

function createClassList(classNames = []) {
  const values = new Set(classNames);
  return {
    contains(name) {
      return values.has(name);
    },
    [Symbol.iterator]: function* iterator() {
      yield* values.values();
    },
  };
}

function matchesSelector(tagName, classNames, selector) {
  if (selector === "span") return tagName === "span";
  if (selector === "img") return tagName === "img";
  if (selector === "span.by") return tagName === "span" && classNames.includes("by");
  if (selector === "span.tstamp") return tagName === "span" && classNames.includes("tstamp");
  return false;
}

function createChild({
  tagName = "span",
  classNames = [],
  textContent = "",
  styleColor = "",
  imgSrc = "",
  imgCurrentSrc = "",
} = {}) {
  return {
    textContent,
    classList: createClassList(classNames),
    style: {
      color: styleColor,
    },
    children: [],
    getAttribute(name) {
      if (name === "style" && styleColor) return `color: ${styleColor}`;
      if (name === "src" && imgSrc) return imgSrc;
      return "";
    },
    matches(selector) {
      return matchesSelector(tagName, classNames, selector);
    },
    querySelector(selector) {
      if (selector === "img" && imgSrc) {
        return {
          currentSrc: imgCurrentSrc || imgSrc,
          src: imgCurrentSrc || imgSrc,
          getAttribute(name) {
            return name === "src" ? imgSrc : "";
          },
        };
      }
      return null;
    },
  };
}

function createMessage({
  classNames = ["message"],
  speaker = "",
  timestamp = "",
  text = "",
  html = "",
  avatarSrc = "",
  avatarCurrentSrc = "",
  textColor = "",
  messageId = "",
} = {}) {
  const children = [];
  if (avatarSrc) {
    children.push(
      createChild({
        tagName: "div",
        classNames: ["avatar"],
        imgSrc: avatarSrc,
        imgCurrentSrc: avatarCurrentSrc,
      })
    );
  }
  if (speaker) {
    children.push(createChild({ classNames: ["by"], textContent: speaker }));
  }
  if (timestamp) {
    children.push(createChild({ classNames: ["tstamp"], textContent: timestamp }));
  }
  children.push(createChild({ textContent: text, styleColor: textColor }));

  return {
    id: messageId,
    innerHTML: html || text,
    textContent: `${speaker} ${timestamp} ${text}`.trim(),
    style: {},
    classList: createClassList(classNames),
    children,
    cloneNode() {
      return {
        innerHTML: html || text,
        textContent: text,
        children: [],
        querySelectorAll() {
          return [];
        },
        querySelector() {
          return null;
        },
      };
    },
    getAttribute(name) {
      if (name === "data-messageid" || name === "id") return messageId;
      return "";
    },
    querySelector(selector) {
      if (selector === "span.by") {
        return children.find((child) => child.matches("span.by")) || null;
      }
      if (selector === `[class*="sheet-rolltemplate-"]`) {
        return String(html || "").includes("sheet-rolltemplate-") ? {} : null;
      }
      return null;
    },
  };
}

function createDocument({ title = "Roll20 Chat", hrefs = [], messages = [] } = {}) {
  return {
    title,
    baseURI: "https://app.roll20.net/editor/",
    defaultView: {
      getComputedStyle(node) {
        return {
          display: node.style?.display || "",
        };
      },
    },
    querySelectorAll(selector) {
      if (selector === 'a[href*="/campaigns/details/"]') {
        return hrefs.map((href) => ({
          getAttribute(name) {
            return name === "href" ? href : "";
          },
        }));
      }
      if (selector === "div.message") {
        return messages;
      }
      return [];
    },
  };
}

test("measureSafariExport reports current DOM counts and resolved filename", () => {
  const doc = createDocument({
    hrefs: ["https://app.roll20.net/campaigns/details/12345/%EC%84%B8%EC%85%98A"],
    messages: [
      createMessage({
        speaker: "KP:",
        timestamp: "8:15 PM",
        text: "테스트 메시지",
        messageId: "msg-1",
      }),
      createMessage({
        speaker: "PL:",
        timestamp: "8:16 PM",
        text: "두번째 메시지",
        messageId: "msg-2",
      }),
    ],
  });

  const metrics = measureSafariExport({ doc });

  assert.equal(metrics.messageCount, 2);
  assert.equal(metrics.filenameBase, "세션A");
  assert.equal(metrics.titleCandidate, "세션A");
  assert.ok(metrics.domNodeEstimate >= 8);
});

test("buildSafariExportPayload serializes the current DOM into schema v1 json", async () => {
  const visibleMessage = createMessage({
    classNames: ["message"],
    speaker: " KP: ",
    timestamp: "8:15 PM",
    text: " 테스트   메시지 ",
    textColor: "#ff00aa",
    avatarSrc: "https://example.com/avatar.png",
    messageId: "msg-1",
  });
  const doc = createDocument({
    hrefs: ["https://app.roll20.net/campaigns/details/12345/%EC%84%B8%EC%85%98A"],
    messages: [visibleMessage],
  });

  const payload = await buildSafariExportPayload({ doc });
  const parsed = JSON.parse(payload.jsonText);

  assert.equal(payload.filenameBase, "세션A");
  assert.equal(parsed.schemaVersion, 1);
  assert.equal(parsed.ebookView.titlePage.scenarioTitle, "세션A");
  assert.equal(parsed.lines.length, 1);
  assert.equal(parsed.lines[0].id, "msg-1");
  assert.equal(parsed.lines[0].speaker, "KP");
  assert.equal(parsed.lines[0].role, "character");
  assert.equal(parsed.lines[0].timestamp, "오후 8:15");
  assert.equal(parsed.lines[0].textColor, "#ff00aa");
  assert.equal(parsed.lines[0].text.trim(), "테스트 메시지");
  assert.equal(
    parsed.lines[0].input.speakerImages.avatar.url,
    "https://example.com/avatar.png"
  );
});

test("buildSafariExportPayload serializes inline em and strong html to markdown text", async () => {
  const visibleMessage = createMessage({
    classNames: ["message"],
    speaker: " KP: ",
    timestamp: "8:15 PM",
    text: "안녕하세요 안녕하세요 안녕하세요",
    html: "<em>안녕하세요</em> <strong>안녕하세요</strong> <strong><em>안녕하세요</em></strong>",
    messageId: "msg-emphasis",
  });
  const doc = createDocument({
    hrefs: ["https://app.roll20.net/campaigns/details/12345/%EC%84%B8%EC%85%98A"],
    messages: [visibleMessage],
  });

  const payload = await buildSafariExportPayload({ doc });
  const parsed = JSON.parse(payload.jsonText);

  assert.equal(
    parsed.lines[0].text,
    "*안녕하세요* **안녕하세요** ***안녕하세요***"
  );
});

test("buildSafariExportPayload inherits the previous speaker avatar url when the current message has no avatar", async () => {
  const doc = createDocument({
    hrefs: ["https://app.roll20.net/campaigns/details/12345/%EC%84%B8%EC%85%98A"],
    messages: [
      createMessage({
        classNames: ["message"],
        speaker: " KP: ",
        timestamp: "8:15 PM",
        text: "첫번째 메시지",
        avatarSrc: "https://example.com/avatar.png",
        messageId: "msg-1",
      }),
      createMessage({
        classNames: ["message"],
        speaker: " KP: ",
        timestamp: "8:16 PM",
        text: "두번째 메시지",
        messageId: "msg-2",
      }),
    ],
  });

  const payload = await buildSafariExportPayload({ doc });
  const parsed = JSON.parse(payload.jsonText);

  assert.equal(
    parsed.lines[1].input.speakerImages.avatar.url,
    "https://example.com/avatar.png"
  );
});

test("buildSafariExportPayload clears the avatar url when the speaker changes and the current message has no avatar", async () => {
  const doc = createDocument({
    hrefs: ["https://app.roll20.net/campaigns/details/12345/%EC%84%B8%EC%85%98A"],
    messages: [
      createMessage({
        classNames: ["message"],
        speaker: " KP: ",
        timestamp: "8:15 PM",
        text: "첫번째 메시지",
        avatarSrc: "https://example.com/avatar.png",
        messageId: "msg-1",
      }),
      createMessage({
        classNames: ["message"],
        speaker: " PL: ",
        timestamp: "8:16 PM",
        text: "두번째 메시지",
        messageId: "msg-2",
      }),
    ],
  });

  const payload = await buildSafariExportPayload({ doc });
  const parsed = JSON.parse(payload.jsonText);

  assert.equal(parsed.lines[1].speaker, "PL");
  assert.equal(parsed.lines[1].input.speakerImages, undefined);
});

test("buildSafariExportPayload applies shared avatar redirect mappings", async () => {
  const roll20AvatarUrl = "https://app.roll20.net/users/avatar/123/456";
  const redirectedAvatarUrl = "https://secure.gravatar.com/avatar/example";
  const visibleMessage = createMessage({
    classNames: ["message"],
    speaker: " KP: ",
    timestamp: "8:15 PM",
    text: " 테스트 메시지 ",
    avatarSrc: roll20AvatarUrl,
    avatarCurrentSrc: roll20AvatarUrl,
    messageId: "msg-1",
  });
  const doc = createDocument({
    hrefs: ["https://app.roll20.net/campaigns/details/12345/%EC%84%B8%EC%85%98A"],
    messages: [visibleMessage],
  });

  const payload = await buildSafariExportPayload({
    doc,
    avatarMappings: [
      {
        name: "KP",
        originalUrl: roll20AvatarUrl,
        avatarUrl: redirectedAvatarUrl,
      },
    ],
  });
  const parsed = JSON.parse(payload.jsonText);

  assert.equal(
    parsed.lines[0].input.speakerImages.avatar.url,
    redirectedAvatarUrl
  );
});

test("buildSafariExportPayload resolves shared avatar mappings through the page resolver hook", async () => {
  const roll20AvatarUrl = "https://app.roll20.net/users/avatar/123/456";
  const redirectedAvatarUrl = "https://secure.gravatar.com/avatar/example";
  const visibleMessage = createMessage({
    classNames: ["message"],
    speaker: " KP: ",
    timestamp: "8:15 PM",
    text: " 테스트 메시지 ",
    avatarSrc: roll20AvatarUrl,
    avatarCurrentSrc: roll20AvatarUrl,
    messageId: "msg-1",
  });
  const doc = createDocument({
    hrefs: ["https://app.roll20.net/campaigns/details/12345/%EC%84%B8%EC%85%98A"],
    messages: [visibleMessage],
  });

  const payload = await buildSafariExportPayload({
    doc,
    resolveAvatarMappings: async (avatarCandidates) =>
      avatarCandidates.map((candidate) => ({
        ...candidate,
        avatarUrl: redirectedAvatarUrl,
      })),
  });
  const parsed = JSON.parse(payload.jsonText);

  assert.equal(
    parsed.lines[0].input.speakerImages.avatar.url,
    redirectedAvatarUrl
  );
});

test("collectAvatarMappingsFromRoot resolves Roll20 avatar redirects for shared export", async () => {
  const roll20AvatarUrl = "https://app.roll20.net/users/avatar/123/456";
  const redirectedAvatarUrl = "https://secure.gravatar.com/avatar/example";
  const doc = createDocument({
    messages: [
      createMessage({
        speaker: "KP:",
        avatarSrc: roll20AvatarUrl,
        avatarCurrentSrc: roll20AvatarUrl,
        messageId: "msg-1",
      }),
    ],
  });

  const avatarMappings = await collectAvatarMappingsFromRoot(doc, {
    resolveAvatarUrl: async () => redirectedAvatarUrl,
  });

  assert.deepEqual(avatarMappings, [
    {
      id: `KP|||${roll20AvatarUrl}|||${redirectedAvatarUrl}`,
      name: "KP",
      avatarUrl: redirectedAvatarUrl,
      originalUrl: roll20AvatarUrl,
    },
  ]);
});

test("collectAvatarMappingsFromRoot prefers the Safari background redirect resolver", async () => {
  const originalBrowser = global.browser;
  const originalChrome = global.chrome;
  const originalFetch = global.fetch;
  const originalImage = global.Image;
  const roll20AvatarUrl = "https://app.roll20.net/users/avatar/999/888";
  const redirectedAvatarUrl = "https://secure.gravatar.com/avatar/example-background";
  const doc = createDocument({
    messages: [
      createMessage({
        speaker: "KP:",
        avatarSrc: roll20AvatarUrl,
        avatarCurrentSrc: roll20AvatarUrl,
      }),
    ],
  });

  global.browser = {
    runtime: {
      async sendMessage(payload) {
        if (payload?.type === "R20_SAFARI_RESOLVE_REDIRECT_URL") {
          return { ok: true, finalUrl: redirectedAvatarUrl };
        }
        return { ok: false, finalUrl: "" };
      },
    },
  };
  global.chrome = undefined;
  global.fetch = async () => {
    throw new Error("fetch should not run when the background resolver succeeds");
  };
  global.Image = class ImmediateImage {
    set src(value) {
      this.currentSrc = value;
      this.onload?.();
    }
  };

  try {
    const avatarMappings = await collectAvatarMappingsFromRoot(doc);

    assert.deepEqual(avatarMappings, [
      {
        id: `KP|||${roll20AvatarUrl}|||${redirectedAvatarUrl}`,
        name: "KP",
        avatarUrl: redirectedAvatarUrl,
        originalUrl: roll20AvatarUrl,
      },
    ]);
  } finally {
    global.browser = originalBrowser;
    global.chrome = originalChrome;
    global.fetch = originalFetch;
    global.Image = originalImage;
  }
});

test("collectAvatarMappingsFromRoot retries unresolved page results with the redirect resolver", async () => {
  const roll20AvatarUrl = "https://app.roll20.net/users/avatar/111/222";
  const redirectedAvatarUrl = "https://secure.gravatar.com/avatar/example-retried";
  const doc = createDocument({
    messages: [
      createMessage({
        speaker: "KP:",
        avatarSrc: roll20AvatarUrl,
        avatarCurrentSrc: roll20AvatarUrl,
      }),
    ],
  });

  const avatarMappings = await collectAvatarMappingsFromRoot(doc, {
    resolveAvatarMappings: async (avatarCandidates) =>
      avatarCandidates.map((candidate) => ({
        originalUrl: candidate.originalUrl,
        avatarUrl: candidate.originalUrl,
      })),
    resolveAvatarUrl: async () => redirectedAvatarUrl,
  });

  assert.deepEqual(avatarMappings, [
    {
      id: `KP|||${roll20AvatarUrl}|||${redirectedAvatarUrl}`,
      name: "KP",
      avatarUrl: redirectedAvatarUrl,
      originalUrl: roll20AvatarUrl,
    },
  ]);
});

test("collectAvatarCandidatesFromRoot returns shared-core compatible avatar candidates", () => {
  const roll20AvatarUrl = "https://app.roll20.net/users/avatar/123/456";
  const doc = createDocument({
    messages: [
      createMessage({
        speaker: "KP:",
        avatarSrc: roll20AvatarUrl,
        avatarCurrentSrc: roll20AvatarUrl,
        messageId: "msg-1",
      }),
    ],
  });

  assert.deepEqual(collectAvatarCandidatesFromRoot(doc), [
    {
      id: `KP|||${roll20AvatarUrl}|||${roll20AvatarUrl}`,
      name: "KP",
      originalUrl: roll20AvatarUrl,
      avatarUrl: roll20AvatarUrl,
    },
  ]);
});

test("runtime message handler returns measurement and export payloads", async () => {
  const handler = createRuntimeMessageHandler({
    measureSafariExport() {
      return {
        messageCount: 24,
        domNodeEstimate: 120,
        filenameBase: "session-a",
        titleCandidate: "session-a",
      };
    },
    buildSafariExportPayload() {
      return {
        jsonText: '{"schemaVersion":1}',
        filenameBase: "session-a",
      };
    },
    collectAvatarCandidatesFromRoot() {
      return [
        {
          id: "KP|||https://app.roll20.net/users/avatar/123/456|||https://app.roll20.net/users/avatar/123/456",
          name: "KP",
          originalUrl: "https://app.roll20.net/users/avatar/123/456",
          avatarUrl: "https://app.roll20.net/users/avatar/123/456",
        },
      ];
    },
  });

  const measurement = await handler({ type: SAFARI_MEASURE_MESSAGE });
  const avatarCandidates = await handler({ type: SAFARI_COLLECT_AVATAR_CANDIDATES_MESSAGE });
  const exportResult = await handler({ type: SAFARI_EXPORT_JSON_MESSAGE });

  assert.deepEqual(measurement, {
    ok: true,
    messageCount: 24,
    domNodeEstimate: 120,
    filenameBase: "session-a",
    titleCandidate: "session-a",
  });
  assert.deepEqual(avatarCandidates, {
    ok: true,
    avatarCandidates: [
      {
        id: "KP|||https://app.roll20.net/users/avatar/123/456|||https://app.roll20.net/users/avatar/123/456",
        name: "KP",
        originalUrl: "https://app.roll20.net/users/avatar/123/456",
        avatarUrl: "https://app.roll20.net/users/avatar/123/456",
      },
    ],
  });
  assert.deepEqual(exportResult, {
    ok: true,
    jsonText: '{"schemaVersion":1}',
    filenameBase: "session-a",
  });
});

test("browser runtime export uses the shared parser bundle contract", async () => {
  const context = vm.createContext({
    window: {},
    TextEncoder,
    URL,
    location: {
      href: "https://app.roll20.net/editor/",
    },
  });
  const vendorSource = fs.readFileSync(safariVendorPath, "utf8");
  const contentSource = fs.readFileSync(safariContentPath, "utf8");

  vm.runInContext(vendorSource, context);
  vm.runInContext(contentSource, context);

  const payload = await context.window.Roll20SafariExportContent.buildSafariExportPayload({
    doc: createDocument({
      hrefs: ["https://app.roll20.net/campaigns/details/12345/%EC%84%B8%EC%85%98A"],
      messages: [
        createMessage({
          speaker: " KP: ",
          timestamp: "8:15 PM",
          text: " 테스트   메시지 ",
          textColor: "#ff00aa",
          avatarSrc: "https://example.com/avatar.png",
          messageId: "msg-1",
        }),
        createMessage({
          speaker: " KP: ",
          timestamp: "8:16 PM",
          text: "“듣기” 기준치: 55 굴림: 67 판정결과: ”실패”",
          html: '<div class="sheet-rolltemplate-text">“듣기” 기준치: 55 굴림: 67 판정결과: ”실패”</div>',
          messageId: "msg-2",
        }),
      ],
    }),
  });
  const parsed = JSON.parse(payload.jsonText);

  assert.equal(parsed.schemaVersion, 1);
  assert.equal(parsed.lines[0].speaker, "KP");
  assert.equal(parsed.lines[0].timestamp, "오후 8:15");
  assert.equal(parsed.lines[0].safetext, "테스트 메시지");
  assert.equal(parsed.lines[1].input.dice.inputs.skill, '"듣기"');
  assert.equal(parsed.lines[1].input.dice.inputs.result, '"실패"');
  assert.equal(
    parsed.lines[0].input.speakerImages.avatar.url,
    "https://example.com/avatar.png"
  );
});
