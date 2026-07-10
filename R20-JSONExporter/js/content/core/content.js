// content.js
// Refactored to use modules: Utils, Avatar, Style, Dom

(function () {
  console.log("[Roll20Cleaner] content.js initializing...");

  if (globalThis.__roll20CleanerContentLoaded) {
    console.log("[Roll20Cleaner] content.js already loaded, preventing duplicate init.");
    return;
  }
  globalThis.__roll20CleanerContentLoaded = true;

  // --- Wrapper Accessors for Modules ---
  // Accessing window.Roll20Cleaner* directly at the top level is risky 
  // if this script runs before others. We access them lazily.

  const getUtils = () => window.Roll20CleanerUtils || {};
  const getAvatar = () => window.Roll20CleanerAvatar || {};
  const getAvatarExportResolution = () => window.Roll20CleanerAvatarExportResolution || {};
  const getAvatarRules = () => window.Roll20CleanerAvatarRules || {};
  const getChatJson = () => window.Roll20CleanerChatJson || {};
  const getSharedCore = () => window.Roll20JsonCore || {};
  const getMessageContext = () => window.Roll20CleanerMessageContext || {};
  const getRoleParser = () => window.Roll20CleanerRoleParser || {};
  const getCoc7Import = () => window.Roll20CleanerCoc7Import || {};
  const getMacroImport = () => window.Roll20CleanerMacroImport || {};
  const getStyle = () => window.Roll20CleanerStyle || {};
  const getDom = () => window.Roll20CleanerDom || {};
  const getData = () => window.Roll20CleanerData || {};
  const getRootState = () => window.Roll20CleanerRootState || {};
  const getPerf = () => window.Roll20CleanerPerf || {};
  const getArchiveHtml = () => window.Roll20CleanerArchiveHtml || {};

  const TEST_HTML_BASE_BYTES = 13045405;
  let archiveBaseCssTextPromise = null;

  const settings = {
    colorFilterEnabled: false,
    hiddenTextEnabled: false,
    targetColor: "color: #aaaaaa",
    styleQuery: null,
  };

  async function fetchExtensionText(path) {
    const url = chrome.runtime.getURL(path);
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Failed to load ${path}: ${response.status}`);
    }
    return response.text();
  }

  function requestBaseCssTextFromBackground() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: "GET_EXTENSION_BASE_CSS_TEXT" }, (response) => {
        if (chrome.runtime.lastError) {
          resolve("");
          return;
        }
        if (!response?.ok) {
          resolve("");
          return;
        }
        resolve(String(response.text || ""));
      });
    });
  }

  async function getArchiveBaseCssText() {
    if (!archiveBaseCssTextPromise) {
      archiveBaseCssTextPromise = (async () => {
        try {
          const direct = await fetchExtensionText("css/base.css");
          if (direct && direct.trim()) return direct;
        } catch (error) {
          console.warn("[Roll20Cleaner] Failed to load css/base.css directly:", error);
        }
        return requestBaseCssTextFromBackground();
      })();
    }
    return archiveBaseCssTextPromise;
  }

  // --- Filtering Logic (Specific to content.js state) ---

  function extractColorValue(rawInput) {
    const raw = (rawInput || "").trim();
    if (!raw) return "";
    const match = raw.match(/color\s*:\s*([^;]+)/i);
    if (match?.[1]) return match[1].trim();
    return raw;
  }

  function normalizeStyleKey(rawKey) {
    const key = (rawKey || "").trim().toLowerCase();
    if (!key) return "color";
    if (key === "컬러" || key === "색상") return "color";
    if (key === "오퍼시티" || key === "투명도") return "opacity";
    if (key === "글자색" || key === "폰트색") return "color";
    return key;
  }

  function parseStyleQuery(rawInput) {
    const raw = (rawInput || "").trim();
    if (!raw) return null;
    const unquoted = raw.replace(/^["']\s*|\s*["']$/g, "").trim();
    if (!unquoted) return null;

    const match = unquoted.match(/^([^:=]+?)\s*[:=]\s*(.+)$/);
    let key = "color";
    let value = unquoted;
    if (match) {
      key = normalizeStyleKey(match[1]);
      value = match[2].trim().replace(/;$/, "").trim();
    } else {
      value = extractColorValue(unquoted);
      key = "color";
    }

    if (!value) return null;

    return { key, value };
  }

  function getInlineStyleValue(styleText, key) {
    if (!styleText || !key) return "";
    const regex = new RegExp(`(?:^|;)\\s*${key}\\s*:\\s*([^;]+)`, "i");
    const match = styleText.match(regex);
    return match?.[1]?.trim() || "";
  }

  function isRootClassDesired() {
    const { computeRootClassDesired } = getRootState();
    if (computeRootClassDesired) return computeRootClassDesired(settings);
    return settings.colorFilterEnabled || settings.hiddenTextEnabled;
  }

  function updateRootState() {
    const { ROOT_CLASS } = getData();
    if (!ROOT_CLASS) return;
    const desired = isRootClassDesired();
    const { syncRootClass } = getRootState();
    if (syncRootClass) {
      syncRootClass(document.documentElement.classList, ROOT_CLASS, desired);
      return;
    }
    document.documentElement.classList.toggle(ROOT_CLASS, desired);
  }

  function markHidden(el, reasonAttr) {
    const { PREV_DISPLAY_ATTR } = getData();
    if (el.hasAttribute(reasonAttr)) return;
    el.setAttribute(reasonAttr, "true");
    if (!el.hasAttribute(PREV_DISPLAY_ATTR)) {
      el.setAttribute(PREV_DISPLAY_ATTR, el.style.display || "");
    }
    el.style.display = "none";
  }

  function unmarkHidden(el, reasonAttr) {
    const { COLOR_HIDE_ATTR, TEXT_HIDE_ATTR, PREV_DISPLAY_ATTR } = getData();

    if (!el.hasAttribute(reasonAttr)) return;
    el.removeAttribute(reasonAttr);
    const stillHidden =
      el.hasAttribute(COLOR_HIDE_ATTR) || el.hasAttribute(TEXT_HIDE_ATTR);
    if (stillHidden) {
      el.style.display = "none";
      return;
    }

    const prev = el.getAttribute(PREV_DISPLAY_ATTR);
    el.removeAttribute(PREV_DISPLAY_ATTR);
    if (prev) {
      el.style.display = prev;
      return;
    }
    el.style.removeProperty("display");
  }

  function getTargetSpan(messageEl) {
    const spans = messageEl.querySelectorAll("span");
    if (spans.length < 3) return null;
    return spans[2];
  }

  function hasMatchingStyleInMessage(messageEl) {
    if (!settings.styleQuery) return false;

    const hasAnyTargetStyle = (styleText) => {
      const inline = String(styleText || "");
      if (!inline) return false;
      const color = getInlineStyleValue(inline, "color");
      if (color) return true;
      const opacity = getInlineStyleValue(inline, "opacity");
      return !!opacity;
    };

    const thirdSpan = getTargetSpan(messageEl);
    if (thirdSpan && hasAnyTargetStyle(thirdSpan.getAttribute?.("style"))) {
      return true;
    }

    const styledNodes = messageEl.querySelectorAll("[style]");
    for (const node of styledNodes) {
      const inlineStyle = node.getAttribute("style") || "";
      if (hasAnyTargetStyle(inlineStyle)) {
        return true;
      }
    }

    return false;
  }

  function isDocumentRoot(rootEl) {
    return rootEl === document.documentElement;
  }

  function collectMessages(root) {
    const { MESSAGE_SELECTOR } = getData();
    if (!MESSAGE_SELECTOR) return [];

    const rootEl = root?.nodeType === 1 ? root : document.documentElement;
    const messages = [];
    if (rootEl.matches?.(MESSAGE_SELECTOR)) {
      messages.push(rootEl);
    }
    if (rootEl.querySelectorAll) {
      messages.push(...rootEl.querySelectorAll(MESSAGE_SELECTOR));
    }
    return messages;
  }

  function cleanupStaleTextHiddenNodesIfNeeded(rootEl) {
    const { MESSAGE_SELECTOR, TEXT_HIDE_ATTR } = getData();
    if (!isDocumentRoot(rootEl)) return;
    const stale = document.querySelectorAll(`[${TEXT_HIDE_ATTR}]`);
    stale.forEach((el) => {
      if (!el.matches?.(MESSAGE_SELECTOR)) {
        unmarkHidden(el, TEXT_HIDE_ATTR);
      }
    });
  }

  function applyColorFilterToMessage(messageEl) {
    const { COLOR_HIDE_ATTR } = getData();
    if (!settings.colorFilterEnabled || !settings.styleQuery) {
      unmarkHidden(messageEl, COLOR_HIDE_ATTR);
      return;
    }
    if (hasMatchingStyleInMessage(messageEl)) {
      markHidden(messageEl, COLOR_HIDE_ATTR);
      return;
    }
    unmarkHidden(messageEl, COLOR_HIDE_ATTR);
  }

  function applyHiddenTextFilterToMessage(messageEl) {
    const { TEXT_HIDE_ATTR, HIDDEN_TEXT } = getData();
    if (!settings.hiddenTextEnabled) {
      unmarkHidden(messageEl, TEXT_HIDE_ATTR);
      return;
    }
    if (messageEl.textContent?.includes(HIDDEN_TEXT)) {
      markHidden(messageEl, TEXT_HIDE_ATTR);
      return;
    }
    unmarkHidden(messageEl, TEXT_HIDE_ATTR);
  }

  function applyFiltersToMessages(messages) {
    messages.forEach((messageEl) => {
      applyColorFilterToMessage(messageEl);
      applyHiddenTextFilterToMessage(messageEl);
    });
  }

  function applyFilters(root) {
    const rootEl = root?.nodeType === 1 ? root : document.documentElement;
    cleanupStaleTextHiddenNodesIfNeeded(rootEl);
    const messages = collectMessages(rootEl);
    applyFiltersToMessages(messages);
  }

  async function applyFiltersBatched(root, options = {}) {
    const rootEl = root?.nodeType === 1 ? root : document.documentElement;
    cleanupStaleTextHiddenNodesIfNeeded(rootEl);
    const messages = collectMessages(rootEl);
    const chunkSize = Math.max(100, Number(options.chunkSize) || 300);
    const onProgress = typeof options.onProgress === "function" ? options.onProgress : null;
    const shouldContinue =
      typeof options.shouldContinue === "function" ? options.shouldContinue : () => true;

    for (let i = 0; i < messages.length; i += chunkSize) {
      if (!shouldContinue()) return { canceled: true, total: messages.length, processed: i };
      const slice = messages.slice(i, i + chunkSize);
      applyFiltersToMessages(slice);
      if (onProgress) {
        onProgress({
          processed: Math.min(messages.length, i + slice.length),
          total: messages.length,
        });
      }
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    if (onProgress) {
      onProgress({ processed: messages.length, total: messages.length });
    }
    return { canceled: false, total: messages.length, processed: messages.length };
  }

  let fullApplyRunToken = 0;
  async function runFullFilterApply({ requestId = "", reportProgress = false } = {}) {
    const runToken = ++fullApplyRunToken;
    const sendProgress = (processed, total) => {
      if (!reportProgress || !requestId) return;
      chrome.runtime.sendMessage({
        type: "FILTER_APPLY_PROGRESS",
        requestId,
        processed,
        total,
        label: `화면 반영 중... (${processed.toLocaleString()}/${Math.max(
          1,
          total
        ).toLocaleString()})`,
      });
    };

    try {
      await applyFiltersBatched(document.documentElement, {
        chunkSize: 300,
        shouldContinue: () => runToken === fullApplyRunToken,
        onProgress: ({ processed, total }) => sendProgress(processed, total),
      });

      if (reportProgress && requestId && runToken === fullApplyRunToken) {
        chrome.runtime.sendMessage({
          type: "FILTER_APPLY_DONE",
          requestId,
          ok: true,
        });
      }
    } catch (error) {
      if (reportProgress && requestId) {
        chrome.runtime.sendMessage({
          type: "FILTER_APPLY_DONE",
          requestId,
          ok: false,
          errorMessage: error?.message ? String(error.message) : "화면 반영 중 오류가 발생했습니다.",
        });
      }
    }
  }

  function refreshSettings(next) {
    settings.colorFilterEnabled = next.colorFilterEnabled;
    settings.hiddenTextEnabled = next.hiddenTextEnabled;
    settings.targetColor = next.targetColor;
    settings.styleQuery = parseStyleQuery(settings.targetColor);
    updateRootState();
    runFullFilterApply({ reportProgress: false });
  }

  const scheduleRootStateSync = (() => {
    const { createCoalescedScheduler } = getRootState();
    if (createCoalescedScheduler) {
      return createCoalescedScheduler(() => updateRootState());
    }

    let scheduled = false;
    return () => {
      if (scheduled) return;
      scheduled = true;
      setTimeout(() => {
        scheduled = false;
        updateRootState();
      }, 0);
    };
  })();

  // --- Main Build Functions ---

  function appendDoctypeIfNeeded(html) {
    if (document.doctype) {
      return `<!DOCTYPE ${document.doctype.name}>\n${html}`;
    }
    return html;
  }

  function removeArchiveFooterArtifacts(cloneRoot) {
    if (!cloneRoot || typeof cloneRoot.querySelectorAll !== "function") return;
    const selectors = [
      "#dicerollerdialog",
      "#monica-content-root",
    ];
    selectors.forEach((selector) => {
      cloneRoot.querySelectorAll(selector).forEach((node) => node.remove());
    });
  }

  async function buildVisibleHtmlCore({
    requestId = "",
    includeScripts = false,
    withAvatarReplacements = null,
    reportProgress = false,
  } = {}) {
    const { reportBundleProgress } = getUtils();
    const perf = getPerf();
    const {
      processVisibleNodes,
      processVisibleNodesBatched,
      estimateElementCount,
      removeSheetTemplateAreaNewlines,
      removeNonSingleFileAttrs,
      absolutizeResourceUrls,
      stripHeadJsAndCss,
      inlineScripts,
    } = getDom();
    const { applyAvatarReplacementsToClone } = getAvatar();

    const report = (percent, label) => {
      if (!reportProgress || !reportBundleProgress) return;
      reportBundleProgress(requestId, percent, label);
    };

    const start = performance.now();
    const clone = document.documentElement.cloneNode(true);
    const estimatedNodes = estimateElementCount ? estimateElementCount(document.documentElement) : 0;
    // report(5, `DOM 준비 중 (${estimatedNodes.toLocaleString()} 노드 추정)`);
    report(5, `복사 준비 중...`);

    if (processVisibleNodesBatched) {
      await processVisibleNodesBatched(document.documentElement, clone, {
        estimatedNodes,
        styleMode: "auto",
        chunkSize: 400,
        onProgress: ({ processedNodes, estimatedNodes: total }) => {
          if (!reportProgress) return;
          const ratio = total ? Math.min(1, processedNodes / total) : 0;
          const percent = 10 + Math.floor(ratio * 40);
          // report(percent, `DOM 처리 중 (${processedNodes.toLocaleString()}/${total.toLocaleString()})`);
           report(percent, `설정 파일 체크 중..`);
        },
      });
    } else if (processVisibleNodes) {
      processVisibleNodes(document.documentElement, clone, {
        styleMode: "balanced",
        estimatedNodes,
      });
      // report(50, "DOM 처리 완료");
       report(50, "HTML에 설정 적용 중..");
    } else {
      throw new Error("Roll20CleanerDom.processVisibleNodes is missing!");
    }

    removeHiddenPlaceholderMessages(clone);
    removeSheetTemplateAreaNewlines(clone);
    removeNonSingleFileAttrs(clone);
    repeatCollapsedMessageMeta(clone);
    removeArchiveFooterArtifacts(clone);
    report(60, "리소스 정리 중...");

    if (withAvatarReplacements && applyAvatarReplacementsToClone) {
      applyAvatarReplacementsToClone(clone, withAvatarReplacements);
    }

    await absolutizeResourceUrls(clone);

    if (includeScripts) {
      report(75, "스크립트 포함 중...");
      await inlineScripts(clone);
    } else {
      stripHeadJsAndCss(clone);
    }

    report(90, "HTML 파일 준비 중...");
    const serializer = new XMLSerializer();
    const rawHtml = appendDoctypeIfNeeded(serializer.serializeToString(clone));
    const { sanitizeArchiveExportHtml } = getArchiveHtml();
    const inlineCssText = await getArchiveBaseCssText();
    const html =
      typeof sanitizeArchiveExportHtml === "function"
        ? sanitizeArchiveExportHtml(rawHtml, { inlineCssText })
        : rawHtml;
    const bytes = perf.getUtf8ByteLength ? perf.getUtf8ByteLength(html) : new TextEncoder().encode(html).length;
    const elapsedMs = Math.round(performance.now() - start);
    report(100, `완료 (${(bytes / (1024 * 1024)).toFixed(2)}MB, ${elapsedMs}ms)`);

    return {
      html,
      bytes,
      elapsedMs,
      estimatedNodes,
    };
  }

  async function buildVisibleHtml() {
    const result = await buildVisibleHtmlCore();
    return result.html;
  }

  async function buildVisibleHtmlWithoutHeadAssets(requestId = "", reportProgress = false) {
    try {
      const result = await buildVisibleHtmlCore({
        requestId,
        includeScripts: false,
        reportProgress,
      });
      return result;
    } catch (e) {
      console.error("[Roll20Cleaner] Critical Error in buildVisibleHtmlWithoutHeadAssets:", e);
      throw e;
    }
  }

  async function buildVisibleHtmlWithAvatarReplacements(replacements) {
    const result = await buildVisibleHtmlCore({
      withAvatarReplacements: replacements,
      includeScripts: false,
      reportProgress: false,
    });
    return result.html;
  }

  async function buildProfileImageReplacementChunks(replacements) {
    const { applyAvatarReplacementsToClone } = getAvatar();
    const { serializeDocumentCloneToChunks } = getDom();
    const { chunkString } = window.Roll20CleanerHtmlChunk || {};
    const { sanitizeArchiveExportHtml } = getArchiveHtml();
    const clone = document.documentElement.cloneNode(true);
    removeHiddenPlaceholderMessages(clone);
    repeatCollapsedMessageMeta(clone);
    removeArchiveFooterArtifacts(clone);
    if (applyAvatarReplacementsToClone) {
      applyAvatarReplacementsToClone(clone, replacements);
    }
    if (!serializeDocumentCloneToChunks) {
      throw new Error("serializeDocumentCloneToChunks 함수가 준비되지 않았습니다.");
    }
    const chunks = serializeDocumentCloneToChunks(clone, {
      doctypeName: document.doctype?.name || "",
      maxChunkSize: 1024 * 512,
    });

    if (typeof sanitizeArchiveExportHtml !== "function") {
      return chunks;
    }

    const joined = Array.isArray(chunks) ? chunks.join("") : "";
    const inlineCssText = await getArchiveBaseCssText();
    const sanitized = sanitizeArchiveExportHtml(joined, { inlineCssText });
    if (typeof chunkString === "function") {
      return chunkString(sanitized, 1024 * 512);
    }
    return [sanitized];
  }

  // --- Helper: Campaign Name ---

  function parseCampaignNameFromHref(href) {
    if (!href) return "";
    const match = href.match(/\/campaigns\/details\/\d+\/([^/?#]+)/i);
    if (!match?.[1]) return "";
    try {
      return decodeURIComponent(match[1]).trim();
    } catch (error) {
      return match[1].trim();
    }
  }

  function extractCampaignNameFromHref() {
    const anchors = Array.from(document.querySelectorAll('a[href*="/campaigns/details/"]'));
    for (const anchor of anchors) {
      const name = parseCampaignNameFromHref(anchor.getAttribute("href") || "");
      if (name) return name;
    }
    return "";
  }

  function getDownloadNameBase() {
    return extractCampaignNameFromHref() || document.title || "roll20-chat";
  }

  function normalizeSpeakerName(raw) {
    const compact = String(raw || "").replace(/\s+/g, " ").trim();
    if (!compact) return "";
    if (/^:+$/.test(compact)) return compact;
    return compact.replace(/:+$/, "").trim();
  }

  function getMessageSpeakerName(messageEl) {
    const byEl = Array.from(messageEl.children || []).find((child) =>
      child.matches?.("span.by")
    );
    return normalizeSpeakerName(byEl?.textContent || "");
  }

  function getMessageAvatarImage(messageEl) {
    const avatarWrap = Array.from(messageEl.children || []).find((child) =>
      child.classList?.contains("avatar")
    );
    if (!avatarWrap) return null;
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

    const inlineFromAttr = extractInlineColorValue(textSpan.getAttribute?.("style"));
    if (inlineFromAttr) return inlineFromAttr;

    const inlineFromStyle = String(textSpan.style?.color || "").trim();
    if (inlineFromStyle) return inlineFromStyle;

    return "";
  }

  function hasDescStyle(messageEl) {
    if (!messageEl?.classList) return false;
    return messageEl.classList.contains("desc");
  }

  function hasEmoteStyle(messageEl) {
    if (!messageEl?.classList) return false;
    return (
      messageEl.classList.contains("emote") ||
      messageEl.classList.contains("em") ||
      messageEl.classList.contains("emas")
    );
  }

  function getDirectMessageChildByClass(messageEl, className) {
    return Array.from(messageEl.children || []).find((child) =>
      child.classList?.contains(className)
    );
  }

  function getDirectMessageChildBySelector(messageEl, selector) {
    return Array.from(messageEl.children || []).find((child) => child.matches?.(selector));
  }

  function isHiddenPlaceholderMessage(messageEl) {
    if (!messageEl?.classList) return false;
    if (!messageEl.classList.contains("message") || !messageEl.classList.contains("general")) {
      return false;
    }
    const { isHiddenMessagePlaceholderText } = getChatJson();
    const text = messageEl.textContent || "";
    if (typeof isHiddenMessagePlaceholderText === "function") {
      return isHiddenMessagePlaceholderText(text);
    }
    return String(text).includes("This message has been hidden");
  }

  function removeHiddenPlaceholderMessages(rootEl) {
    const messages = Array.from(rootEl?.querySelectorAll?.("div.message.general") || []);
    messages.forEach((messageEl) => {
      if (isHiddenPlaceholderMessage(messageEl)) {
        messageEl.remove();
      }
    });
  }

  function repeatCollapsedMessageMeta(rootEl) {
    const messages = Array.from(rootEl.querySelectorAll("div.message"));
    let prevSpacer = null;
    let prevAvatar = null;
    let prevBy = null;

    messages.forEach((messageEl) => {
      let spacerEl = getDirectMessageChildByClass(messageEl, "spacer");
      let avatarEl = getDirectMessageChildByClass(messageEl, "avatar");
      let byEl = getDirectMessageChildBySelector(messageEl, "span.by");

      if (!spacerEl && prevSpacer) {
        spacerEl = prevSpacer.cloneNode(true);
        messageEl.insertBefore(spacerEl, messageEl.firstChild || null);
      }

      if (!avatarEl && prevAvatar) {
        avatarEl = prevAvatar.cloneNode(true);
        const anchor = spacerEl?.nextSibling || messageEl.firstChild || null;
        messageEl.insertBefore(avatarEl, anchor);
      }

      if (!byEl && prevBy) {
        byEl = prevBy.cloneNode(true);
        const tstampEl = getDirectMessageChildBySelector(messageEl, "span.tstamp");
        const anchor = tstampEl?.nextSibling || avatarEl?.nextSibling || messageEl.firstChild || null;
        messageEl.insertBefore(byEl, anchor);
      }

      prevSpacer = spacerEl || prevSpacer;
      prevAvatar = avatarEl || prevAvatar;
      prevBy = byEl || prevBy;
    });
  }

  function cloneMessageBody(messageEl) {
    const clone = messageEl?.cloneNode?.(true);
    if (!clone) return null;
    clone.querySelectorAll?.("span.by, span.tstamp, .avatar").forEach((node) => node.remove());
    return clone;
  }

  function extractMessageHtml(messageEl) {
    const clone = cloneMessageBody(messageEl);
    return String(clone?.innerHTML || "");
  }

  function extractMessageText(messageEl) {
    const { normalizeMessageText, joinDescAnchorLines } = getChatJson();
    const clone = cloneMessageBody(messageEl);
    if (!clone) {
      const rawFallback = messageEl?.textContent || "";
      return normalizeMessageText
        ? normalizeMessageText(rawFallback)
        : String(rawFallback).replace(/\s+/g, " ").trim();
    }

    if (hasDescStyle(messageEl) && typeof joinDescAnchorLines === "function") {
      const descWithLineBreaks = joinDescAnchorLines(clone.innerHTML || "", "\n");
      if (descWithLineBreaks) return descWithLineBreaks;
    }

    const { parserUtils = {} } = getSharedCore();
    const serializeHtml =
      typeof parserUtils.serializeInlineFormattingHtmlToMarkdown === "function"
        ? parserUtils.serializeInlineFormattingHtmlToMarkdown
        : null;
    if (serializeHtml && clone.innerHTML) {
      const serialized = serializeHtml(clone.innerHTML || "");
      if (serialized) {
        return normalizeMessageText
          ? normalizeMessageText(serialized)
          : String(serialized).replace(/\s+/g, " ").trim();
      }
    }

    const raw = clone.textContent || "";
    if (normalizeMessageText) return normalizeMessageText(raw);
    return String(raw).replace(/\s+/g, " ").trim();
  }

  function getInlineMessageImageUrl(messageEl) {
    const { toAbsoluteUrl } = getUtils();
    const safeToAbsoluteUrl =
      typeof toAbsoluteUrl === "function" ? toAbsoluteUrl : (value) => String(value || "");

    const clone = messageEl.cloneNode(true);
    clone.querySelectorAll?.(".avatar, span.by, span.tstamp").forEach((node) => node.remove());
    const imgEl = clone.querySelector?.("img[src]");
    if (!imgEl) return null;
    const src = (imgEl.getAttribute("src") || "").trim();
    if (!src) return null;
    const absolute = safeToAbsoluteUrl(src);
    return absolute || null;
  }

  function buildJsonExportNormalizedMessages(messages, options = {}) {
    const { toAbsoluteUrl } = getUtils();
    const { resolveMessageId, parseRoll20DicePayload, isHiddenMessagePlaceholderText } = getChatJson();
    const { resolveRoleForMessage } = getRoleParser();
    const safeToAbsoluteUrl =
      typeof toAbsoluteUrl === "function" ? toAbsoluteUrl : (value) => String(value || "");
    const safeResolveMessageId =
      typeof resolveMessageId === "function"
        ? resolveMessageId
        : (message, index) => String(message?.id || index + 1);
    const safeIsHiddenPlaceholder =
      typeof isHiddenMessagePlaceholderText === "function"
        ? isHiddenMessagePlaceholderText
        : (raw) => String(raw || "").includes("This message has been hidden");

    return (Array.isArray(messages) ? messages : []).map((messageEl, index) => {
      const role =
        typeof resolveRoleForMessage === "function"
          ? resolveRoleForMessage(messageEl)
          : "character";
      const rawSpeaker = getMessageSpeakerName(messageEl);
      const rawTimestamp = getMessageTimestamp(messageEl);
      const avatarImg = getMessageAvatarImage(messageEl);
      const rawCurrentSrc = (avatarImg?.getAttribute("src") || "").trim();
      const currentSrc = rawCurrentSrc ? safeToAbsoluteUrl(rawCurrentSrc) : "";
      const rawResolvedAvatarUrl = (
        avatarImg?.currentSrc ||
        avatarImg?.src ||
        rawCurrentSrc ||
        ""
      ).trim();
      const resolvedAvatarUrl = rawResolvedAvatarUrl ? safeToAbsoluteUrl(rawResolvedAvatarUrl) : "";
      const dice =
        typeof parseRoll20DicePayload === "function"
          ? parseRoll20DicePayload({
              role,
              html: messageEl?.innerHTML || "",
            })
          : null;
      const messageId =
        messageEl.getAttribute("data-messageid") ||
        messageEl.id ||
        messageEl.getAttribute("id") ||
        "";

      return {
        id: safeResolveMessageId({ id: messageId }, index),
        speaker: rawSpeaker,
        role,
        timestamp: rawTimestamp,
        textColor: getMessageTextColor(messageEl),
        text: extractMessageText(messageEl),
        html: extractMessageHtml(messageEl),
        imageUrl: getInlineMessageImageUrl(messageEl),
        avatarOriginalUrl: currentSrc,
        avatarResolvedUrl: resolvedAvatarUrl,
        dice,
        hiddenPlaceholder: safeIsHiddenPlaceholder(messageEl?.textContent || ""),
        displayNone: false,
        hasDescStyle: hasDescStyle(messageEl),
        hasEmoteStyle: hasEmoteStyle(messageEl),
      };
    });
  }

  async function buildAvatarReplacedChatJsonLegacy(replacements) {
    const options =
      arguments.length > 1 && arguments[1] && typeof arguments[1] === "object" ? arguments[1] : {};
    const { toAbsoluteUrl } = getUtils();
    const { collectAvatarMappingsFromRoot } = getAvatar();
    const { createAvatarExportResolutionContext, resolveAvatarExportUrl } = getAvatarExportResolution();
    const { buildReplacementMaps, findReplacementForMessage } = getAvatarRules();
    const {
      resolveMessageId,
      buildChatJsonEntry,
      buildChatJsonDocument,
      parseRoll20DicePayload,
      collectJsonExportMessages,
      normalizeImgurLinksInJsonText,
    } = getChatJson();
    const { resolveMessageContext, shouldInheritMessageContext } = getMessageContext();
    const { resolveRoleForMessage } = getRoleParser();
    const safeToAbsoluteUrl =
      typeof toAbsoluteUrl === "function" ? toAbsoluteUrl : (value) => String(value || "");
    const safeResolveMessageId =
      typeof resolveMessageId === "function"
        ? resolveMessageId
        : (message, index) => String(message?.id || index + 1);
    const safeBuildChatJsonEntry =
      typeof buildChatJsonEntry === "function"
        ? buildChatJsonEntry
        : ({ id, imageUrl, speaker, role, text, timestamp, textColor, speakerImageUrl, dice }) => {
            const normalizedColor = String(textColor || "").trim();
            const normalizedHexColor = normalizedColor
              .replace(/;+\s*$/g, "")
              .replace(/^color\s*:\s*/i, "")
              .trim();
            const url = String(speakerImageUrl || "").trim();
            const input = {};
            if (imageUrl) input.imageUrl = imageUrl;
            if (url) {
              input.speakerImages = {
                avatar: {
                  url,
                },
              };
            }
            if (dice && typeof dice === "object") input.dice = dice;
            return {
              id: String(id || ""),
              speaker: String(speaker || ""),
              role: String(role || "character"),
              timestamp: String(timestamp || ""),
              textColor: normalizedHexColor || "",
              text: String(text || ""),
              safetext: String(text || "")
                .replace(/[^\p{L}\p{N}\s!?.,~]/gu, "")
                .replace(/\s+/g, " ")
                .trim(),
              input,
            };
          };
    const safeBuildChatJsonDocument =
      typeof buildChatJsonDocument === "function"
        ? buildChatJsonDocument
        : ({ scenarioTitle = "", lines = [] }) => ({
            schemaVersion: 1,
            ebookView: {
              titlePage: {
                scenarioTitle: String(scenarioTitle || ""),
                ruleType: "",
                gm: "",
                pl: "",
                writer: "",
                copyright: "",
                identifier: "",
                extraMetaItems: [],
              },
            },
            lines: Array.isArray(lines) ? lines : [],
          });

    let avatarMappings = Array.isArray(options.avatarMappings) ? options.avatarMappings : [];
    if (!Array.isArray(options.avatarMappings) && typeof collectAvatarMappingsFromRoot === "function") {
      try {
        avatarMappings = await collectAvatarMappingsFromRoot(document);
      } catch (error) {
        console.warn("[Roll20Cleaner] Failed to resolve avatar mappings for JSON export:", error);
        avatarMappings = [];
      }
    }
    const exportResolutionContext =
      typeof createAvatarExportResolutionContext === "function"
        ? createAvatarExportResolutionContext(
            {
              avatarMappings,
              replacements: replacements || [],
            },
            {
              buildReplacementMaps,
              toAbsoluteUrl: safeToAbsoluteUrl,
              normalizeSpeakerName,
            }
          )
        : null;

    const messages =
      typeof collectJsonExportMessages === "function"
        ? collectJsonExportMessages(document)
        : Array.from(document.querySelectorAll("div.message"));
    let previousMessageContext = { speaker: "", avatarSrc: "", speakerImageUrl: "", timestamp: "" };
    const rows = [];
    for (const [index, messageEl] of messages.entries()) {
      const role =
        typeof resolveRoleForMessage === "function"
          ? resolveRoleForMessage(messageEl)
          : "character";
      const rawSpeaker = getMessageSpeakerName(messageEl);
      const rawTimestamp = getMessageTimestamp(messageEl);
      const avatarImg = getMessageAvatarImage(messageEl);
      const rawCurrentSrc = (avatarImg?.getAttribute("src") || "").trim();
      const currentSrc = rawCurrentSrc ? safeToAbsoluteUrl(rawCurrentSrc) : "";
      const rawResolvedAvatarUrl = (avatarImg?.currentSrc || avatarImg?.src || rawCurrentSrc || "").trim();
      const resolvedAvatarUrl = rawResolvedAvatarUrl ? safeToAbsoluteUrl(rawResolvedAvatarUrl) : "";
      const descStyle = hasDescStyle(messageEl);
      const emoteStyle = hasEmoteStyle(messageEl);
      const hasAvatar = !!avatarImg;
      const canInherit =
        typeof shouldInheritMessageContext === "function"
          ? shouldInheritMessageContext(role, {
              hasDescStyle: descStyle,
              hasEmoteStyle: emoteStyle,
              hasAvatar,
            })
          : String(role || "").toLowerCase() !== "system";
      const fallbackContext = canInherit
        ? previousMessageContext
        : { speaker: "", avatarSrc: "", speakerImageUrl: "", timestamp: "" };
      const resolvedContext =
        typeof resolveMessageContext === "function"
          ? resolveMessageContext(
              {
                speaker: rawSpeaker,
                avatarSrc: currentSrc,
                speakerImageUrl: resolvedAvatarUrl || currentSrc,
                timestamp: rawTimestamp,
              },
              fallbackContext
            )
          : (() => {
              const normalizedRawSpeaker = normalizeSpeakerName(rawSpeaker || "");
              const fallbackSpeaker = normalizeSpeakerName(fallbackContext.speaker || "");
              const canInheritAvatarContext =
                !normalizedRawSpeaker || normalizedRawSpeaker === fallbackSpeaker;
              const inheritedAvatarSrc =
                currentSrc ||
                (canInheritAvatarContext ? fallbackContext.avatarSrc || "" : "");
              const inheritedSpeakerImageUrl =
                resolvedAvatarUrl ||
                currentSrc ||
                (canInheritAvatarContext ? fallbackContext.speakerImageUrl || "" : "") ||
                inheritedAvatarSrc ||
                "";
              return {
                speaker: normalizedRawSpeaker || fallbackSpeaker || "",
                avatarSrc: inheritedAvatarSrc,
                speakerImageUrl: inheritedSpeakerImageUrl,
                timestamp: rawTimestamp || fallbackContext.timestamp || "",
              };
            })();
      const speaker = resolvedContext.speaker;
      const effectiveCurrentSrc = resolvedContext.avatarSrc;
      const effectiveSpeakerImageUrl = resolvedContext.speakerImageUrl || effectiveCurrentSrc;
      const effectiveTimestamp = String(resolvedContext.timestamp || "").replace(/\s+/g, " ").trim();
      const imageUrl =
        typeof resolveAvatarExportUrl === "function"
          ? resolveAvatarExportUrl(
              {
                name: speaker,
                currentSrc: effectiveCurrentSrc,
                currentAvatarUrl: effectiveSpeakerImageUrl,
              },
              exportResolutionContext,
              {
                findReplacementForMessage,
                toAbsoluteUrl: safeToAbsoluteUrl,
                normalizeSpeakerName,
              }
            )
          : effectiveSpeakerImageUrl;
      if (canInherit) {
        previousMessageContext = {
          speaker,
          avatarSrc: effectiveCurrentSrc,
          speakerImageUrl: imageUrl || effectiveSpeakerImageUrl || "",
          timestamp: effectiveTimestamp,
        };
      }
      const inlineImageUrl = getInlineMessageImageUrl(messageEl);
      const dice =
        typeof parseRoll20DicePayload === "function"
          ? parseRoll20DicePayload({
              role,
              html: messageEl?.innerHTML || "",
            })
          : null;
      const roleForEntry = dice ? "dice" : role;
      const messageId =
        messageEl.getAttribute("data-messageid") ||
        messageEl.id ||
        messageEl.getAttribute("id") ||
        "";

      const entry = safeBuildChatJsonEntry({
        id: safeResolveMessageId({ id: messageId }, index),
        speaker,
        role: roleForEntry,
        timestamp: effectiveTimestamp,
        textColor: getMessageTextColor(messageEl),
        text: extractMessageText(messageEl),
        imageUrl: inlineImageUrl,
        speakerImageUrl: imageUrl || null,
        dice,
      });
      rows.push(entry);
    }

    const exportDocument = safeBuildChatJsonDocument({
      scenarioTitle: extractCampaignNameFromHref(),
      lines: rows,
    });
    const jsonText = JSON.stringify(exportDocument, null, 2);
    if (typeof normalizeImgurLinksInJsonText === "function") {
      return normalizeImgurLinksInJsonText(jsonText);
    }
    return jsonText.replace(/https:\/\/(?:www\.)?imgur\.com\//gi, "https://i.imgur.com/");
  }

  async function buildAvatarReplacedChatJson(replacements) {
    const options =
      arguments.length > 1 && arguments[1] && typeof arguments[1] === "object" ? arguments[1] : {};
    const { toAbsoluteUrl } = getUtils();
    const { collectAvatarMappingsFromRoot } = getAvatar();
    const { createAvatarExportResolutionContext, resolveAvatarExportUrl } =
      getAvatarExportResolution();
    const { buildReplacementMaps } = getAvatarRules();
    const { collectJsonExportMessages } = getChatJson();
    const sharedCore = getSharedCore();
    const sharedSnapshotBuilderApi = sharedCore.messageSnapshotBuilder || {};
    const sharedExportDocumentApi = sharedCore.exportDocumentBuilder || {};
    const sharedAvatarResolutionApi = sharedCore.avatarResolutionContext || {};
    const safeToAbsoluteUrl =
      typeof toAbsoluteUrl === "function" ? toAbsoluteUrl : (value) => String(value || "");
    const buildSnapshots = sharedSnapshotBuilderApi.buildMessageSnapshots;
    const buildExportDocument = sharedExportDocumentApi.buildExportDocument;
    const createResolutionContext =
      sharedAvatarResolutionApi.createAvatarExportResolutionContext ||
      createAvatarExportResolutionContext;
    const resolveSharedAvatarUrl =
      sharedAvatarResolutionApi.resolveAvatarExportUrl || resolveAvatarExportUrl;

    if (
      typeof buildSnapshots !== "function" ||
      typeof buildExportDocument !== "function" ||
      typeof createResolutionContext !== "function" ||
      typeof resolveSharedAvatarUrl !== "function"
    ) {
      return buildAvatarReplacedChatJsonLegacy(replacements, options);
    }

    let avatarMappings = Array.isArray(options.avatarMappings) ? options.avatarMappings : [];
    if (!Array.isArray(options.avatarMappings) && typeof collectAvatarMappingsFromRoot === "function") {
      try {
        avatarMappings = await collectAvatarMappingsFromRoot(document);
      } catch (error) {
        console.warn("[Roll20Cleaner] Failed to resolve avatar mappings for JSON export:", error);
        avatarMappings = [];
      }
    }

    const avatarResolutionContext = createResolutionContext(
      {
        avatarMappings,
        replacements: replacements || [],
      },
      {
        buildMaps: buildReplacementMaps,
        toAbsoluteUrl: safeToAbsoluteUrl,
        normalizeSpeakerName,
      }
    );
    const messages =
      typeof collectJsonExportMessages === "function"
        ? collectJsonExportMessages(document)
        : Array.from(document.querySelectorAll("div.message"));
    const normalizedMessages = buildJsonExportNormalizedMessages(messages, options);
    const snapshotResult = buildSnapshots({
      messages: normalizedMessages,
      avatarResolutionContext,
      resolveAvatarUrl: resolveSharedAvatarUrl,
      toAbsoluteUrl: safeToAbsoluteUrl,
    });
    const exportResult = buildExportDocument({
      scenarioTitle: extractCampaignNameFromHref(),
      snapshots: snapshotResult.snapshots,
      compact: false,
    });

    return String(exportResult?.jsonText || "");
  }

  async function buildDirectReadingLogChatJson() {
    return buildAvatarReplacedChatJson([]);
  }

  // --- Initialization ---

  chrome.storage.sync.get(
    { colorFilterEnabled: false, hiddenTextEnabled: false, targetColor: "color: #aaaaaa" },
    refreshSettings
  );

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "sync") return;
    const next = {
      colorFilterEnabled:
        changes.colorFilterEnabled?.newValue ?? settings.colorFilterEnabled,
      hiddenTextEnabled:
        changes.hiddenTextEnabled?.newValue ?? settings.hiddenTextEnabled,
      targetColor: changes.targetColor?.newValue ?? settings.targetColor,
    };
    refreshSettings(next);
  });

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach((node) => applyFilters(node));
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  const rootClassObserver = new MutationObserver((mutations) => {
    const rootEl = document.documentElement;
    const { shouldResyncOnMutations } = getRootState();
    if (shouldResyncOnMutations) {
      if (shouldResyncOnMutations(mutations, rootEl)) {
        scheduleRootStateSync();
      }
      return;
    }

    const hasRootClassMutation = mutations.some(
      (mutation) =>
        mutation?.type === "attributes" &&
        mutation?.attributeName === "class" &&
        mutation?.target === rootEl
    );

    if (hasRootClassMutation) {
      scheduleRootStateSync();
    }
  });

  rootClassObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });

  // --- Message Handling ---

  async function buildBundledHtml(requestId) {
    const result = await buildVisibleHtmlCore({
      requestId,
      includeScripts: true,
      reportProgress: true,
    });
    return result.html;
  }

  console.log("[Roll20Cleaner] content.js setup complete, adding listeners...");

  function toErrorResponsePayload(error) {
    if (error?.code === "COPY_TOO_LARGE") {
      return {
        errorCode: 9,
        errorMessage: `복사 가능한 최대 크기를 초과했습니다. 다운로드를 이용해주세요. (${(error.htmlBytes / (1024 * 1024)).toFixed(2)}MB)`,
      };
    }
    const message = error?.message ? String(error.message) : String(error || "Unknown error");
    if (error?.name === "NotAllowedError") {
      return { errorCode: 7, errorMessage: "브라우저가 클립보드 접근을 허용하지 않았습니다." };
    }
    if (/clipboard/i.test(message)) {
      return { errorCode: 8, errorMessage: "클립보드 복사 중 오류가 발생했습니다." };
    }
    return { errorCode: 1, errorMessage: message };
  }

  function toSimpleErrorMessage(error) {
    return error?.message ? String(error.message) : "처리 중 오류가 발생했습니다.";
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // console.log("[Roll20Cleaner] Message received:", message.type);

    if (message?.type === "ROLL20_CLEANER_PING") {
      sendResponse({ ok: true });
      return;
    }

    if (message?.type === "ROLL20_CLEANER_STREAM_READY") {
      sendResponse({ ok: true });
      return;
    }

    if (message?.type === "ROLL20_CLEANER_APPLY_FILTERS") {
      const requestId = message?.requestId || "";
      sendResponse({ ok: true, accepted: true, requestId });
      runFullFilterApply({ requestId, reportProgress: !!requestId });
      return;
    }

    if (message?.type === "APPLY_COC7_IMPORT") {
      const { applyCoc7ImportText } = getCoc7Import();
      if (typeof applyCoc7ImportText !== "function") {
        sendResponse({
          ok: false,
          errorMessage: "CoC import 모듈이 준비되지 않았습니다. 페이지를 새로고침 후 다시 시도해주세요.",
        });
        return;
      }

      applyCoc7ImportText(message?.text || "", {
        defaultCharacterName: message?.defaultCharacterName || "",
      })
        .then((result) => sendResponse(result))
        .catch((error) =>
          sendResponse({
            ok: false,
            errorMessage: toSimpleErrorMessage(error),
          })
        );
      return true;
    }

    if (message?.type === "APPLY_MACRO_IMPORT") {
      const { applyMacroImportText } = getMacroImport();
      if (typeof applyMacroImportText !== "function") {
        sendResponse({
          ok: false,
          errorMessage: "Macro import 모듈이 준비되지 않았습니다. 페이지를 새로고침 후 다시 시도해주세요.",
        });
        return;
      }

      applyMacroImportText(message?.text || "")
        .then((result) => sendResponse(result))
        .catch((error) =>
          sendResponse({
            ok: false,
            errorMessage: toSimpleErrorMessage(error),
          })
        );
      return true;
    }

    const { downloadHtmlInPage, buildLoadedImageUrlMap, copyTextToClipboard, downloadTextFileInPage } = getDom();
    const { collectAvatarMappingsFromRoot } = getAvatar();

    if (message?.type === "GET_VISIBLE_HTML") {
      buildVisibleHtmlWithoutHeadAssets()
        .then((result) => sendResponse({ html: result.html, filenameBase: getDownloadNameBase() }))
        .catch((e) => {
          console.error(e);
          sendResponse({ html: "", filenameBase: getDownloadNameBase() });
        });
      return true;
    }

    if (message?.type === "GET_BUNDLED_HTML") {
      buildBundledHtml(message?.requestId || "")
        .then((html) =>
          sendResponse({ html, filenameBase: getDownloadNameBase() })
        )
        .catch((e) => {
          console.error(e);
          sendResponse({ html: "", filenameBase: getDownloadNameBase() });
        });
      return true;
    }

    if (message?.type === "GET_AVATAR_MAPPINGS") {
      collectAvatarMappingsFromRoot(document, buildLoadedImageUrlMap ? buildLoadedImageUrlMap() : undefined)
        .then((mappings) => sendResponse({ mappings }))
        .catch(() => sendResponse({ mappings: [] }));
      return true;
    }

    if (message?.type === "DOWNLOAD_BUNDLED_HTML_DIRECT") {
      const requestId = message?.requestId || "";
      sendResponse({ ok: true, accepted: true });

      (async () => {
        try {
          const result = await buildVisibleHtmlWithoutHeadAssets(requestId, true);
          if (downloadHtmlInPage) {
            downloadHtmlInPage(result.html, getDownloadNameBase());
          }
          chrome.runtime.sendMessage({
            type: "BUNDLE_DONE",
            requestId,
            ok: true,
            htmlBytes: result.bytes,
            elapsedMs: result.elapsedMs,
          });
        } catch (e) {
          console.error(e);
          chrome.runtime.sendMessage({
            type: "BUNDLE_DONE",
            requestId,
            ok: false,
            errorMessage: e?.message ? String(e.message) : "다운로드 생성 중 오류가 발생했습니다.",
          });
        }
      })();
      return;
    }

    if (message?.type === "COPY_BUNDLED_HTML_DIRECT") {
      buildVisibleHtmlWithoutHeadAssets("", false)
        .then(async (result) => {
          if (!copyTextToClipboard) {
            throw new Error("copyTextToClipboard 함수가 준비되지 않았습니다.");
          }
          const perf = getPerf();
          const copyMaxBytes = perf.computeThreeXTarget ? perf.computeThreeXTarget(TEST_HTML_BASE_BYTES) : TEST_HTML_BASE_BYTES * 3;
          if (perf.shouldBlockClipboardCopy && perf.shouldBlockClipboardCopy({ htmlBytes: result.bytes, maxBytes: copyMaxBytes })) {
            const err = new Error("copy too large");
            err.code = "COPY_TOO_LARGE";
            err.htmlBytes = result.bytes;
            throw err;
          }
          const copied = await copyTextToClipboard(result.html);
          sendResponse({
            ok: true,
            method: copied?.method || "",
            htmlBytes: result.bytes,
            elapsedMs: result.elapsedMs,
          });
        })
        .catch((e) => {
          console.error(e);
          sendResponse({ ok: false, ...toErrorResponsePayload(e) });
        });
      return true;
    }

    if (message?.type === "DOWNLOAD_WITH_AVATAR_REPLACEMENTS" || message?.type === "DOWNLOAD_WITH_AVATAR_REPLACEMENTS_HTML") {
      buildVisibleHtmlWithAvatarReplacements(message?.replacements || {})
        .then((html) => {
          if (downloadHtmlInPage) downloadHtmlInPage(html, getDownloadNameBase());
          sendResponse({ ok: true });
        })
        .catch((e) => {
          console.error(e);
          sendResponse({ ok: false });
        });
      return true;
    }

    if (message?.type === "DOWNLOAD_WITH_AVATAR_REPLACEMENTS_JSON") {
      buildAvatarReplacedChatJson(message?.replacements || [])
        .then((jsonText) => {
          if (downloadTextFileInPage) {
            downloadTextFileInPage(jsonText, getDownloadNameBase(), "json", "application/json;charset=utf-8");
          }
          sendResponse({ ok: true });
        })
        .catch((error) => {
          console.error(error);
          sendResponse({
            ok: false,
            errorMessage: error?.message ? String(error.message) : "JSON 생성 중 오류가 발생했습니다.",
          });
        });
      return true;
    }

    if (message?.type === "DOWNLOAD_READINGLOG_JSON_DIRECT") {
      buildDirectReadingLogChatJson()
        .then((jsonText) => {
          if (downloadTextFileInPage) {
            downloadTextFileInPage(
              jsonText,
              getDownloadNameBase(),
              "json",
              "application/json;charset=utf-8"
            );
          }
          sendResponse({ ok: true });
        })
        .catch((error) => {
          console.error(error);
          sendResponse({
            ok: false,
            errorMessage:
              error?.message ? String(error.message) : "JSON 생성 중 오류가 발생했습니다.",
          });
        });
      return true;
    }
  });

  chrome.runtime.onConnect.addListener((port) => {
    if (!port || port.name !== "ROLL20_CLEANER_STREAM") return;

    port.onMessage.addListener((message) => {
      if (message?.type !== "START_PROFILE_IMAGE_REPLACEMENT_DOWNLOAD") return;

      (async () => {
        const requestId = message?.requestId || "";
        port.postMessage({
          type: "STREAM_PROGRESS",
          requestId,
          percent: 10,
          label: "내용 복제 중입니다...",
        });
        const chunks = await buildProfileImageReplacementChunks(message?.replacements || []);
        port.postMessage({
          type: "STREAM_PROGRESS",
          requestId,
          percent: 80,
          label: "다운로드 준비 중입니다...",
        });
        if (getDom().downloadHtmlChunksInPage) {
          getDom().downloadHtmlChunksInPage(chunks, getDownloadNameBase());
        } else if (downloadHtmlInPage) {
          downloadHtmlInPage(chunks.join(""), getDownloadNameBase());
        }
        port.postMessage({
          type: "STREAM_DONE",
          requestId,
          ok: true,
        });
      })().catch((error) => {
        const requestId = message?.requestId || "";
        console.error(error);
        port.postMessage({
          type: "STREAM_DONE",
          requestId,
          ok: false,
          errorMessage: toSimpleErrorMessage(error),
        });
      });
    });
  });

})();
