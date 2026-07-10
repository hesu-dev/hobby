const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const popupHtml = fs.readFileSync(path.join(__dirname, "..", "popup.html"), "utf8");
const popupJs = fs.readFileSync(path.join(__dirname, "..", "js", "popup", "popup.js"), "utf8");
const manifest = require("../manifest.json");
const livePopupHtml = popupHtml.replace(/<!--[\s\S]*?-->/g, "");

test("popup exposes ReadingLog and sheet tabs while the macro tab is disabled", () => {
  assert.match(
    livePopupHtml,
    /<nav class="tabs" role="tablist" aria-label="popup sections">[\s\S]*?<button[\s\S]*?id="readingLogTab"[\s\S]*?>\s*리딩로그\s*<\/button>[\s\S]*?<button[\s\S]*?id="sheetTab"[\s\S]*?>\s*r20시트\s*<\/button>[\s\S]*?<\/nav>/
  );
  assert.match(
    livePopupHtml,
    /<section id="readingLogTabPanel"[\s\S]*?<section id="sheetTabPanel"[\s\S]*?<div id="feedbackPanel"/
  );
  assert.doesNotMatch(livePopupHtml, /id="macroTab"/);
  assert.doesNotMatch(livePopupHtml, /id="macroTabPanel"/);
  assert.match(popupHtml, /<!--[\s\S]*id="macroTab"[\s\S]*-->/);
  assert.match(popupHtml, /<!--[\s\S]*id="macroTabPanel"[\s\S]*-->/);
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

test("popup keeps the macro import tab commented out until the feature is re-enabled", () => {
  assert.doesNotMatch(livePopupHtml, /macroImportPanel/);
  assert.doesNotMatch(livePopupHtml, /macroImportPayload/);
  assert.doesNotMatch(livePopupHtml, /applyMacroImport/);
  assert.match(popupHtml, /<!--[\s\S]*macroImportPanel[\s\S]*-->/);
  assert.match(popupHtml, /<!--[\s\S]*applyMacroImport[\s\S]*-->/);
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

test("chrome manifest version is bumped to 0.8.4", () => {
  assert.equal(manifest.version, "0.8.4");
});
