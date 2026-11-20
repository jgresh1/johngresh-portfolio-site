// signs.js — the lettering round the circuit: names on buildings, numbers over the pit garages, block codes on the
// stands, numbers on the marshal posts, the circuit's name on the pit building. Every text is drawn once into one
// atlas; a sign is a quad that shows its cell of it. (All trade names in the game are invented; these are plain
// words, numbers and the circuit's own name.)
import * as THREE from 'three';
import { canvas, toTex } from './tex.js';

const FONT = 'Bahnschrift, "DIN Alternate", "Arial Narrow", Arial, sans-serif';

function makeSigns() {
  const S = 2048, [cv, x] = canvas(S, S), cells = new Map();
  let sx = 0, sy = 0, shelf = 0, tex = null, mat = null;
  let pos = [], nor = [], uv = [], idx = [];
  x.fillStyle = '#16181c'; x.fillRect(0, 0, S, S);

  /* One cell per text and style: where it sits in the atlas, and its shape (width / height).
     style: bg, fg, border (colours), h (cell height in pixels), size (letter height as a share of h), pad (side
     padding as a share of h), minW (least width as a multiple of h), weight, track (letter spacing, em). */
  function cell(text, st = {}) {
    const h = st.h || 96, key = [text, st.bg, st.fg, st.border, h, st.minW, st.size, st.pad].join('|');
    let c = cells.get(key); if (c) return c;
    const fs = Math.round(h * (st.size || 0.62)), tr = Math.round(fs * (st.track ?? 0.06));
    x.font = `${st.weight || 700} ${fs}px ${FONT}`; try { x.letterSpacing = tr + 'px'; } catch (e) { /* older canvas */ }
    const tw = Math.ceil(x.measureText(text).width), w = Math.min(S, Math.ceil(Math.max(st.minW ? h * st.minW : 0, tw + h * (st.pad ?? 0.5) * 2)));
    if (sx + w > S) { sx = 0; sy += shelf + 4; shelf = 0; }
    if (sy + h > S) return cells.values().next().value;                 // atlas full: show the first cell rather than fail
    x.fillStyle = st.bg || '#16181c'; x.fillRect(sx, sy, w, h);
    if (st.border) { x.strokeStyle = st.border; x.lineWidth = Math.max(2, h * 0.05); x.strokeRect(sx + h * 0.08, sy + h * 0.08, w - h * 0.16, h - h * 0.16); }
    x.fillStyle = st.fg || '#ffffff'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(text, sx + w / 2 + tr / 2, sy + h / 2 + fs * 0.06);
    c = { u0: (sx + 1.5) / S, u1: (sx + w - 1.5) / S, v0: 1 - (sy + h - 1.5) / S, v1: 1 - (sy + 1.5) / S, aspect: w / h };
    cells.set(key, c); sx += w + 4; shelf = Math.max(shelf, h);
    return c;
  }

  /* A sign between two points on the plan ([x, z]), from height y0 to y1, facing `out` ([x, 0, z]) and standing
     `off` metres proud of the line through them. Which end is the reader's left is worked out here. */
  function board(a, b, y0, y1, out, off, c) {
    let L = a, R = b; if (-(b[1] - a[1]) * out[0] + (b[0] - a[0]) * out[2] < 0) { L = b; R = a; }
    const ox = out[0] * off, oz = out[2] * off, i = pos.length / 3;
    pos.push(L[0] + ox, y0, L[1] + oz, R[0] + ox, y0, R[1] + oz, R[0] + ox, y1, R[1] + oz, L[0] + ox, y1, L[1] + oz);
    for (let k = 0; k < 4; k++) nor.push(out[0], 0, out[2]);
    uv.push(c.u0, c.v0, c.u1, c.v0, c.u1, c.v1, c.u0, c.v1); idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
  }

  // turn the signs added so far into a mesh (called by each builder when it has finished)
  function flush(group) {
    if (!tex) { tex = toTex(cv, { srgb: true, repeat: false, aniso: 8 }); mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55, metalness: 0.03 }); }
    tex.needsUpdate = true;
    if (!idx.length) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
    const m = new THREE.Mesh(g, mat); m.castShadow = false; m.receiveShadow = true; m.matrixAutoUpdate = false; m.name = 'signs'; group.add(m);
    pos = []; nor = []; uv = []; idx = [];
  }
  return { cell, board, flush, count: () => cells.size };
}

export const SIGNS = makeSigns();
