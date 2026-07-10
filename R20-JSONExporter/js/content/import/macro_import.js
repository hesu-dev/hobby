(function () {
  const BLOCK_START_RE = /\[R20JE:MACRO_IMPORT(?::\d+)?\]/i;
  const BLOCK_END_RE = /\[\/R20JE\]/i;
  const PAGE_IMPORT_SCRIPT_PATH = "js/content/import/macro_page_import.js";
  const PAGE_IMPORT_READY_EVENT = "R20JE_MACRO_IMPORT_READY";
  const PAGE_IMPORT_REQUEST_EVENT = "R20JE_MACRO_IMPORT_REQUEST";
  const PAGE_IMPORT_RESPONSE_EVENT = "R20JE_MACRO_IMPORT_RESPONSE";

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

  function normalizeBoolean(value) {
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value !== 0;
    const text = stringifyValue(value).trim().toLowerCase();
    return text === "true" || text === "1" || text === "yes" || text === "on";
  }

  function normalizeMacroEntry(entryName, entryValue) {
    const valueObject = isPlainObject(entryValue) ? entryValue : {};
    const name = stringifyValue(entryName || valueObject.name || valueObject.title).trim();
    const action = stringifyValue(
      valueObject.action ??
        valueObject.command ??
        valueObject.macro ??
        valueObject.value ??
        (!isPlainObject(entryValue) ? entryValue : "")
    ).trim();
    if (!name || !action) return null;

    return {
      name,
      action,
      visibleto: stringifyValue(
        valueObject.visibleto ?? valueObject.visibleTo ?? valueObject.visible_to ?? ""
      ).trim(),
      istokenaction: normalizeBoolean(
        valueObject.istokenaction ?? valueObject.tokenAction ?? valueObject.token_action ?? false
      ),
    };
  }

  function collectMacroEntries(payload) {
    const entries = [];
    const rawMacros = Array.isArray(payload) ? payload : payload.macros || payload.macro || [];

    if (Array.isArray(rawMacros)) {
      rawMacros.forEach((item) => {
        const normalized = normalizeMacroEntry("", item);
        if (normalized) entries.push(normalized);
      });
    } else if (isPlainObject(rawMacros)) {
      Object.entries(rawMacros).forEach(([name, value]) => {
        const normalized = normalizeMacroEntry(name, value);
        if (normalized) entries.push(normalized);
      });
    }

    const byName = new Map();
    entries.forEach((entry) => {
      byName.set(entry.name, entry);
    });
    return [...byName.values()];
  }

  function normalizeMacroImportPayload(payload) {
    if (!isPlainObject(payload) && !Array.isArray(payload)) {
      throw new Error("Macro import payload must be a JSON object or array.");
    }

    const macros = collectMacroEntries(payload);
    if (!macros.length) {
      throw new Error("적용할 macros가 없습니다.");
    }

    return {
      schema: "R20JE_MACRO_IMPORT",
      version: 1,
      macros,
    };
  }

  function parseMacroImportText(text) {
    const jsonText = extractImportJsonText(text);
    let parsed;
    try {
      parsed = JSON.parse(jsonText);
    } catch (error) {
      throw new Error("Macro import JSON을 읽지 못했습니다. JSON 형식을 확인해주세요.");
    }
    return normalizeMacroImportPayload(parsed);
  }

  function createRequestId() {
    return `r20je-macro-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function ensurePageImporterInjected(timeoutMs = 3000) {
    if (typeof chrome === "undefined" || !chrome.runtime?.getURL) {
      return Promise.resolve(false);
    }
    if (window.__r20jeMacroPageImporterReady) {
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
        window.__r20jeMacroPageImporterReady = true;
        finish(true);
      };
      const timeoutId = setTimeout(() => finish(!!window.__r20jeMacroPageImporterReady), timeoutMs);
      window.addEventListener(PAGE_IMPORT_READY_EVENT, onReady);

      const script = document.createElement("script");
      script.src = chrome.runtime.getURL(PAGE_IMPORT_SCRIPT_PATH);
      script.async = false;
      script.addEventListener("load", () => {
        setTimeout(() => finish(!!window.__r20jeMacroPageImporterReady), 0);
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
        message: "Roll20 macro page importer를 주입하지 못했습니다.",
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
            message: "Roll20 macro page importer 응답 시간이 초과되었습니다.",
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

  function summarizeApplyResult(payload, pageResult) {
    const applied = pageResult?.macros?.applied || [];
    return {
      ok: !!pageResult?.ok,
      requested: {
        macros: payload.macros.length,
      },
      applied: {
        macros: applied.length,
      },
      pageResult,
    };
  }

  async function applyMacroImportText(text) {
    const payload = parseMacroImportText(text);
    const pageResult = await applyViaRoll20PageModel(payload);
    return summarizeApplyResult(payload, pageResult);
  }

  const api = {
    parseMacroImportText,
    normalizeMacroImportPayload,
    applyMacroImportText,
  };

  if (typeof window !== "undefined") {
    window.Roll20CleanerMacroImport = window.Roll20CleanerMacroImport || {};
    Object.assign(window.Roll20CleanerMacroImport, api);
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})();
