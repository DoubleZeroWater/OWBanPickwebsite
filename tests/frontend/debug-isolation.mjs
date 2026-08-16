import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const assetsDirectory = resolve("dist/assets");
const assetNames = await readdir(assetsDirectory);
const debugAssets = assetNames.filter((name) => /^debug-page-.*\.(?:js|css)$/.test(name));
const regularAssets = assetNames.filter((name) => !debugAssets.includes(name) && (name.endsWith(".js") || name.endsWith(".css")));
const debugText = (await Promise.all(debugAssets.map((name) => readFile(resolve(assetsDirectory, name), "utf8")))).join("\n");
const regularText = (await Promise.all(regularAssets.map((name) => readFile(resolve(assetsDirectory, name), "utf8")))).join("\n");

assert.ok(debugAssets.some((name) => name.endsWith(".js")), "build did not emit an isolated debug JavaScript chunk");
assert.ok(debugAssets.some((name) => name.endsWith(".css")), "build did not emit an isolated debug stylesheet chunk");
for (const debugMarker of ["UI DEBUG", "data-debug-toolbar", "team-offline", "pre-countdown-final-five", "random-opening-ban", "debug-page-body"]) {
  assert.equal(debugText.includes(debugMarker), true, `debug chunk is missing ${debugMarker}`);
  assert.equal(regularText.includes(debugMarker), false, `regular assets include debug implementation marker ${debugMarker}`);
}
for (const retiredPreviewMarker of ["data-debug-preview", "debug-preview-group", "配置阶段设计方案"]) {
  assert.equal(debugText.includes(retiredPreviewMarker), false, `debug chunk still includes retired scheme preview marker ${retiredPreviewMarker}`);
}

console.log("Debug source and chunk separation passed.");
