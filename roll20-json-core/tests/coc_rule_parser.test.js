const test = require("node:test");
const assert = require("node:assert/strict");

const { parseCocRulePayload } = require("../src/parsers/coc_rule_parser.js");

test("legacy coc-1 input is accepted and exported as coc", () => {
  const html = `
    <div class="sheet-rolltemplate-coc-1">
      <table>
        <caption>Spot Hidden Roll</caption>
        <tr><td class="sheet-template_value">55</td></tr>
        <tr><td class="sheet-template_value">67</td></tr>
      </table>
    </div>
  `;

  const parsed = parseCocRulePayload({ html, template: "coc-1" });
  assert.equal(parsed?.template, "coc");
  assert.equal(parsed?.inputs?.target, 55);
  assert.equal(parsed?.inputs?.roll, 67);
  assert.ok(!("success" in (parsed?.inputs || {})));
});

test("legacy coc-1 threshold input is accepted and exported as coc", () => {
  const html = `
    <div class="sheet-rolltemplate-coc-1">
      <table>
        <caption>운</caption>
        <tbody>
          <tr>
            <td class="sheet-template_label" data-i18n="value">기준치:</td>
            <td class="sheet-template_value">
              <span class="inlinerollresult showtip tipsy-n-right" title="Rolling 0 = 0">0</span>/
              <span class="inlinerollresult showtip tipsy-n-right" title="Rolling floor(0/2) = floor(0/2)">0</span>/
              <span class="inlinerollresult showtip tipsy-n-right" original-title="Rolling floor(0/5) = floor(0/5)">0</span>
            </td>
          </tr>
          <tr>
            <td class="sheet-template_label" data-i18n="rolled">굴림:</td>
            <td class="sheet-template_value">
              <span class="inlinerollresult showtip tipsy-n-right" original-title="Rolling 1d100cs1cf100 = (&lt;span class=&quot;basicdiceroll&quot;&gt;68&lt;/span&gt;)">68</span>
            </td>
          </tr>
          <tr style="background: #bebebe">
            <td class="sheet-template_label" data-i18n="result">판정결과:</td>
            <td style="background: crimson" class="sheet-template_value" data-i18n="fail">실패</td>
          </tr>
        </tbody>
      </table>
    </div>
  `;

  const parsed = parseCocRulePayload({ html, template: "coc-1" });
  assert.deepEqual(parsed, {
    source: "roll20",
    rule: "coc7",
    template: "coc",
    inputs: {
      skill: "운",
      roll: 68,
      target: 0,
    },
  });
});

test("legacy coc-attack input is accepted and exported as coc-attack-bonus-penalty", () => {
  const html = `
    <div class="sheet-rolltemplate-coc-attack">
      <table>
        <caption>Rifle</caption>
        <tr>
          <td class="sheet-template_label">기준치</td>
          <td class="sheet-template_value">60</td>
        </tr>
        <tr>
          <td class="sheet-template_label">굴림</td>
          <td class="sheet-template_value">23</td>
        </tr>
        <tr>
          <td class="sheet-template_label">피해</td>
          <td class="sheet-template_value">8</td>
        </tr>
      </table>
    </div>
  `;

  const parsed = parseCocRulePayload({ html, template: "coc-attack" });
  assert.equal(parsed?.template, "coc-attack-bonus-penalty");
  assert.equal(parsed?.inputs?.target, 60);
  assert.deepEqual(parsed?.inputs?.rolls, [23]);
  assert.equal(parsed?.inputs?.damage, 8);
});

test("legacy coc input is accepted and exported as coc-bonus-penalty", () => {
  const html = `
    <div class="sheet-rolltemplate-coc">
      <table>
        <caption>Listen</caption>
        <tr>
          <td class="sheet-template_label">굴림</td>
          <td class="sheet-template_value">42 / 88</td>
        </tr>
      </table>
    </div>
  `;

  const parsed = parseCocRulePayload({ html, template: "coc" });
  assert.equal(parsed?.template, "coc-bonus-penalty");
  assert.equal(parsed?.inputs?.target, 42);
  assert.deepEqual(parsed?.inputs?.rolls, [42, 88]);
});

test("coc-bonus payload uses inputs.target", () => {
  const html = `
    <div class="sheet-rolltemplate-coc-bonus">
      <table>
        <caption>Dodge</caption>
        <tr>
          <td class="sheet-template_label">기준치</td>
          <td class="sheet-template_value">45</td>
        </tr>
        <tr>
          <td class="sheet-template_label">굴림</td>
          <td class="sheet-template_value">11 / 74</td>
        </tr>
      </table>
    </div>
  `;

  const parsed = parseCocRulePayload({ html, template: "coc-bonus" });
  assert.equal(parsed?.template, "coc-bonus-penalty");
  assert.equal(parsed?.inputs?.target, 45);
  assert.deepEqual(parsed?.inputs?.rolls, [11, 74]);
});

test("legacy coc row templates are accepted and exported with renamed output template values", () => {
  const diceHtml = `
    <div class="sheet-rolltemplate-coc-dice-roll">
      <table>
        <caption>Dice Roll</caption>
        <tr>
          <td class="sheet-template_label">굴림</td>
          <td class="sheet-template_value">12</td>
        </tr>
      </table>
    </div>
  `;
  const bodyHitHtml = `
    <div class="sheet-rolltemplate-coc-body-hit-loc">
      <table>
        <caption>Body Hit</caption>
        <tr>
          <td class="sheet-template_label">부위</td>
          <td class="sheet-template_value">왼팔</td>
        </tr>
      </table>
    </div>
  `;

  assert.equal(
    parseCocRulePayload({ html: diceHtml, template: "coc-dice-roll" })?.template,
    "coc-dice"
  );
  assert.equal(
    parseCocRulePayload({ html: bodyHitHtml, template: "coc-body-hit-loc" })?.template,
    "coc-body-hit"
  );
});

test("legacy coc madness templates are accepted and exported with renamed output template values", () => {
  const realtimeHtml = `
    <div class="sheet-rolltemplate-coc-bomadness-rt">
      <table>
        <caption>Bout Of Madness: Realtime</caption>
        <tr><td class="sheet-template_value">Reactive Action:</td></tr>
        <tr><td class="sheet-template_value">Keep running</td></tr>
      </table>
    </div>
  `;
  const summaryHtml = `
    <div class="sheet-rolltemplate-coc-bomadness-summ">
      <table>
        <caption>Bout Of Madness: Summary</caption>
        <tr><td class="sheet-template_value">Reactive Action:</td></tr>
        <tr><td class="sheet-template_value">Keep running</td></tr>
      </table>
    </div>
  `;

  assert.equal(
    parseCocRulePayload({ html: realtimeHtml, template: "coc-bomadness-rt" })?.template,
    "coc-madness-realtime"
  );
  assert.equal(
    parseCocRulePayload({ html: summaryHtml, template: "coc-bomadness-summ" })?.template,
    "coc-madness-summary"
  );
});

test("legacy coc-init-stc input is accepted and exported as coc-dice", () => {
  const html = `
    <div class="sheet-rolltemplate-coc-init-stc">
      <table>
        <caption>Initiative</caption>
        <tr>
          <td class="sheet-template_label">굴림</td>
          <td class="sheet-template_value">DEX 75</td>
        </tr>
      </table>
    </div>
  `;

  const parsed = parseCocRulePayload({ html, template: "coc-init-stc" });
  assert.deepEqual(parsed, {
    source: "roll20",
    rule: "coc7",
    template: "coc-dice",
    inputs: {
      title: "Initiative",
      rows: [{ label: "굴림: DEX 75" }],
    },
  });
});

test("legacy coc-attack-1 input is accepted and exported as coc-attack", () => {
  const html = `
    <div class="sheet-rolltemplate-coc-attack-1">
      <table>
        <caption>Knife</caption>
        <tr>
          <td class="sheet-template_label">기준치</td>
          <td class="sheet-template_value">50</td>
        </tr>
        <tr>
          <td class="sheet-template_label">피해</td>
          <td class="sheet-template_value">6</td>
        </tr>
      </table>
    </div>
  `;

  const parsed = parseCocRulePayload({ html, template: "coc-attack-1" });
  assert.equal(parsed?.template, "coc-attack");
  assert.equal(parsed?.inputs?.target, 50);
  assert.deepEqual(parsed?.inputs?.rolls, [50]);
  assert.equal(parsed?.inputs?.damage, 6);
});

test("coc-attack-1 rejects an invalid rendered roll instead of substituting the target", () => {
  const html = `
    <div class="sheet-rolltemplate-coc-attack-1">
      <table>
        <caption>Knife</caption>
        <tr>
          <td class="sheet-template_label">기준치</td>
          <td class="sheet-template_value">50</td>
        </tr>
        <tr>
          <td class="sheet-template_label">굴림</td>
          <td class="sheet-template_value">—</td>
        </tr>
        <tr>
          <td class="sheet-template_label">피해</td>
          <td class="sheet-template_value">6</td>
        </tr>
      </table>
    </div>
  `;

  assert.equal(parseCocRulePayload({ html, template: "coc-attack-1" }), null);
});

test("coc bonus-penalty rejects an invalid threshold row instead of substituting a roll", () => {
  const html = `
    <div class="sheet-rolltemplate-coc-bonus-penalty">
      <table>
        <caption>Listen</caption>
        <tr>
          <td class="sheet-template_label">기준치</td>
          <td class="sheet-template_value">—</td>
        </tr>
        <tr>
          <td class="sheet-template_label">굴림</td>
          <td class="sheet-template_value">23 / 74</td>
        </tr>
      </table>
    </div>
  `;

  assert.equal(parseCocRulePayload({ html, template: "coc-bonus-penalty" }), null);
});
