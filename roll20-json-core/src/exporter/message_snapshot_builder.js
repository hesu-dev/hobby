const parserUtils = require("../parsers/parser_utils.js");

function normalizeSpeakerName(raw) {
  const compact = String(raw || "").replace(/\s+/g, " ").trim();
  if (!compact) return "";
  if (/^:+$/.test(compact)) return compact;
  return compact.replace(/:+$/, "").trim();
}

function resolveMessageContext(current, previous) {
  const prev = previous || {};
  const now = current || {};

  const normalizedSpeaker = normalizeSpeakerName(now.speaker || "");
  const previousSpeaker = normalizeSpeakerName(prev.speaker || "");
  const canInheritAvatarContext =
    !normalizedSpeaker || normalizedSpeaker === previousSpeaker;
  const currentAvatarSrc = String(now.avatarSrc || "").trim();
  const currentSpeakerImageUrl = String(now.speakerImageUrl || "").trim();
  const currentTimestamp = String(now.timestamp || "").replace(/\s+/g, " ").trim();
  const inheritedAvatarSrc =
    currentAvatarSrc || (canInheritAvatarContext ? String(prev.avatarSrc || "") : "");
  const inheritedSpeakerImageUrl =
    currentSpeakerImageUrl ||
    (canInheritAvatarContext ? String(prev.speakerImageUrl || "") : "") ||
    inheritedAvatarSrc;
  const inheritedTimestamp = currentTimestamp || String(prev.timestamp || "");

  return {
    speaker: normalizedSpeaker || previousSpeaker || "",
    avatarSrc: inheritedAvatarSrc,
    speakerImageUrl: inheritedSpeakerImageUrl,
    timestamp: inheritedTimestamp,
  };
}

function shouldInheritMessageContext(role, options = {}) {
  if (options && (options.hasDescStyle || options.hasEmoteStyle)) {
    return false;
  }
  if (String(role || "").toLowerCase() === "system") {
    return false;
  }
  return true;
}

function inferRuleTypeFromDiceRule(rule = "") {
  const normalized = String(rule || "").trim().toLowerCase();
  if (!normalized) return "";
  if (normalized.includes("insane")) return "Insane";
  if (normalized.includes("coc")) return "COC";
  return "";
}

function resolveSnapshotText(message) {
  if (message?.hasDescStyle) return String(message?.text || "");
  const rawHtml = String(message?.html || "");
  if (
    rawHtml &&
    typeof parserUtils.serializeInlineFormattingHtmlToMarkdown === "function"
  ) {
    const serialized = parserUtils.serializeInlineFormattingHtmlToMarkdown(rawHtml);
    if (serialized) return serialized;
  }
  return String(message?.text || "");
}

function buildMessageSnapshots({
  messages = [],
  avatarResolutionContext = null,
  resolveAvatarUrl = null,
  toAbsoluteUrl = (value) => String(value || "").trim(),
} = {}) {
  const list = Array.isArray(messages) ? messages : [];
  const snapshots = [];
  let previousMessageContext = {
    speaker: "",
    avatarSrc: "",
    speakerImageUrl: "",
    timestamp: "",
  };
  let detectedRuleType = "";

  list.forEach((message, index) => {
    if (message?.hiddenPlaceholder || message?.displayNone) return;

    const role = String(message?.role || "character");
    const canInherit = shouldInheritMessageContext(role, {
      hasDescStyle: !!message?.hasDescStyle,
      hasEmoteStyle: !!message?.hasEmoteStyle,
      hasAvatar: !!(message?.avatarOriginalUrl || message?.avatarResolvedUrl),
    });
    const fallbackContext = canInherit
      ? previousMessageContext
      : { speaker: "", avatarSrc: "", speakerImageUrl: "", timestamp: "" };
    const resolvedContext = resolveMessageContext(
      {
        speaker: message?.speaker || "",
        avatarSrc: message?.avatarOriginalUrl || "",
        speakerImageUrl: message?.avatarResolvedUrl || message?.avatarOriginalUrl || "",
        timestamp: message?.timestamp || "",
      },
      fallbackContext
    );
    const speaker = resolvedContext.speaker;
    const fallbackSpeakerImageUrl =
      resolvedContext.speakerImageUrl || resolvedContext.avatarSrc;
    const speakerImageUrl =
      typeof resolveAvatarUrl === "function"
        ? resolveAvatarUrl(
            {
              name: speaker,
              currentSrc: resolvedContext.avatarSrc,
              currentAvatarUrl: fallbackSpeakerImageUrl,
            },
            avatarResolutionContext,
            {
              toAbsoluteUrl,
              normalizeSpeakerName,
            }
          ) || String(message?.speakerImageUrl || "").trim() || fallbackSpeakerImageUrl
        : String(message?.speakerImageUrl || "").trim() || fallbackSpeakerImageUrl;
    const effectiveTimestamp = String(resolvedContext.timestamp || "")
      .replace(/\s+/g, " ")
      .trim();
    const dice = message?.dice && typeof message.dice === "object" ? message.dice : null;
    const roleForEntry = dice ? "dice" : role;
    if (!detectedRuleType) {
      detectedRuleType = inferRuleTypeFromDiceRule(dice?.rule || "");
    }

    snapshots.push({
      id: String(message?.id || index + 1),
      speaker,
      role: roleForEntry,
      timestamp: effectiveTimestamp,
      textColor: String(message?.textColor || "").trim(),
      text: resolveSnapshotText(message),
      imageUrl: message?.imageUrl || null,
      speakerImageUrl: speakerImageUrl || null,
      dice,
    });

    if (canInherit) {
      previousMessageContext = {
        speaker,
        avatarSrc: resolvedContext.avatarSrc,
        speakerImageUrl: speakerImageUrl || "",
        timestamp: effectiveTimestamp,
      };
    }
  });

  return {
    snapshots,
    lineCount: snapshots.length,
    ruleType: detectedRuleType,
  };
}

module.exports = {
  normalizeSpeakerName,
  resolveMessageContext,
  shouldInheritMessageContext,
  inferRuleTypeFromDiceRule,
  buildMessageSnapshots,
};
