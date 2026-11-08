// Shader warm-up that never blocks the page.
// three.js compiles a program the first time it draws with it, and that draw then waits for the GPU process to finish
// compiling. Chrome and Edge on Windows compile WebGL through Direct3D, where the reef shaders take seconds each, so
// drawing the first frame cold froze the tab for over a minute ("Page unresponsive"). Instead: run one frame with
// drawing switched off and record every draw it would make, start compiling all of those programs at once
// (KHR_parallel_shader_compile compiles them on the GPU process's worker threads), and poll until they are done, so the
// loading screen keeps moving and the page stays responsive.

/**
 * @param renderer  THREE.WebGLRenderer
 * @param frame     renders one frame exactly as the main loop will (it runs with drawing switched off)
 * @param opts.scene    the main scene: every visible group in it is compiled whole, so objects culled or hidden in this
 *                      frame (LODs, creatures not yet spawned) are ready too
 * @param opts.onProgress (fraction done, program count)
 * @returns {{ programs: number, compile(objs: Object3D[]): void }}
 */
export async function warmShaders(renderer, frame, { scene = null, onProgress = () => {} } = {}) {
  const gl = renderer.getContext();
  const ext = gl.getExtension('KHR_parallel_shader_compile');

  // 1. dry run: record each draw with the state that decides its program (target, clipping, scene)
  const draws = [], stack = [];
  const render0 = renderer.render, direct0 = renderer.renderBufferDirect;
  renderer.render = function (sc, camera) { stack.push(sc); try { return render0.call(this, sc, camera); } finally { stack.pop(); } };
  renderer.renderBufferDirect = function (camera, sc, geometry, material, object) {
    draws.push({ camera, scene: sc || stack[stack.length - 1] || null, material, object, rt: renderer.getRenderTarget(), clip: renderer.clippingPlanes.slice() });
  };
  try { frame(); } catch (e) { console.warn('warm-up frame', e); } finally { renderer.render = render0; renderer.renderBufferDirect = direct0; }
  const sceneCtx = draws.find((d) => d.scene === scene);

  // 2. create every program (compile and link only start here; nothing waits on them)
  const progs = [];
  const link0 = gl.linkProgram;
  gl.linkProgram = function (p) { progs.push(p); return link0.call(this, p); };
  const prevRT = renderer.getRenderTarget(), prevClip = renderer.clippingPlanes;
  const compileIn = (d, obj, target) => {
    renderer.setRenderTarget(d.rt); renderer.clippingPlanes = d.clip;
    try { renderer.compile(obj, d.camera, target); } catch (e) { console.warn('warm-up compile', e); }
  };
  try {
    const seen = new Set();
    if (scene) for (const d of draws) {                 // the whole scene, in each target it was drawn into
      if (d.scene !== scene) continue;
      const k = (d.rt ? d.rt.texture.uuid : 'screen') + d.clip.length;
      if (seen.has(k)) continue;
      seen.add(k);
      for (const g of scene.children) if (g.visible) compileIn(d, g, scene);
    }
    for (const d of draws) {                            // each draw as made: shadow casters with their depth materials, passes
      const k = d.material.uuid + (d.rt ? d.rt.texture.uuid : 'screen') + d.clip.length + (d.object.isInstancedMesh ? 'i' : '');
      if (seen.has(k)) continue;
      seen.add(k);
      const o = d.object, kids = o.children, mat = o.material;
      o.children = []; o.material = d.material;
      compileIn(d, o, d.scene || o);
      o.children = kids; o.material = mat;
    }
  } finally {
    gl.linkProgram = link0;
    renderer.setRenderTarget(prevRT); renderer.clippingPlanes = prevClip;
  }

  // later: start compiling more of the main scene (objects hidden now) in the same state, without waiting for it
  const result = {
    programs: progs.length,
    compile(objs) {
      if (!sceneCtx) return;
      const prevRT = renderer.getRenderTarget(), prevClip = renderer.clippingPlanes;
      for (const o of objs) if (o) compileIn(sceneCtx, o, scene);
      renderer.setRenderTarget(prevRT); renderer.clippingPlanes = prevClip;
    },
  };

  // 3. wait for the GPU process, without blocking (no extension: the first draw waits instead, nothing to poll)
  if (!ext || !progs.length) { onProgress(1, progs.length); return result; }
  let pending = progs;
  while (pending.length && !gl.isContextLost()) {
    pending = pending.filter((p) => !gl.getProgramParameter(p, ext.COMPLETION_STATUS_KHR));
    onProgress(1 - pending.length / progs.length, progs.length);
    if (pending.length) await new Promise((r) => setTimeout(r, 50));
  }
  return result;
}
