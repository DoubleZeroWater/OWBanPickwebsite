import assert from "node:assert/strict";
import worker from "../../dist/server/index.js";

const env = {
  ASSETS: {
    async fetch(request) {
      const url = new URL(request.url);

      if (url.pathname === "/" || url.pathname === "/A") {
        return new Response('<meta content="__SITE_ORIGIN__/static/og.png">', {
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      }

      return new Response("not found", { status: 404 });
    },
  },
};

const catalogResponse = await worker.fetch(
  new Request("https://demo.example/api/maps/catalog"),
  env,
);
const roomResponse = await worker.fetch(
  new Request("https://demo.example/api/rooms", { method: "POST" }),
  env,
);
const pageResponse = await worker.fetch(new Request("https://demo.example/A"), env);

const catalog = await catalogResponse.json();
const room = await roomResponse.json();
const page = await pageResponse.text();

assert.equal(catalogResponse.status, 200);
assert.equal(catalog.modes.length, 5);
assert.equal(roomResponse.status, 200);
assert.equal(room.links.C.url, "https://demo.example/C");
assert.match(page, /https:\/\/demo\.example\/static\/og\.png/);

console.log("Sites worker smoke passed");
