const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const popupSourcePath = path.join(
  __dirname,
  "..",
  "..",
  "R20-JSONExporter-safari-app",
  "ios",
  "Roll20SafariExtension",
  "Resources",
  "js",
  "popup.js"
);

const {
  createPopupController,
  formatByteSize,
} = require(popupSourcePath);

function createTextElement() {
  return {
    textContent: "",
  };
}

function createButton() {
  return {
    disabled: false,
    textContent: "리딩로그로 복사하기",
    listeners: {},
    addEventListener(type, handler) {
      this.listeners[type] = handler;
    },
  };
}

function createPopupDocument() {
  const elements = {
    exportButton: createButton(),
    statusStage: createTextElement(),
    statusMessage: createTextElement(),
    statusFilename: createTextElement(),
    statusMetrics: createTextElement(),
    statusPayload: createTextElement(),
    statusInbox: createTextElement(),
  };

  return {
    getElementById(id) {
      return elements[id] || null;
    },
    elements,
  };
}

test("formatByteSize renders stable human readable sizes", () => {
  assert.equal(formatByteSize(0), "0 B");
  assert.equal(formatByteSize(512), "512 B");
  assert.equal(formatByteSize(1536), "1.5 KB");
});

test("popup controller measures and exports Roll20 JSON through the active tab", async () => {
  const calls = [];
  const nativeCalls = [];
  const api = {
    tabs: {
      async query() {
        return [{ id: 42 }];
      },
      async sendMessage(tabId, payload) {
        calls.push({ tabId, payload });
        if (payload.type === "R20_SAFARI_EXPORT_PING") {
          return { ok: true };
        }
        if (payload.type === "R20_SAFARI_EXPORT_MEASURE") {
          return {
            ok: true,
            messageCount: 12,
            domNodeEstimate: 84,
            filenameBase: "세션A",
            titleCandidate: "세션A",
          };
        }

        if (payload.type === "R20_SAFARI_EXPORT_JSON") {
          return {
            ok: true,
            filenameBase: "세션A",
            jsonText: '{"schemaVersion":1,"lines":[]}',
          };
        }

        throw new Error(`Unexpected message: ${payload.type}`);
      },
    },
    runtime: {
      async sendNativeMessage(payload) {
        nativeCalls.push(payload);
        if (payload.type === "R20_SAFARI_STORAGE_PREFLIGHT") {
          return {
            ok: true,
            pendingCount: 0,
            pendingBytes: 0,
            freeBytes: 536870912,
          };
        }

        if (payload.type === "R20_SAFARI_WRITE_INBOX_EXPORT") {
          return {
            ok: true,
            savedFileName: "세션A.json",
            pendingCount: 1,
            pendingBytes: 30,
            inboxRelativePath: "roll20/inbox",
          };
        }

        throw new Error(`Unexpected native message: ${payload.type}`);
      },
    },
  };
  const doc = createPopupDocument();
  const controller = createPopupController({
    api,
    doc,
  });

  await controller.handleExportClick();

  assert.deepEqual(
    calls.map((entry) => entry.payload.type),
    [
      "R20_SAFARI_EXPORT_PING",
      "R20_SAFARI_EXPORT_MEASURE",
      "R20_SAFARI_EXPORT_JSON",
    ]
  );
  assert.deepEqual(
    nativeCalls.map((entry) => entry.type),
    ["R20_SAFARI_STORAGE_PREFLIGHT", "R20_SAFARI_WRITE_INBOX_EXPORT"]
  );
  assert.equal(doc.elements.statusStage.textContent, "완료");
  assert.equal(doc.elements.statusMessage.textContent, "복사완료! 앱으로 돌아가주세요.");
  assert.equal(doc.elements.statusFilename.textContent, "세션A.json");
  assert.equal(doc.elements.statusMetrics.textContent, "메시지 12개");
  assert.equal(doc.elements.statusPayload.textContent, "현재 파일 크기 30 B");
  assert.equal(doc.elements.statusInbox.textContent, "");
  assert.equal(doc.elements.exportButton.disabled, true);
  assert.equal(doc.elements.exportButton.textContent, "복사 완료");
});

test("popup controller proceeds when ping has no response but measurement succeeds", async () => {
  const calls = [];
  const nativeCalls = [];
  const api = {
    tabs: {
      async query() {
        return [{ id: 42 }];
      },
      async sendMessage(tabId, payload) {
        calls.push({ tabId, payload });
        if (payload.type === "R20_SAFARI_EXPORT_PING") {
          return undefined;
        }
        if (payload.type === "R20_SAFARI_EXPORT_MEASURE") {
          return {
            ok: true,
            messageCount: 7,
            domNodeEstimate: 33,
            filenameBase: "세션B",
          };
        }
        if (payload.type === "R20_SAFARI_EXPORT_JSON") {
          return {
            ok: true,
            filenameBase: "세션B",
            jsonText: '{"schemaVersion":1,"lines":[{"speaker":"GM"}]}',
          };
        }
        throw new Error(`Unexpected message: ${payload.type}`);
      },
    },
    runtime: {
      async sendNativeMessage(payload) {
        nativeCalls.push(payload);
        if (payload.type === "R20_SAFARI_STORAGE_PREFLIGHT") {
          return {
            ok: true,
            pendingCount: 0,
            pendingBytes: 0,
            freeBytes: 536870912,
          };
        }
        if (payload.type === "R20_SAFARI_WRITE_INBOX_EXPORT") {
          return {
            ok: true,
            savedFileName: "세션B.json",
            pendingCount: 1,
            pendingBytes: 45,
            inboxRelativePath: "roll20/inbox",
          };
        }
        throw new Error(`Unexpected native message: ${payload.type}`);
      },
    },
  };
  const doc = createPopupDocument();
  const controller = createPopupController({
    api,
    doc,
    pingRetryDelayMs: 0,
  });

  await controller.handleExportClick();

  assert.deepEqual(
    calls.map((entry) => entry.payload.type),
    [
      "R20_SAFARI_EXPORT_PING",
      "R20_SAFARI_EXPORT_PING",
      "R20_SAFARI_EXPORT_PING",
      "R20_SAFARI_EXPORT_MEASURE",
      "R20_SAFARI_EXPORT_JSON",
    ]
  );
  assert.deepEqual(
    nativeCalls.map((entry) => entry.type),
    ["R20_SAFARI_STORAGE_PREFLIGHT", "R20_SAFARI_WRITE_INBOX_EXPORT"]
  );
  assert.equal(doc.elements.statusStage.textContent, "완료");
  assert.equal(doc.elements.statusMessage.textContent, "복사완료! 앱으로 돌아가주세요.");
  assert.equal(doc.elements.statusFilename.textContent, "세션B.json");
});

test("popup controller reports content script readiness failure when the page does not answer ping", async () => {
  const calls = [];
  const api = {
    tabs: {
      async query() {
        return [{ id: 42 }];
      },
      async sendMessage(tabId, payload) {
        calls.push({ tabId, payload });
        return undefined;
      },
    },
    runtime: {
      async sendNativeMessage() {
        throw new Error("native bridge should not run before content ping succeeds");
      },
    },
  };
  const doc = createPopupDocument();
  const controller = createPopupController({
    api,
    doc,
    pingRetryDelayMs: 0,
  });

  await controller.handleExportClick();

  assert.equal(doc.elements.statusStage.textContent, "오류");
  assert.equal(
    doc.elements.statusMessage.textContent,
    "사파리 페이지 연결이 아직 준비되지 않았습니다. 페이지를 새로고침한 뒤 다시 시도해주세요."
  );
  assert.deepEqual(
    calls.map((entry) => entry.payload.type),
    [
      "R20_SAFARI_EXPORT_PING",
      "R20_SAFARI_EXPORT_PING",
      "R20_SAFARI_EXPORT_PING",
      "R20_SAFARI_EXPORT_MEASURE",
      "R20_SAFARI_EXPORT_MEASURE",
      "R20_SAFARI_EXPORT_MEASURE",
    ]
  );
  assert.equal(doc.elements.exportButton.disabled, false);
  assert.equal(doc.elements.exportButton.textContent, "리딩로그로 복사하기");
});

test("popup controller reports Korean Safari guidance when no Roll20 tab is active", async () => {
  const api = {
    tabs: {
      async query() {
        return [];
      },
    },
    runtime: {
      async sendNativeMessage() {
        throw new Error("native bridge should not run without an active tab");
      },
    },
  };
  const doc = createPopupDocument();
  const controller = createPopupController({
    api,
    doc,
  });

  await controller.handleExportClick();

  assert.equal(doc.elements.statusStage.textContent, "오류");
  assert.equal(doc.elements.statusMessage.textContent, "사파리에서 Roll20 페이지를 먼저 열어주세요.");
  assert.equal(doc.elements.exportButton.disabled, false);
  assert.equal(doc.elements.exportButton.textContent, "리딩로그로 복사하기");
});
