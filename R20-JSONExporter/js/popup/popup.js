// ===== Popup DOM references =====
const targetColorEl = document.getElementById("targetColor");
const colorFilterEnabledEl = document.getElementById("colorFilterEnabled");
const hiddenTextEnabledEl = document.getElementById("hiddenTextEnabled");
const downloadTest2El = document.getElementById("downloadTest2");
const avatarEditorEl = document.getElementById("avatarEditor");
const avatarListEl = document.getElementById("avatarList");
const downloadAvatarMappedHtmlEl = document.getElementById("downloadAvatarMappedHtml");
const downloadAvatarMappedJsonEl = document.getElementById("downloadAvatarMappedJson");
const cocImportPayloadEl = document.getElementById("cocImportPayload");
const applyCocImportEl = document.getElementById("applyCocImport");
const macroImportPayloadEl = document.getElementById("macroImportPayload");
const applyMacroImportEl = document.getElementById("applyMacroImport");
const progressWrapEl = document.getElementById("progressWrap");
const progressBarEl = document.getElementById("progressBar");
const progressTextEl = document.getElementById("progressText");
const statusEl = document.getElementById("status");
const appEl = document.querySelector(".app");
const feedbackPanelEl = document.getElementById("feedbackPanel");
const popupTabButtons = document.querySelectorAll("[role=\"tab\"]");
const popupTabPanels = document.querySelectorAll("[role=\"tabpanel\"]");

// ===== External feature adapters =====
const applyFeedback = window.Roll20CleanerFilterApplyFeedback || {};
const avatarDownloadPlan = window.Roll20CleanerAvatarDownloadPlan || {};
const avatarPreview = window.Roll20CleanerAvatarPreview || {};

// ===== Shared popup state =====
let activeSettingApplyRequestId = "";
let currentAvatarMappings = [];
const pendingSettingApplyRequests = new Map();
let readyStatusProbeTimerId = null;
const inputLockReasons = new Set();

// ===== Constants =====
const READY_STATUS_LOADING_TEXT = "페이지 로딩 중입니다. 잠시 후 다시 시도하세요.";
const READY_STATUS_READY_TEXT = "준비되었습니다.";
const READY_STATUS_PROBE_INTERVAL_MS = 1200;
const COC_IMPORT_FALLBACK_TARGET_LABEL = "현재 시트";

// ===== UI primitives =====
function setStatus(text) {
  statusEl.textContent = text;
}

function setProgress(percent, text) {
  const clamped = Math.max(0, Math.min(100, Number(percent) || 0));
  progressWrapEl.classList.remove("hidden");
  progressBarEl.style.width = `${clamped}%`;
  progressTextEl.textContent = text || `${clamped}%`;
}

function hideProgress() {
  progressWrapEl.classList.add("hidden");
  progressBarEl.style.width = "0%";
  progressTextEl.textContent = "";
}

function applyInputLockState() {
  const disabled = inputLockReasons.size > 0;
  const lockTargets = document.querySelectorAll("input, textarea, button:not(.tab-button)");
  lockTargets.forEach((el) => {
    el.disabled = disabled;
  });
  if (appEl) {
    appEl.classList.toggle("ui-locked", disabled);
  }
}

function lockInputs(reason) {
  if (!reason) return;
  inputLockReasons.add(reason);
  applyInputLockState();
}

function unlockInputs(reason) {
  if (!reason) return;
  inputLockReasons.delete(reason);
  applyInputLockState();
}

function activatePopupTab(tabButton) {
  const panelId = tabButton?.getAttribute("aria-controls");
  if (!panelId) return;

  popupTabButtons.forEach((button) => {
    const isActive = button === tabButton;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-selected", String(isActive));
  });

  popupTabPanels.forEach((panel) => {
    const isActive = panel.id === panelId;
    panel.classList.toggle("hidden", !isActive);
    panel.hidden = !isActive;
  });
  feedbackPanelEl?.classList.remove("hidden");
}

function normalizeUiError(error) {
  const message = (error && error.message ? error.message : String(error || "")).trim();

  if (/Could not establish connection/i.test(message)) {
    return "오류 코드: 5 - 페이지와 연결하지 못했습니다. Roll20 게임 탭에서 다시 시도해주세요.";
  }
  if (/Receiving end does not exist/i.test(message)) {
    return "오류 코드: 5 - 컨텐츠 스크립트가 아직 준비되지 않았습니다. 페이지를 새로고침 후 다시 시도해주세요.";
  }
  if (/cannot access contents of url/i.test(message)) {
    return "현재 탭에서는 동작할 수 없습니다. Roll20 웹페이지 탭에서 실행해주세요.";
  }
  if (/응답 시간이 초과/i.test(message)) {
    return "요청 시간이 초과되었습니다. 페이지가 완전히 로드된 뒤 다시 시도해주세요.";
  }

  return message || "알 수 없는 오류가 발생했습니다.";
}

// ===== Chrome tab communication =====
function randomRequestId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function isSupportedTabUrl(url) {
  if (!url) return false;
  return /^https?:\/\//i.test(url);
}

function requestToTab(tabId, messageType, extra = {}, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => reject(new Error("응답 시간이 초과되었습니다.")), timeoutMs);
    chrome.tabs.sendMessage(tabId, { type: messageType, ...extra }, (response) => {
      clearTimeout(timeoutId);
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response || {});
    });
  });
}

function injectContentScript(tabId) {
  return new Promise((resolve, reject) => {
    chrome.scripting.executeScript(
      {
        target: { tabId },
        files: [
          "js/shared/utils.js",
          "js/shared/performance_utils.js",
          "js/content/avatar/avatar_rules.js",
          "js/content/export/html_chunk_serializer.js",
          "js/content/export/archive_html_sanitizer.js",
          "js/content/export/avatar_export_resolution.js",
          "js/content/export/avatar_link_meta.js",
          "js/content/export/message_context_parser.js",
          "js/content/avatar/avatar_processor.js",
          "js/content/export/parsers/parser_utils.js",
          "js/content/export/parsers/coc/coc_rule_parser.js",
          "js/content/export/parsers/insane/insane_rule_parser.js",
          "js/content/import/coc7_import.js",
          "js/content/import/macro_import.js",
          "js/content/export/chat_json_export.js",
          "js/content/export/chat_role_parser.js",
          "js/content/dom/style_processor.js",
          "js/content/dom/dom_processor.js",
          "js/content/dom/root_state.js",
          "js/content/core/content.js",
        ],
      },
      () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve();
      }
    );
  });
}

async function ensureContentScriptLoaded(tabId) {
  try {
    const response = await requestToTab(tabId, "ROLL20_CLEANER_PING", {}, 2000);
    if (response && response.ok) {
      console.log("[Roll20Cleaner] Content script already loaded.");
      return true;
    }
  } catch (e) {
    console.log("[Roll20Cleaner] Content script not responding, injecting...");
  }

  await injectContentScript(tabId);
  await new Promise((r) => setTimeout(r, 500));

  try {
    const response = await requestToTab(tabId, "ROLL20_CLEANER_PING", {}, 2000);
    return response && response.ok;
  } catch (e) {
    console.error("[Roll20Cleaner] Script injection failed or script crashed:", e);
    return false;
  }
}

async function requestWithRecovery(tabId, messageType, extra = {}) {
  const ready = await ensureContentScriptLoaded(tabId);
  if (!ready) {
    throw new Error("컨텐츠 스크립트 연결에 실패했습니다. 페이지를 새로고침 해주세요.");
  }
  return await requestToTab(tabId, messageType, extra);
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}

async function getValidatedActiveTabId() {
  const tab = await getActiveTab();
  if (!tab?.id) {
    throw new Error("현재 활성 탭을 찾을 수 없습니다.");
  }
  if (!isSupportedTabUrl(tab.url || "")) {
    throw new Error("현재 탭에서는 동작할 수 없습니다. Roll20 웹페이지 탭에서 실행해주세요.");
  }
  return tab.id;
}

// ===== Ready status probe =====
function stopReadyStatusProbe() {
  if (!readyStatusProbeTimerId) return;
  clearTimeout(readyStatusProbeTimerId);
  readyStatusProbeTimerId = null;
  unlockInputs("ready-status-probe");
}

function scheduleReadyStatusProbe() {
  stopReadyStatusProbe();
  lockInputs("ready-status-probe");
  readyStatusProbeTimerId = setTimeout(async () => {
    if (statusEl.textContent !== READY_STATUS_LOADING_TEXT) {
      stopReadyStatusProbe();
      return;
    }

    try {
      const tab = await getActiveTab();
      if (!tab?.id || !isSupportedTabUrl(tab.url || "")) {
        stopReadyStatusProbe();
        return;
      }

      const response = await requestToTab(tab.id, "ROLL20_CLEANER_PING", {}, 1500).catch(() => null);
      if (response?.ok) {
        setStatus(READY_STATUS_READY_TEXT);
        stopReadyStatusProbe();
        return;
      }
    } catch (error) {
      // Keep probing while popup stays in "loading" state.
    }

    if (statusEl.textContent === READY_STATUS_LOADING_TEXT) {
      scheduleReadyStatusProbe();
    }
  }, READY_STATUS_PROBE_INTERVAL_MS);
}

async function updateInitialReadyStatus() {
  try {
    const tab = await getActiveTab();
    if (!tab?.id || !isSupportedTabUrl(tab.url || "")) {
      setStatus("Roll20 탭에서 확장 프로그램을 실행하세요.");
      return;
    }

    const response = await requestToTab(tab.id, "ROLL20_CLEANER_PING", {}, 1500).catch(() => null);
    if (response?.ok) {
      setStatus(READY_STATUS_READY_TEXT);
      stopReadyStatusProbe();
      return;
    }

    setStatus(READY_STATUS_LOADING_TEXT);
    scheduleReadyStatusProbe();
  } catch (error) {
    stopReadyStatusProbe();
    setStatus("상태 확인에 실패했습니다. 다시 시도해주세요.");
  }
}

// ===== Storage and filter apply flow =====
function setSyncStorage(values) {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.set(values, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve();
    });
  });
}

function getSavedStatusMessage() {
  if (applyFeedback.getSavedStatusMessage) {
    return applyFeedback.getSavedStatusMessage();
  }
  return "설정은 저장되었습니다. 반영되었으니 화면을 확인해주세요.";
}

function isNonFatalApplyDispatchError(error) {
  const message = String(error?.message || error || "");
  if (applyFeedback.isNonFatalApplyDispatchError) {
    return applyFeedback.isNonFatalApplyDispatchError(message);
  }
  return /message port closed before a response was received|receiving end does not exist|cannot access contents of url|no tab with id|tab was closed/i.test(
    message
  );
}

function toSettingApplyProgressPercent(processed, total) {
  if (applyFeedback.toApplyProgressPercent) {
    return applyFeedback.toApplyProgressPercent(processed, total);
  }
  const ratio = Math.min(1, (Number(processed) || 0) / Math.max(1, Number(total) || 1));
  return 15 + Math.floor(ratio * 80);
}

function clearPendingSettingApply(reason = "취소되었습니다.") {
  if (!activeSettingApplyRequestId) return;
  const pending = pendingSettingApplyRequests.get(activeSettingApplyRequestId);
  if (pending) {
    pending.reject(new Error(reason));
    pendingSettingApplyRequests.delete(activeSettingApplyRequestId);
  }
  activeSettingApplyRequestId = "";
}

function waitForSettingApplyDone(requestId, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      pendingSettingApplyRequests.delete(requestId);
      reject(new Error("설정 반영 확인 시간이 초과되었습니다."));
    }, timeoutMs);

    pendingSettingApplyRequests.set(requestId, {
      resolve: () => {
        clearTimeout(timeoutId);
        pendingSettingApplyRequests.delete(requestId);
        resolve();
      },
      reject: (error) => {
        clearTimeout(timeoutId);
        pendingSettingApplyRequests.delete(requestId);
        reject(error);
      },
    });
  });
}

function collectSettingValues() {
  return {
    colorFilterEnabled: colorFilterEnabledEl.checked,
    hiddenTextEnabled: hiddenTextEnabledEl.checked,
    targetColor: targetColorEl.value.trim(),
  };
}

async function persistTextSetting() {
  try {
    await setSyncStorage(collectSettingValues());
    setStatus(getSavedStatusMessage());
  } catch (error) {
    setStatus(`설정 저장에 실패했습니다: ${normalizeUiError(error)}`);
  }
}

async function persistFilterSettingWithApplyState() {
  lockInputs("filter-apply");
  clearPendingSettingApply();
  let saved = false;
  try {
    setStatus("적용중입니다...");
    setProgress(20, "설정을 저장 중입니다...");
    await setSyncStorage(collectSettingValues());
    saved = true;

    setStatus("설정은 저장되었습니다. 화면에 반영 중입니다...");
    setProgress(35, "현재 탭 반영을 시작합니다...");

    const tabId = await getValidatedActiveTabId();
    const requestId = randomRequestId();
    activeSettingApplyRequestId = requestId;

    const applyResponse = await requestWithRecovery(tabId, "ROLL20_CLEANER_APPLY_FILTERS", {
      requestId,
    });

    if (!applyResponse?.ok) {
      throw new Error(applyResponse?.errorMessage || "탭 반영 요청에 실패했습니다.");
    }

    if (!applyResponse?.accepted) {
      setStatus(getSavedStatusMessage());
      hideProgress();
      activeSettingApplyRequestId = "";
      unlockInputs("filter-apply");
      return;
    }

    await waitForSettingApplyDone(requestId);

    setProgress(100, "설정 적용이 완료되었습니다.");
    setStatus(getSavedStatusMessage());
    setTimeout(() => hideProgress(), 800);
    activeSettingApplyRequestId = "";
    unlockInputs("filter-apply");
  } catch (error) {
    hideProgress();
    if (saved) {
      setStatus(getSavedStatusMessage());
      activeSettingApplyRequestId = "";
      unlockInputs("filter-apply");
      return;
    }
    if (isNonFatalApplyDispatchError(error)) {
      setStatus(getSavedStatusMessage());
      activeSettingApplyRequestId = "";
      unlockInputs("filter-apply");
      return;
    }
    if (/취소되었습니다/.test(String(error?.message || ""))) {
      unlockInputs("filter-apply");
      return;
    }
    setStatus(`설정 저장에 실패했습니다: ${normalizeUiError(error)}`);
    activeSettingApplyRequestId = "";
    unlockInputs("filter-apply");
  }
}

// ===== Avatar mapping and downloads =====
function renderAvatarMappings(mappings) {
  avatarListEl.innerHTML = "";
  mappings.forEach((item) => {
    const row = document.createElement("div");
    row.className = "avatar-row";

    const preview = document.createElement("img");
    preview.className = "avatar-preview";
    preview.src = item.avatarUrl;
    preview.alt = item.name;

    const right = document.createElement("div");
    const name = document.createElement("div");
    name.className = "avatar-name";
    name.textContent = item.name;

    const input = document.createElement("input");
    input.className = "avatar-input";
    input.type = "text";
    input.placeholder = "새 이미지 링크를 입력하세요";
    input.value = item.avatarUrl;
    input.dataset.id = item.id;
    input.dataset.name = item.name;
    input.dataset.originalUrl = item.originalUrl;
    input.dataset.avatarUrl = item.avatarUrl;
    input.dataset.initialUrl = item.avatarUrl;
    const bindPreview =
      typeof avatarPreview.bindAvatarPreviewInput === "function"
        ? avatarPreview.bindAvatarPreviewInput
        : null;
    if (bindPreview) {
      bindPreview(input, preview, { fallbackUrl: item.avatarUrl });
    }

    right.appendChild(name);
    right.appendChild(input);
    row.appendChild(preview);
    row.appendChild(right);
    avatarListEl.appendChild(row);
  });
}

function collectAvatarReplacements() {
  const inputs = avatarListEl.querySelectorAll("input.avatar-input");
  const collector =
    typeof avatarDownloadPlan.collectAvatarReplacementsFromInputs === "function"
      ? avatarDownloadPlan.collectAvatarReplacementsFromInputs
      : (rows) =>
          Array.from(rows || []).map((input) => ({
            id: input.dataset.id,
            name: input.dataset.name,
            originalUrl: input.dataset.originalUrl,
            newUrl: input.value.trim(),
          }));
  return collector(inputs);
}

function collectChangedAvatarReplacements() {
  const inputs = avatarListEl.querySelectorAll("input.avatar-input");
  const collector =
    typeof avatarDownloadPlan.collectAvatarReplacementsFromInputs === "function"
      ? avatarDownloadPlan.collectAvatarReplacementsFromInputs
      : () => [];
  return collector(inputs, { onlyChanged: true });
}

async function runAvatarReplacementStream(tabId, replacements) {
  return new Promise((resolve, reject) => {
    const requestId = randomRequestId();
    let settled = false;
    const port = chrome.tabs.connect(tabId, { name: "ROLL20_CLEANER_STREAM" });

    const finish = (error) => {
      if (settled) return;
      settled = true;
      try {
        port.disconnect();
      } catch (e) {
        // noop
      }
      if (error) {
        reject(error);
        return;
      }
      resolve();
    };

    const timeoutId = setTimeout(() => {
      finish(new Error("응답 시간이 초과되었습니다."));
    }, 180000);

    port.onMessage.addListener((message) => {
      if (!message?.requestId || message.requestId !== requestId) return;
      if (message.type === "STREAM_PROGRESS") {
        setProgress(message.percent ?? 0, message.label || "처리 중...");
        return;
      }
      if (message.type === "STREAM_DONE") {
        clearTimeout(timeoutId);
        if (message.ok) {
          finish();
          return;
        }
        finish(new Error(message.errorMessage || "다운로드 생성 중 오류가 발생했습니다."));
      }
    });

    port.onDisconnect.addListener(() => {
      if (settled) return;
      clearTimeout(timeoutId);
      const raw = chrome.runtime.lastError?.message || "연결이 종료되었습니다.";
      finish(new Error(raw));
    });

    setProgress(5, "치환 요청 준비 중...");
    port.postMessage({
      type: "START_PROFILE_IMAGE_REPLACEMENT_DOWNLOAD",
      requestId,
      replacements,
    });
  });
}

async function supportsAvatarReplacementStream(tabId) {
  try {
    const response = await requestWithRecovery(tabId, "ROLL20_CLEANER_STREAM_READY", {});
    return !!response?.ok;
  } catch (e) {
    return false;
  }
}

async function runAvatarReplacementFallback(tabId, replacements) {
  const response = await requestWithRecovery(tabId, "DOWNLOAD_WITH_AVATAR_REPLACEMENTS_HTML", {
    replacements,
  });
  if (!response?.ok) {
    throw new Error("아바타 치환 다운로드에 실패했습니다.");
  }
}

async function runAvatarReplacementJsonDownload(tabId, replacements) {
  const response = await requestWithRecovery(tabId, "DOWNLOAD_WITH_AVATAR_REPLACEMENTS_JSON", {
    replacements,
  });
  if (!response?.ok) {
    throw new Error(response?.errorMessage || "JSON 다운로드에 실패했습니다.");
  }
}

async function runDirectReadingLogJsonDownload(tabId) {
  const response = await requestWithRecovery(tabId, "DOWNLOAD_READINGLOG_JSON_DIRECT");
  if (!response?.ok) {
    throw new Error(response?.errorMessage || "ReadingLog 파일 다운로드에 실패했습니다.");
  }
}

async function loadAvatarMappingsForEditor() {
  try {
    const tabId = await getValidatedActiveTabId();

    setStatus("이미지 링크 목록을 불러오는 중입니다...");
    const response = await requestWithRecovery(tabId, "GET_AVATAR_MAPPINGS");
    const mappings = Array.isArray(response?.mappings) ? response.mappings : [];

    if (!mappings.length) {
      setStatus("아바타 매핑을 찾지 못했습니다.");
      return;
    }

    currentAvatarMappings = mappings;
    renderAvatarMappings(mappings);
    avatarEditorEl.classList.remove("hidden");
    setStatus(`총 ${mappings.length}개의 이미지 링크를 불러왔습니다.`);
  } catch (error) {
    setStatus(`아바타 목록을 불러오지 못했습니다: ${normalizeUiError(error)}`);
  }
}

async function runAvatarMappedHtmlDownload() {
  try {
    const tabId = await getValidatedActiveTabId();

    if (!currentAvatarMappings.length) {
      setStatus("먼저 다운로드전 이미지 링크 확인 버튼으로 목록을 불러오세요.");
      return;
    }

    const replacements = collectAvatarReplacements();
    if (!replacements.length) {
      setStatus("적용할 이미지 링크가 없습니다.");
      return;
    }

    const ready = await ensureContentScriptLoaded(tabId);
    if (!ready) {
      setStatus("컨텐츠 스크립트 연결에 실패했습니다. 페이지를 새로고침 해주세요.");
      return;
    }

    setStatus("교체한 이미지 링크 HTML을 만드는 중입니다...");
    const streamSupported = await supportsAvatarReplacementStream(tabId);
    if (streamSupported) {
      await runAvatarReplacementStream(tabId, replacements);
      setProgress(100, "완료되었습니다.");
      setStatus("교체한 이미지 링크 HTML 다운로드가 시작되었습니다.");
      setTimeout(() => hideProgress(), 900);
      return;
    }

    await runAvatarReplacementFallback(tabId, replacements);
    hideProgress();
    setStatus("교체한 이미지 링크 HTML 다운로드가 시작되었습니다.");
  } catch (error) {
    hideProgress();
    setStatus(`아바타 치환 다운로드에 실패했습니다: ${normalizeUiError(error)}`);
  }
}

async function runReadingLogJsonDownload() {
  try {
    const tabId = await getValidatedActiveTabId();
    const ready = await ensureContentScriptLoaded(tabId);
    if (!ready) {
      setStatus("컨텐츠 스크립트 연결에 실패했습니다. 페이지를 새로고침 해주세요.");
      return;
    }

    const replacements = collectChangedAvatarReplacements();
    const resolveMode =
      typeof avatarDownloadPlan.resolveReadingLogDownloadMode === "function"
        ? avatarDownloadPlan.resolveReadingLogDownloadMode
        : (items) => (Array.isArray(items) && items.length > 0 ? "mapped" : "direct");
    const mode = resolveMode(replacements);

    setStatus("ReadingLog 파일을 만드는 중입니다...");
    setProgress(20, "JSON 데이터를 정리 중입니다...");
    if (mode === "mapped") {
      await runAvatarReplacementJsonDownload(tabId, replacements);
    } else {
      await runDirectReadingLogJsonDownload(tabId);
    }
    setProgress(100, "완료되었습니다.");
    setStatus("ReadingLog 파일 다운로드가 시작되었습니다.");
    setTimeout(() => hideProgress(), 900);
  } catch (error) {
    hideProgress();
    setStatus(`ReadingLog 파일 다운로드에 실패했습니다: ${normalizeUiError(error)}`);
  }
}

function formatCocImportResult(response) {
  if (!response?.ok) {
    const pageMessage = response?.pageResult?.message || "";
    const domMessage = response?.domResult?.message || "";
    const message = pageMessage || domMessage || response?.errorMessage || "적용하지 못했습니다.";
    return `CoC 적용 실패: ${message}`;
  }

  const requestedAttributes = Number(response?.requested?.attributes) || 0;
  const requestedAbilities = Number(response?.requested?.abilities) || 0;
  const requestedAvatar = Number(response?.requested?.avatar) || 0;
  const pageAttributes = Number(response?.applied?.pageAttributes) || 0;
  const domAttributes = Number(response?.applied?.domAttributes) || 0;
  const pageAbilities = Number(response?.applied?.pageAbilities) || 0;
  const pageAvatar = Number(response?.applied?.pageAvatar) || 0;
  const appliedAttributes = Math.max(pageAttributes, domAttributes);
  const appliedCounts = [
    `Attributes ${appliedAttributes}/${requestedAttributes}`,
    `Abilities ${pageAbilities}/${requestedAbilities}`,
  ];
  if (requestedAvatar > 0) {
    appliedCounts.push(`Avatar ${pageAvatar}/${requestedAvatar}`);
  }
  const reopenHint = response?.sheetUi?.reopened
    ? " 열린 시트를 자동으로 다시 열었습니다."
    : response?.sheetUi?.needsReopen
    ? " 열린 시트를 닫았다 다시 열면 변경사항이 보입니다."
    : "";
  return `${response.characterName || COC_IMPORT_FALLBACK_TARGET_LABEL} 적용 완료: ${appliedCounts.join(", ")}.${reopenHint}`;
}

async function runCocImportApply() {
  try {
    const text = String(cocImportPayloadEl?.value || "").trim();
    if (!text) {
      setStatus("붙여넣기 입력창에 CoC import JSON을 넣어주세요.");
      return;
    }

    const tabId = await getValidatedActiveTabId();
    const ready = await ensureContentScriptLoaded(tabId);
    if (!ready) {
      setStatus("컨텐츠 스크립트 연결에 실패했습니다. 페이지를 새로고침 해주세요.");
      return;
    }

    lockInputs("coc-import-apply");
    setProgress(20, "CoC import 적용 중입니다...");
    const response = await requestWithRecovery(tabId, "APPLY_COC7_IMPORT", {
      text,
    });
    setProgress(100, response?.ok ? "적용 완료" : "적용 실패");
    setStatus(formatCocImportResult(response));
    setTimeout(() => hideProgress(), 900);
  } catch (error) {
    hideProgress();
    setStatus(`CoC import 적용 실패: ${normalizeUiError(error)}`);
  } finally {
    unlockInputs("coc-import-apply");
  }
}

function formatMacroImportResult(response) {
  if (!response?.ok) {
    const pageMessage = response?.pageResult?.message || "";
    const message = pageMessage || response?.errorMessage || "적용하지 못했습니다.";
    return `매크로 등록 실패: ${message}`;
  }

  const requestedMacros = Number(response?.requested?.macros) || 0;
  const appliedMacros = Number(response?.applied?.macros) || 0;
  const createdMacros = Number(response?.pageResult?.macros?.created?.length) || 0;
  const updatedMacros = Number(response?.pageResult?.macros?.updated?.length) || 0;
  return `매크로 등록 완료: ${appliedMacros}/${requestedMacros} (생성 ${createdMacros}, 수정 ${updatedMacros}).`;
}

async function runMacroImportApply() {
  try {
    const text = String(macroImportPayloadEl?.value || "").trim();
    if (!text) {
      setStatus("붙여넣기 입력창에 Macro import JSON을 넣어주세요.");
      return;
    }

    const tabId = await getValidatedActiveTabId();
    const ready = await ensureContentScriptLoaded(tabId);
    if (!ready) {
      setStatus("컨텐츠 스크립트 연결에 실패했습니다. 페이지를 새로고침 해주세요.");
      return;
    }

    lockInputs("macro-import-apply");
    setProgress(20, "매크로를 등록 중입니다...");
    const response = await requestWithRecovery(tabId, "APPLY_MACRO_IMPORT", {
      text,
    });
    setProgress(100, response?.ok ? "등록 완료" : "등록 실패");
    setStatus(formatMacroImportResult(response));
    setTimeout(() => hideProgress(), 900);
  } catch (error) {
    hideProgress();
    setStatus(`매크로 등록 실패: ${normalizeUiError(error)}`);
  } finally {
    unlockInputs("macro-import-apply");
  }
}

// ===== Event wiring =====
function bindUiEvents() {
  popupTabButtons.forEach((button) => {
    button.addEventListener("click", () => activatePopupTab(button));
  });

  colorFilterEnabledEl.addEventListener("change", persistFilterSettingWithApplyState);
  hiddenTextEnabledEl.addEventListener("change", persistFilterSettingWithApplyState);
  targetColorEl.addEventListener("change", persistTextSetting);
  targetColorEl.addEventListener("keyup", (event) => {
    if (event.key === "Enter") persistTextSetting();
  });

  downloadTest2El.addEventListener("click", loadAvatarMappingsForEditor);
  if (downloadAvatarMappedHtmlEl) {
    downloadAvatarMappedHtmlEl.addEventListener("click", runAvatarMappedHtmlDownload);
  }
  downloadAvatarMappedJsonEl.addEventListener("click", runReadingLogJsonDownload);
  if (applyCocImportEl) {
    applyCocImportEl.addEventListener("click", runCocImportApply);
  }
  if (applyMacroImportEl) {
    applyMacroImportEl.addEventListener("click", runMacroImportApply);
  }

  window.addEventListener("unload", () => {
    stopReadyStatusProbe();
  });
}

function bindRuntimeEvents() {
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "FILTER_APPLY_PROGRESS") {
      if (!message.requestId || message.requestId !== activeSettingApplyRequestId) return;
      const percent = toSettingApplyProgressPercent(message.processed, message.total);
      setProgress(percent, message.label || "화면 반영 중입니다...");
      return;
    }

    if (message?.type === "FILTER_APPLY_DONE") {
      if (!message.requestId || message.requestId !== activeSettingApplyRequestId) return;
      const pending = pendingSettingApplyRequests.get(message.requestId);
      if (!pending) return;
      if (message.ok) {
        pending.resolve();
        return;
      }
      pending.reject(new Error(message.errorMessage || "설정 반영 중 오류가 발생했습니다."));
      return;
    }
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "sync") return;
    if (changes.colorFilterEnabled) {
      colorFilterEnabledEl.checked = !!changes.colorFilterEnabled.newValue;
    }
    if (changes.hiddenTextEnabled) {
      hiddenTextEnabledEl.checked = !!changes.hiddenTextEnabled.newValue;
    }
    if (changes.targetColor) {
      targetColorEl.value = String(changes.targetColor.newValue || "");
    }
  });
}

function hydrateInitialState() {
  chrome.storage.sync.get(
    { colorFilterEnabled: false, hiddenTextEnabled: false, targetColor: "color: #aaaaaa" },
    ({ colorFilterEnabled, hiddenTextEnabled, targetColor }) => {
      colorFilterEnabledEl.checked = colorFilterEnabled;
      hiddenTextEnabledEl.checked = hiddenTextEnabled;
      targetColorEl.value = targetColor;
      updateInitialReadyStatus();
    }
  );
}

function initPopup() {
  bindUiEvents();
  bindRuntimeEvents();
  hydrateInitialState();
}

initPopup();
