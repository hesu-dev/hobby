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
