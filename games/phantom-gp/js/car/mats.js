// Materials. Paint colours are shared uniforms so a livery swap is instant.
import * as THREE from 'three';
import * as TX from './tex.js';

export const PAINTS = [
  { name: 'Solar', a: '#f2b200', b: '#f4f4f2', ink: '#0c0c0d', metal: 0.0, rough: 0.55, cc: 0.03, flake: 0.0, nut: '#2a63e0', suit: '#2b2c31', suitInk: '#f2f2ee', glove: '#e9e9e4' },
  { name: 'Cobalt', a: '#0a35b0', b: '#ff5a1f', ink: '#ffffff', metal: 0.55, rough: 0.42, cc: 0.03, flake: 0.5, nut: '#ff5a1f', suit: '#10277a', suitInk: '#f2f2ee', glove: '#ff5a1f' },
  { name: 'Ember', a: '#e8480a', b: '#a8dcf0', ink: '#ffffff', metal: 0.0, rough: 0.5, cc: 0.03, flake: 0.0, nut: '#a8dcf0', suit: '#2b2c31', suitInk: '#f2f2ee', glove: '#e8480a' },
  { name: 'Emerald', a: '#064d33', b: '#c5ee3e', ink: '#ffffff', metal: 0.6, rough: 0.4, cc: 0.03, flake: 0.55, nut: '#c5ee3e', suit: '#123f2e', suitInk: '#f2f2ee', glove: '#c5ee3e' },
  { name: 'Pearl', a: '#e9e9e4', b: '#d9142a', ink: '#0c0c0d', metal: 0.15, rough: 0.5, cc: 0.03, flake: 0.25, nut: '#d9142a', suit: '#dcdcd6', suitInk: '#16171a', glove: '#d9142a' },
  { name: 'Crimson', a: '#a30a14', b: '#efefec', ink: '#ffffff', metal: 0.35, rough: 0.42, cc: 0.03, flake: 0.4, nut: '#d8d8d8', suit: '#7a0a12', suitInk: '#f2f2ee', glove: '#efefec' },
  { name: 'Stealth', a: '#26282c', b: '#ff3b2f', ink: '#ffffff', metal: 0.5, rough: 0.5, cc: 0.42, flake: 0.3, nut: '#ff3b2f', suit: '#26272b', suitInk: '#f2f2ee', glove: '#ff3b2f' },
];

export function makeMaterials(shared) {
  const T = shared ? shared.T : {
    carbon: TX.carbon(0.016), flakes: TX.flakes(), peel: TX.orangePeel(), tread: TX.tireTread(), side: TX.tireSidewall(),
    cover: TX.wheelCover(), led: TX.ledPanel(), rad: TX.radiator(), heat: TX.heatTint(), fabric: TX.fabric(), knit: TX.gloveKnit(), strip: TX.visorStrip(),
  };
  if (!shared) { const sf = TX.steeringFace(); T.steer = sf.map; T.steerE = sf.emissive; }
  const U = { A: { value: new THREE.Color() }, B: { value: new THREE.Color() }, W: { value: new THREE.Color('#f4f4f2') }, K: { value: new THREE.Color('#08080a') } };
  const paintBase = () => ({
    metalness: 0, roughness: 0.5, clearcoat: 1, clearcoatRoughness: 0.03,
    normalMap: T.flakes, normalScale: new THREE.Vector2(0, 0),
    clearcoatNormalMap: T.peel, clearcoatNormalScale: new THREE.Vector2(0.035, 0.035),
  });
  const M = { T, U, paintMats: [], decalMats: [], suitDecalMats: [] };

  M.paint = new THREE.MeshPhysicalMaterial({ ...paintBase(), color: 0xffffff });
  M.accent = new THREE.MeshPhysicalMaterial({ ...paintBase(), color: 0xffffff });
  M.paint2 = new THREE.MeshPhysicalMaterial({ ...paintBase(), color: 0xffffff, side: THREE.DoubleSide });
  M.paintMats.push(M.paint, M.accent, M.paint2);

  // Body panels: mask texture (uv1) picks base / accent / white / carbon-black.
  M.livery = (mask, cut = false) => {
    const m = new THREE.MeshPhysicalMaterial({ ...paintBase(), color: 0xffffff, map: mask, alphaTest: cut ? 0.5 : 0 });
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uPaintA = U.A; sh.uniforms.uPaintB = U.B; sh.uniforms.uPaintW = U.W; sh.uniforms.uPaintK = U.K;
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
          uniform vec3 uPaintA; uniform vec3 uPaintB; uniform vec3 uPaintW; uniform vec3 uPaintK; float lvK = 0.0;
          float lvStep(float m) { float e = max(fwidth(m), 1e-4) * 0.9; return smoothstep(0.5 - e, 0.5 + e, m); }`)
        .replace('#include <map_fragment>', `#ifdef USE_MAP
          vec4 lm = texture2D(map, vMapUv);
          float lvB = lvStep(lm.r); lvK = lvStep(lm.g); float lvW = lvStep(lm.b);
          vec3 lc = mix(uPaintA, uPaintB, lvB); lc = mix(lc, uPaintW, lvW); lc = mix(lc, uPaintK, lvK);
          diffuseColor.rgb = lc; diffuseColor.a *= lm.a;
        #endif`)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = mix(roughnessFactor, 0.6, lvK);')
        .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n metalnessFactor = mix(metalnessFactor, 0.0, lvK);')
        .replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\n material.clearcoatRoughness = mix(material.clearcoatRoughness, 0.3, lvK);');
    };
    m.customProgramCacheKey = () => 'livery';
    m.userData.mk = ['livery', mask, cut];
    M.paintMats.push(m);
    return m;
  };

  const cb = T.carbon;
  const carbon = (o) => new THREE.MeshPhysicalMaterial({
    color: 0xffffff, map: cb.map, normalMap: cb.normal, normalScale: new THREE.Vector2(0.4, 0.4), roughness: 0.4, metalness: 0,
    clearcoat: 1, clearcoatRoughness: 0.06, ...o,
  });
  // Bare racing carbon is satin, not lacquered: a soft sheen with the weave showing through.
  M.carbon = carbon({ clearcoat: 0.55, clearcoatRoughness: 0.24, roughness: 0.46 });
  M.carbonGloss = carbon({});
  M.carbonSatin = carbon({ clearcoat: 0.4, clearcoatRoughness: 0.34, roughness: 0.52 });
  M.carbonMatte = carbon({ clearcoat: 0.12, clearcoatRoughness: 0.55, roughness: 0.72 });
  M.haloCarbon = carbon({ clearcoat: 1, clearcoatRoughness: 0.08, roughness: 0.42 });
  M.carbon2 = carbon({ side: THREE.DoubleSide });
  // inside of the airbox: matte carbon seen from within, darkened with depth by vertex colour; the cooler core and the air filter
  const inner = { clearcoat: 0, roughness: 0.78, envMapIntensity: 0.35, vertexColors: true };
  M.ductShell = carbon({ ...inner, side: THREE.BackSide });
  M.ductPart = carbon({ ...inner });
  M.ductFrame = carbon({ clearcoat: 0, roughness: 0.78, envMapIntensity: 0.3, color: 0x4a4a4a, side: THREE.DoubleSide });
  M.coreTube = new THREE.MeshStandardMaterial({ color: 0x33363a, metalness: 0.7, roughness: 0.5, envMapIntensity: 0.12 });
  M.coreFin = new THREE.MeshStandardMaterial({ color: 0x2d2f33, metalness: 0.6, roughness: 0.6, envMapIntensity: 0.12 });
  M.filter = new THREE.MeshStandardMaterial({ color: 0x4a463e, roughness: 1, side: THREE.DoubleSide, envMapIntensity: 0.12 });

  M.tread = new THREE.MeshPhysicalMaterial({ color: 0x1d1d1e, roughness: 1, roughnessMap: T.tread, bumpMap: T.tread, bumpScale: 0.11, sheen: 0.5, sheenRoughness: 0.55, sheenColor: new THREE.Color(0x3a3a3a) });
  if (!shared) T.tread.repeat.set(7, 7);
  // A spinning wheel smears its lettering round the tyre. spinF / spinR = fraction of a turn swept while the shutter is
  // open (front and rear axle); the sidewall is blurred along its length and the wheel cover about its centre.
  M.spinF = { value: 0 }; M.spinR = { value: 0 };
  const spun = (m, U, cover) => {
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uSpin = U;
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uSpin;').replace('#include <map_fragment>', cover ? `
        vec4 sampledDiffuseColor = vec4(0.0); float sj = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
        for (int i = 0; i < 12; i++) { float sa = ((float(i) + sj) / 12.0 - 0.5) * uSpin * 6.2831853, ss = sin(sa), sc = cos(sa); vec2 sq = vMapUv - 0.5;
          sampledDiffuseColor += texture2D(map, vec2(sc * sq.x - ss * sq.y, ss * sq.x + sc * sq.y) + 0.5); }
        diffuseColor *= sampledDiffuseColor / 12.0;` : `
        vec4 sampledDiffuseColor = vec4(0.0); float sj = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
        for (int i = 0; i < 12; i++) sampledDiffuseColor += texture2D(map, vMapUv + vec2(((float(i) + sj) / 12.0 - 0.5) * uSpin, 0.0));
        diffuseColor *= sampledDiffuseColor / 12.0;`);
    };
    m.customProgramCacheKey = () => (cover ? 'spun-cover' : 'spun-side');
    return m;
  };
  const sideDef = { color: 0xffffff, map: T.side.map, bumpMap: T.side.bump, bumpScale: 1.4, roughness: 0.78, sheen: 0.45, sheenRoughness: 0.5, sheenColor: new THREE.Color(0x404040) };
  const coverDef = { color: 0xffffff, map: T.cover, metalness: 0.25, roughness: 0.48, clearcoat: 0.7, clearcoatRoughness: 0.22 };
  M.sidewall = spun(new THREE.MeshPhysicalMaterial(sideDef), M.spinR, false);
  M.sidewallF = spun(new THREE.MeshPhysicalMaterial(sideDef), M.spinF, false);
  M.rim = new THREE.MeshPhysicalMaterial({ color: 0x17181a, metalness: 0.92, roughness: 0.36, clearcoat: 0.4, clearcoatRoughness: 0.25 });
  M.cover = spun(new THREE.MeshPhysicalMaterial(coverDef), M.spinR, true);
  M.coverF = spun(new THREE.MeshPhysicalMaterial(coverDef), M.spinF, true);
  M.nut = new THREE.MeshPhysicalMaterial({ color: 0x2a63e0, metalness: 1, roughness: 0.28 });
  M.alu = new THREE.MeshPhysicalMaterial({ color: 0xc2c6cc, metalness: 1, roughness: 0.3 });
  M.steel = new THREE.MeshPhysicalMaterial({ color: 0x6d7076, metalness: 1, roughness: 0.38 });
  M.chrome = new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 1, roughness: 0.025 });
  M.black = new THREE.MeshPhysicalMaterial({ color: 0x0b0b0c, roughness: 0.55, clearcoat: 0.3, clearcoatRoughness: 0.4 });
  M.gloss = new THREE.MeshPhysicalMaterial({ color: 0x060607, roughness: 0.5, clearcoat: 1, clearcoatRoughness: 0.04 });
  M.duct = new THREE.MeshStandardMaterial({ color: 0x030303, roughness: 0.95, side: THREE.DoubleSide });      // double sided so the back wall of a duct shows from the mouth
  M.foam = new THREE.MeshPhysicalMaterial({ color: 0x232327, roughness: 0.92, sheen: 0.4, sheenRoughness: 0.7, sheenColor: new THREE.Color(0x333338) });
  M.exhaust = new THREE.MeshPhysicalMaterial({ color: 0xffffff, map: T.heat, metalness: 1, roughness: 0.34 });
  M.led = new THREE.MeshStandardMaterial({ color: 0x1a0000, emissive: 0xff2412, emissiveMap: T.led, emissiveIntensity: 1.6, roughness: 0.35 });
  M.ledSmall = new THREE.MeshStandardMaterial({ color: 0x1a0000, emissive: 0xff2412, emissiveIntensity: 1.2, roughness: 0.35 });
  M.radiator = new THREE.MeshStandardMaterial({ color: 0xffffff, map: T.rad, metalness: 0.7, roughness: 0.55 });
  M.screen = new THREE.MeshStandardMaterial({ color: 0xffffff, map: T.steer, emissive: 0xffffff, emissiveMap: T.steerE, emissiveIntensity: 1.3, roughness: 0.42 });
  M.knob = new THREE.MeshPhysicalMaterial({ color: 0x0e0e10, metalness: 0.7, roughness: 0.42 });
  { const cache = {}; M.button = (hex) => cache[hex] || (cache[hex] = Object.assign(new THREE.MeshPhysicalMaterial({ color: hex, roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.2, emissive: hex, emissiveIntensity: 0.22 }), { userData: { mk: ['button', hex] } })); }
  M.belt = new THREE.MeshPhysicalMaterial({ color: 0xa3121b, roughness: 0.82, sheen: 0.6, sheenRoughness: 0.5, sheenColor: new THREE.Color(0xff6a60) });
  // driver
  const cloth = { roughness: 0.9, bumpMap: T.fabric, bumpScale: 0.5, sheen: 0.7, sheenRoughness: 0.6 };
  M.suit = new THREE.MeshPhysicalMaterial({ ...cloth, color: 0x17181b, sheenColor: new THREE.Color(0x55555a) });
  M.sleeve = new THREE.MeshPhysicalMaterial({ ...cloth, color: 0xf2b200, sheenColor: new THREE.Color(0x777777) });
  M.glove = new THREE.MeshPhysicalMaterial({ ...cloth, color: 0x3b3c42, roughness: 0.74, sheen: 0.9, sheenColor: new THREE.Color(0x8a8a90) });
  M.cuff = new THREE.MeshPhysicalMaterial({ ...cloth, color: 0xe9e9e4, sheenColor: new THREE.Color(0x888888) });
  // glove on the hand mesh: back panel in the glove colour, side strips in the car colour, palm panel dark.
  // The `palm` vertex value is > 0 on the palm side; the shader thresholds it so the panel edges are clean lines.
  M.gloveU = { uPalm: { value: new THREE.Color(0x2a2b30) }, uAccent: { value: new THREE.Color(0xf2b200) } };
  M.gloveHand = new THREE.MeshPhysicalMaterial({ ...cloth, bumpMap: T.knit, bumpScale: 0.7, color: 0xe9e9e4, roughness: 0.84, vertexColors: true, sheenColor: new THREE.Color(0x888888) });
  M.gloveHand.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, M.gloveU);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float palm;\nvarying float vPalm;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvPalm = palm;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uPalm;\nuniform vec3 uAccent;\nvarying float vPalm;')
      .replace('#include <color_fragment>', '#include <color_fragment>\nfloat palmK = smoothstep(-0.03, 0.03, vPalm);\nfloat sideK = smoothstep(-0.36, -0.31, vPalm) * (1.0 - palmK);\ndiffuseColor.rgb = mix(mix(diffuseColor.rgb, uAccent * vColor.rgb, sideK), uPalm * vColor.rgb, palmK);')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.6, palmK);');
  };
  M.gloveDecalMats = [];
  M.gloveDecal = (map) => {
    let m = M.gloveDecalMats.find((x) => x.map === map);
    if (!m) { m = new THREE.MeshPhysicalMaterial({ map, color: M.gloveInk || 0x16171a, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, roughness: 0.7 }); m.userData.mk = ['gloveDecal', map]; M.gloveDecalMats.push(m); }
    return m;
  };
  M.balaclava = new THREE.MeshPhysicalMaterial({ ...cloth, color: 0xd4d4cf, sheenColor: new THREE.Color(0xffffff) });
  M.visor = new THREE.MeshPhysicalMaterial({ color: 0x232936, metalness: 1, roughness: 0.045, iridescence: 0.4, iridescenceIOR: 1.7, iridescenceThicknessRange: [300, 380], clearcoat: 1, clearcoatRoughness: 0.02 });
  M.visorStrip = new THREE.MeshPhysicalMaterial({ color: 0xffffff, map: T.strip, roughness: 0.4, clearcoat: 1, clearcoatRoughness: 0.05 });
  M.halo = new THREE.MeshPhysicalMaterial({ color: 0x08080a, roughness: 0.45, clearcoat: 1, clearcoatRoughness: 0.06, clearcoatNormalMap: T.peel, clearcoatNormalScale: new THREE.Vector2(0.03, 0.03) });
  M.fastener = new THREE.MeshPhysicalMaterial({ color: 0x8a8d93, metalness: 1, roughness: 0.42 });
  M.seam = new THREE.MeshStandardMaterial({ color: 0x050506, roughness: 0.8 });
  M.suitDecal = (map) => { const m = new THREE.MeshPhysicalMaterial({ map, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, roughness: 0.85 }); m.userData.mk = ['suitDecal', map]; M.suitDecalMats.push(m); return m; };
  M.grip = new THREE.MeshPhysicalMaterial({ color: 0x101012, roughness: 0.85, sheen: 0.3, sheenColor: new THREE.Color(0x303030) });

  // Decals: white-on-transparent art, tinted by the livery's ink colour.
  M.decal = (map, tinted = true) => {
    const m = new THREE.MeshPhysicalMaterial({
      map, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
      roughness: 0.5, clearcoat: 1, clearcoatRoughness: 0.03, clearcoatNormalMap: T.peel, clearcoatNormalScale: new THREE.Vector2(0.035, 0.035),
    });
    m.userData.mk = ['decal', map, tinted];
    if (tinted) M.decalMats.push(m);
    return m;
  };

  M.applyPaint = (p) => {
    U.A.value.set(p.a); U.B.value.set(p.b);
    M.paint.color.set(p.a); M.accent.color.set(p.b); M.paint2.color.set(p.a);
    for (const m of M.paintMats) {
      m.metalness = p.metal; m.roughness = p.rough; m.clearcoatRoughness = p.cc;
      m.normalScale.set(p.flake * 0.5, p.flake * 0.5);
    }
    for (const m of M.decalMats) { m.color.set(p.ink); m.clearcoatRoughness = p.cc; }
    M.nut.color.set(p.nut);
    M.suit.color.set(p.suit); M.cuff.color.set(p.glove); M.gloveHand.color.set(p.glove); M.gloveU.uAccent.value.set(p.a === p.glove ? p.b : p.a);
    { const c = new THREE.Color(p.glove), light = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b > 0.25; M.gloveInk = light ? '#16171a' : '#f2f2ee'; for (const m of M.gloveDecalMats) m.color.set(M.gloveInk); } M.sleeve.color.set(p.a);
    for (const m of M.suitDecalMats) m.color.set(p.suitInk);
  };
  M.applyPaint(PAINTS[0]);
  // every named material carries its key, every factory-made one its recipe, so a second car can be given
  // its own set: M2.twin(material of car 1) -> the matching material of set 2
  for (const k of Object.keys(M)) if (M[k] && M[k].isMaterial) M[k].userData.key = k;
  const twins = new Map();
  M.twin = (m) => {
    if (twins.has(m)) return twins.get(m);
    let t = m;
    if (m.userData.key) t = M[m.userData.key];
    else if (m.userData.mk) { const [f, ...a] = m.userData.mk; t = M[f](...a); if (f === 'livery' || f === 'decal') { t.side = m.side; t.alphaTest = m.alphaTest; } }
    twins.set(m, t); return t;
  };
  return M;
}
