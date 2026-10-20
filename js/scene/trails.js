// Wheel tracks on the ground (left blue, right orange) and the route a child
// draws. Tracks are ribbons with a fixed point budget: the oldest points drop
// off once it is used up, so a long drive never slows the tablet down.

import * as THREE from "three";
import { Line2 } from "three/addons/lines/Line2.js";
import { LineGeometry } from "three/addons/lines/LineGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";

/** Points kept per wheel track. */
export const TRACK_POINTS = 1200;
/** A new track point every this many chi. */
const GAP = 0.3;

export class Ribbon {
  /**
   * @param {number} color
   * @param {number} width chi
   * @param {number} [capacity]
   */
  constructor(color, width, capacity = TRACK_POINTS) {
    this.capacity = capacity;
    this.width = width;
    this.count = 0;
    this.pos = new Float32Array(capacity * 2 * 3);
    const idx = [];
    for (let i = 0; i < capacity - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    this.geo = new THREE.BufferGeometry();
    this.attr = new THREE.BufferAttribute(this.pos, 3);
    this.attr.setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute("position", this.attr);
    this.geo.setIndex(idx);
    this.geo.setDrawRange(0, 0);
    this.mesh = new THREE.Mesh(this.geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide }));
    this.mesh.frustumCulled = false;
    this.mesh.position.y = 0.015;
    this.mesh.renderOrder = 1;
    this.lastX = NaN;
    this.lastZ = NaN;
  }

  clear() {
    this.count = 0;
    this.lastX = this.lastZ = NaN;
    this.geo.setDrawRange(0, 0);
  }

  /**
   * Add a point if the wheel has moved far enough.
   * @param {number} x
   * @param {number} z
   * @param {number} dx unit direction of travel (x)
   * @param {number} dz
   */
  add(x, z, dx, dz) {
    if (Math.hypot(x - this.lastX, z - this.lastZ) < GAP) return;
    this.lastX = x;
    this.lastZ = z;
    if (this.count === this.capacity) {
      this.pos.copyWithin(0, 6);
      this.count--;
    }
    const h = this.width / 2;
    const o = this.count * 6;
    // perpendicular in the ground plane
    this.pos[o] = x - dz * h; this.pos[o + 1] = 0; this.pos[o + 2] = z + dx * h;
    this.pos[o + 3] = x + dz * h; this.pos[o + 4] = 0; this.pos[o + 5] = z - dx * h;
    this.count++;
    this.attr.needsUpdate = true;
    this.geo.setDrawRange(0, Math.max(0, (this.count - 1) * 6));
  }
}

/** A thick screen-space line on the ground, for drawn routes. */
export class RouteLine {
  /** @param {number} color */
  constructor(color) {
    this.mat = new LineMaterial({ color, linewidth: 7, transparent: true, opacity: 0.85, depthWrite: false, dashed: false });
    this.geo = new LineGeometry();
    this.line = new Line2(this.geo, this.mat);
    this.line.renderOrder = 5;
    this.line.visible = false;
    this.line.frustumCulled = false;
  }

  /** @param {{x: number, z: number}[]} pts */
  set(pts) {
    if (pts.length < 2) {
      this.line.visible = false;
      return;
    }
    /** @type {number[]} */
    const flat = [];
    for (const p of pts) flat.push(p.x, 0.06, p.z);
    this.geo.dispose();
    this.geo = new LineGeometry();
    this.geo.setPositions(flat);
    this.line.geometry = this.geo;
    this.line.computeLineDistances();
    this.line.visible = true;
  }

  clear() {
    this.line.visible = false;
  }

  /** @param {number} w @param {number} h */
  resize(w, h) {
    this.mat.resolution.set(w, h);
  }
}
