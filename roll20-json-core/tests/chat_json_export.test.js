const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildChatJsonDocument,
  buildChatJsonEntry,
  parseRoll20DicePayload,
} = require("../src/chat_json_export.js");

test("buildChatJsonDocument sets schemaVersion to 1", () => {
  const doc = buildChatJsonDocument({ scenarioTitle: "테스트", lines: [] });
  assert.equal(doc.schemaVersion, 1);
  assert.equal(doc.ebookView.titlePage.scenarioTitle, "테스트");
  assert.deepEqual(doc.lines, []);
});

test("buildChatJsonEntry normalizes text and color", () => {
  const entry = buildChatJsonEntry({
    id: "1",
    speaker: "홍길동",
    text: " 안녕   하세요 ",
    textColor: "#ffffff",
  });

  assert.equal(entry.id, "1");
  assert.equal(entry.speaker, "홍길동");
  assert.equal(entry.text, " 안녕   하세요 ");
  assert.equal(entry.safetext, "안녕 하세요");
  assert.equal(entry.textColor, "#ffffff");
});

test("parseRoll20DicePayload converts type-coc-attack-1 markup to a single-roll attack card", () => {
  const html = `
    <div class="message general you" data-messageid="-P-9ZYlZDDWNxIGNb6hG">
      <div class="sheet-rolltemplate-type-coc-attack-1">
        <table>
          <caption>검격</caption>
          <tbody>
            <tr>
              <td class="sheet-template_label" data-i18n="value">기준치:</td>
              <td class="sheet-template_value">
                <span class="inlinerollresult" title="Rolling 80 = 80">80</span>/
                <span class="inlinerollresult" title="Rolling floor(80/2) = floor(80/2)">40</span>/
                <span class="inlinerollresult" title="Rolling floor(80/5) = floor(80/5)">16</span>
              </td>
            </tr>
            <tr>
              <td class="sheet-template_label" data-i18n="rolled">굴림:</td>
              <td class="sheet-template_value">
                <span class="inlinerollresult" title="Rolling 1d100cs1cf100">25</span>
              </td>
            </tr>
            <tr>
              <td class="sheet-template_label" data-i18n="result">판정결과:</td>
              <td class="sheet-template_value" data-i18n="hard">어려운 성공</td>
            </tr>
            <tr>
              <td class="sheet-template_label" data-i18n="dam">피해:</td>
              <td class="sheet-template_value">
                <span class="inlinerollresult fullcrit" title="Rolling 2D6+1d4">12</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `;

  assert.deepEqual(parseRoll20DicePayload({ role: "dice", html }), {
    source: "roll20",
    rule: "coc7",
    template: "coc-attack",
    inputs: {
      skill: "검격",
      target: 80,
      rolls: [25],
      damage: 12,
    },
  });
});

test("parseRoll20DicePayload converts type-coc-attack markup to a bonus-penalty attack card", () => {
  const html = `
    <div class="message general" data-messageid="-P-9bWHvoV68n3FDTef0">
      <div class="sheet-rolltemplate-type-coc-attack">
        <table>
          <caption>타신편</caption>
          <tbody>
            <tr>
              <td class="sheet-template_label" data-i18n="value">기준치:</td>
              <td class="sheet-template_value">
                <span class="inlinerollresult">55</span>/
                <span class="inlinerollresult">27</span>/
                <span class="inlinerollresult">11</span>
              </td>
            </tr>
            <tr>
              <td class="sheet-template_label" data-i18n="rolled">굴림:</td>
              <td class="sheet-template_value">
                <span class="inlinerollresult">79</span>,
                <span class="inlinerollresult">16</span>,
                <span class="inlinerollresult">15</span>
              </td>
            </tr>
            <tr>
              <td class="sheet-template_label">+2:</td>
              <td class="sheet-template_value" data-i18n="hard">어려운 성공</td>
            </tr>
            <tr>
              <td class="sheet-template_label" data-i18n="dam">피해:</td>
              <td class="sheet-template_value">
                <span class="inlinerollresult importantroll">8</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `;

  assert.deepEqual(parseRoll20DicePayload({ role: "dice", html }), {
    source: "roll20",
    rule: "coc7",
    template: "coc-attack-bonus-penalty",
    inputs: {
      skill: "타신편",
      target: 55,
      rolls: [79, 16, 15],
      damage: 8,
    },
  });
});

test("parseRoll20DicePayload supports existing and type-prefixed coc attack bonus aliases", () => {
  for (const template of ["coc-attack-bonus", "type-coc-attack-bonus"]) {
    const html = `
      <div class="sheet-rolltemplate-${template}">
        <table>
          <caption>타신편</caption>
          <tr>
            <td class="sheet-template_label">기준치:</td>
            <td class="sheet-template_value">55/27/11</td>
          </tr>
          <tr>
            <td class="sheet-template_label">굴림:</td>
            <td class="sheet-template_value">83, 56, 86</td>
          </tr>
          <tr>
            <td class="sheet-template_label">피해:</td>
            <td class="sheet-template_value">9</td>
          </tr>
        </table>
      </div>
    `;

    assert.deepEqual(parseRoll20DicePayload({ role: "dice", html }), {
      source: "roll20",
      rule: "coc7",
      template: "coc-attack-bonus-penalty",
      inputs: {
        skill: "타신편",
        target: 55,
        rolls: [83, 56, 86],
        damage: 9,
      },
    });
  }
});

test("parseRoll20DicePayload does not reinterpret unrelated type-prefixed templates", () => {
  const html = `
    <div class="sheet-rolltemplate-type-default">
      <table>
        <caption>Custom Type</caption>
        <tr><td>Key</td><td>Value</td></tr>
      </table>
    </div>
  `;

  assert.equal(parseRoll20DicePayload({ role: "character", html }), null);
});

test("parseRoll20DicePayload supports type-prefixed coc-1 templates without swapping target and roll", () => {
  for (const template of ["type-coc-1", "type-coc-default"]) {
    const html = `
      <div class="sheet-rolltemplate-${template}">
        <table>
          <caption>관찰력</caption>
          <tr>
            <td class="sheet-template_label" data-i18n="value">기준치:</td>
            <td class="sheet-template_value">65/32/13</td>
          </tr>
          <tr>
            <td class="sheet-template_label" data-i18n="rolled">굴림:</td>
            <td class="sheet-template_value">23</td>
          </tr>
          <tr>
            <td class="sheet-template_label" data-i18n="result">판정결과:</td>
            <td class="sheet-template_value">어려운 성공</td>
          </tr>
        </table>
      </div>
    `;

    assert.deepEqual(parseRoll20DicePayload({ role: "dice", html }), {
      source: "roll20",
      rule: "coc7",
      template: "coc",
      inputs: {
        skill: "관찰력",
        roll: 23,
        target: 65,
      },
    });
  }
});

test("parseRoll20DicePayload separates bonus-penalty targets from rolls for existing templates", () => {
  for (const template of ["coc", "coc-bonus-penalty"]) {
    const html = `
      <div class="sheet-rolltemplate-${template}">
        <table>
          <caption>듣기</caption>
          <tr>
            <td class="sheet-template_label" data-i18n="value">기준치:</td>
            <td class="sheet-template_value">55/27/11</td>
          </tr>
          <tr>
            <td class="sheet-template_label" data-i18n="rolled">굴림:</td>
            <td class="sheet-template_value">79, 16, 15</td>
          </tr>
        </table>
      </div>
    `;

    assert.deepEqual(parseRoll20DicePayload({ role: "dice", html }), {
      source: "roll20",
      rule: "coc7",
      template: "coc-bonus-penalty",
      inputs: {
        skill: "듣기",
        target: 55,
        rolls: [79, 16, 15],
      },
    });
  }
});

test("parseRoll20DicePayload supports type-prefixed coc bonus-penalty templates", () => {
  for (const template of ["type-coc", "type-coc-bonus", "type-coc-bonus-penalty"]) {
    const html = `
      <div class="sheet-rolltemplate-${template}">
        <table>
          <caption>듣기</caption>
          <tr>
            <td class="sheet-template_label" data-i18n="value">기준치:</td>
            <td class="sheet-template_value">55/27/11</td>
          </tr>
          <tr>
            <td class="sheet-template_label" data-i18n="rolled">굴림:</td>
            <td class="sheet-template_value">79, 16, 15</td>
          </tr>
        </table>
      </div>
    `;

    assert.deepEqual(parseRoll20DicePayload({ role: "dice", html }), {
      source: "roll20",
      rule: "coc7",
      template: "coc-bonus-penalty",
      inputs: {
        skill: "듣기",
        target: 55,
        rolls: [79, 16, 15],
      },
    });
  }
});
