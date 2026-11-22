// hangar.js — where the film starts: a steel hangar with the aircraft on the centre line, nose to the doors.
// Nothing here is painted on. The lamps are four banks that switch on one after another; the daylight is one
// low sun outside that the walls and the sliding doors really block, so the stripe of light that crosses the
// floor and climbs the nose when the doors part is cast by the doors themselves.
// Local frame: metres, y up, the aircraft's centre of gravity above the origin, nose towards -z (the doors).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { patch, makeSky, ATMO } from '../atmo.js';

const W = 42, ZF = -24, ZB = 22, H = 12.4, DOOR_W = 27, DOOR_H = 9.2;        // inside width, front and back walls, eaves, door opening
const ROWS = [14, 5, -4, -13];                                                 // lamp banks, back to front

class Bag {                                       // boxes and cylinders gathered per material, merged at the end
  constructor() { this.by = new Map(); }
  add(mat, geo, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0) {
    geo.rotateX(rx); geo.rotateZ(rz); geo.rotateY(ry); geo.translate(x, y, z);
    if (!this.by.has(mat)) this.by.set(mat, []);
    this.by.get(mat).push(geo.index ? geo.toNonIndexed() : geo);
    return this;
  }
  box(mat, w, h, d, x, y, z, ry = 0) { return this.add(mat, new THREE.BoxGeometry(w, h, d), x, y, z, ry); }
  cyl(mat, r, h, x, y, z, rx = 0, rz = 0, seg = 20) { return this.add(mat, new THREE.CylinderGeometry(r, r, h, seg), x, y, z, 0, rx, rz); }
  into(group, { cast = true, receive = true } = {}) {
    const out = [];
    for (const [mat, list] of this.by) {
      const m = new THREE.Mesh(mergeGeometries(list, false), mat);
      m.castShadow = cast; m.receiveShadow = receive; group.add(m); out.push(m);
      for (const g of list) g.dispose();
    }
    return out;
  }
}

const std = (key, color, rough, metal = 0, parts = {}) => patch(new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal }), 'hg-' + key, parts);

// ribbed steel sheet: the ribs run up the walls and along the roof
const RIBS = {
  normal: /* glsl */`
    float hgU = abs( vWn.x ) > 0.6 ? vWp.z : vWp.x;
    float hgS = sin( hgU * 31.4 );
    vec3 hgT = abs( vWn.x ) > 0.6 ? vec3( 0.0, 0.0, 1.0 ) : vec3( 1.0, 0.0, 0.0 );
    normal = normalize( normal + ( viewMatrix * vec4( hgT * hgS * 0.55, 0.0 ) ).xyz );`,
  color: /* glsl */`
    diffuseColor.rgb *= 0.86 + 0.14 * apNoise( vWp.xz * 0.9 + vWp.y * 1.3 ) - 0.10 * smoothstep( 0.6, 1.0, sin( ( abs( vWn.x ) > 0.6 ? vWp.z : vWp.x ) * 31.4 + 1.57 ) );
    diffuseColor.rgb *= 0.80 + 0.20 * smoothstep( 0.0, 2.5, vWp.y );`,
};
// power-floated concrete: bays cast one at a time, a worn sealer that is glossier in some places than others,
// a yellow lead-out line and the dark of years of tyres along it
const FLOOR = {
  color: /* glsl */`
    vec2 fq = vWp.xz;
    vec2 fb = abs( fract( fq / 6.0 ) - 0.5 ) * 6.0;
    float fJoint = 1.0 - smoothstep( 0.012, 0.03, 3.0 - max( fb.x, fb.y ) );
    float fBay = apHash( floor( fq / 6.0 ) );
    float fStain = apFbm( fq * 0.33 + 9.0 );
    vec3 fCol = vec3( 0.30, 0.295, 0.285 ) * ( 0.84 + 0.16 * fBay ) * ( 0.80 + 0.36 * fStain ) * ( 0.93 + 0.14 * apNoise( fq * 14.0 ) );
    float fTyre = exp( - pow( ( abs( fq.x ) - 1.0 ) / 0.45, 2.0 ) ) * ( 0.25 + 0.75 * apFbm( fq * vec2( 3.0, 0.4 ) ) );
    fCol *= 1.0 - 0.34 * fTyre;
    float fLine = ( 1.0 - smoothstep( 0.065, 0.08, abs( fq.x ) ) ) * ( 0.55 + 0.45 * step( 0.38, apFbm( fq * 2.2 ) ) );
    fCol = mix( fCol, vec3( 0.62, 0.47, 0.06 ), fLine * 0.85 );
    fCol *= 1.0 - 0.55 * fJoint;
    diffuseColor.rgb = fCol;`,
  rough: /* glsl */`
    roughnessFactor = clamp( 0.20 + 0.42 * smoothstep( 0.35, 0.7, fStain ) + 0.25 * fTyre + 0.4 * fJoint + 0.08 * apNoise( fq * 5.0 ), 0.08, 0.95 );`,
};
const APRON = {
  color: /* glsl */`
    vec2 aq = vWp.xz; vec2 ab = abs( fract( aq / 7.5 ) - 0.5 ) * 7.5;
    float aJoint = 1.0 - smoothstep( 0.02, 0.06, 3.75 - max( ab.x, ab.y ) );
    diffuseColor.rgb = vec3( 0.47, 0.46, 0.44 ) * ( 0.85 + 0.2 * apFbm( aq * 0.21 ) ) * ( 0.94 + 0.12 * apNoise( aq * 9.0 ) ) * ( 1.0 - 0.5 * aJoint );
    float aLine = 1.0 - smoothstep( 0.07, 0.09, abs( aq.x ) );
    diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.66, 0.50, 0.07 ), aLine * 0.8 );`,
};

export class Hangar {
  constructor(renderer, tier) {
    this.renderer = renderer;
    const scene = this.scene = new THREE.Scene();
    this.exposure = 2.2;                  // set for the lamp-lit inside, so daylight through the doors burns out, as it would
    const M = {
      wall: std('ribs', 0x596169, 0.62, 0.35, RIBS), roof: std('ribs', 0x3d4349, 0.7, 0.3, RIBS),
      steel: std('steel', 0x2b3035, 0.55, 0.6), concrete: std('conc', 0x6d6b66, 0.9), floor: std('floor', 0x4d4c49, 0.4, 0, FLOOR), apron: std('apron', 0x77756f, 0.92, 0, APRON),
      door: std('ribs', 0x4a535b, 0.55, 0.45, RIBS), red: std('red', 0x7c1410, 0.45, 0.1), yellow: std('yel', 0xa47a0c, 0.5), dark: std('dark', 0x101214, 0.6, 0.2),
      wood: std('wood', 0x5a4128, 0.75), alu: std('alu', 0x9a9d9f, 0.4, 0.9), rubber: std('rub', 0x0c0c0d, 0.85), far: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.40, 0.47, 0.57) }),
    };
    for (const k of ['wall', 'roof', 'door']) M[k].side = THREE.DoubleSide;
    const set = new THREE.Group(); scene.add(set);
    const B = new Bag();
    // floor inside, apron outside
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(W, ZB - ZF).rotateX(-Math.PI / 2).translate(0, 0, (ZB + ZF) / 2), M.floor); fl.receiveShadow = true; set.add(fl);
    const ap = new THREE.Mesh(new THREE.PlaneGeometry(900, 700).rotateX(-Math.PI / 2).translate(0, -0.02, ZF - 350), M.apron); ap.receiveShadow = true; set.add(ap);
    // shell: side walls, back wall, the front wall round the door opening, roof. Thick enough to stop the sun.
    B.box(M.wall, 0.3, H, ZB - ZF, -W / 2 - 0.15, H / 2, (ZB + ZF) / 2).box(M.wall, 0.3, H, ZB - ZF, W / 2 + 0.15, H / 2, (ZB + ZF) / 2);
    B.box(M.wall, W + 0.6, H, 0.3, 0, H / 2, ZB + 0.15);
    const side = (W - DOOR_W) / 2;
    B.box(M.wall, side + 0.3, H, 0.3, -(DOOR_W / 2 + side / 2 + 0.15), H / 2, ZF - 0.15).box(M.wall, side + 0.3, H, 0.3, DOOR_W / 2 + side / 2 + 0.15, H / 2, ZF - 0.15);
    B.box(M.wall, DOOR_W, H - DOOR_H, 0.3, 0, DOOR_H + (H - DOOR_H) / 2, ZF - 0.15);
    B.box(M.roof, W + 0.6, 0.25, ZB - ZF + 0.6, 0, H + 0.12, (ZB + ZF) / 2);
    B.box(M.concrete, 0.5, 1.1, ZB - ZF, -W / 2 + 0.25, 0.55, (ZB + ZF) / 2).box(M.concrete, 0.5, 1.1, ZB - ZF, W / 2 - 0.25, 0.55, (ZB + ZF) / 2).box(M.concrete, W, 1.1, 0.5, 0, 0.55, ZB - 0.25);
    // frames every 6 m: columns, a truss across (top and bottom chords, posts, diagonals), purlins along
    for (let z = ZF + 2; z <= ZB - 1; z += 6) {
      for (const sx of [-1, 1]) { B.box(M.steel, 0.42, H - 1.4, 0.34, sx * (W / 2 - 0.5), (H - 1.4) / 2, z); B.box(M.steel, 0.6, 0.06, 0.5, sx * (W / 2 - 0.5), 0.03, z); }
      B.box(M.steel, W - 0.6, 0.22, 0.26, 0, H - 0.25, z).box(M.steel, W - 0.6, 0.2, 0.24, 0, H - 2.0, z);
      for (let x = -W / 2 + 1.5, i = 0; x <= W / 2 - 1.4; x += 3, i++) {
        B.box(M.steel, 0.1, 1.6, 0.1, x, H - 1.12, z);
        if (x + 3 <= W / 2 - 1.4) B.add(M.steel, new THREE.BoxGeometry(3.42, 0.09, 0.09), x + 1.5, H - 1.12, z, 0, 0, (i % 2 ? 1 : -1) * 0.49);
      }
    }
    for (let x = -W / 2 + 3; x <= W / 2 - 3; x += 4) B.box(M.steel, 0.12, 0.16, ZB - ZF - 1, x, H - 0.06, (ZB + ZF) / 2);
    // door track and lintel beam
    B.box(M.steel, DOOR_W + 16, 0.4, 0.9, 0, DOOR_H + 0.25, ZF + 0.3).box(M.steel, W, 0.05, 0.12, 0, 0.025, ZF + 0.22).box(M.steel, W, 0.05, 0.12, 0, 0.025, ZF + 0.52);
    // lamp housings (the bright faces are separate, one material per bank)
    for (const z of ROWS) for (let x = -15; x <= 15; x += 7.5) { B.cyl(M.dark, 0.36, 0.34, x, H - 2.4, z).cyl(M.steel, 0.03, 0.6, x, H - 1.95, z, 0, 0, 8); B.cyl(M.alu, 0.40, 0.05, x, H - 2.58, z); }
    // things a hangar has: bench with a vice, tool chest on castors, drums, steps, a tow bar, extinguishers
    B.box(M.wood, 5.2, 0.08, 0.9, -W / 2 + 1.2, 0.92, 6, Math.PI / 2).box(M.steel, 0.08, 0.9, 0.08, -W / 2 + 0.9, 0.45, 3.6).box(M.steel, 0.08, 0.9, 0.08, -W / 2 + 0.9, 0.45, 8.4)
      .box(M.steel, 0.08, 0.9, 0.08, -W / 2 + 1.55, 0.45, 3.6).box(M.steel, 0.08, 0.9, 0.08, -W / 2 + 1.55, 0.45, 8.4).box(M.steel, 0.22, 0.2, 0.3, -W / 2 + 1.2, 1.06, 4.4);
    B.box(M.red, 0.75, 0.95, 1.25, -9.5, 0.62, 2.2, 0.3).box(M.dark, 0.77, 0.02, 1.27, -9.5, 0.52, 2.2, 0.3).box(M.dark, 0.77, 0.02, 1.27, -9.5, 0.78, 2.2, 0.3).box(M.alu, 0.8, 0.03, 1.3, -9.5, 1.11, 2.2, 0.3);
    for (const [dx, dz] of [[-0.3, -0.5], [0.3, -0.5], [-0.3, 0.5], [0.3, 0.5]]) B.cyl(M.rubber, 0.06, 0.05, -9.5 + dx, 0.06, 2.2 + dz, 0, Math.PI / 2, 12);
    for (const [x, z] of [[W / 2 - 1.4, 12], [W / 2 - 1.5, 13.1], [W / 2 - 2.4, 12.4]]) B.cyl(x > W / 2 - 2 ? M.dark : M.yellow, 0.29, 0.88, x, 0.44, z);
    B.box(M.alu, 0.05, 2.3, 0.07, 12, 1.1, 7.6).box(M.alu, 0.05, 2.3, 0.07, 12.6, 1.1, 7.6).box(M.alu, 0.05, 2.3, 0.07, 12, 1.1, 8.7).box(M.alu, 0.05, 2.3, 0.07, 12.6, 1.1, 8.7).box(M.alu, 0.7, 0.04, 0.5, 12.3, 2.26, 8.15);
    for (let i = 1; i <= 6; i++) B.box(M.alu, 0.56, 0.03, 0.14, 12.3, i * 0.32, 7.62 + (6 - i) * 0.0);
    B.add(M.yellow, new THREE.CylinderGeometry(0.035, 0.035, 3.2, 10), 9.2, 0.22, -6.5, 0.5, 0, Math.PI / 2).cyl(M.rubber, 0.13, 0.07, 7.9, 0.13, -5.75, Math.PI / 2, 0, 14).cyl(M.rubber, 0.13, 0.07, 8.1, 0.13, -5.4, Math.PI / 2, 0, 14);
    for (const sx of [-1, 1]) B.cyl(M.red, 0.085, 0.5, sx * (W / 2 - 0.85), 1.25, -10, 0, 0, 14).box(M.dark, 0.05, 0.12, 0.05, sx * (W / 2 - 0.85), 1.56, -10);
    // far across the airfield: a low line of hangars and sheds, pale with distance
    for (let i = 0, x = -620; x < 620; i++) {
      const w = 40 + 70 * Math.abs(Math.sin(i * 12.9898) * 43758.5453 % 1), h = 9 + 13 * Math.abs(Math.sin(i * 78.233) * 12543.123 % 1);
      B.box(M.far, w, h, 40, x + w / 2, h / 2, -760 - 60 * Math.abs(Math.sin(i * 3.7)));
      x += w + 6 + 60 * Math.abs(Math.sin(i * 5.1) * 9871.3 % 1);
    }
    B.into(set);
    // door leaves: two each side, on two tracks, sliding out past the wall
    this.leaves = [];
    const lw = DOOR_W / 4;
    for (const [sx, k, track] of [[-1, 0, 0], [-1, 1, 1], [1, 0, 0], [1, 1, 1]]) {
      const g = new THREE.Group(), lb = new Bag();
      lb.box(M.door, lw + 0.12, DOOR_H + 0.1, 0.16, 0, DOOR_H / 2, 0);
      lb.box(M.steel, lw + 0.16, 0.22, 0.24, 0, 0.11, 0).box(M.steel, lw + 0.16, 0.22, 0.24, 0, DOOR_H - 0.05, 0).box(M.steel, 0.2, DOOR_H, 0.24, -lw / 2, DOOR_H / 2, 0).box(M.steel, 0.2, DOOR_H, 0.24, lw / 2, DOOR_H / 2, 0).box(M.steel, lw, 0.14, 0.22, 0, DOOR_H * 0.5, 0);
      lb.into(g);
      const x0 = sx * (lw * 0.5 + k * lw), x1 = sx * (DOOR_W / 2 + lw * 0.5 + 0.2 + (1 - k) * 0.25);
      g.position.set(x0, 0, ZF + 0.22 + track * 0.3); set.add(g);
      this.leaves.push({ g, x0, x1 });
    }
    // lamps: a bright face per fitting and one spot per bank
    this.banks = ROWS.map((z) => {
      const mat = new THREE.MeshBasicMaterial({ color: 0x000000 });
      const faces = [];
      for (let x = -15; x <= 15; x += 7.5) faces.push(new THREE.CircleGeometry(0.33, 24).rotateX(Math.PI / 2).translate(x, H - 2.61, z));
      const mesh = new THREE.Mesh(mergeGeometries(faces, false), mat); set.add(mesh);
      const spot = new THREE.SpotLight(0xfff5e8, 0, 60, 1.15, 0.9, 1.6);
      spot.position.set(0, H - 2.7, z); spot.target.position.set(0, 0, z * 0.55); scene.add(spot, spot.target);
      return { mat, spot, on: 0 };
    });
    // sky through the doors, the sun, and a little light bounced around inside
    this.sky = makeSky(); scene.add(this.sky);
    const sun = this.sun = new THREE.DirectionalLight(0xfff0dd, 10);
    const L = this.sunDir = new THREE.Vector3(0.012, -0.235, 0.972).normalize();        // the way the light travels: in through the doors, 13.5 degrees above the floor
    sun.target.position.set(0, 2, -2); sun.position.copy(sun.target.position).addScaledVector(L, -120);
    sun.castShadow = true; const sz = tier.jetShadow >= 2048 ? 4096 : 2048; sun.shadow.mapSize.set(sz, sz);
    Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 22, bottom: -14, near: 40, far: 190 }); sun.shadow.camera.updateProjectionMatrix();
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03; sun.shadow.radius = 2.2;
    scene.add(sun, sun.target);
    this.hemi = new THREE.HemisphereLight(0xdfe6ee, 0x55504a, 0.02); scene.add(this.hemi);
    // the dark under the aircraft where the lamps cannot reach
    const cv = document.createElement('canvas'); cv.width = cv.height = 256; const cx = cv.getContext('2d');
    const blob = (x, y, rx, ry, a) => { cx.save(); cx.translate(x, y); cx.scale(rx, ry); const gr = cx.createRadialGradient(0, 0, 0, 0, 0, 1); gr.addColorStop(0, `rgba(0,0,0,${a})`); gr.addColorStop(1, 'rgba(0,0,0,0)'); cx.fillStyle = gr; cx.beginPath(); cx.arc(0, 0, 1, 0, 7); cx.fill(); cx.restore(); };
    blob(128, 118, 26, 104, 0.75); blob(128, 168, 92, 46, 0.6); blob(128, 150, 60, 60, 0.4); blob(128, 40, 12, 26, 0.5);
    const tex = new THREE.CanvasTexture(cv);
    this.blob = new THREE.Mesh(new THREE.PlaneGeometry(7.6, 7.6).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.8, depthWrite: false, color: 0x000000 }));
    this.blob.position.set(0, 0.012, 0.4); scene.add(this.blob);
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.05, 3000);
    this.pmrem = new THREE.PMREMGenerator(renderer); this.env = null; this.envAt = -1; this.envKey = '';
    this.open = 0; this.lamps = 0; this.setDoor(0);
  }

  // n: how many banks are on (may be fractional while one warms up)
  setLamps(n) {
    this.banks.forEach((b, i) => {
      const k = THREE.MathUtils.clamp(n - i, 0, 1), w = k * k * (3 - 2 * k);
      b.on = w; b.mat.color.setRGB(4.6 * w, 4.4 * w, 4.0 * w); b.spot.intensity = 24 * w;
    });
    const tot = this.banks.reduce((s, b) => s + b.on, 0);
    this.hemi.intensity = 0.012 + 0.022 * tot + 0.10 * this.open;
    this.lamps = n;
  }

  // 0 shut .. 1 fully open
  setDoor(k) {
    this.open = k;
    const e = k * k * (3 - 2 * k);
    for (const l of this.leaves) l.g.position.x = l.x0 + (l.x1 - l.x0) * e;
    this.blob.material.opacity = 0.8 * (1 - 0.85 * e);                 // with the doors open the sun draws the real shadow
    this.setLamps(this.lamps ?? 0);
  }

  // reflections: the room as it is lit right now, without the aircraft in it
  refreshEnv(jetRoot, force = false) {
    const key = Math.round((this.lamps || 0) * 4) + '|' + Math.round(this.open * 24) + '|' + Math.round(ATMO.hour * 4);
    if (!force && key === this.envKey) return this.env?.texture;
    this.envKey = key;
    const vis = jetRoot?.visible; if (jetRoot) jetRoot.visible = false; this.blob.visible = false;
    const rt = this.pmrem.fromScene(this.scene, 0.012, 0.2, 2500, { position: new THREE.Vector3(0, 1.5, -1) });
    if (jetRoot) jetRoot.visible = vis; this.blob.visible = true;
    this.env?.dispose(); this.env = rt; this.scene.environment = rt.texture;
    return rt.texture;
  }

  dispose() { this.env?.dispose(); this.pmrem.dispose(); this.scene.traverse((o) => { o.geometry?.dispose?.(); }); }
}
