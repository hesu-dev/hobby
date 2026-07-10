(function () {
  const SAFARI_PING_MESSAGE = "R20_SAFARI_EXPORT_PING";
  const SAFARI_MEASURE_MESSAGE = "R20_SAFARI_EXPORT_MEASURE";
  const SAFARI_COLLECT_AVATAR_CANDIDATES_MESSAGE = "R20_SAFARI_COLLECT_AVATAR_CANDIDATES";
  const SAFARI_EXPORT_JSON_MESSAGE = "R20_SAFARI_EXPORT_JSON";
  const PAGE_AVATAR_RESOLVE_REQUEST_TYPE = "READINGLOG_SAFARI_PAGE_AVATAR_RESOLVE_REQUEST";
  const PAGE_AVATAR_RESOLVE_RESPONSE_TYPE = "READINGLOG_SAFARI_PAGE_AVATAR_RESOLVE_RESPONSE";
  const PAGE_AVATAR_RESOLVER_SCRIPT_ID = "readinglog-safari-page-avatar-resolver";
  const SYSTEM_CLASS_NAMES = ["desc", "emote", "em", "emas"];
  const DICE_TEMPLATE_CLASS_PREFIX = "sheet-rolltemplate-";
  const sharedCoreApi =
    typeof module !== "undefined" && module.exports
      ? require("../../../../../roll20-json-core/src/index.js")
      : typeof window !== "undefined"
        ? window.Roll20JsonCore || {}
        : {};
  const chatJsonApi =
    sharedCoreApi.chatJson ||
    (typeof window !== "undefined" ? window.Roll20CleanerChatJson || window.Roll20JsonCore?.chatJson : {}) ||
    {};
  const parserUtilsApi =
    sharedCoreApi.parserUtils ||
    (typeof window !== "undefined" ? window.Roll20JsonCore?.parserUtils : {}) ||
    {};
  const cocRuleParserApi =
    sharedCoreApi.cocRuleParser ||
    (typeof window !== "undefined" ? window.Roll20JsonCore?.cocRuleParser : {}) ||
    {};
  const avatarRedirectCache = new Map();
  let pageAvatarResolverReadyPromise = null;
  let pageAvatarResolveSequence = 0;

  function logAvatarTrace(level, payload) {
    const logger = console?.[level] || console?.log;
    if (typeof logger === "function") {
      logger("[AvatarResolver]", payload);
    }
  }

  function getDefaultDocument() {
    return typeof document !== "undefined" ? document : null;
  }

  function parseCampaignNameFromHref(href) {
    if (!href) return "";
    const match = String(href).match(/\/campaigns\/details\/\d+\/([^/?#]+)/i);
    if (!match?.[1]) return "";
    try {
      return decodeURIComponent(match[1]).trim();
    } catch (error) {
      return String(match[1]).trim();
    }
  }

  function extractCampaignNameFromHref(doc = getDefaultDocument()) {
    if (!doc?.querySelectorAll) return "";
    const anchors = Array.from(doc.querySelectorAll('a[href*="/campaigns/details/"]'));
    for (const anchor of anchors) {
      const name = parseCampaignNameFromHref(anchor.getAttribute?.("href") || "");
      if (name) return name;
    }
    return "";
  }

  function getDownloadNameBase(doc = getDefaultDocument()) {
    return extractCampaignNameFromHref(doc) || String(doc?.title || "").trim() || "roll20-chat";
  }

  function normalizeSpeakerName(raw) {
    const compact = String(raw || "").replace(/\s+/g, " ").trim();
    if (!compact) return "";
    if (/^:+$/.test(compact)) return compact;
    return compact.replace(/:+$/, "").trim();
  }

  function getDirectMessageChildBySelector(messageEl, selector) {
    return Array.from(messageEl?.children || []).find((child) => child.matches?.(selector));
  }

  function getMessageSpeakerName(messageEl) {
    const byEl = getDirectMessageChildBySelector(messageEl, "span.by");
    return normalizeSpeakerName(byEl?.textContent || "");
  }

  function getMessageAvatarImage(messageEl) {
    const avatarWrap = Array.from(messageEl?.children || []).find((child) =>
      child.classList?.contains("avatar")
    );
    if (!avatarWrap?.querySelector) return null;
    return avatarWrap.querySelector("img");
  }

  function getMessageTimestamp(messageEl) {
    const tstampEl = getDirectMessageChildBySelector(messageEl, "span.tstamp");
    return String(tstampEl?.textContent || "").replace(/\s+/g, " ").trim();
  }

  function extractInlineColorValue(rawStyle) {
    const matched = String(rawStyle || "").match(/(?:^|;)\s*color\s*:\s*([^;]+)/i);
    if (!matched?.[1]) return "";
    return String(matched[1]).trim();
  }

  function getMessageTextColor(messageEl) {
    const directSpans = Array.from(messageEl?.children || []).filter((child) =>
      child.matches?.("span")
    );
    const textSpan = directSpans.find((child) => {
      if (child.matches?.("span.by") || child.matches?.("span.tstamp")) return false;
      if (child.classList?.contains("inlinerollresult")) return false;
      return true;
    });
    if (!textSpan) return "";

    const fromAttr = extractInlineColorValue(textSpan.getAttribute?.("style"));
    if (fromAttr) return fromAttr;

    const fromStyle = String(textSpan.style?.color || "").trim();
    if (fromStyle) return fromStyle;

    return "";
  }

  function hasDescStyle(messageEl) {
    return !!messageEl?.classList?.contains?.("desc");
  }

  function hasEmoteStyle(messageEl) {
    if (!messageEl?.classList) return false;
    return (
      messageEl.classList.contains("emote") ||
      messageEl.classList.contains("em") ||
      messageEl.classList.contains("emas")
    );
  }

  function classListHasPrefix(node, prefix) {
    if (!node?.classList || !prefix) return false;
    for (const token of node.classList) {
      if (String(token || "").startsWith(prefix)) return true;
    }
    return false;
  }

  function resolveRoleForMessage(messageEl) {
    const classList = messageEl?.classList;
    let role = "character";

    if (classList?.contains?.("private")) role = "secret";

    if (classList) {
      for (const className of SYSTEM_CLASS_NAMES) {
        if (classList.contains(className)) {
          role = "system";
          break;
        }
      }
    }

    const bySpan = messageEl?.querySelector?.("span.by");
    const next = bySpan?.nextElementSibling || null;
    const isDice =
      classListHasPrefix(next, DICE_TEMPLATE_CLASS_PREFIX) ||
      !!messageEl?.querySelector?.(`[class*="${DICE_TEMPLATE_CLASS_PREFIX}"]`);
    if (isDice) return "dice";

    return role;
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
    if (options.hasDescStyle || options.hasEmoteStyle) return false;
    if (String(role || "").toLowerCase() === "system") return false;
    return true;
  }

  function toAbsoluteUrl(value, baseUrl = "") {
    const raw = String(value || "").trim();
    if (!raw) return "";
    const fallbackBase =
      baseUrl ||
      String(getDefaultDocument()?.baseURI || "") ||
      (typeof location !== "undefined" ? String(location.href || "") : "");
    try {
      return new URL(raw, fallbackBase || undefined).href;
    } catch (error) {
      return raw;
    }
  }

  function normalizeMessageText(raw) {
    if (typeof chatJsonApi.normalizeMessageText === "function") {
      return chatJsonApi.normalizeMessageText(raw);
    }
    return String(raw || "").replace(/\s+/g, " ").trim();
  }

  function parseDicePayload({ role, html }) {
    const parsed =
      typeof chatJsonApi.parseRoll20DicePayload === "function"
        ? chatJsonApi.parseRoll20DicePayload({ role, html })
        : null;
    if (parsed) return parsed;

    const template =
      typeof parserUtilsApi.extractTemplateName === "function"
        ? parserUtilsApi.extractTemplateName(html)
        : "";
    if (
      String(role || "").toLowerCase() === "dice" &&
      String(template || "").toLowerCase() === "coc-attack-bonus" &&
      typeof cocRuleParserApi.parseCocRulePayload === "function"
    ) {
      return cocRuleParserApi.parseCocRulePayload({
        role,
        html,
        template: "coc-attack-bonus-penalty",
      });
    }

    return null;
  }

  function cloneMessageBody(messageEl) {
    const clone = messageEl?.cloneNode?.(true);
    if (!clone) return null;

    clone.querySelectorAll?.("span.by, span.tstamp, .avatar").forEach((node) => node.remove?.());
    return clone;
  }

  function extractMessageHtml(messageEl) {
    const clone = cloneMessageBody(messageEl);
    return String(clone?.innerHTML || "");
  }

  function extractMessageText(messageEl) {
    const clone = cloneMessageBody(messageEl);
    if (!clone) return normalizeMessageText(messageEl?.textContent || "");

    if (hasDescStyle(messageEl) && typeof chatJsonApi.joinDescAnchorLines === "function") {
      const descWithLineBreaks = chatJsonApi.joinDescAnchorLines(clone.innerHTML || "", "\n");
      if (descWithLineBreaks) return descWithLineBreaks;
    }

    const serializeHtml =
      typeof parserUtilsApi.serializeInlineFormattingHtmlToMarkdown === "function"
        ? parserUtilsApi.serializeInlineFormattingHtmlToMarkdown
        : null;
    if (serializeHtml && clone.innerHTML) {
      const serialized = serializeHtml(clone.innerHTML || "");
      if (serialized) return normalizeMessageText(serialized);
    }

    return normalizeMessageText(clone.textContent || "");
  }

  function getInlineMessageImageUrl(messageEl, doc = getDefaultDocument()) {
    const clone = messageEl?.cloneNode?.(true);
    if (!clone) return null;
    clone.querySelectorAll?.(".avatar, span.by, span.tstamp").forEach((node) => node.remove?.());
    const imageEl = clone.querySelector?.("img[src]");
    if (!imageEl?.getAttribute) return null;
    const rawSrc = String(imageEl.getAttribute("src") || "").trim();
    if (!rawSrc) return null;
    return toAbsoluteUrl(rawSrc, String(doc?.baseURI || ""));
  }

  function isHiddenPlaceholderMessage(messageEl) {
    const rawText = String(messageEl?.textContent || "");
    if (typeof chatJsonApi.isHiddenMessagePlaceholderText === "function") {
      return chatJsonApi.isHiddenMessagePlaceholderText(rawText);
    }
    return rawText.includes("This message has been hidden");
  }

  function buildChatJsonEntry(payload) {
    if (typeof chatJsonApi.buildChatJsonEntry === "function") {
      return chatJsonApi.buildChatJsonEntry(payload);
    }
    return payload;
  }

  function buildChatJsonDocument(payload) {
    if (typeof chatJsonApi.buildChatJsonDocument === "function") {
      return chatJsonApi.buildChatJsonDocument(payload);
    }
    return {
      schemaVersion: 1,
      ebookView: {
        titlePage: {
          scenarioTitle: String(payload?.scenarioTitle || ""),
          ruleType: "",
          gm: "",
          pl: "",
          writer: "",
          copyright: "",
          identifier: "",
          extraMetaItems: [],
        },
      },
      lines: Array.isArray(payload?.lines) ? payload.lines : [],
    };
  }

  function collectMessages(doc) {
    if (typeof chatJsonApi.collectJsonExportMessages === "function") {
      return chatJsonApi.collectJsonExportMessages(doc);
    }
    return Array.from(doc?.querySelectorAll?.("div.message") || []);
  }

  function getExtensionRuntime() {
    if (typeof browser !== "undefined" && browser?.runtime) return browser.runtime;
    if (typeof chrome !== "undefined" && chrome?.runtime) return chrome.runtime;
    return null;
  }

  function sendRuntimeMessage(payload) {
    const runtime = getExtensionRuntime();
    if (typeof runtime?.sendMessage !== "function") {
      return Promise.resolve(undefined);
    }
    try {
      const result = runtime.sendMessage(payload);
      if (result && typeof result.then === "function") {
        return result;
      }
      return Promise.resolve(result);
    } catch (error) {
      return Promise.resolve(undefined);
    }
  }

  function getExtensionRuntimeUrl(path) {
    const runtime = getExtensionRuntime();
    if (typeof runtime?.getURL !== "function") return "";
    return String(runtime.getURL(path) || "");
  }

  async function resolveRedirectViaBackground(url, { traceId = "" } = {}) {
    const absolute = toAbsoluteUrl(url);
    if (!absolute || !isRoll20AvatarUrl(absolute)) return "";

    try {
      logAvatarTrace("info", {
        traceId,
        stage: "background_request",
        url: absolute,
      });
      const response = await sendRuntimeMessage({
        type: "R20_SAFARI_RESOLVE_REDIRECT_URL",
        url: absolute,
        traceId,
      });
      const finalUrl = toAbsoluteUrl(response?.finalUrl || "", absolute);
      logAvatarTrace("info", {
        traceId,
        stage: "background_response",
        url: absolute,
        ok: !!response?.ok,
        finalUrl,
        stillRoll20: isRoll20AvatarUrl(finalUrl),
      });
      if (response?.ok && finalUrl && !isRoll20AvatarUrl(finalUrl)) {
        return finalUrl;
      }
    } catch (error) {
      logAvatarTrace("warn", {
        traceId,
        stage: "background_error",
        url: absolute,
        error: String(error?.message || error),
      });
      // Fall through to the content/page strategies below.
    }

    return "";
  }

  function mapLimit(items, limit, iteratee) {
    const list = Array.isArray(items) ? items : [];
    const workerCount = Math.max(1, Math.min(Number(limit) || 1, list.length || 1));
    let cursor = 0;

    async function runWorker() {
      while (cursor < list.length) {
        const currentIndex = cursor;
        cursor += 1;
        await iteratee(list[currentIndex], currentIndex);
      }
    }

    return Promise.all(Array.from({ length: workerCount }, () => runWorker()));
  }

  function isRoll20AvatarUrl(url) {
    return /\/users\/avatar\/[^/]+\/\d+/i.test(String(url || ""));
  }

  function resolveAvatarUrlViaImage(absoluteUrl, timeoutMs = 1500) {
    return new Promise((resolve) => {
      if (!absoluteUrl || typeof Image !== "function") {
        resolve("");
        return;
      }

      const image = new Image();
      let finished = false;
      const finish = (value) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        resolve(value || "");
      };
      const timer = setTimeout(() => finish(""), timeoutMs);
      image.onload = () => finish(image.currentSrc || image.src || "");
      image.onerror = () => finish("");
      image.src = absoluteUrl;
    });
  }

  async function resolveAvatarUrl(url, { loadedImageUrlMap, traceId = "" } = {}) {
    const absolute = toAbsoluteUrl(url);
    if (!absolute) return "";

    const loaded = loadedImageUrlMap?.get?.(absolute);
    if (loaded && !isRoll20AvatarUrl(loaded)) return loaded;
    if (!isRoll20AvatarUrl(absolute)) return absolute;
    if (avatarRedirectCache.has(absolute)) return avatarRedirectCache.get(absolute) || absolute;

    const cacheResolvedUrl = (value) => {
      const resolved = toAbsoluteUrl(value, absolute);
      if (resolved && !isRoll20AvatarUrl(resolved)) {
        avatarRedirectCache.set(absolute, resolved);
        return resolved;
      }
      return "";
    };

    try {
      const byBackground = cacheResolvedUrl(
        await resolveRedirectViaBackground(absolute, { traceId })
      );
      if (byBackground) return byBackground;

      const byImageFirst = cacheResolvedUrl(await resolveAvatarUrlViaImage(absolute, 2500));
      if (byImageFirst) return byImageFirst;

      if (typeof fetch === "function") {
        try {
          const manualResponse = await fetch(absolute, {
            method: "GET",
            redirect: "manual",
            credentials: "include",
          });
          const location = manualResponse?.headers?.get?.("location");
          const manualResolved = cacheResolvedUrl(location ? toAbsoluteUrl(location, absolute) : "");
          if (manualResolved) return manualResolved;
        } catch (error) {
          // Continue to the next strategy.
        }

        try {
          const followedResponse = await fetch(absolute, {
            method: "GET",
            redirect: "follow",
            credentials: "include",
          });
          const followedResolved = cacheResolvedUrl(followedResponse?.url || "");
          if (followedResolved) return followedResolved;
        } catch (error) {
          // Continue to the next strategy.
        }
      }

      const byImageLast = cacheResolvedUrl(await resolveAvatarUrlViaImage(absolute, 4000));
      if (byImageLast) return byImageLast;
    } catch (error) {
      // Fall through to the fallback below.
    }

    avatarRedirectCache.set(absolute, absolute);
    return absolute;
  }

  async function ensurePageAvatarResolverInjected(doc = getDefaultDocument()) {
    if (pageAvatarResolverReadyPromise) return pageAvatarResolverReadyPromise;

    pageAvatarResolverReadyPromise = new Promise((resolve) => {
      const root = doc?.head || doc?.documentElement || doc?.body;
      const scriptUrl = getExtensionRuntimeUrl("js/page_avatar_resolver.js");
      if (!root || !scriptUrl || !doc?.createElement) {
        resolve(false);
        return;
      }

      const existing = doc.getElementById?.(PAGE_AVATAR_RESOLVER_SCRIPT_ID);
      if (existing) {
        resolve(true);
        return;
      }

      const script = doc.createElement("script");
      script.id = PAGE_AVATAR_RESOLVER_SCRIPT_ID;
      script.src = scriptUrl;
      script.async = false;
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      root.appendChild(script);
    });

    return pageAvatarResolverReadyPromise;
  }

  async function resolveAvatarMappingsViaPageBridge(
    avatarCandidates,
    { doc = getDefaultDocument(), timeoutMs = 12000, traceId = "" } = {}
  ) {
    const candidates = Array.isArray(avatarCandidates) ? avatarCandidates : [];
    if (!candidates.length || typeof window === "undefined") return [];

    const injected = await ensurePageAvatarResolverInjected(doc);
    logAvatarTrace("info", {
      traceId,
      stage: "page_injected",
      injected,
    });
    if (!injected) return [];

    return new Promise((resolve) => {
      const requestId = `readinglog-safari-avatar-resolve-${Date.now()}-${++pageAvatarResolveSequence}`;
      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        window.removeEventListener("message", handleMessage);
        resolve(Array.isArray(value) ? value : []);
      };
      const handleMessage = (event) => {
        if (event.source !== window) return;
        const payload = event.data;
        if (payload?.type !== PAGE_AVATAR_RESOLVE_RESPONSE_TYPE) return;
        if (String(payload?.requestId || "") !== requestId) return;
        finish(payload?.resolvedAvatars || []);
      };
      const timer = setTimeout(() => finish([]), Math.max(0, Number(timeoutMs) || 0));

      window.addEventListener("message", handleMessage);
      window.postMessage(
        {
          source: "readinglog-safari-content",
          type: PAGE_AVATAR_RESOLVE_REQUEST_TYPE,
          requestId,
          traceId,
          avatarCandidates: candidates,
        },
        "*"
      );
    });
  }

  async function collectAvatarMappingsFromRoot(root, options = {}) {
    const settings = options instanceof Map ? { loadedImageUrlMap: options } : options || {};
    const loadedImageUrlMap =
      settings.loadedImageUrlMap instanceof Map ? settings.loadedImageUrlMap : undefined;
    const resolveAvatarUrlOverride =
      typeof settings.resolveAvatarUrl === "function" ? settings.resolveAvatarUrl : null;
    const resolveAvatarMappingsOverride =
      typeof settings.resolveAvatarMappings === "function" ? settings.resolveAvatarMappings : null;
    const avatarCandidates = collectAvatarCandidatesFromRoot(root);
    const resolvedByOriginal = new Map();

    if (resolveAvatarMappingsOverride) {
      const resolvedItems = await resolveAvatarMappingsOverride(avatarCandidates);
      for (const item of Array.isArray(resolvedItems) ? resolvedItems : []) {
        const originalUrl = String(item?.originalUrl || "").trim();
        if (!originalUrl) continue;
        const avatarUrl = toAbsoluteUrl(item?.avatarUrl || "", originalUrl) || originalUrl;
        resolvedByOriginal.set(originalUrl, avatarUrl);
        if (!isRoll20AvatarUrl(avatarUrl)) {
          avatarRedirectCache.set(originalUrl, avatarUrl);
        }
      }
    } else {
      const pageResolvedItems = await resolveAvatarMappingsViaPageBridge(avatarCandidates, {
        doc: root,
        traceId: String(settings.traceId || ""),
      });
      for (const item of Array.isArray(pageResolvedItems) ? pageResolvedItems : []) {
        const originalUrl = String(item?.originalUrl || "").trim();
        if (!originalUrl) continue;
        const avatarUrl = toAbsoluteUrl(item?.avatarUrl || "", originalUrl) || originalUrl;
        resolvedByOriginal.set(originalUrl, avatarUrl);
        if (!isRoll20AvatarUrl(avatarUrl)) {
          avatarRedirectCache.set(originalUrl, avatarUrl);
        }
      }
    }

    const pendingResolutions = new Set(
      avatarCandidates
        .map((candidate) => String(candidate?.originalUrl || "").trim())
        .filter((url) => isRoll20AvatarUrl(url) && !avatarRedirectCache.has(url))
    );

    const resolveMappingUrl = async (url) => {
      if (resolveAvatarUrlOverride) {
        const resolved = toAbsoluteUrl(
          await resolveAvatarUrlOverride(url, { loadedImageUrlMap, traceId: settings.traceId }),
          url
        );
        const finalUrl = resolved || url;
        avatarRedirectCache.set(url, finalUrl);
        return finalUrl;
      }
      return resolveAvatarUrl(url, {
        loadedImageUrlMap,
        traceId: String(settings.traceId || ""),
      });
    };

    await mapLimit(Array.from(pendingResolutions), 6, async (url) => {
      await resolveMappingUrl(url);
    });

    const results = avatarCandidates.map((candidate) => {
      const name = String(candidate?.name || "");
      const absolute = String(candidate?.originalUrl || "");
      const current = String(candidate?.avatarUrl || "");
      let finalUrl = resolvedByOriginal.get(absolute) || current || absolute;
      if (!finalUrl || isRoll20AvatarUrl(finalUrl)) {
        const cached = avatarRedirectCache.get(absolute) || "";
        if (cached && !isRoll20AvatarUrl(cached)) {
          finalUrl = cached;
        } else {
          const loaded = loadedImageUrlMap?.get?.(absolute) || "";
          finalUrl = loaded && !isRoll20AvatarUrl(loaded) ? loaded : absolute;
        }
      }

      return {
        id: `${name}|||${absolute}|||${finalUrl}`,
        name,
        avatarUrl: finalUrl,
        originalUrl: absolute,
      };
    });

    logAvatarTrace("info", {
      traceId: String(settings.traceId || ""),
      stage: "final_mappings",
      candidateCount: avatarCandidates.length,
      resolvedCount: results.filter((item) => !isRoll20AvatarUrl(item.avatarUrl)).length,
      unresolvedCount: results.filter((item) => isRoll20AvatarUrl(item.avatarUrl)).length,
      sample: results.slice(0, 3),
    });

    return results;
  }

  function collectAvatarCandidatesFromRoot(root) {
    const messages = collectMessages(root);
    const byVariant = new Map();
    const baseUrl = String(root?.baseURI || "");

    for (const messageEl of messages) {
      const name = getMessageSpeakerName(messageEl);
      const avatarImage = getMessageAvatarImage(messageEl);
      if (!name || !avatarImage?.getAttribute) continue;

      const rawSrc = String(avatarImage.getAttribute("src") || "").trim();
      if (!rawSrc) continue;

      const originalUrl = toAbsoluteUrl(rawSrc, baseUrl);
      if (!originalUrl) continue;

      const currentAvatarUrl = toAbsoluteUrl(
        avatarImage.currentSrc || avatarImage.src || originalUrl,
        baseUrl
      ) || originalUrl;
      const variantKey = `${name}|||${originalUrl}|||${currentAvatarUrl}`;
      if (!byVariant.has(variantKey)) {
        byVariant.set(variantKey, {
          id: variantKey,
          name,
          originalUrl,
          avatarUrl: currentAvatarUrl,
        });
      }
    }

    return Array.from(byVariant.values());
  }

  function buildJsonExportNormalizedMessages(messages, { doc = getDefaultDocument() } = {}) {
    const baseUrl = String(doc?.baseURI || "");
    const safeResolveMessageId =
      typeof chatJsonApi.resolveMessageId === "function"
        ? chatJsonApi.resolveMessageId
        : (message, index) => String(message?.id || index + 1);
    const safeIsHiddenPlaceholder =
      typeof chatJsonApi.isHiddenMessagePlaceholderText === "function"
        ? chatJsonApi.isHiddenMessagePlaceholderText
        : (raw) => String(raw || "").includes("This message has been hidden");

    return (Array.isArray(messages) ? messages : []).map((messageEl, index) => {
      const role = resolveRoleForMessage(messageEl);
      const avatarImage = getMessageAvatarImage(messageEl);
      const rawCurrentSrc = String(avatarImage?.getAttribute?.("src") || "").trim();
      const currentSrc = rawCurrentSrc ? toAbsoluteUrl(rawCurrentSrc, baseUrl) : "";
      const rawResolvedAvatarUrl = String(
        avatarImage?.currentSrc || avatarImage?.src || rawCurrentSrc || ""
      ).trim();
      const resolvedAvatarUrl = rawResolvedAvatarUrl
        ? toAbsoluteUrl(rawResolvedAvatarUrl, baseUrl)
        : "";
      const messageId =
        messageEl?.getAttribute?.("data-messageid") ||
        messageEl?.id ||
        messageEl?.getAttribute?.("id") ||
        "";

      return {
        id: safeResolveMessageId({ id: messageId }, index),
        speaker: getMessageSpeakerName(messageEl),
        role,
        timestamp: getMessageTimestamp(messageEl),
        textColor: getMessageTextColor(messageEl),
        text: extractMessageText(messageEl),
        html: extractMessageHtml(messageEl),
        imageUrl: getInlineMessageImageUrl(messageEl, doc),
        avatarOriginalUrl: currentSrc,
        avatarResolvedUrl: resolvedAvatarUrl,
        dice: parseDicePayload({
          role,
          html: messageEl?.innerHTML || "",
        }),
        hiddenPlaceholder: safeIsHiddenPlaceholder(messageEl?.textContent || ""),
        displayNone: false,
        hasDescStyle: hasDescStyle(messageEl),
        hasEmoteStyle: hasEmoteStyle(messageEl),
      };
    });
  }

  function estimateDomNodes(node) {
    const children = Array.from(node?.children || []);
    return 1 + children.reduce((count, child) => count + estimateDomNodes(child), 0);
  }

  function measureSafariExport({ doc = getDefaultDocument() } = {}) {
    const messages = collectMessages(doc);
    return {
      messageCount: messages.length,
      domNodeEstimate: messages.reduce((total, messageEl) => total + estimateDomNodes(messageEl), 0),
      filenameBase: getDownloadNameBase(doc),
      titleCandidate: extractCampaignNameFromHref(doc) || String(doc?.title || "").trim() || "roll20-chat",
    };
  }

  function buildSafariExportPayloadLegacy({ doc = getDefaultDocument() } = {}) {
    const messages = collectMessages(doc);
    const lines = [];
    let previousMessageContext = {
      speaker: "",
      avatarSrc: "",
      speakerImageUrl: "",
      timestamp: "",
    };

    messages.forEach((messageEl, index) => {
      if (isHiddenPlaceholderMessage(messageEl)) return;

      const role = resolveRoleForMessage(messageEl);
      const rawSpeaker = getMessageSpeakerName(messageEl);
      const rawTimestamp = getMessageTimestamp(messageEl);
      const avatarImage = getMessageAvatarImage(messageEl);
      const rawCurrentSrc = String(avatarImage?.getAttribute?.("src") || "").trim();
      const currentSrc = rawCurrentSrc ? toAbsoluteUrl(rawCurrentSrc, String(doc?.baseURI || "")) : "";
      const rawResolvedAvatarUrl = String(
        avatarImage?.currentSrc || avatarImage?.src || rawCurrentSrc || ""
      ).trim();
      const resolvedAvatarUrl = rawResolvedAvatarUrl
        ? toAbsoluteUrl(rawResolvedAvatarUrl, String(doc?.baseURI || ""))
        : "";
      const canInherit = shouldInheritMessageContext(role, {
        hasDescStyle: hasDescStyle(messageEl),
        hasEmoteStyle: hasEmoteStyle(messageEl),
        hasAvatar: !!avatarImage,
      });
      const fallbackContext = canInherit
        ? previousMessageContext
        : { speaker: "", avatarSrc: "", speakerImageUrl: "", timestamp: "" };
      const resolvedContext = resolveMessageContext(
        {
          speaker: rawSpeaker,
          avatarSrc: currentSrc,
          speakerImageUrl: resolvedAvatarUrl || currentSrc,
          timestamp: rawTimestamp,
        },
        fallbackContext
      );
      const speaker = resolvedContext.speaker;
      const speakerImageUrl = resolvedContext.speakerImageUrl || resolvedContext.avatarSrc;
      const effectiveTimestamp = String(resolvedContext.timestamp || "")
        .replace(/\s+/g, " ")
        .trim();
      const dice = parseDicePayload({
        role,
        html: messageEl?.innerHTML || "",
      });
      const roleForEntry = dice ? "dice" : role;
      const messageId =
        messageEl?.getAttribute?.("data-messageid") ||
        messageEl?.id ||
        messageEl?.getAttribute?.("id") ||
        "";

      lines.push(
        buildChatJsonEntry({
          id:
            typeof chatJsonApi.resolveMessageId === "function"
              ? chatJsonApi.resolveMessageId({ id: messageId }, index)
              : String(messageId || index + 1),
          speaker,
          role: roleForEntry,
          timestamp: effectiveTimestamp,
          textColor: getMessageTextColor(messageEl),
          text: extractMessageText(messageEl),
          imageUrl: getInlineMessageImageUrl(messageEl, doc),
          speakerImageUrl: speakerImageUrl || null,
          dice,
        })
      );

      if (canInherit) {
        previousMessageContext = {
          speaker,
          avatarSrc: resolvedContext.avatarSrc,
          speakerImageUrl: speakerImageUrl || "",
          timestamp: effectiveTimestamp,
        };
      }
    });

    const documentPayload = buildChatJsonDocument({
      scenarioTitle: extractCampaignNameFromHref(doc),
      lines,
    });
    const rawJsonText = JSON.stringify(documentPayload, null, 2);
    const jsonText =
      typeof chatJsonApi.normalizeImgurLinksInJsonText === "function"
        ? chatJsonApi.normalizeImgurLinksInJsonText(rawJsonText)
        : rawJsonText;

    return {
      jsonText,
      filenameBase: getDownloadNameBase(doc),
    };
  }

  async function buildSafariExportPayload({
    doc = getDefaultDocument(),
    avatarMappings,
    resolveAvatarMappings,
    replacements = [],
    traceId = "",
  } = {}) {
    const buildSnapshots = sharedCoreApi.messageSnapshotBuilder?.buildMessageSnapshots;
    const buildExportDocument = sharedCoreApi.exportDocumentBuilder?.buildExportDocument;
    const createAvatarExportResolutionContext =
      sharedCoreApi.avatarResolutionContext?.createAvatarExportResolutionContext;
    const resolveAvatarExportUrl =
      sharedCoreApi.avatarResolutionContext?.resolveAvatarExportUrl;

    if (
      typeof buildSnapshots !== "function" ||
      typeof buildExportDocument !== "function" ||
      typeof createAvatarExportResolutionContext !== "function" ||
      typeof resolveAvatarExportUrl !== "function"
    ) {
      return buildSafariExportPayloadLegacy({ doc });
    }

    let effectiveAvatarMappings = Array.isArray(avatarMappings) ? avatarMappings : [];
    if (!Array.isArray(avatarMappings)) {
      try {
        effectiveAvatarMappings = await collectAvatarMappingsFromRoot(doc, {
          resolveAvatarMappings,
          traceId,
        });
      } catch (error) {
        console.warn("[ReadingLog Safari] Failed to resolve avatar mappings:", error);
        effectiveAvatarMappings = [];
      }
    }

    const absoluteForDoc = (value, baseUrl = String(doc?.baseURI || "")) =>
      toAbsoluteUrl(value, baseUrl);
    const avatarResolutionContext = createAvatarExportResolutionContext(
      {
        avatarMappings: effectiveAvatarMappings,
        replacements,
      },
      {
        toAbsoluteUrl: absoluteForDoc,
        normalizeSpeakerName,
      }
    );
    const snapshotResult = buildSnapshots({
      messages: buildJsonExportNormalizedMessages(collectMessages(doc), { doc }),
      avatarResolutionContext,
      resolveAvatarUrl: resolveAvatarExportUrl,
      toAbsoluteUrl: absoluteForDoc,
    });
    const exportResult = buildExportDocument({
      scenarioTitle: extractCampaignNameFromHref(doc),
      snapshots: snapshotResult?.snapshots || [],
      compact: false,
    });

    return {
      jsonText: String(exportResult?.jsonText || ""),
      filenameBase: getDownloadNameBase(doc),
    };
  }

  function createRuntimeMessageHandler({
    measureSafariExport: measure = measureSafariExport,
    collectAvatarCandidatesFromRoot: collectAvatarCandidates = collectAvatarCandidatesFromRoot,
    buildSafariExportPayload: buildPayload = buildSafariExportPayload,
  } = {}) {
    return async (message) => {
      if (message?.type === SAFARI_PING_MESSAGE) {
        return { ok: true };
      }

      if (message?.type === SAFARI_MEASURE_MESSAGE) {
        try {
          return {
            ok: true,
            ...measure(),
          };
        } catch (error) {
          return {
            ok: false,
            errorMessage:
              error?.message ? String(error.message) : "Roll20 DOM 계측 중 오류가 발생했습니다.",
          };
        }
      }

      if (message?.type === SAFARI_COLLECT_AVATAR_CANDIDATES_MESSAGE) {
        try {
          return {
            ok: true,
            avatarCandidates: collectAvatarCandidates(getDefaultDocument()),
          };
        } catch (error) {
          return {
            ok: false,
            errorMessage:
              error?.message ? String(error.message) : "프로필 이미지 정보를 확인하지 못했습니다.",
          };
        }
      }

      if (message?.type === SAFARI_EXPORT_JSON_MESSAGE) {
        try {
          const payload = await buildPayload({
            doc: getDefaultDocument(),
            avatarMappings: Array.isArray(message?.avatarMappings) ? message.avatarMappings : undefined,
            traceId: String(message?.traceId || ""),
          });
          return {
            ok: true,
            jsonText: String(payload?.jsonText || ""),
            filenameBase: String(payload?.filenameBase || "roll20-chat"),
          };
        } catch (error) {
          return {
            ok: false,
            errorMessage:
              error?.message ? String(error.message) : "JSON 생성 중 오류가 발생했습니다.",
          };
        }
      }

      return undefined;
    };
  }

  const runtime =
    typeof browser !== "undefined"
      ? browser.runtime
      : typeof chrome !== "undefined"
        ? chrome.runtime
        : null;

  if (runtime?.onMessage?.addListener) {
    runtime.onMessage.addListener(createRuntimeMessageHandler());
  }

  const api = {
    SAFARI_PING_MESSAGE,
    SAFARI_MEASURE_MESSAGE,
    SAFARI_COLLECT_AVATAR_CANDIDATES_MESSAGE,
    SAFARI_EXPORT_JSON_MESSAGE,
    parseCampaignNameFromHref,
    extractCampaignNameFromHref,
    getDownloadNameBase,
    parseDicePayload,
    measureSafariExport,
    collectAvatarCandidatesFromRoot,
    collectAvatarMappingsFromRoot,
    buildSafariExportPayload,
    createRuntimeMessageHandler,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
    return;
  }

  window.Roll20SafariExportContent = api;
})();
