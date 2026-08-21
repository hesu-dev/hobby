const parserUtils = require("./parser_utils.js");

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

function canonicalizeCocTemplateName(template) {
  const normalized = String(template || "").toLowerCase();
  const withoutTypePrefix = normalized.replace(/^type-(?=coc(?:-|$))/, "");
  if (withoutTypePrefix === "coc-attack-bonus") {
    return "coc-attack-bonus-penalty";
  }
  return withoutTypePrefix;
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
  const rollRow = rows.find((row) => /굴림|rolled/i.test(String(row.label || "")));
  const damageRow = rows.find((row) => /피해|dam/i.test(String(row.label || "")));
  const target = extractFirstInteger(successRow?.value || "");
  const roll = extractFirstInteger(rollRow?.value || "");
  const damage = extractFirstInteger(damageRow?.value || "");

  if (
    !skill ||
    !Number.isFinite(target) ||
    !Number.isFinite(damage) ||
    (rollRow && !Number.isFinite(roll))
  ) {
    return null;
  }
  return {
    source: "roll20",
    rule: "coc7",
    template: "coc-attack",
    inputs: { skill, target, rolls: [rollRow ? roll : target], damage },
  };
}

function parseCocPayload(html, template) {
  const {
    extractCaptionText,
    collectTemplateRowsWithCells,
    extractAllIntegers,
    extractFirstInteger,
  } = parserUtils;
  const normalizedTemplate = String(template || "").toLowerCase();
  const allowedTemplates = new Set(["coc", "coc-bonus-penalty"]);
  if (!allowedTemplates.has(normalizedTemplate)) return null;
  const safeHtml = String(html || "");
  const skill = extractCaptionText(safeHtml);
  const rows = collectTemplateRowsWithCells(safeHtml);
  const successRow = rows.find((row) => /기준치|value/i.test(String(row.label || "")));
  const rollRow = rows.find((row) => /굴림|rolled/i.test(String(row.label || "")));
  const rolls = extractAllIntegers(rollRow?.value || "");
  const target = successRow
    ? extractFirstInteger(successRow.value || "")
    : rolls[0] ?? null;
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
  const normalizedTemplate = canonicalizeCocTemplateName(template);
  if (normalizedTemplate === "coc" || normalizedTemplate === "coc-bonus-penalty") {
    return parseCocPayload(html, normalizedTemplate) || parseCoc1DicePayload(html, normalizedTemplate);
  }
  if (normalizedTemplate === "coc-1" || normalizedTemplate === "coc-default") {
    return parseCoc1DicePayload(html, normalizedTemplate);
  }
  if (normalizedTemplate === "coc-bonus") {
    return parseCocBonusPayload(html, normalizedTemplate);
  }
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
