import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const read = (path) => readFileSync(resolve(root, path), "utf8");
const main = read("frontend/src/main.ts");
const shell = read("frontend/src/pop-window/pop-window.ts");
const shellCss = read("frontend/src/pop-window/pop-window.css");
const typographyCss = [
  "frontend/src/styles.css",
  "frontend/src/debug/debug-page.css",
  "frontend/src/notice/notice.css",
  "frontend/src/pop-window/pop-window.css",
].map((path) => ({ path, source: read(path) }));
const moduleNames = ["prepare", "map-select", "player-select", "ban-select", "score", "result", "others"];
const modules = moduleNames.map((name) => ({ name, source: read(`frontend/src/pop-window/${name}.ts`) }));
const moduleSource = (name) => modules.find((module) => module.name === name)?.source ?? "";

assert.match(
  typographyCss[0].source,
  /--base-text-weight-light:\s*300;[\s\S]*--base-text-weight-normal:\s*400;[\s\S]*--base-text-weight-medium:\s*500;[\s\S]*--base-text-weight-semibold:\s*600;/,
  "frontend typography must use the four Primer weight tokens",
);
for (const { path, source } of typographyCss) {
  assert.doesNotMatch(source, /font-weight\s*:\s*\d+/, `${path} must not use arbitrary numeric font weights`);
}

for (const forbidden of [
  "renderCountdownProgress",
  "map-selector-overlay",
  "lineup-selector-overlay",
  "ban-selector-overlay",
  "score-selector-overlay",
  "selection-confirmation-overlay",
]) {
  assert.equal(main.includes(forbidden), false, `main.ts must not generate or reference phase pop-window structure: ${forbidden}`);
}

for (const { name, source } of modules) {
  for (const forbidden of ["<footer", "pop-window-overlay", "pop-window-panel", "data-pop-window-progress", "countdown-bar"]) {
    assert.equal(source.includes(forbidden), false, `${name}.ts must only render content, not shared structure: ${forbidden}`);
  }
  assert.match(source, /createPopWindowModule/, `${name}.ts must expose the shared PopWindowModule protocol`);
}

assert.equal(shell.includes("OtherWindowModule"), false, "OtherWindowModule must remain deleted");
assert.match(shell, /<footer class="pop-window-footer/, "the shared shell must own the footer");
assert.match(shell, /data-pop-window-action=/, "the shared shell must own pop-window action buttons");
assert.match(shell, /const hasCopy = Boolean\(content\.footerMessage \|\| content\.footerStatus\)/, "the shared shell must detect whether footer copy exists");
assert.match(shell, /const actionsMarkup = actions\.length \? `<div class="pop-window-footer-actions">/, "the shared shell must omit an empty action container");
assert.match(shell, /if \(!hasCopy\) \{[\s\S]*return `<div class="pop-window-inline-actions">/, "button-only windows must not render a footer");
assert.match(shellCss, /\.pop-window-action:not\(:disabled\)[\s\S]*background:\s*#238636 !important/, "enabled pop-window actions must use the shared green palette");
assert.match(shellCss, /\.pop-window-action:disabled[\s\S]*background:\s*#21262d !important/, "disabled pop-window actions must use the shared gray palette");
assert.match(shell, /data-pop-window-progress/, "the shared shell must own the progress DOM");
assert.match(shellCss, /--pop-window-header-surface:\s*#0d1117;[\s\S]*--pop-window-body-surface:\s*#161b22;[\s\S]*--pop-window-footer-surface:\s*#0d1117/, "the shared shell must own the pure-color surface palette");
for (const section of ["header", "body", "footer"]) {
  assert.match(shellCss, new RegExp(`\\.pop-window-panel > \\.pop-window-${section} \\{[\\s\\S]*?background:\\s*var\\(--pop-window-${section}-surface\\) !important`), `phase styles must not override the shared ${section} surface`);
}
assert.match(shellCss, /\.pop-window-footer-copy > strong[\s\S]*font-weight:\s*var\(--pop-window-footer-status-weight\) !important/, "the shared shell must own footer status weight");
assert.match(shell, /data-pop-window-control="minimize"/, "the shared shell must own minimize controls");
assert.match(shell, /data-pop-window-control="restore"/, "the shared shell must own restore controls");
assert.match(shell, /<svg class="pop-window-restore-icon"/, "restore controls must use the shared diagonal expand icon");
assert.equal(shell.includes("map-selector-minimized"), false, "the shared minimized shell must not inherit the retired map-selector wrapper");
assert.match(shell, /const visibleMinimized = minimized\[minimized.length - 1\]/, "the top-left minimized slot must remain a singleton");
assert.match(shellCss, /inset: 24px auto auto 24px !important/, "the minimized slot must stay at the top-left");

const others = moduleSource("others");
assert.match(others, /variant: "floating".*minimizable: false/, "global pause must remain a fixed compact window");
assert.match(shellCss, /\.pop-window-floating\.pause-overlay[\s\S]*inset: 24px 24px auto auto !important[\s\S]*max-width: 280px/, "global pause must stay in the shortened top-right compact slot");
assert.match(others, /variant: "confirmation".*minimizable: false/, "secondary confirmation must not be minimizable");

const prepare = moduleSource("prepare");
assert.match(prepare, /legacy: model\.minimized \? \{\} : \{/, "preparation windows must drop full-screen legacy classes when minimized");
assert.match(
  main,
  /minimize: \(\) => \{[\s\S]*roomConfigState\?\.status === "draft"[\s\S]*readSettingsFromForm\(\);[\s\S]*hiddenOverlay = "prepare"/,
  "minimizing the preparation window must preserve the current room-config draft",
);
assert.match(
  main,
  /querySelectorAll<HTMLSelectElement>\("\.fixed-map-order-select"\)[\s\S]*addEventListener\("change"[\s\S]*readSettingsFromForm\(\);[\s\S]*renderCurrent\(\);/,
  "fixed-map-order changes must update the draft and warning immediately",
);

const interactiveRandom = moduleSource("map-select").split("export function createInteractiveRandomView")[1] ?? "";
assert.match(interactiveRandom, /variant: model\.minimized \? "minimized" : "stage"/, "interactive random must support the minimized variant");
assert.match(interactiveRandom, /data-pop-window-control="minimize"/, "interactive random must bind the shared minimize control");
assert.match(interactiveRandom, /confirm-interactive-random-ruling/, "interactive random admin decisions need a visible ruling action");
for (const moduleName of ["map-select", "player-select", "ban-select"]) {
  assert.match(moduleSource(moduleName), /extensionSeconds/, `${moduleName} must render the configured extension duration`);
  assert.doesNotMatch(moduleSource(moduleName), /延长(?:20|30)秒/, `${moduleName} must not hardcode an extension duration`);
  assert.doesNotMatch(moduleSource(moduleName), /本小图判负|本小局判负/, `${moduleName} must use the shared map-forfeit wording`);
}
assert.match(main, /function isRollbackUnavailable\(\)[\s\S]*allowRollbackAfterCompletion/, "rollback controls must share the completion policy");
assert.match(main, /rollbackToSelectedRevision[\s\S]*isRollbackUnavailable\(\)/, "history rollback must use rollback policy instead of the match-action lock");
assert.match(main, /app\.addEventListener\("click", handlePersistentAdminControlClick\)/, "live admin controls must keep working across authoritative rerenders");
assert.doesNotMatch(main, /rollbackToHistoryRevision"\)\?\.addEventListener/, "history rollback must not rely on a replaceable element listener");

console.log("Pop-window structure contract passed.");
