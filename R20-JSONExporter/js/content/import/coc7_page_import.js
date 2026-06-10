(function () {
  const READY_EVENT = "R20JE_COC7_IMPORT_READY";
  const REQUEST_EVENT = "R20JE_COC7_IMPORT_REQUEST";
  const RESPONSE_EVENT = "R20JE_COC7_IMPORT_RESPONSE";

  if (window.__r20jeCoc7PageImporterInstalled) {
    window.__r20jeCoc7PageImporterReady = true;
    window.dispatchEvent(new CustomEvent(READY_EVENT));
    return;
  }
  window.__r20jeCoc7PageImporterInstalled = true;
  window.__r20jeCoc7PageImporterReady = true;

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

  function getModelId(model) {
    return getModelValue(model, "id") || getModelValue(model, "_id") || model?.id || model?.cid || "";
  }

  function getCampaignCandidates() {
    return [
      window.Campaign,
      window.d20?.Campaign,
      window.d20?.campaign,
      window.app?.campaign,
    ].filter(Boolean);
  }

  function getCharacterCollections() {
    const collections = [];
    getCampaignCandidates().forEach((campaign) => {
      [
        campaign.characters,
        campaign.get?.("characters"),
        campaign.get?.("chars"),
        campaign.chars,
      ].forEach((collection) => {
        if (collection && !collections.includes(collection)) collections.push(collection);
      });
    });
    return collections;
  }

  function findCharacterByName(characterName) {
    const target = normalizeText(characterName);
    for (const collection of getCharacterCollections()) {
      const found = collectionToArray(collection).find((character) => {
        const name = getModelValue(character, "name") || getModelValue(character, "displayname");
        return normalizeText(name) === target;
      });
      if (found) return found;
    }
    return null;
  }

  function getDirectCharacterCollection(character, names) {
    for (const name of names) {
      const direct = character?.[name];
      if (direct) return direct;
      const viaGet = character?.get?.(name);
      if (viaGet) return viaGet;
    }
    return null;
  }

  function modelBelongsToCharacter(model, characterId) {
    if (!characterId) return true;
    const possibleIds = [
      getModelValue(model, "characterid"),
      getModelValue(model, "_characterid"),
      getModelValue(model, "character_id"),
      getModelValue(model, "character"),
    ];
    return possibleIds.some((id) => String(id || "") === String(characterId));
  }

  function getCampaignScopedCollection(names, characterId) {
    const collections = [];
    getCampaignCandidates().forEach((campaign) => {
      names.forEach((name) => {
        const collection = campaign?.[name] || campaign?.get?.(name);
        if (collection && !collections.includes(collection)) collections.push(collection);
      });
    });
    return (
      collections.find((collection) =>
        collectionToArray(collection).some((model) => modelBelongsToCharacter(model, characterId))
      ) ||
      collections[0] ||
      null
    );
  }

  function getAttributeCollection(character, characterId) {
    return (
      getDirectCharacterCollection(character, ["attribs", "attributes", "attrs"]) ||
      getCampaignScopedCollection(["attribs", "attributes", "attrs"], characterId)
    );
  }

  function getAbilityCollection(character, characterId) {
    return (
      getDirectCharacterCollection(character, ["abilities", "ability"]) ||
      getCampaignScopedCollection(["abilities", "ability"], characterId)
    );
  }

  function findByName(collection, name, characterId) {
    const target = normalizeText(name);
    return collectionToArray(collection).find((model) => {
      const modelName = getModelValue(model, "name");
      return normalizeText(modelName) === target && modelBelongsToCharacter(model, characterId);
    });
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

  function applyAttributes(collection, attributes, characterId) {
    const result = {
      applied: [],
      created: [],
      updated: [],
      failed: [],
    };
    if (!collection) {
      attributes.forEach((attribute) => result.failed.push({
        name: attribute.roll20Name,
        reason: "attribute collection not found",
      }));
      return result;
    }

    attributes.forEach((attribute) => {
      try {
        const attrs = {
          name: attribute.roll20Name,
          current: attribute.current,
          max: attribute.max || "",
        };
        if (characterId) {
          attrs.characterid = characterId;
          attrs._characterid = characterId;
        }

        const existing = findByName(collection, attribute.roll20Name, characterId);
        if (existing) {
          saveModel(existing, attrs);
          result.updated.push(attribute.roll20Name);
          result.applied.push(attribute.roll20Name);
          return;
        }

        const created = createModel(collection, attrs);
        if (!created) {
          result.failed.push({
            name: attribute.roll20Name,
            reason: "attribute create failed",
          });
          return;
        }
        result.created.push(attribute.roll20Name);
        result.applied.push(attribute.roll20Name);
      } catch (error) {
        result.failed.push({
          name: attribute.roll20Name,
          reason: error?.message || String(error),
        });
      }
    });
    return result;
  }

  function applyAbilities(collection, abilities, characterId) {
    const result = {
      applied: [],
      created: [],
      updated: [],
      failed: [],
    };
    if (!collection) {
      abilities.forEach((ability) => result.failed.push({
        name: ability.name,
        reason: "ability collection not found",
      }));
      return result;
    }

    abilities.forEach((ability) => {
      try {
        const attrs = {
          name: ability.name,
          action: ability.action,
          istokenaction: !!ability.istokenaction,
        };
        if (characterId) {
          attrs.characterid = characterId;
          attrs._characterid = characterId;
        }

        const existing = findByName(collection, ability.name, characterId);
        if (existing) {
          saveModel(existing, attrs);
          result.updated.push(ability.name);
          result.applied.push(ability.name);
          return;
        }

        const created = createModel(collection, attrs);
        if (!created) {
          result.failed.push({
            name: ability.name,
            reason: "ability create failed",
          });
          return;
        }
        result.created.push(ability.name);
        result.applied.push(ability.name);
      } catch (error) {
        result.failed.push({
          name: ability.name,
          reason: error?.message || String(error),
        });
      }
    });
    return result;
  }

  function getOpenCharacterDialogs(characterName) {
    if (typeof document === "undefined" || typeof document.querySelectorAll !== "function") return [];
    const selectors = [
      ".ui-dialog",
      ".ui-dialog-content",
      ".characterdialog",
      ".charactersheet",
      ".charsheet",
      "[data-characterid]",
    ];
    const normalizedName = normalizeText(characterName);
    return [...document.querySelectorAll(selectors.join(","))].filter((node) => {
      const nameInput = node.querySelector?.('[name="attr_character_name"], [name="attr_name"]');
      if (nameInput && normalizeText(nameInput.value || nameInput.textContent) === normalizedName) return true;
      return normalizeText(node.textContent).includes(normalizedName);
    });
  }

  function clickElement(element) {
    if (!element) return false;
    if (typeof element.click === "function") {
      element.click();
      return true;
    }
    if (typeof element.dispatchEvent === "function" && typeof window.MouseEvent === "function") {
      element.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
      return true;
    }
    return false;
  }

  function closeCharacterDialogs(dialogs) {
    return dialogs.filter((dialog) => {
      const closeButton = dialog.querySelector?.(
        '.ui-dialog-titlebar-close, button[title="Close"], button[aria-label="Close"], .close, [data-action="close"]'
      );
      return clickElement(closeButton);
    }).length;
  }

  function dispatchOpenEvents(element) {
    if (!element || typeof element.dispatchEvent !== "function" || typeof window.MouseEvent !== "function") {
      return false;
    }
    ["mousedown", "mouseup", "click", "dblclick"].forEach((eventName) => {
      element.dispatchEvent(
        new window.MouseEvent(eventName, {
          bubbles: true,
          cancelable: true,
          detail: eventName === "dblclick" ? 2 : 1,
        })
      );
    });
    return true;
  }

  function findJournalCharacterNode(character, characterName) {
    if (typeof document === "undefined" || typeof document.querySelectorAll !== "function") return null;
    const characterId = getModelId(character);
    const escapedId =
      typeof CSS !== "undefined" && CSS.escape ? CSS.escape(characterId) : String(characterId).replace(/"/g, '\\"');
    const idSelectors = characterId
      ? [
          `[data-characterid="${escapedId}"]`,
          `[data-itemid="${escapedId}"]`,
          `[data-id="${escapedId}"]`,
          `[rel="${escapedId}"]`,
        ]
      : [];

    for (const selector of idSelectors) {
      const node = document.querySelectorAll(selector)?.[0];
      if (node) return node;
    }

    const normalizedName = normalizeText(characterName);
    const candidates = document.querySelectorAll(
      "#journal li, #journal .journalitem, #journal .character, .journalitem, li.character, [data-itemid]"
    );
    return [...candidates].find((node) => normalizeText(node.textContent).includes(normalizedName)) || null;
  }

  function openCharacterViaModel(character) {
    const candidates = [
      character?.view,
      character?._view,
      getModelValue(character, "view"),
      getModelValue(character, "_view"),
      character,
    ];
    const methodNames = ["open", "show", "activate", "render"];
    for (const candidate of candidates) {
      if (!candidate) continue;
      for (const methodName of methodNames) {
        if (typeof candidate[methodName] !== "function") continue;
        try {
          candidate[methodName].call(candidate);
          return `${methodName}`;
        } catch (error) {
          // Try the next native opening method.
        }
      }
    }
    return "";
  }

  function reopenDelay() {
    return new Promise((resolve) => {
      const timer = window.setTimeout || setTimeout;
      timer(resolve, 250);
    });
  }

  async function getSheetUiState({ ok, character, characterName }) {
    const dialogs = ok ? getOpenCharacterDialogs(characterName) : [];
    if (!ok) {
      return {
        liveRefreshAttempted: false,
        autoReopenAttempted: false,
        needsReopen: false,
        reopened: false,
        closedSheets: 0,
        openMethod: "",
        message: "",
      };
    }
    if (!dialogs.length) {
      return {
        liveRefreshAttempted: false,
        autoReopenAttempted: false,
        needsReopen: false,
        reopened: false,
        closedSheets: 0,
        openMethod: "",
        message: "저장되었습니다. 다음에 시트를 열면 변경사항이 보입니다.",
      };
    }

    const closedSheets = closeCharacterDialogs(dialogs);
    await reopenDelay();

    const journalNode = findJournalCharacterNode(character, characterName);
    const openedViaJournal = dispatchOpenEvents(journalNode);
    const modelOpenMethod = openedViaJournal ? "" : openCharacterViaModel(character);
    const reopened = openedViaJournal || !!modelOpenMethod;

    return {
      liveRefreshAttempted: false,
      autoReopenAttempted: true,
      needsReopen: !reopened,
      reopened,
      closedSheets,
      openMethod: openedViaJournal ? "journal-dblclick" : modelOpenMethod,
      message: reopened
        ? "저장 후 열린 시트를 자동으로 다시 열었습니다."
        : "저장되었습니다. 열린 시트를 닫았다 다시 열면 변경사항이 보입니다.",
    };
  }

  async function applyImport(payload) {
    const character = findCharacterByName(payload.characterName);
    if (!character) {
      return {
        ok: false,
        strategy: "roll20-page-model",
        characterFound: false,
        characterName: payload.characterName,
        message: `캐릭터 '${payload.characterName}'를 Roll20 모델에서 찾지 못했습니다.`,
      };
    }

    const characterId = getModelId(character);
    const attributeCollection = getAttributeCollection(character, characterId);
    const abilityCollection = getAbilityCollection(character, characterId);
    const attributes = applyAttributes(attributeCollection, payload.attributes || [], characterId);
    const abilities = applyAbilities(abilityCollection, payload.abilities || [], characterId);
    const ok = attributes.applied.length > 0 || abilities.applied.length > 0;
    const sheetUi = await getSheetUiState({
      ok,
      character,
      characterName: payload.characterName,
    });

    return {
      ok,
      strategy: "roll20-page-model",
      characterFound: true,
      characterName: payload.characterName,
      characterId,
      attributes,
      abilities,
      sheetUi,
      message: ok ? "Roll20 캐릭터 모델에 적용했습니다." : "캐릭터는 찾았지만 적용할 수 있는 collection을 찾지 못했습니다.",
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
        characterName: payload?.characterName || "",
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
