(function () {
  const BLOCK_START_RE = /\[R20JE:COC7_IMPORT(?::\d+)?\]/i;
  const BLOCK_END_RE = /\[\/R20JE\]/i;
  const PAGE_IMPORT_SCRIPT_PATH = "js/content/import/coc7_page_import.js";
  const PAGE_IMPORT_READY_EVENT = "R20JE_COC7_IMPORT_READY";
  const PAGE_IMPORT_REQUEST_EVENT = "R20JE_COC7_IMPORT_REQUEST";
  const PAGE_IMPORT_RESPONSE_EVENT = "R20JE_COC7_IMPORT_RESPONSE";

  let pageImporterInjectionPromise = null;

  function stringifyValue(value) {
    if (value === null || value === undefined) return "";
    return String(value);
  }

  function isPlainObject(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
  }

  function stripCodeFence(text) {
    const raw = String(text || "").trim();
    const match = raw.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    return match ? match[1].trim() : raw;
  }

  function extractImportJsonText(text) {
    const raw = stripCodeFence(text);
    const startMatch = raw.match(BLOCK_START_RE);
    if (!startMatch) return raw;

    const afterStart = raw.slice(startMatch.index + startMatch[0].length);
    const endMatch = afterStart.match(BLOCK_END_RE);
    if (!endMatch) return afterStart.trim();
    return afterStart.slice(0, endMatch.index).trim();
  }

  function normalizeAttributeName(name) {
    const raw = stringifyValue(name).trim();
    if (!raw) return null;
    const withoutAttrPrefix = raw.replace(/^attr_/i, "");
    return {
      inputName: raw.startsWith("attr_") ? raw : `attr_${raw}`,
      roll20Name: withoutAttrPrefix,
    };
  }

  function normalizeAttributeEntry(entryName, entryValue) {
    const name = entryName || entryValue?.name || entryValue?.field || entryValue?.attr;
    const normalizedName = normalizeAttributeName(name);
    if (!normalizedName) return null;

    const valueObject = isPlainObject(entryValue) ? entryValue : {};
    const rawCurrent =
      valueObject.current ??
      valueObject.value ??
      valueObject.currentValue ??
      (!isPlainObject(entryValue) ? entryValue : "");
    const rawMax = valueObject.max ?? valueObject.maxValue ?? "";

    return {
      inputName: normalizedName.inputName,
      roll20Name: normalizedName.roll20Name,
      current: stringifyValue(rawCurrent),
      max: stringifyValue(rawMax),
    };
  }

  function collectAttributeEntries(payload) {
    const entries = [];

    const addFromArray = (items) => {
      if (!Array.isArray(items)) return;
      items.forEach((item) => {
        const normalized = normalizeAttributeEntry("", item);
        if (normalized) entries.push(normalized);
      });
    };

    const addFromObject = (items) => {
      if (!isPlainObject(items)) return;
      Object.entries(items).forEach(([name, value]) => {
        const normalized = normalizeAttributeEntry(name, value);
        if (normalized) entries.push(normalized);
      });
    };

    addFromArray(payload.fields);
    addFromArray(payload.attributes);
    addFromArray(payload.attrs);
    addFromObject(payload.attributes);
    addFromObject(payload.attrs);

    const byName = new Map();
    entries.forEach((entry) => {
      byName.set(entry.roll20Name, entry);
    });
    return [...byName.values()];
  }

  function normalizeAbilityEntry(entryName, entryValue) {
    const valueObject = isPlainObject(entryValue) ? entryValue : {};
    const name = stringifyValue(entryName || valueObject.name).trim();
    const action = stringifyValue(
      valueObject.action ?? valueObject.command ?? valueObject.macro ?? (!isPlainObject(entryValue) ? entryValue : "")
    );
    if (!name || !action) return null;
    return {
      name,
      action,
      istokenaction: !!(valueObject.istokenaction || valueObject.tokenAction),
    };
  }

  function collectAbilityEntries(payload) {
    const entries = [];
    const rawAbilities = payload.abilities || payload.ability || [];

    if (Array.isArray(rawAbilities)) {
      rawAbilities.forEach((item) => {
        const normalized = normalizeAbilityEntry("", item);
        if (normalized) entries.push(normalized);
      });
    } else if (isPlainObject(rawAbilities)) {
      Object.entries(rawAbilities).forEach(([name, value]) => {
        const normalized = normalizeAbilityEntry(name, value);
        if (normalized) entries.push(normalized);
      });
    }

    const byName = new Map();
    entries.forEach((entry) => {
      byName.set(entry.name, entry);
    });
    return [...byName.values()];
  }

  function normalizeCoc7ImportPayload(payload, options = {}) {
    if (!isPlainObject(payload)) {
      throw new Error("CoC import payload must be a JSON object.");
    }

    const characterName = stringifyValue(
      payload.characterName || payload.character || payload.name || options.defaultCharacterName || ""
    ).trim();

    const attributes = collectAttributeEntries(payload);
    const abilities = collectAbilityEntries(payload);
    if (!attributes.length && !abilities.length) {
      throw new Error("적용할 attributes 또는 abilities가 없습니다.");
    }

    return {
      schema: "R20JE_COC7_IMPORT",
      version: 1,
      characterName,
      attributes,
      abilities,
    };
  }

  function parseCoc7ImportText(text, options = {}) {
    const jsonText = extractImportJsonText(text);
    let parsed;
    try {
      parsed = JSON.parse(jsonText);
    } catch (error) {
      throw new Error("CoC import JSON을 읽지 못했습니다. JSON 형식을 확인해주세요.");
    }
    return normalizeCoc7ImportPayload(parsed, options);
  }

  function createRequestId() {
    return `r20je-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function getVisibleValue(el) {
    if (!el) return "";
    return stringifyValue("value" in el ? el.value : el.textContent).trim();
  }

  function queryElements(selector) {
    if (typeof document === "undefined" || typeof document.querySelectorAll !== "function") return [];
    try {
      return [...document.querySelectorAll(selector)];
    } catch (error) {
      return [];
    }
  }

  function nodeContains(root, node) {
    if (!root || !node) return false;
    if (root === node) return true;
    if (typeof root.contains === "function") return root.contains(node);
    return false;
  }

  function getNumericZIndex(node) {
    const raw =
      node?.style?.zIndex ||
      (typeof window !== "undefined" && typeof window.getComputedStyle === "function"
        ? window.getComputedStyle(node)?.zIndex
        : "");
    const value = Number.parseInt(raw, 10);
    return Number.isFinite(value) ? value : 0;
  }

  function hasSheetInputs(root) {
    return !!root?.querySelector?.('[name^="attr_"]');
  }

  function uniqueElements(elements) {
    return [...new Set(elements.filter(Boolean))];
  }

  function findActiveOpenSheetRoot() {
    const selectors = [".ui-dialog", ".ui-dialog-content", ".characterdialog", ".charactersheet", ".charsheet"];
    const roots = uniqueElements(selectors.flatMap((selector) => queryElements(selector))).filter(hasSheetInputs);
    const activeElement =
      typeof document !== "undefined" && "activeElement" in document ? document.activeElement : null;

    const activeRoot = roots.find((root) => nodeContains(root, activeElement));
    if (activeRoot) return activeRoot;

    if (roots.length === 1) return roots[0];

    const sortedByStack = roots
      .map((root, index) => ({
        root,
        index,
        zIndex: getNumericZIndex(root),
      }))
      .filter((item) => item.zIndex > 0)
      .sort((a, b) => b.zIndex - a.zIndex || b.index - a.index);

    return sortedByStack[0]?.root || null;
  }

  function findLikelySheetRootFromNameInput(characterName) {
    const activeRoot = findActiveOpenSheetRoot();
    if (activeRoot) return activeRoot;

    const selectors = [
      '[name="attr_character_name"]',
      '[name="attr_name"]',
      '[name="attr_character"]',
    ];
    const nameInputs = [...document.querySelectorAll(selectors.join(","))];
    const normalizedTarget = stringifyValue(characterName).trim().toLowerCase();

    for (const input of nameInputs) {
      if (getVisibleValue(input).toLowerCase() !== normalizedTarget) continue;
      return (
        input.closest(".ui-dialog-content") ||
        input.closest(".ui-dialog") ||
        input.closest(".characterdialog") ||
        input.closest(".charsheet") ||
        input.closest("form") ||
        document
      );
    }

    const sheetRoots = [...document.querySelectorAll(".charsheet")].filter((root) =>
      root.querySelector('[name^="attr_"]')
    );
    if (sheetRoots.length === 1) return sheetRoots[0];
    return null;
  }

  function setNativeValue(el, value) {
    const proto =
      el instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : el instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (setter) {
      setter.call(el, stringifyValue(value));
    } else {
      el.value = stringifyValue(value);
    }
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new Event("blur", { bubbles: true }));
  }

  function findAttributeInput(root, attribute) {
    const candidates = [
      attribute.inputName,
      `attr_${attribute.roll20Name}`,
      attribute.roll20Name,
    ];
    for (const name of candidates) {
      const escaped = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(name) : name.replace(/"/g, '\\"');
      const el = root.querySelector(`[name="${escaped}"]`);
      if (el) return el;
    }
    return null;
  }

  function applyAttributesToOpenSheet(payload) {
    const root = findLikelySheetRootFromNameInput(payload.characterName);
    const result = {
      ok: false,
      strategy: "open-sheet-dom",
      sheetFound: !!root,
      applied: [],
      missing: [],
    };
    if (!root) {
      result.message = "열린 CoC 캐릭터 시트를 찾지 못했습니다.";
      return result;
    }

    payload.attributes.forEach((attribute) => {
      const input = findAttributeInput(root, attribute);
      if (!input) {
        result.missing.push(attribute.inputName);
        return;
      }
      setNativeValue(input, attribute.current);
      result.applied.push(attribute.inputName);
    });

    result.ok = result.applied.length > 0;
    return result;
  }

  function ensurePageImporterInjected(timeoutMs = 3000) {
    if (typeof chrome === "undefined" || !chrome.runtime?.getURL) {
      return Promise.resolve(false);
    }
    if (window.__r20jeCoc7PageImporterReady) {
      return Promise.resolve(true);
    }
    if (pageImporterInjectionPromise) return pageImporterInjectionPromise;

    pageImporterInjectionPromise = new Promise((resolve) => {
      let settled = false;
      const finish = (ready) => {
        if (settled) return;
        settled = true;
        window.removeEventListener(PAGE_IMPORT_READY_EVENT, onReady);
        clearTimeout(timeoutId);
        resolve(ready);
      };
      const onReady = () => {
        window.__r20jeCoc7PageImporterReady = true;
        finish(true);
      };
      const timeoutId = setTimeout(() => finish(!!window.__r20jeCoc7PageImporterReady), timeoutMs);
      window.addEventListener(PAGE_IMPORT_READY_EVENT, onReady);

      const script = document.createElement("script");
      script.src = chrome.runtime.getURL(PAGE_IMPORT_SCRIPT_PATH);
      script.async = false;
      script.addEventListener("load", () => {
        setTimeout(() => finish(!!window.__r20jeCoc7PageImporterReady), 0);
      });
      script.addEventListener("error", () => finish(false));
      (document.head || document.documentElement).appendChild(script);
    }).finally(() => {
      pageImporterInjectionPromise = null;
    });

    return pageImporterInjectionPromise;
  }

  async function applyViaRoll20PageModel(payload, timeoutMs = 5000) {
    const injected = await ensurePageImporterInjected();
    if (!injected) {
      return {
        ok: false,
        strategy: "roll20-page-model",
        message: "Roll20 page importer를 주입하지 못했습니다.",
      };
    }

    return new Promise((resolve) => {
      const requestId = createRequestId();
      let settled = false;
      const finish = (result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        window.removeEventListener(PAGE_IMPORT_RESPONSE_EVENT, onResponse);
        resolve(result);
      };
      const onResponse = (event) => {
        if (event?.detail?.requestId !== requestId) return;
        finish(event.detail.result || { ok: false, strategy: "roll20-page-model" });
      };
      const timeoutId = setTimeout(
        () =>
          finish({
            ok: false,
            strategy: "roll20-page-model",
            message: "Roll20 page importer 응답 시간이 초과되었습니다.",
          }),
        timeoutMs
      );

      window.addEventListener(PAGE_IMPORT_RESPONSE_EVENT, onResponse);
      window.dispatchEvent(
        new CustomEvent(PAGE_IMPORT_REQUEST_EVENT, {
          detail: {
            requestId,
            payload,
          },
        })
      );
    });
  }

  function summarizeApplyResult(payload, pageResult, domResult) {
    const pageAttributes = pageResult?.attributes?.applied || [];
    const pageAbilities = pageResult?.abilities?.applied || [];
    const domAttributes = domResult?.applied || [];
    const ok = !!(pageResult?.ok || domResult?.ok);
    return {
      ok,
      characterName: payload.characterName,
      requested: {
        attributes: payload.attributes.length,
        abilities: payload.abilities.length,
      },
      applied: {
        pageAttributes: pageAttributes.length,
        pageAbilities: pageAbilities.length,
        domAttributes: domAttributes.length,
      },
      sheetUi: pageResult?.sheetUi || {
        liveRefreshAttempted: false,
        needsReopen: false,
        message: "",
      },
      pageResult,
      domResult,
    };
  }

  async function applyCoc7ImportText(text, options = {}) {
    const payload = parseCoc7ImportText(text, options);
    const pageResult = await applyViaRoll20PageModel(payload);
    const domResult = applyAttributesToOpenSheet(payload);
    return summarizeApplyResult(payload, pageResult, domResult);
  }

  const api = {
    parseCoc7ImportText,
    normalizeCoc7ImportPayload,
    applyAttributesToOpenSheet,
    applyCoc7ImportText,
  };

  if (typeof window !== "undefined") {
    window.Roll20CleanerCoc7Import = window.Roll20CleanerCoc7Import || {};
    Object.assign(window.Roll20CleanerCoc7Import, api);
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})();
