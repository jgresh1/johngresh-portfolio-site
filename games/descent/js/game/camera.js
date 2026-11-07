// Third-person camera that orbits the fish. Mouse sets yaw/pitch; the camera sits behind the fish at a distance that grows with its size,
// slides in when something is in the way (seabed / surface) and follows with a little spring so quick moves feel soft.
import * as THREE from 'three';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export class CameraRig {
  constructor(camera, gw) {
    this.camera = camera; this.gw = gw;
    this.yaw = -Math.PI / 2; this.pitch = -0.12; this.zoom = 1;
    this.pos = new THREE.Vector3(); this.target = new THREE.Vector3(); this.dir = new THREE.Vector3();
    this.shake = 0; this.fov = 64; this.fovKick = 0; this.dist = 1; this.lookAhead = new THREE.Vector3();
    this.baseFov = 62; this.minDist = 0.5; this.cut = true;
  }

  distanceFor(len, depth = 99) {
    let d = clamp(len * 2.4 + 0.15, 0.36, 16) * this.zoom;
    const avail = Math.max(depth - 0.2, 0.3);                       // shallow water: bring the camera in close
    return Math.min(d, avail * 1.5 + len * 1.1);
  }

  // aim the camera so the player's heading is in view (used at spawn / after evolving)
  facePlayer(p) { this.yaw = Math.atan2(-p.fx, -p.fz); this.pitch = clamp(-0.12 - p.fy * 0.3, -0.9, 0.6); this.cut = true; }

  addShake(a) { this.shake = Math.min(1.2, this.shake + a); }

  update(dt, p, opts = {}) {
    const cam = this.camera, gw = this.gw;
    const L = p.len;
    const d0 = this.distanceFor(L, -gw.floor(p.x, p.z)) * (opts.distMul || 1);
    const cp = Math.cos(this.pitch);
    this.dir.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);       // camera forward
    // look target: a little above and ahead of the fish
    const ahead = clamp(p.speedFrac, 0, 1.6) * L * 0.25 + L * 0.1;
    this.target.set(p.x + p.fx * ahead, p.y + L * 0.16 + p.fy * ahead - (opts.shiftY || 0) * d0, p.z + p.fz * ahead);
    if (opts.shiftX) { this.target.x += Math.cos(this.yaw) * opts.shiftX * d0; this.target.z += -Math.sin(this.yaw) * opts.shiftX * d0; }
    // The camera sits behind the fish, a little above it (so the fish is in the lower part of the frame) and a little to the right (so it shows its side instead of
    // just its tail). All three offsets are proportional to the distance, so the camera travels on ONE straight line through the target: u (per metre of distance).
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw), liftK = 0.17 * (1 - Math.abs(this.dir.y) * 0.8), sideK = 0.26 * (opts.side ?? 1);
    const ux = -this.dir.x + rx * sideK, uy = -this.dir.y + liftK, uz = -this.dir.z + rz * sideK;
    // slide the camera in until that exact line is in open water (a rock beside the line used to push the camera sideways and the fish drifted out of the frame)
    let d = d0;
    const clr = 0.05 + L * 0.1, sol = gw.solids, rc = 0.05 + cam.near * 2.2;     // clearance above the (exact) ground / from solids: well outside the near plane
    for (let k = 1; k <= 10; k++) {
      const f = k / 10, x = this.target.x + ux * d0 * f, y = this.target.y + uy * d0 * f, z = this.target.z + uz * d0 * f;
      if (y < gw.floor(x, z) + clr || y > -0.14 || (sol && sol.n && sol.push(x, y, z, rc))) { d = Math.max(d0 * (f - 1 / 10) * 0.92, 0.22); break; }
    }
    this.dist += (d - this.dist) * (this.cut ? 1 : 1 - Math.exp(-dt * (d < this.dist ? 14 : 3.2)));
    const wx = this.target.x + ux * this.dist, wy = this.target.y + uy * this.dist, wz = this.target.z + uz * this.dist;
    // spring toward the wanted position (stiff, so the fish stays framed)
    const k = this.cut ? 1 : 1 - Math.exp(-dt * 12);
    this.pos.x += (wx - this.pos.x) * k; this.pos.y += (wy - this.pos.y) * k; this.pos.z += (wz - this.pos.z) * k;
    this.cut = false;
    // keep inside the water column
    let cx = this.pos.x, cy = this.pos.y, cz = this.pos.z;
    if (sol && sol.n) for (let it = 0; it < 3; it++) { const dd = sol.push(cx, cy, cz, rc); if (!dd) break; cx += dd.x; cy += dd.y; cz += dd.z; }     // a few passes: a crevice between two rocks needs more than one
    const fl = gw.floor(cx, cz) + clr; if (cy < fl) cy = fl; if (cy > -0.14) cy = -0.14;
    this.shake = Math.max(0, this.shake - dt * 2.4);
    if (this.shake > 0.001) { const s = this.shake * this.shake * 0.05 * Math.max(0.3, Math.min(L, 1.5)); cx += (Math.random() - 0.5) * s; cy += (Math.random() - 0.5) * s; cz += (Math.random() - 0.5) * s; }
    cam.position.set(cx, cy, cz);
    cam.rotation.set(this.pitch, this.yaw, 0);
    // field of view: wider while dashing
    const tf = this.baseFov + (opts.fovKick || 0) + (this.dist < d0 * 0.7 ? 8 * (1 - this.dist / (d0 * 0.7)) : 0);
    this.fov += (tf - this.fov) * (1 - Math.exp(-dt * 6));
    let dirty = false;
    if (Math.abs(cam.fov - this.fov) > 0.02) { cam.fov = this.fov; dirty = true; }
    const near = clamp(0.012 + L * 0.055, 0.02, 0.3);
    if (Math.abs(cam.near - near) > 0.002) { cam.near = near; dirty = true; }
    if (dirty) cam.updateProjectionMatrix();
  }
}
