const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildMessageSnapshots,
} = require("../src/exporter/message_snapshot_builder.js");

test("message snapshot builder excludes hidden and display-none messages and preserves inherited avatar context", () => {
  const visibleMessage = {
    hiddenPlaceholder: false,
    displayNone: false,
    speaker: "KP:",
    role: "character",
    timestamp: "8:15 PM",
    text: "테스트 메시지",
    textColor: "#ff00aa",
    avatarOriginalUrl: "https://app.roll20.net/users/avatar/abc/123",
    avatarResolvedUrl: "https://cdn.example.com/avatar-final.png",
  };
  const inheritedMessage = {
    hiddenPlaceholder: false,
    displayNone: false,
    speaker: "",
    role: "character",
    timestamp: "",
    text: "이어지는 대사",
    textColor: "",
    avatarOriginalUrl: "",
    avatarResolvedUrl: "",
  };
  const hiddenMessage = {
    hiddenPlaceholder: true,
    displayNone: false,
    speaker: "숨김",
    role: "character",
    text: "This message has been hidden by the GM.",
  };
  const displayNoneMessage = {
    hiddenPlaceholder: false,
    displayNone: true,
    speaker: "안보임",
    role: "character",
    text: "숨겨진 메시지",
  };

  const result = buildMessageSnapshots({
    messages: [visibleMessage, inheritedMessage, hiddenMessage, displayNoneMessage],
  });

  assert.equal(result.snapshots.length, 2);
  assert.equal(result.snapshots[0].speaker, "KP");
  assert.equal(result.snapshots[0].speakerImageUrl, "https://cdn.example.com/avatar-final.png");
  assert.equal(result.snapshots[1].speaker, "KP");
  assert.equal(result.snapshots[1].speakerImageUrl, "https://cdn.example.com/avatar-final.png");
  assert.equal(result.snapshots[1].timestamp, "8:15 PM");
});

test("message snapshot builder inherits avatar context when the current speaker matches the previous speaker", () => {
  const result = buildMessageSnapshots({
    messages: [
      {
        speaker: "KP:",
        role: "character",
        timestamp: "8:15 PM",
        text: "첫번째",
        avatarOriginalUrl: "https://app.roll20.net/users/avatar/abc/123",
        avatarResolvedUrl: "https://cdn.example.com/avatar-final.png",
      },
      {
        speaker: "KP",
        role: "character",
        timestamp: "8:16 PM",
        text: "두번째",
        avatarOriginalUrl: "",
        avatarResolvedUrl: "",
      },
    ],
  });

  assert.equal(result.snapshots[1].speaker, "KP");
  assert.equal(result.snapshots[1].speakerImageUrl, "https://cdn.example.com/avatar-final.png");
});

test("message snapshot builder clears avatar context when the speaker changes and the current message has no avatar", () => {
  const result = buildMessageSnapshots({
    messages: [
      {
        speaker: "KP:",
        role: "character",
        timestamp: "8:15 PM",
        text: "첫번째",
        avatarOriginalUrl: "https://app.roll20.net/users/avatar/abc/123",
        avatarResolvedUrl: "https://cdn.example.com/avatar-final.png",
      },
      {
        speaker: "PL",
        role: "character",
        timestamp: "8:16 PM",
        text: "두번째",
        avatarOriginalUrl: "",
        avatarResolvedUrl: "",
      },
    ],
  });

  assert.equal(result.snapshots[1].speaker, "PL");
  assert.equal(result.snapshots[1].speakerImageUrl, null);
});

test("message snapshot builder serializes inline em and strong html to markdown text", () => {
  const result = buildMessageSnapshots({
    messages: [
      {
        speaker: "KP:",
        role: "character",
        timestamp: "8:15 PM",
        text: "안녕하세요 안녕하세요 안녕하세요",
        html: "<em>안녕하세요</em> <strong>안녕하세요</strong> <strong><em>안녕하세요</em></strong>",
      },
    ],
  });

  assert.equal(
    result.snapshots[0].text,
    "*안녕하세요* **안녕하세요** ***안녕하세요***"
  );
});
