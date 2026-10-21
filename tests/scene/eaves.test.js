// The eave pieces (js/scene/eaves.js) stand at the feet of the baked roof
// tiles' rows (tools/assets/build_photo.py tile_rows): the two must agree on
// the tiles' size, or the tile ends drift off the rows along every eave.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { Eaves, PITCH, TILE, TILE_REPEAT, UV_PER_CHI } from "../../js/scene/eaves.js";

const root = new URL("../../", import.meta.url);

test("eaves.js TILE matches the baked roof (manifest and build_photo.py)", () => {
  const manifest = JSON.parse(readFileSync(new URL("assets/photo/manifest.json", root), "utf8"));
  const tile = manifest.textures.roof.tile;
  assert.deepEqual({ span: tile.span, rows: tile.rows, radius: tile.radius }, { span: TILE.span, rows: TILE.rows, radius: TILE.radius });
  const py = readFileSync(new URL("tools/assets/build_photo.py", root), "utf8");
  const m = py.match(/^TILE_SPAN, TILE_ROWS, TILE_SEGS, TILE_RADIUS = ([\d.]+), (\d+), (\d+), ([\d.]+)$/m);
  assert.ok(m, "build_photo.py TILE_* line");
  assert.deepEqual(m.slice(1).map(Number), [TILE.span, TILE.rows, TILE.segs, TILE.radius]);
  // one texture repeat spans TILE.span chi of roof
  assert.ok(Math.abs(TILE_REPEAT * UV_PER_CHI * TILE.span - 1) < 1e-9);
});

test("tile ends sit at the middle of each row: (k + ½)·PITCH along the eave", () => {
  const e = new Eaves();
  e.eave((a) => new THREE.Vector3(a, 0, 0), new THREE.Vector3(0, 0, 1), -10, 10);
  const g = e.tiles.geometry();
  assert.ok(g);
  const uv = /** @type {THREE.BufferAttribute} */ (g.getAttribute("uv"));
  // every piece carries its row's u: the rows' middles and the drip tiles' gaps
  const us = new Set();
  for (let i = 0; i < uv.count; i++) us.add(Math.round((uv.getX(i) / UV_PER_CHI / PITCH) * 2));
  for (const k of us) assert.ok(Number.isInteger(k));
  assert.ok([...us].some((k) => k % 2 !== 0), "tile ends at half pitches");
  assert.ok([...us].some((k) => k % 2 === 0), "drip tiles between");
});
