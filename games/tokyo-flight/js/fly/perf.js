// perf.js — what this device is given to draw, and a governor that keeps the frame rate up while flying.
//
// Four tiers. The two light ones stream the survey's photo-free building sets (real shapes, a sixth of the
// download, nothing large to decode) and colour the roofs from the aerial photo; the two heavy ones stream the
// photo-textured sets. Everything else scales with it: resolution, how far out buildings are opened, how small
// a building may get before it is left out, shadow maps, the aircraft model (`jet` while flying; `jetFilm` in the
// hangar, where the camera is close enough to see the difference).
export const TIERS = {
  phone: { label: 'Phone', dpr: 2, pixels: 1.25e6, aa: false, err: 38, fall: 36, gb: 0.30, tex: 512, near: 512, lite: true, reach: 5200, kinds: ['bldg', 'brid'],
    terrPx: 2.4, maxZ: 16, aniso: 2, cascades: [], csize: [], jetShadow: 1024, jet: 'lo', jetFilm: 'hi', bake: [2048, 1024], parse: 2, down: 8, terrActive: 8, tilesPerFrame: 1, slowMs: 30 },
  low: { label: 'Low', dpr: 1, pixels: 1.6e6, aa: true, err: 30, fall: 28, gb: 0.6, tex: 1024, near: 1024, lite: true, reach: 7000, kinds: ['bldg', 'brid'],
    terrPx: 1.9, maxZ: 17, aniso: 4, cascades: [600], csize: [2048], jetShadow: 1024, jet: 'lo', jetFilm: 'hi', bake: [2048, 1024], parse: 3, down: 10, terrActive: 10, tilesPerFrame: 1, slowMs: 24 },
  mid: { label: 'Medium', dpr: 1.25, pixels: 2.6e6, aa: true, err: 22, fall: 16, gb: 1.6, tex: 1024, near: 2048, lite: false, reach: 10000, kinds: ['bldg', 'brid'],
    terrPx: 1.4, maxZ: 18, aniso: 8, cascades: [420, 2400], csize: [2048, 2048], jetShadow: 2048, jet: 'hi', bake: [4096, 2048], parse: 4, down: 14, terrActive: 14, tilesPerFrame: 1, slowMs: 21 },
  high: { label: 'High', dpr: 2, pixels: 6e6, aa: true, err: 16, fall: 9, gb: 4.0, tex: 2048, near: 2048, lite: false, reach: 16000, kinds: ['bldg', 'brid'],
    terrPx: 1.05, maxZ: 18, aniso: 8, cascades: [320, 1300, 5200], csize: [4096, 4096, 4096], jetShadow: 2048, jet: 'hi', bake: [4096, 2048], parse: 6, down: 18, terrActive: 14, tilesPerFrame: 2, slowMs: 20 },
};

// Which graphics device this window is really drawing with. A browser can quietly fall back to drawing on the
// processor (graphics process crashed, or acceleration switched off); that has to be seen, not guessed at.
export function graphicsDevice() {
  try {
    const gl = document.createElement('canvas').getContext('webgl2', { powerPreference: 'high-performance' });
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const raw = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    const maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    const software = /Basic Render|SwiftShader|llvmpipe|Software|WARP/i.test(raw);
    const m = raw.match(/ANGLE \([^,]*,\s*([^,(]+?)\s*(?:\(0x|Direct3D|,)/);
    return { raw, software, maxTex, name: software ? 'Processor only (no GPU)' : (m ? m[1] : raw).replace(/\s+/g, ' ').trim().slice(0, 34) };
  } catch { return { raw: '', software: false, maxTex: 4096, name: 'unknown' }; }
}

export function pickTier(Q, GFX) {
  const asked = Q.get('q');
  if (TIERS[asked]) return asked;
  let saved = null;
  try { saved = localStorage.getItem('tokyo.tier'); } catch { /* private window */ }
  if (TIERS[saved]) return saved;
  const ua = navigator.userAgent, touch = navigator.maxTouchPoints > 1;
  const phone = /Android.*Mobile|iPhone|iPod/i.test(ua) || (touch && Math.min(screen.width, screen.height) < 600);
  const tablet = !phone && (/iPad|Android/i.test(ua) || (touch && /Macintosh/i.test(ua)));
  const mem = navigator.deviceMemory || 8;
  if (GFX.software || phone) return 'phone';
  if (tablet || mem <= 4) return 'low';
  if (/RTX|GTX 1[0-9]|GTX 9[78]|Radeon (RX|Pro)|Arc\(TM\) [AB]|Apple M\d|Quadro|GeForce/i.test(GFX.raw)) return 'high';
  if (/Intel.*(HD|UHD) Graphics|Mali|Adreno|PowerVR/i.test(GFX.raw)) return 'low';
  return 'mid';
}

// Holds the frame rate. When frames run slow for a second and a half it first draws fewer pixels, then leaves
// out more small buildings; when there is plenty of room for several seconds it gives them back in the reverse order.
export class Governor {
  constructor(tier, apply) {
    this.tier = tier; this.apply = apply;
    this.scale = 1; this.detail = 1;                 // resolution multiplier (0.55..1), detail multiplier on the error targets (1..2.2)
    this.ema = 16; this.work = 4; this.slow = 0; this.fast = 0; this.rate = 16.7; this.floor = 1e9; this.floorT = 0;
    this.enabled = true; this.hold = 0;
  }
  // dt: seconds since the last frame; workMs: time this page spent building the frame
  frame(dt, workMs) {
    const ms = Math.min(dt * 1000, 120);
    this.ema += (ms - this.ema) * 0.08; this.work += (workMs - this.work) * 0.08;
    this.floor = Math.min(this.floor, ms); this.floorT += dt;
    if (this.floorT > 3) { this.rate = Math.max(4, Math.min(34, this.floor)); this.floor = 1e9; this.floorT = 0; }    // the screen's own interval
    if (!this.enabled) return;
    if (this.hold > 0) { this.hold -= dt; return; }
    const limit = Math.max(this.tier.slowMs, this.rate * 1.3);
    if (this.ema > limit) { this.slow += dt; this.fast = 0; } else if (this.ema < Math.max(this.rate * 1.12, 17.5) && this.work < this.rate * 0.5) { this.fast += dt; this.slow = 0; } else { this.slow = Math.max(0, this.slow - dt); this.fast = 0; }
    let changed = false;
    if (this.slow > 1.5) {
      if (this.scale > 0.56) { this.scale = Math.max(0.55, this.scale * 0.86); changed = true; }
      else if (this.detail < 2.2) { this.detail = Math.min(2.2, this.detail * 1.25); changed = true; }
      this.slow = 0; this.hold = 1.2;
    } else if (this.fast > 5) {
      if (this.detail > 1.001) { this.detail = Math.max(1, this.detail / 1.25); changed = true; }
      else if (this.scale < 0.999) { this.scale = Math.min(1, this.scale / 0.9); changed = true; }
      this.fast = 0; this.hold = 2;
    }
    if (changed) this.apply(this.scale, this.detail);
  }
}
