const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const popupHtml = fs.readFileSync(path.join(__dirname, "..", "popup.html"), "utf8");
const popupJs = fs.readFileSync(path.join(__dirname, "..", "js", "popup", "popup.js"), "utf8");
const manifest = require("../manifest.json");

test("popup exposes ReadingLog, sheet, and macro tabs before the panel content", () => {
  assert.match(
    popupHtml,
    /<nav class="tabs" role="tablist" aria-label="popup sections">[\s\S]*?<button[\s\S]*?id="readingLogTab"[\s\S]*?>\s*리딩로그\s*<\/button>[\s\S]*?<button[\s\S]*?id="sheetTab"[\s\S]*?>\s*시트\s*<\/button>[\s\S]*?<button[\s\S]*?id="macroTab"[\s\S]*?>\s*매크로\s*<\/button>[\s\S]*?<\/nav>/
  );
  assert.match(
    popupHtml,
    /<section id="readingLogTabPanel"[\s\S]*?<section id="sheetTabPanel"[\s\S]*?<section id="macroTabPanel"/
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
    popupHtml,
    /<section id="sheetTabPanel"[\s\S]*?<section id="cocImportPanel"[\s\S]*?CoC 공식 시트 import 붙여넣기[\s\S]*?<button id="fillCocImportSample"[\s\S]*?<button id="applyCocImport"[\s\S]*?<section id="macroTabPanel"/
  );
  assert.match(popupHtml, /<textarea[\s\S]*?id="cocImportPayload"/);
  assert.match(popupHtml, /<button id="fillCocImportSample"/);
  assert.match(popupHtml, /<button id="applyCocImport"/);
  assert.match(popupJs, /로즈 테스트용 CoC import 샘플을 입력했습니다\./);
});

test("popup keeps the macro tab panel empty until macro features exist", () => {
  assert.match(
    popupHtml,
    /<section id="macroTabPanel" class="tab-panel hidden" role="tabpanel" aria-labelledby="macroTab">\s*<\/section>/
  );
});

test("popup hides shared feedback while the macro tab is active", () => {
  assert.match(
    popupHtml,
    /<div id="feedbackPanel" class="feedback-panel">[\s\S]*?<div id="progressWrap"[\s\S]*?<small id="status"/
  );
  assert.match(popupJs, /const feedbackPanelEl = document\.getElementById\("feedbackPanel"\);/);
  assert.match(
    popupJs,
    /feedbackPanelEl\?\.classList\.toggle\("hidden", panelId === "macroTabPanel"\);/
  );
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

test("chrome manifest version is bumped to 0.8.3", () => {
  assert.equal(manifest.version, "0.8.3");
});
