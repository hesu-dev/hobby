(function () {
  const modules = {
"index.js": function(module, exports, require) {
function notReady() {
  throw new Error("shared core not implemented yet");
}

const parserUtils = require("parsers/parser_utils.js");
const cocRuleParser = require("parsers/coc_rule_parser.js");
const insaneRuleParser = require("parsers/insane_rule_parser.js");
const chatJson = require("chat_json_export.js");
const avatarResolutionContext = require("exporter/avatar_resolution_context.js");
const messageSnapshotBuilder = require("exporter/message_snapshot_builder.js");
const exportDocumentBuilder = require("exporter/export_document_builder.js");
const browserContract = {
  parserUtils,
  cocRuleParser,
  insaneRuleParser,
  chatJson,
  avatarResolutionContext,
  messageSnapshotBuilder,
  exportDocumentBuilder,
};

module.exports = {
  parseRoll20DicePayload: chatJson.parseRoll20DicePayload || notReady,
  buildChatJsonDocument: chatJson.buildChatJsonDocument || notReady,
  buildChatJsonEntry: chatJson.buildChatJsonEntry || notReady,
  buildExportDocument: exportDocumentBuilder.buildExportDocument || notReady,
  parserUtils,
  cocRuleParser,
  insaneRuleParser,
  chatJson,
  avatarResolutionContext,
  messageSnapshotBuilder,
  exportDocumentBuilder,
  browserContract,
};

},
"parsers/parser_utils.js": function(module, exports, require) {
function stripHtmlTags(html) {
  return String(html || "").replace(/<[^>]*>/g, " ");
}

function decodeHtmlEntity(entity) {
  const raw = String(entity || "");
  const normalized = raw.toLowerCase();
  if (normalized === "amp") return "&";
  if (normalized === "lt") return "<";
  if (normalized === "gt") return ">";
  if (normalized === "quot") return '"';
  if (normalized === "apos") return "'";
  if (normalized === "nbsp") return " ";

  const decimalMatch = normalized.match(/^#(\d+)$/);
  if (decimalMatch?.[1]) {
    const codePoint = Number(decimalMatch[1]);
    if (Number.isFinite(codePoint)) {
      try {
        return String.fromCodePoint(codePoint);
      } catch (_) {
        return `&${raw};`;
      }
    }
  }

  const hexMatch = normalized.match(/^#x([0-9a-f]+)$/);
  if (hexMatch?.[1]) {
    const codePoint = Number.parseInt(hexMatch[1], 16);
    if (Number.isFinite(codePoint)) {
      try {
        return String.fromCodePoint(codePoint);
      } catch (_) {
        return `&${raw};`;
      }
    }
  }

  return `&${raw};`;
}

function decodeHtmlEntities(raw) {
  return String(raw || "").replace(/&([a-z]+|#\d+|#x[0-9a-f]+);/gi, (_match, entity) =>
    decodeHtmlEntity(entity)
  );
}

function markdownMarkerForFormattingTag(tagName) {
  const normalized = String(tagName || "").trim().toLowerCase();
  if (normalized === "em" || normalized === "i") return "*";
  if (normalized === "strong" || normalized === "b") return "**";
  return "";
}

function serializeInlineFormattingHtmlToMarkdown(html) {
  const source = String(html || "");
  if (!source) return "";

  let output = "";
  let cursor = 0;
  const tagRegex = /<\s*(\/)?\s*([a-z][a-z0-9-]*)\b[^>]*>/gi;
  let matched = tagRegex.exec(source);

  while (matched) {
    output += decodeHtmlEntities(source.slice(cursor, matched.index));

    const isClosingTag = !!matched[1];
    const tagName = matched[2] || "";
    const marker = markdownMarkerForFormattingTag(tagName);
    if (marker) output += marker;
    if (!isClosingTag && /^(br|hr)$/i.test(tagName)) output += " ";

    cursor = matched.index + matched[0].length;
    matched = tagRegex.exec(source);
  }

  output += decodeHtmlEntities(source.slice(cursor));
  return output.replace(/\s+/g, " ").trim();
}

function normalizeDoubleQuotes(raw) {
  return String(raw || "").replace(/[\u201C\u201D\u201E\u201F\u2033\u2036\u275D\u275E\u301D\u301E\u301F\uFF02]/g, '"');
}

function normalizeText(raw) {
  return normalizeDoubleQuotes(raw).replace(/\s+/g, " ").trim();
}

function toSafeText(raw) {
  const normalized = normalizeText(raw);
  if (!normalized) return "";
  return normalizeText(normalized.replace(/[^\p{L}\p{N}\s!?.,~]/gu, ""));
}

function extractFirstInteger(raw) {
  const matched = String(raw || "").match(/-?\d+/);
  if (!matched) return null;
  const parsed = Number(matched[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function extractFirstIntegerFromRenderedHtml(rawHtml) {
  return extractFirstInteger(normalizeText(stripHtmlTags(rawHtml)));
}

function collectInlineRollSpanIntegers(containerHtml) {
  const values = [];
  const regex =
    /<span[^>]*class=["'][^"']*\binlinerollresult\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/gi;
  let matched = regex.exec(String(containerHtml || ""));
  while (matched) {
    const value = extractFirstIntegerFromRenderedHtml(matched[1] || "");
    if (Number.isFinite(value)) values.push(value);
    matched = regex.exec(String(containerHtml || ""));
  }
  return values;
}

function collectTemplateValueCells(html) {
  const cells = [];
  const regex = /<td[^>]*class=["'][^"']*\bsheet-template_value\b[^"']*["'][^>]*>([\s\S]*?)<\/td>/gi;
  let matched = regex.exec(String(html || ""));
  while (matched) {
    cells.push(normalizeText(stripHtmlTags(matched[1])));
    matched = regex.exec(String(html || ""));
  }
  return cells;
}

function extractTemplateName(html) {
  const matched = String(html || "").match(/\bsheet-rolltemplate-([a-z0-9-]+)/i);
  if (!matched?.[1]) return "";
  return String(matched[1]).toLowerCase();
}

function extractCellHtmlByClass(rowHtml, className) {
  const safeClass = String(className || "").trim();
  if (!safeClass) return "";
  const regex = /<td[^>]*class=["']([^"']*)["'][^>]*>([\s\S]*?)<\/td>/gi;
  let matched = regex.exec(String(rowHtml || ""));
  while (matched) {
    const classTokens = String(matched[1] || "").split(/\s+/).filter(Boolean);
    if (classTokens.includes(safeClass)) return matched[2] || "";
    matched = regex.exec(String(rowHtml || ""));
  }
  return "";
}

function extractElementInnerHtmlByClass(html, tagName, className) {
  const safeTag = String(tagName || "").trim();
  if (!safeTag) return "";
  const escapedTag = safeTag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const safeClass = String(className || "").trim();
  const regex = new RegExp(`<${escapedTag}\\b([^>]*)>([\\s\\S]*?)<\\/${escapedTag}>`, "gi");
  let matched = regex.exec(String(html || ""));
  while (matched) {
    if (!safeClass) return matched[2] || "";
    const attrs = String(matched[1] || "");
    const classMatch = attrs.match(/\bclass=["']([^"']*)["']/i);
    const classTokens = String(classMatch?.[1] || "")
      .split(/\s+/)
      .filter(Boolean);
    if (classTokens.includes(safeClass)) return matched[2] || "";
    matched = regex.exec(String(html || ""));
  }
  return "";
}

function collectTemplateRows(html) {
  const rows = [];
  const regex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let matched = regex.exec(String(html || ""));
  while (matched) {
    const rowHtml = matched[1] || "";
    const valueCellHtml = extractCellHtmlByClass(rowHtml, "sheet-template_value");
    const labelCellHtml = extractCellHtmlByClass(rowHtml, "sheet-template_label");
    const rowLabel = normalizeText(stripHtmlTags(valueCellHtml || labelCellHtml || ""));
    if (rowLabel) rows.push({ label: rowLabel });
    matched = regex.exec(String(html || ""));
  }
  return rows;
}

function extractTemplateValueCellTexts(html) {
  const cells = [];
  const regex = /<td[^>]*class=["'][^"']*\bsheet-template_value\b[^"']*["'][^>]*>([\s\S]*?)<\/td>/gi;
  let matched = regex.exec(String(html || ""));
  while (matched) {
    cells.push(normalizeText(stripHtmlTags(matched[1] || "")));
    matched = regex.exec(String(html || ""));
  }
  return cells;
}

function sanitizeTrailingColon(text) {
  return normalizeText(String(text || "").replace(/\s*:\s*$/, ""));
}

function extractCaptionText(html) {
  const captionMatch = String(html || "").match(/<caption[^>]*>([\s\S]*?)<\/caption>/i);
  return normalizeText(stripHtmlTags(captionMatch?.[1] || ""));
}

function extractCaptionSuffix(captionText) {
  const safe = normalizeText(captionText);
  if (!safe) return "";
  const parts = safe.split(/\s*-\s*/);
  return normalizeText(parts[parts.length - 1] || safe);
}

function findIntegerFromTextByKeyword(cells, keyword) {
  const loweredKeyword = String(keyword || "").toLowerCase();
  if (!loweredKeyword) return null;
  for (const cell of cells || []) {
    const safeCell = String(cell || "");
    if (!safeCell.toLowerCase().includes(loweredKeyword)) continue;
    const number = extractFirstInteger(safeCell);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function extractAllIntegers(raw) {
  const matched = String(raw || "").match(/-?\d+/g) || [];
  return matched.map((value) => Number(value)).filter((value) => Number.isFinite(value));
}

function collectTemplateRowsWithCells(html) {
  const rows = [];
  const regex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let matched = regex.exec(String(html || ""));
  while (matched) {
    const rowHtml = matched[1] || "";
    const labelCellHtml = extractCellHtmlByClass(rowHtml, "sheet-template_label");
    const valueCellHtml = extractCellHtmlByClass(rowHtml, "sheet-template_value");
    rows.push({
      label: normalizeText(stripHtmlTags(labelCellHtml || "")),
      value: normalizeText(stripHtmlTags(valueCellHtml || "")),
    });
    matched = regex.exec(String(html || ""));
  }
  return rows;
}

function collectTrInnerHtmlList(html) {
  const list = [];
  const regex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let matched = regex.exec(String(html || ""));
  while (matched) {
    list.push(matched[1] || "");
    matched = regex.exec(String(html || ""));
  }
  return list;
}

function collectTdTexts(rowHtml) {
  const values = [];
  const regex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
  let matched = regex.exec(String(rowHtml || ""));
  while (matched) {
    const text = normalizeText(stripHtmlTags(matched[1] || ""));
    if (text) values.push(text);
    matched = regex.exec(String(rowHtml || ""));
  }
  return values;
}

module.exports = {
  stripHtmlTags,
  decodeHtmlEntities,
  serializeInlineFormattingHtmlToMarkdown,
  normalizeDoubleQuotes,
  normalizeText,
  toSafeText,
  extractFirstInteger,
  extractFirstIntegerFromRenderedHtml,
  collectInlineRollSpanIntegers,
  collectTemplateValueCells,
  extractTemplateName,
  extractCellHtmlByClass,
  extractElementInnerHtmlByClass,
  collectTemplateRows,
  extractTemplateValueCellTexts,
  sanitizeTrailingColon,
  extractCaptionText,
  extractCaptionSuffix,
  findIntegerFromTextByKeyword,
  extractAllIntegers,
  collectTemplateRowsWithCells,
  collectTrInnerHtmlList,
  collectTdTexts,
};

},
"parsers/coc_rule_parser.js": function(module, exports, require) {
const parserUtils = require("parsers/parser_utils.js");

function parseCocDefaultPayload({ html, template }) {
  const { extractCaptionText, collectTrInnerHtmlList, collectTdTexts } = parserUtils;
  if (String(template || "").toLowerCase() !== "default") return null;
  const safeHtml = String(html || "");
  const title = extractCaptionText(safeHtml);
  if (!title) return null;

  const rows = [];
  const trList = collectTrInnerHtmlList(safeHtml);
  trList.forEach((trHtml) => {
    const tds = collectTdTexts(trHtml);
    if (tds.length >= 2) rows.push({ key: tds[0], value: tds[1] });
  });

  return {
    source: "roll20",
    rule: "table",
    template: "default",
    inputs: { title, rows },
  };
}

function parseCoc1DicePayload(html, template) {
  const { normalizeText, stripHtmlTags, collectTemplateValueCells, extractFirstInteger } = parserUtils;
  const safeHtml = String(html || "");
  const normalizedTemplate = String(template || "").toLowerCase();
  const allowedTemplates = new Set(["coc-1", "coc-default"]);
  if (!allowedTemplates.has(normalizedTemplate)) return null;

  const captionMatch = safeHtml.match(/<caption[^>]*>([\s\S]*?)<\/caption>/i);
  const captionText = normalizeText(stripHtmlTags(captionMatch?.[1] || ""));
  const skill = captionText.replace(/\s+roll\s*$/i, "").trim();

  const cells = collectTemplateValueCells(safeHtml);
  const target = extractFirstInteger(cells[0] || "");
  const roll = extractFirstInteger(cells[1] || "");
  if (!skill || !Number.isFinite(target) || !Number.isFinite(roll)) return null;

  return {
    source: "roll20",
    rule: "coc7",
    template: "coc",
    inputs: { skill, roll, target },
  };
}

function parseCocRowsPayload(html, template) {
  const { normalizeText, stripHtmlTags, collectTemplateRows } = parserUtils;
  const normalizedTemplate = String(template || "").toLowerCase();
  const allowedTemplates = new Map([
    ["coc-dice-roll", "coc-dice"],
    ["coc-dice", "coc-dice"],
    ["coc-body-hit-loc", "coc-body-hit"],
    ["coc-body-hit", "coc-body-hit"],
  ]);
  const outputTemplate = allowedTemplates.get(normalizedTemplate);
  if (!outputTemplate) return null;

  const safeHtml = String(html || "");
  const captionMatch = safeHtml.match(/<caption[^>]*>([\s\S]*?)<\/caption>/i);
  const title = normalizeText(stripHtmlTags(captionMatch?.[1] || ""));
  const rows = collectTemplateRows(safeHtml);
  if (!title || !rows.length) return null;

  return {
    source: "roll20",
    rule: "coc7",
    template: outputTemplate,
    inputs: { title, rows },
  };
}

function parseCocInitStcPayload(html, template) {
  const { extractCaptionText, collectTemplateRowsWithCells, sanitizeTrailingColon, normalizeText } =
    parserUtils;
  if (String(template || "").toLowerCase() !== "coc-init-stc") return null;
  const safeHtml = String(html || "");
  const title = extractCaptionText(safeHtml);
  const rows = collectTemplateRowsWithCells(safeHtml);
  const firstRow = rows[0] || { label: "", value: "" };
  const label = normalizeText(
    `${sanitizeTrailingColon(firstRow.label || "")}: ${normalizeText(firstRow.value || "")}`
  );
  if (!title || !label) return null;

  return {
    source: "roll20",
    rule: "coc7",
    template: "coc-dice",
    inputs: { title, rows: [{ label }] },
  };
}

function parseCocDefence2Payload(html, template) {
  const { extractCaptionText, collectTemplateRowsWithCells, extractFirstInteger } = parserUtils;
  if (String(template || "").toLowerCase() !== "coc-defence-2") return null;
  const safeHtml = String(html || "");
  const caption = extractCaptionText(safeHtml);
  const rows = collectTemplateRowsWithCells(safeHtml);
  const firstRow = rows[0] || { value: "" };
  const value = extractFirstInteger(firstRow.value || "");
  if (!caption || !Number.isFinite(value)) return null;

  return {
    source: "roll20",
    rule: "coc7",
    template: "coc-defence-2",
    inputs: { title: `장갑(방어구) : ${caption}`, rows: [{ label: String(value) }] },
  };
}

function parseCocBomadnessPayload(html, template) {
  const {
    extractCaptionSuffix,
    extractCaptionText,
    extractTemplateValueCellTexts,
    sanitizeTrailingColon,
    normalizeText,
    findIntegerFromTextByKeyword,
  } = parserUtils;
  const normalizedTemplate = String(template || "").toLowerCase();
  const allowedTemplates = new Map([
    ["coc-bomadness-rt", "coc-madness-realtime"],
    ["coc-madness-realtime", "coc-madness-realtime"],
    ["coc-bomadness-summ", "coc-madness-summary"],
    ["coc-madness-summary", "coc-madness-summary"],
  ]);
  const outputTemplate = allowedTemplates.get(normalizedTemplate);
  if (!outputTemplate) return null;

  const safeHtml = String(html || "");
  const title = extractCaptionSuffix(extractCaptionText(safeHtml));
  const cells = extractTemplateValueCellTexts(safeHtml);
  if (!title || !cells.length) return null;

  const first = sanitizeTrailingColon(cells[0] || "");
  const second = normalizeText(cells[1] || "");
  if (!first || !second) return null;

  const label = { title: first, detail: second };
  const duration = findIntegerFromTextByKeyword(cells, "duration");
  if (Number.isFinite(duration)) label.duration = duration;

  if (outputTemplate === "coc-madness-realtime") {
    const number = findIntegerFromTextByKeyword(cells, "mania number");
    const rounds = findIntegerFromTextByKeyword(cells, "rounds");
    if (Number.isFinite(number)) label.number = number;
    if (Number.isFinite(rounds)) label.rounds = rounds;
  }

  return {
    source: "roll20",
    rule: "coc7",
    template: outputTemplate,
    inputs: { title, rows: [{ label }] },
  };
}

function mapAttackSkill(caption) {
  const { normalizeText } = parserUtils;
  const safe = normalizeText(caption);
  if (!safe) return "";
  if (/(라이플|권총|산탄총|총|rifle|pistol|shotgun|smg|gun)/i.test(safe)) return "총";
  return safe;
}

function parseCocAttackPayload(html, template) {
  const { extractCaptionText, collectTemplateRowsWithCells, extractFirstInteger, extractAllIntegers } =
    parserUtils;
  const normalizedTemplate = String(template || "").toLowerCase();
  const allowedTemplates = new Set(["coc-attack", "coc-attack-bonus-penalty"]);
  if (!allowedTemplates.has(normalizedTemplate)) return null;
  const safeHtml = String(html || "");
  const caption = extractCaptionText(safeHtml);
  const rows = collectTemplateRowsWithCells(safeHtml);
  if (!caption || !rows.length) return null;

  const successRow = rows.find((row) => /기준치|value/i.test(String(row.label || "")));
  const rollRow = rows.find((row) => /굴림|rolled/i.test(String(row.label || "")));
  const damageRow = rows.find((row) => /피해|dam/i.test(String(row.label || "")));

  const target = extractFirstInteger(successRow?.value || "");
  const rollNumbers = extractAllIntegers(rollRow?.value || "");
  const damage = extractFirstInteger(damageRow?.value || "");
  const skill = mapAttackSkill(caption);

  if (!skill || !Number.isFinite(target) || !rollNumbers.length || !Number.isFinite(damage)) return null;
  return {
    source: "roll20",
    rule: "coc7",
    template: "coc-attack-bonus-penalty",
    inputs: { skill, target, rolls: rollNumbers, damage },
  };
}

function parseCocAttackOnePayload(html, template) {
  const { extractCaptionText, collectTemplateRowsWithCells, extractFirstInteger } = parserUtils;
  const normalizedTemplate = String(template || "").toLowerCase();
  const allowedTemplates = new Set(["coc-attack-1", "coc-attack"]);
  if (!allowedTemplates.has(normalizedTemplate)) return null;
  const safeHtml = String(html || "");
  const skill = extractCaptionText(safeHtml);
  const rows = collectTemplateRowsWithCells(safeHtml);

  const successRow = rows.find((row) => /기준치|value/i.test(String(row.label || "")));
  const damageRow = rows.find((row) => /피해|dam/i.test(String(row.label || "")));
  const target = extractFirstInteger(successRow?.value || "");
  const damage = extractFirstInteger(damageRow?.value || "");

  if (!skill || !Number.isFinite(target) || !Number.isFinite(damage)) return null;
  return {
    source: "roll20",
    rule: "coc7",
    template: "coc-attack",
    inputs: { skill, target, rolls: [target], damage },
  };
}

function parseCocPayload(html, template) {
  const { extractCaptionText, collectTemplateRowsWithCells, extractAllIntegers } = parserUtils;
  const normalizedTemplate = String(template || "").toLowerCase();
  const allowedTemplates = new Set(["coc", "coc-bonus-penalty"]);
  if (!allowedTemplates.has(normalizedTemplate)) return null;
  const safeHtml = String(html || "");
  const skill = extractCaptionText(safeHtml);
  const rows = collectTemplateRowsWithCells(safeHtml);
  const rollRow = rows.find((row) => /굴림|rolled/i.test(String(row.label || "")));
  const rolls = extractAllIntegers(rollRow?.value || "");
  const target = rolls.length ? rolls[0] : null;
  if (!skill || !Number.isFinite(target) || !rolls.length) return null;

  return {
    source: "roll20",
    rule: "coc7",
    template: "coc-bonus-penalty",
    inputs: { skill, target, rolls },
  };
}

function parseCocBonusPayload(html, template) {
  const { extractCaptionText, collectTemplateRowsWithCells, extractAllIntegers, extractFirstInteger } =
    parserUtils;
  if (String(template || "").toLowerCase() !== "coc-bonus") return null;
  const safeHtml = String(html || "");
  const skill = extractCaptionText(safeHtml);
  const rows = collectTemplateRowsWithCells(safeHtml);
  const successRow = rows.find((row) => /기준치|value/i.test(String(row.label || "")));
  const rollRow = rows.find((row) => /굴림|rolled/i.test(String(row.label || "")));
  const target = extractFirstInteger(successRow?.value || "");
  const rolls = extractAllIntegers(rollRow?.value || "");
  if (!Number.isFinite(target) || !rolls.length) return null;
  const inputs = { target, rolls };
  if (skill) inputs.skill = skill;

  return {
    source: "roll20",
    rule: "coc7",
    template: "coc-bonus-penalty",
    inputs,
  };
}

function parseCocRulePayload({ html, template }) {
  const normalizedTemplate = String(template || "").toLowerCase();
  if (normalizedTemplate === "coc" || normalizedTemplate === "coc-bonus-penalty") {
    return parseCocPayload(html, normalizedTemplate) || parseCoc1DicePayload(html, normalizedTemplate);
  }
  if (normalizedTemplate === "coc-1" || normalizedTemplate === "coc-default") {
    return parseCoc1DicePayload(html, normalizedTemplate);
  }
  if (template === "coc-bonus") return parseCocBonusPayload(html, template);
  if (normalizedTemplate === "coc-attack" || normalizedTemplate === "coc-attack-bonus-penalty") {
    return (
      parseCocAttackPayload(html, normalizedTemplate) ||
      parseCocAttackOnePayload(html, normalizedTemplate)
    );
  }
  if (normalizedTemplate === "coc-attack-1") return parseCocAttackOnePayload(html, normalizedTemplate);
  if (normalizedTemplate === "coc-init-stc") return parseCocInitStcPayload(html, normalizedTemplate);
  if (normalizedTemplate === "coc-defence-2") return parseCocDefence2Payload(html, normalizedTemplate);
  if (
    normalizedTemplate === "coc-bomadness-rt" ||
    normalizedTemplate === "coc-bomadness-summ" ||
    normalizedTemplate === "coc-madness-realtime" ||
    normalizedTemplate === "coc-madness-summary"
  ) {
    return parseCocBomadnessPayload(html, normalizedTemplate);
  }
  return parseCocRowsPayload(html, normalizedTemplate);
}

module.exports = { parseCocDefaultPayload, parseCocRulePayload };

},
"parsers/insane_rule_parser.js": function(module, exports, require) {
const parserUtils = require("parsers/parser_utils.js");

function parseInsanePayload(html, template) {
  const {
    extractElementInnerHtmlByClass,
    normalizeText,
    stripHtmlTags,
    sanitizeTrailingColon,
    collectInlineRollSpanIntegers,
  } = parserUtils;
  if (String(template || "").toLowerCase() !== "insane") return null;
  const safeHtml = String(html || "");

  const diceAreaHtml = extractElementInnerHtmlByClass(safeHtml, "div", "sheet-dice-area");
  const resultHtml = extractElementInnerHtmlByClass(safeHtml, "div", "sheet-dice-result");
  const checkHtml = extractElementInnerHtmlByClass(diceAreaHtml, "strong");
  const checkText = normalizeText(stripHtmlTags(checkHtml || diceAreaHtml));
  const skill = sanitizeTrailingColon(checkText);

  const targetRolls = collectInlineRollSpanIntegers(diceAreaHtml);
  const resultRolls = collectInlineRollSpanIntegers(resultHtml);
  const target = targetRolls.length ? targetRolls[targetRolls.length - 1] : null;
  const roll = resultRolls.length ? resultRolls[0] : null;
  if (!skill || !Number.isFinite(target) || !Number.isFinite(roll)) return null;

  return {
    source: "roll20",
    rule: "insane",
    template: "insane-dice",
    inputs: { skill, target, roll },
  };
}

function parseInsDicePayload(html, template) {
  const { normalizeText, stripHtmlTags, extractFirstIntegerFromRenderedHtml } = parserUtils;
  if (String(template || "").toLowerCase() !== "insdice") return null;
  const safeHtml = String(html || "");

  const skillMatch = safeHtml.match(
    /<div[^>]*class=["'][^"']*\bsheet-subj\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i
  );
  const targetSpanMatch = safeHtml.match(
    /<div[^>]*class=["'][^"']*\bsheet-target\b(?!-result)[^"']*["'][^>]*>[\s\S]*?<span[^>]*class=["'][^"']*\binlinerollresult\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i
  );
  const rollSpanMatch = safeHtml.match(
    /<div[^>]*class=["'][^"']*\bsheet-dice-val\b[^"']*["'][^>]*>[\s\S]*?<span[^>]*class=["'][^"']*\binlinerollresult\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i
  );

  const skill = normalizeText(stripHtmlTags(skillMatch?.[1] || ""));
  const target = extractFirstIntegerFromRenderedHtml(targetSpanMatch?.[1] || "");
  const roll = extractFirstIntegerFromRenderedHtml(rollSpanMatch?.[1] || "");
  if (!skill || !Number.isFinite(target) || !Number.isFinite(roll)) return null;

  return {
    source: "roll20",
    rule: "insane",
    template: "insane-dice",
    inputs: { skill, target, roll },
  };
}

function parseInsSkillPayload(html, template) {
  const { normalizeText, stripHtmlTags, extractFirstIntegerFromRenderedHtml } = parserUtils;
  if (String(template || "").toLowerCase() !== "insskill") return null;
  const safeHtml = String(html || "");

  const headSubjMatch = safeHtml.match(
    /<div[^>]*class=["'][^"']*\bsheet-subj\b[^"']*["'][^>]*>\s*<span[^>]*>([\s\S]*?)<\/span>\s*<strong[^>]*>([\s\S]*?)<\/strong>[\s\S]*?<\/div>/i
  );
  const detailMatch = safeHtml.match(
    /<div[^>]*class=["'][^"']*\bsheet-desc\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i
  );
  const dataSubjMatch = safeHtml.match(
    /<div[^>]*class=["'][^"']*\bsheet-data\b[^"']*["'][^>]*>[\s\S]*?<div[^>]*class=["'][^"']*\bsheet-subj\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i
  );
  const targetSpanMatch = safeHtml.match(
    /<div[^>]*class=["'][^"']*\bsheet-target\b(?!-result)[^"']*["'][^>]*>[\s\S]*?<span[^>]*class=["'][^"']*\binlinerollresult\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i
  );
  const rollSpanMatch = safeHtml.match(
    /<div[^>]*class=["'][^"']*\bsheet-dice-val\b[^"']*["'][^>]*>[\s\S]*?<span[^>]*class=["'][^"']*\binlinerollresult\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i
  );

  const type = normalizeText(stripHtmlTags(headSubjMatch?.[1] || ""));
  const title = normalizeText(stripHtmlTags(headSubjMatch?.[2] || ""));
  const detail = normalizeText(stripHtmlTags(detailMatch?.[1] || ""));
  const skill = normalizeText(stripHtmlTags(dataSubjMatch?.[1] || "")) || null;
  const target = extractFirstIntegerFromRenderedHtml(targetSpanMatch?.[1] || "");
  const roll = extractFirstIntegerFromRenderedHtml(rollSpanMatch?.[1] || "");
  if (!type || !title || !detail) return null;

  return {
    source: "roll20",
    rule: "insane",
    template: "ability",
    inputs: {
      type,
      title,
      detail,
      skill,
      target: Number.isFinite(target) ? target : null,
      roll: Number.isFinite(roll) ? roll : null,
    },
  };
}

function extractNinpoSkill(rawLabel) {
  const { normalizeText } = parserUtils;
  const text = normalizeText(rawLabel);
  if (!text) return "";
  const matched = text.match(/\broll\b\s*(.+)$/i);
  if (!matched?.[1]) return text;
  return normalizeText(matched[1]);
}

function parseNinpoPayload(html, template) {
  const { extractElementInnerHtmlByClass, normalizeText, stripHtmlTags, collectInlineRollSpanIntegers } =
    parserUtils;
  if (String(template || "").toLowerCase() !== "ninpo") return null;
  const safeHtml = String(html || "");

  const titleHtml = extractElementInnerHtmlByClass(safeHtml, "span", "sheet-big");
  const titleText = normalizeText(stripHtmlTags(titleHtml || ""));
  const skill = extractNinpoSkill(titleText);

  const resultAreaHtml = extractElementInnerHtmlByClass(safeHtml, "div", "sheet-resright");
  const targetRowHtml = extractElementInnerHtmlByClass(safeHtml, "div", "sheet-myrow");
  const resultRolls = collectInlineRollSpanIntegers(resultAreaHtml);
  const targetRolls = collectInlineRollSpanIntegers(targetRowHtml);
  const roll = resultRolls.length ? resultRolls[0] : null;
  const target = targetRolls.length ? targetRolls[targetRolls.length - 1] : null;
  if (!skill || !Number.isFinite(target) || !Number.isFinite(roll)) return null;

  return {
    source: "roll20",
    rule: "insane",
    template: "insane-dice",
    inputs: { skill, target, roll },
  };
}

function parseInsDescPayload(html, template) {
  const { normalizeText, stripHtmlTags } = parserUtils;
  if (String(template || "").toLowerCase() !== "insdesc") return null;
  const safeHtml = String(html || "");

  const emotionMatch = safeHtml.match(
    /<div[^>]*class=["'][^"']*\bsheet-desc\b[^"']*\bsheet-emot\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i
  );
  const emotionTitle = normalizeText(stripHtmlTags(emotionMatch?.[1] || ""));
  if (emotionTitle) {
    return {
      source: "roll20",
      rule: "insane",
      template: "emotion",
      inputs: {
        type: "감정",
        title: emotionTitle,
        detail: null,
        skill: null,
        target: null,
        roll: null,
      },
    };
  }

  const headSubjMatch = safeHtml.match(
    /<div[^>]*class=["'][^"']*\bsheet-subj\b[^"']*["'][^>]*>\s*<span[^>]*>([\s\S]*?)<\/span>\s*<strong[^>]*>([\s\S]*?)<\/strong>[\s\S]*?<\/div>/i
  );
  const detailMatch = safeHtml.match(
    /<div[^>]*class=["'][^"']*\bsheet-desc\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i
  );

  const type = normalizeText(stripHtmlTags(headSubjMatch?.[1] || ""));
  const title = normalizeText(stripHtmlTags(headSubjMatch?.[2] || ""));
  const detail = normalizeText(stripHtmlTags(detailMatch?.[1] || ""));

  if (type && title && detail) {
    return {
      source: "roll20",
      rule: "insane",
      template: "item",
      inputs: {
        type,
        title,
        detail,
        skill: null,
        target: null,
        roll: null,
      },
    };
  }

  const singleSubjMatch = safeHtml.match(
    /<div[^>]*class=["'][^"']*\bsheet-subj\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i
  );
  const singleTitleRaw = normalizeText(stripHtmlTags(singleSubjMatch?.[1] || ""));
  if (!singleTitleRaw || !detail) return null;

  return {
    source: "roll20",
    rule: "insane",
    template: "scene-table",
    inputs: {
      type: null,
      title: "장면표",
      detail,
      skill: null,
      target: null,
      roll: null,
    },
  };
}

function normalizeInsPlotTitle(raw) {
  const { normalizeText } = parserUtils;
  const text = normalizeText(raw);
  if (!text) return "";
  return text.replace(/^(\d+)\.\s*/, "$1. ");
}

function normalizeInsPlotSkill(raw) {
  const { normalizeText } = parserUtils;
  const text = normalizeText(raw);
  if (!text) return "";
  if (text === "파괴") return "포박";
  return text;
}

function parseInsPlotPayload(html, template) {
  const { stripHtmlTags } = parserUtils;
  if (String(template || "").toLowerCase() !== "insplot") return null;
  const safeHtml = String(html || "");
  const titleMatch = safeHtml.match(
    /<div[^>]*class=["'][^"']*\bsheet-random\b[^"']*["'][^>]*>[\s\S]*?<strong[^>]*>[\s\S]*?<em[^>]*>([\s\S]*?)<\/em>[\s\S]*?<\/strong>/i
  );
  const skillMatch = safeHtml.match(
    /<div[^>]*class=["'][^"']*\bsheet-random\b[^"']*["'][^>]*>[\s\S]*?<span[^>]*>[\s\S]*?<em[^>]*>([\s\S]*?)<\/em>[\s\S]*?<\/span>/i
  );

  const title = normalizeInsPlotTitle(stripHtmlTags(titleMatch?.[1] || ""));
  const skill = normalizeInsPlotSkill(stripHtmlTags(skillMatch?.[1] || ""));
  if (!title || !skill) return null;

  return {
    source: "roll20",
    rule: "insane",
    template: "dice",
    inputs: {
      type: null,
      title,
      detail: null,
      skill,
      target: null,
      roll: null,
    },
  };
}

function parseInsaneRulePayload({ html, template }) {
  if (template === "insane") return parseInsanePayload(html, template);
  if (template === "ninpo") return parseNinpoPayload(html, template);
  if (template === "insdice") return parseInsDicePayload(html, template);
  if (template === "insskill") return parseInsSkillPayload(html, template);
  if (template === "insdesc") return parseInsDescPayload(html, template);
  if (template === "insplot") return parseInsPlotPayload(html, template);
  return null;
}

module.exports = { parseInsaneRulePayload };

},
"chat_json_export.js": function(module, exports, require) {
const parserUtils = require("parsers/parser_utils.js");
const cocRuleParser = require("parsers/coc_rule_parser.js");
const insaneRuleParser = require("parsers/insane_rule_parser.js");

const HIDDEN_PLACEHOLDER_TEXT = "This message has been hidden";

function isHiddenMessagePlaceholderText(raw) {
  const normalized = String(raw || "").replace(/\s+/g, " ").trim().toLowerCase();
  if (!normalized) return false;
  return normalized.includes(HIDDEN_PLACEHOLDER_TEXT.toLowerCase());
}

function normalizeMessageText(raw) {
  return String(raw || "").replace(/\s+/g, " ").trim();
}

function parseRoll20DicePayload({ role, html }) {
  const { extractTemplateName, stripHtmlTags, normalizeText } = parserUtils;
  const template = extractTemplateName(html);
  const parseCocDefaultPayload = cocRuleParser.parseCocDefaultPayload;
  if (typeof parseCocDefaultPayload === "function") {
    const defaultPayload = parseCocDefaultPayload({ html, template });
    if (defaultPayload) return defaultPayload;
  }
  if (String(role || "").toLowerCase() !== "dice") return null;

  const ruleParsers = [
    insaneRuleParser.parseInsaneRulePayload,
    cocRuleParser.parseCocRulePayload,
  ].filter((fn) => typeof fn === "function");

  for (const parseRulePayload of ruleParsers) {
    const parsed = parseRulePayload({ html, template });
    if (parsed) return parsed;
  }

  const safeNormalize = typeof normalizeText === "function" ? normalizeText : normalizeMessageText;
  const safeStripTags =
    typeof stripHtmlTags === "function"
      ? stripHtmlTags
      : (rawHtml) => String(rawHtml || "").replace(/<[^>]*>/g, " ");
  const renderedText = safeNormalize(safeStripTags(html));
  const cocLikeMatch = renderedText.match(
    /^(.+?)\s+기준치:\s*(\d+)(?:\s*\/\s*\d+){0,2}\s+굴림:\s*(\d+)(?:\s+판정결과:\s*(.+))?$/i
  );
  if (cocLikeMatch) {
    return {
      source: "roll20",
      rule: "coc7",
      template: "coc-text",
      inputs: {
        skill: safeNormalize(cocLikeMatch[1] || ""),
        target: Number(cocLikeMatch[2]),
        roll: Number(cocLikeMatch[3]),
        result: safeNormalize(cocLikeMatch[4] || "") || null,
      },
    };
  }

  return null;
}

function joinDescAnchorLines(rawHtml, lineBreakToken = "\n") {
  const { normalizeText, stripHtmlTags } = parserUtils;
  const safeNormalize = typeof normalizeText === "function" ? normalizeText : normalizeMessageText;
  const safeStripTags =
    typeof stripHtmlTags === "function"
      ? stripHtmlTags
      : (html) => String(html || "").replace(/<[^>]*>/g, " ");

  const lines = [];
  const regex = /<a\b[^>]*>([\s\S]*?)<\/a>/gi;
  let matched = regex.exec(String(rawHtml || ""));
  while (matched) {
    const line = safeNormalize(safeStripTags(matched[1] || ""));
    if (line) lines.push(line);
    matched = regex.exec(String(rawHtml || ""));
  }

  if (lines.length < 2) return "";
  return lines.join(String(lineBreakToken || "\n"));
}

function normalizeImgurLinksInJsonText(rawJsonText) {
  return String(rawJsonText || "").replace(
    /https:\/\/(?:www\.)?imgur\.com\//gi,
    "https://i.imgur.com/"
  );
}

function resolveMessageId(message, index) {
  const direct = String(message?.id || "").trim();
  if (direct) return direct;
  return String((Number(index) || 0) + 1);
}

function collectJsonExportMessages(root) {
  if (!root || typeof root.querySelectorAll !== "function") return [];
  const view =
    root.defaultView ||
    (root.ownerDocument && root.ownerDocument.defaultView) ||
    (typeof window !== "undefined" ? window : null);
  return Array.from(root.querySelectorAll("div.message")).filter((messageEl) => {
    const inlineDisplay = String(messageEl?.style?.display || "")
      .trim()
      .toLowerCase();
    if (inlineDisplay === "none") return false;

    if (view && typeof view.getComputedStyle === "function") {
      const computedDisplay = String(view.getComputedStyle(messageEl)?.display || "")
        .trim()
        .toLowerCase();
      if (computedDisplay === "none") return false;
    }

    return true;
  });
}

function formatTimestampToKoreanMeridiem(rawTimestamp) {
  const normalized = normalizeMessageText(rawTimestamp);
  if (!normalized) return "";

  const alreadyKorean = normalized.match(/^(오전|오후)\s*(\d{1,2}):(\d{2})$/);
  if (alreadyKorean) return `${alreadyKorean[1]} ${alreadyKorean[2]}:${alreadyKorean[3]}`;

  const ampmMatch = normalized.match(/(\d{1,2}):(\d{2})\s*(AM|PM)\b/i);
  if (!ampmMatch) return normalized;

  const hour = Number(ampmMatch[1]);
  const minute = ampmMatch[2];
  if (!Number.isFinite(hour) || hour < 1 || hour > 12) return normalized;
  const meridiem = String(ampmMatch[3] || "").toUpperCase() === "AM" ? "오전" : "오후";
  return `${meridiem} ${hour}:${minute}`;
}

function formatTextColor(rawColor) {
  const value = String(rawColor || "").trim();
  if (!value) return "";
  const normalized = value.replace(/;+\s*$/g, "").trim();
  if (!normalized) return "";

  const colorValue = normalized.replace(/^color\s*:\s*/i, "").trim();
  if (!colorValue) return "";

  const hexMatch = colorValue.match(/^#([\da-f]{3}|[\da-f]{6})$/i);
  if (hexMatch?.[1]) {
    const hex = String(hexMatch[1]).toLowerCase();
    if (hex.length === 3) {
      return `#${hex
        .split("")
        .map((char) => `${char}${char}`)
        .join("")}`;
    }
    return `#${hex}`;
  }

  return colorValue;
}

function buildSpeakerImages(speakerImageUrl) {
  const url = String(speakerImageUrl || "").trim();
  if (!url) return undefined;
  return {
    avatar: {
      url,
    },
  };
}

function canonicalizeDiceTemplateName(template) {
  const value = String(template || "").trim();
  if (!value) return "";
  if (value.toLowerCase() === "coc-init-stc") return "coc-dice";
  return value;
}

function canonicalizeDicePayload(dice) {
  if (!dice || typeof dice !== "object") return dice;
  const template = canonicalizeDiceTemplateName(dice.template);
  if (!template || template === dice.template) return dice;
  return {
    ...dice,
    template,
  };
}

function omitNullishDeep(value) {
  if (value == null) return undefined;

  if (Array.isArray(value)) {
    return value
      .map((item) => omitNullishDeep(item))
      .filter((item) => item !== undefined);
  }

  if (typeof value === "object") {
    const result = {};
    Object.entries(value).forEach(([key, val]) => {
      const cleaned = omitNullishDeep(val);
      if (cleaned !== undefined) result[key] = cleaned;
    });
    return result;
  }

  return value;
}

function removeLegacyVersionFieldDeep(value) {
  if (value == null) return value;
  if (Array.isArray(value)) {
    return value.map((item) => removeLegacyVersionFieldDeep(item));
  }
  if (typeof value === "object") {
    const result = {};
    Object.entries(value).forEach(([key, val]) => {
      if (key === "v") return;
      result[key] = removeLegacyVersionFieldDeep(val);
    });
    return result;
  }
  return value;
}

function inferRuleTypeFromLines(lines) {
  const list = Array.isArray(lines) ? lines : [];
  for (const line of list) {
    const rule = String(line?.input?.dice?.rule || "")
      .trim()
      .toLowerCase();
    if (!rule) continue;
    if (rule.includes("insane")) return "Insane";
    if (rule.includes("coc")) return "COC";
  }
  return "";
}

function buildChatJsonDocument({ scenarioTitle = "", lines = [] } = {}) {
  return {
    schemaVersion: 1,
    ebookView: {
      titlePage: {
        scenarioTitle: String(scenarioTitle || ""),
        ruleType: inferRuleTypeFromLines(lines),
        gm: "",
        pl: "",
        writer: "",
        copyright: "",
        identifier: "",
        extraMetaItems: [],
      },
    },
    lines: Array.isArray(lines) ? lines : [],
  };
}

function buildChatJsonEntry({
  id,
  speaker,
  role = "character",
  text,
  timestamp = "",
  textColor = "",
  imageUrl = null,
  speakerImageUrl = null,
  dice = null,
}) {
  const safeTextBuilder =
    typeof parserUtils.toSafeText === "function"
      ? parserUtils.toSafeText
      : (raw) =>
          String(raw || "")
            .replace(/[^\p{L}\p{N}\s!?.,~]/gu, "")
            .replace(/\s+/g, " ")
            .trim();
  const normalizedText = String(text || "");
  const rawInput = {};
  if (imageUrl != null) rawInput.imageUrl = String(imageUrl);
  const speakerImages = buildSpeakerImages(speakerImageUrl);
  if (speakerImages) rawInput.speakerImages = speakerImages;
  if (dice && typeof dice === "object") {
    rawInput.dice = removeLegacyVersionFieldDeep(canonicalizeDicePayload(dice));
  }
  const input = omitNullishDeep(rawInput) || {};
  const entry = {
    id: String(id || ""),
    speaker: String(speaker || ""),
    role: String(role || "character"),
    timestamp: formatTimestampToKoreanMeridiem(timestamp),
    textColor: formatTextColor(textColor),
    text: normalizedText,
    safetext: safeTextBuilder(normalizedText),
    input,
  };

  return omitNullishDeep(entry);
}

module.exports = {
  parseRoll20DicePayload,
  isHiddenMessagePlaceholderText,
  normalizeMessageText,
  joinDescAnchorLines,
  normalizeImgurLinksInJsonText,
  resolveMessageId,
  collectJsonExportMessages,
  buildChatJsonDocument,
  buildChatJsonEntry,
};

},
"exporter/avatar_resolution_context.js": function(module, exports, require) {
function toText(value) {
  return String(value || "").trim();
}

function toOptionalAbsoluteUrl(value, toAbsoluteUrl) {
  const raw = toText(value);
  if (!raw) return "";
  return toAbsoluteUrl(raw);
}

function isAllowedImageUrl(url) {
  const value = toText(url);
  return /^(https?:\/\/|data:image\/)/i.test(value);
}

function createEmptyMaps() {
  return {
    byVariant: new Map(),
    byPair: new Map(),
    byOriginal: new Map(),
  };
}

function buildReplacementMaps(replacements, deps = {}) {
  const toAbsoluteUrl =
    typeof deps.toAbsoluteUrl === "function" ? deps.toAbsoluteUrl : (value) => toText(value);
  const normalizeSpeakerName =
    typeof deps.normalizeSpeakerName === "function"
      ? deps.normalizeSpeakerName
      : (value) => toText(value);

  const byVariant = new Map();
  const byPair = new Map();
  const byOriginal = new Map();
  const items = Array.isArray(replacements) ? replacements : [];

  items.forEach((item) => {
    const name = normalizeSpeakerName(item?.name || "");
    const originalUrl = toOptionalAbsoluteUrl(item?.originalUrl || "", toAbsoluteUrl);
    const avatarUrl = toOptionalAbsoluteUrl(item?.avatarUrl || "", toAbsoluteUrl);
    const newUrl = toText(item?.newUrl || "");
    if (!name || !originalUrl || !newUrl || !isAllowedImageUrl(newUrl)) return;

    const variantKey = `${name}|||${originalUrl}|||${avatarUrl}`;
    const pairKey = `${name}|||${originalUrl}`;

    if (avatarUrl) {
      byVariant.set(variantKey, newUrl);
    }
    byPair.set(pairKey, newUrl);
    if (!byOriginal.has(originalUrl)) {
      byOriginal.set(originalUrl, newUrl);
    }
  });

  return { byVariant, byPair, byOriginal };
}

function findReplacementForMessage(message, maps, deps = {}) {
  const toAbsoluteUrl =
    typeof deps.toAbsoluteUrl === "function" ? deps.toAbsoluteUrl : (value) => toText(value);
  const normalizeSpeakerName =
    typeof deps.normalizeSpeakerName === "function"
      ? deps.normalizeSpeakerName
      : (value) => toText(value);

  const name = normalizeSpeakerName(message?.name || "");
  const currentSrc = toOptionalAbsoluteUrl(message?.currentSrc || "", toAbsoluteUrl);
  const currentAvatarUrl = toOptionalAbsoluteUrl(message?.currentAvatarUrl || "", toAbsoluteUrl);
  if (!name || !currentSrc) return "";

  const byVariant = maps?.byVariant instanceof Map ? maps.byVariant : new Map();
  const byPair = maps?.byPair instanceof Map ? maps.byPair : new Map();
  const byOriginal = maps?.byOriginal instanceof Map ? maps.byOriginal : new Map();

  const variantKey = `${name}|||${currentSrc}|||${currentAvatarUrl}`;
  const pairKey = `${name}|||${currentSrc}`;

  if (currentAvatarUrl && byVariant.has(variantKey)) return byVariant.get(variantKey) || "";
  if (byPair.has(pairKey)) return byPair.get(pairKey) || "";
  return byOriginal.get(currentSrc) || "";
}

function createAvatarExportResolutionContext(
  { avatarMappings = [], replacements = [] } = {},
  {
    toAbsoluteUrl = (value) => toText(value),
    normalizeSpeakerName = (value) => toText(value),
    buildMaps = buildReplacementMaps,
  } = {}
) {
  if (typeof buildMaps !== "function") {
    return {
      baseMaps: createEmptyMaps(),
      overrideMaps: createEmptyMaps(),
    };
  }

  const baseReplacements = (Array.isArray(avatarMappings) ? avatarMappings : []).map((item) => ({
    name: item?.name || "",
    originalUrl: item?.originalUrl || "",
    avatarUrl: item?.avatarUrl || "",
    newUrl: item?.avatarUrl || "",
  }));

  return {
    baseMaps: buildMaps(baseReplacements, {
      toAbsoluteUrl,
      normalizeSpeakerName,
    }),
    overrideMaps: buildMaps(Array.isArray(replacements) ? replacements : [], {
      toAbsoluteUrl,
      normalizeSpeakerName,
    }),
  };
}

function resolveAvatarExportUrl(
  message,
  context,
  {
    toAbsoluteUrl = (value) => toText(value),
    normalizeSpeakerName = (value) => toText(value),
    findReplacement = findReplacementForMessage,
  } = {}
) {
  const fallbackUrl =
    toOptionalAbsoluteUrl(message?.currentAvatarUrl || "", toAbsoluteUrl) ||
    toOptionalAbsoluteUrl(message?.currentSrc || "", toAbsoluteUrl);
  if (typeof findReplacement !== "function") return fallbackUrl;

  const overrideUrl = findReplacement(
    message,
    context?.overrideMaps || createEmptyMaps(),
    { toAbsoluteUrl, normalizeSpeakerName }
  );
  if (overrideUrl) return overrideUrl;

  const baseUrl = findReplacement(
    message,
    context?.baseMaps || createEmptyMaps(),
    { toAbsoluteUrl, normalizeSpeakerName }
  );
  return baseUrl || fallbackUrl;
}

module.exports = {
  createEmptyMaps,
  buildReplacementMaps,
  findReplacementForMessage,
  createAvatarExportResolutionContext,
  resolveAvatarExportUrl,
};

},
"exporter/message_snapshot_builder.js": function(module, exports, require) {
const parserUtils = require("parsers/parser_utils.js");

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

},
"exporter/export_document_builder.js": function(module, exports, require) {
const chatJson = require("chat_json_export.js");

function buildExportDocument({ scenarioTitle = "", snapshots = [], compact = true } = {}) {
  const lines = (Array.isArray(snapshots) ? snapshots : []).map((snapshot) =>
    chatJson.buildChatJsonEntry({
      id: snapshot?.id,
      speaker: snapshot?.speaker,
      role: snapshot?.role,
      timestamp: snapshot?.timestamp,
      textColor: snapshot?.textColor,
      text: snapshot?.text,
      imageUrl: snapshot?.imageUrl,
      speakerImageUrl: snapshot?.speakerImageUrl,
      dice: snapshot?.dice,
    })
  );

  const documentPayload = chatJson.buildChatJsonDocument({
    scenarioTitle,
    lines,
  });
  const rawJsonText = compact
    ? JSON.stringify(documentPayload)
    : JSON.stringify(documentPayload, null, 2);
  const jsonText =
    typeof chatJson.normalizeImgurLinksInJsonText === "function"
      ? chatJson.normalizeImgurLinksInJsonText(rawJsonText)
      : rawJsonText;
  const jsonByteLength =
    typeof TextEncoder === "function"
      ? new TextEncoder().encode(jsonText).length
      : Buffer.byteLength(jsonText, "utf8");

  return {
    documentPayload,
    jsonText,
    jsonByteLength,
    lineCount: lines.length,
    ruleType: String(documentPayload?.ebookView?.titlePage?.ruleType || ""),
  };
}

module.exports = {
  buildExportDocument,
};

}
  };
  const cache = {};

  function require(moduleId) {
    if (cache[moduleId]) return cache[moduleId].exports;
    const factory = modules[moduleId];
    if (!factory) {
      throw new Error("Unknown shared-core module: " + moduleId);
    }
    const module = { exports: {} };
    cache[moduleId] = module;
    factory(module, module.exports, require);
    return module.exports;
  }

  const core = require("index.js");
  if (typeof window !== "undefined") {
    window.Roll20JsonCore = Object.assign({}, window.Roll20JsonCore, core.browserContract || core);
  }
})();
