const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const popupHtml = fs.readFileSync(path.join(__dirname, "..", "popup.html"), "utf8");
const popupJs = fs.readFileSync(path.join(__dirname, "..", "js", "popup", "popup.js"), "utf8");
const manifest = require("../manifest.json");
const livePopupHtml = popupHtml.replace(/<!--[\s\S]*?-->/g, "");

function loadFormatCocImportResult() {
  const source = popupJs.replace(
    /\ninitPopup\(\);\s*$/,
    "\nglobalThis.__formatCocImportResult = formatCocImportResult;\n"
  );
  assert.notEqual(source, popupJs, "popup initialization footer must remain replaceable in the test harness");

  const element = {};
  const context = {
    document: {
      getElementById() {
        return element;
      },
      querySelector() {
        return element;
      },
      querySelectorAll() {
        return [];
      },
    },
    window: {
      Roll20CleanerAvatarDownloadPlan: {},
      Roll20CleanerAvatarPreview: {},
      Roll20CleanerFilterApplyFeedback: {},
    },
  };
  vm.runInNewContext(source, context);
  return context.__formatCocImportResult;
}

const formatCocImportResult = loadFormatCocImportResult();

test("popup source exposes ReadingLog, sheet, and macro tabs", () => {
  assert.match(
    livePopupHtml,
    /<nav class="tabs" role="tablist" aria-label="popup sections">[\s\S]*?<button[\s\S]*?id="readingLogTab"[\s\S]*?>\s*리딩로그\s*<\/button>[\s\S]*?<button[\s\S]*?id="sheetTab"[\s\S]*?>\s*r20시트\s*<\/button>[\s\S]*?<button[\s\S]*?id="macroTab"[\s\S]*?>\s*매크로\s*<\/button>[\s\S]*?<\/nav>/
  );
  assert.match(
    livePopupHtml,
    /<section id="readingLogTabPanel"[\s\S]*?<section id="sheetTabPanel"[\s\S]*?<section id="macroTabPanel"[\s\S]*?<div id="feedbackPanel"/
  );
  assert.match(popupJs, /querySelectorAll\("\[role=\\"tab\\"\]"\)/);
});

test("popup exposes the renamed image-link check and shared ReadingLog download buttons", () => {
  assert.match(
    popupHtml,
    /<section id="readingLogTabPanel"[\s\S]*?<h1>Exporter Setting<\/h1>/
  );
  assert.match(
    popupHtml,
    /현재 한국어만 지원합니다, Roll20 채팅로그\(Show on One Page\)화면 에서 사용하세요\./
  );
  assert.match(popupHtml, /다운로드전 이미지 링크 확인/);
  assert.match(popupHtml, /ReadingLog 파일 다운로드/);
  assert.doesNotMatch(popupHtml, /프로필 이미지 교체/);
  assert.doesNotMatch(popupHtml, /Reading용 다운로드/);
  assert.doesNotMatch(
    popupHtml,
    /<button id="downloadAvatarMappedJson"[^>]*\bhidden\b/i
  );
  assert.match(
    popupHtml,
    /<section id="readingLogTabPanel"[\s\S]*?<button id="downloadAvatarMappedJson"[\s\S]*?ReadingLog 파일 다운로드[\s\S]*?<\/button>[\s\S]*?확장프로그램을 설치한 이후로는 상시 적용되는 사항이므로, 다운로드를 마치시면 OFF로 바꾸시길 권장합니다\.[\s\S]*?<section id="sheetTabPanel"/
  );
  assert.match(popupHtml, /js\/popup\/avatar_preview\.js/);
});

test("popup exposes the CoC import paste box in the sheet tab", () => {
  assert.match(
    livePopupHtml,
    /<section id="sheetTabPanel"[\s\S]*?<section id="cocImportPanel"[\s\S]*?<a[\s\S]*?id="sheetImportGuideLink"[\s\S]*?href="https:\/\/sukenell\.github\.io\/cclog_sheet\/"[\s\S]*?>\s*사용방법\s*<\/a>[\s\S]*?현재 한국어만 지원합니다, Roll20 캐릭터 시트를 켠 상태에서 사용하세요\.[\s\S]*?<button id="applyCocImport"[\s\S]*?캐릭터 시트 적용[\s\S]*?<div id="feedbackPanel"/
  );
  assert.match(livePopupHtml, /<textarea[\s\S]*?id="cocImportPayload"/);
  assert.match(livePopupHtml, /placeholder="비밀 주사위 복사로 복사한 내용을 이곳에 붙여넣기 하세요\."/);
  assert.doesNotMatch(livePopupHtml, /fillCocImportSample/);
  assert.doesNotMatch(livePopupHtml, /로즈 샘플 넣기/);
  assert.match(livePopupHtml, /<button id="applyCocImport"/);
  assert.doesNotMatch(popupJs, /로즈 테스트용 CoC import 샘플을 입력했습니다\./);
});

test("popup source enables the macro import panel for post-release development", () => {
  assert.match(livePopupHtml, /id="macroImportPanel"/);
  assert.match(livePopupHtml, /id="macroImportPayload"/);
  assert.match(livePopupHtml, /id="applyMacroImport"/);
});

test("popup keeps shared feedback visible", () => {
  assert.match(
    livePopupHtml,
    /<div id="feedbackPanel" class="feedback-panel">[\s\S]*?<div id="progressWrap"[\s\S]*?<small id="status"/
  );
  assert.match(popupJs, /const feedbackPanelEl = document\.getElementById\("feedbackPanel"\);/);
  assert.match(popupJs, /feedbackPanelEl\?\.classList\.remove\("hidden"\);/);
  assert.doesNotMatch(popupJs, /panelId === "macroTabPanel"/);
});

test("popup keeps the hidden message toggle label and helper text outside the toggle body", () => {
  assert.match(
    popupHtml,
    /<label class="toggle">\s*<input id="hiddenTextEnabled" type="checkbox" \/>\s*<span class="toggle-ui" aria-hidden="true"><\/span>\s*<span class="toggle-text">히든 메세지 감춤<\/span>\s*<\/label>\s*<span class="label">\(히든메세지 설정시, 'This message has been hidden\.' 이라는 메세지들이 감춰집니다\)<\/span>/
  );
  assert.doesNotMatch(
    popupHtml,
    /<label class="toggle">\s*<input id="hiddenTextEnabled" type="checkbox" \/>\s*<span class="toggle-ui" aria-hidden="true"><\/span>\s*<span class="toggle-text">히든 메세지 감춤<\/span>\s*<small>\('This message has been hidden\.' 이라는 메세지들이 감춰집니다\)<\/small>\s*<\/label>/
  );
});

test("chrome manifest version is bumped to 0.8.5", () => {
  assert.equal(manifest.version, "0.8.5");
});

test("popup reports the actual target and applied avatar for an avatar-only import", () => {
  const message = formatCocImportResult({
    ok: true,
    characterName: "앨리스",
    requested: { attributes: 0, abilities: 0, avatar: 1 },
    applied: {
      pageAttributes: 0,
      pageAbilities: 0,
      domAttributes: 0,
      pageAvatar: 1,
    },
  });

  assert.match(message, /앨리스 적용 완료/);
  assert.match(message, /Avatar 1\/1/);
});

test("popup reports a requested avatar that was not applied", () => {
  const message = formatCocImportResult({
    ok: true,
    characterName: "앨리스",
    requested: { attributes: 1, abilities: 0, avatar: 1 },
    applied: {
      pageAttributes: 1,
      pageAbilities: 0,
      domAttributes: 0,
      pageAvatar: 0,
    },
  });

  assert.match(message, /Avatar 0\/1/);
});

test("popup preserves attribute and ability wording when no avatar was requested", () => {
  const message = formatCocImportResult({
    ok: true,
    characterName: "앨리스",
    requested: { attributes: 2, abilities: 1 },
    applied: {
      pageAttributes: 1,
      pageAbilities: 1,
      domAttributes: 2,
    },
  });

  assert.equal(message, "앨리스 적용 완료: Attributes 2/2, Abilities 1/1.");
  assert.doesNotMatch(message, /Avatar/);
});

test("popup preserves CoC import failure details", () => {
  assert.equal(
    formatCocImportResult({
      ok: false,
      pageResult: { message: "Roll20 모델 적용 실패" },
      domResult: { message: "DOM 적용 실패" },
    }),
    "CoC 적용 실패: Roll20 모델 적용 실패"
  );
});

test("popup preserves the sheet reopen hint", () => {
  assert.equal(
    formatCocImportResult({
      ok: true,
      characterName: "앨리스",
      requested: { attributes: 1, abilities: 0 },
      applied: {
        pageAttributes: 1,
        pageAbilities: 0,
        domAttributes: 0,
      },
      sheetUi: { needsReopen: true },
    }),
    "앨리스 적용 완료: Attributes 1/1, Abilities 0/0. 열린 시트를 닫았다 다시 열면 변경사항이 보입니다."
  );
});
