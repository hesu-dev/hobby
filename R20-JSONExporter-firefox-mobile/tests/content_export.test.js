const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildFirefoxExportPayload,
  collectAvatarMappingsFromDoc,
  createRuntimeMessageHandler,
  FIREFOX_EXPORT_JSON_MESSAGE,
  FIREFOX_EXPORT_JSON_WITH_AVATAR_REPLACEMENTS_MESSAGE,
  FIREFOX_GET_AVATAR_MAPPINGS_MESSAGE,
  FIREFOX_EXPORT_PROGRESS_MESSAGE,
  FIREFOX_OPEN_READINGLOG_APP_MESSAGE,
  FIREFOX_DOWNLOAD_STREAM_START_MESSAGE,
  FIREFOX_DOWNLOAD_STREAM_CHUNK_MESSAGE,
  FIREFOX_DOWNLOAD_STREAM_FINISH_MESSAGE,
  FIREFOX_PING_MESSAGE,
  openReadingLogAppFromDocument,
  streamFirefoxDownloadDocument,
} = require("../js/content/core/content.js");

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

test("buildFirefoxExportPayload serializes the current DOM into schema v1 json", () => {
  const visibleMessage = createMessage({
    classNames: ["message"],
    speaker: " KP: ",
    timestamp: "8:15 PM",
    text: " 테스트   메시지 ",
    textColor: "#ff00aa",
    avatarSrc: "https://example.com/avatar.png",
    messageId: "msg-1",
  });
  const hiddenPlaceholder = createMessage({
    classNames: ["message", "general"],
    text: "This message has been hidden by the GM.",
    messageId: "msg-hidden",
  });
  const doc = createDocument({
    hrefs: ["https://app.roll20.net/campaigns/details/12345/%EC%84%B8%EC%85%98A"],
    messages: [visibleMessage, hiddenPlaceholder],
  });

  const payload = buildFirefoxExportPayload({ doc });
  const parsed = JSON.parse(payload.jsonText);

  assert.equal(payload.filenameBase, "세션A");
  assert.equal(payload.lineCount, 1);
  assert.ok(payload.jsonByteLength > 0);
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

test("buildFirefoxExportPayload serializes inline em and strong html to markdown text", () => {
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

  const payload = buildFirefoxExportPayload({ doc });
  const parsed = JSON.parse(payload.jsonText);

  assert.equal(
    parsed.lines[0].text,
    "*안녕하세요* **안녕하세요** ***안녕하세요***"
  );
});

test("collectAvatarMappingsFromDoc preserves original and redirected avatar urls", async () => {
  const doc = createDocument({
    messages: [
      createMessage({
        speaker: "KP",
        avatarSrc: "https://app.roll20.net/users/avatar/abc/123",
        avatarCurrentSrc: "https://cdn.example.com/avatar-final.png",
      }),
    ],
  });

  const mappings = await collectAvatarMappingsFromDoc(doc);

  assert.deepEqual(mappings, [
    {
      id: "KP|||https://app.roll20.net/users/avatar/abc/123|||https://cdn.example.com/avatar-final.png",
      name: "KP",
      avatarUrl: "https://cdn.example.com/avatar-final.png",
      originalUrl: "https://app.roll20.net/users/avatar/abc/123",
    },
  ]);
});

test("collectAvatarMappingsFromDoc keeps distinct variants for the same speaker and original url", async () => {
  const doc = createDocument({
    messages: [
      createMessage({
        speaker: "KP",
        avatarSrc: "https://app.roll20.net/users/avatar/abc/123",
        avatarCurrentSrc: "https://cdn.example.com/avatar-a.png",
      }),
      createMessage({
        speaker: "KP",
        avatarSrc: "https://app.roll20.net/users/avatar/abc/123",
        avatarCurrentSrc: "https://cdn.example.com/avatar-b.png",
      }),
    ],
  });

  const mappings = await collectAvatarMappingsFromDoc(doc);

  assert.deepEqual(mappings, [
    {
      id: "KP|||https://app.roll20.net/users/avatar/abc/123|||https://cdn.example.com/avatar-a.png",
      name: "KP",
      avatarUrl: "https://cdn.example.com/avatar-a.png",
      originalUrl: "https://app.roll20.net/users/avatar/abc/123",
    },
    {
      id: "KP|||https://app.roll20.net/users/avatar/abc/123|||https://cdn.example.com/avatar-b.png",
      name: "KP",
      avatarUrl: "https://cdn.example.com/avatar-b.png",
      originalUrl: "https://app.roll20.net/users/avatar/abc/123",
    },
  ]);
});

test("collectAvatarMappingsFromDoc resolves redirected avatar urls when currentSrc is unavailable", async () => {
  const originalUrl = "https://app.roll20.net/users/avatar/3307646/30";
  const redirectedUrl =
    "https://secure.gravatar.com/avatar/4cc5afb1aed693ed41db0792316e621c?d=identicon&size=30";
  const doc = createDocument({
    messages: [
      createMessage({
        speaker: "cang",
        avatarSrc: "/users/avatar/3307646/30",
        avatarCurrentSrc: "",
      }),
    ],
  });

  const mappings = await collectAvatarMappingsFromDoc(doc, {
    resolveAvatarUrl: async () => redirectedUrl,
  });

  assert.deepEqual(mappings, [
    {
      id: `cang|||${originalUrl}|||${redirectedUrl}`,
      name: "cang",
      avatarUrl: redirectedUrl,
      originalUrl,
    },
  ]);
});

test("buildFirefoxExportPayload direct export keeps per-line redirected avatars without metadata output", () => {
  const doc = createDocument({
    messages: [
      createMessage({
        speaker: "KP",
        timestamp: "8:15 PM",
        text: "테스트",
        avatarSrc: "https://app.roll20.net/users/avatar/abc/123",
        avatarCurrentSrc: "https://cdn.example.com/avatar-a.png",
        messageId: "msg-1",
      }),
      createMessage({
        speaker: "KP",
        timestamp: "8:16 PM",
        text: "다음",
        avatarSrc: "https://app.roll20.net/users/avatar/abc/123",
        avatarCurrentSrc: "https://cdn.example.com/avatar-b.png",
        messageId: "msg-1b",
      }),
    ],
  });

  const payload = buildFirefoxExportPayload({
    doc,
    includeAvatarLinkMeta: true,
  });
  const parsed = JSON.parse(payload.jsonText);

  assert.equal(
    parsed.lines[0].input.speakerImages.avatar.url,
    "https://cdn.example.com/avatar-a.png"
  );
  assert.equal(
    parsed.lines[1].input.speakerImages.avatar.url,
    "https://cdn.example.com/avatar-b.png"
  );
  assert.equal(parsed.lines[0].input.avatarLinkMeta, undefined);
  assert.equal(parsed.lines[1].input.avatarLinkMeta, undefined);
});

test("buildFirefoxExportPayload inherits the previous avatar only when the speaker is unchanged", () => {
  const doc = createDocument({
    messages: [
      createMessage({
        speaker: "KP",
        timestamp: "8:15 PM",
        text: "첫번째",
        avatarSrc: "https://example.com/avatar.png",
        messageId: "msg-1",
      }),
      createMessage({
        speaker: "KP",
        timestamp: "8:16 PM",
        text: "두번째",
        messageId: "msg-2",
      }),
      createMessage({
        speaker: "PL",
        timestamp: "8:17 PM",
        text: "세번째",
        messageId: "msg-3",
      }),
    ],
  });

  const payload = buildFirefoxExportPayload({ doc });
  const parsed = JSON.parse(payload.jsonText);

  assert.equal(parsed.lines[1].input.speakerImages.avatar.url, "https://example.com/avatar.png");
  assert.equal(parsed.lines[2].input.speakerImages, undefined);
});

test("buildFirefoxExportPayload uses resolved avatar mappings when the DOM avatar src is still a Roll20 url", () => {
  const originalUrl = "https://app.roll20.net/users/avatar/3307646/30";
  const redirectedUrl =
    "https://secure.gravatar.com/avatar/0f022f1bc6083b4deaa6b01160e1e7b5?d=identicon&size=30";
  const doc = createDocument({
    messages: [
      createMessage({
        speaker: "cang",
        timestamp: "February 08, 2026 1:25PM",
        text: "와앙 어소세요",
        avatarSrc: "/users/avatar/3307646/30",
        avatarCurrentSrc: "",
        messageId: "msg-cang",
      }),
    ],
  });

  const payload = buildFirefoxExportPayload({
    doc,
    avatarMappings: [
      {
        id: `cang|||${originalUrl}|||${redirectedUrl}`,
        name: "cang",
        originalUrl,
        avatarUrl: redirectedUrl,
      },
    ],
  });
  const parsed = JSON.parse(payload.jsonText);

  assert.equal(
    parsed.lines[0].input.speakerImages.avatar.url,
    redirectedUrl
  );
});

test("buildFirefoxExportPayload normalizes smart double quotes in parsed dice payloads", () => {
  const doc = createDocument({
    messages: [
      createMessage({
        speaker: "KP",
        timestamp: "8:15 PM",
        text: "“듣기” 기준치: 55 굴림: 67 판정결과: ”실패”",
        html: '<div class="sheet-rolltemplate-text">“듣기” 기준치: 55 굴림: 67 판정결과: ”실패”</div>',
        messageId: "msg-smart-quotes",
      }),
    ],
  });

  const payload = buildFirefoxExportPayload({ doc });
  const parsed = JSON.parse(payload.jsonText);

  assert.equal(parsed.lines[0].input.dice.inputs.skill, '"듣기"');
  assert.equal(parsed.lines[0].input.dice.inputs.result, '"실패"');
});

test("buildFirefoxExportPayload mapped export keeps user replacement", () => {
  const doc = createDocument({
    messages: [
      createMessage({
        speaker: "KP",
        text: "테스트",
        avatarSrc: "https://app.roll20.net/users/avatar/abc/123",
        avatarCurrentSrc: "https://cdn.example.com/avatar-final.png",
        messageId: "msg-2",
      }),
    ],
  });

  const payload = buildFirefoxExportPayload({
    doc,
    replacements: [
      {
        id: "KP|||https://app.roll20.net/users/avatar/abc/123|||https://cdn.example.com/avatar-final.png",
        name: "KP",
        originalUrl: "https://app.roll20.net/users/avatar/abc/123",
        avatarUrl: "https://cdn.example.com/avatar-final.png",
        newUrl: "https://images.example.com/custom-avatar.png",
      },
    ],
  });
  const parsed = JSON.parse(payload.jsonText);

  assert.equal(
    parsed.lines[0].input.speakerImages.avatar.url,
    "https://images.example.com/custom-avatar.png"
  );
  assert.equal(parsed.lines[0].input.avatarLinkMeta, undefined);
});

test("buildFirefoxExportPayload reports human-readable progress stages", () => {
  const doc = createDocument({
    messages: [
      createMessage({
        speaker: "KP",
        timestamp: "8:15 PM",
        text: "테스트",
        avatarSrc: "https://example.com/avatar.png",
        messageId: "msg-progress",
      }),
    ],
  });
  const progressEvents = [];

  const payload = buildFirefoxExportPayload({
    doc,
    onProgress(event) {
      progressEvents.push(event);
    },
  });

  assert.deepEqual(progressEvents, [
    { percent: 10, detail: "프로필 이미지 정보를 확인하는 중입니다." },
    { percent: 20, detail: "이미지 링크를 정리하는 중입니다." },
    { percent: 30, detail: "규칙 종류와 대사 개수를 확인하는 중입니다.", lineCount: 1 },
    { percent: 40, detail: "대사와 주사위 내용을 읽는 중입니다." },
    {
      percent: 50,
      detail: "JSON 파일 내용을 정리하는 중입니다.",
      jsonByteLength: payload.jsonByteLength,
      lineCount: 1,
    },
  ]);
});

test("runtime message handler returns export payloads, mappings, and ping responses", async () => {
  const handler = createRuntimeMessageHandler({
    buildFirefoxExportPayload() {
      return {
        jsonText: '{"schemaVersion":1}',
        filenameBase: "session-a",
        jsonByteLength: 19,
        lineCount: 1,
      };
    },
    collectAvatarMappingsFromDoc() {
      return [{ id: "map-1" }];
    },
  });

  const ping = await handler({ type: FIREFOX_PING_MESSAGE });
  const mappings = await handler({ type: FIREFOX_GET_AVATAR_MAPPINGS_MESSAGE });
  const exportResult = await handler({ type: FIREFOX_EXPORT_JSON_MESSAGE });
  const exportMappedResult = await handler({
    type: FIREFOX_EXPORT_JSON_WITH_AVATAR_REPLACEMENTS_MESSAGE,
    replacements: [{ id: "map-1" }],
    sessionId: "export-session-1",
  });

  assert.deepEqual(ping, { ok: true });
  assert.deepEqual(mappings, {
    ok: true,
    mappings: [{ id: "map-1" }],
  });
  assert.deepEqual(exportResult, {
    ok: true,
    jsonText: '{"schemaVersion":1}',
    filenameBase: "session-a",
    jsonByteLength: 19,
    lineCount: 1,
  });
  assert.deepEqual(exportMappedResult, {
    ok: true,
    jsonText: '{"schemaVersion":1}',
    filenameBase: "session-a",
    jsonByteLength: 19,
    lineCount: 1,
  });
});

test("runtime message handler forwards export progress events to the popup session", async () => {
  const sentMessages = [];
  const previousBrowser = global.browser;
  global.browser = {
    runtime: {
      sendMessage(message) {
        sentMessages.push(message);
        return Promise.resolve();
      },
    },
  };

  try {
    const handler = createRuntimeMessageHandler({
      buildFirefoxExportPayload(options = {}) {
        options.onProgress?.({
          percent: 10,
          detail: "프로필 이미지 정보를 확인하는 중입니다.",
        });
        options.onProgress?.({
          percent: 40,
          detail: "대사와 주사위 내용을 읽는 중입니다.",
        });
        return {
          jsonText: '{"schemaVersion":1}',
          filenameBase: "session-a",
          jsonByteLength: 19,
          lineCount: 1,
        };
      },
      collectAvatarMappingsFromDoc() {
        return [];
      },
    });

    await handler({
      type: FIREFOX_EXPORT_JSON_MESSAGE,
      sessionId: "export-session-1",
    });

    assert.deepEqual(sentMessages, [
      {
        type: FIREFOX_EXPORT_PROGRESS_MESSAGE,
        sessionId: "export-session-1",
        percent: 10,
        detail: "프로필 이미지 정보를 확인하는 중입니다.",
      },
      {
        type: FIREFOX_EXPORT_PROGRESS_MESSAGE,
        sessionId: "export-session-1",
        percent: 40,
        detail: "대사와 주사위 내용을 읽는 중입니다.",
      },
    ]);
  } finally {
    if (typeof previousBrowser === "undefined") {
      delete global.browser;
    } else {
      global.browser = previousBrowser;
    }
  }
});

test("openReadingLogAppFromDocument injects a page script with the deeplink", async () => {
  const calls = [];
  const doc = {
    documentElement: {
      appendChild(node) {
        calls.push({
          kind: "appendToDocumentElement",
          tag: node.tagName,
          textContent: node.textContent,
        });
      },
    },
    body: {
      appendChild(node) {
        calls.push({ kind: "appendChild", href: node.href });
      },
    },
    createElement(tag) {
      calls.push({ kind: "createElement", tag });
      return {
        tagName: String(tag).toUpperCase(),
        textContent: "",
        remove() {
          calls.push({ kind: "remove" });
        },
      };
    },
  };

  const result = openReadingLogAppFromDocument("readinglog://imports/json", { doc });

  assert.equal(result, "readinglog://imports/json");
  assert.equal(calls[0].kind, "createElement");
  assert.equal(calls[0].tag, "script");
  assert.equal(calls[1].kind, "appendToDocumentElement");
  assert.equal(calls[1].tag, "SCRIPT");
  assert.match(calls[1].textContent, /readinglog:\/\/imports\/json/);
  assert.match(calls[1].textContent, /anchor\.click\(\)/);
  assert.deepEqual(calls.at(-1), { kind: "remove" });
});

test("runtime message handler can open ReadingLog from the Roll20 page context", async () => {
  const calls = [];
  const handler = createRuntimeMessageHandler({
    openReadingLogAppFromDocument(url) {
      calls.push(url);
      return url;
    },
  });

  const result = await handler({
    type: FIREFOX_OPEN_READINGLOG_APP_MESSAGE,
    deeplinkUrl: "readinglog://imports/json",
  });

  assert.deepEqual(result, {
    ok: true,
    deeplinkUrl: "readinglog://imports/json",
  });
  assert.deepEqual(calls, ["readinglog://imports/json"]);
});

test("streamFirefoxDownloadDocument streams JSON chunks directly to the background", async () => {
  const doc = createDocument({
    hrefs: ["https://app.roll20.net/campaigns/details/12345/%EC%84%B8%EC%85%98A"],
    messages: [
      createMessage({
        speaker: "KP",
        timestamp: "8:15 PM",
        text: "첫 줄",
        avatarSrc: "https://example.com/avatar-a.png",
        messageId: "msg-a",
      }),
      createMessage({
        speaker: "PL",
        timestamp: "8:16 PM",
        text: "둘째 줄",
        avatarSrc: "https://example.com/avatar-b.png",
        messageId: "msg-b",
      }),
    ],
  });
  const sentMessages = [];
  const progressEvents = [];

  const result = await streamFirefoxDownloadDocument({
    doc,
    sessionId: "stream-session-1",
    onProgress(event) {
      progressEvents.push(event);
    },
    browserApi: {
      runtime: {
        sendMessage(message) {
          sentMessages.push(message);
          if (message.type === FIREFOX_DOWNLOAD_STREAM_FINISH_MESSAGE) {
            return Promise.resolve({
              ok: true,
              filename: "세션A.json",
              usedFallbackFilename: false,
            });
          }
          return Promise.resolve({ ok: true });
        },
      },
    },
  });

  assert.deepEqual(result, {
    ok: true,
    filename: "세션A.json",
    usedFallbackFilename: false,
    filenameBase: "세션A",
    lineCount: 2,
    jsonByteLength: result.jsonByteLength,
  });
  assert.ok(result.jsonByteLength > 0);
  assert.deepEqual(progressEvents.slice(0, 4), [
    { percent: 10, detail: "프로필 이미지 정보를 확인하는 중입니다." },
    { percent: 20, detail: "이미지 링크를 정리하는 중입니다." },
    { percent: 30, detail: "규칙 종류와 대사 개수를 확인하는 중입니다.", lineCount: 2 },
    { percent: 40, detail: "대사와 주사위 내용을 읽는 중입니다." },
  ]);
  assert.equal(progressEvents.at(-1)?.percent, 99);
  assert.equal(sentMessages[0].type, FIREFOX_DOWNLOAD_STREAM_START_MESSAGE);
  assert.equal(sentMessages.at(-1).type, FIREFOX_DOWNLOAD_STREAM_FINISH_MESSAGE);
  assert.ok(
    sentMessages.some(
      (message) =>
        message.type === FIREFOX_DOWNLOAD_STREAM_CHUNK_MESSAGE &&
        String(message.chunkText || "").includes('"schemaVersion":1')
    )
  );
});

test("streamFirefoxDownloadDocument uses the same shared export json as the direct payload", async () => {
  const originalUrl = "https://app.roll20.net/users/avatar/3307646/30";
  const redirectedUrl =
    "https://secure.gravatar.com/avatar/4cc5afb1aed693ed41db0792316e621c?d=identicon&size=30";
  const doc = createDocument({
    hrefs: ["https://app.roll20.net/campaigns/details/13052932/%ED%98%BC%EC%84%B8%EA%B8%B0%ED%96%89"],
    messages: [
      createMessage({
        speaker: "cang",
        timestamp: "February 08, 2026 1:25PM",
        text: "와앙 어소세요",
        avatarSrc: "/users/avatar/3307646/30",
        avatarCurrentSrc: "",
        messageId: "msg-cang",
      }),
    ],
  });
  const sentMessages = [];
  const directPayload = buildFirefoxExportPayload({
    doc,
    replacements: [
      {
        id: `cang|||${originalUrl}|||${redirectedUrl}`,
        name: "cang",
        originalUrl,
        avatarUrl: redirectedUrl,
        newUrl: "https://images.example.com/custom-cang.png",
      },
    ],
    avatarMappings: [
      {
        id: `cang|||${originalUrl}|||${redirectedUrl}`,
        name: "cang",
        originalUrl,
        avatarUrl: redirectedUrl,
      },
    ],
  });

  await streamFirefoxDownloadDocument({
    doc,
    replacements: [
      {
        id: `cang|||${originalUrl}|||${redirectedUrl}`,
        name: "cang",
        originalUrl,
        avatarUrl: redirectedUrl,
        newUrl: "https://images.example.com/custom-cang.png",
      },
    ],
    avatarMappings: [
      {
        id: `cang|||${originalUrl}|||${redirectedUrl}`,
        name: "cang",
        originalUrl,
        avatarUrl: redirectedUrl,
      },
    ],
    sessionId: "stream-session-shared",
    browserApi: {
      runtime: {
        sendMessage(message) {
          sentMessages.push(message);
          return Promise.resolve({ ok: true, filename: "혼세기행.json" });
        },
      },
    },
  });

  const streamedJson = sentMessages
    .filter((message) => message.type === FIREFOX_DOWNLOAD_STREAM_CHUNK_MESSAGE)
    .map((message) => String(message.chunkText || ""))
    .join("");

  assert.equal(streamedJson, directPayload.jsonText);
});

test("runtime message handler can save large JSON through background download without returning the full payload", async () => {
  const sentMessages = [];
  const handler = createRuntimeMessageHandler({
    buildFirefoxExportPayload() {
      throw new Error("full payload builder should not run for streamed downloads");
    },
    collectAvatarMappingsFromDoc() {
      return [];
    },
    streamFirefoxDownloadDocument: async ({ sessionId, onProgress }) => {
      onProgress?.({
        percent: 50,
        detail: "파일로 옮길 데이터를 준비하고 있습니다.",
        lineCount: 1,
      });
      sentMessages.push({
        type: FIREFOX_DOWNLOAD_STREAM_START_MESSAGE,
        sessionId,
      });
      sentMessages.push({
        type: FIREFOX_DOWNLOAD_STREAM_CHUNK_MESSAGE,
        sessionId,
        chunkText: '{"schemaVersion":1}',
      });
      onProgress?.({
        percent: 99,
        detail: "파일 데이터를 모두 옮겼습니다. 저장 요청을 준비하고 있습니다.",
        jsonByteLength: 19,
        lineCount: 1,
      });
      sentMessages.push({
        type: FIREFOX_DOWNLOAD_STREAM_FINISH_MESSAGE,
        sessionId,
      });
      return {
        ok: true,
        filename: "session-direct.json",
        usedFallbackFilename: false,
        filenameBase: "session-direct",
        jsonByteLength: 19,
        lineCount: 1,
      };
    },
  });

  const result = await handler({
    type: FIREFOX_EXPORT_JSON_MESSAGE,
    sessionId: "export-session-direct",
    delivery: "background-download",
  });

  assert.deepEqual(result, {
    ok: true,
    deliveredBy: "background-download",
    method: "download",
    filename: "session-direct.json",
    usedFallbackFilename: false,
    jsonByteLength: 19,
    lineCount: 1,
  });
  assert.deepEqual(sentMessages, [
    {
      type: FIREFOX_DOWNLOAD_STREAM_START_MESSAGE,
      sessionId: "export-session-direct",
    },
    {
      type: FIREFOX_DOWNLOAD_STREAM_CHUNK_MESSAGE,
      sessionId: "export-session-direct",
      chunkText: '{"schemaVersion":1}',
    },
    {
      type: FIREFOX_DOWNLOAD_STREAM_FINISH_MESSAGE,
      sessionId: "export-session-direct",
    },
  ]);
});
