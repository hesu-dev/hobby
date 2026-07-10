(function () {
  const READY_EVENT = "R20JE_MACRO_IMPORT_READY";
  const REQUEST_EVENT = "R20JE_MACRO_IMPORT_REQUEST";
  const RESPONSE_EVENT = "R20JE_MACRO_IMPORT_RESPONSE";

  if (window.__r20jeMacroPageImporterInstalled) {
    window.__r20jeMacroPageImporterReady = true;
    window.dispatchEvent(new CustomEvent(READY_EVENT));
    return;
  }
  window.__r20jeMacroPageImporterInstalled = true;
  window.__r20jeMacroPageImporterReady = true;

  function normalizeText(value) {
    return String(value || "").trim().toLowerCase();
  }

  function collectionToArray(collection) {
    if (!collection) return [];
    if (Array.isArray(collection)) return collection;
    if (Array.isArray(collection.models)) return collection.models;
    if (typeof collection.toArray === "function") return collection.toArray();
    if (typeof collection.each === "function") {
      const items = [];
      collection.each((item) => items.push(item));
      return items;
    }
    if (collection._byId && typeof collection._byId === "object") {
      return [...new Set(Object.values(collection._byId))];
    }
    return [];
  }

  function getModelValue(model, key) {
    if (!model || !key) return undefined;
    if (typeof model.get === "function") {
      const value = model.get(key);
      if (value !== undefined && value !== null) return value;
    }
    if (model.attributes && Object.prototype.hasOwnProperty.call(model.attributes, key)) {
      return model.attributes[key];
    }
    return model[key];
  }

  function getCampaignCandidates() {
    return [
      window.Campaign,
      window.d20?.Campaign,
      window.d20?.campaign,
      window.app?.campaign,
    ].filter(Boolean);
  }

  function getMacroCollection() {
    const collections = [];
    getCampaignCandidates().forEach((campaign) => {
      [
        campaign.macros,
        campaign.get?.("macros"),
        campaign.macrobar,
        campaign.get?.("macrobar"),
      ].forEach((collection) => {
        if (collection && !collections.includes(collection)) collections.push(collection);
      });
    });
    return collections[0] || null;
  }

  function findByName(collection, name) {
    const target = normalizeText(name);
    return collectionToArray(collection).find((model) => normalizeText(getModelValue(model, "name")) === target);
  }

  function saveModel(model, attrs) {
    if (!model) return false;
    try {
      if (typeof model.save === "function") {
        model.save(attrs);
        return true;
      }
      if (typeof model.set === "function") {
        model.set(attrs);
        return true;
      }
      model.attributes = model.attributes || {};
      Object.assign(model.attributes, attrs);
      Object.assign(model, attrs);
      return true;
    } catch (error) {
      if (typeof model.set === "function") {
        model.set(attrs);
        return true;
      }
      throw error;
    }
  }

  function createModel(collection, attrs) {
    if (!collection) return null;
    if (typeof collection.create === "function") {
      return collection.create(attrs);
    }
    if (typeof collection.add === "function") {
      return collection.add(attrs);
    }
    return null;
  }

  function applyMacros(collection, macros) {
    const result = {
      applied: [],
      created: [],
      updated: [],
      failed: [],
    };
    if (!collection) {
      macros.forEach((macro) => result.failed.push({
        name: macro.name,
        reason: "macro collection not found",
      }));
      return result;
    }

    macros.forEach((macro) => {
      try {
        const attrs = {
          name: macro.name,
          action: macro.action,
          visibleto: macro.visibleto || "",
          istokenaction: !!macro.istokenaction,
        };

        const existing = findByName(collection, macro.name);
        if (existing) {
          saveModel(existing, attrs);
          result.updated.push(macro.name);
          result.applied.push(macro.name);
          return;
        }

        const created = createModel(collection, attrs);
        if (!created) {
          result.failed.push({
            name: macro.name,
            reason: "macro create failed",
          });
          return;
        }
        result.created.push(macro.name);
        result.applied.push(macro.name);
      } catch (error) {
        result.failed.push({
          name: macro.name,
          reason: error?.message || String(error),
        });
      }
    });
    return result;
  }

  async function applyImport(payload) {
    const macroCollection = getMacroCollection();
    const macros = applyMacros(macroCollection, payload.macros || []);
    const ok = macros.applied.length > 0;

    return {
      ok,
      strategy: "roll20-page-model",
      macros,
      message: ok ? "Roll20 전역 매크로에 적용했습니다." : "적용할 수 있는 macro collection을 찾지 못했습니다.",
    };
  }

  window.addEventListener(REQUEST_EVENT, (event) => {
    const requestId = event?.detail?.requestId || "";
    const payload = event?.detail?.payload || {};
    Promise.resolve()
      .then(() => applyImport(payload))
      .catch((error) => ({
        ok: false,
        strategy: "roll20-page-model",
        message: error?.message || String(error),
      }))
      .then((result) => {
        window.dispatchEvent(
          new CustomEvent(RESPONSE_EVENT, {
            detail: {
              requestId,
              result,
            },
          })
        );
      });
  });

  window.dispatchEvent(new CustomEvent(READY_EVENT));
})();
