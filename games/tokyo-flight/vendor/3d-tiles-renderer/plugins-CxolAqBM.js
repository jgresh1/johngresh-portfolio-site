import { A as e, M as t, N as n, b as r, c as i, p as a, v as o } from "./renderer-k6QvS8mu.js";
import { c as s, d as c, m as l, o as u, s as d } from "./renderer-SRMU5zhW.js";
import { a as f, c as p, n as m, s as h, t as g } from "./plugins-CNRzAo_d.js";
import { BatchedMesh as _, Box2 as v, Box3 as y, Box3Helper as b, BoxGeometry as x, BufferAttribute as S, BufferGeometry as C, CanvasTexture as w, Color as T, CustomBlending as E, DataTexture as D, DefaultLoadingManager as O, DoubleSide as k, EventDispatcher as A, FileLoader as ee, FloatType as j, Frustum as M, GreaterDepth as te, Group as ne, LineBasicMaterial as re, LineSegments as ie, LinearFilter as ae, LinearMipMapLinearFilter as oe, MathUtils as N, Matrix2 as se, Matrix3 as ce, Matrix4 as P, Mesh as F, MeshBasicMaterial as le, MeshLambertMaterial as ue, MeshStandardMaterial as de, NearestFilter as fe, OneFactor as pe, PlaneGeometry as me, Points as he, PointsMaterial as ge, Quaternion as _e, REVISION as ve, RGBAIntegerFormat as ye, RGFormat as be, Ray as xe, Raycaster as Se, RedFormat as Ce, SRGBColorSpace as we, ShaderMaterial as Te, Source as Ee, Sphere as De, SphereGeometry as Oe, Texture as ke, TextureUtils as Ae, Triangle as je, UnsignedByteType as Me, Vector2 as I, Vector3 as L, Vector4 as Ne, WebGLArrayRenderTarget as Pe, WebGLRenderTarget as Fe, WebGLRenderer as Ie, ZeroFactor as Le } from "three";
import { GLTFLoader as Re } from "three/addons/loaders/GLTFLoader.js";
import { FullScreenQuad as ze } from "three/addons/postprocessing/Pass.js";
// src/three/plugins/images/utils/getCartographicToMeterDerivative.js
var Be = /* @__PURE__ */ new L(), Ve = /* @__PURE__ */ new L();
function He(e, t, n) {
	let r = 1e-5, i = n + r, a = t + r;
	Math.abs(a) > Math.PI / 2 && (a -= r), e.getCartographicToPosition(t, n, 0, Be), e.getCartographicToPosition(a, n, 0, Ve);
	let o = Be.distanceTo(Ve) / r;
	return e.getCartographicToPosition(t, i, 0, Ve), [Be.distanceTo(Ve) / r, o];
}
// src/three/plugins/images/utils/ProjectionScheme.js
var Ue = 1e-5, We = 1.340264, Ge = -.081106, Ke = 893e-6, qe = .003796, Je = Math.sqrt(3) / 2, Ye = 1e-12, Xe = 12;
function Ze(e, t, n) {
	let r = Math.asin(Je * Math.sin(t)), i = r * r, a = i * i * i;
	return n[0] = e * Math.cos(r) / (Je * (We + 3 * Ge * i + a * (7 * Ke + 9 * qe * i))), n[1] = r * (We + Ge * i + a * (Ke + qe * i)), n;
}
function Qe(e, t, n) {
	let r = t, i = r * r, a = i * i * i;
	for (let e = 0; e < Xe; e++) {
		let e = (r * (We + Ge * i + a * (Ke + qe * i)) - t) / (We + 3 * Ge * i + a * (7 * Ke + 9 * qe * i));
		if (r -= e, i = r * r, a = i * i * i, Math.abs(e) < Ye) break;
	}
	return n[0] = Je * e * (We + 3 * Ge * i + a * (7 * Ke + 9 * qe * i)) / Math.cos(r), n[1] = Math.asin(Math.sin(r) / Je), n;
}
var $e = Ze(Math.PI, 0, [0, 0])[0], et = Ze(0, Math.PI / 2, [0, 0])[1], tt = [0, 0], nt = [0, 0], R = class {
	get isMercator() {
		return this.scheme === "EPSG:3857";
	}
	get isCartographic() {
		return this.scheme !== "none";
	}
	constructor(e = "EPSG:4326") {
		this.scheme = e, this.tileCountX = 1, this.tileCountY = 1, this.setScheme(e);
	}
	setScheme(e) {
		switch (this.scheme = e, e) {
			case "CRS:84":
			case "EPSG:4326":
				this.tileCountX = 2, this.tileCountY = 1;
				break;
			case "EPSG:3857":
				this.tileCountX = 1, this.tileCountY = 1;
				break;
			case "EPSG:8857":
				this.tileCountX = 1, this.tileCountY = 1;
				break;
			case "none":
				this.tileCountX = 1, this.tileCountY = 1;
				break;
			default: throw Error(`ProjectionScheme: Unknown projection scheme "${e}"`);
		}
	}
	getDerivativeAtNormalizedPoint(e, t, n = [0, 0]) {
		let r = Math.max(e - Ue, 0), i = Math.min(e + Ue, 1), a = Math.max(t - Ue, 0), o = Math.min(t + Ue, 1), s = this.fromNormalizedToCartographic(r, t, nt)[0], c = this.fromNormalizedToCartographic(i, t, nt)[0];
		n[0] = Math.abs(c - s) / (i - r);
		let l = this.fromNormalizedToCartographic(e, a, nt)[1], u = this.fromNormalizedToCartographic(e, o, nt)[1];
		return n[1] = Math.abs(u - l) / (o - a), n;
	}
	getBounds() {
		return this.scheme === "none" ? [
			0,
			0,
			1,
			1
		] : [
			this.fromNormalizedToCartographic(0, .5, tt)[0],
			this.fromNormalizedToCartographic(.5, 0, tt)[1],
			this.fromNormalizedToCartographic(1, .5, tt)[0],
			this.fromNormalizedToCartographic(.5, 1, tt)[1]
		];
	}
	fromCartographicToNormalized(e, t, n = [0, 0]) {
		switch (this.scheme) {
			case "none":
				n[0] = e, n[1] = t;
				break;
			case "EPSG:3857": {
				let r = Math.log(Math.tan(Math.PI / 4 + t / 2));
				n[0] = (e + Math.PI) / (2 * Math.PI), n[1] = 1 / 2 + 1 * r / (2 * Math.PI);
				break;
			}
			case "EPSG:8857":
				Ze(e, t, n), n[0] = N.mapLinear(n[0], -$e, $e, 0, 1), n[1] = N.mapLinear(n[1], -et, et, 0, 1);
				break;
			default: n[0] = (e + Math.PI) / (2 * Math.PI), n[1] = N.mapLinear(t, -Math.PI / 2, Math.PI / 2, 0, 1);
		}
		return n;
	}
	fromCartographicToNormalizedRange(e) {
		return [...this.fromCartographicToNormalized(e[0], e[1]), ...this.fromCartographicToNormalized(e[2], e[3])];
	}
	fromNormalizedToCartographic(e, t, n = [0, 0]) {
		switch (this.scheme) {
			case "none":
				n[0] = e, n[1] = t;
				break;
			case "EPSG:3857": {
				let r = N.mapLinear(t, 0, 1, -1, 1);
				n[0] = N.mapLinear(e, 0, 1, -Math.PI, Math.PI), n[1] = 2 * Math.atan(Math.exp(r * Math.PI)) - Math.PI / 2;
				break;
			}
			case "EPSG:8857":
				Qe(N.mapLinear(e, 0, 1, -$e, $e), N.mapLinear(t, 0, 1, -et, et), n);
				break;
			default: n[0] = N.mapLinear(e, 0, 1, -Math.PI, Math.PI), n[1] = N.mapLinear(t, 0, 1, -Math.PI / 2, Math.PI / 2);
		}
		return n;
	}
	fromNormalizedToCartographicRange(e) {
		return [...this.fromNormalizedToCartographic(e[0], e[1]), ...this.fromNormalizedToCartographic(e[2], e[3])];
	}
	getProjectedExtents() {
		switch (this.scheme) {
			case "EPSG:3857": return [2 * Math.PI, 2 * Math.PI];
			case "EPSG:8857": return [2 * $e, 2 * et];
			case "none": return [1, 1];
			default: return [2 * Math.PI, Math.PI];
		}
	}
	clampToBounds(e, t = !1) {
		let n = [...e], r;
		r = t ? [
			0,
			0,
			1,
			1
		] : this.getBounds();
		let [i, a, o, s] = r;
		return n[0] = N.clamp(n[0], i, o), n[2] = N.clamp(n[2], i, o), n[1] = N.clamp(n[1], a, s), n[3] = N.clamp(n[3], a, s), n;
	}
}, rt = [0, 0];
function it(e, t) {
	let [n, r, i, a] = e, [o, s, c, l] = t;
	return !(n >= c || i <= o || r >= l || a <= s);
}
var at = class {
	get levelCount() {
		return this._levels.length;
	}
	get maxLevel() {
		return this.levelCount - 1;
	}
	get minLevel() {
		let e = this._levels;
		for (let t = 0; t < e.length; t++) if (e[t] !== null) return t;
		return -1;
	}
	get contentBounds() {
		return this._contentBounds ?? this.projection.getBounds();
	}
	get aspectRatio() {
		let { pixelWidth: e, pixelHeight: t } = this.getLevel(this.maxLevel);
		return e / t;
	}
	constructor() {
		this.flipY = !1, this.pixelOverlap = 0, this._contentBounds = null, this.projection = new R("none"), this._levels = [];
	}
	setLevel(e, t = {}) {
		let n = this._levels;
		for (; n.length < e;) n.push(null);
		let { tileSplitX: r = 2, tileSplitY: i = 2 } = t, { tilePixelWidth: a = 256, tilePixelHeight: o = 256, tileCountX: s = r ** e, tileCountY: c = i ** e, tileBounds: l = null } = t, { pixelWidth: u = a * s, pixelHeight: d = o * c } = t;
		n[e] = {
			tilePixelWidth: a,
			tilePixelHeight: o,
			pixelWidth: u,
			pixelHeight: d,
			tileCountX: s,
			tileCountY: c,
			tileSplitX: r,
			tileSplitY: i,
			tileBounds: l
		};
	}
	generateLevels(e, t, n, r = {}) {
		let { minLevel: i = 0, tilePixelWidth: a = 256, tilePixelHeight: o = 256 } = r, s = e - 1, { pixelWidth: c = a * t * 2 ** s, pixelHeight: l = o * n * 2 ** s } = r;
		for (let t = i; t < e; t++) {
			let n = e - t - 1, r = Math.ceil(c * 2 ** -n), i = Math.ceil(l * 2 ** -n), s = Math.ceil(r / a), u = Math.ceil(i / o);
			this.setLevel(t, {
				tilePixelWidth: a,
				tilePixelHeight: o,
				pixelWidth: r,
				pixelHeight: i,
				tileCountX: s,
				tileCountY: u
			});
		}
	}
	getLevel(e) {
		return this._levels[e];
	}
	setContentBounds(e, t, n, r) {
		this._contentBounds = [
			e,
			t,
			n,
			r
		];
	}
	setProjection(e) {
		this.projection = e;
	}
	getTileAtPoint(e, t, n, r = !1) {
		let { flipY: i } = this, { tileCountY: a, tileBounds: o, pixelHeight: s, pixelWidth: c, tilePixelHeight: l, tilePixelWidth: u } = this.getLevel(n), d = u / c, f = l / s;
		if (r || ([e, t] = this.fromCartographicToNormalized(e, t, rt)), o) {
			let n = this.fromCartographicToNormalizedRange(o);
			e = N.mapLinear(e, n[0], n[2], 0, 1), t = N.mapLinear(t, n[1], n[3], 0, 1);
		}
		let p = Math.floor(e / d), m = Math.floor(t / f);
		return i && (m = a - 1 - m), [p, m];
	}
	getTilesInRange(e, t, n, r, i, a = !1) {
		let o = [
			e,
			t,
			n,
			r
		], s = this.getContentBounds(a), c = this.getLevel(i).tileBounds;
		if (!it(o, s) || c && (a && (c = this.fromCartographicToNormalizedRange(c)), !it(o, c))) return [
			0,
			0,
			-1,
			-1
		];
		let [l, u, d, f] = this.clampToContentBounds(o, a), p = this.getTileAtPoint(l, u, i, a), m = this.getTileAtPoint(d, f, i, a);
		this.flipY && ([p[1], m[1]] = [m[1], p[1]]);
		let { tileCountX: h, tileCountY: g } = this.getLevel(i), [_, v] = p, [y, b] = m;
		return y < 0 || b < 0 || _ >= h || v >= g ? [
			0,
			0,
			-1,
			-1
		] : [
			N.clamp(_, 0, h - 1),
			N.clamp(v, 0, g - 1),
			N.clamp(y, 0, h - 1),
			N.clamp(b, 0, g - 1)
		];
	}
	getTileExists(e, t, n) {
		let r = this.getTileBounds(e, t, n), [i, a, o, s] = r;
		return !(i >= o || a >= s) && it(r, this.contentBounds);
	}
	getContentBounds(e = !1) {
		return e ? this.fromCartographicToNormalizedRange(this.contentBounds) : [...this.contentBounds];
	}
	getTileContentUVBounds(e, t, n) {
		let [r, i, a, o] = this.getTileBounds(e, t, n, !0, !0), [s, c, l, u] = this.getTileBounds(e, t, n, !0, !1);
		return [
			N.mapLinear(r, s, l, 0, 1),
			N.mapLinear(i, c, u, 0, 1),
			N.mapLinear(a, s, l, 0, 1),
			N.mapLinear(o, c, u, 0, 1)
		];
	}
	getTileBounds(e, t, n, r = !1, i = !0) {
		let { flipY: a, pixelOverlap: o } = this, { tilePixelWidth: s, tilePixelHeight: c, pixelWidth: l, pixelHeight: u, tileBounds: d } = this.getLevel(n), f = s * e - o, p = c * t - o, m = f + s + o * 2, h = p + c + o * 2;
		if (f = Math.max(f, 0), p = Math.max(p, 0), m = Math.min(m, l), h = Math.min(h, u), f /= l, m /= l, p /= u, h /= u, a) {
			let e = (h - p) / 2, t = 1 - (p + h) / 2;
			p = t - e, h = t + e;
		}
		let g = [
			f,
			p,
			m,
			h
		];
		if (d) {
			let e = this.fromCartographicToNormalizedRange(d);
			g[0] = N.mapLinear(g[0], 0, 1, e[0], e[2]), g[2] = N.mapLinear(g[2], 0, 1, e[0], e[2]), g[1] = N.mapLinear(g[1], 0, 1, e[1], e[3]), g[3] = N.mapLinear(g[3], 0, 1, e[1], e[3]);
		}
		return i && (g = this.clampToBounds(g, !0)), r || (g = this.fromNormalizedToCartographicRange(g)), g;
	}
	fromCartographicToNormalized(e, t, n) {
		return this.projection.fromCartographicToNormalized(e, t, n);
	}
	fromCartographicToNormalizedRange(e) {
		return this.projection.fromCartographicToNormalizedRange(e);
	}
	fromNormalizedToCartographic(e, t, n) {
		return this.projection.fromNormalizedToCartographic(e, t, n);
	}
	fromNormalizedToCartographicRange(e) {
		return this.projection.fromNormalizedToCartographicRange(e);
	}
	clampToContentBounds(e, t = !1) {
		let n = [...e], [r, i, a, o] = this.getContentBounds(t);
		return n[0] = N.clamp(n[0], r, a), n[1] = N.clamp(n[1], i, o), n[2] = N.clamp(n[2], r, a), n[3] = N.clamp(n[3], i, o), n;
	}
	clampToBounds(e, t = !1) {
		return this.projection.clampToBounds(e, t);
	}
}, ot = [0, 0], st = class {
	constructor(e = new R()) {
		this.isProjectedSurface = !0, this.projection = e, this.scale = new I(1, 1), this.offset = new I(0, 0);
	}
	getCartographicToPosition(e, t, n, r) {
		let { projection: i } = this;
		if (!i.isCartographic) throw Error("ProjectedSurface: The projection is not cartographic.");
		let [a, o] = i.fromCartographicToNormalized(t, e, ot);
		return this.getNormalizedToPosition(a, o, n, r);
	}
	getPositionToCartographic(e, t) {
		let { projection: n, scale: r, offset: i } = this;
		if (!n.isCartographic) throw Error("ProjectedSurface: The projection is not cartographic.");
		let a = (e.x - i.x) / r.x, o = (e.y - i.y) / r.y, [s, c] = n.fromNormalizedToCartographic(a, o, ot);
		return t.lon = s, t.lat = c, t.height = e.z, t;
	}
	getNormalizedToPosition(e, t, n, r) {
		let { scale: i, offset: a } = this;
		return r.set(e * i.x + a.x, t * i.y + a.y, n);
	}
	getCartographicToNormal(e, t, n) {
		return n.set(0, 0, 1);
	}
	getPositionToNormal(e, t) {
		return t.set(0, 0, 1);
	}
}, ct = Symbol("TILE_X"), lt = Symbol("TILE_Y"), ut = Symbol("TILE_LEVEL"), dt = 30, ft = 15, pt = 20, mt = Symbol("OVERLAY_RANGE"), ht = Symbol("OVERLAY_LEVEL"), z = /* @__PURE__ */ new L(), gt = /* @__PURE__ */ new L(), _t = /* @__PURE__ */ new De(), vt = [0, 0], yt = class {
	get shape() {
		return console.warn("GeneratedSurfacePlugin: \"shape\" is deprecated. Use \"projection\" instead."), this.projection === "ellipsoid" ? "ellipsoid" : "planar";
	}
	set shape(e) {
		console.warn("GeneratedSurfacePlugin: \"shape\" is deprecated. Use \"projection\" instead."), this.projection = e === "planar" ? "source" : "ellipsoid";
	}
	constructor(e = {}) {
		let { overlay: t = null, shape: n = null, projection: r = null, endCaps: i = !0, center: a = !0, useRecommendedSettings: o = !0, applyOverlayTexture: s = !1 } = e;
		this.priority = -10, this.tiles = null, this.overlay = t, this.projection = r ?? "ellipsoid", n !== null && (console.warn("GeneratedSurfacePlugin: \"shape\" is deprecated. Use \"projection\" instead."), r === null && (this.projection = n === "planar" ? "source" : "ellipsoid")), this.endCaps = i, this.center = a, this.useRecommendedSettings = o, this.applyOverlayTexture = s, this._tiling = null;
	}
	init(e) {
		this.useRecommendedSettings && (e.errorTarget = 1), this.tiles = e;
	}
	async loadRootTileset() {
		let { overlay: e } = this;
		e ? (await e.init(), this._tiling = e.tiling || this._createDefaultTiling()) : this._tiling = this._createDefaultTiling();
		let { projection: t } = this, n = t === "ellipsoid" || t === "source" ? this._tiling.projection : new R(t), r;
		if (n.isCartographic) {
			let [e, t] = n.getProjectedExtents();
			r = e / t;
		} else r = this._tiling.aspectRatio;
		if (!(n.isCartographic && this.projection === "ellipsoid")) {
			let e = new st(n);
			e.scale.set(r, 1), this.center && e.offset.set(-r / 2, -.5), this.tiles.surface = e;
		}
		return this.getTileset();
	}
	async parseToMesh(e, t, n, r, i) {
		if (n !== "generated_surface") return null;
		let a = this._createSurfaceMesh(t), { overlay: o, applyOverlayTexture: s } = this;
		if (o && s) {
			let e = t[ct], n = t[lt], r = t[ut], s = this._tiling.getTileBounds(e, n, r, !0, !1);
			if (o.hasContent(s, r)) {
				try {
					await o.lockTexture(s, r);
				} catch (e) {
					if (e.name !== "AbortError") throw e;
					return null;
				}
				let e = o.getTexture(s, r);
				if (t[mt] = s, t[ht] = r, i.aborted) return o.releaseTexture(s, r), delete t[mt], delete t[ht], null;
				a.material.map = e, a.material.needsUpdate = !0;
			}
		}
		return a;
	}
	preprocessNode(e) {
		let t = this._tiling.maxLevel;
		e[ut] < t && e.parent !== null && this.expandChildren(e);
	}
	disposeTile(e) {
		let t = e[mt];
		this.overlay && t && (this.overlay.releaseTexture(t, e[ht]), delete e[mt], delete e[ht]);
	}
	dispose() {
		this.tiles.forEachLoadedModel((e, t) => {
			this.disposeTile(t);
		});
	}
	getCartographicFromPosition(e, t = {}) {
		return console.warn("GeneratedSurfacePlugin: \"getCartographicFromPosition\" is deprecated. Use \"TilesRenderer.surface\" instead."), this.tiles.surface.getPositionToCartographic(e, t);
	}
	getPositionFromCartographic(e, t, n = new L()) {
		return console.warn("GeneratedSurfacePlugin: \"getPositionFromCartographic\" is deprecated. Use \"TilesRenderer.surface\" instead."), this.tiles.surface.getCartographicToPosition(e, t, 0, n);
	}
	_createSurfaceMesh(e) {
		let { tiles: t, endCaps: n, _tiling: r } = this, { surface: i } = t, { projection: a } = r, o = e[ut], s = e[ct], c = e[lt], [l, u, d, f] = r.getTileBounds(s, c, o), p = Math.max(ft, Math.ceil((f - u) * N.RAD2DEG * .25)), m = Math.max(dt, Math.ceil((d - l) * N.RAD2DEG * .25)), h = m + 3, g = p + 3, _ = new me(1, 1, m + 2, p + 2), [v, y, b, x] = r.getTileBounds(s, c, o, !0, !0), S = r.getTileContentUVBounds(s, c, o), C = n && !(i.projection && i.projection.isMercator), { position: w, normal: T, uv: E } = _.attributes, D = w.count;
		e.engineData.boundingVolume.getSphere(_t);
		for (let t = 0; t < D; t++) {
			let n = t % h, r = Math.floor(t / h), o = n === 0 || n === h - 1 || r === 0 || r === g - 1, s = Math.max(1, Math.min(h - 2, n)), c = Math.max(1, Math.min(g - 2, r)), l = (s - 1) / m, d = 1 - (c - 1) / p, _ = N.mapLinear(l, 0, 1, v, b), D = N.mapLinear(d, 0, 1, y, x), O = _, k = D;
			if (a.isCartographic) {
				let e = a.fromNormalizedToCartographic(_, D, vt), t = e[0], n = e[1];
				if (a.isMercator && C && (x === 1 && d === 1 && (n = Math.PI / 2), y === 0 && d === 0 && (n = -Math.PI / 2)), a.isMercator && d !== 0 && d !== 1) {
					let e = a.fromNormalizedToCartographic(.5, 1, vt)[1], t = 1 / p, r = N.mapLinear(d - t, 0, 1, u, f), i = N.mapLinear(d + t, 0, 1, u, f);
					n > e && r < e && (n = e), n < -e && i > -e && (n = -e);
				}
				i.getCartographicToPosition(n, t, 0, z).sub(_t.center), i.getCartographicToNormal(n, t, gt), a.fromCartographicToNormalized(t, n, vt), O = vt[0], k = vt[1];
			} else i.getNormalizedToPosition(_, D, 0, z).sub(_t.center), i.getCartographicToNormal(0, 0, gt);
			o && z.addScaledVector(gt, -e.geometricError);
			let A = N.mapLinear(O, v, b, S[0], S[2]), ee = N.mapLinear(k, y, x, S[1], S[3]);
			w.setXYZ(t, z.x, z.y, z.z), T.setXYZ(t, gt.x, gt.y, gt.z), E.setXY(t, A, ee);
		}
		let O = new F(_, new le());
		return O.position.copy(_t.center), O;
	}
	getTileset() {
		let { tiles: e, _tiling: t } = this, n = t.minLevel, { tileCountX: r, tileCountY: i } = t.getLevel(n), a = [];
		for (let e = 0; e < r; e++) for (let t = 0; t < i; t++) {
			let r = this.createChild(e, t, n);
			r !== null && a.push(r);
		}
		let o = {
			asset: { version: "1.1" },
			geometricError: Infinity,
			root: {
				refine: "REPLACE",
				geometricError: Infinity,
				boundingVolume: this.createBoundingVolume(0, 0, -1),
				children: a,
				[ut]: -1,
				[ct]: 0,
				[lt]: 0
			}
		};
		return e.preprocessTileset(o, ""), o;
	}
	getUrl() {
		return "tile.generated_surface";
	}
	fetchData(e) {
		if (/generated_surface/.test(e)) return /* @__PURE__ */ new ArrayBuffer();
	}
	createBoundingVolume(e, t, n, r = 0) {
		let { _tiling: i, endCaps: a } = this, { surface: o } = this.tiles, s = n === -1;
		if (o.isEllipsoid) {
			let o, c;
			return s ? (o = i.getContentBounds(!0), c = i.getContentBounds()) : (o = i.getTileBounds(e, t, n, !0, !0), c = i.getTileBounds(e, t, n, !1, !0)), a && (o[3] === 1 && (c[3] = Math.PI / 2), o[1] === 0 && (c[1] = -Math.PI / 2)), { region: [
				...c,
				-r,
				1
			] };
		}
		{
			let r;
			r = s ? i.getContentBounds(!0) : i.getTileBounds(e, t, n, !0);
			let [c, l, u, d] = r, f = N.clamp(i.projection.fromCartographicToNormalized(0, 0, vt)[1], l, d), p = Infinity, m = Infinity, h = -Infinity, g = -Infinity;
			for (let e of [
				l,
				d,
				f
			]) for (let t of [c, u]) {
				if (i.projection.isCartographic) {
					let [n, r] = i.projection.fromNormalizedToCartographic(t, e, vt), s = r;
					a && !o.projection.isMercator && (e === 1 && (s = Math.PI / 2), e === 0 && (s = -Math.PI / 2)), o.getCartographicToPosition(s, n, 0, z);
				} else o.getNormalizedToPosition(t, e, 0, z);
				p = Math.min(p, z.x), m = Math.min(m, z.y), h = Math.max(h, z.x), g = Math.max(g, z.y);
			}
			let _ = { box: [
				(p + h) / 2,
				(m + g) / 2,
				0,
				(h - p) / 2,
				0,
				0,
				0,
				(g - m) / 2,
				0,
				0,
				0,
				0
			] };
			return i.projection.isCartographic && (_.cartographicRange = s ? i.getContentBounds() : i.getTileBounds(e, t, n)), _;
		}
	}
	createChild(e, t, n) {
		let { _tiling: r } = this, { projection: i } = r;
		if (!r.getTileExists(e, t, n)) return null;
		let a, { surface: o } = this.tiles, s = o.isEllipsoid;
		if (s) {
			let [o, s, c, l] = r.getTileBounds(e, t, n, !0), { tilePixelWidth: u, tilePixelHeight: d } = r.getLevel(n), f = (c - o) / u, p = (l - s) / d, [, m, h, g] = r.getTileBounds(e, t, n), _ = m > 0 == g > 0 ? Math.min(Math.abs(m), Math.abs(g)) : 0, v = i.fromCartographicToNormalized(0, _, vt)[1], [y, b] = i.getDerivativeAtNormalizedPoint(o, v, vt), [x, S] = He(this.tiles.ellipsoid, _, h);
			a = Math.max(f * y * x, p * b * S);
		} else {
			let { pixelWidth: e, pixelHeight: t } = r.getLevel(n);
			a = Math.max(o.scale.x / e, o.scale.y / t);
		}
		return {
			refine: "REPLACE",
			geometricError: a,
			boundingVolume: this.createBoundingVolume(e, t, n, s ? a : 0),
			content: { uri: this.getUrl(e, t, n) },
			children: [],
			[ct]: e,
			[lt]: t,
			[ut]: n
		};
	}
	expandChildren(e) {
		let t = e[ut], n = e[ct], r = e[lt], { tileSplitX: i, tileSplitY: a } = this._tiling.getLevel(t);
		for (let o = 0; o < i; o++) for (let s = 0; s < a; s++) {
			let c = this.createChild(i * n + o, a * r + s, t + 1);
			c && e.children.push(c);
		}
	}
	_createDefaultTiling() {
		let e = new at();
		if (this.projection === "ellipsoid") {
			let t = new R("EPSG:3857");
			e.setProjection(t), e.generateLevels(pt, t.tileCountX, t.tileCountY);
		} else {
			let t = new R("none");
			e.setProjection(t), e.generateLevels(pt, 1, 1);
		}
		return e;
	}
}, bt = class extends DOMException {
	constructor() {
		super("DataCache: Item removed", "AbortError");
	}
};
function xt(...e) {
	return e.join("_");
}
var St = class {
	constructor() {
		this.cache = {}, this.count = 0, this.cachedBytes = 0, this.active = 0;
	}
	fetchItem(e, t) {}
	disposeItem(e, t) {}
	getMemoryUsage(e) {
		return 0;
	}
	setData(...e) {
		let { cache: t } = this, n = e.pop(), r = xt(...e);
		if (r in t) throw Error(`DataCache: "${r}" is already present.`);
		return this.cache[r] = {
			abortController: new AbortController(),
			result: n,
			count: 1,
			bytes: this.getMemoryUsage(n)
		}, this.count++, this.cachedBytes += this.cache[r].bytes, n;
	}
	lock(...e) {
		let { cache: t } = this, n = xt(...e);
		if (n in t) t[n].count++;
		else {
			let t = new AbortController(), r = {
				abortController: t,
				result: null,
				count: 1,
				bytes: 0,
				args: e
			};
			this.active++, r.result = this.fetchItem(e, t.signal), r.result instanceof Promise ? r.result = r.result.then((e) => (t.signal.throwIfAborted(), r.result = e, r.bytes = this.getMemoryUsage(e), this.cachedBytes += r.bytes, e)).finally(() => {
				this.active--;
			}) : (this.active--, r.bytes = this.getMemoryUsage(r.result), this.cachedBytes += r.bytes), this.cache[n] = r, this.count++;
		}
		return t[n].result;
	}
	release(...e) {
		let t = xt(...e);
		this.releaseViaFullKey(t);
	}
	get(...e) {
		let { cache: t } = this, n = xt(...e);
		return n in t && t[n].count > 0 ? t[n].result : null;
	}
	has(...e) {
		let { cache: t } = this;
		return xt(...e) in t;
	}
	forEachItem(e) {
		let { cache: t } = this;
		for (let n in t) {
			let r = t[n];
			r.result instanceof Promise || e(r.result, r.args);
		}
	}
	dispose() {
		let { cache: e } = this;
		for (let t in e) {
			let { abortController: n } = e[t];
			n.abort(new bt()), this.releaseViaFullKey(t, !0);
		}
		this.cache = {};
	}
	releaseViaFullKey(e, t = !1) {
		let { cache: n } = this;
		if (e in n && n[e].count > 0) {
			let r = n[e];
			if (r.count--, r.count === 0 || t) {
				let i = () => {
					if (n[e] !== r) return;
					let { result: t, abortController: i } = r;
					i.abort(new bt()), t instanceof Promise ? t.then((e) => {
						this.disposeItem(e, r.args);
					}).catch(() => {
						this.disposeItem(null, r.args);
					}).finally(() => {
						this.count--, this.cachedBytes -= r.bytes;
					}) : (this.disposeItem(t, r.args), this.count--, this.cachedBytes -= r.bytes), delete n[e];
				};
				t ? i() : queueMicrotask(() => {
					r.count === 0 && i();
				});
			}
			return !0;
		}
		throw Error("DataCache: Attempting to release key that does not exist");
	}
}, Ct = class extends St {
	constructor(e = {}) {
		super();
		let { fetchOptions: t = {} } = e;
		this.tiling = new at(), this.fetchOptions = t, this.fetchData = (...e) => fetch(...e);
	}
	init() {}
	async processBufferToTexture(e) {
		let t = new Blob([e]), n = await createImageBitmap(t, {
			premultiplyAlpha: "none",
			colorSpaceConversion: "none",
			imageOrientation: "flipY"
		}), r = new ke(n);
		return r.generateMipmaps = !1, r.colorSpace = we, r.needsUpdate = !0, r;
	}
	getMemoryUsage(e) {
		let { format: t, type: n, image: r, generateMipmaps: i } = e, { width: a, height: o } = r, s = Ae.getByteLength(a, o, t, n);
		return i ? s * 4 / 3 : s;
	}
	fetchItem(e, t) {
		let n = {
			...this.fetchOptions,
			signal: t
		}, r = this.getUrl(...e);
		return this.fetchData(r, n).then((e) => e.arrayBuffer()).then((e) => this.processBufferToTexture(e));
	}
	disposeItem(e) {
		e && (e.dispose(), e.image instanceof ImageBitmap && e.image.close());
	}
	getUrl(...e) {}
}, wt = class extends Ct {
	constructor(e = {}) {
		let { levels: t = 20, tileDimension: n = 256, projection: r = "EPSG:3857", url: i = null, ...a } = e;
		super(a), this.tileDimension = n, this.levels = t, this.projection = r, this.url = i;
	}
	getUrl(e, t, n) {
		return this.url.replace(/{\s*z\s*}/gi, n).replace(/{\s*x\s*}/gi, e).replace(/{\s*(y|reverseY|-\s*y)\s*}/gi, t);
	}
	init() {
		let { tiling: e, tileDimension: t, levels: n, url: r, projection: i } = this;
		return e.flipY = !/{\s*reverseY|-\s*y\s*}/g.test(r), e.setProjection(new R(i)), e.setContentBounds(...e.projection.getBounds()), Array.isArray(n) ? n.forEach((n, r) => {
			n !== null && e.setLevel(r, {
				tilePixelWidth: t,
				tilePixelHeight: t,
				...n
			});
		}) : e.generateLevels(n, e.projection.tileCountX, e.projection.tileCountY, {
			tilePixelWidth: t,
			tilePixelHeight: t
		}), this.url = r, Promise.resolve();
	}
}, Tt = class extends wt {
	constructor(e = {}) {
		let { subdomains: t = ["t0"], ...n } = e;
		super(n), this.subdomains = t, this.subDomainIndex = 0;
	}
	getUrl(e, t, n) {
		return this.url.replace(/{\s*subdomain\s*}/gi, this._getSubdomain()).replace(/{\s*quadkey\s*}/gi, this._tileToQuadKey(e, t, n));
	}
	_tileToQuadKey(e, t, n) {
		let r = "";
		for (let i = n; i > 0; i--) {
			let n = 0, a = 1 << i - 1;
			(e & a) !== 0 && (n += 1), (t & a) !== 0 && (n += 2), r += n.toString();
		}
		return r;
	}
	_getSubdomain() {
		return this.subDomainIndex = (this.subDomainIndex + 1) % this.subdomains.length, this.subdomains[this.subDomainIndex];
	}
}, Et = class extends Ct {
	constructor(e = {}) {
		let { url: t = null, ...n } = e;
		super(n), this.tileSets = null, this.extension = null, this.url = t;
	}
	getUrl(e, t, n) {
		let { url: r, extension: i, tileSets: a, tiling: o } = this;
		return new URL(`${parseInt(a[n - o.minLevel].href)}/${e}/${t}.${i}`, r).toString();
	}
	init() {
		let { url: e } = this;
		return this.fetchData(new URL("tilemapresource.xml", e), this.fetchOptions).then((e) => e.text()).then((t) => {
			let { tiling: n } = this, r = new DOMParser().parseFromString(t, "text/xml"), i = r.querySelector("BoundingBox"), a = r.querySelector("TileFormat"), o = [...r.querySelector("TileSets").querySelectorAll("TileSet")].map((e) => ({
				href: parseInt(e.getAttribute("href")),
				unitsPerPixel: parseFloat(e.getAttribute("units-per-pixel")),
				order: parseInt(e.getAttribute("order"))
			})).sort((e, t) => e.order - t.order), s = parseFloat(i.getAttribute("minx")) * N.DEG2RAD, c = parseFloat(i.getAttribute("maxx")) * N.DEG2RAD, l = parseFloat(i.getAttribute("miny")) * N.DEG2RAD, u = parseFloat(i.getAttribute("maxy")) * N.DEG2RAD, d = parseInt(a.getAttribute("width")), f = parseInt(a.getAttribute("height")), p = a.getAttribute("extension"), m = r.querySelector("SRS").textContent;
			this.extension = p, this.url = e, this.tileSets = o, n.setProjection(new R(m)), n.setContentBounds(s, l, c, u), o.forEach(({ order: e }) => {
				n.setLevel(e, {
					tileCountX: n.projection.tileCountX * 2 ** e,
					tilePixelWidth: d,
					tilePixelHeight: f
				});
			});
		});
	}
};
// src/three/plugins/images/overlays/utils.js
function Dt(e, t, n, r) {
	let [i, a, o, s] = e, c = (o - i) * 1e-4, l = (s - a) * 1e-4;
	a += l, i += c, s -= l, o -= c;
	let u = Math.max(Math.min(t, n.maxLevel), n.minLevel), [d, f, p, m] = n.getTilesInRange(i, a, o, s, u, !0);
	for (let e = d; e <= p; e++) for (let t = f; t <= m; t++) r(e, t, u);
}
function Ot(e, t, n) {
	let r = new L(), i = {}, a = [], o = e.getAttribute("position");
	e.computeBoundingBox(), e.boundingBox.getCenter(r).applyMatrix4(t), n.getPositionToCartographic(r, i);
	let s = i.lat || 0, c = i.lon || 0, l = Infinity, u = Infinity, d = Infinity, f = -Infinity, p = -Infinity, m = -Infinity;
	for (let e = 0; e < o.count; e++) r.fromBufferAttribute(o, e).applyMatrix4(t), n.getPositionToCartographic(r, i), Math.abs(Math.abs(i.lat) - Math.PI / 2) < 1e-5 && (i.lon = c), Math.abs(c - i.lon) > Math.PI && (i.lon += Math.sign(c - i.lon) * Math.PI * 2), Math.abs(s - i.lat) > Math.PI && (i.lat += Math.sign(s - i.lat) * Math.PI * 2), a.push(i.lon, i.lat, i.height), l = Math.min(l, i.lat), f = Math.max(f, i.lat), u = Math.min(u, i.lon), p = Math.max(p, i.lon), d = Math.min(d, i.height), m = Math.max(m, i.height);
	let h = [
		u,
		l,
		p,
		f
	];
	return {
		uv: a,
		range: h,
		region: [
			...h,
			d,
			m
		]
	};
}
function kt(e, t, n = null, r = null, i = null) {
	let a = Infinity, o = Infinity, s = Infinity, c = -Infinity, l = -Infinity, u = -Infinity, d = [], f = new P();
	if (e.forEach((e) => {
		f.copy(e.matrixWorld), n && f.premultiply(n);
		let { uv: r, region: i } = Ot(e.geometry, f, t);
		d.push(r), a = Math.min(a, i[1]), c = Math.max(c, i[3]), o = Math.min(o, i[0]), l = Math.max(l, i[2]), s = Math.min(s, i[4]), u = Math.max(u, i[5]);
	}), r !== null) {
		i === null && (i = r.clampToBounds([
			o,
			a,
			l,
			c
		]), i = r.fromCartographicToNormalizedRange(i));
		let [e, t, n, f] = i, p = u - s;
		d.forEach((i) => {
			for (let a = 0, o = i.length; a < o; a += 3) {
				let o = i[a + 0], c = i[a + 1], l = i[a + 2], [d, m] = r.fromCartographicToNormalized(o, c);
				d = N.clamp(d, 0, 1), m = N.clamp(m, 0, 1), i[a + 0] = N.mapLinear(d, e, n, 0, 1), i[a + 1] = N.mapLinear(m, t, f, 0, 1), i[a + 2] = p === 0 ? .5 : N.mapLinear(l, s, u, 0, 1);
			}
		});
	}
	return {
		uvs: d,
		range: i,
		region: [
			o,
			a,
			l,
			c,
			s,
			u
		]
	};
}
function At(e, t) {
	let n = new L(), r = [], i = e.getAttribute("position"), a = Infinity, o = Infinity, s = Infinity, c = -Infinity, l = -Infinity, u = -Infinity;
	for (let e = 0; e < i.count; e++) n.fromBufferAttribute(i, e).applyMatrix4(t), r.push(n.x, n.y, n.z), a = Math.min(a, n.x), c = Math.max(c, n.x), o = Math.min(o, n.y), l = Math.max(l, n.y), s = Math.min(s, n.z), u = Math.max(u, n.z);
	return {
		uv: r,
		range: [
			a,
			o,
			c,
			l
		],
		heightRange: [s, u]
	};
}
function jt(e, t) {
	let n = Infinity, r = Infinity, i = Infinity, a = -Infinity, o = -Infinity, s = -Infinity, c = [], l = new P();
	return e.forEach((e) => {
		l.copy(e.matrixWorld), t && l.premultiply(t);
		let { uv: u, range: d, heightRange: f } = At(e.geometry, l);
		c.push(u), n = Math.min(n, d[0]), a = Math.max(a, d[2]), r = Math.min(r, d[1]), o = Math.max(o, d[3]), i = Math.min(i, f[0]), s = Math.max(s, f[1]);
	}), c.forEach((e) => {
		for (let t = 0, i = e.length; t < i; t += 3) {
			let i = e[t + 0], s = e[t + 1];
			e[t + 0] = N.mapLinear(i, n, a, 0, 1), e[t + 1] = N.mapLinear(s, r, o, 0, 1);
		}
	}), {
		uvs: c,
		range: [
			n,
			r,
			a,
			o
		],
		heightRange: [i, s]
	};
}
// src/three/plugins/images/overlays/wrapOverlaysMaterial.js
var Mt = Symbol("OVERLAY_PARAMS");
function Nt(e, t) {
	if (e[Mt]) return e[Mt];
	let n = {
		layerMaps: { value: [] },
		layerInfo: { value: [] }
	};
	return e[Mt] = n, e.defines = {
		...e.defines || {},
		LAYER_COUNT: 0
	}, e.onBeforeCompile = (e) => {
		t && t(e), e.uniforms = {
			...e.uniforms,
			...n
		}, e.vertexShader = e.vertexShader.replace(/void main\(\s*\)\s*{/, (e) => `

				#pragma unroll_loop_start
					for ( int i = 0; i < 10; i ++ ) {

						#if UNROLLED_LOOP_INDEX < LAYER_COUNT

							attribute vec3 layer_uv_UNROLLED_LOOP_INDEX;
							varying vec3 v_layer_uv_UNROLLED_LOOP_INDEX;

						#endif


					}
				#pragma unroll_loop_end

				${e}

				#pragma unroll_loop_start
					for ( int i = 0; i < 10; i ++ ) {

						#if UNROLLED_LOOP_INDEX < LAYER_COUNT

							v_layer_uv_UNROLLED_LOOP_INDEX = layer_uv_UNROLLED_LOOP_INDEX;

						#endif

					}
				#pragma unroll_loop_end

			`), e.fragmentShader = e.fragmentShader.replace(/void main\(/, (e) => `

				#if LAYER_COUNT != 0
					struct LayerInfo {
						vec3 color;
						float opacity;

						int alphaMask;
						int alphaInvert;
					};

					uniform sampler2D layerMaps[ LAYER_COUNT ];
					uniform LayerInfo layerInfo[ LAYER_COUNT ];
				#endif

				#pragma unroll_loop_start
					for ( int i = 0; i < 10; i ++ ) {

						#if UNROLLED_LOOP_INDEX < LAYER_COUNT

							varying vec3 v_layer_uv_UNROLLED_LOOP_INDEX;

						#endif

					}
				#pragma unroll_loop_end

				${e}

			`).replace(/#include <color_fragment>/, (e) => `

				${e}

				#if LAYER_COUNT != 0
				{
					vec4 tint;
					vec3 layerUV;
					float layerOpacity;
					float wOpacity;
					float wDelta;
					#pragma unroll_loop_start
						for ( int i = 0; i < 10; i ++ ) {

							#if UNROLLED_LOOP_INDEX < LAYER_COUNT

								layerUV = v_layer_uv_UNROLLED_LOOP_INDEX;
								tint = texture( layerMaps[ i ], layerUV.xy );

								// discard texture outside 0, 1 on w - offset the stepped value by an epsilon to avoid cases
								// where wDelta is near 0 (eg a flat surface) at the w boundary, resulting in artifacts on some
								// hardware.
								wDelta = max( fwidth( layerUV.z ), 1e-7 );
								wOpacity =
									smoothstep( - wDelta, 0.0, layerUV.z ) *
									smoothstep( 1.0 + wDelta, 1.0, layerUV.z );

								// apply tint & opacity
								tint.rgb *= layerInfo[ i ].color;
								tint.rgba *= layerInfo[ i ].opacity * wOpacity;

								// invert the alpha
								if ( layerInfo[ i ].alphaInvert > 0 ) {

									tint.a = 1.0 - tint.a;

								}

								// apply the alpha across all existing layers if alpha mask is true
								if ( layerInfo[ i ].alphaMask > 0 ) {

									diffuseColor.a *= tint.a;

								} else {

									tint.rgb *= tint.a;
									diffuseColor = tint + diffuseColor * ( 1.0 - tint.a );

								}

							#endif

						}
					#pragma unroll_loop_end
				}
				#endif
			`);
	}, n;
}
// src/three/plugins/utilities/GeometryClipper.js
var B = 0, Pt = [
	"a",
	"b",
	"c"
], V = /* @__PURE__ */ new Ne(), Ft = /* @__PURE__ */ new Ne(), It = /* @__PURE__ */ new Ne(), Lt = /* @__PURE__ */ new Ne(), Rt = class {
	constructor() {
		this.attributeList = null, this.splitOperations = [], this.trianglePool = new zt();
	}
	forEachSplitPermutation(e) {
		let { splitOperations: t } = this, n = (r = 0) => {
			r >= t.length ? e() : (t[r].keepPositive = !0, n(r + 1), t[r].keepPositive = !1, n(r + 1));
		};
		n();
	}
	addSplitOperation(e, t = !0) {
		this.splitOperations.push({
			callback: e,
			keepPositive: t
		});
	}
	clearSplitOperations() {
		this.splitOperations.length = 0;
	}
	clipObject(e) {
		let t = e.clone(), n = [];
		return t.traverse((e) => {
			e.isMesh && (e.geometry = this.clip(e).geometry, (e.geometry.index ? e.geometry.index.count / 3 : e.attributes.position.count / 3) == 0 && n.push(e));
		}), n.forEach((e) => {
			e.removeFromParent();
		}), t;
	}
	clip(e, t = null) {
		let n = this.getClippedData(e, t);
		return this.constructMesh(n.attributes, n.index, e);
	}
	getClippedData(e, t = null, n = {}) {
		let { trianglePool: r, splitOperations: i, attributeList: a } = this, o = e.geometry, s = o.attributes.position, c = o.index, l = 0, u = {};
		n.index = n.index || [], n.vertexIsClipped = n.vertexIsClipped || [], n.attributes = n.attributes || {};
		for (let e in o.attributes) a !== null && (a instanceof Function && !a(e) || Array.isArray(a) && !a.includes(e)) || (n.attributes[e] = []);
		let d = 0, f = c ? c.count : s.count;
		t !== null && (d = t.start, f = t.count);
		for (let t = d, n = d + f; t < n; t += 3) {
			let n = t + 0, a = t + 1, s = t + 2;
			c && (n = c.getX(n), a = c.getX(a), s = c.getX(s));
			let l = r.get();
			l.initFromIndices(n, a, s);
			let u = [l];
			for (let t = 0; t < i.length; t++) {
				let { keepPositive: n, callback: r } = i[t], a = [];
				for (let t = 0; t < u.length; t++) {
					let i = u[t], { indices: s, barycoord: c } = i;
					i.clipValues.a = r(o, s.a, s.b, s.c, c.a, e.matrixWorld), i.clipValues.b = r(o, s.a, s.b, s.c, c.b, e.matrixWorld), i.clipValues.c = r(o, s.a, s.b, s.c, c.c, e.matrixWorld), this.splitTriangle(i, !n, a);
				}
				u = a;
			}
			for (let e = 0, t = u.length; e < t; e++) {
				let t = u[e];
				p(t, o);
			}
			r.reset();
		}
		return n;
		function p(e, t) {
			for (let r = 0; r < 3; r++) {
				let i = e.getVertexHash(r, t);
				i in u || (u[i] = l, l++, e.getVertexData(r, t, n.attributes), n.vertexIsClipped.push(e.clipValues[Pt[r]] === B));
				let a = u[i];
				n.index.push(a);
			}
		}
	}
	constructMesh(e, t, n) {
		let r = n.geometry, i = new C(), a = e.position.length / 3 > 65535 ? new Uint32Array(t) : new Uint16Array(t);
		i.setIndex(new S(a, 1, !1));
		for (let t in e) {
			let n = r.getAttribute(t), a = new n.array.constructor(e[t]), o = new S(a, n.itemSize, n.normalized);
			o.gpuType = n.gpuType, i.setAttribute(t, o);
		}
		let o = new F(i, n.material.clone());
		return o.position.copy(n.position), o.quaternion.copy(n.quaternion), o.scale.copy(n.scale), o;
	}
	splitTriangle(e, t, n) {
		let { trianglePool: r } = this, i = [], a = [], o = [];
		for (let t = 0; t < 3; t++) {
			let n = Pt[t], r = Pt[(t + 1) % 3], s = e.clipValues[n], c = e.clipValues[r];
			(s < B != c < B || s === B) && (i.push(t), a.push([n, r]), s === c ? o.push(0) : o.push(N.mapLinear(B, s, c, 0, 1)));
		}
		if (i.length !== 2) Math.min(e.clipValues.a, e.clipValues.b, e.clipValues.c) < B === t && n.push(e);
		else if (i.length === 2) {
			let s = r.get().initFromTriangle(e), c = r.get().initFromTriangle(e), l = r.get().initFromTriangle(e);
			(i[0] + 1) % 3 === i[1] ? (s.lerpVertexFromEdge(e, a[0][0], a[0][1], o[0], "a"), s.copyVertex(e, a[0][1], "b"), s.lerpVertexFromEdge(e, a[1][0], a[1][1], o[1], "c"), s.clipValues.a = B, s.clipValues.c = B, c.lerpVertexFromEdge(e, a[0][0], a[0][1], o[0], "a"), c.copyVertex(e, a[1][1], "b"), c.copyVertex(e, a[0][0], "c"), c.clipValues.a = B, l.lerpVertexFromEdge(e, a[0][0], a[0][1], o[0], "a"), l.lerpVertexFromEdge(e, a[1][0], a[1][1], o[1], "b"), l.copyVertex(e, a[1][1], "c"), l.clipValues.a = B, l.clipValues.b = B) : (s.lerpVertexFromEdge(e, a[0][0], a[0][1], o[0], "a"), s.lerpVertexFromEdge(e, a[1][0], a[1][1], o[1], "b"), s.copyVertex(e, a[0][0], "c"), s.clipValues.a = B, s.clipValues.b = B, c.lerpVertexFromEdge(e, a[0][0], a[0][1], o[0], "a"), c.copyVertex(e, a[0][1], "b"), c.lerpVertexFromEdge(e, a[1][0], a[1][1], o[1], "c"), c.clipValues.a = B, c.clipValues.c = B, l.copyVertex(e, a[0][1], "a"), l.copyVertex(e, a[1][0], "b"), l.lerpVertexFromEdge(e, a[1][0], a[1][1], o[1], "c"), l.clipValues.c = B);
			let u, d;
			u = Math.min(s.clipValues.a, s.clipValues.b, s.clipValues.c), d = u < B, d === t && n.push(s), u = Math.min(c.clipValues.a, c.clipValues.b, c.clipValues.c), d = u < B, d === t && n.push(c), u = Math.min(l.clipValues.a, l.clipValues.b, l.clipValues.c), d = u < B, d === t && n.push(l);
		}
	}
}, zt = class {
	constructor() {
		this.pool = [], this.index = 0;
	}
	get() {
		if (this.index >= this.pool.length) {
			let e = new Bt();
			this.pool.push(e);
		}
		let e = this.pool[this.index];
		return this.index++, e;
	}
	reset() {
		this.index = 0;
	}
}, Bt = class {
	constructor() {
		this.indices = {
			a: -1,
			b: -1,
			c: -1
		}, this.clipValues = {
			a: -1,
			b: -1,
			c: -1
		}, this.barycoord = new je();
	}
	getVertexHash(e, t) {
		let { barycoord: n, indices: r } = this, i = n[Pt[e]];
		if (i.x === 1) return r[Pt[0]];
		if (i.y === 1) return r[Pt[1]];
		if (i.z === 1) return r[Pt[2]];
		{
			let { attributes: e } = t, n = "";
			for (let t in e) {
				let a = e[t];
				switch (Vt(a, r.a, r.b, r.c, i, V), (t === "normal" || t === "tangent" || t === "bitangent") && V.normalize(), a.itemSize) {
					case 4:
						n += Ht(V.x, V.y, V.z, V.w);
						break;
					case 3:
						n += Ht(V.x, V.y, V.z);
						break;
					case 2:
						n += Ht(V.x, V.y);
						break;
					case 1: n += Ht(V.x);
				}
				n += "|";
			}
			return n;
		}
	}
	getVertexData(e, t, n) {
		let { barycoord: r, indices: i } = this, a = r[Pt[e]], { attributes: o } = t;
		for (let e in o) {
			if (!n[e]) continue;
			let t = o[e], r = n[e];
			switch (Vt(t, i.a, i.b, i.c, a, V), (e === "normal" || e === "tangent" || e === "bitangent") && V.normalize(), t.itemSize) {
				case 4:
					r.push(V.x, V.y, V.z, V.w);
					break;
				case 3:
					r.push(V.x, V.y, V.z);
					break;
				case 2:
					r.push(V.x, V.y);
					break;
				case 1: r.push(V.x);
			}
		}
	}
	initFromTriangle(e) {
		return this.initFromIndices(e.indices.a, e.indices.b, e.indices.c);
	}
	initFromIndices(e, t, n) {
		return this.indices.a = e, this.indices.b = t, this.indices.c = n, this.clipValues.a = -1, this.clipValues.b = -1, this.clipValues.c = -1, this.barycoord.a.set(1, 0, 0), this.barycoord.b.set(0, 1, 0), this.barycoord.c.set(0, 0, 1), this;
	}
	lerpVertexFromEdge(e, t, n, r, i) {
		this.clipValues[i] = N.lerp(e.clipValues[t], e.clipValues[n], r), this.barycoord[i].lerpVectors(e.barycoord[t], e.barycoord[n], r);
	}
	copyVertex(e, t, n) {
		this.clipValues[n] = e.clipValues[t], this.barycoord[n].copy(e.barycoord[t]);
	}
};
function Vt(e, t, n, r, i, a) {
	switch (Ft.fromBufferAttribute(e, t), It.fromBufferAttribute(e, n), Lt.fromBufferAttribute(e, r), a.set(0, 0, 0, 0).addScaledVector(Ft, i.x).addScaledVector(It, i.y).addScaledVector(Lt, i.z), e.itemSize) {
		case 3:
			V.w = 0;
			break;
		case 2:
			V.w = 0, V.z = 0;
			break;
		case 1: V.w = 0, V.z = 0, V.y = 0;
	}
	return a;
}
function Ht(...e) {
	let t = "";
	for (let n = 0, r = e.length; n < r; n++) t += ~~(e[n] * 1e5 + .5), n !== r - 1 && (t += "_");
	return t;
}
// src/three/plugins/images/sources/WMTSImageSource.js
var Ut = class extends Ct {
	constructor(e = {}) {
		let { layer: t = null, tileMatrixSet: n = "default", style: r = "default", url: i = null, format: a = "image/jpeg", dimensions: o = null, tileMatrixLabels: s = null, tileMatrices: c = null, projection: l = null, levels: u = 20, tileDimension: d = 256, contentBoundingBox: f = null, ...p } = e;
		super(p), this.layer = t, this.tileMatrixSet = n, this.style = r, this.url = i, this.format = a, this.dimensions = o, this.tileMatrixLabels = s, this.tileMatrices = c, this.projection = l, this.levels = u, this.tileDimension = d, this.contentBoundingBox = f, this._useKvp = !1;
	}
	_detectRequestMode(e) {
		return !/\{/.test(e);
	}
	init() {
		let { tiling: e, tileDimension: t, levels: n, dimensions: r, contentBoundingBox: i, tileMatrices: a, style: o, tileMatrixSet: s } = this, { url: c } = this, l = this.projection || "EPSG:3857";
		if (e.flipY = !0, e.setProjection(new R(l)), i === null ? e.setContentBounds(...e.projection.getBounds()) : e.setContentBounds(i[0], i[1], i[2], i[3]), Array.isArray(a) ? a.forEach((n, r) => {
			let i = n.tileWidth || t, a = n.tileHeight || t;
			e.setLevel(r, {
				tilePixelWidth: i,
				tilePixelHeight: a,
				tileCountX: n.matrixWidth,
				tileCountY: n.matrixHeight,
				tileBounds: n.tileBounds || n.bounds
			});
		}) : e.generateLevels(n, e.projection.tileCountX, e.projection.tileCountY, {
			tilePixelWidth: t,
			tilePixelHeight: t
		}), this._useKvp = this._detectRequestMode(c), !this._useKvp && (c = c.replace(/{\s*TileMatrixSet\s*}/gi, s).replace(/{\s*Style\s*}/gi, o), r)) for (let e in r) c = c.replace(RegExp(`{\\s*${e}\\s*}`, "gi"), r[e]);
		return this.url = c, Promise.resolve();
	}
	getUrl(e, t, n) {
		let { tileMatrices: r, tileMatrixLabels: i } = this, a;
		return a = r !== null && r.length > 0 ? r[n].identifier : i ? i[n] : n.toString(), this._useKvp ? this._buildKvpUrl(e, t, a) : this._buildRestfulUrl(e, t, a);
	}
	_buildRestfulUrl(e, t, n) {
		return this.url.replace(/{\s*TileMatrix\s*}/gi, n).replace(/{\s*TileCol\s*}/gi, e).replace(/{\s*TileRow\s*}/gi, t);
	}
	_buildKvpUrl(e, t, n) {
		let { dimensions: r, format: i } = this, a = this.url, o = new URLSearchParams({
			SERVICE: "WMTS",
			VERSION: "1.0.0",
			REQUEST: "GetTile",
			LAYER: this.layer,
			STYLE: this.style,
			TILEMATRIXSET: this.tileMatrixSet,
			TILEMATRIX: n,
			TILEROW: t,
			TILECOL: e,
			FORMAT: i
		});
		if (r) for (let e in r) o.set(e, r[e]);
		return a + (a.includes("?") ? "&" : "?") + o.toString();
	}
}, Wt = class {
	constructor() {
		this.canvas = null, this.context = null, this.range = [
			0,
			0,
			1,
			1
		];
	}
	setTarget(e, t) {
		this.canvas = e.image, this.context = e.image.getContext("2d"), this.range = [...t];
	}
	draw(e, t) {
		let { canvas: n, range: r, context: i } = this, { width: a, height: o } = n, { image: s } = e, c = Math.round(N.mapLinear(t[0], r[0], r[2], 0, a)), l = Math.round(N.mapLinear(t[1], r[1], r[3], 0, o)), u = Math.round(N.mapLinear(t[2], r[0], r[2], 0, a)), d = Math.round(N.mapLinear(t[3], r[1], r[3], 0, o)), f = u - c, p = d - l;
		s instanceof ImageBitmap ? (i.save(), i.translate(c, o - l), i.scale(1, -1), i.drawImage(s, 0, 0, f, p), i.restore()) : i.drawImage(s, c, o - l, f, -p);
	}
	clear() {
		let { context: e, canvas: t } = this;
		e.clearRect(0, 0, t.width, t.height);
	}
}, Gt = 1e-10;
function Kt(e, t, n = 0) {
	if (e.length !== t.length) return !1;
	for (let r = 0, i = e.length; r < i; r++) if (Math.abs(e[r] - t[r]) > n) return !1;
	return !0;
}
var qt = class extends St {
	hasContent(...e) {
		return !0;
	}
}, Jt = class extends qt {
	constructor(e) {
		super(), this.tiledImageSource = e, this.tileComposer = new Wt(), this.resolution = 256;
	}
	hasContent(e, t, n, r, i) {
		let a = this.tiledImageSource.tiling, o = 0;
		return Dt([
			e,
			t,
			n,
			r
		], i, a, () => {
			o++;
		}), o !== 0;
	}
	async fetchItem([e, t, n, r, i], a) {
		let { tiledImageSource: o, tileComposer: s } = this, c = [
			e,
			t,
			n,
			r
		], l = o.tiling;
		await this._markImages(c, i, !1), a?.throwIfAborted();
		let u = null;
		if (Dt(c, i, l, (e, t, n) => {
			Kt(l.getTileBounds(e, t, n, !0, !1), c, Gt) && (u = [
				e,
				t,
				n
			]);
		}), u !== null) {
			let [e, t, n] = u;
			return o.get(e, t, n).clone();
		}
		let d = document.createElement("canvas");
		d.width = this.resolution, d.height = this.resolution;
		let f = new w(d);
		return f.colorSpace = we, f.generateMipmaps = !1, s.setTarget(f, c), s.clear(16777215, 0), Dt(c, i, l, (e, t, n) => {
			let r = l.getTileBounds(e, t, n, !0, !1), i = o.get(e, t, n);
			s.draw(i, r);
		}), f;
	}
	disposeItem(e, [t, n, r, i, a]) {
		e && e.dispose(), this._markImages([
			t,
			n,
			r,
			i
		], a, !0);
	}
	dispose() {
		super.dispose(), this.tiledImageSource.dispose();
	}
	_markImages(e, t, n = !1) {
		let r = this.tiledImageSource, i = r.tiling, a = [];
		Dt(e, t, i, (e, t, i) => {
			n ? r.release(e, t, i) : a.push(r.lock(e, t, i));
		});
		let o = a.filter((e) => e instanceof Promise);
		return o.length === 0 ? null : Promise.all(o);
	}
}, Yt = Object.freeze({
	fill: "#cccccc",
	stroke: "transparent",
	strokeWidth: 1,
	radius: 2,
	order: 0,
	visible: !0
}), Xt = class {
	static get DEFAULT_STYLE() {
		return Yt;
	}
	get fill() {
		return this._ctx.fillStyle;
	}
	set fill(e) {
		this._ctx.fillStyle = e;
	}
	get stroke() {
		return this._ctx.strokeStyle;
	}
	set stroke(e) {
		this._ctx.strokeStyle = e;
	}
	get strokeWidth() {
		return this._ctx.lineWidth;
	}
	set strokeWidth(e) {
		this._ctx.lineWidth = e;
	}
	constructor(e = {}) {
		let { getX: t = (e) => e.x, getY: n = (e) => e.y, flipY: r = !1, tileExtent: i = null } = e;
		this.getX = t, this.getY = n, this.flipY = r, this.tileExtent = i, this.radius = Yt.radius, this.visible = !0, this._invScale = 1, this._ctx = null, this._originX = 0, this._originY = 0;
	}
	setFrame(e, t, n) {
		e.restore();
		let [r, i, a, o] = t, [s, c, l, u] = n, { width: d, height: f } = e.canvas, { flipY: p, tileExtent: m } = this, h = m ?? a - r, g = m ?? o - i, _ = Math.round(d * (r - s) / (l - s)), v = Math.round(d * (a - s) / (l - s)), y = Math.round(f * (u - o) / (u - c)), b = Math.round(f * (u - i) / (u - c)), x = (v - _) / h, S = (p ? -1 : 1) * (b - y) / g, C = m ? 0 : r, w = m ? 0 : p ? o : i, T = p && !m ? -g : 0;
		e.save(), e.setTransform(x, 0, 0, S, _, y), e.beginPath(), e.rect(0, T, h, g), e.clip(), e.clearRect(0, T, h, g), this._ctx = e, this._invScale = 1 / x, this._originX = C, this._originY = w;
	}
	setStyle(e) {
		let { _invScale: t } = this;
		this.fill = e?.fill ?? Yt.fill, this.stroke = e?.stroke ?? Yt.stroke, this.strokeWidth = (e?.strokeWidth ?? Yt.strokeWidth) * t, this.radius = (e?.radius ?? Yt.radius) * t, this.visible = e ? e?.visible ?? Yt.visible : !1;
	}
	_renderPoints(e, t = 1) {
		let { _ctx: n, radius: r, getX: i, getY: a, visible: o, _originX: s, _originY: c } = this;
		if (o) {
			for (let o of e) for (let e of o) {
				let o = i(e) - s, l = a(e) - c;
				n.beginPath(), n.ellipse(o, l, r / t, r, 0, 0, Math.PI * 2), n.fill();
			}
			n.stroke();
		}
	}
	_renderLines(e) {
		let { _ctx: t, getX: n, getY: r, visible: i, _originX: a, _originY: o } = this;
		if (i) {
			if (e instanceof Path2D) t.stroke(e);
			else {
				t.beginPath();
				for (let i of e) for (let e = 0; e < i.length; e++) e === 0 ? t.moveTo(n(i[e]) - a, r(i[e]) - o) : t.lineTo(n(i[e]) - a, r(i[e]) - o);
				t.stroke();
			}
		}
	}
	_renderPolygons(e) {
		let { _ctx: t, getX: n, getY: r, visible: i, _originX: a, _originY: o } = this;
		if (i) {
			if (e instanceof Path2D) t.fill(e, "evenodd"), t.stroke(e);
			else {
				t.beginPath();
				for (let i of e) {
					for (let e = 0; e < i.length; e++) e === 0 ? t.moveTo(n(i[e]) - a, r(i[e]) - o) : t.lineTo(n(i[e]) - a, r(i[e]) - o);
					t.closePath();
				}
				t.fill("evenodd"), t.stroke();
			}
		}
	}
}, Zt = /* @__PURE__ */ new Set([
	"Point",
	"MultiPoint",
	"LineString",
	"MultiLineString",
	"Polygon",
	"MultiPolygon"
]), Qt = /* @__PURE__ */ new L(), $t = /* @__PURE__ */ new L();
function en(e, t, n) {
	let r = .01;
	e.getCartographicToPosition(t, n, 0, Qt), e.getCartographicToPosition(t + r, n, 0, $t);
	let i = Qt.distanceTo($t);
	return e.getCartographicToPosition(t, n + r, 0, $t), Qt.distanceTo($t) / i;
}
var tn = class extends qt {
	constructor({ geojson: e = null, url: t = null, resolution: n = 256, pointRadius: r = 6, strokeStyle: i = "white", strokeWidth: a = 2, fillStyle: o = "rgba( 255, 255, 255, 0.5 )", getStyle: s = ((e, t) => ({
		fill: t.fillStyle || this.fillStyle,
		stroke: t.strokeStyle || this.strokeStyle,
		strokeWidth: t.strokeWidth || this.strokeWidth,
		radius: t.pointRadius || this.pointRadius
	})), ...c } = {}) {
		super(c), this.geojson = e, this.url = t, this.resolution = n, this.pointRadius = r, this.strokeStyle = i, this.strokeWidth = a, this.fillStyle = o, this.getStyle = s, this.features = null, this.featureBounds = /* @__PURE__ */ new Map(), this.contentBounds = null, this.projection = new R(), this.fetchData = (...e) => fetch(...e), this._canvasRenderer = new Xt({
			flipY: !0,
			getX: (e) => e[0],
			getY: (e) => e[1]
		});
	}
	async init() {
		let { geojson: e, url: t } = this;
		if (!e && t) {
			let e = await this.fetchData(t);
			this.geojson = await e.json();
		}
		this._updateCache(!0);
	}
	hasContent(e, t, n, r) {
		let { projection: i } = this, a = i.fromNormalizedToCartographicRange([
			e,
			t,
			n,
			r
		]).map((e) => e * N.RAD2DEG);
		return this._boundsIntersectBounds(a, this.contentBounds);
	}
	fetchItem(e, t) {
		let n = document.createElement("canvas"), r = new w(n);
		return r.colorSpace = we, r.generateMipmaps = !1, this._drawToCanvas(n, e), r.needsUpdate = !0, r;
	}
	disposeItem(e) {
		e && e.dispose();
	}
	redraw(...e) {
		let t = this.get(...e);
		t && (this._drawToCanvas(t.image, e), t.needsUpdate = !0);
	}
	_updateCache(e = !1) {
		let { geojson: t, featureBounds: n } = this;
		if (!t || this.features && !e) return;
		n.clear();
		let r = Infinity, i = Infinity, a = -Infinity, o = -Infinity;
		this.features = this._featuresFromGeoJSON(t);
		for (let e of this.features) {
			let t = this._getFeatureBounds(e);
			n.set(e, t);
			let [s, c, l, u] = t;
			r = Math.min(r, s), i = Math.min(i, c), a = Math.max(a, l), o = Math.max(o, u);
		}
		this.contentBounds = [
			r,
			i,
			a,
			o
		];
	}
	_drawToCanvas(e, t) {
		this._updateCache();
		let [n, r, i, a] = t, { projection: o, resolution: s, features: c, _canvasRenderer: l } = this;
		e.width = s, e.height = s;
		let [u, d, f, p] = o.fromNormalizedToCartographicRange([
			n,
			r,
			i,
			a
		]), m = [
			u * N.RAD2DEG,
			d * N.RAD2DEG,
			f * N.RAD2DEG,
			p * N.RAD2DEG
		], h = e.getContext("2d");
		l.setFrame(h, m, m);
		for (let e of c) this._featureIntersectsTile(e, m) && this._drawFeatureOnCanvas(e, m, s);
	}
	_featureIntersectsTile(e, t) {
		let n = this.featureBounds.get(e);
		return n ? this._boundsIntersectBounds(n, t) : !1;
	}
	_boundsIntersectBounds(e, t) {
		let [n, r, i, a] = e, [o, s, c, l] = t;
		return !(i < o || n > c || a < s || r > l);
	}
	_getFeatureBounds(e) {
		let { geometry: t } = e;
		if (!t) return null;
		let { type: n, coordinates: r } = t, i = Infinity, a = Infinity, o = -Infinity, s = -Infinity, c = (e, t) => {
			i = Math.min(i, e), o = Math.max(o, e), a = Math.min(a, t), s = Math.max(s, t);
		};
		return n === "Point" ? c(r[0], r[1]) : n === "MultiPoint" || n === "LineString" ? r.forEach((e) => c(e[0], e[1])) : n === "MultiLineString" || n === "Polygon" ? r.forEach((e) => e.forEach((e) => c(e[0], e[1]))) : n === "MultiPolygon" && r.forEach((e) => e.forEach((e) => e.forEach((e) => c(e[0], e[1])))), [
			i,
			a,
			o,
			s
		];
	}
	_featuresFromGeoJSON(e) {
		let t = e.type;
		return t === "FeatureCollection" ? e.features : t === "Feature" ? [e] : t === "GeometryCollection" ? e.geometries.map((e) => ({
			type: "Feature",
			geometry: e,
			properties: {}
		})) : Zt.has(t) ? [{
			type: "Feature",
			geometry: e,
			properties: {}
		}] : [];
	}
	_drawFeatureOnCanvas(e, t, n) {
		let { geometry: r = null, properties: i = {} } = e;
		if (!r) return;
		let [, a, , o] = t, { _canvasRenderer: s } = this, l = this.getStyle(e, i);
		s.setStyle(l);
		let u = r.type;
		if (u === "Point" || u === "MultiPoint") {
			s.radius = l.radius * (o - a) / n;
			let e = u === "Point" ? [r.coordinates] : r.coordinates;
			for (let t of e) {
				let e = en(c, t[1] * N.DEG2RAD, t[0] * N.DEG2RAD), n = [t];
				s._renderPoints([n], e);
			}
		} else u === "LineString" ? s._renderLines([r.coordinates]) : u === "MultiLineString" ? s._renderLines(r.coordinates) : u === "Polygon" ? s._renderPolygons(r.coordinates) : u === "MultiPolygon" && r.coordinates.forEach((e) => s._renderPolygons(e));
	}
}, nn = class extends Ct {
	constructor(e = {}) {
		let { url: t = null, layer: n = null, styles: r = null, contentBoundingBox: i = null, version: a = "1.3.0", crs: o = "EPSG:4326", format: s = "image/png", transparent: c = !1, levels: l = 18, tileDimension: u = 256, ...d } = e;
		super(d), this.url = t, this.layer = n, this.crs = o, this.format = s, this.tileDimension = u, this.styles = r, this.version = a, this.levels = l, this.transparent = c, this.contentBoundingBox = i;
	}
	init() {
		let { tiling: e, levels: t, tileDimension: n, contentBoundingBox: r } = this;
		return e.setProjection(new R(this.crs)), e.flipY = !0, e.generateLevels(t, e.projection.tileCountX, e.projection.tileCountY, {
			tilePixelWidth: n,
			tilePixelHeight: n
		}), r === null ? e.setContentBounds(...e.projection.getBounds()) : e.setContentBounds(...r), Promise.resolve();
	}
	normalizedToMercatorX(e) {
		return N.mapLinear(e, 0, 1, -20037508.342789244, 20037508.342789244);
	}
	normalizedToMercatorY(e) {
		return N.mapLinear(e, 0, 1, -20037508.342789244, 20037508.342789244);
	}
	getUrl(e, t, n) {
		let { tiling: r, layer: i, crs: a, format: o, tileDimension: s, styles: c, version: l, transparent: u } = this, d = l === "1.1.1" ? "SRS" : "CRS", f;
		if (a === "EPSG:3857") {
			let i = r.getTileBounds(e, t, n, !0, !1);
			f = [
				this.normalizedToMercatorX(i[0]),
				this.normalizedToMercatorY(i[1]),
				this.normalizedToMercatorX(i[2]),
				this.normalizedToMercatorY(i[3])
			];
		} else {
			let [i, o, s, c] = r.getTileBounds(e, t, n, !1, !1).map((e) => e * N.RAD2DEG);
			f = a === "EPSG:4326" ? l === "1.1.1" ? [
				i,
				o,
				s,
				c
			] : [
				o,
				i,
				c,
				s
			] : [
				i,
				o,
				s,
				c
			];
		}
		let p = new URLSearchParams({
			SERVICE: "WMS",
			REQUEST: "GetMap",
			VERSION: l,
			LAYERS: i,
			[d]: a,
			BBOX: f.join(","),
			WIDTH: s,
			HEIGHT: s,
			FORMAT: o,
			TRANSPARENT: u ? "TRUE" : "FALSE"
		});
		return c != null && p.set("STYLES", c), new URL("?" + p.toString(), this.url).toString();
	}
}, rn = class extends Ct {
	constructor(e = {}) {
		let { url: t = null, ...n } = e;
		super(n), this.url = t, this.format = null, this.stem = null;
	}
	getUrl(e, t, n) {
		return `${this.stem}_files/${n}/${e}_${t}.${this.format}`;
	}
	init() {
		let { url: e } = this;
		return this.fetchData(e, this.fetchOptions).then((e) => e.text()).then((t) => {
			let n = new DOMParser().parseFromString(t, "text/xml");
			if (n.querySelector("DisplayRects") || n.querySelector("Collection")) throw Error("DeepZoomImagesPlugin: DisplayRect and Collection DZI files not supported.");
			let r = n.querySelector("Image"), i = r.querySelector("Size"), a = parseInt(i.getAttribute("Width")), o = parseInt(i.getAttribute("Height")), s = parseInt(r.getAttribute("TileSize")), c = parseInt(r.getAttribute("Overlap")), l = r.getAttribute("Format");
			this.format = l, this.stem = e.split(/\.[^.]+$/g)[0];
			let { tiling: u } = this, d = Math.ceil(Math.log2(Math.max(a, o))) + 1;
			u.flipY = !0, u.pixelOverlap = c, u.generateLevels(d, 1, 1, {
				tilePixelWidth: s,
				tilePixelHeight: s,
				pixelWidth: a,
				pixelHeight: o
			});
		});
	}
}, an = /* @__PURE__ */ new P(), on = /* @__PURE__ */ new L(), sn = /* @__PURE__ */ new L(), cn = /* @__PURE__ */ new L(), H = /* @__PURE__ */ new L(), ln = /* @__PURE__ */ new y(), un = Symbol("SPLIT_TILE_DATA"), dn = Symbol("SPLIT_HASH"), fn = Symbol("ORIGINAL_REFINE"), pn = Symbol("ORIGINAL_GEOMETRIC_ERROR"), mn = /* @__PURE__ */ new t();
mn.maxJobs = 10, mn.priorityCallback = (e, t) => {
	let n = e.tile, r = t.tile, i = n.internal.renderer, a = r.internal.renderer, s = i.visibleTiles.has(n);
	return s === a.visibleTiles.has(r) ? o(n, r) : s ? 1 : -1;
};
var hn = class {
	get enableTileSplitting() {
		return this._enableTileSplitting;
	}
	set enableTileSplitting(e) {
		this._enableTileSplitting !== e && (this._enableTileSplitting = e, this._markNeedsUpdate());
	}
	constructor(e = {}) {
		let { overlays: t = [], resolution: n = 256, enableTileSplitting: r = !0 } = e;
		this.name = "IMAGE_OVERLAY_PLUGIN", this.priority = -15, this.resolution = n, this._enableTileSplitting = r, this.overlays = [], this.needsUpdate = !1, this.tiles = null, this.tileComposer = null, this.tileControllers = /* @__PURE__ */ new Map(), this.overlayInfo = /* @__PURE__ */ new Map(), this.meshParams = /* @__PURE__ */ new WeakMap(), this.pendingTiles = /* @__PURE__ */ new Map(), this.processedTiles = /* @__PURE__ */ new Set(), this.processQueue = null, this._onUpdateAfter = null, this._onTileDownloadStart = null, this._onTileVisibilityChange = null, this._virtualChildResetId = 0, this._bytesUsed = /* @__PURE__ */ new WeakMap(), t.forEach((e) => {
			this.addOverlay(e);
		});
	}
	init(e) {
		let t = new Wt();
		this.tiles = e, this.tileComposer = t, this.processQueue = mn, e.forEachLoadedModel((e, t) => {
			this._processTileModel(e, t, !0);
		}), this._onUpdateAfter = async () => {
			let t = !1;
			if (this.overlayInfo.forEach((e, n) => {
				if (!!n.frame != !!e.frame || n.frame && e.frame && !e.frame.equals(n.frame)) {
					let r = e.order;
					this.deleteOverlay(n), this.addOverlay(n, r), t = !0;
				}
			}), t) {
				let { processQueue: t } = this, n = t.maxJobs, r = 0;
				t.items.forEach((t) => {
					e.visibleTiles.has(t.tile) && r++;
				}), t.maxJobs = r + t.currJobs, t.tryRunJobs(), t.maxJobs = n, this.needsUpdate = !0;
			}
			if (this.needsUpdate) {
				this.needsUpdate = !1;
				let { overlays: t, overlayInfo: n } = this;
				t.sort((e, t) => n.get(e).order - n.get(t).order), this.processedTiles.forEach((e) => {
					this._updateLayers(e);
				}), this.resetVirtualChildren(!this.enableTileSplitting), e.recalculateBytesUsed(), e.dispatchEvent({ type: "needs-render" });
			}
		}, this._onTileDownloadStart = ({ tile: e, url: t }) => {
			!/\.json$/i.test(t) && !/\.subtree/i.test(t) && (this.processedTiles.add(e), this._initTileOverlayInfo(e));
		}, this._onTileVisibilityChange = ({ tile: e, visible: t }) => {
			this.overlayInfo.forEach(({ tileInfo: n }, r) => {
				if (n.has(e)) {
					let { range: i } = n.get(e);
					r.setRegionVisible(i, t, e);
				}
			});
		}, e.addEventListener("update-after", this._onUpdateAfter), e.addEventListener("tile-download-start", this._onTileDownloadStart), e.addEventListener("tile-visibility-change", this._onTileVisibilityChange), this.overlays.forEach((e) => {
			this._initOverlay(e);
		});
	}
	_removeVirtualChildren(e) {
		if (!(fn in e)) return;
		let { tiles: t } = this, { virtualChildCount: n } = e.internal, r = e.children.length, i = r - n;
		for (let n = i; n < r; n++) {
			let r = e.children[n];
			t.processNodeQueue.remove(r), t.lruCache.remove(r), r.parent = null;
		}
		e.children.length -= n, e.internal.virtualChildCount = 0, e.refine = e[fn], delete e[fn], delete e[dn], pn in e && (e.geometricError = e[pn], delete e[pn]);
	}
	disposeTile(e) {
		let { overlayInfo: t, tileControllers: n, processQueue: r, pendingTiles: i, processedTiles: a } = this;
		a.delete(e), this._removeVirtualChildren(e), n.has(e) && (n.get(e).abort(), n.delete(e), i.delete(e)), t.forEach((({ tileInfo: t }, n) => {
			if (t.has(e)) {
				let { meshInfo: r, range: i } = t.get(e);
				i !== null && n.releaseTexture(i), t.delete(e), r.clear();
			}
		})), r.removeByFilter((t) => t.tile === e);
	}
	calculateBytesUsed(e) {
		let { overlayInfo: t } = this, n = this._bytesUsed, r = null;
		return t.forEach(({ tileInfo: t }, n) => {
			if (t.has(e)) {
				let { target: n } = t.get(e);
				r ||= 0, r += u(n);
			}
		}), r === null ? n.has(e) ? n.get(e) : 0 : (n.set(e, r), r);
	}
	processTileModel(e, t) {
		return this._processTileModel(e, t);
	}
	async _processTileModel(e, t, n = !1) {
		let { tileControllers: r, processedTiles: i, pendingTiles: a } = this;
		r.set(t, new AbortController()), n || a.set(t, e), i.add(t), this._wrapMaterials(e), this._initTileOverlayInfo(t), await this._initTileSceneOverlayInfo(e, t), this.expandVirtualChildren(e, t), this._updateLayers(t), a.delete(t);
	}
	dispose() {
		let { tiles: e } = this;
		[...this.overlays].forEach((e) => {
			this.deleteOverlay(e);
		}), this.processedTiles.forEach((e) => {
			this._updateLayers(e), this.disposeTile(e);
		}), e.removeEventListener("update-after", this._onUpdateAfter), e.removeEventListener("tile-download-start", this._onTileDownloadStart), e.removeEventListener("tile-visibility-change", this._onTileVisibilityChange), this.resetVirtualChildren(!0);
	}
	getAttributions(e) {
		this.overlays.forEach((t) => {
			t.opacity > 0 && t.getAttributions(e);
		});
	}
	parseToMesh(e, t, n, r) {
		if (n === "image_overlay_tile_split") return t[un];
	}
	async resetVirtualChildren(e = !1) {
		this._virtualChildResetId++;
		let t = this._virtualChildResetId;
		if (await Promise.all(this.overlays.map((e) => e.whenReady())), t !== this._virtualChildResetId) return;
		let { tiles: n } = this, r = [];
		this.processedTiles.forEach((e) => {
			dn in e && r.push(e);
		}), r.sort((e, t) => t.internal.depth - e.internal.depth), r.forEach((t) => {
			let n = t.engineData.scene.clone();
			n.updateMatrixWorld(), (e || t[dn] !== this._getSplitVectors(n, t).hash) && this._removeVirtualChildren(t);
		}), e || n.forEachLoadedModel((e, t) => {
			this.expandVirtualChildren(e, t);
		});
	}
	_getSplitVectors(e, t, n = sn) {
		let { tiles: r, overlayInfo: i } = this, a = new y();
		a.setFromObject(e), a.getCenter(n);
		let o = [], s = [];
		i.forEach(({ tileInfo: e }, i) => {
			let a = e.get(t);
			if (a && a.target && i.shouldSplit(a.range)) {
				i.frame ? H.set(0, 0, 1).transformDirection(i.frame) : (r.surface.getPositionToNormal(n, H), H.length() < 1e-6 && H.set(1, 0, 0));
				let e = `${H.x.toFixed(3)},${H.y.toFixed(3)},${H.z.toFixed(3)}_`;
				s.includes(e) || s.push(e);
				let t = on.set(0, 0, 1);
				Math.abs(H.dot(t)) > .9999 && t.set(1, 0, 0);
				let a = new L().crossVectors(H, t).normalize(), c = new L().crossVectors(H, a).normalize();
				o.push(a, c);
			}
		});
		let c = [];
		for (; o.length !== 0;) {
			let e = o.pop().clone(), t = e.clone();
			for (let n = 0; n < o.length; n++) {
				let r = o[n], i = e.dot(r);
				Math.abs(i) > Math.cos(Math.PI / 8) && (t.addScaledVector(r, Math.sign(i)), e.copy(t).normalize(), o.splice(n, 1), n--);
			}
			c.push(t.normalize());
		}
		return {
			directions: c,
			hash: s.join("")
		};
	}
	async expandVirtualChildren(e, t) {
		let { refine: n } = t, r = n === "REPLACE" && t.children.length === 0 || n === "ADD", i = t.internal.virtualChildCount !== 0;
		if (this.enableTileSplitting === !1 || !r || i) return;
		let a = e.clone();
		a.updateMatrixWorld();
		let { directions: o, hash: s } = this._getSplitVectors(a, t, sn);
		if (o.length === 0) return;
		t[dn] = s;
		let c = new Rt();
		if (c.attributeList = (e) => !/^layer_uv_\d+/.test(e), o.map((e) => {
			c.addSplitOperation((t, n, r, i, a, o) => (je.getInterpolatedAttribute(t.attributes.position, n, r, i, a, on), on.applyMatrix4(o).sub(sn).dot(e)));
		}), t.refine !== "ADD" && !(pn in t)) {
			let e = ln.setFromObject(a).getSize(on).length() / this.resolution;
			t[pn] = t.geometricError, t.geometricError = Math.max(t.geometricError, e);
		}
		let l = [];
		c.forEachSplitPermutation(() => {
			let e = c.clipObject(a);
			e.matrix.premultiply(t.engineData.transformInverse).decompose(e.position, e.quaternion, e.scale);
			let n = [];
			if (e.traverse((e) => {
				if (e.isMesh) {
					let t = e.material.clone();
					e.material = t;
					for (let e in t) {
						let n = t[e];
						if (n && n.isTexture && n.source.data instanceof ImageBitmap) {
							let r = document.createElement("canvas");
							r.width = n.image.width, r.height = n.image.height;
							let i = r.getContext("2d");
							i.scale(1, -1), i.drawImage(n.source.data, 0, 0, r.width, -r.height);
							let a = new w(r);
							a.mapping = n.mapping, a.wrapS = n.wrapS, a.wrapT = n.wrapT, a.minFilter = n.minFilter, a.magFilter = n.magFilter, a.format = n.format, a.type = n.type, a.anisotropy = n.anisotropy, a.colorSpace = n.colorSpace, a.generateMipmaps = n.generateMipmaps, t[e] = a;
						}
					}
					n.push(e);
				}
			}), n.length === 0) return;
			let r = {};
			if (t.boundingVolume.region && (r.region = kt(n, this.tiles.surface).region), t.boundingVolume.box || t.boundingVolume.sphere) {
				ln.setFromObject(e, !0).getCenter(cn);
				let t = 0;
				e.traverse((e) => {
					let n = e.geometry;
					if (n) {
						let r = n.attributes.position;
						for (let n = 0, i = r.count; n < i; n++) {
							let i = on.fromBufferAttribute(r, n).applyMatrix4(e.matrixWorld).distanceToSquared(cn);
							t = Math.max(t, i);
						}
					}
				}), r.sphere = [...cn, Math.sqrt(t)];
			}
			l.push({
				internal: { isVirtual: !0 },
				refine: "REPLACE",
				geometricError: t.geometricError * .5,
				boundingVolume: r,
				content: { uri: "./child.image_overlay_tile_split" },
				children: [],
				[un]: e
			});
		}), t[fn] = t.refine, t.refine = "REPLACE", t.children.push(...l), t.internal.virtualChildCount += l.length;
	}
	fetchData(e, t) {
		if (/image_overlay_tile_split/.test(e)) return /* @__PURE__ */ new ArrayBuffer();
	}
	addOverlay(e, t = null) {
		let { tiles: n, overlays: r, overlayInfo: i } = this;
		t === null && (t = r.reduce((e, t) => Math.max(e, i.get(t).order + 1), 0));
		let a = new AbortController();
		r.push(e), i.set(e, {
			order: t,
			uniforms: {},
			tileInfo: /* @__PURE__ */ new Map(),
			controller: a,
			frame: e.frame ? e.frame.clone() : null
		}), n !== null && this._initOverlay(e);
	}
	setOverlayOrder(e, t) {
		this.overlays.indexOf(e) !== -1 && (this.overlayInfo.get(e).order = t, this._markNeedsUpdate());
	}
	deleteOverlay(e) {
		let { overlays: t, overlayInfo: n, processQueue: r, processedTiles: i, tiles: a } = this, o = t.indexOf(e);
		if (o !== -1) {
			let { tileInfo: s, controller: c } = n.get(e);
			i.forEach((t) => {
				if (!s.has(t)) return;
				let { meshInfo: n, range: r } = s.get(t);
				r !== null && (a.visibleTiles.has(t) && e.setRegionVisible(r, !1), e.releaseTexture(r)), s.delete(t), n.clear();
			}), s.clear(), n.delete(e), c.abort(), r.removeByFilter((t) => t.overlay === e && i.has(t.tile)), t.splice(o, 1), i.forEach((e) => {
				this._updateLayers(e);
			}), this._markNeedsUpdate();
		}
	}
	_initOverlay(e) {
		let { processedTiles: t } = this;
		e.init().then(() => {
			e.setResolution(this.resolution);
		});
		let n = [];
		t.forEach(async (t) => {
			let r = t.engineData.scene;
			this._initTileOverlayInfo(t, e);
			let i = this._initTileSceneOverlayInfo(r, t, e);
			n.push(i), await i, this._updateLayers(t);
		}), Promise.all(n).then(() => {
			this._markNeedsUpdate();
		});
	}
	_wrapMaterials(e) {
		e.traverse((e) => {
			if (e.material) {
				let t = Nt(e.material, e.material.onBeforeCompile);
				this.meshParams.set(e, t);
			}
		});
	}
	_initTileOverlayInfo(e, t = this.overlays) {
		if (Array.isArray(t)) {
			t.forEach((t) => this._initTileOverlayInfo(e, t));
			return;
		}
		let { overlayInfo: n } = this;
		if (n.get(t).tileInfo.has(e)) return;
		let r = {
			range: null,
			target: null,
			meshInfo: /* @__PURE__ */ new Map(),
			failed: !1
		};
		if (n.get(t).tileInfo.set(e, r), t.isReady && !t.isPlanarProjection) {
			let n = e.boundingVolume.region ?? e.boundingVolume.cartographicRange;
			if (n) {
				let [e, i, a, o] = n, s = [
					e,
					i,
					a,
					o
				];
				s = t.projection.clampToBounds(s), s = t.projection.fromCartographicToNormalizedRange(s), r.range = s, t.lockTextureSafe(s);
			}
		}
	}
	async _initTileSceneOverlayInfo(e, t, n = this.overlays) {
		if (Array.isArray(n)) return Promise.all(n.map((n) => this._initTileSceneOverlayInfo(e, t, n)));
		let { tiles: r, overlayInfo: i, tileControllers: a } = this, { surface: o } = r, { controller: s, tileInfo: c } = i.get(n), l = a.get(t);
		if (n.isReady || await n.whenReady(), s.signal.aborted || l.signal.aborted) return;
		let u = [];
		e.updateMatrixWorld(), e.traverse((e) => {
			e.isMesh && u.push(e);
		});
		let { aspectRatio: d, projection: f } = n, p = c.get(t), m, h, g;
		if (n.isPlanarProjection) {
			an.makeScale(1 / d, 1, 1).multiply(n.frame), e.parent !== null && an.multiply(r.group.matrixWorldInverse);
			let t;
			({range: m, uvs: h, heightRange: t} = jt(u, an)), g = !(t[0] > 1 || t[1] < 0);
		} else an.identity(), e.parent !== null && an.copy(r.group.matrixWorldInverse), {range: m, uvs: h} = kt(u, o, an, f, p.range), g = !0;
		p.range === null && (p.range = m, n.lockTextureSafe(m)), r.visibleTiles.has(t) && n.setRegionVisible(p.range, !0), g && n.hasContent(m) && await this._fetchTileOverlayTexture(t, n, p), u.forEach((e, t) => {
			let n = new Float32Array(h[t]), r = new S(n, 3);
			p.meshInfo.set(e, { attribute: r });
		});
	}
	async _fetchTileOverlayTexture(e, t, n) {
		let { tiles: r, overlayInfo: i, tileControllers: a, processQueue: o } = this, { controller: s } = i.get(t), c = a.get(e), { range: l } = n;
		n.target = await o.add({
			tile: e,
			overlay: t
		}, async () => {
			if (s.signal.aborted || c.signal.aborted) return null;
			let e = await t.getTexture(l);
			return s.signal.aborted || c.signal.aborted ? null : e;
		}).catch((i) => (i.name === "AbortError" || (n.failed = !0, r.dispatchEvent({
			type: "load-error",
			tile: e,
			overlay: t,
			error: i,
			url: null
		})), null));
	}
	resetFailedOverlays() {
		let { processedTiles: e, overlayInfo: t, overlays: n } = this, r = [];
		e.forEach((e) => {
			n.forEach((n) => {
				let { tileInfo: i } = t.get(n), a = i.get(e);
				a.failed && (a.failed = !1, n.releaseTexture(a.range), r.push({
					tile: e,
					overlay: n,
					info: a
				}));
			});
		}), requestAnimationFrame(() => {
			r.forEach(({ tile: e, overlay: t, info: n }) => {
				t.lockTextureSafe(n.range), this._fetchTileOverlayTexture(e, t, n).then(() => {
					this._updateLayers(e);
				}).catch((e) => {
					if (e.name !== "AbortError") throw e;
				});
			});
		});
	}
	_updateLayers(e) {
		let { overlayInfo: t, overlays: n, tileControllers: r, meshParams: i } = this, a = r.get(e);
		if (this.tiles.recalculateBytesUsed(e), a && !a.signal.aborted) {
			if (n.length === 0) {
				let t = e.engineData && e.engineData.scene;
				t && t.traverse((e) => {
					if (e.material && i.has(e)) {
						let t = i.get(e);
						t.layerMaps.length = 0, t.layerInfo.length = 0, e.material.defines.LAYER_COUNT = 0, e.material.needsUpdate = !0;
					}
				});
			} else n.forEach((r, a) => {
				let { tileInfo: o } = t.get(r), { meshInfo: s, target: c } = o.get(e);
				s.forEach(({ attribute: e }, t) => {
					let { geometry: o, material: s } = t, l = i.get(t), u = `layer_uv_${a}`;
					o.getAttribute(u) !== e && (o.setAttribute(u, e), o.dispose()), l.layerMaps.length = n.length, l.layerInfo.length = n.length, l.layerMaps.value[a] = c === null ? null : c, l.layerInfo.value[a] = r, s.defines[`LAYER_${a}_EXISTS`] = Number(c !== null), s.defines[`LAYER_${a}_ALPHA_INVERT`] = Number(r.alphaInvert), s.defines[`LAYER_${a}_ALPHA_MASK`] = Number(r.alphaMask), s.defines.LAYER_COUNT = n.length, s.needsUpdate = !0;
				});
			});
		}
	}
	_markNeedsUpdate() {
		this.needsUpdate === !1 && (this.needsUpdate = !0, this.tiles !== null && this.tiles.dispatchEvent({ type: "needs-update" }));
	}
}, gn = class {
	get isPlanarProjection() {
		return !!this.frame;
	}
	get downloadQueue() {
		return this._downloadQueue;
	}
	set downloadQueue(e) {
		e instanceof t ? console.warn("ImageOverlay: \"downloadQueue\" is no longer valid as a PriorityQueue. Use a DownloadPriorityQueue, instead.") : this._downloadQueue = e;
	}
	constructor(e = {}) {
		let { opacity: t = 1, color: n = 16777215, frame: r = null, preprocessURL: i = null, alphaMask: o = !1, alphaInvert: s = !1 } = e;
		this.preprocessURL = i, this.opacity = t, this.color = new T(n), this.frame = r === null ? null : r.clone(), this.alphaMask = o, this.alphaInvert = s, this.downloadQueue = a, this._whenReady = null, this.isReady = !1, this.isInitialized = !1, this._visibleRegionCounts = /* @__PURE__ */ new Map();
	}
	init() {
		return this.isInitialized || (this.isInitialized = !0, this._whenReady = this._init().then(() => this.isReady = !0)), this._whenReady;
	}
	whenReady() {
		return this._whenReady;
	}
	_init() {
		return Promise.resolve();
	}
	fetch(e, t = {}) {
		this.preprocessURL && (e = this.preprocessURL(e));
		let n = { priority: -performance.now() };
		return this.downloadQueue.add(e, n, () => fetch(e, t), t.signal);
	}
	getAttributions(e) {}
	hasContent(e, t = null) {
		return !1;
	}
	async getTexture(e, t = null) {
		return null;
	}
	async lockTexture(e, t = null) {
		return null;
	}
	lockTextureSafe(e) {
		let t = this.lockTexture(e);
		return t instanceof Promise && t.catch((e) => {
			if (e.name !== "AbortError") throw e;
		}), t;
	}
	releaseTexture(e, t = null) {}
	shouldSplit(e, t = null) {
		return !1;
	}
	setResolution(e) {}
	setRegionVisible(e, t) {
		let { _visibleRegionCounts: n } = this, r = e.join("_"), i = n.get(r);
		if (i || (i = {
			range: [...e],
			count: 0
		}, n.set(r, i)), i.count += t ? 1 : -1, i.count < 0) throw Error();
		i.count === 0 && n.delete(r);
	}
}, _n = class extends gn {
	get tiling() {
		return this.imageSource.tiling;
	}
	get projection() {
		return this.tiling.projection;
	}
	get aspectRatio() {
		return this.tiling && this.isReady ? this.tiling.aspectRatio : 1;
	}
	get fetchOptions() {
		return this.imageSource.fetchOptions;
	}
	set fetchOptions(e) {
		this.imageSource.fetchOptions = e;
	}
	constructor(e = {}) {
		let { imageSource: t = null, ...n } = e;
		super(n), this.imageSource = t, this.regionImageSource = null;
	}
	_init() {
		return this._initImageSource().then(() => {
			this.imageSource.fetchData = (...e) => this.fetch(...e), this.regionImageSource = new Jt(this.imageSource);
		});
	}
	_initImageSource() {
		return this.imageSource.init();
	}
	calculateLevel(e, t = null) {
		let [n, r, i, a] = e, o = i - n, s = a - r;
		t === null && (t = this.regionImageSource.resolution);
		let c = 0, l = this.tiling.maxLevel;
		for (; c < l; c++) {
			let e = t / o, n = t / s, r = this.tiling.getLevel(c);
			if (r == null) continue;
			let { pixelWidth: i, pixelHeight: a } = r;
			if (i >= e || a >= n) break;
		}
		return c;
	}
	hasContent(e, t = this.calculateLevel(e)) {
		return this.regionImageSource.hasContent(...e, t);
	}
	getTexture(e, t = this.calculateLevel(e)) {
		return this.regionImageSource.get(...e, t);
	}
	lockTexture(e, t = this.calculateLevel(e)) {
		return this.regionImageSource.lock(...e, t);
	}
	releaseTexture(e, t = this.calculateLevel(e)) {
		this.regionImageSource.release(...e, t);
	}
	shouldSplit(e, t = this.calculateLevel(e)) {
		return this.tiling.maxLevel > t;
	}
	setResolution(e) {
		this.regionImageSource.resolution = e;
	}
}, vn = class extends _n {
	constructor(e = {}) {
		super(e), this.imageSource = new wt(e);
	}
}, yn = class extends _n {
	constructor(e) {
		super(e), this.imageSource = new rn(e);
	}
}, bn = class extends gn {
	get projection() {
		return this.imageSource.projection;
	}
	get aspectRatio() {
		return 2;
	}
	get pointRadius() {
		return this.imageSource.pointRadius;
	}
	set pointRadius(e) {
		this.imageSource.pointRadius = e;
	}
	get strokeStyle() {
		return this.imageSource.strokeStyle;
	}
	set strokeStyle(e) {
		this.imageSource.strokeStyle = e;
	}
	get strokeWidth() {
		return this.imageSource.strokeWidth;
	}
	set strokeWidth(e) {
		this.imageSource.strokeWidth = e;
	}
	get fillStyle() {
		return this.imageSource.fillStyle;
	}
	set fillStyle(e) {
		this.imageSource.fillStyle = e;
	}
	get geojson() {
		return this.imageSource.geojson;
	}
	set geojson(e) {
		this.imageSource.geojson = e;
	}
	constructor(e = {}) {
		super(e), this.imageSource = new tn(e), this._redrawQueue = new t(), this._redrawQueue.maxJobs = 4, this._redrawQueue.priorityCallback = () => 0;
	}
	_init() {
		return this.imageSource.init();
	}
	hasContent(e) {
		return this.imageSource.hasContent(...e);
	}
	getTexture(e) {
		return this.imageSource.get(...e);
	}
	lockTexture(e) {
		return this.imageSource.lock(...e);
	}
	releaseTexture(e) {
		this.imageSource.release(...e);
	}
	setResolution(e) {
		this.imageSource.resolution = e;
	}
	shouldSplit(e) {
		return !0;
	}
	setRegionVisible(e, t) {
		if (super.setRegionVisible(e, t), t) {
			let { _redrawQueue: t } = this, n = e.join("_");
			t.has(n) && t.flush(n);
		}
	}
	redraw() {
		let { imageSource: e, _redrawQueue: t, _visibleRegionCounts: n } = this;
		for (let { range: t } of n.values()) e.redraw(...t);
		e.forEachItem((r, i) => {
			let a = i.join("_");
			!n.has(a) && !t.has(a) && t.add(a, () => {
				e.redraw(...i);
			});
		});
	}
}, xn = class extends _n {
	constructor(e = {}) {
		super(e), this.imageSource = new nn(e);
	}
}, Sn = class extends _n {
	constructor(e = {}) {
		super(e), this.imageSource = new Ut(e);
	}
}, Cn = class extends _n {
	constructor(e = {}) {
		super(e), this.imageSource = new Et(e);
	}
}, wn = class extends _n {
	constructor(e = {}) {
		super(e);
		let { apiToken: t, autoRefreshToken: n, assetId: r } = e;
		this.options = e, this.assetId = r, this.auth = new p({
			apiToken: t,
			autoRefreshToken: n
		}), this.auth.authURL = `https://api.cesium.com/v1/assets/${r}/endpoint`, this._attributions = [], this.externalType = !1;
	}
	_initImageSource() {
		return this.auth.refreshToken().then(async (e) => {
			if (this._attributions = e.attributions.map((e) => ({
				value: e.html,
				type: "html",
				collapsible: e.collapsible
			})), e.type !== "IMAGERY") throw Error("CesiumIonOverlay: Only IMAGERY is supported as overlay type.");
			switch (this.externalType = !!e.externalType, e.externalType) {
				case "GOOGLE_2D_MAPS": {
					let { url: t, session: n, key: r, tileWidth: i } = e.options, a = `${t}/v1/2dtiles/{z}/{x}/{y}?session=${n}&key=${r}`;
					this.imageSource = new wt({
						...this.options,
						url: a,
						tileDimension: i,
						levels: 22
					});
					break;
				}
				case "BING": {
					let { url: t, mapStyle: n, key: r } = e.options, i = `${t}/REST/v1/Imagery/Metadata/${n}?incl=ImageryProviders&key=${r}&uriScheme=https`, a = (await fetch(i).then((e) => e.json())).resourceSets[0].resources[0];
					this.imageSource = new Tt({
						...this.options,
						url: a.imageUrl,
						subdomains: a.imageUrlSubdomains,
						tileDimension: a.tileWidth,
						levels: a.zoomMax
					});
					break;
				}
				default: this.imageSource = new Et({
					...this.options,
					url: e.url
				});
			}
			return this.imageSource.fetchData = (...e) => this.fetch(...e), this.imageSource.init();
		});
	}
	fetch(e, t = {}) {
		if (this.externalType) return super.fetch(e, t);
		this.preprocessURL && (e = this.preprocessURL(e));
		let n = { priority: -performance.now() };
		return this.downloadQueue.add(e, n, () => this.auth.fetch(e, t), t.signal);
	}
	getAttributions(e) {
		e.push(...this._attributions);
	}
}, Tn = class extends _n {
	constructor(e = {}) {
		super(e);
		let { apiToken: t, sessionOptions: n, autoRefreshToken: r, logoUrl: i } = e;
		this.logoUrl = i, this.auth = new h({
			apiToken: t,
			sessionOptions: n,
			autoRefreshToken: r
		}), this.imageSource = new wt(), this.imageSource.fetchData = (...e) => this.fetch(...e), this._logoAttribution = {
			value: "",
			type: "image",
			collapsible: !1
		};
	}
	_initImageSource() {
		return this.auth.refreshToken().then((e) => (this.imageSource.tileDimension = e.tileWidth, this.imageSource.url = "https://tile.googleapis.com/v1/2dtiles/{z}/{x}/{y}", this.imageSource.init()));
	}
	fetch(e, t = {}) {
		this.preprocessURL && (e = this.preprocessURL(e));
		let n = { priority: -performance.now() };
		return this.downloadQueue.add(e, n, () => this.auth.fetch(e, t), t.signal);
	}
	getAttributions(e) {
		this.logoUrl && (this._logoAttribution.value = this.logoUrl, e.push(this._logoAttribution));
	}
}, En = /* @__PURE__ */ new L(), Dn = /* @__PURE__ */ new je(), U = /* @__PURE__ */ new L(), On = /* @__PURE__ */ new L(), kn = class extends g {
	constructor(e = O) {
		super(), this.manager = e, this.ellipsoid = new l(), this.skirtLength = 1e3, this.smoothSkirtNormals = !0, this.generateNormals = !0, this.solid = !1, this.minLat = -Math.PI / 2, this.maxLat = Math.PI / 2, this.minLon = -Math.PI, this.maxLon = Math.PI;
	}
	parse(e) {
		let { ellipsoid: t, solid: n, skirtLength: r, smoothSkirtNormals: i, generateNormals: a, minLat: o, maxLat: s, minLon: c, maxLon: l } = this, { header: u, indices: d, vertexData: f, edgeIndices: p, extensions: m } = super.parse(e), h = new C(), g = new de(), _ = new F(h, g);
		_.position.set(...u.center);
		let v = "octvertexnormals" in m, y = v || a, b = f.u.length, x = [], w = [], T = [], E = [], O = 0, k = 0;
		for (let e = 0; e < b; e++) ee(e, U), j(U.x, U.y, U.z, On), w.push(U.x, U.y), x.push(...On);
		for (let e = 0, t = d.length; e < t; e++) T.push(d[e]);
		if (y) {
			if (v) {
				let e = m.octvertexnormals.normals;
				for (let t = 0, n = e.length; t < n; t++) E.push(e[t]);
			} else {
				let e = new C(), t = d.length > 21845 ? new Uint32Array(d) : new Uint16Array(d);
				e.setIndex(new S(t, 1, !1)), e.setAttribute("position", new S(new Float32Array(x), 3, !1)), e.computeVertexNormals();
				let n = e.getAttribute("normal").array;
				m.octvertexnormals = { normals: n };
				for (let e = 0, t = n.length; e < t; e++) E.push(n[e]);
			}
		}
		if (h.addGroup(O, d.length, k), O += d.length, k++, n) {
			let e = x.length / 3;
			for (let e = 0; e < b; e++) ee(e, U), j(U.x, U.y, U.z, On, -r), w.push(U.x, U.y), x.push(...On);
			for (let t = d.length - 1; t >= 0; t--) T.push(d[t] + e);
			if (y) {
				let e = m.octvertexnormals.normals;
				for (let t = 0, n = e.length; t < n; t++) E.push(-e[t]);
			}
			h.addGroup(O, d.length, k), O += d.length, k++;
		}
		if (r > 0) {
			let { westIndices: e, eastIndices: t, southIndices: n, northIndices: r } = p, i, a = M(e);
			i = x.length / 3, w.push(...a.uv), x.push(...a.positions);
			for (let e = 0, t = a.indices.length; e < t; e++) T.push(a.indices[e] + i);
			let o = M(t);
			i = x.length / 3, w.push(...o.uv), x.push(...o.positions);
			for (let e = 0, t = o.indices.length; e < t; e++) T.push(o.indices[e] + i);
			let s = M(n);
			i = x.length / 3, w.push(...s.uv), x.push(...s.positions);
			for (let e = 0, t = s.indices.length; e < t; e++) T.push(s.indices[e] + i);
			let c = M(r);
			i = x.length / 3, w.push(...c.uv), x.push(...c.positions);
			for (let e = 0, t = c.indices.length; e < t; e++) T.push(c.indices[e] + i);
			y && (E.push(...a.normals), E.push(...o.normals), E.push(...s.normals), E.push(...c.normals)), h.addGroup(O, d.length, k), O += d.length, k++;
		}
		for (let e = 0, t = x.length; e < t; e += 3) x[e + 0] -= u.center[0], x[e + 1] -= u.center[1], x[e + 2] -= u.center[2];
		let A = x.length / 3 > 65535 ? new Uint32Array(T) : new Uint16Array(T);
		if (h.setIndex(new S(A, 1, !1)), h.setAttribute("position", new S(new Float32Array(x), 3, !1)), h.setAttribute("uv", new S(new Float32Array(w), 2, !1)), y && h.setAttribute("normal", new S(new Float32Array(E), 3, !1)), "watermask" in m) {
			let { mask: e, size: t } = m.watermask, n = new Uint8Array(2 * t * t);
			for (let t = 0, r = e.length; t < r; t++) {
				let r = e[t] === 255 ? 0 : 255;
				n[2 * t + 0] = r, n[2 * t + 1] = r;
			}
			let r = new D(n, t, t, be, Me);
			r.flipY = !0, r.minFilter = oe, r.magFilter = ae, r.needsUpdate = !0, g.roughnessMap = r;
		}
		return _.userData.minHeight = u.minHeight, _.userData.maxHeight = u.maxHeight, "metadata" in m && (_.userData.metadata = m.metadata.json), _;
		function ee(e, t) {
			return t.x = f.u[e], t.y = f.v[e], t.z = f.height[e], t;
		}
		function j(e, n, r, i, a = 0) {
			let d = N.lerp(u.minHeight, u.maxHeight, r), f = N.lerp(c, l, e), p = N.lerp(o, s, n);
			return t.getCartographicToPosition(p, f, d + a, i), i;
		}
		function M(e) {
			let t = [], n = [], a = [], o = [], s = [];
			for (let i = 0, s = e.length; i < s; i++) ee(e[i], U), t.push(U.x, U.y), a.push(U.x, U.y), j(U.x, U.y, U.z, On), n.push(...On), j(U.x, U.y, U.z, On, -r), o.push(...On);
			let c = e.length - 1;
			for (let t = 0; t < c; t++) {
				let n = t, r = t + 1, i = t + e.length, a = t + e.length + 1;
				s.push(n, i, r), s.push(r, i, a);
			}
			let l = null;
			if (y) {
				let t = (n.length + o.length) / 3;
				if (i) {
					l = Array(t * 3);
					let n = m.octvertexnormals.normals, r = l.length / 2;
					for (let i = 0, a = t / 2; i < a; i++) {
						let t = e[i], a = 3 * i, o = n[3 * t + 0], s = n[3 * t + 1], c = n[3 * t + 2];
						l[a + 0] = o, l[a + 1] = s, l[a + 2] = c, l[r + a + 0] = o, l[r + a + 1] = s, l[r + a + 2] = c;
					}
				} else {
					l = [], Dn.a.fromArray(n, 0), Dn.b.fromArray(o, 0), Dn.c.fromArray(n, 3), Dn.getNormal(En);
					for (let e = 0; e < t; e++) l.push(...En);
				}
			}
			return {
				uv: [...t, ...a],
				positions: [...n, ...o],
				indices: s,
				normals: l
			};
		}
	}
}, An = {}, jn = /* @__PURE__ */ new L(), Mn = /* @__PURE__ */ new L(), Nn = /* @__PURE__ */ new L(), Pn = /* @__PURE__ */ new L(), Fn = /* @__PURE__ */ new L(), W = /* @__PURE__ */ new L(), In = /* @__PURE__ */ new L(), G = /* @__PURE__ */ new I(), Ln = /* @__PURE__ */ new I(), Rn = /* @__PURE__ */ new I(), zn = class extends Rt {
	constructor() {
		super(), this.ellipsoid = new l(), this.skirtLength = 1e3, this.smoothSkirtNormals = !0, this.solid = !1, this.minLat = -Math.PI / 2, this.maxLat = Math.PI / 2, this.minLon = -Math.PI, this.maxLon = Math.PI, this.attributeList = [
			"position",
			"normal",
			"uv"
		];
	}
	clipToQuadrant(e, t, n) {
		let { solid: r, skirtLength: i, ellipsoid: a, smoothSkirtNormals: o } = this;
		this.clearSplitOperations(), this.addSplitOperation(Bn("x"), !t), this.addSplitOperation(Bn("y"), !n);
		let s, c, l = e.geometry.groups[0], u = this.getClippedData(e, l);
		if (this.adjustVertices(u, e.position, 0), r) {
			s = {
				index: u.index.slice().reverse(),
				attributes: {}
			};
			for (let e in u.attributes) s.attributes[e] = u.attributes[e].slice();
			let t = s.attributes.normal;
			if (t) for (let e = 0; e < t.length; e += 3) t[e + 0] *= -1, t[e + 1] *= -1, t[e + 2] *= -1;
			this.adjustVertices(s, e.position, -i);
		}
		if (i > 0) {
			c = {
				index: [],
				attributes: {
					position: [],
					normal: [],
					uv: []
				}
			};
			let t = 0, n = {}, r = (e, r, i) => {
				let a = Ht(...e, ...i, ...r);
				a in n || (n[a] = t, t++, c.attributes.position.push(...e), c.attributes.normal.push(...i), c.attributes.uv.push(...r)), c.index.push(n[a]);
			}, s = u.index, l = u.attributes.uv, d = u.attributes.position, f = u.attributes.normal, p = u.index.length / 3;
			for (let t = 0; t < p; t++) {
				let n = 3 * t;
				for (let t = 0; t < 3; t++) {
					let c = (t + 1) % 3, u = s[n + t], p = s[n + c];
					if (G.fromArray(l, u * 2), Ln.fromArray(l, p * 2), G.x === Ln.x && (G.x === 0 || G.x === .5 || G.x === 1) || G.y === Ln.y && (G.y === 0 || G.y === .5 || G.y === 1)) {
						Mn.fromArray(d, u * 3), Nn.fromArray(d, p * 3);
						let t = Mn, n = Nn, s = Pn.copy(Mn), c = Fn.copy(Nn);
						W.copy(s).add(e.position), a.getPositionToNormal(W, W), s.addScaledVector(W, -i), W.copy(c).add(e.position), a.getPositionToNormal(W, W), c.addScaledVector(W, -i), o && f ? (W.fromArray(f, u * 3), In.fromArray(f, p * 3)) : (W.subVectors(t, n), In.subVectors(t, s).cross(W).normalize(), W.copy(In)), r(n, Ln, In), r(t, G, W), r(s, G, W), r(n, Ln, In), r(s, G, W), r(c, Ln, In);
					}
				}
			}
		}
		let d = u.index.length, f = u;
		if (s) {
			let { index: e, attributes: t } = s, n = f.attributes.position.length / 3;
			for (let t = 0, r = e.length; t < r; t++) f.index.push(e[t] + n);
			for (let e in u.attributes) f.attributes[e].push(...t[e]);
		}
		if (c) {
			let { index: e, attributes: t } = c, n = f.attributes.position.length / 3;
			for (let t = 0, r = e.length; t < r; t++) f.index.push(e[t] + n);
			for (let e in u.attributes) f.attributes[e].push(...t[e]);
		}
		let p = t ? 0 : -.5, m = n ? 0 : -.5, h = f.attributes.uv;
		for (let e = 0, t = h.length; e < t; e += 2) h[e] = (h[e] + p) * 2, h[e + 1] = (h[e + 1] + m) * 2;
		let g = this.constructMesh(f.attributes, f.index, e);
		g.userData.minHeight = e.userData.minHeight, g.userData.maxHeight = e.userData.maxHeight;
		let _ = 0, v = 0;
		return g.geometry.addGroup(v, d, _), v += d, _++, s && (g.geometry.addGroup(v, s.index.length, _), v += s.index.length, _++), c && (g.geometry.addGroup(v, c.index.length, _), v += c.index.length, _++), g;
	}
	adjustVertices(e, t, n) {
		let { ellipsoid: r, minLat: i, maxLat: a, minLon: o, maxLon: s } = this, { attributes: c, vertexIsClipped: l } = e, u = c.position, d = c.uv, f = u.length / 3;
		for (let e = 0; e < f; e++) {
			let c = G.fromArray(d, e * 2);
			l && l[e] && (Math.abs(c.x - .5) < 1e-10 && (c.x = .5), Math.abs(c.y - .5) < 1e-10 && (c.y = .5), G.toArray(d, e * 2));
			let f = N.lerp(i, a, c.y), p = N.lerp(o, s, c.x), m = jn.fromArray(u, e * 3).add(t);
			r.getPositionToCartographic(m, An), r.getCartographicToPosition(f, p, An.height + n, m), m.sub(t), m.toArray(u, e * 3);
		}
	}
};
function Bn(e) {
	return (t, n, r, i, a) => {
		let o = t.attributes.uv;
		return G.fromBufferAttribute(o, n), Ln.fromBufferAttribute(o, r), Rn.fromBufferAttribute(o, i), G[e] * a.x + Ln[e] * a.y + Rn[e] * a.z - .5;
	};
}
// src/three/plugins/QuantizedMeshPlugin.js
var Vn = Symbol("TILE_X"), Hn = Symbol("TILE_Y"), Un = Symbol("TILE_LEVEL"), Wn = Symbol("TILE_AVAILABLE"), Gn = Symbol("TILE_SPLIT_SOURCE_SCENE"), Kn = 1e4, qn = /* @__PURE__ */ new L();
function Jn(e, t, n, r) {
	if (e && t < e.length) {
		let i = e[t];
		for (let e = 0, t = i.length; e < t; e++) {
			let { startX: t, startY: a, endX: o, endY: s } = i[e];
			if (n >= t && n <= o && r >= a && r <= s) return !0;
		}
	}
	return !1;
}
function Yn(e) {
	let { available: t = null, maxzoom: n = null } = e;
	return n === null ? t.length - 1 : n;
}
function Xn(e) {
	let { metadataAvailability: t = -1 } = e;
	return t;
}
function Zn(e, t) {
	let n = e[Un], r = Xn(t);
	return n < Yn(t) && r !== -1 && n % r === 0;
}
function Qn(e, t, n, r, i) {
	return i.tiles[0].replace(/{\s*z\s*}/g, n).replace(/{\s*x\s*}/g, e).replace(/{\s*y\s*}/g, t).replace(/{\s*version\s*}/g, r);
}
var $n = class {
	constructor(e = {}) {
		let { useRecommendedSettings: t = !0, skirtLength: n = null, smoothSkirtNormals: r = !0, generateNormals: i = !0, solid: a = !1 } = e;
		this.name = "QUANTIZED_MESH_PLUGIN", this.priority = -1e3, this.tiles = null, this.layer = null, this.useRecommendedSettings = t, this.skirtLength = n, this.smoothSkirtNormals = r, this.solid = a, this.generateNormals = i, this.attribution = null, this.tiling = new at(), this.projection = new R();
	}
	init(e) {
		e.fetchOptions.headers = e.fetchOptions.headers || {}, e.fetchOptions.headers.Accept = "application/vnd.quantized-mesh,application/octet-stream;q=0.9", this.useRecommendedSettings && (e.errorTarget = 2), this.tiles = e;
	}
	loadRootTileset() {
		let { tiles: e } = this, t = new URL("layer.json", new URL(e.rootURL, location.href));
		return e.invokeAllPlugins((e) => t = e.preprocessURL ? e.preprocessURL(t, null) : t), e.invokeOnePlugin((e) => e.fetchData && e.fetchData(t, this.tiles.fetchOptions)).then((e) => e.json()).then((e) => {
			this.layer = e;
			let { projection: t = "EPSG:4326", extensions: n = [], attribution: r = "", available: i = null } = e, { tiling: a, tiles: o, projection: s } = this;
			r && (this.attribution = {
				value: r,
				type: "string",
				collapsible: !0
			}), n.length > 0 && (o.fetchOptions.headers.Accept += `;extensions=${n.join("-")}`), s.setScheme(t);
			let { tileCountX: c, tileCountY: l } = s;
			a.setProjection(s), a.generateLevels(Yn(e) + 1, c, l);
			let u = [];
			for (let e = 0; e < c; e++) {
				let t = this.createChild(0, e, 0, i);
				t && u.push(t);
			}
			let d = {
				asset: { version: "1.1" },
				geometricError: Infinity,
				root: {
					refine: "REPLACE",
					geometricError: Infinity,
					boundingVolume: { region: [
						...this.tiling.getContentBounds(),
						-1e4,
						Kn
					] },
					children: u,
					[Wn]: i,
					[Un]: -1
				}
			}, f = o.rootURL;
			return o.invokeAllPlugins((e) => f = e.preprocessURL ? e.preprocessURL(f, null) : f), o.preprocessTileset(d, f), d;
		});
	}
	parseToMesh(e, t, n, r) {
		let { skirtLength: i, solid: a, smoothSkirtNormals: o, generateNormals: s, tiles: c } = this, l = c.ellipsoid, u;
		if (n === "quantized_tile_split") {
			let e = new URL(r).searchParams, n = e.get("left") === "true", s = e.get("bottom") === "true", c = new zn();
			c.ellipsoid.copy(l), c.solid = a, c.smoothSkirtNormals = o, c.skirtLength = i === null ? t.geometricError : i;
			let [d, f, p, m] = t.parent.boundingVolume.region;
			c.minLat = f, c.maxLat = m, c.minLon = d, c.maxLon = p;
			let h = t.parent.engineData.scene || t.parent[Gn];
			u = c.clipToQuadrant(h, n, s);
		} else if (n === "terrain") {
			let n = new kn(c.manager);
			n.ellipsoid.copy(l), n.solid = a, n.smoothSkirtNormals = o, n.generateNormals = s, n.skirtLength = i === null ? t.geometricError : i;
			let [r, d, f, p] = t.boundingVolume.region;
			n.minLat = d, n.maxLat = p, n.minLon = r, n.maxLon = f, u = n.parse(e);
		} else return;
		let { minHeight: d, maxHeight: f, metadata: p } = u.userData;
		return t.boundingVolume.region[4] = d, t.boundingVolume.region[5] = f, t.engineData.boundingVolume.setRegionData(l, ...t.boundingVolume.region), p && ("geometricerror" in p && (t.geometricError = p.geometricerror), Zn(t, this.layer) && "available" in p && t.children.length === 0 && (t[Wn] = [...Array(t[Un] + 1).fill(null), ...p.available])), t[Gn] = u, this.expandChildren(t), u;
	}
	getAttributions(e) {
		this.attribution && e.push(this.attribution);
	}
	createChild(e, t, n, r) {
		let { tiles: i, layer: a, tiling: o, projection: s } = this, c = i.ellipsoid, l = r === null && e === 0 || Jn(r, e, t, n), u = Qn(t, n, e, 1, a), d = [
			...o.getTileBounds(t, n, e),
			-1e4,
			Kn
		], [, f, , p, , m] = d, h = f > 0 == p > 0 ? Math.min(Math.abs(f), Math.abs(p)) : 0;
		c.getCartographicToPosition(h, 0, m, qn), qn.z = 0;
		let g = s.tileCountX, _ = Math.max(...c.radius) * 2 * Math.PI * .25 / (65 * g) / 2 ** e, v = {
			[Wn]: null,
			[Un]: e,
			[Vn]: t,
			[Hn]: n,
			refine: "REPLACE",
			geometricError: _,
			boundingVolume: { region: d },
			content: l ? { uri: u } : null,
			children: []
		};
		return Zn(v, a) || (v[Wn] = r), v;
	}
	expandChildren(e) {
		let t = e[Un], n = e[Vn], r = e[Hn], i = e[Wn];
		if (t >= this.tiling.maxLevel) return;
		let a = !1;
		for (let o = 0; o < 2; o++) for (let s = 0; s < 2; s++) {
			let c = this.createChild(t + 1, 2 * n + o, 2 * r + s, i);
			c.content === null ? (c.content = { uri: `tile.quantized_tile_split?bottom=${s === 0}&left=${o === 0}` }, c.internal = { isVirtual: !0 }, e.internal.virtualChildCount++, e.children.push(c)) : (e.children.push(c), a = !0);
		}
		a || (e.children.length -= e.internal.virtualChildCount, e.internal.virtualChildCount = 0);
	}
	fetchData(e, t) {
		if (/quantized_tile_split/.test(e)) return /* @__PURE__ */ new ArrayBuffer();
	}
	disposeTile(e) {
		let { tiles: t, layer: n } = this;
		if (delete e[Gn], Zn(e, n) && (e[Wn] = null), Wn in e) {
			let { virtualChildCount: n } = e.internal, r = e.children.length, i = r - n;
			for (let n = i; n < r; n++) t.processNodeQueue.remove(e.children[n]);
			e.children.length = 0, e.internal.virtualChildCount = 0;
		}
	}
}, er = class extends f {
	constructor(e = {}) {
		super({
			assetTypeHandler: (e, t, n) => {
				if (e === "TERRAIN" && t.getPluginByName("QUANTIZED_MESH_PLUGIN") === null) t.registerPlugin(new $n({ useRecommendedSettings: this.useRecommendedSettings }));
				else if (e === "IMAGERY" && t.getPluginByName("GENERATED_SURFACE_PLUGIN") === null) {
					let e = new Cn({ url: t.rootURL });
					t.registerPlugin(new yt({
						projection: "ellipsoid",
						overlay: e
					}));
				} else console.warn(`CesiumIonAuthPlugin: Cesium Ion asset type "${e}" unhandled.`);
			},
			...e
		});
	}
}, tr = /* @__PURE__ */ new P(), nr = class {
	constructor() {
		this.name = "UPDATE_ON_CHANGE_PLUGIN", this.tiles = null, this.needsUpdate = !1, this.cameraMatrices = /* @__PURE__ */ new Map();
	}
	init(e) {
		this.tiles = e, this._needsUpdateCallback = () => {
			this.needsUpdate = !0;
		}, this._onCameraAdd = ({ camera: e }) => {
			this.needsUpdate = !0, this.cameraMatrices.set(e, new P());
		}, this._onCameraDelete = ({ camera: e }) => {
			this.needsUpdate = !0, this.cameraMatrices.delete(e);
		}, e.addEventListener("needs-update", this._needsUpdateCallback), e.addEventListener("add-camera", this._onCameraAdd), e.addEventListener("delete-camera", this._onCameraDelete), e.addEventListener("camera-resolution-change", this._needsUpdateCallback), e.cameras.forEach((e) => {
			this._onCameraAdd({ camera: e });
		});
	}
	doTilesNeedUpdate() {
		let e = this.tiles, t = !1;
		this.cameraMatrices.forEach((n, r) => {
			tr.copy(e.group.matrixWorld).premultiply(r.matrixWorldInverse).premultiply(r.projectionMatrixInverse), t ||= !tr.equals(n), n.copy(tr);
		});
		let n = this.needsUpdate;
		return this.needsUpdate = !1, n || t;
	}
	preprocessNode() {
		this.needsUpdate = !0;
	}
	dispose() {
		let e = this.tiles;
		e.removeEventListener("camera-resolution-change", this._needsUpdateCallback), e.removeEventListener("needs-update", this._needsUpdateCallback), e.removeEventListener("add-camera", this._onCameraAdd), e.removeEventListener("delete-camera", this._onCameraDelete);
	}
}, rr = /* @__PURE__ */ new L();
function ir(e, t) {
	if (e.isInterleavedBufferAttribute || e.array instanceof t) return e;
	let n = t === Int8Array || t === Int16Array || t === Int32Array ? -1 : 0, r = new t(e.count * e.itemSize), i = new S(r, e.itemSize, !0), a = e.itemSize, o = e.count;
	for (let t = 0; t < o; t++) for (let r = 0; r < a; r++) {
		let a = N.clamp(e.getComponent(t, r), n, 1);
		i.setComponent(t, r, a);
	}
	return i;
}
function ar(e, t = Int16Array) {
	let n = e.geometry, r = n.attributes, i = r.position;
	if (i.isInterleavedBufferAttribute || i.array instanceof t) return i;
	let a = new t(i.count * i.itemSize), o = new S(a, i.itemSize, !1), s = i.itemSize, c = i.count;
	n.computeBoundingBox();
	let l = n.boundingBox, { min: u, max: d } = l, f = 2 ** (8 * t.BYTES_PER_ELEMENT - 1) - 1, p = -f;
	for (let e = 0; e < c; e++) for (let t = 0; t < s; t++) {
		let n = t === 0 ? "x" : t === 1 ? "y" : "z", r = u[n], a = d[n], s = N.mapLinear(i.getComponent(e, t), r, a, p, f);
		o.setComponent(e, t, s);
	}
	l.getCenter(rr).multiply(e.scale).applyQuaternion(e.quaternion), e.position.add(rr), e.scale.x *= .5 * (d.x - u.x) / f, e.scale.y *= .5 * (d.y - u.y) / f, e.scale.z *= .5 * (d.z - u.z) / f, r.position = o, e.geometry.boundingBox = null, e.geometry.boundingSphere = null, e.updateMatrixWorld();
}
var or = class {
	constructor(e) {
		this._options = {
			generateNormals: !1,
			disableMipmaps: !0,
			compressIndex: !0,
			compressNormals: !1,
			compressUvs: !1,
			compressPosition: !1,
			uvType: Int8Array,
			normalType: Int8Array,
			positionType: Int16Array,
			...e
		}, this.name = "TILES_COMPRESSION_PLUGIN", this.priority = -100;
	}
	processTileModel(e, t) {
		let { generateNormals: n, disableMipmaps: r, compressIndex: i, compressUvs: a, compressNormals: o, compressPosition: s, uvType: c, normalType: l, positionType: u } = this._options;
		e.traverse((e) => {
			if (e.material && r) {
				let t = e.material;
				for (let e in t) {
					let n = t[e];
					n && n.isTexture && n.generateMipmaps && (n.generateMipmaps = !1, n.minFilter = ae);
				}
			}
			if (e.geometry) {
				let t = e.geometry, r = t.attributes;
				if (a) {
					let { uv: e, uv1: t, uv2: n, uv3: i } = r;
					e && (r.uv = ir(e, c)), t && (r.uv1 = ir(t, c)), n && (r.uv2 = ir(n, c)), i && (r.uv3 = ir(i, c));
				}
				if (n && !r.normals && t.computeVertexNormals(), o && r.normals && (r.normals = ir(r.normals, l)), s && ar(e, u), i && t.index) {
					let e = r.position.count, n = t.index, i = e > 65535 ? Uint32Array : e > 255 ? Uint16Array : Uint8Array;
					if (!(n.array instanceof i)) {
						let e = new i(t.index.count);
						e.set(n.array);
						let r = new S(e, 1);
						t.setIndex(r);
					}
				}
			}
		});
	}
};
// src/three/plugins/gltf/metadata/utilities/ClassPropertyHelpers.js
function K(e, t, n) {
	return e && t in e ? e[t] : n;
}
function sr(e) {
	return e !== "BOOLEAN" && e !== "STRING" && e !== "ENUM";
}
function cr(e) {
	return /^FLOAT/.test(e);
}
function lr(e) {
	return /^VEC/.test(e);
}
function ur(e) {
	return /^MAT/.test(e);
}
function dr(e, t, n, r = null) {
	return ur(n) || lr(n) ? r.fromArray(e, t) : e[t];
}
function fr(e) {
	let { type: t, componentType: n } = e;
	switch (t) {
		case "SCALAR": return n === "INT64" ? 0n : 0;
		case "VEC2": return new I();
		case "VEC3": return new L();
		case "VEC4": return new Ne();
		case "MAT2": return new se();
		case "MAT3": return new ce();
		case "MAT4": return new P();
		case "BOOLEAN": return !1;
		case "STRING": return "";
		case "ENUM": return 0;
	}
}
function pr(e, t) {
	if (t == null) return !1;
	switch (e) {
		case "SCALAR": return typeof t == "number" || typeof t == "bigint";
		case "VEC2": return t.isVector2;
		case "VEC3": return t.isVector3;
		case "VEC4": return t.isVector4;
		case "MAT2": return t.isMatrix2;
		case "MAT3": return t.isMatrix3;
		case "MAT4": return t.isMatrix4;
		case "BOOLEAN": return typeof t == "boolean";
		case "STRING": return typeof t == "string";
		case "ENUM": return typeof t == "number" || typeof t == "bigint";
	}
	throw Error("ClassProperty: invalid type.");
}
function mr(e, t = null) {
	switch (e) {
		case "INT8": return Int8Array;
		case "INT16": return Int16Array;
		case "INT32": return Int32Array;
		case "INT64": return BigInt64Array;
		case "UINT8": return Uint8Array;
		case "UINT16": return Uint16Array;
		case "UINT32": return Uint32Array;
		case "UINT64": return BigUint64Array;
		case "FLOAT32": return Float32Array;
		case "FLOAT64": return Float64Array;
	}
	switch (t) {
		case "BOOLEAN": return Uint8Array;
		case "STRING": return Uint8Array;
	}
	throw Error("ClassProperty: invalid type.");
}
function hr(e, t = null) {
	if (e.array) {
		t = t && Array.isArray(t) ? t : [], t.length = e.count;
		for (let n = 0, r = t.length; n < r; n++) t[n] = gr(e, t[n]);
	} else t = gr(e, t);
	return t;
}
function gr(e, t = null) {
	let n = e.default, r = e.type;
	if (t ||= fr(e), n === null) {
		switch (r) {
			case "SCALAR": return 0;
			case "VEC2": return t.set(0, 0);
			case "VEC3": return t.set(0, 0, 0);
			case "VEC4": return t.set(0, 0, 0, 0);
			case "MAT2": return t.identity();
			case "MAT3": return t.identity();
			case "MAT4": return t.identity();
			case "BOOLEAN": return !1;
			case "STRING": return "";
			case "ENUM": return "";
		}
		throw Error("ClassProperty: invalid type.");
	}
	if (ur(r)) t.fromArray(n);
	else if (lr(r)) t.fromArray(n);
	else return n;
}
function _r(e, t) {
	if (e.noData === null) return t;
	let n = e.noData, r = e.type;
	if (Array.isArray(t)) for (let e = 0, n = t.length; e < n; e++) t[e] = i(t[e]);
	else t = i(t);
	return t;
	function i(t) {
		return a(t) && (t = gr(e, t)), t;
	}
	function a(e) {
		if (ur(r)) {
			let t = e.elements;
			for (let e = 0, r = n.length; e < r; e++) if (n[e] !== t[e]) return !1;
			return !0;
		}
		if (lr(r)) {
			for (let t = 0, r = n.length; t < r; t++) if (n[t] !== e.getComponent(t)) return !1;
			return !0;
		}
		return n === e;
	}
}
function vr(e, t) {
	switch (e) {
		case "INT8": return Math.max(t / 127, -1);
		case "INT16": return Math.max(t, 32767, -1);
		case "INT32": return Math.max(t / 2147483647, -1);
		case "INT64": return Math.max(Number(t) / 0x8000000000000000, -1);
		case "UINT8": return t / 255;
		case "UINT16": return t / 65535;
		case "UINT32": return t / 4294967295;
		case "UINT64": return Number(t) / 0x10000000000000000;
	}
}
function yr(e, t) {
	let { type: n, componentType: r, scale: i, offset: a, normalized: o } = e;
	if (Array.isArray(t)) for (let e = 0, n = t.length; e < n; e++) t[e] = s(t[e]);
	else t = s(t);
	return t;
	function s(e) {
		return e = ur(n) ? l(e) : lr(n) ? c(e) : u(e), e;
	}
	function c(e) {
		return e.x = u(e.x), e.y = u(e.y), "z" in e && (e.z = u(e.z)), "w" in e && (e.w = u(e.w)), e;
	}
	function l(e) {
		let t = e.elements;
		for (let e = 0, n = t.length; e < n; e++) t[e] = u(t[e]);
		return e;
	}
	function u(e) {
		return o && (e = vr(r, e)), (o || cr(r)) && (e = e * i + a), e;
	}
}
function br(e, t, n = null) {
	if (e.array) {
		Array.isArray(t) || (t = Array(e.count || 0)), t.length = n === null ? e.count : n;
		for (let n = 0, r = t.length; n < r; n++) pr(e.type, t[n]) || (t[n] = fr(e));
	} else pr(e.type, t) || (t = fr(e));
	return t;
}
function xr(e, t) {
	for (let n in t) n in e || delete t[n];
	for (let n in e) {
		let r = e[n];
		t[n] = br(r, t[n]);
	}
}
function Sr(e) {
	switch (e) {
		case "ENUM": return 1;
		case "SCALAR": return 1;
		case "VEC2": return 2;
		case "VEC3": return 3;
		case "VEC4": return 4;
		case "MAT2": return 4;
		case "MAT3": return 9;
		case "MAT4": return 16;
		case "BOOLEAN": return -1;
		case "STRING": return -1;
		default: return -1;
	}
}
// src/three/plugins/gltf/metadata/classes/ClassProperty.js
var Cr = class {
	constructor(e, t, n = null) {
		this.name = t.name || null, this.description = t.description || null, this.type = t.type, this.componentType = t.componentType || null, this.enumType = t.enumType || null, this.array = t.array || !1, this.count = t.count || 0, this.normalized = t.normalized || !1, this.offset = t.offset || 0, this.scale = K(t, "scale", 1), this.max = K(t, "max", Infinity), this.min = K(t, "min", -Infinity), this.required = t.required || !1, this.noData = K(t, "noData", null), this.default = K(t, "default", null), this.semantic = K(t, "semantic", null), this.enumSet = null, this.accessorProperty = n, n && (this.offset = K(n, "offset", this.offset), this.scale = K(n, "scale", this.scale), this.max = K(n, "max", this.max), this.min = K(n, "min", this.min)), t.type === "ENUM" && (this.enumSet = e[this.enumType], this.componentType === null && (this.componentType = K(this.enumSet, "valueType", "UINT16")));
	}
	shapeToProperty(e, t = null) {
		return br(this, e, t);
	}
	resolveDefaultElement(e) {
		return gr(this, e);
	}
	resolveDefault(e) {
		return hr(this, e);
	}
	resolveNoData(e) {
		return _r(this, e);
	}
	resolveEnumsToStrings(e) {
		let t = this.enumSet;
		if (this.type === "ENUM") {
			if (Array.isArray(e)) for (let t = 0, r = e.length; t < r; t++) e[t] = n(e[t]);
			else e = n(e);
		}
		return e;
		function n(e) {
			let n = t.values.find((t) => t.value === e);
			return n === null ? "" : n.name;
		}
	}
	adjustValueScaleOffset(e) {
		return sr(this.type) ? yr(this, e) : e;
	}
}, wr = class {
	constructor(e, t = {}, n = {}, r = null) {
		this.definition = e, this.class = t[e.class], this.className = e.class, this.enums = n, this.data = r, this.name = "name" in e ? e.name : null, this.properties = null;
	}
	getPropertyNames() {
		return Object.keys(this.class.properties);
	}
	includesData(e) {
		return !!this.definition.properties[e];
	}
	dispose() {}
	_initProperties(e = Cr) {
		let t = {};
		for (let n in this.class.properties) t[n] = new e(this.enums, this.class.properties[n], this.definition.properties[n]);
		this.properties = t;
	}
}, Tr = class extends Cr {
	constructor(e, t, n = null) {
		super(e, t, n), this.attribute = n?.attribute ?? null;
	}
}, Er = class extends wr {
	constructor(...e) {
		super(...e), this.isPropertyAttributeAccessor = !0, this._initProperties(Tr);
	}
	getData(e, t, n = {}) {
		let r = this.properties;
		xr(r, n);
		for (let i in r) n[i] = this.getPropertyValue(i, e, t, n[i]);
		return n;
	}
	getPropertyValue(e, t, n, r = null) {
		if (t >= this.count) throw Error("PropertyAttributeAccessor: Requested index is outside the range of the buffer.");
		let i = this.properties[e], a = i.type;
		if (!i) throw Error("PropertyAttributeAccessor: Requested class property does not exist.");
		if (!this.definition.properties[e]) return i.resolveDefault(r);
		r = i.shapeToProperty(r);
		let o = n.getAttribute(i.attribute.toLowerCase());
		if (ur(a)) {
			let e = r.elements;
			for (let n = e.length; 0 < n;) e[0] = o.getComponent(t, 0);
		} else if (lr(a)) r.fromBufferAttribute(o, t);
		else if (a === "SCALAR" || a === "ENUM") r = o.getX(t);
		else throw Error("StructuredMetadata.PropertyAttributeAccessor: BOOLEAN and STRING types are not supported by property attributes.");
		return r = i.adjustValueScaleOffset(r), r = i.resolveEnumsToStrings(r), r = i.resolveNoData(r), r;
	}
}, Dr = class extends Cr {
	constructor(e, t, n = null) {
		super(e, t, n), this.values = n?.values ?? null, this.valueLength = Sr(this.type), this.arrayOffsets = K(n, "arrayOffsets", null), this.stringOffsets = K(n, "stringOffsets", null), this.arrayOffsetType = K(n, "arrayOffsetType", "UINT32"), this.stringOffsetType = K(n, "stringOffsetType", "UINT32");
	}
	getArrayLengthFromId(e, t) {
		let n = this.count;
		if (this.arrayOffsets !== null) {
			let { arrayOffsets: r, arrayOffsetType: i } = this, a = new (mr(i))(e[r]);
			n = a[t + 1] - a[t];
		}
		return n;
	}
	getIndexOffsetFromId(e, t) {
		let n = t;
		if (this.arrayOffsets) {
			let { arrayOffsets: t, arrayOffsetType: r } = this;
			n = new (mr(r))(e[t])[n];
		} else this.array && (n *= this.count);
		return n;
	}
}, Or = class extends wr {
	constructor(...e) {
		super(...e), this.isPropertyTableAccessor = !0, this.count = this.definition.count, this._initProperties(Dr);
	}
	getData(e, t = {}) {
		let n = this.properties;
		xr(n, t);
		for (let r in n) t[r] = this.getPropertyValue(r, e, t[r]);
		return t;
	}
	_readValueAtIndex(e, t, n, r = null) {
		let i = this.properties[e], { componentType: a, type: o } = i, s = this.data, c = s[i.values], l = new (mr(a, o))(c), u = i.getIndexOffsetFromId(s, t);
		if (sr(o) || o === "ENUM") return dr(l, (u + n) * i.valueLength, o, r);
		if (o === "STRING") {
			let e = u + n, t = 0;
			if (i.stringOffsets !== null) {
				let { stringOffsets: n, stringOffsetType: r } = i, a = new (mr(r))(s[n]);
				t = a[e + 1] - a[e], e = a[e];
			}
			let a = new Uint8Array(l.buffer, e, t);
			r = new TextDecoder().decode(a);
		} else if (o === "BOOLEAN") {
			let e = u + n, t = Math.floor(e / 8), i = e % 8;
			r = (l[t] >> i & 1) == 1;
		}
		return r;
	}
	getPropertyValue(e, t, n = null) {
		if (t >= this.count) throw Error("PropertyTableAccessor: Requested index is outside the range of the table.");
		let r = this.properties[e];
		if (!r) throw Error("PropertyTableAccessor: Requested property does not exist.");
		if (!this.definition.properties[e]) return r.resolveDefault(n);
		let i = r.array, a = this.data, o = r.getArrayLengthFromId(a, t);
		if (n = r.shapeToProperty(n, o), i) for (let r = 0, i = n.length; r < i; r++) n[r] = this._readValueAtIndex(e, t, r, n[r]);
		else n = this._readValueAtIndex(e, t, 0, n);
		return n = r.adjustValueScaleOffset(n), n = r.resolveEnumsToStrings(n), n = r.resolveNoData(n), n;
	}
}, kr = /* @__PURE__ */ new v(), Ar = class {
	constructor() {
		this._renderer = new Ie(), this._target = new Fe(1, 1), this._texTarget = new Fe(), this._quad = new ze(new Te({
			blending: E,
			blendDst: Le,
			blendSrc: pe,
			uniforms: {
				map: { value: null },
				pixel: { value: new I() }
			},
			vertexShader: "\n				void main() {\n\n					gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );\n\n				}\n			",
			fragmentShader: "\n				uniform sampler2D map;\n				uniform ivec2 pixel;\n\n				void main() {\n\n					gl_FragColor = texelFetch( map, pixel, 0 );\n\n				}\n			"
		}));
	}
	increaseSizeTo(e) {
		this._target.setSize(Math.max(this._target.width, e), 1);
	}
	readDataAsync(e) {
		let { _renderer: t, _target: n } = this;
		return t.readRenderTargetPixelsAsync(n, 0, 0, e.length / 4, 1, e);
	}
	readData(e) {
		let { _renderer: t, _target: n } = this;
		t.readRenderTargetPixels(n, 0, 0, e.length / 4, 1, e);
	}
	renderPixelToTarget(e, t, n) {
		let { _renderer: r, _target: i } = this;
		kr.min.copy(t), kr.max.copy(t), kr.max.x += 1, kr.max.y += 1, r.initRenderTarget(i), r.copyTextureToTexture(e, i.texture, kr, n, 0);
	}
}, jr = /* @__PURE__ */ new class {
	constructor() {
		let e = null;
		Object.getOwnPropertyNames(Ar.prototype).forEach((t) => {
			t !== "constructor" && (this[t] = (...n) => (e ||= new Ar(), e[t](...n)));
		});
	}
}(), Mr = /* @__PURE__ */ new I(), Nr = /* @__PURE__ */ new I(), Pr = /* @__PURE__ */ new I();
function Fr(e, t) {
	return t === 0 ? e.getAttribute("uv") : e.getAttribute(`uv${t}`);
}
function Ir(e, t, n = [
	,
	,
	,
]) {
	let r = 3 * t, i = 3 * t + 1, a = 3 * t + 2;
	return e.index && (r = e.index.getX(r), i = e.index.getX(i), a = e.index.getX(a)), n[0] = r, n[1] = i, n[2] = a, n;
}
function Lr(e, t, n, r, i) {
	let [a, o, s] = r, c = Fr(e, t);
	Mr.fromBufferAttribute(c, a), Nr.fromBufferAttribute(c, o), Pr.fromBufferAttribute(c, s), i.set(0, 0, 0).addScaledVector(Mr, n.x).addScaledVector(Nr, n.y).addScaledVector(Pr, n.z);
}
function Rr(e, t, n, r) {
	let i = e.x - Math.floor(e.x), a = e.y - Math.floor(e.y), o = Math.floor(i * t % t), s = Math.floor(a * n % n);
	return r.set(o, s), r;
}
// src/three/plugins/gltf/metadata/classes/PropertyTextureAccessor.js
var zr = /* @__PURE__ */ new I(), Br = /* @__PURE__ */ new I(), Vr = /* @__PURE__ */ new I(), Hr = class extends Cr {
	constructor(e, t, n = null) {
		super(e, t, n), this.channels = K(n, "channels", [0]), this.index = K(n, "index", null), this.texCoord = K(n, "texCoord", null), this.valueLength = parseInt(this.type.replace(/[^0-9]/g, "")) || 1;
	}
	readDataFromBuffer(e, t, n = null) {
		let r = this.type;
		if (r === "BOOLEAN" || r === "STRING") throw Error("PropertyTextureAccessor: BOOLEAN and STRING types not supported.");
		return dr(e, t * this.valueLength, r, n);
	}
}, Ur = class extends wr {
	constructor(...e) {
		super(...e), this.isPropertyTextureAccessor = !0, this._asyncRead = !1, this._initProperties(Hr);
	}
	getData(e, t, n, r = {}) {
		let i = this.properties;
		xr(i, r);
		let a = Object.keys(i), o = a.map((e) => r[e]);
		return this.getPropertyValuesAtTexel(a, e, t, n, o), a.forEach((e, t) => r[e] = o[t]), r;
	}
	async getDataAsync(e, t, n, r = {}) {
		let i = this.properties;
		xr(i, r);
		let a = Object.keys(i), o = a.map((e) => r[e]);
		return await this.getPropertyValuesAtTexelAsync(a, e, t, n, o), a.forEach((e, t) => r[e] = o[t]), r;
	}
	getPropertyValuesAtTexelAsync(...e) {
		this._asyncRead = !0;
		let t = this.getPropertyValuesAtTexel(...e);
		return this._asyncRead = !1, t;
	}
	getPropertyValuesAtTexel(e, t, n, r, i = []) {
		for (; i.length < e.length;) i.push(null);
		i.length = e.length, jr.increaseSizeTo(i.length);
		let a = this.data, o = this.definition.properties, s = this.properties, c = Ir(r, t);
		for (let t = 0, i = e.length; t < i; t++) {
			let i = e[t];
			if (!o[i]) continue;
			let l = s[i], u = a[l.index];
			Lr(r, l.texCoord, n, c, zr), Rr(zr, u.image.width, u.image.height, Br), Vr.set(t, 0), jr.renderPixelToTarget(u, Br, Vr);
		}
		let l = new Uint8Array(e.length * 4);
		return this._asyncRead ? jr.readDataAsync(l).then(() => (u.call(this), i)) : (jr.readData(l), u.call(this), i);
		function u() {
			for (let t = 0, n = e.length; t < n; t++) {
				let n = e[t], r = s[n], a = r.type;
				if (i[t] = br(r, i[t]), !r) throw Error("PropertyTextureAccessor: Requested property does not exist.");
				if (!o[n]) {
					i[t] = r.resolveDefault(i);
					continue;
				}
				let c = r.valueLength * (r.count || 1), u = r.channels.map((e) => l[4 * t + e]), d = r.componentType, f = new (mr(d, a))(c);
				if (new Uint8Array(f.buffer).set(u), r.array) {
					let e = i[t];
					for (let t = 0, n = e.length; t < n; t++) e[t] = r.readDataFromBuffer(f, t, e[t]);
				} else i[t] = r.readDataFromBuffer(f, 0, i[t]);
				i[t] = r.adjustValueScaleOffset(i[t]), i[t] = r.resolveEnumsToStrings(i[t]), i[t] = r.resolveNoData(i[t]);
			}
		}
	}
	dispose() {
		this.data.forEach((e) => {
			e && (e.dispose(), e.image instanceof ImageBitmap && e.image.close());
		});
	}
}, Wr = class {
	constructor(e, t, n, r = null, i = null) {
		let { schema: a, propertyTables: o = [], propertyTextures: s = [], propertyAttributes: c = [] } = e, { enums: l, classes: u } = a, d = o.map((e) => new Or(e, u, l, n)), f = [], p = [];
		r && (r.propertyTextures && (f = r.propertyTextures.map((e) => new Ur(s[e], u, l, t))), r.propertyAttributes && (p = r.propertyAttributes.map((e) => new Er(c[e], u, l)))), this.schema = a, this.tableAccessors = d, this.textureAccessors = f, this.attributeAccessors = p, this.object = i, this.textures = t, this.nodeMetadata = r;
	}
	getPropertyTableData(e, t, n = null) {
		if (!Array.isArray(e)) n ||= {}, n = this.tableAccessors[e].getData(t, n);
		else {
			n ||= [];
			let r = Math.min(e.length, t.length);
			n.length = r;
			for (let i = 0; i < r; i++) {
				let r = this.tableAccessors[e[i]];
				n[i] = r.getData(t[i], n[i]);
			}
		}
		if (Array.isArray(e) !== Array.isArray(n) || Array.isArray(e) !== Array.isArray(t)) throw Error("StructuralMetadata: Scalar and array inputs cannot be mixed.");
		return n;
	}
	getPropertyTableInfo(e = null) {
		if (e === null && (e = this.tableAccessors.map((e, t) => t)), Array.isArray(e)) return e.map((e) => {
			let t = this.tableAccessors[e];
			return {
				name: t.name,
				className: t.definition.class
			};
		});
		{
			let t = this.tableAccessors[e];
			return {
				name: t.name,
				className: t.definition.class
			};
		}
	}
	getPropertyTextureData(e, t, n = []) {
		let r = this.textureAccessors;
		n.length = r.length;
		for (let i = 0; i < r.length; i++) {
			let a = r[i];
			n[i] = a.getData(e, t, this.object.geometry, n[i]);
		}
		return n;
	}
	async getPropertyTextureDataAsync(e, t, n = []) {
		let r = this.textureAccessors;
		n.length = r.length;
		let i = [];
		for (let a = 0; a < r.length; a++) {
			let o = r[a].getDataAsync(e, t, this.object.geometry, n[a]).then((e) => {
				n[a] = e;
			});
			i.push(o);
		}
		return await Promise.all(i), n;
	}
	getPropertyTextureInfo() {
		return this.textureAccessors;
	}
	getPropertyAttributeData(e, t = []) {
		let n = this.attributeAccessors;
		t.length = n.length;
		for (let r = 0; r < n.length; r++) {
			let i = n[r];
			t[r] = i.getData(e, this.object.geometry, t[r]);
		}
		return t;
	}
	getPropertyAttributeInfo() {
		return this.attributeAccessors.map((e) => ({
			name: e.name,
			className: e.definition.class
		}));
	}
	dispose() {
		this.textureAccessors.forEach((e) => e.dispose()), this.tableAccessors.forEach((e) => e.dispose()), this.attributeAccessors.forEach((e) => e.dispose());
	}
}, Gr = "EXT_structural_metadata";
function Kr(e, t = []) {
	let n = e.json.textures?.length || 0, r = Array(n).fill(null);
	return t.forEach(({ properties: t }) => {
		for (let n in t) {
			let { index: i } = t[n];
			r[i] === null && (r[i] = e.loadTexture(i));
		}
	}), Promise.all(r);
}
function qr(e, t = []) {
	let n = e.json.bufferViews?.length || 0, r = Array(n).fill(null);
	return t.forEach(({ properties: t }) => {
		for (let n in t) {
			let { values: i, arrayOffsets: a, stringOffsets: o } = t[n];
			r[i] === null && (r[i] = e.getDependency("bufferView", i)), r[a] === null && (r[a] = e.getDependency("bufferView", a)), r[o] === null && (r[o] = e.getDependency("bufferView", o));
		}
	}), Promise.all(r);
}
var Jr = class {
	constructor(e) {
		this.parser = e, this.name = Gr;
	}
	async afterRoot({ scene: e, parser: t }) {
		let n = t.json.extensionsUsed;
		if (!n || !n.includes(Gr)) return;
		let r = null, i = t.json.extensions[Gr];
		if (i.schemaUri) {
			let { manager: e, path: n, requestHeader: a, crossOrigin: o } = t.options, s = new URL(i.schemaUri, n).toString(), c = new ee(e);
			c.setCrossOrigin(o), c.setResponseType("json"), c.setRequestHeader(a), r = c.loadAsync(s).then((e) => {
				i = {
					...i,
					schema: e
				};
			});
		}
		let [a, o] = await Promise.all([
			Kr(t, i.propertyTextures),
			qr(t, i.propertyTables),
			r
		]), s = new Wr(i, a, o);
		e.userData.structuralMetadata = s, e.traverse((e) => {
			if (t.associations.has(e)) {
				let { meshes: n, primitives: r } = t.associations.get(e), c = t.json.meshes[n]?.primitives[r];
				if (c && c.extensions && c.extensions[Gr]) {
					let t = c.extensions[Gr];
					e.userData.structuralMetadata = new Wr(i, a, o, t, e);
				} else e.userData.structuralMetadata = s;
			}
		});
	}
}, Yr = /* @__PURE__ */ new I(), Xr = /* @__PURE__ */ new I(), Zr = /* @__PURE__ */ new I();
function Qr(e) {
	return e.x > e.y && e.x > e.z ? 0 : e.y > e.z ? 1 : 2;
}
var $r = class {
	constructor(e, t, n) {
		this.geometry = e, this.textures = t, this.data = n, this._asyncRead = !1, this.featureIds = n.featureIds.map((e) => {
			let { texture: t, ...n } = e, r = {
				label: null,
				propertyTable: null,
				nullFeatureId: null,
				...n
			};
			return t && (r.texture = {
				texCoord: 0,
				channels: [0],
				...t
			}), r;
		});
	}
	getTextures() {
		return this.textures;
	}
	getFeatureInfo() {
		return this.featureIds;
	}
	getFeaturesAsync(...e) {
		this._asyncRead = !0;
		let t = this.getFeatures(...e);
		return this._asyncRead = !1, t;
	}
	getFeatures(e, t) {
		let { geometry: n, textures: r, featureIds: i } = this, a = Array(i.length).fill(null), o = i.length;
		jr.increaseSizeTo(o);
		let s = Ir(n, e), c = s[Qr(t)];
		for (let e = 0, o = i.length; e < o; e++) {
			let o = i[e], l = "nullFeatureId" in o ? o.nullFeatureId : null;
			if ("texture" in o) {
				let i = r[o.texture.index];
				Lr(n, o.texture.texCoord, t, s, Yr), Rr(Yr, i.image.width, i.image.height, Xr), Zr.set(e, 0), jr.renderPixelToTarget(r[o.texture.index], Xr, Zr);
			} else if ("attribute" in o) {
				let t = n.getAttribute(`_feature_id_${o.attribute}`).getX(c);
				t !== l && (a[e] = t);
			} else {
				let t = c;
				t !== l && (a[e] = t);
			}
		}
		let l = new Uint8Array(o * 4);
		return this._asyncRead ? jr.readDataAsync(l).then(() => (u(), a)) : (jr.readData(l), u(), a);
		function u() {
			let e = /* @__PURE__ */ new Uint32Array(1);
			for (let t = 0, n = i.length; t < n; t++) {
				let n = i[t], r = "nullFeatureId" in n ? n.nullFeatureId : null;
				if ("texture" in n) {
					let { channels: i } = n.texture, o = i.map((e) => l[4 * t + e]);
					new Uint8Array(e.buffer).set(o);
					let s = e[0];
					s !== r && (a[t] = s);
				}
			}
		}
	}
	dispose() {
		this.textures.forEach((e) => {
			e && (e.dispose(), e.image instanceof ImageBitmap && e.image.close());
		});
	}
}, ei = "EXT_mesh_features";
function ti(e, t, n) {
	e.traverse((e) => {
		if (t.associations.has(e)) {
			let { meshes: r, primitives: i } = t.associations.get(e), a = t.json.meshes[r]?.primitives[i];
			a && a.extensions && a.extensions[ei] && n(e, a.extensions[ei]);
		}
	});
}
var ni = class {
	constructor(e) {
		this.parser = e, this.name = ei;
	}
	async afterRoot({ scene: e, parser: t }) {
		let n = t.json.extensionsUsed;
		if (!n || !n.includes(ei)) return;
		let r = t.json.textures?.length || 0, i = Array(r).fill(null);
		ti(e, t, (e, { featureIds: n }) => {
			n.forEach((e) => {
				if (e.texture && i[e.texture.index] === null) {
					let n = e.texture.index;
					i[n] = t.loadTexture(n);
				}
			});
		});
		let a = await Promise.all(i);
		ti(e, t, (e, t) => {
			e.userData.meshFeatures = new $r(e.geometry, a, t);
		});
	}
}, ri = class {
	constructor() {
		this.name = "CESIUM_RTC";
	}
	afterRoot(e) {
		if (e.parser.json.extensions && e.parser.json.extensions.CESIUM_RTC) {
			let { center: t } = e.parser.json.extensions.CESIUM_RTC;
			t && (e.scene.position.x += t[0], e.scene.position.y += t[1], e.scene.position.z += t[2]);
		}
	}
}, ii = class {
	constructor(e) {
		e = {
			metadata: !0,
			rtc: !0,
			plugins: [],
			dracoLoader: null,
			ktxLoader: null,
			meshoptDecoder: null,
			autoDispose: !0,
			...e
		}, this.tiles = null, this.metadata = e.metadata, this.rtc = e.rtc, this.plugins = e.plugins, this.dracoLoader = e.dracoLoader, this.ktxLoader = e.ktxLoader, this.meshoptDecoder = e.meshoptDecoder, this._gltfRegex = /\.(gltf|glb)$/g, this._dracoRegex = /\.drc$/g, this._loader = null;
	}
	init(e) {
		let t = new Re(e.manager);
		this.dracoLoader && (t.setDRACOLoader(this.dracoLoader), e.manager.addHandler(this._dracoRegex, this.dracoLoader)), this.ktxLoader && t.setKTX2Loader(this.ktxLoader), this.meshoptDecoder && t.setMeshoptDecoder(this.meshoptDecoder), this.rtc && t.register(() => new ri()), this.metadata && (t.register(() => new Jr()), t.register(() => new ni())), this.plugins.forEach((e) => t.register(e)), e.manager.addHandler(this._gltfRegex, t), this.tiles = e, this._loader = t;
	}
	dispose() {
		this.tiles.manager.removeHandler(this._gltfRegex), this.tiles.manager.removeHandler(this._dracoRegex), this.autoDispose && (this.ktxLoader.dispose(), this.dracoLoader.dispose());
	}
}, ai = /* @__PURE__ */ new De(), oi = class {
	constructor(e) {
		e = {
			up: "+z",
			recenter: !0,
			lat: null,
			lon: null,
			height: 0,
			azimuth: 0,
			elevation: 0,
			roll: 0,
			...e
		}, this.tiles = null, this.up = e.up.toLowerCase().replace(/\s+/, ""), this.lat = e.lat, this.lon = e.lon, this.height = e.height, this.azimuth = e.azimuth, this.elevation = e.elevation, this.roll = e.roll, this.recenter = e.recenter, this._callback = null;
	}
	init(e) {
		this.tiles = e, this._callback = () => {
			let { up: t, lat: n, lon: r, height: i, azimuth: a, elevation: o, roll: s, recenter: c } = this;
			if (n !== null && r !== null) this.transformLatLonHeightToOrigin(n, r, i, a, o, s);
			else {
				let { ellipsoid: n } = e, r = Math.min(...n.radius);
				if (e.getBoundingSphere(ai), ai.center.length() > r * .5) {
					let e = {};
					n.getPositionToCartographic(ai.center, e), this.transformLatLonHeightToOrigin(e.lat, e.lon, e.height);
				} else {
					let n = e.group;
					switch (n.rotation.set(0, 0, 0), t) {
						case "x":
						case "+x":
							n.rotation.z = Math.PI / 2;
							break;
						case "-x":
							n.rotation.z = -Math.PI / 2;
							break;
						case "y":
						case "+y": break;
						case "-y":
							n.rotation.z = Math.PI;
							break;
						case "z":
						case "+z":
							n.rotation.x = -Math.PI / 2;
							break;
						case "-z": n.rotation.x = Math.PI / 2;
					}
					e.group.position.copy(ai.center).applyEuler(n.rotation).multiplyScalar(-1);
				}
			}
			c || e.group.position.setScalar(0), e.removeEventListener("load-root-tileset", this._callback);
		}, e.addEventListener("load-root-tileset", this._callback), e.root && this._callback();
	}
	transformLatLonHeightToOrigin(e, t, n = 0, r = 0, i = 0, a = 0) {
		let { group: o, ellipsoid: s } = this.tiles;
		s.getObjectFrame(e, t, n, r, i, a, o.matrix, 2), o.matrix.invert().decompose(o.position, o.quaternion, o.scale), o.updateMatrixWorld();
	}
	dispose() {
		let { group: e } = this.tiles;
		e.position.setScalar(0), e.quaternion.identity(), e.scale.set(1, 1, 1), this.tiles.removeEventListener("load-root-tileset", this._callback);
	}
}, si = class {
	set delay(e) {
		this.deferCallbacks.delay = e;
	}
	get delay() {
		return this.deferCallbacks.delay;
	}
	set bytesTarget(e) {
		this.lruCache.minBytesSize = e;
	}
	get bytesTarget() {
		return this.lruCache.minBytesSize;
	}
	get estimatedGpuBytes() {
		return this.lruCache.cachedBytes;
	}
	constructor(e = {}) {
		let { delay: t = 0, bytesTarget: r = 0 } = e;
		this.name = "UNLOAD_TILES_PLUGIN", this.tiles = null, this.lruCache = new n(), this.deferCallbacks = new ci(), this.delay = t, this.bytesTarget = r;
	}
	init(e) {
		this.tiles = e;
		let { lruCache: t, deferCallbacks: n } = this, r = (t) => {
			let n = t.engineData.scene;
			e.visibleTiles.has(t) || e.invokeOnePlugin((e) => e.unloadTileFromGPU && e.unloadTileFromGPU(n, t));
		};
		this._onUpdateBefore = () => {
			t.unloadPriorityCallback = e.lruCache.unloadPriorityCallback, t.minSize = Infinity, t.maxSize = Infinity, t.maxBytesSize = Infinity, t.unloadPercent = 1, t.autoMarkUnused = !1;
		}, this._onVisibilityChangeCallback = ({ tile: i, scene: a, visible: o }) => {
			o ? (t.add(i, r), t.setMemoryUsage(i, e.calculateBytesUsed(i, a) || 1), t.markUsed(i), e.markTileUsed(i), n.cancel(i)) : n.run(i);
		}, this._onDisposeModel = ({ tile: e }) => {
			t.remove(e), n.cancel(e);
		}, n.callback = (e) => {
			t.markUnused(e), t.scheduleUnload();
		}, e.forEachLoadedModel((t, n) => {
			let r = e.visibleTiles.has(n);
			this._onVisibilityChangeCallback({
				tile: n,
				visible: r
			});
		}), e.addEventListener("tile-visibility-change", this._onVisibilityChangeCallback), e.addEventListener("update-before", this._onUpdateBefore), e.addEventListener("dispose-model", this._onDisposeModel);
	}
	unloadTileFromGPU(e, t) {
		e && e.traverse((e) => {
			if (e.material) {
				let t = e.material;
				t.dispose();
				for (let e in t) {
					let n = t[e];
					n && n.isTexture && n.dispose();
				}
			}
			e.geometry && e.geometry.dispose();
		});
	}
	dispose() {
		let { lruCache: e, tiles: t, deferCallbacks: n } = this;
		t.removeEventListener("tile-visibility-change", this._onVisibilityChangeCallback), t.removeEventListener("update-before", this._onUpdateBefore), t.removeEventListener("dispose-model", this._onDisposeModel), n.cancelAll(), e.minBytesSize = 0, e.minSize = 0, e.maxSize = 0, e.markAllUnused(), e.scheduleUnload();
	}
}, ci = class {
	constructor(e = () => {}) {
		this.map = /* @__PURE__ */ new Map(), this.callback = e, this.delay = 0;
	}
	run(e) {
		let { map: t, delay: n } = this;
		if (t.has(e)) throw Error("DeferCallbackManager: Callback already initialized.");
		n === 0 ? this.callback(e) : t.set(e, setTimeout(() => {
			this.callback(e), t.delete(e);
		}, n));
	}
	cancel(e) {
		let { map: t } = this;
		t.has(e) && (clearTimeout(t.get(e)), t.delete(e));
	}
	cancelAll() {
		this.map.forEach((e, t) => {
			this.cancel(t);
		});
	}
}, li = Symbol("FADE_PARAMS");
function ui(e, t) {
	if (e[li]) return e[li];
	let n = {
		fadeIn: { value: 0 },
		fadeOut: { value: 0 },
		fadeTexture: { value: null }
	};
	return e[li] = n, e.defines = {
		...e.defines || {},
		FEATURE_FADE: 0
	}, e.onBeforeCompile = (e) => {
		t && t(e), e.uniforms = {
			...e.uniforms,
			...n
		}, e.vertexShader = e.vertexShader.replace(/void\s+main\(\)\s+{/, (e) => `
					#ifdef USE_BATCHING_FRAG

					varying float vBatchId;

					#endif

					${e}

						#ifdef USE_BATCHING_FRAG

						// add 0.5 to the value to avoid floating error that may cause flickering
						vBatchId = getIndirectIndex( gl_DrawID ) + 0.5;

						#endif
				`), e.fragmentShader = e.fragmentShader.replace(/void main\(/, (e) => `
				#if FEATURE_FADE

				// adapted from https://www.shadertoy.com/view/Mlt3z8
				float bayerDither2x2( vec2 v ) {

					return mod( 3.0 * v.y + 2.0 * v.x, 4.0 );

				}

				float bayerDither4x4( vec2 v ) {

					vec2 P1 = mod( v, 2.0 );
					vec2 P2 = floor( 0.5 * mod( v, 4.0 ) );
					return 4.0 * bayerDither2x2( P1 ) + bayerDither2x2( P2 );

				}

				// the USE_BATCHING define is not available in fragment shaders
				#ifdef USE_BATCHING_FRAG

				// functions for reading the fade state of a given batch id
				uniform sampler2D fadeTexture;
				varying float vBatchId;
				vec2 getFadeValues( const in float i ) {

					int size = textureSize( fadeTexture, 0 ).x;
					int j = int( i );
					int x = j % size;
					int y = j / size;
					return texelFetch( fadeTexture, ivec2( x, y ), 0 ).rg;

				}

				#else

				uniform float fadeIn;
				uniform float fadeOut;

				#endif

				#endif

				${e}
			`).replace(/#include <dithering_fragment>/, (e) => `

				${e}

				#if FEATURE_FADE

				#ifdef USE_BATCHING_FRAG

				vec2 fadeValues = getFadeValues( vBatchId );
				float fadeIn = fadeValues.r;
				float fadeOut = fadeValues.g;

				#endif

				float bayerValue = bayerDither4x4( floor( mod( gl_FragCoord.xy, 4.0 ) ) );
				float bayerBins = 16.0;
				float dither = ( 0.5 + bayerValue ) / bayerBins;
				if ( dither >= fadeIn ) {

					discard;

				}

				if ( dither < fadeOut ) {

					discard;

				}

				#endif

			`);
	}, n;
}
// src/three/plugins/fade/FadeMaterialManager.js
var di = class {
	constructor() {
		this._fadeParams = /* @__PURE__ */ new WeakMap(), this.fading = 0;
	}
	setFade(e, t, n) {
		if (!e) return;
		let r = this._fadeParams;
		e.traverse((e) => {
			let i = e.material;
			if (i && r.has(i)) {
				let e = r.get(i);
				e.fadeIn.value = t, e.fadeOut.value = n;
				let a = Number(t !== 0 && t !== 1 || n !== 0 && n !== 1);
				i.defines.FEATURE_FADE !== a && (this.fading += a === 1 ? 1 : -1, i.defines.FEATURE_FADE = a, i.needsUpdate = !0);
			}
		});
	}
	prepareScene(e) {
		e.traverse((e) => {
			e.material && this.prepareMaterial(e.material);
		});
	}
	deleteScene(e) {
		if (!e) return;
		this.setFade(e, 1, 0);
		let t = this._fadeParams;
		e.traverse((e) => {
			let n = e.material;
			n && t.delete(n);
		});
	}
	prepareMaterial(e) {
		let t = this._fadeParams;
		t.has(e) || t.set(e, ui(e, e.onBeforeCompile));
	}
}, fi = class {
	constructor(e, t = new le()) {
		this.other = e, this.material = t, this.visible = !0, this.parent = null, this._instanceInfo = [], this._visibilityChanged = !0;
		let n = new Proxy(this, {
			get(t, r) {
				if (r in t) return t[r];
				{
					let i = e[r];
					return i instanceof Function ? (...e) => (t.syncInstances(), i.call(n, ...e)) : e[r];
				}
			},
			set(t, n, r) {
				return n in t ? t[n] = r : e[n] = r, !0;
			},
			deleteProperty(t, n) {
				return n in t ? delete t[n] : delete e[n];
			}
		});
		return n;
	}
	syncInstances() {
		let e = this._instanceInfo, t = this.other._instanceInfo;
		for (; t.length > e.length;) {
			let n = e.length;
			e.push(new Proxy({ visible: !1 }, {
				get(e, r) {
					return r in e ? e[r] : t[n][r];
				},
				set(e, r, i) {
					return r in e ? e[r] = i : t[n][r] = i, !0;
				}
			}));
		}
	}
}, pi = class extends fi {
	constructor(...e) {
		super(...e);
		let t = this.material, n = ui(t, t.onBeforeCompile);
		t.defines.FEATURE_FADE = 1, t.defines.USE_BATCHING_FRAG = 1, t.needsUpdate = !0, this.fadeTexture = null, this._fadeParams = n;
	}
	setFadeAt(e, t, n) {
		this._initFadeTexture(), this.fadeTexture.setValueAt(e, t * 255, n * 255);
	}
	_initFadeTexture() {
		let e = Math.sqrt(this._maxInstanceCount);
		e = Math.ceil(e);
		let t = e * e * 2, n = this.fadeTexture;
		if (!n || n.image.data.length !== t) {
			let r = new mi(new Uint8Array(t), e, e, be, Me);
			if (n) {
				n.dispose();
				let e = n.image.data, t = this.fadeTexture.image.data, r = Math.min(e.length, t.length);
				t.set(new e.constructor(e.buffer, 0, r));
			}
			this.fadeTexture = r, this._fadeParams.fadeTexture.value = r, r.needsUpdate = !0;
		}
	}
	dispose() {
		this.fadeTexture && this.fadeTexture.dispose();
	}
}, mi = class extends D {
	setValueAt(e, ...t) {
		let { data: n, width: r, height: i } = this.image, a = Math.floor(n.length / (r * i)), o = !1;
		for (let r = 0; r < a; r++) {
			let i = e * a + r, s = n[i], c = t[r] || 0;
			s !== c && (n[i] = c, o = !0);
		}
		o && (this.needsUpdate = !0);
	}
}, hi = /* @__PURE__ */ new L(), gi = /* @__PURE__ */ new L(), _i = /* @__PURE__ */ new _e(), vi = /* @__PURE__ */ new _e(), yi = /* @__PURE__ */ new L(), bi = class extends m {
	constructor(e) {
		super(e), this.batchedMesh = null, this._fadeMaterialManager = new di(), this._prevCameraTransforms = null;
	}
	init(e) {
		this._prevCameraTransforms = /* @__PURE__ */ new Map(), e.cameras.forEach((e) => {
			this._prevCameraTransforms.set(e, new P());
		}), super.init(e), this._onAddCamera = ({ camera: e }) => {
			this._prevCameraTransforms.set(e, new P());
		}, this._onDeleteCamera = ({ camera: e }) => {
			this._prevCameraTransforms.delete(e);
		}, this._onTileVisibilityChange = ({ tile: e }) => {
			this.forEachBatchIds(e, (e, t, n) => {
				t.setFadeAt(e, 0, 0), t.setVisibleAt(e, !1), n.batchedMesh.setVisibleAt(e, !1);
			});
		}, e.addEventListener("add-camera", this._onAddCamera), e.addEventListener("delete-camera", this._onDeleteCamera), e.addEventListener("tile-visibility-change", this._onTileVisibilityChange);
	}
	prepareTileScene(e) {
		this._fadeMaterialManager.prepareScene(e);
	}
	releaseTileScene(e) {
		this._fadeMaterialManager.deleteScene(e);
	}
	setFadeState(e, t, n) {
		let r = e.engineData?.scene;
		r && this._fadeMaterialManager.setFade(r, t, n), this.forEachBatchIds(e, (e, r, i) => {
			r.setFadeAt(e, t, n), r.setVisibleAt(e, !0), i.batchedMesh.setVisibleAt(e, !1);
		});
	}
	resetFadeState(e, t) {
		this._fadeMaterialManager.setFade(e.engineData?.scene, 0, 0), this.forEachBatchIds(e, (e, n, r) => {
			n.setFadeAt(e, 0, 0), n.setVisibleAt(e, !1), r.batchedMesh.setVisibleAt(e, t);
		});
	}
	updateCameraState(e) {
		let { cameras: t } = this.tiles, n = this._prevCameraTransforms, r = !0;
		return e && t.forEach((e) => {
			if (!n.has(e)) return;
			let t = e.matrixWorld, i = n.get(e);
			t.decompose(gi, vi, yi), i.decompose(hi, _i, yi), r &&= vi.angleTo(_i) > .25 || gi.distanceTo(hi) > .1;
		}), t.forEach((e) => {
			n.get(e).copy(e.matrixWorld);
		}), r;
	}
	_updateAfter() {
		if (super._updateAfter(), this.batchedMesh) {
			let e = this.tiles.getPluginByName("BATCHED_TILES_PLUGIN").batchedMesh.material;
			this.batchedMesh.material.map = e.map;
		}
	}
	initBatchedMesh() {
		let e = this.tiles.getPluginByName("BATCHED_TILES_PLUGIN")?.batchedMesh;
		if (e) {
			if (this.batchedMesh === null) {
				this._onBatchedMeshDispose = () => {
					this.batchedMesh.dispose(), this.batchedMesh.removeFromParent(), this.batchedMesh = null, e.removeEventListener("dispose", this._onBatchedMeshDispose);
				};
				let t = e.material.clone();
				t.onBeforeCompile = e.material.onBeforeCompile, this.batchedMesh = new pi(e, t), this.tiles.group.add(this.batchedMesh);
			}
		} else this.batchedMesh !== null && (this._onBatchedMeshDispose(), this._onBatchedMeshDispose = null);
	}
	dispose() {
		let e = this.tiles;
		super.dispose(), this.batchedMesh !== null && this._onBatchedMeshDispose(), e.removeEventListener("add-camera", this._onAddCamera), e.removeEventListener("delete-camera", this._onDeleteCamera), e.removeEventListener("tile-visibility-change", this._onTileVisibilityChange), this._prevCameraTransforms = null;
	}
	forEachBatchIds(e, t) {
		if (this.initBatchedMesh(), this.batchedMesh) {
			let n = this.tiles.getPluginByName("BATCHED_TILES_PLUGIN"), r = n.getTileBatchIds(e);
			r && r.forEach((e) => t(e, this.batchedMesh, n));
		}
	}
}, xi = /* @__PURE__ */ new P(), Si = /* @__PURE__ */ new L(), Ci = /* @__PURE__ */ new L(), wi = class extends _ {
	constructor(...e) {
		super(...e), this.resetDistance = 1e4, this._matricesTextureHandle = null, this._lastCameraPos = new P(), this._forceUpdate = !0, this._matrices = [];
	}
	setMatrixAt(e, t) {
		super.setMatrixAt(e, t), this._forceUpdate = !0;
		let n = this._matrices;
		for (; n.length <= e;) n.push(new P());
		n[e].copy(t);
	}
	setInstanceCount(...e) {
		super.setInstanceCount(...e);
		let t = this._matrices;
		for (; t.length > this.instanceCount;) t.pop();
	}
	onBeforeRender(e, t, n, r, i, a) {
		super.onBeforeRender(e, t, n, r, i, a), Si.setFromMatrixPosition(n.matrixWorld), Ci.setFromMatrixPosition(this._lastCameraPos);
		let o = this._matricesTexture, s = this._modelViewMatricesTexture;
		if (s && s.image.width === o.image.width && s.image.height === o.image.height || (s && s.dispose(), s = o.clone(), s.source = new Ee({
			...s.image,
			data: s.image.data.slice()
		}), this._modelViewMatricesTexture = s), this._forceUpdate || Si.distanceTo(Ci) > this.resetDistance) {
			let e = this._matrices, t = s.image.data;
			for (let r = 0; r < this.maxInstanceCount; r++) {
				let i = e[r];
				i ? xi.copy(i) : xi.identity(), xi.premultiply(this.matrixWorld).premultiply(n.matrixWorldInverse).toArray(t, r * 16);
			}
			s.needsUpdate = !0, this._lastCameraPos.copy(n.matrixWorld), this._forceUpdate = !1;
		}
		this._matricesTextureHandle = this._matricesTexture, this._matricesTexture = this._modelViewMatricesTexture, this.matrixWorld.copy(this._lastCameraPos);
	}
	onAfterRender() {
		this.updateMatrixWorld(), this._matricesTexture = this._matricesTextureHandle, this._matricesTextureHandle = null;
	}
	onAfterShadow(e, t, n, r, i, a) {
		this.onAfterRender(e, null, r, i, a);
	}
	dispose() {
		super.dispose(), this._modelViewMatricesTexture && this._modelViewMatricesTexture.dispose();
	}
}, q = /* @__PURE__ */ new F(), Ti = [], Ei = class extends wi {
	constructor(...e) {
		super(...e), this.expandPercent = .25, this.maxInstanceExpansionSize = Infinity, this._freeGeometryIds = [];
	}
	findFreeId(e, t, n) {
		let r = !!this.geometry.index, i = Math.max(r ? e.index.count : -1, n), a = Math.max(e.attributes.position.count, t), o = -1, s = Infinity, c = this._freeGeometryIds;
		if (c.forEach((e, t) => {
			let { reservedIndexCount: n, reservedVertexCount: r } = this.getGeometryRangeAt(e);
			if (n >= i && r >= a) {
				let e = i - n + (a - r);
				e < s && (o = t, s = e);
			}
		}), o !== -1) {
			let e = c[o];
			return c.splice(o, 1), e;
		}
		return -1;
	}
	addGeometry(e, t, n) {
		let r = !!this.geometry.index;
		n = Math.max(r ? e.index.count : -1, n), t = Math.max(e.attributes.position.count, t);
		let { expandPercent: i, _freeGeometryIds: a } = this, o = this.findFreeId(e, t, n);
		if (o !== -1) this.setGeometryAt(o, e);
		else {
			let r = () => {
				let e = this.unusedVertexCount < t, r = this.unusedIndexCount < n;
				return e || r;
			}, s = e.index, c = e.attributes.position;
			if (t = Math.max(t, c.count), n = Math.max(n, s ? s.count : 0), r() && (a.forEach((e) => this.deleteGeometry(e)), a.length = 0, this.optimize(), r())) {
				let e = this.geometry.index, r = this.geometry.attributes.position, a, o;
				if (e) {
					let t = Math.ceil(i * e.count);
					a = Math.max(t, n, s.count) + e.count;
				} else a = Math.max(this.unusedIndexCount, n);
				if (r) {
					let e = Math.ceil(i * r.count);
					o = Math.max(e, t, c.count) + r.count;
				} else o = Math.max(this.unusedVertexCount, t);
				this.setGeometrySize(o, a);
			}
			o = super.addGeometry(e, t, n);
		}
		return o;
	}
	addInstance(e) {
		if (this.maxInstanceCount === this.instanceCount) {
			let e = Math.ceil(this.maxInstanceCount * (1 + this.expandPercent));
			this.setInstanceCount(Math.min(e, this.maxInstanceExpansionSize));
		}
		return super.addInstance(e);
	}
	deleteInstance(e) {
		let t = this.getGeometryIdAt(e);
		return t !== -1 && this._freeGeometryIds.push(t), super.deleteInstance(e);
	}
	raycastInstance(e, t, n) {
		let r = this.geometry, i = this.getGeometryIdAt(e);
		q.material = this.material, q.geometry.index = r.index, q.geometry.attributes = r.attributes;
		let a = this.getGeometryRangeAt(i);
		q.geometry.setDrawRange(a.start, a.count), q.geometry.boundingBox === null && (q.geometry.boundingBox = new y()), q.geometry.boundingSphere === null && (q.geometry.boundingSphere = new De()), this.getMatrixAt(e, q.matrixWorld).premultiply(this.matrixWorld), this.getBoundingBoxAt(i, q.geometry.boundingBox), this.getBoundingSphereAt(i, q.geometry.boundingSphere), q.raycast(t, Ti);
		for (let t = 0, r = Ti.length; t < r; t++) {
			let r = Ti[t];
			r.object = this, r.batchId = e, n.push(r);
		}
		Ti.length = 0;
	}
};
// src/three/plugins/batched/utilities.js
function Di(e) {
	return e.r === 1 && e.g === 1 && e.b === 1;
}
function Oi(e) {
	e.needsUpdate = !0, e.onBeforeCompile = (e) => {
		e.vertexShader = e.vertexShader.replace("#include <common>", "\n				#include <common>\n				varying float texture_index;\n				").replace("#include <uv_vertex>", "\n				#include <uv_vertex>\n				texture_index = getIndirectIndex( gl_DrawID );\n				"), e.fragmentShader = e.fragmentShader.replace("#include <map_pars_fragment>", "\n				#ifdef USE_MAP\n				precision highp sampler2DArray;\n				uniform sampler2DArray map;\n				varying float texture_index;\n				#endif\n				").replace("#include <map_fragment>", "\n				#ifdef USE_MAP\n					diffuseColor *= texture( map, vec3( vMapUv, texture_index ) );\n				#endif\n				");
	};
}
// src/three/plugins/batched/BatchedTilesPlugin.js
var ki = new ze(new le()), Ai = new D(new Uint8Array([
	255,
	255,
	255,
	255
]), 1, 1);
Ai.needsUpdate = !0;
var ji = /* @__PURE__ */ new P(), Mi = class {
	constructor(e = {}) {
		if (parseInt(ve) < 170) throw Error("BatchedTilesPlugin: Three.js revision 170 or higher required.");
		e = {
			instanceCount: 500,
			vertexCount: 750,
			indexCount: 2e3,
			expandPercent: .25,
			maxInstanceCount: Infinity,
			discardOriginalContent: !0,
			textureSize: null,
			material: null,
			renderer: null,
			...e
		}, this.name = "BATCHED_TILES_PLUGIN", this.priority = -1;
		let t = e.renderer.getContext();
		this.instanceCount = e.instanceCount, this.vertexCount = e.vertexCount, this.indexCount = e.indexCount, this.material = e.material ? e.material.clone() : null, this.expandPercent = e.expandPercent, this.maxInstanceCount = Math.min(e.maxInstanceCount, t.getParameter(t.MAX_3D_TEXTURE_SIZE)), this.renderer = e.renderer, this.discardOriginalContent = e.discardOriginalContent, this.textureSize = e.textureSize, this.batchedMesh = null, this.arrayTarget = null, this.tiles = null, this._tileToInstanceId = /* @__PURE__ */ new Map();
	}
	init(e) {
		this.tiles = e;
	}
	initTextureArray(e) {
		if (this.arrayTarget !== null || e.material.map === null) return;
		let { instanceCount: t, renderer: n, textureSize: r, batchedMesh: i } = this, a = e.material.map, o = {
			colorSpace: a.colorSpace,
			wrapS: a.wrapS,
			wrapT: a.wrapT,
			wrapR: a.wrapS,
			magFilter: a.magFilter
		}, s = new Pe(r || a.image.width, r || a.image.height, t);
		Object.assign(s.texture, o), n.initRenderTarget(s), i.material.map = s.texture, this.arrayTarget = s, this._tileToInstanceId.forEach((e) => {
			e.forEach((e) => {
				this.assignTextureToLayer(Ai, e);
			});
		});
	}
	initBatchedMesh(e) {
		if (this.batchedMesh !== null) return;
		let { instanceCount: t, vertexCount: n, indexCount: r, tiles: i } = this, a = this.material ? this.material : new e.material.constructor(), o = new Ei(t, t * n, t * r, a);
		o.name = "BatchTilesPlugin", o.frustumCulled = !1, i.group.add(o), o.updateMatrixWorld(), Oi(o.material), this.batchedMesh = o;
	}
	setTileVisible(e, t) {
		let n = e.engineData.scene;
		if (t && this.addSceneToBatchedMesh(n, e), this._tileToInstanceId.has(e)) {
			this._tileToInstanceId.get(e).forEach((e) => {
				this.batchedMesh.setVisibleAt(e, t);
			});
			let r = this.tiles;
			return t ? r.visibleTiles.add(e) : r.visibleTiles.delete(e), r.dispatchEvent({
				type: "tile-visibility-change",
				scene: n,
				tile: e,
				visible: t
			}), !0;
		}
		return !1;
	}
	disposeTile(e) {
		this.removeSceneFromBatchedMesh(e);
	}
	unloadTileFromGPU(e, t) {
		return !this.discardOriginalContent && this._tileToInstanceId.has(t) ? (this.removeSceneFromBatchedMesh(t), !0) : !1;
	}
	assignTextureToLayer(e, t) {
		if (!this.arrayTarget) return;
		this.expandArrayTargetIfNeeded();
		let { renderer: n } = this, r = n.getRenderTarget();
		n.setRenderTarget(this.arrayTarget, t), ki.material.map = e, ki.render(n), n.setRenderTarget(r), ki.material.map = null, e.dispose();
	}
	expandArrayTargetIfNeeded() {
		let { batchedMesh: e, arrayTarget: t, renderer: n } = this, r = Math.min(e.maxInstanceCount, this.maxInstanceCount);
		if (r > t.depth) {
			let i = {
				colorSpace: t.texture.colorSpace,
				wrapS: t.texture.wrapS,
				wrapT: t.texture.wrapT,
				generateMipmaps: t.texture.generateMipmaps,
				minFilter: t.texture.minFilter,
				magFilter: t.texture.magFilter
			}, a = new Pe(t.width, t.height, r);
			Object.assign(a.texture, i), n.initRenderTarget(a), n.copyTextureToTexture(t.texture, a.texture), t.dispose(), e.material.map = a.texture, this.arrayTarget = a;
		}
	}
	removeSceneFromBatchedMesh(e) {
		if (this._tileToInstanceId.has(e)) {
			let t = this._tileToInstanceId.get(e);
			this._tileToInstanceId.delete(e), t.forEach((e) => {
				this.batchedMesh.deleteInstance(e);
			});
		}
	}
	addSceneToBatchedMesh(e, t) {
		if (this._tileToInstanceId.has(t)) return;
		let n = [];
		e.traverse((e) => {
			e.isMesh && n.push(e);
		});
		let r = !0;
		n.forEach((e) => {
			if (this.batchedMesh && r) {
				let t = e.geometry.attributes, n = this.batchedMesh.geometry.attributes;
				for (let e in n) if (!(e in t)) {
					r = !1;
					return;
				}
			}
		});
		let i = !this.batchedMesh || this.batchedMesh.instanceCount + n.length <= this.maxInstanceCount;
		if (r && i) {
			e.updateMatrixWorld();
			let r = [];
			this._tileToInstanceId.set(t, r), n.forEach((t) => {
				this.initBatchedMesh(t), this.initTextureArray(t);
				let { geometry: n, material: i } = t, { batchedMesh: a, expandPercent: o } = this;
				a.expandPercent = o;
				let s = a.addGeometry(n, this.vertexCount, this.indexCount), c = a.addInstance(s);
				r.push(c), ji.copy(t.matrixWorld), e.parent !== null && ji.premultiply(this.tiles.group.matrixWorldInverse), a.setMatrixAt(c, ji), a.setVisibleAt(c, !1), Di(i.color) || (i.color.setHSL(Math.random(), .5, .5), a.setColorAt(c, i.color));
				let l = i.map;
				l ? this.assignTextureToLayer(l, c) : this.assignTextureToLayer(Ai, c);
			}), this.discardOriginalContent && (t.engineData.textures.forEach((e) => {
				e.image instanceof ImageBitmap && e.image.close();
			}), t.engineData.scene = null, t.engineData.materials = [], t.engineData.geometries = [], t.engineData.textures = []);
		}
	}
	raycastTile(e, t, n, r) {
		return this._tileToInstanceId.has(e) ? (this._tileToInstanceId.get(e).forEach((e) => {
			this.batchedMesh.raycastInstance(e, n, r);
		}), !0) : !1;
	}
	dispose() {
		let { arrayTarget: e, batchedMesh: t } = this;
		e && e.dispose(), t && (t.material.dispose(), t.geometry.dispose(), t.dispose(), t.removeFromParent());
	}
	getTileBatchIds(e) {
		return this._tileToInstanceId.get(e);
	}
}, Ni = /* @__PURE__ */ new De(), Pi = /* @__PURE__ */ new L(), Fi = /* @__PURE__ */ new P(), Ii = /* @__PURE__ */ new P(), Li = /* @__PURE__ */ new Se(), Ri = /* @__PURE__ */ new le({ side: k }), zi = /* @__PURE__ */ new y(), Bi = 1e5;
function Vi(e, t) {
	return e.isBufferGeometry ? (e.boundingSphere === null && e.computeBoundingSphere(), t.copy(e.boundingSphere)) : (zi.setFromObject(e), zi.getBoundingSphere(t), t);
}
var Hi = class {
	constructor() {
		this.name = "TILE_FLATTENING_PLUGIN", this.priority = -100, this.tiles = null, this.shapes = /* @__PURE__ */ new Map(), this.positionsMap = /* @__PURE__ */ new Map(), this.positionsUpdated = /* @__PURE__ */ new Set(), this.needsUpdate = !1;
	}
	init(e) {
		this.tiles = e, this.needsUpdate = !0, this._updateBeforeCallback = () => {
			this.needsUpdate &&= (this._updateTiles(), !1);
		}, this._disposeModelCallback = ({ tile: e }) => {
			this.positionsMap.delete(e), this.positionsUpdated.delete(e);
		}, e.addEventListener("update-before", this._updateBeforeCallback), e.addEventListener("dispose-model", this._disposeModelCallback);
	}
	setTileActive(e, t) {
		t && !this.positionsUpdated.has(e) && this._updateTile(e);
	}
	_updateTile(e) {
		let { positionsUpdated: t, positionsMap: n, shapes: r, tiles: i } = this;
		t.add(e);
		let a = e.engineData.scene;
		if (n.has(e)) {
			let t = n.get(e);
			a.traverse((e) => {
				if (e.geometry) {
					let n = t.get(e.geometry);
					n && (e.geometry.attributes.position.array.set(n), e.geometry.attributes.position.needsUpdate = !0);
				}
			});
		} else {
			let t = /* @__PURE__ */ new Map();
			n.set(e, t), a.traverse((e) => {
				e.geometry && t.set(e.geometry, e.geometry.attributes.position.array.slice());
			});
		}
		a.updateMatrixWorld(!0), a.traverse((e) => {
			let { geometry: t } = e;
			t && (Fi.copy(e.matrixWorld), a.parent !== null && Fi.premultiply(i.group.matrixWorldInverse), Ii.copy(Fi).invert(), Vi(t, Ni).applyMatrix4(Fi), r.forEach(({ shape: e, direction: n, sphere: r, thresholdMode: i, threshold: a, flattenRange: o }) => {
				Pi.subVectors(Ni.center, r.center), Pi.addScaledVector(n, -n.dot(Pi));
				let s = (Ni.radius + r.radius) ** 2;
				if (Pi.lengthSq() > s) return;
				let { position: c } = t.attributes, { ray: l } = Li;
				l.direction.copy(n).multiplyScalar(-1);
				for (let t = 0, r = c.count; t < r; t++) {
					l.origin.fromBufferAttribute(c, t).applyMatrix4(Fi).addScaledVector(n, Bi), Li.far = Bi;
					let r = Li.intersectObject(e)[0];
					if (r) {
						let e = (Bi - r.distance) / a, n = e >= 1;
						(!n || n && i === "flatten") && (e = Math.min(e, 1), r.point.addScaledVector(l.direction, N.mapLinear(e, 0, 1, -o, 0)), r.point.applyMatrix4(Ii), c.setXYZ(t, ...r.point));
					}
				}
			}));
		}), this.tiles.dispatchEvent({ type: "needs-render" });
	}
	_updateTiles() {
		this.positionsUpdated.clear(), this.tiles.activeTiles.forEach((e) => this._updateTile(e));
	}
	hasShape(e) {
		return this.shapes.has(e);
	}
	addShape(e, t = new L(0, 0, -1), n = {}) {
		if (this.hasShape(e)) throw Error("TileFlatteningPlugin: Shape is already used.");
		typeof n == "number" && (console.warn("TileFlatteningPlugin: \"addShape\" function signature has changed. Please use an options object, instead."), n = { threshold: n }), this.needsUpdate = !0;
		let r = e.clone();
		r.updateMatrixWorld(!0), r.traverse((e) => {
			e.material &&= Ri;
		});
		let i = Vi(r, new De());
		this.shapes.set(e, {
			shape: r,
			direction: t.clone(),
			sphere: i,
			thresholdMode: "none",
			threshold: Infinity,
			flattenRange: 0,
			...n
		});
	}
	updateShape(e) {
		if (!this.hasShape(e)) throw Error("TileFlatteningPlugin: Shape is not present.");
		let { direction: t, threshold: n, thresholdMode: r, flattenRange: i } = this.shapes.get(e);
		this.deleteShape(e), this.addShape(e, t, {
			threshold: n,
			thresholdMode: r,
			flattenRange: i
		});
	}
	deleteShape(e) {
		return this.needsUpdate = !0, this.shapes.delete(e);
	}
	clearShapes() {
		this.shapes.size !== 0 && (this.needsUpdate = !0, this.shapes.clear());
	}
	dispose() {
		this.tiles.removeEventListener("before-update", this._updateBeforeCallback), this.tiles.removeEventListener("dispose-model", this._disposeModelCallback), this.positionsMap.forEach((e) => {
			e.forEach((e, t) => {
				let { position: n } = t.attributes;
				n.array.set(e), n.needsUpdate = !0;
			});
		});
	}
}, Ui = class {
	constructor(e = {}) {
		let { regions: t = [] } = e;
		this.name = "LOAD_REGION_PLUGIN", this.regions = [], this.tiles = null, t.forEach((e) => this.addRegion(e));
	}
	init(e) {
		this.tiles = e;
	}
	addRegion(e) {
		this.regions.indexOf(e) === -1 && this.regions.push(e);
	}
	removeRegion(e) {
		let t = this.regions.indexOf(e);
		t !== -1 && this.regions.splice(t, 1);
	}
	hasRegion(e) {
		return this.regions.indexOf(e) !== -1;
	}
	clearRegions() {
		this.regions = [];
	}
	calculateTileViewError(e, t) {
		let n = e.engineData.boundingVolume, { regions: r, tiles: i } = this, a = !1, o = null, s = 0, c = Infinity;
		for (let t of r) {
			let r = t.intersectsTile(n, e, i);
			a ||= r, r && (s = Math.max(t.calculateError(e, i), s), c = Math.min(t.calculateDistance(n, e, i), c)), t.mask && (o ||= r);
		}
		return t.inView = a && o !== !1, t.error = s, t.distance = c, t.inView || o !== null;
	}
	dispose() {
		this.regions = [];
	}
}, Wi = class {
	constructor(e = {}) {
		let { errorTarget: t = 10, mask: n = !1 } = e;
		this.errorTarget = t, this.mask = n;
	}
	intersectsTile(e, t, n) {
		return !1;
	}
	calculateDistance(e, t, n) {
		return Infinity;
	}
	calculateError(e, t) {
		return e.geometricError - this.errorTarget + t.errorTarget;
	}
}, Gi = class extends Wi {
	constructor(e = {}) {
		let { sphere: t = new De() } = e;
		super(e), this.sphere = t.clone();
	}
	intersectsTile(e) {
		return e.intersectsSphere(this.sphere);
	}
}, Ki = class extends Wi {
	constructor(e = {}) {
		let { ray: t = new xe() } = e;
		super(e), this.ray = t.clone();
	}
	intersectsTile(e) {
		return e.intersectsRay(this.ray);
	}
}, qi = class extends Wi {
	constructor(e = {}) {
		let { obb: t = new s() } = e;
		super(e), this.obb = t.clone(), this.obb.update();
	}
	intersectsTile(e) {
		return e.intersectsOBB(this.obb);
	}
}, J = /* @__PURE__ */ new L(), Ji = [
	"x",
	"y",
	"z"
], Yi = class extends ie {
	constructor(e, t = 16776960, n = 40) {
		let r = new C(), i = [];
		for (let e = 0; e < 3; e++) {
			let t = Ji[e], r = Ji[(e + 1) % 3];
			J.set(0, 0, 0);
			for (let e = 0; e < n; e++) {
				let a;
				a = 2 * Math.PI * e / (n - 1), J[t] = Math.sin(a), J[r] = Math.cos(a), i.push(J.x, J.y, J.z), a = 2 * Math.PI * (e + 1) / (n - 1), J[t] = Math.sin(a), J[r] = Math.cos(a), i.push(J.x, J.y, J.z);
			}
		}
		r.setAttribute("position", new S(new Float32Array(i), 3)), r.computeBoundingSphere(), super(r, new re({
			color: t,
			toneMapped: !1
		})), this.sphere = e, this.type = "SphereHelper";
	}
	updateMatrixWorld(e) {
		let t = this.sphere;
		this.position.copy(t.center), this.scale.setScalar(t.radius), super.updateMatrixWorld(e);
	}
}, Xi = /* @__PURE__ */ new L(), Zi = /* @__PURE__ */ new L(), Qi = /* @__PURE__ */ new L(), Y = /* @__PURE__ */ new L(), $i = /* @__PURE__ */ new L(), ea = /* @__PURE__ */ new L(0, 0, 1);
function ta(e) {
	e = e.toNonIndexed();
	let { groups: t } = e, { position: n, normal: r } = e.attributes, i = [], a = [];
	for (let e of t) {
		let { start: t, count: o } = e;
		for (let e = t, s = t + o; e < s; e++) Y.fromBufferAttribute(n, e), $i.fromBufferAttribute(r, e), a.push(...Y), i.push(...$i);
	}
	let o = new C();
	return o.setAttribute("position", new S(new Float32Array(a), 3)), o.setAttribute("normal", new S(new Float32Array(i), 3)), o;
}
function na(e, t = 32) {
	let { latStart: n = -Math.PI / 2, latEnd: r = Math.PI / 2, lonStart: i = 0, lonEnd: a = 2 * Math.PI, heightStart: o = 0, heightEnd: s = 0 } = e, c = new x(1, 1, 1, t, t), { normal: l, position: u } = c.attributes;
	for (let t = 0, c = u.count; t < c; t++) {
		Qi.fromBufferAttribute(u, t);
		let c = N.mapLinear(Qi.x, -.5, .5, n, r), d = N.mapLinear(Qi.y, -.5, .5, i, a), f = Qi.z < 0;
		Xi.fromBufferAttribute(l, t), e.getCartographicToPosition(c, d, f ? s : o, Qi), u.setXYZ(t, Qi.x, Qi.y, Qi.z), e.getCartographicToNormal(c, d, Zi), Xi.z === 0 ? (Y.crossVectors(ea, Zi), Y.lengthSq() < 1e-12 && Y.set(1, 0, 0), Y.normalize(), Xi.x === 0 ? Zi.copy(Y).multiplyScalar(Math.sign(Xi.y)) : Zi.crossVectors(Zi, Y).normalize().multiplyScalar(Math.sign(Xi.x))) : Zi.multiplyScalar(f ? 1 : -1), l.setXYZ(t, Zi.x, Zi.y, Zi.z);
	}
	return c;
}
function ra(e, t = 32) {
	let { latStart: n = -Math.PI / 2, latEnd: r = Math.PI / 2, lonStart: i = 0, lonEnd: a = 2 * Math.PI, heightStart: o = 0, heightEnd: s = 0 } = e, c = [], l = (n, r, i, a, o, s) => {
		for (let l = 0; l < t; l++) {
			let u = l / t, d = (l + 1) / t;
			e.getCartographicToPosition(N.lerp(n, a, u), N.lerp(r, o, u), N.lerp(i, s, u), Y), e.getCartographicToPosition(N.lerp(n, a, d), N.lerp(r, o, d), N.lerp(i, s, d), $i), c.push(Y.x, Y.y, Y.z, $i.x, $i.y, $i.z);
		}
	};
	for (let e of [o, s]) l(n, i, e, n, a, e), l(r, i, e, r, a, e), l(n, i, e, r, i, e), l(n, a, e, r, a, e);
	for (let e of [n, r]) for (let t of [i, a]) l(e, t, o, e, t, s);
	let u = new C();
	return u.setAttribute("position", new S(new Float32Array(c), 3)), u;
}
var ia = class extends ie {
	constructor(e = new d(), t = 16776960) {
		super(), this.ellipsoidRegion = e, this.material.color.set(t), this.update();
	}
	update() {
		this.geometry.dispose(), this.geometry = ra(this.ellipsoidRegion);
	}
	dispose() {
		this.geometry.dispose(), this.material.dispose();
	}
}, aa = class extends F {
	constructor(e = new d(), t = 16776960) {
		super(), this.ellipsoidRegion = e, this.material.color.set(t), this.update();
	}
	update() {
		this.geometry.dispose();
		let e = na(this.ellipsoidRegion), { lonStart: t, lonEnd: n } = this;
		n - t >= 2 * Math.PI ? (e.groups.splice(2, 2), this.geometry = ta(e)) : this.geometry = e;
	}
	dispose() {
		this.geometry.dispose(), this.material.dispose();
	}
}, oa = Symbol("ORIGINAL_MATERIAL"), sa = Symbol("HAS_RANDOM_COLOR"), ca = Symbol("HAS_RANDOM_NODE_COLOR"), la = Symbol("LOAD_TIME"), ua = Symbol("PARENT_BOUND_REF_COUNT"), da = /* @__PURE__ */ new De(), fa = () => {}, pa = {};
function ma(e) {
	if (!pa[e]) {
		let t = Math.random(), n = .5 + Math.random() * .5, r = .375 + Math.random() * .25;
		pa[e] = new T().setHSL(t, n, r);
	}
	return pa[e];
}
var ha = 0, ga = 1, _a = 2, va = 3, ya = 4, ba = 5, xa = 6, Sa = 7, Ca = 8, wa = 9, Ta = 10, Ea = 11, Da = Object.freeze({
	NONE: ha,
	SCREEN_ERROR: ga,
	GEOMETRIC_ERROR: _a,
	DISTANCE: va,
	DEPTH: ya,
	RELATIVE_DEPTH: ba,
	IS_LEAF: xa,
	RANDOM_COLOR: Sa,
	RANDOM_NODE_COLOR: Ca,
	CUSTOM_COLOR: wa,
	LOAD_ORDER: Ta,
	INDEXED_COLOR: Ea
}), Oa = class {
	static get ColorModes() {
		return Da;
	}
	get wireframe() {
		return this._wireframe;
	}
	set wireframe(e) {
		e !== this._wireframe && (this._wireframe = e, this.materialsNeedUpdate = !0);
	}
	get unlit() {
		return this._unlit;
	}
	set unlit(e) {
		e !== this._unlit && (this._unlit = e, this.materialsNeedUpdate = !0);
	}
	get colorMode() {
		return this._colorMode;
	}
	set colorMode(e) {
		e !== this._colorMode && (this._colorMode = e, this.materialsNeedUpdate = !0);
	}
	get boundsColorMode() {
		return this._boundsColorMode;
	}
	set boundsColorMode(e) {
		e !== this._boundsColorMode && (this._boundsColorMode = e, this.materialsNeedUpdate = !0);
	}
	get enabled() {
		return this._enabled;
	}
	set enabled(e) {
		e !== this._enabled && this.tiles !== null && (this._enabled = e, e ? this.init(this.tiles) : this.dispose());
	}
	get displayParentBounds() {
		return this._displayParentBounds;
	}
	set displayParentBounds(e) {
		this._displayParentBounds !== e && (this._displayParentBounds = e, e ? this.tiles.traverse((e) => {
			e.traversal && e.traversal.visible && this._onTileVisibilityChange(e, !0);
		}, null, !1) : this.tiles.traverse((e) => {
			e.traversal && (e[ua] = null, this._onTileVisibilityChange(e, e.traversal.visible));
		}, null, !1));
	}
	constructor(e) {
		e = {
			displayParentBounds: !1,
			displayBoxBounds: !1,
			displaySphereBounds: !1,
			displayRegionBounds: !1,
			colorMode: ha,
			boundsColorMode: ha,
			maxDebugDepth: -1,
			maxDebugDistance: -1,
			maxDebugError: -1,
			customColorCallback: null,
			unlit: !1,
			wireframe: !1,
			enabled: !0,
			...e
		}, this.name = "DEBUG_TILES_PLUGIN", this.tiles = null, this._colorMode = null, this._boundsColorMode = null, this._unlit = null, this._wireframe = null, this.materialsNeedUpdate = !1, this.extremeDebugDepth = -1, this.extremeDebugError = -1, this.boxGroup = null, this.sphereGroup = null, this.regionGroup = null, this._enabled = e.enabled, this._displayParentBounds = e.displayParentBounds, this.displayBoxBounds = e.displayBoxBounds, this.displaySphereBounds = e.displaySphereBounds, this.displayRegionBounds = e.displayRegionBounds, this.colorMode = e.colorMode, this.boundsColorMode = e.boundsColorMode, this.maxDebugDepth = e.maxDebugDepth, this.maxDebugDistance = e.maxDebugDistance, this.maxDebugError = e.maxDebugError, this.customColorCallback = e.customColorCallback, this.unlit = e.unlit, this.wireframe = e.wireframe, this.getDebugColor = (e, t) => {
			t.setRGB(e, e, e);
		};
	}
	init(e) {
		if (this.tiles = e, !this.enabled) return;
		let t = e.group;
		this.boxGroup = new ne(), this.boxGroup.name = "DebugTilesRenderer.boxGroup", t.add(this.boxGroup), this.boxGroup.updateMatrixWorld(), this.sphereGroup = new ne(), this.sphereGroup.name = "DebugTilesRenderer.sphereGroup", t.add(this.sphereGroup), this.sphereGroup.updateMatrixWorld(), this.regionGroup = new ne(), this.regionGroup.name = "DebugTilesRenderer.regionGroup", t.add(this.regionGroup), this.regionGroup.updateMatrixWorld(), this._onLoadTilesetCB = () => {
			this._initExtremes();
		}, this._onLoadModelCB = ({ scene: e, tile: t }) => {
			this._onLoadModel(e, t);
		}, this._onDisposeModelCB = ({ tile: e }) => {
			this._onDisposeModel(e);
		}, this._onUpdateAfterCB = () => {
			this.update();
		}, this._onTileVisibilityChangeCB = ({ scene: e, tile: t, visible: n }) => {
			this._onTileVisibilityChange(t, n);
		}, e.addEventListener("load-tileset", this._onLoadTilesetCB), e.addEventListener("load-model", this._onLoadModelCB), e.addEventListener("dispose-model", this._onDisposeModelCB), e.addEventListener("update-after", this._onUpdateAfterCB), e.addEventListener("tile-visibility-change", this._onTileVisibilityChangeCB), this._initExtremes(), e.traverse((e) => {
			e.engineData.scene && this._onLoadModel(e.engineData.scene, e);
		}), e.visibleTiles.forEach((e) => {
			this._onTileVisibilityChange(e, !0);
		});
	}
	getTileFromObject3D(e) {
		let t = null;
		return this.tiles.activeTiles.forEach((n) => {
			if (t) return;
			let r = n.engineData.scene;
			r && r.traverse((r) => {
				r === e && (t = n);
			});
		}), t;
	}
	setEmptyTileVisible(e, t) {
		this._onTileVisibilityChange(e, t);
	}
	_initExtremes() {
		if (!(this.tiles && this.tiles.root)) return;
		let e = -1, t = -1;
		this.tiles.traverse(null, (n, r, i) => {
			e = Math.max(e, i), t = Math.max(t, n.geometricError);
		}, !1), this.extremeDebugDepth = e, this.extremeDebugError = t;
	}
	update() {
		let { tiles: e, colorMode: t, boundsColorMode: n } = this;
		if (!e.root) return;
		this.materialsNeedUpdate &&= (e.forEachLoadedModel((e) => {
			this._updateMaterial(e);
		}), !1), this.boxGroup.visible = this.displayBoxBounds, this.sphereGroup.visible = this.displaySphereBounds, this.regionGroup.visible = this.displayRegionBounds;
		let r = -1;
		r = this.maxDebugDepth === -1 ? this.extremeDebugDepth : this.maxDebugDepth;
		let i = -1;
		i = this.maxDebugError === -1 ? this.extremeDebugError : this.maxDebugError;
		let a = -1;
		this.maxDebugDistance === -1 ? (e.getBoundingSphere(da), a = da.radius) : a = this.maxDebugDistance;
		let { errorTarget: o, visibleTiles: s } = e, c;
		(t === Ta || n === Ta) && (c = Array.from(s).sort((e, t) => e[la] - t[la]));
		let l = (e, t, n, s, l, u) => {
			switch (e !== Sa && delete n.material[sa], e !== Ca && delete n.material[ca], e) {
				case ya: {
					let e = t.internal.depth / r;
					this.getDebugColor(e, n.material.color);
					break;
				}
				case ba: {
					let e = t.internal.depthFromRenderedParent / r;
					this.getDebugColor(e, n.material.color);
					break;
				}
				case ga: {
					let e = t.traversal.error / o;
					e > 1 ? n.material.color.setRGB(1, 0, 0) : this.getDebugColor(e, n.material.color);
					break;
				}
				case _a: {
					let e = Math.min(t.geometricError / i, 1);
					this.getDebugColor(e, n.material.color);
					break;
				}
				case va: {
					let e = Math.min(t.traversal.distanceFromCamera / a, 1);
					this.getDebugColor(e, n.material.color);
					break;
				}
				case xa:
					!t.children || t.children.length === 0 ? this.getDebugColor(1, n.material.color) : this.getDebugColor(0, n.material.color);
					break;
				case Ca:
					n.material[ca] || (n.material.color.setHSL(s, l, u), n.material[ca] = !0);
					break;
				case Sa:
					n.material[sa] || (n.material.color.setHSL(s, l, u), n.material[sa] = !0);
					break;
				case wa:
					this.customColorCallback ? this.customColorCallback(t, n) : console.warn("DebugTilesRenderer: customColorCallback not defined");
					break;
				case Ta: {
					let e = c.indexOf(t);
					this.getDebugColor(e / (c.length - 1), n.material.color);
					break;
				}
				case Ea: n.material.color.copy(ma(t.internal.depth)), delete n.material[sa], delete n.material[ca];
			}
		};
		s.forEach((e) => {
			let n = e.engineData.scene, r, i, a;
			t === Sa && (r = Math.random(), i = .5 + Math.random() * .5, a = .375 + Math.random() * .25), n.traverse((n) => {
				t === Ca && (r = Math.random(), i = .5 + Math.random() * .5, a = .375 + Math.random() * .25), n.material && l(t, e, n, r, i, a);
			});
		});
		let u = n === ha ? Ea : n, d = [
			this.boxGroup,
			this.sphereGroup,
			this.regionGroup
		];
		for (let e of d) for (let t of e.children) {
			let e = t.userData.tile, n, r, i;
			u === Sa && (n = Math.random(), r = .5 + Math.random() * .5, i = .375 + Math.random() * .25), t.traverse((t) => {
				u === Ca && (n = Math.random(), r = .5 + Math.random() * .5, i = .375 + Math.random() * .25), t.material && l(u, e, t, n, r, i);
			});
		}
	}
	_onTileVisibilityChange(e, t) {
		this.displayParentBounds ? r(e, (n) => {
			n[ua] ?? (n[ua] = 0), t ? n[ua]++ : n[ua] > 0 && n[ua]--;
			let r = n === e && t || this.displayParentBounds && n[ua] > 0;
			this._updateBoundHelper(n, r);
		}) : this._updateBoundHelper(e, t);
	}
	_createBoundHelper(e) {
		let t = this.tiles, n = e.engineData, { sphere: r, obb: i, region: a } = n.boundingVolume;
		if (i) {
			let r = new ne();
			r.name = "DebugTilesRenderer.boxHelperGroup", r.matrix.copy(i.transform), r.matrixAutoUpdate = !1, r.userData.tile = e, n.boxHelperGroup = r;
			let a = new b(i.box, ma(e.internal.depth));
			a.raycast = fa, r.add(a);
			let o = new F(new x(), new le({
				color: ma(e.internal.depth),
				transparent: !0,
				depthWrite: !1,
				opacity: .05,
				side: k
			}));
			i.box.getSize(o.scale), o.raycast = fa, r.add(o), t.visibleTiles.has(e) && this.displayBoxBounds && (this.boxGroup.add(r), r.updateMatrixWorld(!0));
		}
		if (r) {
			let i = new Yi(r, ma(e.internal.depth));
			i.raycast = fa, i.userData.tile = e;
			let a = new F(new Oe(1), new le({
				color: ma(e.internal.depth),
				transparent: !0,
				depthWrite: !1,
				opacity: .05,
				side: k
			}));
			a.raycast = fa, i.add(a), n.sphereHelper = i, t.visibleTiles.has(e) && this.displaySphereBounds && (this.sphereGroup.add(i), i.updateMatrixWorld(!0));
		}
		if (a) {
			let r = new ia(a, ma(e.internal.depth));
			r.raycast = fa, r.userData.tile = e;
			let i = new aa(a, ma(e.internal.depth));
			i.material.transparent = !0, i.material.depthWrite = !1, i.material.opacity = .05, i.material.side = k, i.raycast = fa, r.add(i);
			let o = new De();
			a.getBoundingSphere(o), r.position.copy(o.center), o.center.multiplyScalar(-1), r.geometry.translate(...o.center), i.geometry.translate(...o.center), n.regionHelper = r, t.visibleTiles.has(e) && this.displayRegionBounds && (this.regionGroup.add(r), r.updateMatrixWorld(!0));
		}
	}
	_updateHelperMaterials(e, t) {
		t.traverse((t) => {
			let { material: n } = t;
			if (!n) return;
			n.opacity = e.traversal.visible || !this.displayParentBounds ? t.isMesh ? .05 : 1 : t.isMesh ? .01 : .2;
			let r = n.transparent;
			n.transparent = n.opacity < 1, n.transparent !== r && (n.needsUpdate = !0);
		});
	}
	_updateBoundHelper(e, t) {
		let n = e.engineData;
		if (!n) return;
		let r = this.sphereGroup, i = this.boxGroup, a = this.regionGroup;
		t && n.boxHelperGroup == null && n.sphereHelper == null && n.regionHelper == null && this._createBoundHelper(e);
		let o = n.boxHelperGroup, s = n.sphereHelper, c = n.regionHelper;
		t ? (o && (i.add(o), o.updateMatrixWorld(!0), this._updateHelperMaterials(e, o)), s && (r.add(s), s.updateMatrixWorld(!0), this._updateHelperMaterials(e, s)), c && (a.add(c), c.updateMatrixWorld(!0), this._updateHelperMaterials(e, c))) : (o && i.remove(o), s && r.remove(s), c && a.remove(c));
	}
	_updateMaterial(e) {
		let { colorMode: t, unlit: n, wireframe: r } = this;
		e.traverse((e) => {
			if (!e.material) return;
			let i = e.material, a = e[oa];
			if (i !== a && i.dispose(), t !== ha || n) {
				if (e.isPoints) {
					let t = new ge();
					t.size = a.size, t.sizeAttenuation = a.sizeAttenuation, e.material = t;
				} else n ? e.material = new le({ wireframe: r }) : (e.material = new de({ wireframe: r }), e.material.flatShading = !0);
				t === ha && (e.material.map = a.map, e.material.color.set(a.color));
			} else e.material = a;
		});
	}
	_onLoadModel(e, t) {
		t[la] = performance.now(), e.traverse((e) => {
			let t = e.material;
			t && (e[oa] = t);
		}), this._updateMaterial(e);
	}
	_onDisposeModel(e) {
		let t = e.engineData;
		t?.boxHelperGroup && (t.boxHelperGroup.traverse((e) => {
			e.geometry && (e.geometry.dispose(), e.material.dispose());
		}), delete t.boxHelperGroup), t?.sphereHelper && (t.sphereHelper.traverse((e) => {
			e.geometry && (e.geometry.dispose(), e.material.dispose());
		}), delete t.sphereHelper), t?.regionHelper && (t.regionHelper.traverse((e) => {
			e.geometry && (e.geometry.dispose(), e.material.dispose());
		}), delete t.regionHelper);
	}
	dispose() {
		let e = this.tiles;
		e.removeEventListener("load-tileset", this._onLoadTilesetCB), e.removeEventListener("load-model", this._onLoadModelCB), e.removeEventListener("dispose-model", this._onDisposeModelCB), e.removeEventListener("update-after", this._onUpdateAfterCB), e.removeEventListener("tile-visibility-change", this._onTileVisibilityChangeCB), this.colorMode = ha, this.boundsColorMode = ha, this.unlit = !1, e.forEachLoadedModel((e) => {
			this._updateMaterial(e);
		}), e.traverse((e) => {
			this._onDisposeModel(e);
		}, null, !1), this.boxGroup?.removeFromParent(), this.sphereGroup?.removeFromParent(), this.regionGroup?.removeFromParent();
	}
}, ka = 0, Aa = 1, ja = 2, Ma = 3, Na = 150;
function Pa(e, t) {
	return e * 1 | t * 2;
}
function Fa(e, t, n) {
	return `${e}_${t}_${n}`;
}
var Ia = class {
	constructor() {
		this.parent = null, this.x = 0, this.y = 0, this.level = 0, this.children = [
			,
			,
			,
			,
		].fill(null), this.childCount = 0, this.loadingState = ka, this.visible = !1, this.target = 0, this.showTimer = 0, this.hideTimer = 0, this.siblingForced = !1, this.forced = !1, this.prefetch = 0, this._key = null, this._index = null;
	}
	getKey() {
		return this._key === null && (this._key = `${this.x}_${this.y}_${this.level}`), this._key;
	}
	getIndex() {
		return this._index === null && (this._index = Pa(this.x % 2, this.y % 2)), this._index;
	}
	addChild(e) {
		let t = e.getIndex();
		if (this.children[t] || e.x >> 1 !== this.x || e.y >> 1 !== this.y || e.level - 1 !== this.level) throw Error();
		e.parent = this, this.children[t] = e, this.childCount++;
	}
	remove() {
		if (this.childCount > 0) throw Error();
		this.parent.childCount--, this.parent.children[this.getIndex()] = null, this.parent = null;
	}
}, La = /* @__PURE__ */ new Set(), Ra = class extends A {
	constructor() {
		super(), this.root = new Ia(), this.cache = { [this.root.getKey()]: this.root }, this.contentCache = null, this._lastTime = -1, this.loadSiblings = !0;
	}
	update() {
		let e = performance.now(), t = e - (this._lastTime === -1 ? e : this._lastTime);
		this._lastTime = e;
		let { root: n } = this, r = this;
		i(n), a(n), La.forEach((e) => this._deleteTile(e)), La.clear();
		function i(e) {
			let n = e.target > 0 || e.siblingForced, a = e.visible && e.forced;
			n || a ? (e.showTimer += t, e.showTimer = Math.min(e.showTimer, Na), e.showTimer === Na && (e.hideTimer = 0)) : (e.visible || e.showTimer > 0) && (e.hideTimer += t, e.hideTimer = Math.min(e.hideTimer, Na), e.hideTimer === Na && (e.showTimer = 0, e.hideTimer = 0, e.loadingState !== ka && e.prefetch === 0 && (r.contentCache.release(e.x, e.y, e.level), e.loadingState = ka)));
			let o = (n ? e.showTimer === Na : e.showTimer > 0) || a;
			if (!n && !a && e.prefetch === 0 && e.showTimer === 0 && e.loadingState !== ka && (r.contentCache.release(e.x, e.y, e.level), e.loadingState = ka), (o || e.prefetch > 0) && e.loadingState === ka) {
				e.loadingState = Aa;
				let { x: t, y: n, level: i } = e, a = r.contentCache.lock(t, n, i);
				a instanceof Promise ? a.then((t) => {
					e.loadingState === Aa && (e.loadingState = ja);
				}).catch((t) => {
					e.loadingState === Aa && (e.loadingState = t.name === "AbortError" ? ka : Ma);
				}) : e.loadingState = a === null ? Ma : ja;
			}
			let { children: s } = e;
			if (r.loadSiblings) {
				let t = !1;
				for (let e = 0, n = s.length; e < n; e++) {
					let n = s[e];
					n !== null && n.target > 0 && (t = !0);
				}
				if (t && e.childCount < 4) for (let t = 0; t <= 1; t++) for (let n = 0; n <= 1; n++) r._ensureTile(2 * e.x + n, 2 * e.y + t, e.level + 1);
				for (let e = 0, n = s.length; e < n; e++) {
					let n = s[e];
					n !== null && (n.siblingForced = t);
				}
			} else for (let e = 0, t = s.length; e < t; e++) {
				let t = s[e];
				t !== null && (t.siblingForced = !1);
			}
			for (let e = 0, t = s.length; e < t; e++) {
				let t = s[e];
				t !== null && i(t);
			}
		}
		function a(e, t = !1, n = !0) {
			let i = e.target > 0 || e.siblingForced, o = e.visible && t;
			e.forced = t;
			let s = (i ? e.showTimer === Na : e.showTimer > 0) || o, c = !1;
			(i || o) && (e.loadingState === ja && (n || o) ? (c = !0, t = !1) : s && (t = !0));
			let { children: l } = e, u = !0;
			if (r.loadSiblings) for (let e = 0, t = l.length; e < t; e++) {
				let t = l[e];
				(t === null || t.loadingState !== ja && t.loadingState !== Ma) && (u = !1);
			}
			let d = e.visible || i || e.showTimer > 0 || e.prefetch > 0, f = !1;
			for (let e = 0, n = l.length; e < n; e++) {
				let n = l[e];
				if (n !== null) {
					d = a(n, t, u) || d;
					let e = n.target > 0 || n.siblingForced, i = r.loadSiblings && n.loadingState === Ma;
					f ||= e && !n.visible && !i;
				}
			}
			if (f && e.loadingState === ja && (c = !0), r.loadSiblings && c && e.childCount === 4) {
				let e = !0, t = !1;
				for (let n = 0, r = l.length; n < r; n++) {
					let r = l[n];
					!r.visible && r.loadingState !== Ma && (e = !1), t ||= r.visible;
				}
				e && t && (c = !1);
			}
			return c !== e.visible && (e.visible = c, r.dispatchEvent({
				type: "toggle",
				visible: c,
				x: e.x,
				y: e.y,
				level: e.level
			})), e !== r.root && !d && La.add(e), d;
		}
	}
	getVisibleTiles() {
		let e = [];
		for (let t in this.cache) {
			let n = this.cache[t];
			n.visible && e.push(n);
		}
		return e;
	}
	setTargetState(e, t, n, r) {
		if (r) {
			let r = this._ensureTile(e, t, n);
			r.target++;
		} else {
			let r = this.cache[Fa(e, t, n)];
			if (!r || r.target <= 0) throw Error("MVTHierarchy: target ref count went negative — mismatched calls.");
			r.target--;
		}
	}
	setPrefetchState(e, t, n, r) {
		if (r) {
			let r = this._ensureTile(e, t, n);
			r.prefetch++;
		} else {
			let r = this.cache[Fa(e, t, n)];
			if (!r || r.prefetch <= 0) throw Error("MVTHierarchy: prefetch ref count went negative — mismatched calls.");
			r.prefetch--;
		}
	}
	_deleteTile(e) {
		if (e === this.root) throw Error();
		let { cache: t } = this, { x: n, y: r, level: i } = e, a = Fa(n, r, i);
		if (!(a in t)) throw Error();
		t[a].remove(), delete t[a];
	}
	_ensureTile(e, t, n) {
		let { cache: r } = this, i = Fa(e, t, n);
		if (i in r) return r[i];
		let a = new Ia();
		a.x = e, a.y = t, a.level = n;
		let o = e >> 1, s = t >> 1, c = n - 1;
		return this._ensureTile(o, s, c).addChild(a), r[a.getKey()] = a, a;
	}
}, za = {
	test: () => !1,
	mark: () => !1
}, Ba = 5e3;
function Va(e, t) {
	return e.sortValue === t.sortValue ? e.lodLevel === t.lodLevel ? e.visibleTime !== t.visibleTime && (e.visibleDuration < Ba || t.visibleDuration < Ba) ? e.visibleTime < t.visibleTime ? -1 : 1 : t.screenPos.y === e.screenPos.y ? e.id > t.id ? 1 : -1 : t.screenPos.y - e.screenPos.y : t.lodLevel - e.lodLevel : e.sortValue - t.sortValue;
}
var Ha = class {
	constructor() {
		this.id = "", this.layer = "", this.properties = null, this.lodLevel = 0, this.enabled = !0, this.valid = !0, this.ready = !1, this.horizonCutoff = .1, this.screenPos = new L(), this.sortValue = 0, this.visibleDuration = Infinity, this.visibleTime = Infinity, this.visible = !1;
	}
	updateTransform(e, t, n) {}
	evaluate(e, t) {
		return !1;
	}
	onShown() {}
	onHidden() {}
}, Ua = class extends A {
	get hasPendingWork() {
		return this.working || this.needsUpdate;
	}
	constructor() {
		super(), this.camera = null, this.matrix = new P(), this.useEllipsoidSurface = !0, this.maxUpdateTimeMs = .5, this._task = null, this._deadline = 0, this.working = !1, this.resolution = new I(1, 1), this.size = 12, this.cells = /* @__PURE__ */ new Uint32Array(1), this._totalResolution = new I(), this._lastMatrix = new P(), this._ndcMatrix = new P(), this._invMatrix = new P(), this._cameraLocalPos = new L(), this.buffer = .15, this.items = [], this.visible = /* @__PURE__ */ new Set(), this.prevVisible = /* @__PURE__ */ new Set(), this.added = /* @__PURE__ */ new Set(), this._itemSet = /* @__PURE__ */ new Set(), this._itemsNeedsUpdate = !1, this.needsUpdate = !1, this._id = -1, this.handle = {
			test: (e, t, n) => {
				let { cells: r, _id: i } = this, a = !1;
				return this._cellRange(e, t, n, (e, t, n) => (a = !0, r[n] !== 0 && r[n] !== i)) || !a;
			},
			mark: (e, t, n) => {
				let { cells: r, _id: i } = this;
				return this._cellRange(e, t, n, (e, t, n) => (r[n] = i, !1));
			}
		}, this.sortValueCallback = () => 0;
	}
	_cellRange(e, t, n, r) {
		let { size: i, resolution: a, buffer: o } = this, s = a.width, c = a.height, l = s * o, u = c * o, { width: d, height: f } = this._totalResolution, p = e + l, m = t + u, h = Math.max(0, Math.floor((p - n) / i)), g = Math.max(0, Math.floor((m - n) / i)), _ = Math.min(d - 1, Math.floor((p + n) / i)), v = Math.min(f - 1, Math.floor((m + n) / i)), y = n * n;
		for (let e = g; e <= v; e++) for (let t = h; t <= _; t++) {
			let n = Math.max(t * i, Math.min(p, (t + 1) * i)), a = Math.max(e * i, Math.min(m, (e + 1) * i)), o = p - n, s = m - a;
			if (o * o + s * s <= y && r(t, e, e * d + t) === !0) return !0;
		}
		return !1;
	}
	syncItems() {
		let { items: e, _itemSet: t } = this;
		if (this._itemsNeedsUpdate) {
			this._itemsNeedsUpdate = !1, e.length = t.size;
			let n = 0;
			for (let r of t.values()) e[n] = r, n++;
		}
	}
	_deadlineExpired() {
		return performance.now() >= this._deadline;
	}
	setDeadline(e = this.maxUpdateTimeMs) {
		this._deadline = performance.now() + e;
	}
	update(e = this.maxUpdateTimeMs) {
		this.setDeadline(e), this._task === null && (this._task = this._updateGenerator()), this._task.next();
	}
	flush() {
		this.setDeadline(Infinity), this._task === null && (this._task = this._updateGenerator());
		do
			this._task.next();
		while (this.working);
	}
	updateCameraTransform() {
		let { camera: e, matrix: t, _ndcMatrix: n, _invMatrix: r, _cameraLocalPos: i } = this;
		n.copy(t).premultiply(e.matrixWorldInverse).premultiply(e.projectionMatrix), r.copy(t).invert(), i.setFromMatrixPosition(e.matrixWorld).applyMatrix4(r);
	}
	*_updateGenerator() {
		for (;;) {
			let { resolution: e, size: t, added: n, handle: r, sortValueCallback: i, buffer: a, items: o, _lastMatrix: s, _itemSet: c, _ndcMatrix: l, _cameraLocalPos: u } = this;
			if (this.updateCameraTransform(), s.equals(l) && !this.needsUpdate) {
				yield;
				continue;
			}
			s.copy(l), this.needsUpdate = !1, this.working = !0, this.syncItems(), [this.visible, this.prevVisible] = [this.prevVisible, this.visible];
			let { visible: d, prevVisible: f } = this;
			d.clear(), n.clear(), this._totalResolution.copy(e).multiplyScalar(1 + 2 * a).multiplyScalar(1 / t).ceil();
			let { width: p, height: m } = this._totalResolution;
			this.cells.length === p * m ? this.cells.fill(0) : this.cells = new Uint8Array(p * m);
			for (let t = 0, n = o.length; t < n; t++) {
				let n = o[t];
				n.enabled && (n.updateTransform(l, e, u, this.useEllipsoidSurface), n.sortValue = i(n)), this._deadlineExpired() && (yield, this.updateCameraTransform());
			}
			o.sort(Va), this._deadlineExpired() && (yield, this.updateCameraTransform());
			for (let e = 0, t = o.length; e < t; e++) {
				let t = o[e];
				this._id = e + 1, t.enabled && c.has(t) && t.evaluate(r) && (d.add(t), f.has(t) ? (t.visible = !1, f.delete(t)) : (t.visible = !0, n.add(t))), this._deadlineExpired() && (yield, this.updateCameraTransform());
			}
			this.working = !1, (n.size > 0 || f.size > 0) && this.dispatchEvent({
				type: "change",
				added: n,
				removed: f
			}), yield;
		}
	}
	refreshLayout(e) {
		let { resolution: t, _ndcMatrix: n, _cameraLocalPos: r, useEllipsoidSurface: i } = this;
		e.updateTransform(n, t, r, i), e.evaluate(za, !0);
	}
	register(e) {
		this._itemSet.add(e), this._itemsNeedsUpdate = !0, this.needsUpdate = !0;
	}
	unregister(e) {
		this._itemSet.delete(e), this._itemsNeedsUpdate = !0, this.needsUpdate = !0;
	}
}, Wa = class extends A {
	get camera() {
		return this.manager.camera;
	}
	set camera(e) {
		this.manager.camera = e;
	}
	get matrix() {
		return this.manager.matrix;
	}
	get useEllipsoidSurface() {
		return this.manager.useEllipsoidSurface;
	}
	set useEllipsoidSurface(e) {
		this.manager.useEllipsoidSurface = e;
	}
	get resolution() {
		return this.manager.resolution;
	}
	get size() {
		return this.manager.size;
	}
	set size(e) {
		this.manager.size = e;
	}
	get cells() {
		return this.manager.cells;
	}
	get working() {
		return this.manager.working;
	}
	get hasPendingWork() {
		return this._showTimers.size > 0 || this._hideTimers.size > 0 || this.manager.hasPendingWork;
	}
	get sortValueCallback() {
		return this.manager.sortValueCallback;
	}
	set sortValueCallback(e) {
		this.manager.sortValueCallback = e;
	}
	get maxUpdateTimeMs() {
		return this.manager.maxUpdateTimeMs;
	}
	set maxUpdateTimeMs(e) {
		this.manager.maxUpdateTimeMs = e;
	}
	get buffer() {
		return this.manager.buffer;
	}
	set buffer(e) {
		this.manager.buffer = e;
	}
	get needsUpdate() {
		return this.manager.needsUpdate;
	}
	set needsUpdate(e) {
		this.manager.needsUpdate = e;
	}
	constructor() {
		super(), this.manager = new Ua(), this.visible = /* @__PURE__ */ new Set(), this.showDelay = .5, this.hideDelay = .5, this._showTimers = /* @__PURE__ */ new Map(), this._hideTimers = /* @__PURE__ */ new Map(), this._lastUpdateTime = -1, this.added = /* @__PURE__ */ new Set(), this.removed = /* @__PURE__ */ new Set(), this.manager.addEventListener("change", ({ added: e, removed: t }) => {
			let { _showTimers: n, _hideTimers: r, visible: i } = this;
			for (let t of e) r.delete(t), i.has(t) || (t.onShown(), n.set(t, 0));
			for (let e of t) n.delete(e) ? e.onHidden() : i.has(e) && r.set(e, 0);
		});
	}
	register(e) {
		return this.manager.register(e);
	}
	unregister(e) {
		this.manager.unregister(e);
	}
	syncItems() {
		this.manager.syncItems();
	}
	flush() {
		this.manager.flush();
	}
	update(...e) {
		let t = performance.now() / 1e3, n = this._lastUpdateTime < 0 ? 0 : Math.min(t - this._lastUpdateTime, .1);
		this._lastUpdateTime = t, this.manager.update(...e);
		let { _showTimers: r, _hideTimers: i, visible: a, added: o, removed: s, showDelay: c, hideDelay: l } = this, u = performance.now();
		for (let [e, t] of r) {
			let i = t + n;
			i >= c ? (r.delete(e), a.add(e), o.add(e), s.delete(e), e.visibleTime = u) : r.set(e, i);
		}
		for (let [e, t] of i) {
			let r = t + n;
			r >= l || !e.valid ? (i.delete(e), a.delete(e), s.add(e), o.delete(e), e.onHidden()) : i.set(e, r);
		}
		for (let e of a.values()) e.visibleDuration = u - e.visibleTime, this.manager.refreshLayout(e), e.valid === !1 && !i.has(e) && (i.set(e, 0), this.manager.needsUpdate = !0);
		(o.size > 0 || s.size > 0) && this.dispatchEvent({
			type: "change",
			added: o,
			removed: s
		});
	}
	finishAnimations() {
		let { _showTimers: e, _hideTimers: t, visible: n, added: r, removed: i } = this, a = performance.now();
		for (let t of e.keys()) n.add(t), r.add(t), i.delete(t), t.visibleTime = a;
		e.clear();
		for (let e of t.keys()) n.delete(e), i.add(e), r.delete(e), e.onHidden();
		t.clear();
	}
	reset() {
		this.added.clear(), this.removed.clear();
	}
}, Ga = 5e5, Ka = /* @__PURE__ */ new L(), qa = /* @__PURE__ */ new L(), Ja = [], Ya = [0, 0], Xa = 0, Za = class extends Ha {
	get count() {
		return this.lat.length;
	}
	get anchorCount() {
		return this.anchorPositions.length;
	}
	constructor() {
		super(), this.text = "", this.characterWidths = [], this.characterRadius = 0, this.totalTextWidth = 0, this.range = null, this.lat = [], this.lon = [], this.positions = [], this.anchorPositions = [], this.screenPositions = [], this.cumulativeLen = [], this.facingRatios = [], this.cachedMatrix = new P(), this.cachedResolution = new I(), this.needsUpdate = !1;
	}
	evaluate() {
		throw Error();
	}
	updateTransform(e, t, n, r = !0) {
		let { positions: i, screenPositions: a, cachedMatrix: o, cachedResolution: s, cumulativeLen: c } = this;
		if (!this.needsUpdate && o.equals(e) && s.equals(t)) return;
		for (this.needsUpdate = !1, o.copy(e), s.copy(t); a.length < i.length;) a.push(new L());
		let { facingRatios: l } = this;
		l.length = a.length;
		for (let o = 0, s = a.length; o < s; o++) {
			let s = i[o], c = a[o];
			c.copy(s).applyMatrix4(e), c.x = (c.x * .5 + .5) * t.width, c.y = (-c.y * .5 + .5) * t.height, c.z = N.mapLinear(c.z, -1, 1, 0, 1), n !== null && (!r || s.lengthSq() > 0) ? (Ka.subVectors(n, s).normalize(), r ? qa.copy(s).normalize() : qa.set(0, 0, 1), l[o] = qa.dot(Ka)) : l[o] = 1;
		}
		c.length = a.length, c[0] = 0;
		for (let e = 1; e < a.length; e++) {
			let t = a[e - 1], n = a[e], r = n.x - t.x, i = n.y - t.y, o = Math.sqrt(r * r + i * i);
			c[e] = c[e - 1] + o;
		}
	}
	updateCharacterWidthCache(e) {
		let { text: t, characterWidths: n, properties: r, layer: i } = this;
		n.length = t.length;
		let a = 0;
		for (let o = 0, s = t.length; o < s; o++) {
			let s = e(t[o], i, r);
			n[o] = s, a += s;
		}
		this.totalTextWidth = a, this.characterRadius = e("M", i, r);
	}
	hasCoverage(e, t) {
		let [n, r, i, a] = this.range;
		return t >= n && t <= i && e >= r && e <= a;
	}
	generateAnchors(e) {
		let { lat: t, lon: n } = this, r = [], i = 0;
		for (let e = 0, a = t.length - 1; e < a; e++) {
			let a = t[e], o = t[e + 1], s = n[e], c = n[e + 1], l = .5 * (a + o), u = o - a, d = (c - s) * Math.cos(l), f = Math.sqrt(u * u + d * d);
			r.push(f), i += f;
		}
		let a = e * .5;
		a > i && (a = i * .5);
		let o = 0, s = 0, c = [];
		for (; a <= i;) {
			for (; s < r.length && o + r[s] < a;) o += r[s], s++;
			if (s >= r.length) break;
			let i = s, l = s + 1, u = r[i], d = u > 0 ? (a - o) / u : 0;
			c.push({
				i0: i,
				i1: l,
				alpha: d,
				ref: null,
				lat: N.lerp(t[i], t[l], d),
				lon: N.lerp(n[i], n[l], d)
			}), a += e;
		}
		this.anchorPositions = c;
	}
};
function Qa(e, t, n) {
	n.length = 0;
	for (let r = 0, i = e.length - 1; r < i; r++) {
		let i = e[r], a = e[r + 1];
		n.push(i.x, i.y);
		let o = a.x - i.x, s = a.y - i.y, c = Math.sqrt(o * o + s * s), l = Math.ceil(c / t);
		for (let e = 1; e < l; e++) {
			let t = e / l;
			n.push(N.lerp(i.x, a.x, t), N.lerp(i.y, a.y, t));
		}
	}
	let r = e[e.length - 1];
	return n.push(r.x, r.y), n;
}
function $a(e, t, n, r, i, a, o, s = []) {
	let c = Ga / o.radius.x, [l, u, d, f] = r, { flipY: p, projection: m } = a, h = e.extent, g = h * .015625, _ = `${t}:${e.properties.name || e.id || `unnamed_${Xa++}`}`, v = e.loadGeometry();
	for (let r of v) {
		let a = Qa(r, g, Ja), o = new Za();
		o.id = _, o.layer = t, o.properties = e.properties, o.lodLevel = n, o.range = i;
		for (let e = 0, t = a.length; e < t; e += 2) {
			let t = N.lerp(l, d, a[e] / h), n = a[e + 1] / h, r = p ? N.lerp(f, u, n) : N.lerp(u, f, n), [i, s] = m.fromNormalizedToCartographic(t, r, Ya);
			o.lon.push(i), o.lat.push(s), o.positions.push(new L());
		}
		o.generateAnchors(c * (i[2] - i[0])), s.push(o);
	}
	return s;
}
// src/three/plugins/mvt/SettlingManager.js
var eo = 1e-10, to = .0016, no = /* @__PURE__ */ new Se(), ro = /* @__PURE__ */ new L(), io = [], ao = /* @__PURE__ */ new L(), oo = /* @__PURE__ */ new L();
function so(e, t) {
	let { ray: n } = e, { planes: r } = t, i = 0, a = e.far;
	for (let e = 0; e < 6; e++) {
		let t = r[e], o = t.normal.dot(n.direction);
		if (Math.abs(o) < eo) {
			if (t.distanceToPoint(n.origin) < 0) return !1;
		} else {
			let e = n.distanceToPlane(t);
			if (o > 0) e !== null && e > i && (i = e);
			else {
				if (e === null) return !1;
				e < a && (a = e);
			}
			if (i > a) return !1;
		}
	}
	return !0;
}
var co = class {
	get hasPendingWork() {
		return this._queue.size > 0;
	}
	constructor() {
		this.tiles = null, this.occupancy = null, this.camera = null, this.maxSettleTimeMs = 1, this.performSettleRaycast = null, this.elevationSource = null, this._queue = /* @__PURE__ */ new Set(), this._items = /* @__PURE__ */ new Set(), this.needsUpdate = !1, this._task = null, this._deadline = 0;
	}
	register(e) {
		this._items.add(e), this._queue.add(e);
	}
	unregister(e) {
		this._items.delete(e), this._queue.delete(e);
	}
	update(e = this.maxSettleTimeMs) {
		if (this.setDeadline(e), this.needsUpdate) {
			this.needsUpdate = !1;
			for (let e of this._items.values()) this._queue.add(e);
		}
		this._task === null && (this._task = this._settleGenerator()), this._task.next();
	}
	setDeadline(e = this.maxSettleTimeMs) {
		this._deadline = performance.now() + e;
	}
	_deadlineExpired() {
		return performance.now() >= this._deadline;
	}
	_getSettleThreshold(e) {
		let { surface: t } = this.tiles, n = e instanceof Za, r = n ? e.lat[0] : e.lat, i = n ? e.lon[0] : e.lon, a = 2 * Math.PI / 2 ** e.lodLevel, o = i + a <= Math.PI ? i + a : i - a;
		return t.getCartographicToPosition(r, i, 0, ao), t.getCartographicToPosition(r, o, 0, oo), to * ao.distanceTo(oo);
	}
	_getSettlingRay(e, t, n) {
		let { tiles: r } = this, { origin: i, direction: a } = n.ray;
		r.surface.getCartographicToPosition(e, t, 1e8, i), r.surface.getCartographicToPosition(e, t, 0, a), a.sub(i).normalize(), n.far = 2e8, n.firstHitOnly = !0;
	}
	_settleSample(e, t, n, r) {
		let { tiles: i, performSettleRaycast: a, elevationSource: o } = this;
		if (a === null && o !== null) {
			let a = o.sampleCartographicElevation(e, t);
			i.surface.getCartographicToPosition(e, t, a === null ? 0 : a, ro), ro.distanceTo(n) > r && n.copy(ro);
			return;
		}
		let { origin: s, direction: c } = no.ray;
		this._getSettlingRay(e, t, no), s.applyMatrix4(i.group.matrixWorld), c.transformDirection(i.group.matrixWorld);
		let l = !1;
		a === null ? (io.length = 0, no.intersectObject(i.group, !0, io), io.length > 0 && (ro.copy(io[0].point), l = !0)) : l = a(no.ray, e, t, ro), l ? ro.applyMatrix4(i.group.matrixWorldInverse) : i.surface.getCartographicToPosition(e, t, 0, ro), ro.distanceTo(n) > r && n.copy(ro);
	}
	*_settleGenerator() {
		let e = new P(), t = new M(), n = /* @__PURE__ */ new Set(), r = [
			[],
			[],
			[],
			[]
		];
		for (;;) {
			let { _queue: i, _items: a, tiles: o, camera: s, occupancy: c } = this;
			if (s !== null) {
				e.copy(o.group.matrixWorld).premultiply(s.matrixWorldInverse).premultiply(s.projectionMatrix), t.setFromProjectionMatrix(e);
				for (let e of i) if (!c.visible.has(e)) {
					if (e instanceof Za) {
						let { anchorPositions: r } = e, { lat: i, lon: a } = r[r.length >> 1];
						if (this._getSettlingRay(i, a, no), so(no, t)) {
							n.add(e);
							continue;
						}
					} else this._getSettlingRay(e.lat, e.lon, no), so(no, t) && n.add(e);
					this._deadlineExpired() && (yield);
				}
			}
			for (let e of i) {
				let t = n.has(e), i = 0;
				!e.ready && t ? i = 3 : c.visible.has(e) ? i = 2 : t && (i = 1), r[i].push(e), this._deadlineExpired() && (yield);
			}
			for (let e = r.length - 1; e >= 0; e--) {
				let t = r[e];
				for (; t.length > 0;) {
					let e = t.pop();
					i.delete(e), a.has(e) && (e.enabled ? (yield* this._settleItem(e), this._deadlineExpired() && (yield)) : e.ready = !1);
				}
			}
			n.clear(), r.forEach((e) => e.length = 0), yield;
		}
	}
	*_settleItem(e) {
		let t = this._getSettleThreshold(e);
		if (e instanceof Za) {
			let { _items: n } = this, { lat: r, lon: i, positions: a } = e;
			for (let o = 0, s = r.length; o < s; o++) if (this._settleSample(r[o], i[o], a[o], t), this._deadlineExpired() && (yield, !n.has(e))) return;
			e.needsUpdate = !0;
		} else this._settleSample(e.lat, e.lon, e.position, t);
		e.ready = !0;
	}
}, lo = Math.PI / 4, uo = 3 / 5, fo = .8, X = {
	NONE: 0,
	NOT_READY: 1,
	NO_FIT: 2,
	DEPTH: 3,
	OCCUPANCY: 4,
	SPACING: 5,
	ANGLE: 6,
	FACING: 7
}, po = [], mo = [], ho = /* @__PURE__ */ new L(), go = /* @__PURE__ */ new I(), _o = /* @__PURE__ */ new I(), vo = /* @__PURE__ */ new I(), yo = [], bo = [], xo = 0, So = class extends Ha {
	get lat() {
		return this.getActiveReference().lat;
	}
	get lon() {
		return this.getActiveReference().lon;
	}
	get ready() {
		return this.getActiveReference().line.ready;
	}
	set ready(e) {}
	get properties() {
		return this.getActiveReference().line.properties;
	}
	set properties(e) {}
	get enabled() {
		return this.getActiveReference().line.enabled;
	}
	set enabled(e) {}
	get text() {
		return this.getActiveReference().line.text;
	}
	constructor(e) {
		super(), this.id = `${e}_${xo++}`, this.displayed = !1, this.referencePaths = [], this._activeReference = null, this._snapped = null, this._flippedTextDir = !1, this.characterPositions = [], this.characterAngles = [], this.rejectionReason = X.NONE;
	}
	evaluate(e, t = !1) {
		this.rejectionReason = X.NONE;
		let { text: n } = this;
		if (!n) return !1;
		let { line: r } = this.getActiveReference(), { cumulativeLen: i } = r;
		return !r.ready || i.length < 2 ? (this.rejectionReason = X.NOT_READY, !1) : (this._flippedTextDir = this._getTextDirection(), po.length = n.length, mo.length = n.length, this._layoutCharacters(e, po, mo, t), !this.valid && !t ? !1 : (this._placeCharacters(e, po, mo), !0));
	}
	_reject(e) {
		this.valid && (this.rejectionReason = e), this.valid = !1;
	}
	_getTextDirection() {
		let { line: e, i0: t, i1: n, alpha: r } = this.getActiveReference(), { cumulativeLen: i, screenPositions: a, totalTextWidth: o } = e, s = N.lerp(i[t], i[n], r), c = o * .5, l = s - c, u = s + c, d = 0, f = 0, p = i.length - 2, m = 1;
		for (let e = 0, t = i.length - 2; e < t; e++) {
			let t = e + 1, n = i[e], r = i[t];
			l >= n && l <= r && (d = e, f = N.mapLinear(l, n, r, 0, 1)), u >= n && u <= r && (p = e, m = N.mapLinear(u, n, r, 0, 1));
		}
		let h = ho.lerpVectors(a[d], a[d + 1], f).x;
		return ho.lerpVectors(a[p], a[p + 1], m).x < h;
	}
	_layoutCharacters(e, t, n, r = !1) {
		let { line: i, i0: a, i1: o, alpha: s } = this.getActiveReference(), { cumulativeLen: c, screenPositions: l, facingRatios: u, totalTextWidth: d, characterWidths: f, characterRadius: p, text: m } = i, h = N.lerp(c[a], c[o], s), g = this._flippedTextDir;
		this.valid = !0;
		let _ = l.length, v = c[c.length - 1], y = m.length, b = h - d * .5, x = uo * p, S = 0, C = 0;
		yo.length = 0, bo.length = 0;
		let w = 0, T = 0, E = 0;
		for (let a = 0; a < y; a++) {
			let o = g ? y - 1 - a : a, s = f[o], m = T + s * .5 - d * .5;
			T += s;
			let D = h + m;
			if ((D < 0 || D > v) && (this._reject(X.NO_FIT), !r)) break;
			for (; w < _ - 2 && c[w + 1] < D;) {
				w++;
				let e = c[w];
				if (e < b) continue;
				let t = l[w - 1], n = l[w], i = l[w + 1];
				_o.set(n.x - t.x, n.y - t.y), vo.set(i.x - n.x, i.y - n.y);
				let a = Math.abs(Math.atan2(_o.cross(vo), _o.dot(vo)));
				for (yo.push(e), bo.push(a), S += a; e - yo[C] > x;) S -= bo[C], C++;
				if (S > lo && (this._reject(X.ANGLE), !r)) break;
			}
			if (!this.valid && !r) break;
			let O = w + 1, k = c[O] - c[w], A = k > 0 ? (D - c[w]) / k : 0, ee = l[w], j = l[O];
			if (ho.lerpVectors(ee, j, A), ho.z < 0 || ho.z > 1) {
				if (this._reject(X.DEPTH), !r) break;
			} else if (N.lerp(u[w], u[O], A) < i.horizonCutoff) {
				if (this._reject(X.FACING), !r) break;
			} else if (e.test(ho.x, ho.y, p) && (this._reject(X.OCCUPANCY), !r)) break;
			if (a > 0) {
				let e = ho.x - go.x, t = ho.y - go.y, n = e * e + t * t, i = (s + E) * .5 * fo;
				if (n < i * i && (this._reject(X.SPACING), !r)) break;
			}
			E = s, go.copy(ho), t[o] = w, n[o] = A;
		}
	}
	_placeCharacters(e, t, n) {
		let { characterPositions: r, characterAngles: i, text: a } = this, { line: o } = this.getActiveReference(), { screenPositions: s, positions: c, characterRadius: l } = o, u = this._flippedTextDir, d = a.length;
		for (; r.length < d;) r.push(new L());
		r.length = d, i.length = d;
		for (let a = 0; a < d; a++) {
			let o = t[a], d = n[a], f = s[o], p = s[o + 1];
			e.mark(f.x + (p.x - f.x) * d, f.y + (p.y - f.y) * d, l), r[a].lerpVectors(c[o], c[o + 1], d);
			let m = (p.x - f.x) * (u ? -1 : 1), h = (p.y - f.y) * (u ? -1 : 1);
			i[a] = Math.atan2(h, m);
		}
	}
	updateTransform(e, t, n, r = !0) {
		this.updateActiveReference(), this.getActiveReference().line.updateTransform(e, t, n, r);
	}
	isEmpty() {
		return this.referencePaths.length === 0;
	}
	hasLoD(e) {
		return this.referencePaths.find((t) => t.line.lodLevel === e);
	}
	getPosition(e) {
		let { line: t, i0: n, i1: r, alpha: i } = this.getActiveReference();
		return e.lerpVectors(t.positions[n], t.positions[r], i);
	}
	getActiveReference() {
		return this._snapped ?? this._activeReference;
	}
	updateActiveReference() {
		let { referencePaths: e, _activeReference: t, displayed: n } = this, r, i = e[0] ?? null;
		if (r = i && i.line.ready ? i : t && t.line.ready && (e.includes(t) || this.displayed) ? t : i ?? t, r && t && r !== t) {
			if (n) {
				let { lat: e, lon: n } = this._snapped ?? t;
				this._snapped = this._snapToLine(r.line, e, n);
			} else this._snapped = null;
		}
		return this._activeReference = r, r;
	}
	_snapToLine(e, t, n) {
		let { lat: r, lon: i } = e;
		if (r.length < 2) return null;
		let a = Infinity, o = 0, s = 1, c = 0, l = r[0], u = i[0];
		for (let e = 0, d = r.length - 1; e < d; e++) {
			let d = r[e], f = i[e], p = r[e + 1] - d, m = i[e + 1] - f, h = p * p + m * m, g = h > 0 ? N.clamp(((t - d) * p + (n - f) * m) / h, 0, 1) : 0, _ = d + p * g, v = f + m * g, y = t - _, b = n - v, x = y * y + b * b;
			x < a && (a = x, o = e, s = e + 1, c = g, l = _, u = v);
		}
		return {
			line: e,
			i0: o,
			i1: s,
			alpha: c,
			lat: l,
			lon: u
		};
	}
	onShown() {
		this.displayed = !0, this._snapped = null;
	}
	onHidden() {
		this.displayed = !1;
	}
	addLine(e, t) {
		let n = e.anchorPositions[t], { referencePaths: r } = this;
		r.push({
			line: e,
			i0: n.i0,
			i1: n.i1,
			alpha: n.alpha,
			lat: n.lat,
			lon: n.lon
		}), r.sort((e, t) => t.line.lodLevel - e.line.lodLevel), this.updateActiveReference();
	}
	removeLine(e) {
		let { referencePaths: t } = this, n = !1;
		for (let r = 0; r < t.length; r++) t[r].line === e && (t.splice(r, 1), r--, n = !0);
		return n;
	}
}, Co = class {
	constructor() {
		this.added = /* @__PURE__ */ new Set(), this.removed = /* @__PURE__ */ new Set(), this._anchorsById = /* @__PURE__ */ new Map(), this._linesById = /* @__PURE__ */ new Map(), this.lines = /* @__PURE__ */ new Set(), this.anchors = /* @__PURE__ */ new Set();
	}
	reset() {
		this.added.clear(), this.removed.clear();
	}
	update() {
		let { _anchorsById: e, removed: t } = this;
		e.forEach((n, r) => {
			n.forEach((e) => {
				e.isEmpty() && (n.delete(e), this.anchors.delete(e), t.add(e));
			}), n.size === 0 && e.delete(r);
		});
	}
	addLines(e) {
		let { _anchorsById: t, _linesById: n, added: r } = this, i = /* @__PURE__ */ new Map();
		e.forEach((e) => {
			i.has(e.id) || i.set(e.id, []), i.get(e.id).push(e);
		}), i.forEach((e, i) => {
			t.has(i) || t.set(i, /* @__PURE__ */ new Set()), n.has(i) || n.set(i, /* @__PURE__ */ new Set());
			let a = e[0], o = t.get(i);
			o.forEach((t) => {
				let n = Infinity, r = null, i = -1;
				a.hasCoverage(t.lat, t.lon) && !t.hasLoD(a.lodLevel) && (e.forEach((e) => {
					e.anchorPositions.forEach((a, o) => {
						if (a.ref === null) {
							let s = t.lat - a.lat, c = t.lon - a.lon, l = s * s + c * c;
							l < n && (n = l, r = e, i = o);
						}
					});
				}), r && (t.addLine(r, i), r.anchorPositions[i].ref = t));
			}), e.forEach((e) => {
				e.anchorPositions.forEach((t, n) => {
					if (t.ref === null) {
						let a = new So(i);
						a.addLine(e, n), e.hasCoverage(a.lat, a.lon) && (t.ref = a, o.add(a), this.anchors.add(a), r.add(a));
					}
				});
			});
		}), i.forEach((e, t) => {
			let r = n.get(t);
			e.forEach((e) => {
				r.add(e), this.lines.add(e);
			});
		});
	}
	deleteLines(e) {
		let { _anchorsById: t, _linesById: n } = this, r = /* @__PURE__ */ new Set();
		e.forEach((e) => {
			let i = e.id;
			n.get(i).delete(e), this.lines.delete(e), n.get(i).size === 0 && n.delete(i);
			let a = t.get(i);
			a && a.forEach((t) => {
				t.removeLine(e) && r.add(t);
			});
		}), r.forEach((e) => e.updateActiveReference());
	}
}, wo = class {
	constructor(e) {
		this.enabled = !1, this.canvas = null, this.occupancyManager = e;
	}
	update() {
		let { occupancyManager: e, enabled: t } = this;
		if (!t) {
			this.dispose();
			return;
		}
		if (this.canvas === null) {
			let e = document.createElement("canvas");
			e.style.cssText = "position:fixed;top:0;left:0;pointer-events:none;opacity:0.5;", document.body.appendChild(e), this.canvas = e;
		}
		if (e.working) return;
		let { canvas: n } = this, { cells: r, size: i, resolution: a, buffer: o } = e, s = window.devicePixelRatio, c = a.width * o, l = a.height * o, u = Math.ceil((a.width + 2 * c) / i), d = Math.ceil((a.height + 2 * l) / i);
		n.width = Math.round(s * (a.width + 2 * c)), n.height = Math.round(s * (a.height + 2 * l)), n.style.width = `${a.width + 2 * c}px`, n.style.height = `${a.height + 2 * l}px`, n.style.left = `${-c}px`, n.style.top = `${-l}px`;
		let f = i * s, p = n.getContext("2d");
		p.clearRect(0, 0, n.width, n.height);
		for (let e = 0; e < d; e++) for (let t = 0; t < u; t++) {
			let n = r[e * u + t] !== 0;
			p.fillStyle = n ? "rgba( 255, 80, 80, 0.6 )" : "rgba( 80, 255, 80, 0.15 )", p.fillRect(t * f + .5, e * f + .5, f - 1, f - 1), p.strokeStyle = n ? "rgba( 255, 80, 80, 1 )" : "rgba( 80, 255, 80, 0.25 )", p.lineWidth = 1, p.strokeRect(t * f + .5, e * f + .5, f - 1, f - 1);
		}
	}
	dispose() {
		this.canvas !== null && (this.canvas.remove(), this.canvas = null);
	}
}, To = new class {
	constructor() {
		this._cache = {};
	}
	getColor(...e) {
		let t = e.pop(), n = e.join("_"), { _cache: r } = this;
		return n in r || (t.setHSL(Math.random(), 1, .5), r[n] = t.getHex()), t.set(r[n]);
	}
}(), Eo = {
	NONE: 0,
	ID: 1,
	LEVEL: 2,
	TILE: 3,
	NAME: 4,
	REJECTION: 5
}, Do = {
	[X.NONE]: 16777215,
	[X.NOT_READY]: 7829367,
	[X.NO_FIT]: 2250239,
	[X.DEPTH]: 4473924,
	[X.OCCUPANCY]: 65535,
	[X.SPACING]: 16776960,
	[X.ANGLE]: 16711680,
	[X.FACING]: 16711935
}, Oo = /* @__PURE__ */ new L(), ko = /* @__PURE__ */ new L(), Ao = /* @__PURE__ */ new T();
function jo() {
	let e = new D(/* @__PURE__ */ new Uint8Array(4096), 32, 32);
	for (let t = 0; t < 32; t++) for (let n = 0; n < 32; n++) {
		let r = (t - 16) / 16, i = (n - 16) / 16, a = Math.sqrt(r * r + i * i), o = n * 32 + t;
		e.image.data[4 * o + 0] = 255, e.image.data[4 * o + 1] = 255, e.image.data[4 * o + 2] = 255, e.image.data[4 * o + 3] = a < 1 ? 255 : 0;
	}
	return e.needsUpdate = !0, e;
}
var Mo = class {
	get ColorMode() {
		return Eo;
	}
	constructor(e) {
		this.enabled = !1, this.colorMode = Eo.NONE, this.displayLines = !0, this.displayAnchors = !0, this.camera = null, this.anchorManager = e, this.group = null, this._lines = null, this._points = null;
	}
	update() {
		let { enabled: e, group: t, camera: n, anchorManager: r, displayAnchors: i, displayLines: a } = this;
		if (!e) {
			this.dispose();
			return;
		}
		if (this._lines === null) {
			let e = new ie();
			e.material.transparent = !0, e.material.depthTest = !1, e.material.depthWrite = !1, e.material.vertexColors = !0, e.frustumCulled = !1, e.raycast = () => {};
			let n = new he();
			n.material.transparent = !0, n.material.depthTest = !1, n.material.depthWrite = !1, n.material.map = jo(), n.material.size = 6, n.material.sizeAttenuation = !1, n.material.vertexColors = !0, n.frustumCulled = !1, n.raycast = () => {}, t.add(e, n), this._lines = e, this._points = n;
		}
		let { _lines: o, _points: s } = this;
		n === null ? Oo.set(0, 0, 0) : (Oo.setFromMatrixPosition(n.matrixWorld), t.worldToLocal(Oo));
		let c = Array.from(r.lines).filter((e) => e instanceof Za && e.ready), l = 0;
		for (let e of c) l += e.count - 1;
		let u = new S(new Float32Array(l * 2 * 3), 3), d = new S(new Float32Array(l * 2 * 3), 3), f = 0;
		for (let e of c) {
			this._getColor(e, Ao);
			let t = e.positions;
			for (let e = 0, n = t.length - 1; e < n; e++) u.setXYZ(f + 0, ...ko.copy(t[e]).sub(Oo)), u.setXYZ(f + 1, ...ko.copy(t[e + 1]).sub(Oo)), d.setXYZ(f + 0, ...Ao), d.setXYZ(f + 1, ...Ao), f += 2;
		}
		let p = Array.from(r.anchors).filter((e) => e.ready), m = new S(new Float32Array(p.length * 3), 3), h = new S(new Float32Array(p.length * 2 * 3), 3);
		f = 0;
		for (let e of p) e.getPosition(ko).sub(Oo), m.setXYZ(f, ...ko), this.colorMode === Eo.REJECTION ? Ao.set(Do[e.rejectionReason] ?? 16777215) : this._getColor(e.getActiveReference().line, Ao), h.setXYZ(f, ...Ao), f++;
		o.geometry.dispose(), o.geometry.setAttribute("position", u), o.geometry.setAttribute("color", d), o.position.copy(Oo), o.updateMatrixWorld(), o.visible = a, s.geometry.dispose(), s.geometry.setAttribute("position", m), s.geometry.setAttribute("color", h), s.position.copy(Oo), s.updateMatrixWorld(), s.visible = i;
	}
	dispose() {
		this._lines !== null && (this._lines.removeFromParent(), this._lines.geometry.dispose(), this._lines.material.dispose(), this._lines = null), this._points !== null && (this._points.removeFromParent(), this._points.geometry.dispose(), this._points.material.dispose(), this._points.material.map.dispose(), this._points = null);
	}
	_getColor(e, t) {
		switch (this.colorMode) {
			case Eo.ID:
				To.getColor(e.id, t);
				break;
			case Eo.LEVEL:
				To.getColor(e.lodLevel, t);
				break;
			case Eo.NAME:
				To.getColor(e.properties.name, t);
				break;
			case Eo.TILE:
				To.getColor(...e.range, t);
				break;
			default: t.set(16777215);
		}
	}
}, No = /* @__PURE__ */ new L(), Po = /* @__PURE__ */ new L(), Fo = [0, 0], Io = class extends Ha {
	constructor() {
		super(), this.position = new L(), this.lat = 0, this.lon = 0, this.radius = 28, this.screenPos = new L(), this._facingRatio = 1;
	}
	updateTransform(e, t, n, r = !0) {
		let { position: i, screenPos: a } = this;
		a.copy(i).applyMatrix4(e), a.x = (a.x * .5 + .5) * t.width, a.y = (-a.y * .5 + .5) * t.height, a.z = +(a.z < -1 || a.z > 1), n !== null && (!r || i.lengthSq() > 0) ? (No.subVectors(n, i).normalize(), r ? Po.copy(i).normalize() : Po.set(0, 0, 1), this._facingRatio = Po.dot(No)) : this._facingRatio = 1;
	}
	evaluate(e) {
		let { screenPos: t, radius: n, horizonCutoff: r, _facingRatio: i } = this;
		return !this.ready || t.z !== 0 || i < r || e.test(t.x, t.y, n) ? !1 : (e.mark(t.x, t.y, n), !0);
	}
};
function Lo(e, t, n, r, i, a = []) {
	let [o, s, c, l] = r, { projection: u } = i, d = e.extent, f = e.loadGeometry();
	for (let [r] of f) {
		let f = N.lerp(o, c, r.x / d), p = r.y / d, m = i.flipY ? N.lerp(l, s, p) : N.lerp(s, l, p), [h, g] = u.fromNormalizedToCartographic(f, m, Fo), _ = new Io();
		_.id = `${t}:${e.id}`, _.layer = t, _.properties = e.properties, _.lat = g, _.lon = h, _.lodLevel = n, a.push(_);
	}
	return a;
}
// src/three/plugins/mvt/debug/HierarchyOverlay.js
var Ro = {
	NONE: 0,
	LEVEL: 1,
	TILE: 2
}, zo = 600, Bo = 700, Vo = 10, Ho = 50, Uo = class {
	get ColorMode() {
		return Ro;
	}
	constructor() {
		this.enabled = !1, this._wasEnabled = !1, this.hierarchy = null, this.tiles = null, this.tiling = null, this.colorMode = Ro.NONE, this._regions = {}, this._onToggleCallback = ({ x: e, y: t, level: n, visible: r }) => {
			let i = `${e}_${t}_${n}`;
			if (r) {
				let { tiles: r, tiling: a } = this, { surface: o, group: s } = r, [c, l, u, d] = a.getTileBounds(e, t, n, !1, !1), f = o.isEllipsoid ? 1 : o.scale.x / (2 * Math.PI * r.ellipsoid.radius.x), p = {
					latStart: l,
					latEnd: d,
					lonStart: c,
					lonEnd: u,
					heightStart: (o.isEllipsoid ? zo : Vo) * f,
					heightEnd: (o.isEllipsoid ? Bo : Ho) * f,
					getCartographicToPosition: (e, t, n, r) => o.getCartographicToPosition(e, t, n, r),
					getCartographicToNormal: (e, t, n) => o.getCartographicToNormal(e, t, n)
				}, m = new ia(p), h = new aa(p);
				m.material.depthWrite = !1, m.material.depthTest = !1, m.material.transparent = !0, h.material.transparent = !0, h.material.opacity = .1, h.material.depthWrite = !1;
				let g = new ne();
				g.add(m, h), s.add(g), g.updateMatrixWorld(!0), this._regions[i] = {
					helper: g,
					x: e,
					y: t,
					level: n
				};
			} else {
				let { helper: e } = this._regions[i];
				e.children.forEach((e) => e.dispose()), e.removeFromParent(), delete this._regions[i];
			}
		};
	}
	update() {
		let { enabled: e, hierarchy: t, _regions: n } = this;
		if (e !== this._wasEnabled && (this._wasEnabled = e, e ? (t.getVisibleTiles().forEach((e) => {
			this._onToggleCallback(e);
		}), t.addEventListener("toggle", this._onToggleCallback)) : this.dispose()), e) for (let e in n) {
			let { x: t, y: r, level: i, helper: a } = n[e];
			a.children.forEach((e) => {
				let { color: n } = e.material;
				switch (this.colorMode) {
					case Ro.NONE:
						n.set(16777215);
						break;
					case Ro.LEVEL:
						To.getColor(i, n);
						break;
					case Ro.TILE: To.getColor(t, r, i, n);
				}
			});
		}
	}
	dispose() {
		let { hierarchy: e } = this;
		e.getVisibleTiles().forEach((e) => {
			this._onToggleCallback({
				...e,
				visible: !1
			});
		}), e.removeEventListener("toggle", this._onToggleCallback);
	}
}, Wo = class {
	constructor() {
		this.added = /* @__PURE__ */ new Set(), this.removed = /* @__PURE__ */ new Set(), this.points = /* @__PURE__ */ new Set(), this._annotationsById = /* @__PURE__ */ new Map();
	}
	add(e) {
		let { _annotationsById: t, points: n, added: r } = this, { id: i } = e;
		if (!t.has(i)) t.set(i, {
			annotation: e,
			ref: 0
		}), n.add(e), r.add(e);
		else {
			let n = t.get(i).annotation;
			e.lodLevel > n.lodLevel && (n.lodLevel = e.lodLevel, n.lat = e.lat, n.lon = e.lon);
		}
		t.get(i).ref++;
	}
	delete(e) {
		let { _annotationsById: t } = this, { id: n } = e, r = t.get(n);
		r.ref--;
	}
	update() {
		let { removed: e, points: t, _annotationsById: n } = this;
		n.forEach((r, i) => {
			r.ref === 0 && (e.add(r.annotation), t.delete(r.annotation), n.delete(i));
		});
	}
	reset() {
		this.added.clear(), this.removed.clear();
	}
}, Go = class extends w {
	get isFull() {
		return this._freeList.length === 0 && this._nextIndex >= this._capacity;
	}
	get capacity() {
		return this._capacity;
	}
	get count() {
		return this._slots.size;
	}
	constructor(e = 32, t = 64) {
		super(null), this.generateMipmaps = !1, this.slotSize = 0, this._columns = -1, this._capacity = -1, this._slots = /* @__PURE__ */ new Map(), this._freeList = [], this._nextIndex = 0, this._capacity = 0, this._columns = 0, this._uvs = /* @__PURE__ */ new Map(), this.resize(e, t), this.colorSpace = we;
	}
	keys() {
		return this._slots.keys();
	}
	has(e) {
		return this._slots.has(e);
	}
	get(e) {
		let { _slots: t } = this;
		return t.has(e) ? this._indexToSlot(t.get(e)) : null;
	}
	getSlotSize(e) {
		let { slotSize: t, image: n } = this;
		return e.set(t / n.width, t / n.height);
	}
	getUV(e) {
		let { _slots: t, _uvs: n } = this, r = t.get(e);
		return n.get(r);
	}
	drawChar(e, t, n = {}) {
		let { font: r = "", color: i = "white", strokeStyle: a = null, strokeWidth: o = 1 } = n;
		return this._draw(e, (e, n, s, c, l) => {
			let u = n + c / 2, d = s + l / 2, f = this.measureChar(t, r), p = u - (f.actualBoundingBoxRight + f.actualBoundingBoxLeft) / 2, m = d + l / 4;
			a !== null && (e.font = r, e.lineJoin = "round", e.lineWidth = o * 2, e.strokeStyle = a, e.strokeText(t, p, m)), e.font = r, e.fillStyle = i, e.fillText(t, p, m);
		});
	}
	measureChar(e, t) {
		let { ctx: n } = this;
		return n.font = t, n.measureText(e);
	}
	drawImage(e, t) {
		return this._draw(e, (e, n, r, i, a) => {
			e.drawImage(t, n, r, i, a);
		});
	}
	drawPath(e, t, n = {}) {
		let { fillStyle: r = null, strokeStyle: i = null, lineWidth: a = 1 } = n;
		return this._draw(e, (e, n, o) => {
			e.save(), e.translate(n, o), r !== null && (e.fillStyle = r, e.fill(t)), i !== null && (e.strokeStyle = i, e.lineWidth = a, e.stroke(t)), e.restore();
		});
	}
	drawSVG(e, t, n = {}) {
		let { fillStyle: r = "white", strokeStyle: i = null, strokeWidth: a = 1, iconScale: o = 1 } = n, s = new DOMParser().parseFromString(t, "image/svg+xml").documentElement, c = (s.getAttribute("viewBox") ?? "0 0 15 15").trim().split(/[\s,]+/), l = parseFloat(c[2]), u = parseFloat(c[3]), d = [...s.querySelectorAll("path")].map((e) => e.getAttribute("d")).filter(Boolean).map((e) => new Path2D(e));
		return this._draw(e, (e, t, n, s, c) => {
			let f = s * o, p = c * o, m = Math.min(f / l, p / u), h = t + (s - l * m) / 2, g = n + (c - u * m) / 2;
			if (e.save(), e.translate(h, g), e.scale(m, m), e.lineJoin = "round", e.lineCap = "round", i !== null) {
				e.lineWidth = a * 2 / m, e.strokeStyle = i;
				for (let t of d) e.stroke(t);
			}
			if (r !== null) {
				e.fillStyle = r;
				for (let t of d) e.fill(t);
			}
			e.restore();
		});
	}
	release(e) {
		let { _slots: t, _freeList: n } = this;
		if (!t.has(e)) return;
		let r = t.get(e);
		n.push(r), t.delete(e);
	}
	resize(e, t = this.slotSize) {
		let n = this.image, r = this._columns, i = this.slotSize, a = Math.ceil(Math.sqrt(e)), o = document.createElement("canvas");
		o.width = a * t, o.height = a * t;
		let s = o.getContext("2d");
		for (let e of this._slots.values()) {
			let o = e % r * i, c = Math.floor(e / r) * i, l = e % a * t, u = Math.floor(e / a) * t;
			s.drawImage(n, o, c, i, i, l, u, t, t);
		}
		this.dispose(), this.image = o, this.ctx = s, this.slotSize = t, this._columns = a, this._capacity = e;
		for (let e of this._slots.values()) this._updateUV(e);
		this.needsUpdate = !0;
	}
	clear() {
		this._slots.clear(), this._freeList.length = 0, this._nextIndex = 0, this.ctx.clearRect(0, 0, this.image.width, this.image.height), this.needsUpdate = !0;
	}
	_draw(e, t) {
		let { ctx: n, _freeList: r, _capacity: i, _slots: a } = this, o;
		if (a.has(e)) o = a.get(e);
		else {
			if (r.length > 0) o = r.pop();
			else if (this._nextIndex < i) o = this._nextIndex++;
			else throw Error("MVTGlyphAtlasTexture: atlas is full. Call resize() to increase capacity.");
			a.set(e, o);
		}
		let s = this._indexToSlot(o);
		return n.save(), n.beginPath(), n.rect(s.x, s.y, s.w, s.h), n.clip(), n.clearRect(s.x, s.y, s.w, s.h), t(n, s.x, s.y, s.w, s.h), n.restore(), this._updateUV(o), this.needsUpdate = !0, s;
	}
	_indexToSlot(e) {
		let { _columns: t, slotSize: n } = this;
		return {
			x: e % t * n,
			y: Math.floor(e / t) * n,
			w: n,
			h: n
		};
	}
	_updateUV(e) {
		let { slotSize: t, image: n, _uvs: r } = this, { width: i, height: a } = n, o = this._indexToSlot(e);
		r.set(e, {
			x: o.x / i,
			y: (a - o.y) / a,
			w: t / i,
			h: t / a
		});
	}
}, Ko = /* @__PURE__ */ new Ne(), qo = class extends ge {
	get glyphAtlas() {
		return this._glyphAtlas;
	}
	set glyphAtlas(e) {
		this._glyphAtlas = e, e !== null && e.getSlotSize(this._glyphCellSize), this._uniforms && (this._uniforms.glyphAtlas.value = e);
	}
	get glyphCellSize() {
		return this._glyphCellSize;
	}
	constructor(e = {}) {
		let { size: t = 25, sizeAttenuation: n = !1, ...r } = e;
		super({
			size: t,
			sizeAttenuation: n,
			...r
		}), this.transparent = !0, this.depthTest = !1, this.depthWrite = !1, this.resolution = new I(), this._glyphCellSize = new I(), this._glyphAtlas = new Go(), this._uniforms = null, this.onBeforeCompile = (e) => {
			e.uniforms.glyphAtlas = { value: this._glyphAtlas }, e.uniforms.glyphCellSize = { value: this._glyphCellSize }, this._uniforms = e.uniforms, e.vertexShader = e.vertexShader.replace("#include <color_pars_vertex>", "\n					#include <color_pars_vertex>\n					attribute vec2 glyphUV;\n					attribute float alpha;\n					attribute float angle;\n					varying vec2 vGlyphUV;\n					varying float vAlpha;\n					varying float vAngle;\n				"), e.vertexShader = e.vertexShader.replace("#include <color_vertex>", "\n					#include <color_vertex>\n					vGlyphUV = glyphUV;\n					vAlpha = alpha;\n					vAngle = angle;\n				"), e.fragmentShader = "\n\n					uniform sampler2D glyphAtlas;\n					uniform vec2 glyphCellSize;\n					uniform float opacity;\n					varying vec2 vGlyphUV;\n					varying float vAlpha;\n					varying float vAngle;\n\n					void main() {\n\n						vec4 diffuseColor = vec4( 0.0 );\n						if ( vGlyphUV.x >= 0.0 ) {\n\n							// rotate the point-sprite lookup around its center so the glyph follows\n							// the path direction; clamp keeps the rotated corners inside the slot\n							vec2 pc = gl_PointCoord - 0.5;\n							float c = cos( vAngle );\n							float s = sin( vAngle );\n							pc = vec2( c * pc.x + s * pc.y, - s * pc.x + c * pc.y ) + 0.5;\n							pc = clamp( pc, 0.0, 1.0 );\n\n							vec4 glyph = texture2D( glyphAtlas, vGlyphUV + pc * glyphCellSize * vec2( 1.0, - 1.0 ) );\n							diffuseColor = glyph;\n\n						}\n\n						diffuseColor.a *= vAlpha * opacity;\n						gl_FragColor = diffuseColor;\n\n						#include <tonemapping_fragment>\n						#include <colorspace_fragment>\n						#include <premultiplied_alpha_fragment>\n\n\n					}\n\n\n			";
		};
	}
	onBeforeRender(e) {
		this._glyphAtlas.getSlotSize(this._glyphCellSize), e.getViewport(Ko), this.resolution.set(Ko.z, Ko.w);
	}
}, Jo = /* @__PURE__ */ new P(), Z = /* @__PURE__ */ new Ne(), Yo = /* @__PURE__ */ new Ne(), Xo = /* @__PURE__ */ new I(), Zo = /* @__PURE__ */ new I(), Qo = /* @__PURE__ */ new L(), $o = /* @__PURE__ */ Object.freeze({
	OBSCURED: 0,
	DRAW_THROUGH: 1,
	OVERLAY: 2
}), es = class extends ne {
	static get DrawMode() {
		return $o;
	}
	get size() {
		return this._opaque.material.size;
	}
	set size(e) {
		this._opaque.material.size = e, this._drawThrough.material.size = e;
	}
	get glyphAtlas() {
		return this._opaque.material.glyphAtlas;
	}
	get drawMode() {
		return this._drawMode;
	}
	set drawMode(e) {
		this._drawMode = e, this._applyDrawMode();
	}
	get geometry() {
		return this._opaque.geometry;
	}
	constructor(e) {
		super(), this.frustumCulled = !1, this.fadeInDuration = .3, this.fadeOutDuration = .3, this.drawThroughOpacity = .5, this._entryMap = /* @__PURE__ */ new Map(), this._orderedEntries = [], this._lastUpdateTime = -1, this._lastCamera = null;
		let t = new C(), n = new he(t, new qo());
		n.frustumCulled = !1, n.renderOrder = 1e3, n.onAfterRender = (e, t, n) => {
			this._lastCamera = n;
		};
		let r = new he(t, new qo());
		r.frustumCulled = !1, r.material.glyphAtlas = n.material.glyphAtlas, r.renderOrder = 1001, r.onAfterRender = (e, t, n) => {
			this._lastCamera = n;
		}, this.add(r, n), this._opaque = n, this._drawThrough = r, this.drawMode = $o.OVERLAY;
	}
	dispose() {
		this.glyphAtlas.dispose(), this.geometry.dispose(), this._opaque.material.dispose(), this._drawThrough.material.dispose();
	}
	update(e, t) {
		let n = performance.now() / 1e3, r = this._lastUpdateTime < 0 ? 0 : Math.min(n - this._lastUpdateTime, .1);
		this._lastUpdateTime = n;
		let { _entryMap: i, _orderedEntries: a, fadeInDuration: o, fadeOutDuration: s } = this;
		for (let t of e) {
			let e = i.get(t.id);
			if (e) e.item = t, e.state === "out" && (e.state = "in");
			else {
				let e = {
					item: t,
					fade: 0,
					state: "in"
				};
				i.set(t.id, e), a.push(e);
			}
		}
		for (let e of t) {
			let t = i.get(e.id);
			t && t.state !== "out" && (t.state = "out");
		}
		let c = !1;
		for (let [e, t] of i) t.state === "in" ? (t.fade = Math.min(1, t.fade + r / o), t.fade >= 1 && (t.state = "visible")) : t.state === "out" && (t.fade = Math.max(0, t.fade - r / s), t.fade <= 0 && (i.delete(e), c = !0));
		c && (this._orderedEntries = a.filter((e) => i.has(e.item.id))), this._recenter(), this._updateGeometry();
	}
	raycast(e, t) {
		let n = e.camera;
		if (!n) return;
		let { geometry: r, matrixWorld: i } = this, { material: a } = this._opaque, { resolution: o } = a, s = r.getAttribute("position");
		if (!s || s.count === 0) return;
		let c = a.size / 2, l = -n.near;
		e.ray.at(1, Yo), Yo.w = 1, Yo.applyMatrix4(n.matrixWorldInverse), Yo.applyMatrix4(n.projectionMatrix), Yo.multiplyScalar(1 / Yo.w), Xo.set(Yo.x * o.x / 2, Yo.y * o.y / 2), Jo.multiplyMatrices(n.matrixWorldInverse, i);
		for (let a = 0, u = r.drawRange.count; a < u; a++) {
			if (Z.fromBufferAttribute(s, a), Z.w = 1, Z.applyMatrix4(Jo), Z.z > l || (Z.applyMatrix4(n.projectionMatrix), Z.multiplyScalar(1 / Z.w), Z.z < -1 || Z.z > 1) || (Zo.set(Z.x * o.x / 2, Z.y * o.y / 2), Xo.distanceTo(Zo) > c)) continue;
			Qo.fromBufferAttribute(s, a).applyMatrix4(i);
			let r = this._orderedEntries[a];
			t.push({
				distance: e.ray.origin.distanceTo(Qo),
				point: Qo.clone(),
				index: a,
				face: null,
				faceIndex: null,
				object: this,
				layer: r?.item.layer ?? null,
				properties: r?.item.properties ?? null
			});
		}
		return !1;
	}
	_applyDrawMode() {
		let { _opaque: e, _drawThrough: t, drawThroughOpacity: n, _drawMode: r } = this;
		switch (r) {
			case $o.OVERLAY:
				e.visible = !0, e.material.depthTest = !1, t.visible = !1;
				break;
			case $o.DRAW_THROUGH:
				e.visible = !0, e.material.depthTest = !0, t.visible = !0, t.material.opacity = n, t.material.depthFunc = te;
				break;
			case $o.OBSCURED:
			default: e.visible = !0, e.material.depthTest = !0, t.visible = !1;
		}
	}
	_recenter() {
		let { parent: e, _lastCamera: t } = this;
		t ? (e ? Jo.copy(e.matrixWorld).invert() : Jo.identity(), this.position.setFromMatrixPosition(t.matrixWorld).applyMatrix4(Jo), this.updateMatrixWorld(!0)) : (this.position.set(0, 0, 0), this.updateMatrixWorld(!0));
	}
	_updateGeometry() {}
	_resizeGeometry(e) {
		let { geometry: t } = this, n = t.getAttribute("position");
		(!n || n.count < e) && (t.dispose(), t.setAttribute("position", new S(new Float32Array(e * 3), 3)), t.setAttribute("glyphUV", new S(new Float32Array(e * 2), 2)), t.setAttribute("alpha", new S(new Float32Array(e), 1)), t.setAttribute("angle", new S(new Float32Array(e), 1))), t.setDrawRange(0, e);
	}
	_writeGlyph(e, t, n, r, i = 0) {
		let { geometry: a, glyphAtlas: o } = this, s = this.position, { position: c, glyphUV: l, alpha: u, angle: d } = a.attributes;
		if (c.setXYZ(e, t.x - s.x, t.y - s.y, t.z - s.z), n !== null && o.has(n)) {
			let t = o.getUV(n);
			l.setXY(e, t.x, t.y);
		} else l.setXY(e, -1, -1);
		u.setX(e, r), d.setX(e, i);
	}
	_markNeedsUpdate() {
		let { geometry: e } = this;
		e.getAttribute("position").needsUpdate = !0, e.getAttribute("glyphUV").needsUpdate = !0, e.getAttribute("alpha").needsUpdate = !0, e.getAttribute("angle").needsUpdate = !0;
	}
}, ts = class extends es {
	constructor(e = {}) {
		let { getKind: t = () => null, fallback: n = null, size: r = 18, glyphSize: i = 18 * window.devicePixelRatio, slotCount: a = 64 } = e;
		super(), this.getKind = t, this.fallback = n, this.size = r, this.glyphAtlas.resize(a, i);
	}
	_updateGeometry() {
		let { _orderedEntries: e, getKind: t, glyphAtlas: n, fallback: r } = this, i = e.length;
		this._resizeGeometry(i);
		for (let a = 0; a < i; a++) {
			let { item: i, fade: o } = e[a], s = t(i.layer, i.properties);
			s !== null && n.has(s) || (s = r), this._writeGlyph(a, i.position, s, o);
		}
		this._markNeedsUpdate();
	}
}, ns = /* @__PURE__ */ new Set(), rs = class extends es {
	constructor(e = {}) {
		let { size: t = 16, glyphSize: n = 16 * window.devicePixelRatio, slotCount: r = 64, font: i = null, fontFamily: a = "sans-serif", strokeStyle: o = "black", strokeWidth: s = 0 } = e;
		super();
		let c = Math.round(n * .7);
		this._font = i ?? `400 ${c}px ${a}`, this._advanceCache = /* @__PURE__ */ new Map(), this._strokeStyle = o, this._strokeWidth = s, this.glyphAtlas.resize(r, n), this.size = t;
	}
	reset() {
		this._advanceCache.clear(), this.glyphAtlas.clear();
	}
	measureChar(e) {
		let { _advanceCache: t, glyphAtlas: n, _font: r } = this;
		if (!t.has(e)) {
			let i = this.size / n.slotSize, a = n.measureChar(e, r).width + 2;
			t.set(e, a * i);
		}
		return t.get(e);
	}
	_drawChar(e, t) {
		let { glyphAtlas: n } = this;
		if (n.capacity === n.count) {
			let e = null;
			for (let r of n.keys()) if (!t.has(r)) {
				e = r;
				break;
			}
			e === null ? n.resize(n.capacity * 2) : n.release(e);
		}
		n.drawChar(e, e, {
			font: this._font,
			color: "white",
			strokeStyle: this._strokeStyle,
			strokeWidth: this._strokeWidth
		});
	}
	_updateGeometry() {
		let { _orderedEntries: e, glyphAtlas: t } = this;
		ns.clear();
		let n = 0;
		for (let t of e) {
			let { text: e, characterPositions: r } = t.item;
			n += r.length;
			for (let t = 0, n = e.length; t < n; t++) ns.add(e[t]);
		}
		for (let e of ns) t.has(e) || this._drawChar(e, ns);
		this._resizeGeometry(n);
		let r = 0;
		for (let t of e) {
			let e = t.item, { fade: n } = t, i = e.characterPositions, a = e.characterAngles, o = e.text;
			for (let e = 0, t = i.length; e < t; e++) this._writeGlyph(r++, i[e], o[e], n, a[e]);
		}
		this._markNeedsUpdate(), ns.clear();
	}
}, is = class {
	get hasPendingWork() {
		return this._queue.size > 0;
	}
	constructor() {
		this.callback = function* () {}, this.maxUpdateTimeMs = 1, this._queue = /* @__PURE__ */ new Map(), this._tasks = /* @__PURE__ */ new Map(), this._deadline = 0, this._isDeadlineComplete = () => performance.now() >= this._deadline;
	}
	add(e, t) {
		this._tasks.delete(e), this._queue.set(e, t);
	}
	delete(e) {
		this._queue.delete(e), this._tasks.delete(e);
	}
	update(e = this.maxUpdateTimeMs) {
		let { _queue: t, _tasks: n, _isDeadlineComplete: r } = this;
		this._deadline = performance.now() + e;
		for (let [e, i] of t) {
			let a = n.get(e);
			if (a || (a = this.callback(i, r), n.set(e, a)), a.next().done && (t.delete(e), n.delete(e)), r()) break;
		}
	}
	clear() {
		this._queue.clear(), this._tasks.clear();
	}
}, as = 4095, os = /* @__PURE__ */ new P();
function ss(e) {
	let t = [];
	return e.traverse((e) => {
		e.isMesh && t.push(e);
	}), t;
}
var cs = class {
	set needsUpdate(e) {
		e && this.version++;
	}
	constructor() {
		this.group = new ne(), this.performSettleRaycast = null, this.sampleCartographicElevation = null, this.version = 0;
	}
	filterAnnotation(e, t, n) {
		return !1;
	}
	getAnnotationRank(e) {
		return e.properties.rank ?? Infinity;
	}
	measureChar(e, t, n) {
		return 1;
	}
	getText(e) {
		return e.name ?? "";
	}
	isAnnotationEnabled(e, t, n) {
		return !0;
	}
	onPointsUpdate(e, t) {}
	onLabelsUpdate(e, t) {}
	dispose() {}
};
function ls(e) {
	let t = [], n = [];
	for (let r of e) r instanceof So ? n.push(r) : t.push(r);
	return {
		points: t,
		labels: n
	};
}
var us = class extends cs {
	constructor() {
		super();
		let e = window.devicePixelRatio, t = new ts({ fallback: "default" });
		t.glyphAtlas.drawChar("default", "●", {
			fillStyle: "white",
			strokeStyle: "black",
			strokeWidth: 3 * e,
			font: "30px sans-serif"
		});
		let n = new rs({
			fontFamily: "Arial",
			strokeStyle: "black",
			strokeWidth: 3 * e
		});
		this.group.add(t, n), this.icons = t, this.labels = n;
	}
	filterAnnotation(e, t, n) {
		return !0;
	}
	measureChar(e, t, n) {
		return this.labels.measureChar(e);
	}
	onPointsUpdate(e, t) {
		this.icons.update(e, t);
	}
	onLabelsUpdate(e, t) {
		this.labels.update(e, t);
	}
	dispose() {
		this.icons.dispose(), this.labels.dispose();
	}
}, ds = class {
	get contentCache() {
		return this.overlay.imageSource._contentCache;
	}
	get maxSettleTimeMs() {
		return this.settlingManager.maxSettleTimeMs;
	}
	set maxSettleTimeMs(e) {
		this.settlingManager.maxSettleTimeMs = e;
	}
	get maxOccupancyUpdateTimeMs() {
		return this.occupancy.maxUpdateTimeMs;
	}
	set maxOccupancyUpdateTimeMs(e) {
		this.occupancy.maxUpdateTimeMs = e;
	}
	get maxParseTimeMs() {
		return this.toggleTileQueue.maxUpdateTimeMs;
	}
	set maxParseTimeMs(e) {
		this.toggleTileQueue.maxUpdateTimeMs = e;
	}
	get horizonCutoff() {
		return this._horizonCutoff;
	}
	set horizonCutoff(e) {
		e !== this._horizonCutoff && (this._horizonCutoff = e, this.pointManager.points.forEach((t) => t.horizonCutoff = e), this.anchorManager.lines.forEach((t) => t.horizonCutoff = e), this.occupancy.needsUpdate = !0);
	}
	get resolution() {
		return this._resolution;
	}
	set resolution(e) {
		if (e === this._resolution) return;
		let { tiles: t, tileLoadState: n } = this;
		t !== null && n.forEach((e, n) => {
			t.visibleTiles.has(n) && this._markVectorTile(n, !1), this._prefetchVectorTile(n, !1);
		}), this._resolution = e, t !== null && n.forEach((e, n) => {
			this._prefetchVectorTile(n, !0), t.visibleTiles.has(n) && this._markVectorTile(n, !0);
		});
	}
	constructor(e = {}) {
		this.priority = Infinity, this.name = "MVT_ANNOTATIONS_PLUGIN";
		let { overlay: t, camera: n = null, driver: r = new us(), resolution: i = 50, horizonCutoff: a = .1, useIdleCallback: o = !0 } = e;
		this.overlay = t, this.camera = n, this.driver = r, this.tiles = null, this._resolution = i, this._horizonCutoff = a, this.useIdleCallback = o, this._idleCallbackHandle = -1, this._measureChar = (e) => this.driver.measureChar(e), this._filterAnnotation = (e, t, n) => this.driver.filterAnnotation(e, t, n), this._driverVersion = -1, this.hierarchy = new Ra(), this.occupancy = new Wa(), this.anchorManager = new Co(), this.pointManager = new Wo(), this.settlingManager = new co(), this.tileLoadState = /* @__PURE__ */ new Map(), this.vectorTileInfo = /* @__PURE__ */ new Map(), this.toggleTileQueue = new is(), this.debug = {
			occupancy: new wo(this.occupancy),
			paths: new Mo(this.anchorManager),
			hierarchy: new Uo()
		};
	}
	async init(e) {
		this.tiles = e, this.driver.group.parent === null && (e.group.add(this.driver.group), this.driver.group.updateMatrixWorld());
		let { overlay: t, occupancy: n, debug: r, hierarchy: i, settlingManager: a, contentCache: o, pointManager: s, anchorManager: c, toggleTileQueue: l } = this;
		r.paths.group = e.group, r.hierarchy.hierarchy = i, r.hierarchy.tiles = e, r.hierarchy.tiling = t.tiling, a.occupancy = n, a.tiles = e, i.contentCache = o, t.init(), t.isReady || await t.whenReady(), this.driver.sortAnnotations && console.warn("MVTAnnotationsDriver: \"sortAnnotations\" has been deprecated. Implement \"getAnnotationRank\" instead."), n.sortValueCallback = (e) => {
			let t = +!n.visible.has(e), r = Math.min(Math.max(Math.floor(this.driver.getAnnotationRank(e)), 0), as);
			return t * 4096 + r;
		}, this._onVisibilityChange = ({ scene: e, tile: t, visible: n }) => {
			a.needsUpdate = !0, this._markVectorTile(t, n);
		}, this._onUpdateAfter = () => {
			let { driver: t, camera: o, _measureChar: u } = this, d = t.version !== this._driverVersion;
			if (this._driverVersion = t.version, d) {
				for (let e of s.points) e.enabled = t.isAnnotationEnabled(e.layer, e.properties, 1);
				for (let e of c.lines) e.enabled = t.isAnnotationEnabled(e.layer, e.properties, 2), e.text = t.getText(e.properties), e.updateCharacterWidthCache(u);
				a.needsUpdate = !0, n.needsUpdate = !0;
			}
			o !== null && (e.getResolution(o, n.resolution), n.matrix.copy(e.group.matrixWorld), n.useEllipsoidSurface = !!e.surface.isEllipsoid), i.update(), l.update(), s.update(), s.added.forEach((e) => {
				n.register(e), a.register(e);
			}), s.removed.forEach((e) => {
				n.unregister(e), a.unregister(e);
			}), s.reset(), c.update(), c.added.forEach((e) => {
				n.register(e);
			}), c.removed.forEach((e) => {
				n.unregister(e);
			}), c.reset(), n.needsUpdate = n.needsUpdate || a.hasPendingWork, a.camera = o, a.performSettleRaycast = t.performSettleRaycast, a.elevationSource = t.sampleCartographicElevation === null ? e.plugins.find((e) => e.sampleCartographicElevation) || null : t, a.update(), n.camera = o, n.update(), d && (n.flush(), n.finishAnimations());
			let f = ls(n.added), p = ls(n.removed);
			this.driver.onPointsUpdate(f.points, p.points), this.driver.onLabelsUpdate(f.labels, p.labels), (n.added.size > 0 || n.removed.size > 0) && e.dispatchEvent({ type: "needs-render" }), n.reset(), (n.hasPendingWork || a.hasPendingWork || l.hasPendingWork) && (e.dispatchEvent({ type: "needs-update" }), this.useIdleCallback && this._idleCallbackHandle === -1 && (this._idleCallbackHandle = requestIdleCallback((e) => {
				this._idleCallbackHandle = -1, n.needsUpdate = n.needsUpdate || a.hasPendingWork, l.update(e.timeRemaining() * .9), a.update(e.timeRemaining() * .9), n.update(e.timeRemaining() * .9);
			}))), r.paths.camera = this.camera, r.occupancy.update(), r.paths.update(), r.hierarchy.update();
		}, this._onVectorTileToggle = ({ x: t, y: n, level: r, visible: i }) => {
			e.dispatchEvent({ type: "needs-update" });
			let a = `${t}_${n}_${r}`;
			i === this.vectorTileInfo.has(a) ? l.delete(a) : l.add(a, {
				x: t,
				y: n,
				level: r,
				visible: i
			});
		}, this._onTileDownloadStart = ({ tile: e, url: t }) => {
			!/\.json$/i.test(t) && !/\.subtree/i.test(t) && this._initTileRange(e);
		}, l.callback = function* ({ x: n, y: r, level: i, visible: a }, o) {
			let { contentCache: s, driver: c, vectorTileInfo: l, settlingManager: u, anchorManager: d, pointManager: f, _filterAnnotation: p, _measureChar: m } = this, h = `${n}_${r}_${i}`;
			if (a) {
				let { tiling: a } = t, g = s.get(n, r, i);
				if (!g) {
					l.set(h, { annotations: [] });
					return;
				}
				let _ = [], v = a.getTileBounds(n, r, i, !0, !1), y = a.getTileBounds(n, r, i, !1, !1);
				for (let t in g.layers) {
					let n = g.layers[t];
					for (let r = 0; r < n.length; r++) {
						o() && (yield);
						let s = n.feature(r), { type: c } = s;
						(c === 1 || c === 2) && p(t, s.properties, c) && (c === 1 ? Lo(s, t, i, v, a, _) : $a(s, t, i, v, y, a, e.ellipsoid, _));
					}
				}
				let b = [];
				for (let e of _) e.horizonCutoff = this._horizonCutoff, e instanceof Za ? (b.push(e), u.register(e), e.enabled = c.isAnnotationEnabled(e.layer, e.properties, 2), e.text = c.getText(e.properties), e.updateCharacterWidthCache(m)) : (f.add(e), e.enabled = c.isAnnotationEnabled(e.layer, e.properties, 1));
				d.addLines(b), l.set(h, { annotations: _ });
			} else {
				let { annotations: e } = l.get(h);
				l.delete(h);
				let t = [];
				for (let n of e) n instanceof Za ? (t.push(n), u.unregister(n)) : f.delete(n);
				d.deleteLines(t);
			}
		}.bind(this), i.addEventListener("toggle", this._onVectorTileToggle), e.addEventListener("update-after", this._onUpdateAfter), e.addEventListener("tile-visibility-change", this._onVisibilityChange), e.addEventListener("tile-download-start", this._onTileDownloadStart), e.forEachLoadedModel((t, n) => {
			this.processTileModel(t, n), e.visibleTiles.has(n) && this._markVectorTile(n, !0);
		});
	}
	dispose() {
		let { debug: e, tiles: t, hierarchy: n, driver: r, settlingManager: i, toggleTileQueue: a, tileLoadState: o } = this;
		e.occupancy.dispose(), e.paths.dispose(), r.group.removeFromParent(), r.dispose(), n.removeEventListener("toggle", this._onVectorTileToggle), t.removeEventListener("update-after", this._onUpdateAfter), t.removeEventListener("tile-visibility-change", this._onVisibilityChange), t.removeEventListener("tile-download-start", this._onTileDownloadStart), o.forEach((e, n) => {
			t.visibleTiles.has(n) && this._markVectorTile(n, !1), this._prefetchVectorTile(n, !1);
		}), a.clear(), this._idleCallbackHandle !== -1 && (cancelIdleCallback(this._idleCallbackHandle), this._idleCallbackHandle = -1), i.elevationSource = null;
	}
	disposeTile(e) {
		this.tileLoadState.has(e) && (this._prefetchVectorTile(e, !1), this.tileLoadState.delete(e));
	}
	async processTileModel(e, t) {
		let { tiles: n, overlay: r } = this;
		if (this.tileLoadState.has(t)) return;
		r.isReady || await r.whenReady(), os.identity(), e.parent !== null && os.copy(n.group.matrixWorldInverse), e.updateMatrixWorld();
		let { range: i } = kt(ss(e), n.surface, os, r.projection);
		this.tileLoadState.set(t, i), this._prefetchVectorTile(t, !0);
	}
	_initTileRange(e) {
		let { overlay: t, tileLoadState: n } = this;
		if (!t.isReady || n.has(e) || !e.boundingVolume.region) return;
		let [r, i, a, o] = e.boundingVolume.region, s = [
			r,
			i,
			a,
			o
		];
		s = t.projection.clampToBounds(s), s = t.projection.fromCartographicToNormalizedRange(s), n.set(e, s), this._prefetchVectorTile(e, !0);
	}
	_prefetchVectorTile(e, t) {
		let n = this.tileLoadState.get(e);
		this._forEachTileInBounds(n, (e, n, r) => {
			this.hierarchy.setPrefetchState(e, n, r, t);
		});
	}
	_markVectorTile(e, t) {
		let n = this.tileLoadState.get(e);
		n !== void 0 && this._forEachTileInBounds(n, (e, n, r) => {
			this.hierarchy.setTargetState(e, n, r, t);
		});
	}
	_forEachTileInBounds(e, t) {
		let { overlay: n, resolution: r } = this, { tiling: i } = n, a = n.calculateLevel(e, r);
		if (!n.isReady) throw Error("MVTAnnotationsPlugin: overlay is not ready.");
		Dt(e, a, i, t);
	}
}, fs = /* @__PURE__ */ new T();
function ps(e, t) {
	let n = "r/", r = e.slice(1), i = Math.floor(r.length / t);
	for (let e = 0; e < i; e++) n += r.substr(e * t, t) + "/";
	return n.slice(0, -1);
}
var ms = {
	POSITION_CARTESIAN: {
		name: "position",
		size: 12,
		type: "int32"
	},
	COLOR_PACKED: {
		name: "rgba",
		size: 4,
		type: "uint8"
	},
	RGB: {
		name: "rgb",
		size: 3,
		type: "uint8"
	},
	RGBA: {
		name: "rgba",
		size: 4,
		type: "uint8"
	},
	INTENSITY: {
		name: "intensity",
		size: 2,
		type: "uint16"
	},
	INTENSITY_GRADIENT: {
		name: "intensity gradient",
		size: 2,
		type: "uint16"
	},
	CLASSIFICATION: {
		name: "classification",
		size: 1,
		type: "uint8"
	},
	NORMAL_FLOATS: {
		name: "normal floats",
		size: 12,
		type: "float32"
	},
	NORMAL_SPHEREMAPPED: {
		name: "normal spheremapped",
		size: 2,
		type: "uint8"
	},
	NORMAL_OCT16: {
		name: "normal oct16",
		size: 2,
		type: "uint8"
	},
	GPS_TIME: {
		name: "gps-time",
		size: 8,
		type: "float64"
	},
	RETURN_NUMBER: {
		name: "return number",
		size: 1,
		type: "uint8"
	},
	NUMBER_OF_RETURNS: {
		name: "number of returns",
		size: 1,
		type: "uint8"
	},
	SOURCE_ID: {
		name: "point source id",
		size: 2,
		type: "uint16"
	},
	RGB565: {
		name: "rgb565",
		size: 2,
		type: "uint16"
	}
};
function hs(e) {
	return e.map((e) => {
		if (typeof e == "string") return ms[e];
		let t = ms[e.name], n = e.size ?? e.elements * e.elementSize;
		return t ? {
			...t,
			size: n
		} : {
			name: e.name.toLowerCase(),
			size: n,
			type: e.type
		};
	});
}
function gs(e) {
	let { scale: t } = e, n = e.boundingBox;
	return {
		spacing: e.spacing,
		hierarchyStepSize: e.hierarchyStepSize,
		scale: [
			t,
			t,
			t
		],
		boundingBox: {
			min: [
				n.lx,
				n.ly,
				n.lz
			],
			max: [
				n.ux,
				n.uy,
				n.uz
			]
		},
		attributes: hs(e.pointAttributes)
	};
}
function _s(e, t, n) {
	let r = new DataView(e), i = [t], a = 0;
	for (let t = 0; a + 5 <= e.byteLength; t++, a += 5) {
		let e = r.getUint8(a), o = r.getUint32(a + 1, !0), s = i[t];
		n.set(s, {
			childMask: e,
			numPoints: o
		});
		for (let t = 0; t < 8; t++) e & 1 << t && i.push(s + t);
	}
}
function vs(e, t) {
	for (let n = 0, r = e.length; n < r; n++) {
		let [r, i] = e[n];
		t.set(r, {
			childMask: 0,
			numPoints: i
		});
	}
	t.forEach((e, n) => {
		if (n.length > 1) {
			let e = t.get(n.slice(0, -1));
			e.childMask |= 1 << parseInt(n.charAt(n.length - 1));
		}
	});
}
function ys(e, t, n, r, i) {
	let a = new DataView(e, n, r), o = [t], s = 0;
	for (let t = 0; s + 22 <= r; t++, s += 22) {
		let n = a.getUint8(s), r = a.getUint8(s + 1), c = a.getUint32(s + 2, !0), l = a.getBigInt64(s + 6, !0), u = a.getBigInt64(s + 14, !0), d = o[t];
		if (n === 2 && t !== 0) ys(e, d, Number(l), Number(u), i);
		else {
			u === 0n && (c = 0), i.set(d, {
				childMask: r,
				numPoints: c,
				byteOffset: l,
				byteSize: u
			});
			for (let e = 0; e < 8; e++) r & 1 << e && o.push(d + e);
		}
	}
}
function bs(e, t, n) {
	let r = (e[0] + t[0]) / 2, i = (e[1] + t[1]) / 2, a = (e[2] + t[2]) / 2;
	return [[
		n & 4 ? r : e[0],
		n & 2 ? i : e[1],
		n & 1 ? a : e[2]
	], [
		n & 4 ? t[0] : r,
		n & 2 ? t[1] : i,
		n & 1 ? t[2] : a
	]];
}
var xs = class {
	constructor() {
		this.fetchOptions = {}, this.version = null, this.metadata = null, this.hierarchy = null, this._dataDirUrl = null, this._octreeUrl = null, this._loadedChunks = null, this._inlineHierarchy = !1;
	}
	fetchData(e, t) {
		return fetch(e, t);
	}
	async _fetchBuffer(e, t) {
		let n = await this.fetchData(e, t);
		if (!n.ok) throw Error(`PotreeLoader: Could not fetch "${e}" with status ${n.status}`);
		return n.arrayBuffer();
	}
	async load(e) {
		let t = e.split("/").pop(), n = e.slice(0, e.lastIndexOf("/") + 1), r = t === "metadata.json" ? 2 : 1, i = await this.fetchData(e, this.fetchOptions);
		if (!i.ok) throw Error(`PotreeLoader: Could not fetch "${e}" with status ${i.status}`);
		let a = await i.json();
		if (r === 2 && a.encoding && a.encoding !== "DEFAULT") throw Error(`PotreeLoader: "${a.encoding}" encoded point data is not supported`);
		if (r === 1 && !Array.isArray(a.pointAttributes)) throw Error(`PotreeLoader: "${a.pointAttributes}" node files are not supported`);
		this.version = r, this.metadata = r === 2 ? a : gs(a), this.hierarchy = /* @__PURE__ */ new Map(), r === 2 ? (this._octreeUrl = new URL("octree.bin", n).href, ys(await this._fetchBuffer(new URL("hierarchy.bin", n).href, this.fetchOptions), "r", 0, a.hierarchy.firstChunkSize, this.hierarchy)) : (this._dataDirUrl = new URL(a.octreeDir + "/", n).href, this._inlineHierarchy = !!a.hierarchy, this._inlineHierarchy ? vs(a.hierarchy, this.hierarchy) : (_s(await this._fetchBuffer(new URL("r/r.hrc", this._dataDirUrl).href, this.fetchOptions), "r", this.hierarchy), this._loadedChunks = /* @__PURE__ */ new Set(["r"])));
	}
	async loadNodeData(e, t = {}) {
		let n = this.hierarchy.get(e), r = {
			...this.fetchOptions,
			...t
		};
		if (this.version === 2) {
			if (n.byteSize === 0n) return /* @__PURE__ */ new ArrayBuffer(0);
			let e = n.byteOffset, t = n.byteOffset + n.byteSize - 1n;
			return this._fetchBuffer(this._octreeUrl, {
				...r,
				headers: {
					...r.headers,
					Range: `bytes=${e}-${t}`
				}
			});
		}
		if (this._inlineHierarchy) return this._fetchBuffer(`${this._dataDirUrl}${e}.bin`, r);
		{
			let { hierarchyStepSize: t } = this.metadata, n = e.length - 1, i = ps(e, t);
			return n % t === 0 && !this._loadedChunks.has(e) && (this._loadedChunks.add(e), _s(await this._fetchBuffer(`${this._dataDirUrl}${i}/${e}.hrc`, r), e, this.hierarchy)), this._fetchBuffer(`${this._dataDirUrl}${i}/${e}.bin`, r);
		}
	}
	parsePointData(e, t, n, r) {
		let { attributes: i, scale: a, offset: o } = this.metadata, s = 0, c = i.map((e) => {
			let t = s;
			return s += e.size, t;
		}), l = Math.floor(e.byteLength / s), u = new L((n[0] + r[0]) / 2, (n[1] + r[1]) / 2, (n[2] + r[2]) / 2), d = i.findIndex((e) => e.name === "position"), f = i.findIndex((e) => e.name === "rgb" || e.name === "rgba"), p = i.findIndex((e) => e.name === "intensity"), m = new Float32Array(l * 3), h = f === -1 ? null : new Float32Array(l * 3), g = p === -1 ? null : new Float32Array(l), _ = new DataView(e), v = this.version === 1 ? n : o;
		for (let e = 0; e < l; e++) {
			let t = e * s, n = t + c[d];
			if (m[e * 3] = _.getInt32(n, !0) * a[0] + v[0] - u.x, m[e * 3 + 1] = _.getInt32(n + 4, !0) * a[1] + v[1] - u.y, m[e * 3 + 2] = _.getInt32(n + 8, !0) * a[2] + v[2] - u.z, f !== -1) {
				let n = i[f], r = t + c[f];
				n.type === "uint16" ? (fs.setRGB(_.getUint16(r, !0) / 65535, _.getUint16(r + 2, !0) / 65535, _.getUint16(r + 4, !0) / 65535, we), fs.toArray(h, e * 3)) : (fs.setRGB(_.getUint8(r) / 255, _.getUint8(r + 1) / 255, _.getUint8(r + 2) / 255, we), fs.toArray(h, e * 3));
			}
			if (p !== -1) {
				let n = t + c[p];
				g[e] = _.getUint16(n, !0) / 65535;
			}
		}
		let y = new C();
		return y.setAttribute("position", new S(m, 3)), h && y.setAttribute("color", new S(h, 3)), g && y.setAttribute("intensity", new S(g, 1)), {
			geometry: y,
			center: u
		};
	}
}, Ss = class extends ge {
	get isPointCloudMaterial() {
		return !0;
	}
	get activeNodes() {
		return this.uniforms.uActiveNodes.value;
	}
	set activeNodes(e) {
		let t = this.uniforms.uActiveNodes.value !== null;
		this.uniforms.uActiveNodes.value = e, t !== (e !== null) && this._updateDefines();
	}
	get pointShape() {
		return this._pointShape;
	}
	set pointShape(e) {
		e !== this._pointShape && (this._pointShape = e, this._updateDefines());
	}
	get minPointSize() {
		return this.uniforms.uMinPointSize.value;
	}
	set minPointSize(e) {
		this.uniforms.uMinPointSize.value = e;
	}
	get maxPointSize() {
		return this.uniforms.uMaxPointSize.value;
	}
	set maxPointSize(e) {
		this.uniforms.uMaxPointSize.value = e;
	}
	get edlStrength() {
		return this.uniforms.uEdlStrength.value;
	}
	set edlStrength(e) {
		let t = this.uniforms.uEdlStrength.value > 0;
		this.uniforms.uEdlStrength.value = e, t !== e > 0 && this._updateDefines();
	}
	get edlRadius() {
		return this.uniforms.uEdlRadius.value;
	}
	set edlRadius(e) {
		this.uniforms.uEdlRadius.value = e;
	}
	get debugColorMode() {
		return this._debugColorMode;
	}
	set debugColorMode(e) {
		e !== this._debugColorMode && (this._debugColorMode = e, this._updateDefines());
	}
	constructor(e = {}) {
		let { pointShape: t = "round", minPointSize: n = 2, maxPointSize: r = 50, debugColorMode: i = "none", edlStrength: a = 0, edlRadius: o = 1.4, ...s } = e;
		super(s), this._pointShape = t, this._debugColorMode = i, this.defines = {}, this.uniforms = {
			uActiveNodes: { value: null },
			uNodeSize: { value: 1 },
			uNodeMinOffset: { value: new L() },
			uMinPointSize: { value: n },
			uMaxPointSize: { value: r },
			uTileId: { value: 0 },
			uEdlTexture: { value: null },
			uEdlResolution: { value: new I(1, 1) },
			uEdlStrength: { value: a },
			uEdlRadius: { value: o },
			uEdlDepthPass: { value: !1 }
		}, this._updateDefines(), this.onBeforeCompile = (e) => {
			Object.assign(e.uniforms, this.uniforms), e.vertexShader = e.vertexShader.replace("uniform float size;", "\n						uniform float size;\n						uniform float uMinPointSize;\n						uniform float uMaxPointSize;\n\n						varying vec3 vViewPosition;\n						varying float vRadius;\n						varying float vNodeId;\n						varying float vDepth;\n						varying float vLogDepth;\n\n						#ifdef LOD_SIZING\n\n						uniform usampler2D uActiveNodes;\n						uniform float uNodeSize;\n						uniform vec3 uNodeMinOffset;\n\n						// number of set bits below the given bit index\n						uint numberOfOnes( uint mask, int index ) {\n\n							uint bitsBelow = mask & ( ( 1u << uint( index ) ) - 1u );\n							uint count = 0u;\n							for ( int i = 0; i < 8; i ++ ) {\n\n								count += ( bitsBelow >> uint( i ) ) & 1u;\n\n							}\n\n							return count;\n\n						}\n\n						// Walks the hierarchy texture, returning the deepest active depth (x), an id\n						// for that node (y) and its lod offset (z). The id comes from the octant\n						// path so it stays stable as the texture is re-encoded. Adapted from\n						// \"getLOD\" in potree's pointcloud.vs.\n						vec3 getActiveDepth( vec3 posInNode ) {\n\n							int textureWidth = textureSize( uActiveNodes, 0 ).x;\n							vec3 offset = vec3( 0.0 );\n							int nodeIndex = 0;\n							uint nodePath = 0u;\n							float lodOffset = 0.0;\n							int depth = 0;\n							for ( ; depth < 20; depth ++ ) {\n\n								uvec4 value = texelFetch( uActiveNodes, ivec2( nodeIndex % textureWidth, nodeIndex / textureWidth ), 0 );\n\n								// octant of the current node containing the point\n								float nodeSize = uNodeSize / pow( 2.0, float( depth ) );\n								vec3 index3d = floor( ( posInNode - offset ) / nodeSize + 0.5 );\n								int octant = int( 4.0 * index3d.x + 2.0 * index3d.y + index3d.z );\n								uint octantMask = 1u << uint( octant );\n\n								// stop when the octant holds no active child\n								uint childMask = value.r;\n								if ( ( childMask & octantMask ) == 0u ) {\n\n									lodOffset = float( value.a ) / 10.0 - 10.0;\n									break;\n\n								}\n\n								// child texel: the first child offset plus the active siblings below it\n								nodeIndex += int( value.g * 256u + value.b + numberOfOnes( childMask, octant ) );\n								offset += nodeSize * 0.5 * index3d;\n\n								// offset by one so trailing zeroes still change the id\n								nodePath = nodePath * 8u + uint( octant ) + 1u;\n\n							}\n\n							// kept under 2^24 so the id survives the trip through a float varying\n							return vec3( float( depth ), float( nodePath % 16777216u ), lodOffset );\n\n						}\n\n						#endif\n					").replace("#include <logdepthbuf_vertex>", "\n						vec3 activeResult = vec3( 0.0 );\n						#ifdef LOD_SIZING\n\n							activeResult = getActiveDepth( position + uNodeMinOffset );\n\n						#endif\n\n						float worldSize = size / pow( 2.0, activeResult.x + activeResult.z );\n\n						// three's \"scale\" omits the 1 / tan( fov / 2 ) term, so its attenuation is\n						// not world scale. The projection y scale restores it, as potree does.\n						// Orthographic projections have no distance falloff at all.\n						float projFactor = scale * projectionMatrix[ 1 ][ 1 ];\n						if ( isPerspectiveMatrix( projectionMatrix ) ) {\n\n							projFactor /= - mvPosition.z;\n\n						}\n\n						#ifdef USE_SIZEATTENUATION\n\n							gl_PointSize = worldSize * projFactor;\n							gl_PointSize = max( gl_PointSize, uMinPointSize );\n\n							// a world size point seen from very close covers thousands of pixels and a\n							// cloud of them stalls on fill rate, so the projected size can be capped\n							if ( uMaxPointSize > 0.0 ) {\n\n								gl_PointSize = min( gl_PointSize, uMaxPointSize );\n\n							}\n\n						#else\n\n							// without attenuation \"size\" is in pixels, as PointsMaterial draws it\n							gl_PointSize = max( size, uMinPointSize );\n\n						#endif\n\n						vViewPosition = mvPosition.xyz;\n						vNodeId = activeResult.y;\n						vDepth = activeResult.x;\n\n						// half the world size the sprite covers, including the pixel clamp\n						vRadius = 0.5 * gl_PointSize / projFactor;\n						vLogDepth = log2( - mvPosition.z );\n\n						#include <logdepthbuf_vertex>\n					"), e.fragmentShader = e.fragmentShader.replace("uniform float opacity;", "\n					uniform float opacity;\n					uniform mat4 projectionMatrix;\n					uniform float uTileId;\n\n					varying vec3 vViewPosition;\n					varying float vRadius;\n					varying float vNodeId;\n					varying float vDepth;\n					varying float vLogDepth;\n\n					#ifdef EDL_ENABLED\n\n						uniform sampler2D uEdlTexture;\n						uniform vec2 uEdlResolution;\n						uniform float uEdlStrength;\n						uniform float uEdlRadius;\n						uniform bool uEdlDepthPass;\n\n						// Darken by how far this point sits behind a ring of neighbors in the\n						// pre-pass target. Adapted from potree's \"edl.fs\".\n						float edlShade( float logDepth ) {\n\n							vec2 uv = gl_FragCoord.xy / uEdlResolution;\n							vec2 uvRadius = uEdlRadius / uEdlResolution;\n\n							float sum = 0.0;\n							for ( int i = 0; i < 8; i ++ ) {\n\n								float angle = 6.2831853 * float( i ) / 8.0;\n								vec2 offset = uvRadius * vec2( cos( angle ), sin( angle ) );\n								float neighborDepth = texture2D( uEdlTexture, uv + offset ).r;\n\n								// zero means nothing was drawn there, so it contributes nothing\n								if ( neighborDepth != 0.0 ) {\n\n									sum += max( 0.0, logDepth - neighborDepth );\n\n								}\n\n							}\n\n							return exp( - ( sum / 8.0 ) * 300.0 * uEdlStrength );\n\n						}\n\n					#endif\n\n					// spread sequential ids into visually distinct colors\n					vec3 idToColor( float id ) {\n\n						return vec3(\n							fract( sin( id * 12.9898 ) * 43758.5453 ),\n							fract( sin( id * 78.2330 ) * 12543.2341 ),\n							fract( sin( id * 3.7010 ) * 26445.3450 )\n						);\n\n					}\n					").replace("#include <color_fragment>", "\n					#include <color_fragment>\n\n					#ifdef DEBUG_NODE_COLORS\n\n						diffuseColor.rgb = idToColor( vNodeId + 1.0 );\n\n					#endif\n\n					// the tile the point came from, rather than the node it is sized by\n					#ifdef DEBUG_TILE_COLORS\n\n						diffuseColor.rgb = idToColor( uTileId + 1.0 );\n\n					#endif\n\n					// one hue per level\n					#ifdef DEBUG_DEPTH_COLORS\n\n						float hue = vDepth / 8.0;\n						diffuseColor.rgb = clamp( abs( fract( hue + vec3( 0.0, 2.0 / 3.0, 1.0 / 3.0 ) ) * 6.0 - 3.0 ) - 1.0, 0.0, 1.0 );\n\n					#endif\n					").replace("#include <colorspace_fragment>", "\n					#include <colorspace_fragment>\n\n					#ifdef EDL_ENABLED\n\n						// shade after the color space conversion so the falloff lands on the\n						// encoded color, as potree's post process does\n						gl_FragColor.rgb *= edlShade( vLogDepth );\n\n					#endif\n					").replace("#include <clipping_planes_fragment>", "\n					#include <clipping_planes_fragment>\n\n					#if defined( ROUND_POINTS ) || defined( SPHERE_POINTS )\n\n						vec2 pointOffset = gl_PointCoord * 2.0 - 1.0;\n\n					#endif\n\n					#ifdef ROUND_POINTS\n\n						// discard the sprite corners so points draw as circles\n						if ( dot( pointOffset, pointOffset ) > 1.0 ) discard;\n\n					#endif\n\n					#ifdef SPHERE_POINTS\n\n						// Intersect the view ray with the point's sphere and write that depth so\n						// overlapping points meet as solid spheres rather than flat discs. The\n						// fragment sits on the sprite plane, at the point's depth, so perspective\n						// rays run from the eye through it and orthographic rays run from it.\n						bool isPerspective = isPerspectiveMatrix( projectionMatrix );\n						vec3 spritePosition = vViewPosition + vec3( pointOffset * vRadius, 0.0 );\n						vec3 rayOrigin = isPerspective ? vec3( 0.0 ) : spritePosition;\n						vec3 rayDirection = isPerspective ? normalize( spritePosition ) : vec3( 0.0, 0.0, - 1.0 );\n\n						vec3 centerOffset = rayOrigin - vViewPosition;\n						float halfB = dot( centerOffset, rayDirection );\n						float disc = halfB * halfB - dot( centerOffset, centerOffset ) + vRadius * vRadius;\n						if ( disc < 0.0 ) discard;\n\n						vec3 hitPosition = rayOrigin + rayDirection * ( - halfB - sqrt( disc ) );\n						vec4 clipPosition = projectionMatrix * vec4( hitPosition, 1.0 );\n						gl_FragDepth = ( clipPosition.z / clipPosition.w ) * 0.5 + 0.5;\n\n					#endif\n\n					#ifdef EDL_ENABLED\n\n						// the pre-pass only needs the log depth, so return before the color work\n						if ( uEdlDepthPass ) {\n\n							gl_FragColor = vec4( vLogDepth, 0.0, 0.0, 1.0 );\n							return;\n\n						}\n\n					#endif\n					");
		};
	}
	_updateDefines() {
		let e = {};
		this.uniforms.uActiveNodes.value !== null && (e.LOD_SIZING = ""), this.uniforms.uEdlStrength.value > 0 && (e.EDL_ENABLED = ""), this._pointShape === "round" && (e.ROUND_POINTS = ""), this._pointShape === "sphere" && (e.SPHERE_POINTS = ""), this._debugColorMode === "node" && (e.DEBUG_NODE_COLORS = ""), this._debugColorMode === "depth" && (e.DEBUG_DEPTH_COLORS = ""), this._debugColorMode === "tile" && (e.DEBUG_TILE_COLORS = ""), this.defines = e, this.needsUpdate = !0;
	}
}, Cs = /* @__PURE__ */ new I(), ws = /* @__PURE__ */ new T(), Ts = class extends F {
	constructor(e) {
		let t = new C();
		t.setDrawRange(0, 0), super(t, new le({
			colorWrite: !1,
			depthWrite: !1
		})), this.frustumCulled = !1, this.renderOrder = -Infinity, this.onBeforeRender = e;
	}
	dispose() {
		this.geometry.dispose(), this.material.dispose();
	}
}, Es = class {
	get pointShape() {
		return this._pointShape;
	}
	set pointShape(e) {
		e !== this._pointShape && (this._pointShape = e, this._updateMaterials());
	}
	get minPointSize() {
		return this._minPointSize;
	}
	set minPointSize(e) {
		e !== this._minPointSize && (this._minPointSize = e, this._updateMaterials());
	}
	get maxPointSize() {
		return this._maxPointSize;
	}
	set maxPointSize(e) {
		e !== this._maxPointSize && (this._maxPointSize = e, this._updateMaterials());
	}
	get edlStrength() {
		return this._edlStrength;
	}
	set edlStrength(e) {
		e !== this._edlStrength && (this._edlStrength = e, this._updateMaterials());
	}
	get edlRadius() {
		return this._edlRadius;
	}
	set edlRadius(e) {
		this._edlRadius = e;
	}
	get debugColorMode() {
		return this._debugColorMode;
	}
	set debugColorMode(e) {
		e !== this._debugColorMode && (this._debugColorMode = e, this._updateMaterials());
	}
	constructor(e = {}) {
		let { pointShape: t = "round", minPointSize: n = 2, maxPointSize: r = 50, edlStrength: i = 0, edlRadius: a = 1.4, debugColorMode: o = "none" } = e;
		this.name = "POINT_CLOUD_EFFECTS_PLUGIN", this.tiles = null, this._pointShape = t, this._minPointSize = n, this._maxPointSize = r, this._debugColorMode = o, this._edlStrength = i, this._edlRadius = a, this._edlTarget = new Fe(1, 1, {
			format: Ce,
			type: j,
			minFilter: fe,
			magFilter: fe
		}), this._edlGroup = new ne(), this._edlGroup.matrixWorldAutoUpdate = !1, this._edlHook = new Ts((e, t, n) => this._renderDepthPass(e, n));
	}
	init(e) {
		this.tiles = e, e.group.add(this._edlHook);
	}
	dispose() {
		this._edlHook.removeFromParent(), this._edlHook.dispose(), this._edlTarget.dispose(), this.tiles = null;
	}
	processTileModel(e) {
		e.traverse((e) => {
			if (e.isPoints) {
				if (!e.material.isPointCloudMaterial) {
					let t = e.material;
					e.material = new Ss({
						color: t.color,
						vertexColors: t.vertexColors,
						size: t.size,
						sizeAttenuation: t.sizeAttenuation,
						map: t.map,
						transparent: t.transparent,
						opacity: t.opacity
					}), t.dispose();
				}
				this._applyToMaterial(e.material);
			}
		});
	}
	_renderDepthPass(e, t) {
		if (this.edlStrength <= 0) return;
		let n = this._edlTarget;
		e.getDrawingBufferSize(Cs), (n.width !== Cs.x || n.height !== Cs.y) && n.setSize(Cs.x, Cs.y);
		let r = this._edlGroup.children;
		r.length = 0, this.tiles.group.traverseVisible((e) => {
			if (!e.isPoints || !e.material.isPointCloudMaterial) return;
			r.push(e);
			let { uniforms: t } = e.material;
			t.uEdlTexture.value = null, t.uEdlDepthPass.value = !0;
		});
		let i = e.getRenderTarget(), a = e.getClearAlpha();
		e.getClearColor(ws), e.setRenderTarget(n), e.setClearColor(0, 0), e.clear(), e.render(this._edlGroup, t), e.setRenderTarget(i), e.setClearColor(ws, a), r.forEach((t) => {
			let { uniforms: r } = t.material;
			r.uEdlTexture.value = n.texture, r.uEdlResolution.value.set(n.width, n.height), r.uEdlRadius.value = this.edlRadius * e.getPixelRatio(), r.uEdlDepthPass.value = !1;
		}), r.length = 0;
	}
	_applyToMaterial(e) {
		e.pointShape = this.pointShape, e.minPointSize = this.minPointSize, e.maxPointSize = this.maxPointSize, e.debugColorMode = this.debugColorMode, e.edlStrength = this.edlStrength;
	}
	_updateMaterials() {
		this.tiles && this.tiles.forEachLoadedModel((e) => {
			e.traverse((e) => {
				e.material && e.material.isPointCloudMaterial && this._applyToMaterial(e.material);
			});
		});
	}
}, Ds = 1.7;
function Os(e) {
	return e.split("/").pop().replace(/\.potree$/, "");
}
function ks(e) {
	let t = 0;
	for (let n = 1, r = e.length; n < r; n++) t = (t * 8 + parseInt(e[n]) + 1) % 16777216;
	return t;
}
function As(e, t) {
	return [
		(e[0] + t[0]) / 2,
		(e[1] + t[1]) / 2,
		(e[2] + t[2]) / 2,
		(t[0] - e[0]) / 2,
		0,
		0,
		0,
		(t[1] - e[1]) / 2,
		0,
		0,
		0,
		(t[2] - e[2]) / 2
	];
}
function js(e) {
	let t = new D(new Uint8Array(e * e * 4), e, e, ye, Me);
	return t.internalFormat = "RGBA8UI", t.minFilter = fe, t.magFilter = fe, t;
}
function Ms(e) {
	let [t, n, r, i, , , , a, , , , o] = e;
	return [[
		t - i,
		n - a,
		r - o
	], [
		t + i,
		n + a,
		r + o
	]];
}
var Ns = class extends Es {
	get pointScale() {
		return this._pointScale;
	}
	set pointScale(e) {
		e !== this._pointScale && (this._pointScale = e, this._updateMaterials());
	}
	constructor(e = {}) {
		super(e);
		let { url: t = null, pointScale: n = 1, useRecommendedSettings: r = !0 } = e;
		this.name = "POTREE_PLUGIN", this.priority = -1e3, this.url = t, this.loader = null, this.useRecommendedSettings = r, this._pointScale = n, this._activeNodesTexture = js(1), this._activeSetDirty = !1, this._onUpdateAfter = () => {
			this._activeSetDirty && (this._activeSetDirty = !1, this._updateActiveNodesTexture());
		};
	}
	init(e) {
		super.init(e), this.useRecommendedSettings && (e.errorTarget = 1);
		let t = new xs();
		t.fetchOptions = e.fetchOptions, t.fetchData = (t, n) => e.invokeOnePlugin((e) => e.fetchData && e.fetchData(t, n)), this.loader = t, e.addEventListener("update-after", this._onUpdateAfter);
	}
	dispose() {
		this.tiles.removeEventListener("update-after", this._onUpdateAfter), this._activeNodesTexture.dispose(), super.dispose(), this.loader = null;
	}
	setTileActive() {
		this._activeSetDirty = !0;
	}
	async loadRootTileset() {
		let { tiles: e, url: t, loader: n } = this, r = new URL(t ?? e.rootURL, location.href).href;
		e.invokeAllPlugins((e) => {
			r = e.preprocessURL ? e.preprocessURL(r, null) : r;
		}), await n.load(r);
		let { spacing: i, boundingBox: a } = n.metadata, o = {
			asset: { version: "1.1" },
			geometricError: Infinity,
			root: {
				refine: "ADD",
				geometricError: i,
				boundingVolume: { box: As(a.min, a.max) },
				content: { uri: "r.potree" },
				children: []
			}
		};
		return e.preprocessTileset(o, r.slice(0, r.lastIndexOf("/") + 1)), o;
	}
	fetchData(e, t) {
		return /\.potree$/.test(e) ? this.loader.loadNodeData(Os(e), t) : null;
	}
	parseToMesh(e, t, n, r) {
		if (n !== "potree") return null;
		let i = Os(r), [a, o] = Ms(t.boundingVolume.box), { geometry: s, center: c } = this.loader.parsePointData(e, i, a, o), { spacing: l, boundingBox: u } = this.loader.metadata, d = new Ss({
			vertexColors: !!s.attributes.color,
			size: l * Ds * this.pointScale
		});
		d.activeNodes = this._activeNodesTexture, d.uniforms.uTileId.value = ks(i), d.uniforms.uNodeSize.value = u.max[0] - u.min[0], d.uniforms.uNodeMinOffset.value.copy(c).sub(new L(...u.min));
		let f = new he(s, d);
		return f.position.copy(c), f.updateMatrix(), this._expandChildren(t, i), this._activeSetDirty = !0, f;
	}
	disposeTile(e) {
		let { processNodeQueue: t } = this.tiles;
		for (let n = 0, r = e.children.length; n < r; n++) t.remove(e.children[n]);
		e.children.length = 0, this._activeSetDirty = !0;
	}
	_expandChildren(e, t) {
		let { loader: n } = this, r = n.hierarchy.get(t), [i, a] = Ms(e.boundingVolume.box), o = e.geometricError / 2;
		for (let n = 0; n < 8; n++) {
			let s = t + n;
			if (!(r.childMask & 1 << n)) continue;
			let [c, l] = bs(i, a, n);
			e.children.push({
				refine: "ADD",
				geometricError: o,
				boundingVolume: { box: As(c, l) },
				content: { uri: `${s}.potree` },
				children: []
			});
		}
	}
	_updateActiveNodesTexture() {
		let { tiles: e } = this, t = /* @__PURE__ */ new Map();
		e.activeTiles.forEach((e) => {
			t.set(e, Os(e.content.uri));
		});
		let n = [...t.keys()].sort((e, n) => {
			let r = t.get(e), i = t.get(n);
			return r.length === i.length ? r < i ? -1 : 1 : r.length - i.length;
		}), r = this._activeNodesTexture, i = Math.ceil(Math.sqrt(n.length));
		i > r.image.width && (r.dispose(), r = js(i), this._activeNodesTexture = r, e.forEachLoadedModel((e) => {
			e.material.activeNodes = r;
		}));
		let a = r.image.data;
		a.fill(0);
		let o = /* @__PURE__ */ new Map();
		for (let e = 0, r = n.length; e < r; e++) {
			let r = t.get(n[e]);
			if (o.set(r, e), a[e * 4 + 3] = 100, e === 0) continue;
			let i = r.slice(0, -1), s = o.get(i);
			if (a[s * 4] === 0) {
				let t = e - s;
				a[s * 4 + 1] = t >> 8, a[s * 4 + 2] = t & 255;
			}
			let c = parseInt(r.charAt(r.length - 1));
			a[s * 4] |= 1 << c;
		}
		r.needsUpdate = !0;
	}
	_updateMaterials() {
		super._updateMaterials();
		let { metadata: e } = this.loader ?? {};
		e && this.tiles.forEachLoadedModel((t) => {
			t.material.size = e.spacing * Ds * this.pointScale;
		});
	}
}, Ps = class extends C {
	constructor(e = 1, t = 1, n = 1, r = 1) {
		super();
		let i = n + 1, a = r + 1, o = i * a, s = [];
		for (let e = 0; e < i; e++) s.push(e);
		for (let e = 1; e < a; e++) s.push(e * i + i - 1);
		for (let e = i - 2; e >= 0; e--) s.push((a - 1) * i + e);
		for (let e = a - 2; e >= 1; e--) s.push(e * i);
		let c = s.length, l = o + c, u = new Float32Array(3 * l), d = new Float32Array(3 * l), f = new Float32Array(2 * l);
		for (let o = 0; o < a; o++) for (let a = 0; a < i; a++) {
			let s = o * i + a, c = a / n, l = 1 - o / r;
			u[3 * s + 0] = (c - .5) * e, u[3 * s + 1] = (l - .5) * t, d[3 * s + 2] = 1, f[2 * s + 0] = c, f[2 * s + 1] = l;
		}
		for (let e = 0; e < c; e++) {
			let t = s[e], n = o + e;
			u[3 * n + 0] = u[3 * t + 0], u[3 * n + 1] = u[3 * t + 1], u[3 * n + 2] = u[3 * t + 2], d[3 * n + 2] = 1, f[2 * n + 0] = f[2 * t + 0], f[2 * n + 1] = f[2 * t + 1];
		}
		let p = new Uint32Array(6 * n * r + 6 * c), m = 0;
		for (let e = 0; e < r; e++) for (let t = 0; t < n; t++) {
			let n = e * i + t, r = (e + 1) * i + t, a = (e + 1) * i + t + 1, o = e * i + t + 1;
			p[m++] = n, p[m++] = r, p[m++] = o, p[m++] = r, p[m++] = a, p[m++] = o;
		}
		for (let e = 0; e < c; e++) {
			let t = (e + 1) % c, n = s[e], r = s[t], i = o + e, a = o + t;
			p[m++] = n, p[m++] = r, p[m++] = i, p[m++] = r, p[m++] = a, p[m++] = i;
		}
		this.setIndex(new S(p, 1)), this.setAttribute("position", new S(u, 3)), this.setAttribute("normal", new S(d, 3)), this.setAttribute("uv", new S(f, 2)), this.surfaceVertexCount = o, this.skirtSourceIndices = new Uint32Array(s);
	}
};
// src/three/plugins/images/terrain-rgb/GridCache.js
function Fs(e, t, n) {
	let { width: r, height: i } = e;
	t.width = r, t.height = i;
	let a = t.getContext("2d", { willReadFrequently: !0 });
	a.drawImage(e, 0, 0);
	let { data: o } = a.getImageData(0, 0, r, i);
	a.clearRect(0, 0, r, i);
	let s = r + 2, c = i + 2, l = new Float32Array(s * c);
	for (let e = 0; e < i; e++) for (let t = 0; t < r; t++) {
		let i = 4 * (e * r + t);
		l[(e + 1) * s + t + 1] = n(o[i], o[i + 1], o[i + 2]);
	}
	for (let e = 0; e < s; e++) {
		let t = N.clamp(e, 1, s - 2);
		l[e] = l[s + t], l[(c - 1) * s + e] = l[(c - 2) * s + t];
	}
	for (let e = 1; e < c - 1; e++) l[e * s] = l[e * s + 1], l[e * s + s - 1] = l[e * s + s - 2];
	let u = new D(l, s, c, Ce, j);
	return u.minFilter = ae, u.magFilter = ae, u.needsUpdate = !0, u;
}
function Is(e, t, n, r) {
	let { data: i, width: a, height: o } = e.image, s = t.image.data, c = a - 2, l = o - 2, u = 1, d = a - 2;
	n === -1 ? (u = 0, d = 0) : n === 1 && (u = a - 1, d = a - 1);
	let f = 1, p = o - 2;
	r === -1 ? (f = 0, p = 0) : r === 1 && (f = o - 1, p = o - 1);
	for (let e = f; e <= p; e++) for (let t = u; t <= d; t++) i[e * a + t] = s[(e - r * l) * a + (t - n * c)];
	e.needsUpdate = !0;
}
var Ls = class extends St {
	constructor(e) {
		super(), this.plugin = e, this.canvas = new OffscreenCanvas(1, 1);
	}
	async fetchItem([e, t, n], r) {
		let { plugin: i } = this, a = await i._source.fetchItem([
			e,
			t,
			n
		], r), o = Fs(a.image, this.canvas, (e, t, n) => i.decodeElevation(e, t, n));
		return i._source.disposeItem(a), this.stitchNeighbors(o, e, t, n), o;
	}
	disposeItem(e) {
		e && e.dispose();
	}
	stitchNeighbors(e, t, n, r) {
		let i = this.plugin._source.tiling, { tileCountX: a } = i.getLevel(r), o = i.flipY ? -1 : 1;
		for (let i = -1; i <= 1; i++) for (let s = -1; s <= 1; s++) {
			if (i === 0 && s === 0) continue;
			let c = (t + i + a) % a, l = n + s * o, u = this.get(c, l, r);
			u && !(u instanceof Promise) && (Is(e, u, i, s), Is(u, e, -i, -s));
		}
	}
}, Rs = class extends ue {
	constructor(e) {
		super(e), this.onBeforeCompile = (e) => {
			e.fragmentShader = e.fragmentShader.replace("#include <bumpmap_pars_fragment>", "\n				#ifdef USE_BUMPMAP\n\n					uniform sampler2D bumpMap;\n					uniform float bumpScale;\n\n					// relative determinant threshold below which the geometry is considered edge-on\n					const float DEGENERATE_DET_EPSILON = 1e-3;\n\n					// central differences at one texel spacing so the gradient interpolates across texels\n					vec2 dHdxy_fwd() {\n\n						vec2 dSTdx = dFdx( vBumpMapUv );\n						vec2 dSTdy = dFdy( vBumpMapUv );\n\n						vec2 texelSize = 1.0 / vec2( textureSize( bumpMap, 0 ) );\n						vec2 dx = vec2( texelSize.x, 0.0 );\n						vec2 dy = vec2( 0.0, texelSize.y );\n						float gradU = ( texture2D( bumpMap, vBumpMapUv + dx ).x - texture2D( bumpMap, vBumpMapUv - dx ).x ) / ( 2.0 * texelSize.x );\n						float gradV = ( texture2D( bumpMap, vBumpMapUv + dy ).x - texture2D( bumpMap, vBumpMapUv - dy ).x ) / ( 2.0 * texelSize.y );\n\n						float dBx = bumpScale * ( gradU * dSTdx.x + gradV * dSTdx.y );\n						float dBy = bumpScale * ( gradU * dSTdy.x + gradV * dSTdy.y );\n\n						return vec2( dBx, dBy );\n\n					}\n\n					// unnormalized surface derivatives so the gradient resolves to the physical slope\n					vec3 perturbNormalArb( vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDirection ) {\n\n						vec3 vSigmaX = dFdx( surf_pos.xyz );\n						vec3 vSigmaY = dFdy( surf_pos.xyz );\n						vec3 vN = surf_norm; // normalized\n\n						vec3 R1 = cross( vSigmaY, vN );\n						vec3 R2 = cross( vN, vSigmaX );\n\n						float fDet = dot( vSigmaX, R1 ) * faceDirection;\n\n						// Edge-on geometry, such as the tile skirts, has a degenerate determinant that\n						// amplifies the gradient into a garbage normal, so fall back to the surface normal.\n						if ( abs( fDet ) < DEGENERATE_DET_EPSILON * length( vSigmaX ) * length( vSigmaY ) ) {\n\n							return surf_norm;\n\n						}\n\n						vec3 vGrad = sign( fDet ) * ( dHdxy.x * R1 + dHdxy.y * R2 );\n						return normalize( abs( fDet ) * surf_norm - vGrad );\n\n					}\n\n				#endif\n			");
		};
	}
}, zs = class extends le {
	constructor(e) {
		super(e), this.displacementMap = null, this.displacementScale = 1, this.displacementBias = 0, this.onBeforeCompile = (e) => {
			e.uniforms.displacementMap = { value: null }, e.uniforms.displacementScale = { value: 1 }, e.uniforms.displacementBias = { value: 0 }, e.uniforms.displacementMapTransform = { value: new ce() }, e.vertexShader = e.vertexShader.replace("#include <uv_pars_vertex>", "\n					#include <uv_pars_vertex>\n					uniform sampler2D displacementMap;\n					uniform float displacementScale;\n					uniform float displacementBias;\n				").replace("#include <begin_vertex>", "\n					#include <begin_vertex>\n					transformed += normalize( normal ) * ( texture2D( displacementMap, uv ).x * displacementScale + displacementBias );\n				");
		};
	}
}, Bs = Symbol("TILE_X"), Vs = Symbol("TILE_Y"), Hs = Symbol("TILE_LEVEL"), Us = Symbol("HEIGHT_GRID"), Ws = Symbol("SOURCE_TILE"), Gs = Symbol("OVERLAY_RANGE"), Ks = Symbol("OVERLAY_LEVEL"), qs = Symbol("HEIGHT_RANGE"), Js = 32, Ys = -500, Xs = 9e3, Zs = 2, Q = /* @__PURE__ */ new L(), $ = /* @__PURE__ */ new L(), Qs = /* @__PURE__ */ new De(), $s = [], ec = [0, 0], tc = null;
function nc() {
	return tc === null && (tc = new F(new Ps(1, 1, Js, Js), new le()), tc.matrixAutoUpdate = !1), tc;
}
function rc(e, t) {
	return Math.min(Zs * Math.floor(e / Zs), t);
}
function ic(e, t) {
	let { width: n, height: r } = e.image, i = n - 2, a = r - 2;
	return [
		(t[0] * i + 1) / n,
		(t[1] * a + 1) / r,
		(t[2] * i + 1) / n,
		(t[3] * a + 1) / r
	];
}
function ac(e, t, n) {
	let { data: r, width: i, height: a } = e.image, o = N.clamp(t * i - .5, 0, i - 1), s = N.clamp(n * a - .5, 0, a - 1), c = Math.floor(o), l = Math.floor(s), u = Math.min(c + 1, i - 1), d = Math.min(l + 1, a - 1), f = o - c, p = s - l, m = r[l * i + c] * (1 - f) + r[l * i + u] * f, h = r[d * i + c] * (1 - f) + r[d * i + u] * f;
	return m * (1 - p) + h * p;
}
var oc = class {
	get shape() {
		return console.warn("TerrainRGBMeshPlugin: \"shape\" is deprecated. Use \"projection\" instead."), this.projection === "ellipsoid" ? "ellipsoid" : "planar";
	}
	set shape(e) {
		console.warn("TerrainRGBMeshPlugin: \"shape\" is deprecated. Use \"projection\" instead."), this.projection = e === "planar" ? "source" : "ellipsoid";
	}
	get heightScale() {
		return this._heightScale;
	}
	set heightScale(e) {
		e !== this._heightScale && (this._heightScale = e, this._updateHeightScale());
	}
	constructor(e = {}) {
		let { url: t = null, tileDimension: n = 256, maxZoom: r = 15, heightScale: i = 1, overlay: a = null, applyOverlayTexture: o = !1, unlit: s = !1, shape: c = null, projection: l = null, endCaps: u = !0, useRecommendedSettings: d = !0 } = e;
		this.name = "TERRAIN_RGB_MESH_PLUGIN", this.priority = -10, this.tiles = null, this.url = t, this.tileDimension = n, this.maxZoom = r, this.overlay = a, this.applyOverlayTexture = o, this.unlit = s, this.projection = l ?? "ellipsoid", c !== null && (console.warn("TerrainRGBMeshPlugin: \"shape\" is deprecated. Use \"projection\" instead."), l === null && (this.projection = c === "planar" ? "source" : "ellipsoid")), this.endCaps = u, this.useRecommendedSettings = d, this.heightScale = i, this._source = null, this._gridCache = new Ls(this), this._tiling = null, this._maxSourceLevel = -1;
	}
	init(e) {
		this.useRecommendedSettings && (e.errorTarget = 1), this.tiles = e;
	}
	async loadRootTileset() {
		this.overlay && await this.overlay.init();
		let { url: e, tileDimension: t, maxZoom: n, overlay: r, applyOverlayTexture: i } = this;
		this._maxSourceLevel = Zs * Math.floor(n / Zs);
		let a = this._maxSourceLevel + Zs - 1;
		r && i && (a = Math.max(a, r.tiling.maxLevel)), this._source = new wt({
			url: e,
			tileDimension: t,
			levels: a + 1
		}), this._source.fetchData = (e, t) => {
			let n = { priority: -performance.now() };
			return this.tiles.downloadQueue.add(e, n, () => fetch(e, t), t.signal);
		}, await this._source.init(), this._tiling = this._source.tiling;
		let { projection: o } = this, s = o === "ellipsoid" || o === "source" ? this._tiling.projection : new R(o), [c, l] = s.getProjectedExtents(), u = c / l;
		if (this.projection !== "ellipsoid") {
			let e = new st(s);
			e.scale.set(u, 1), e.offset.set(-u / 2, -.5), this.tiles.surface = e;
		}
		return this.getTileset();
	}
	async parseToMesh(e, t, n, r, i) {
		if (t[Bs] === void 0) return null;
		let a = t[Bs], o = t[Vs], s = t[Hs], c = rc(s, this._maxSourceLevel), l = 2 ** (s - c), u = Math.floor(a / l), d = Math.floor(o / l), f;
		try {
			f = await this._gridCache.lock(u, d, c);
		} catch (e) {
			if (e.name !== "AbortError") throw e;
			return null;
		}
		if (i.aborted) return this._gridCache.release(u, d, c), null;
		t[Us] = f, t[Ws] = [
			u,
			d,
			c
		];
		let p = this._getSubview(t), m = this._createTerrainMesh(t, p), h = f.clone();
		m.material.displacementMap = h, this.unlit || (m.material.bumpMap = h), t.children.forEach((e) => {
			e[qs] || (e[qs] = t[qs], this._updateBoundingVolume(e));
		});
		let { overlay: g, applyOverlayTexture: _ } = this;
		if (g && _) {
			let e = this._tiling.getTileBounds(a, o, s, !0, !1);
			if (g.hasContent(e, s)) {
				try {
					await g.lockTexture(e, s);
				} catch (e) {
					if (e.name !== "AbortError") throw e;
					return this._releaseGrid(t), null;
				}
				if (t[Gs] = e, t[Ks] = s, i.aborted) return g.releaseTexture(e, s), delete t[Gs], delete t[Ks], this._releaseGrid(t), null;
				let [n, r, c, l] = ic(f, p), u = this._tiling.getTileContentUVBounds(a, o, s), d = (u[2] - u[0]) / (c - n), h = (u[3] - u[1]) / (l - r), _ = g.getTexture(e, s).clone();
				_.offset.set(u[0] - n * d, u[1] - r * h), _.repeat.set(d, h), m.material.map = _, m.material.needsUpdate = !0;
			}
		}
		return m.material.displacementScale = this._heightScale, m.material.bumpScale = this._heightScale, m;
	}
	raycastTile(e, t, n, r) {
		let i = e[Us];
		return i ? (t.traverse((e) => {
			if (e.isMesh) {
				let t = nc(), a = e.geometry.attributes.position, o = e.geometry.attributes.normal, s = e.geometry.attributes.uv, c = t.geometry.attributes.position;
				for (let e = 0, t = c.count; e < t; e++) {
					let t = ac(i, s.getX(e), s.getY(e)) * this._heightScale;
					Q.fromBufferAttribute(a, e), $.fromBufferAttribute(o, e), Q.addScaledVector($, t), c.setXYZ(e, Q.x, Q.y, Q.z);
				}
				t.geometry.computeBoundingSphere(), t.matrixWorld.copy(e.matrixWorld), $s.length = 0, t.raycast(n, $s), $s.forEach((t) => {
					t.object = e, r.push(t);
				});
			}
		}), !0) : !1;
	}
	sampleCartographicElevation(e, t) {
		let n = this._tiling;
		if (n === null || !n.projection.isCartographic) return null;
		let { projection: r } = n, [i, a] = r.fromCartographicToNormalized(t, e, ec);
		for (let e = this._maxSourceLevel; e >= 0; e -= Zs) {
			let [t, r] = n.getTileAtPoint(i, a, e, !0), o = this._gridCache.get(t, r, e);
			if (o && !(o instanceof Promise)) {
				let [s, c, l, u] = n.getTileBounds(t, r, e, !0), { width: d, height: f } = o.image, p = (i - s) / (l - s), m = (a - c) / (u - c);
				return ac(o, (p * (d - 2) + 1) / d, (m * (f - 2) + 1) / f) * this._heightScale;
			}
		}
		return null;
	}
	preprocessNode(e) {
		let t = this._tiling.maxLevel;
		e[Hs] < t && e.parent !== null && this.expandChildren(e);
	}
	disposeTile(e) {
		let t = e[Gs];
		this.overlay && t && (this.overlay.releaseTexture(t, e[Ks]), delete e[Gs], delete e[Ks]), this._releaseGrid(e);
	}
	_releaseGrid(e) {
		let t = e[Ws];
		t && (this._gridCache.release(...t), delete e[Ws], delete e[Us]);
	}
	dispose() {
		this.tiles.forEachLoadedModel((e, t) => {
			this.disposeTile(t);
		});
	}
	_getSubview(e) {
		let t = e[Bs], n = e[Vs], r = e[Hs], [i, a, o] = e[Ws], s = this._tiling.getTileBounds(t, n, r, !0), c = this._tiling.getTileBounds(i, a, o, !0), l = 1 / (c[2] - c[0]), u = 1 / (c[3] - c[1]);
		return [
			(s[0] - c[0]) * l,
			(s[1] - c[1]) * u,
			(s[2] - c[0]) * l,
			(s[3] - c[1]) * u
		];
	}
	_createTerrainMesh(e, t) {
		let { tiles: n, endCaps: r, unlit: i, _heightScale: a, _tiling: o } = this, { surface: s } = n, { projection: c } = o, l = e[Hs], u = e[Bs], d = e[Vs], [, f, , p] = o.getTileBounds(u, d, l), [m, h, g, _] = o.getTileBounds(u, d, l, !0, !0), v = e[Us], [y, b, x, S] = ic(v, t), C = new Ps(1, 1, Js, Js), w = new F(C, i ? new zs() : new Rs());
		e.engineData.boundingVolume.getSphere(Qs), w.position.copy(Qs.center);
		let T = r && !(s.projection && s.projection.isMercator), { position: E, normal: D, uv: O } = C.attributes, { surfaceVertexCount: k, skirtSourceIndices: A } = C, ee = Infinity, j = -Infinity;
		for (let e = 0; e < k; e++) {
			let t = e % 33, n = Math.floor(e / 33), r = t / Js, i = 1 - n / Js, a = c.fromNormalizedToCartographic(N.mapLinear(r, 0, 1, m, g), N.mapLinear(i, 0, 1, h, _), ec), o = a[0], l = a[1];
			if (c.isMercator && T && (_ === 1 && i === 1 && (l = Math.PI / 2), h === 0 && i === 0 && (l = -Math.PI / 2)), c.isMercator && i !== 0 && i !== 1) {
				let e = c.fromNormalizedToCartographic(.5, 1, ec)[1], t = 1 / Js, n = N.mapLinear(i - t, 0, 1, f, p), r = N.mapLinear(i + t, 0, 1, f, p);
				l > e && n < e && (l = e), l < -e && r > -e && (l = -e);
			}
			let [u, d] = c.fromCartographicToNormalized(o, l, ec), C = N.mapLinear(u, m, g, 0, 1), w = N.mapLinear(d, h, _, 0, 1), k = N.mapLinear(C, 0, 1, y, x), A = N.mapLinear(w, 0, 1, b, S), M = ac(v, k, A);
			M < ee && (ee = M), M > j && (j = M), s.getCartographicToPosition(l, o, 0, Q).sub(Qs.center), s.getCartographicToNormal(l, o, $), E.setXYZ(e, Q.x, Q.y, Q.z), D.setXYZ(e, $.x, $.y, $.z), O.setXY(e, k, A);
		}
		let M = e.geometricError + (j - ee) * a;
		for (let e = 0, t = A.length; e < t; e++) {
			let t = A[e], n = k + e;
			Q.fromBufferAttribute(E, t), $.fromBufferAttribute(D, t), Q.addScaledVector($, -M), E.setXYZ(n, Q.x, Q.y, Q.z), D.setXYZ(n, $.x, $.y, $.z), O.setXY(n, O.getX(t), O.getY(t));
		}
		return e[qs] = {
			min: ee,
			max: j
		}, this._updateBoundingVolume(e), w;
	}
	_updateBoundingVolume(e) {
		let t = this._heightScale, n = e[Hs] === -1 ? 0 : e.geometricError, r = e[qs], i, a;
		r ? (i = r.min * t - n - (r.max - r.min) * t, a = r.max * t + n) : (i = Ys * t - n, a = Xs * t);
		let { boundingVolume: o, engineData: s } = e;
		if (o.region) {
			let e = o.region;
			e[4] = i, e[5] = a, s && s.boundingVolume && s.boundingVolume.setRegionData(this.tiles.ellipsoid, ...e);
		} else {
			let e = o.box;
			e[2] = (i + a) / 2, e[11] = (a - i) / 2, s && s.boundingVolume && s.boundingVolume.setObbData(e, s.transform);
		}
	}
	_updateHeightScale() {
		let { tiles: e } = this;
		e && (e.forEachLoadedModel((e) => {
			e.traverse((e) => {
				e.isMesh && (e.material.displacementScale = this._heightScale, e.material.bumpScale = this._heightScale);
			});
		}), e.traverse((e) => {
			this._updateBoundingVolume(e);
		}, null, !1));
	}
	getTileset() {
		let { tiles: e, _tiling: t } = this, n = t.minLevel, { tileCountX: r, tileCountY: i } = t.getLevel(n), a = [];
		for (let e = 0; e < r; e++) for (let t = 0; t < i; t++) {
			let r = this.createChild(e, t, n);
			r !== null && a.push(r);
		}
		let o = {
			asset: { version: "1.1" },
			geometricError: Infinity,
			root: {
				refine: "REPLACE",
				geometricError: Infinity,
				boundingVolume: this.createBoundingVolume(0, 0, -1),
				children: a,
				[Hs]: -1,
				[Bs]: 0,
				[Vs]: 0
			}
		};
		return e.preprocessTileset(o, ""), o;
	}
	getUrl(e, t, n) {
		let r = rc(n, this._maxSourceLevel), i = 2 ** (n - r);
		return this._source.getUrl(Math.floor(e / i), Math.floor(t / i), r);
	}
	fetchData() {
		return /* @__PURE__ */ new ArrayBuffer();
	}
	createBoundingVolume(e, t, n, r = 0) {
		let { _tiling: i, endCaps: a, tiles: o } = this, { surface: s } = o, c = n === -1, l = Ys * this.heightScale - r, u = Xs * this.heightScale;
		if (s.isEllipsoid) {
			let r, o;
			return c ? (r = i.getContentBounds(!0), o = i.getContentBounds()) : (r = i.getTileBounds(e, t, n, !0, !0), o = i.getTileBounds(e, t, n, !1, !0)), a && (r[3] === 1 && (o[3] = Math.PI / 2), r[1] === 0 && (o[1] = -Math.PI / 2)), { region: [
				...o,
				l,
				u
			] };
		}
		{
			let r;
			r = c ? i.getContentBounds(!0) : i.getTileBounds(e, t, n, !0);
			let [o, d, f, p] = r, m = N.clamp(i.projection.fromCartographicToNormalized(0, 0, ec)[1], d, p), h = Infinity, g = Infinity, _ = -Infinity, v = -Infinity;
			for (let e of [
				d,
				p,
				m
			]) for (let t of [o, f]) {
				let [n, r] = i.projection.fromNormalizedToCartographic(t, e, ec), o = r;
				a && !s.projection.isMercator && (e === 1 && (o = Math.PI / 2), e === 0 && (o = -Math.PI / 2)), s.getCartographicToPosition(o, n, 0, Q), h = Math.min(h, Q.x), g = Math.min(g, Q.y), _ = Math.max(_, Q.x), v = Math.max(v, Q.y);
			}
			let y = { box: [
				(h + _) / 2,
				(g + v) / 2,
				(l + u) / 2,
				(_ - h) / 2,
				0,
				0,
				0,
				(v - g) / 2,
				0,
				0,
				0,
				(u - l) / 2
			] };
			return y.cartographicRange = c ? i.getContentBounds() : i.getTileBounds(e, t, n), y;
		}
	}
	createChild(e, t, n) {
		let { _tiling: r, tiles: i } = this, { projection: a } = r, { surface: o } = i;
		if (!r.getTileExists(e, t, n)) return null;
		let s;
		if (o.isEllipsoid) {
			let [o, c, l, u] = r.getTileBounds(e, t, n, !0), { tilePixelWidth: d, tilePixelHeight: f } = r.getLevel(n), p = (l - o) / d, m = (u - c) / f, [, h, g, _] = r.getTileBounds(e, t, n), v = h > 0 == _ > 0 ? Math.min(Math.abs(h), Math.abs(_)) : 0, y = a.fromCartographicToNormalized(0, v, ec)[1], [b, x] = a.getDerivativeAtNormalizedPoint(o, y, ec), [S, C] = He(i.ellipsoid, v, g);
			s = Math.max(p * b * S, m * x * C);
		} else {
			let { pixelWidth: e, pixelHeight: t } = r.getLevel(n);
			s = Math.max(o.scale.x / e, o.scale.y / t);
		}
		return {
			refine: "REPLACE",
			geometricError: s,
			boundingVolume: this.createBoundingVolume(e, t, n, s),
			content: { uri: this.getUrl(e, t, n) },
			children: [],
			[Bs]: e,
			[Vs]: t,
			[Hs]: n
		};
	}
	expandChildren(e) {
		let t = e[Hs], n = e[Bs], r = e[Vs], { tileSplitX: i, tileSplitY: a } = this._tiling.getLevel(t);
		for (let o = 0; o < i; o++) for (let s = 0; s < a; s++) {
			let c = this.createChild(i * n + o, a * r + s, t + 1);
			c && e.children.push(c);
		}
	}
	decodeElevation(e, t, n) {
		return -1e4 + (e * 65536 + t * 256 + n) * .1;
	}
}, sc = class extends oc {
	constructor(e = {}) {
		super(e), this.name = "TERRARIUM_MESH_PLUGIN";
	}
	decodeElevation(e, t, n) {
		return e * 256 + t + n / 256 - 32768;
	}
}, cc = null;
function lc() {
	return cc ??= Promise.all([import("@mapbox/vector-tile"), import("pbf")]).then(([{ VectorTile: e }, { default: t }]) => ({
		VectorTile: e,
		Protobuf: t
	}));
}
var uc = {
	earth: {
		fill: "#e2dfda",
		order: 0
	},
	water: {
		fill: "#80deea",
		order: 1
	},
	landcover: {
		fill: "#c4e7d2",
		order: 2
	},
	landuse: {
		fill: "#cfddd5",
		order: 3
	},
	natural: {
		fill: "#e2e0d7",
		order: 4
	},
	buildings: {
		fill: "#cccccc",
		order: 5
	},
	roads: {
		stroke: "#ebebeb",
		order: 6
	},
	transit: {
		stroke: "#a7b1b3",
		order: 7
	},
	boundaries: {
		stroke: "#adadad",
		order: 8
	},
	places: {
		fill: "#5c5c5c",
		order: 9
	},
	pois: {
		fill: "#1a8cbd",
		radius: 3,
		order: 10
	}
}, dc = (e, t) => uc[e] ?? null, fc = class extends St {
	constructor(e = {}) {
		super();
		let { url: t = null, levels: n = 20, projection: r = "EPSG:3857" } = e;
		this.url = t, this.levels = n, this.projectionId = r, this.tiling = new at(), this.fetchData = (...e) => fetch(...e), this.fetchOptions = {};
	}
	init() {
		let { tiling: e, levels: t, url: n, projectionId: r } = this;
		return e.flipY = !/{\s*reverseY|-\s*y\s*}/g.test(n), e.setProjection(new R(r)), e.setContentBounds(...e.projection.getBounds()), Array.isArray(t) ? t.forEach((t, n) => {
			t !== null && e.setLevel(n, {
				tilePixelWidth: 512,
				tilePixelHeight: 512,
				...t
			});
		}) : e.generateLevels(t, e.projection.tileCountX, e.projection.tileCountY, {
			tilePixelWidth: 512,
			tilePixelHeight: 512
		}), Promise.resolve();
	}
	async fetchItem([e, t, n], r) {
		let i = this.getUrl(e, t, n), a = await (await this.fetchData(i, {
			...this.fetchOptions,
			signal: r
		})).arrayBuffer();
		return this._parseVectorTile(a);
	}
	async _parseVectorTile(e) {
		if (!e || e.byteLength === 0) return null;
		let { VectorTile: t, Protobuf: n } = await lc();
		return new t(new n(e));
	}
	disposeItem() {}
	getUrl(e, t, n) {
		return this.url.replace(/{\s*z\s*}/gi, n).replace(/{\s*x\s*}/gi, e).replace(/{\s*(y|reverseY|-\s*y)\s*}/gi, t);
	}
}, pc = class extends qt {
	get tiling() {
		return this._contentCache.tiling;
	}
	get fetchData() {
		return this._contentCache.fetchData;
	}
	set fetchData(e) {
		this._contentCache.fetchData = e;
	}
	get fetchOptions() {
		return this._contentCache.fetchOptions;
	}
	set fetchOptions(e) {
		this._contentCache.fetchOptions = e;
	}
	constructor(e = {}) {
		let { resolution: t = 512, getStyle: n = null, contentCache: r, ...i } = e;
		super(), this.resolution = t, this.getStyle = n, this._canvasRenderer = new Xt({ tileExtent: 4096 }), this._contentCache = r ?? new fc(i);
	}
	init() {
		return this._contentCache.init();
	}
	hasContent(e, t, n, r, i) {
		let a = 0;
		return Dt([
			e,
			t,
			n,
			r
		], i, this._contentCache.tiling, () => a++), a > 0;
	}
	async fetchItem([e, t, n, r, i], a) {
		let { resolution: o, _contentCache: s } = this, c = document.createElement("canvas");
		c.width = o, c.height = o;
		let l = [
			e,
			t,
			n,
			r
		], u = [];
		Dt(l, i, s.tiling, (e, t, n) => {
			u.push(s.lock(e, t, n));
		}), await Promise.all(u), a?.throwIfAborted(), this._drawToCanvas(c, l, i);
		let d = new w(c);
		return d.colorSpace = we, d.generateMipmaps = !1, d.needsUpdate = !0, d;
	}
	disposeItem(e, [t, n, r, i, a]) {
		Dt([
			t,
			n,
			r,
			i
		], a, this._contentCache.tiling, (e, t, n) => {
			this._contentCache.release(e, t, n);
		}), e && e.dispose();
	}
	redraw(...e) {
		let [t, n, r, i, a] = e, o = this.get(t, n, r, i, a);
		o && (this._drawToCanvas(o.image, [
			t,
			n,
			r,
			i
		], a), o.needsUpdate = !0);
	}
	dispose() {
		super.dispose(), this._contentCache.dispose();
	}
	_drawToCanvas(e, t, n) {
		let { _contentCache: r, _canvasRenderer: i } = this, a = e.getContext("2d");
		Dt(t, n, r.tiling, (e, n, o) => {
			let s = r.tiling.getTileBounds(e, n, o, !0, !1);
			i.setFrame(a, s, t);
			let c = r.get(e, n, o);
			c && this._renderVectorTile(c);
		});
	}
	_renderVectorTile(e) {
		let { _canvasRenderer: t } = this, n = this.getStyle || dc, r = [...Object.keys(e.layers)].sort((e, t) => {
			let r = n(e, null)?.order ?? Xt.DEFAULT_STYLE.order, i = n(t, null)?.order ?? Xt.DEFAULT_STYLE.order;
			return r === i ? e.localeCompare(t) : r - i;
		});
		for (let i of r) {
			let r = e.layers[i];
			for (let e = 0; e < r.length; e++) {
				let a = r.feature(e), { properties: o, type: s } = a, c = n(i, o);
				t.setStyle(c);
				let l = a.loadGeometry();
				s === 1 ? t._renderPoints(l) : s === 2 ? t._renderLines(l) : s === 3 && t._renderPolygons(l);
			}
		}
	}
}, mc = Math.PI / 180, hc = null;
function gc() {
	return hc ??= import("pmtiles").then((e) => e.PMTiles);
}
var _c = class extends Ct {
	constructor(e, t) {
		super(), this.instance = e, this.tiling = t;
	}
	async fetchItem([e, t, n], r) {
		let i = await this.instance.getZxy(n, e, t, r);
		return !i || !i.data || i.data.byteLength === 0 ? null : this.processBufferToTexture(i.data);
	}
}, vc = class extends fc {
	constructor(e = {}) {
		super(e), this.instance = null, this.tileType = 1;
	}
	async init() {
		let { tiling: e } = this, t = await gc();
		this.instance = new t({
			getKey: () => this.url,
			getBytes: async (e, t, n) => {
				n && n.throwIfAborted();
				let { fetchOptions: r, url: i } = this, a = await this.fetchData(i, {
					...r,
					signal: n,
					headers: {
						...r.headers,
						range: `bytes=${e}-${e + t - 1}`
					}
				});
				if (!a.ok) throw Error(`PMTilesImageSource: Bad response code: ${a.status}`);
				if (a.status !== 206) throw Error("PMTilesImageSource: Server does not support HTTP Byte Serving.");
				return {
					data: await a.arrayBuffer(),
					etag: a.headers.get("ETag"),
					cacheControl: a.headers.get("Cache-Control"),
					expires: a.headers.get("Expires")
				};
			}
		});
		let n = await this.instance.getHeader();
		this.tileType = n.tileType;
		let r = new R("EPSG:3857");
		e.flipY = !0, e.setProjection(r), e.setContentBounds(mc * n.minLon, mc * n.minLat, mc * n.maxLon, mc * n.maxLat), e.generateLevels(n.maxZoom + 1, r.tileCountX, r.tileCountY, {
			tilePixelWidth: 512,
			tilePixelHeight: 512,
			minLevel: n.minZoom
		});
	}
	async fetchItem([e, t, n], r) {
		let i = await this.instance.getZxy(n, e, t, r);
		return this._parseVectorTile(i ? i.data : null);
	}
}, yc = class extends qt {
	get tiling() {
		return this._contentCache.tiling;
	}
	get fetchData() {
		return this._contentCache.fetchData;
	}
	set fetchData(e) {
		this._contentCache.fetchData = e;
	}
	get resolution() {
		return this._resolution;
	}
	set resolution(e) {
		this._resolution = e, this._deferredSource && (this._deferredSource.resolution = e);
	}
	get fetchOptions() {
		return this._contentCache.fetchOptions;
	}
	set fetchOptions(e) {
		this._contentCache.fetchOptions = e;
	}
	constructor(e = {}) {
		super();
		let { resolution: t = 512, getStyle: n = null } = e;
		this._resolution = t, this._getStyle = n, this._contentCache = new vc(e), this._deferredSource = null, this.isVectorTile = !1;
	}
	async init() {
		await this._contentCache.init();
		let { _contentCache: e } = this;
		if (this.isVectorTile = e.tileType === 1, this.isVectorTile) this._deferredSource = new pc({
			resolution: this._resolution,
			getStyle: this._getStyle,
			contentCache: e
		});
		else {
			let t = new _c(e.instance, e.tiling);
			this._deferredSource = new Jt(t), this._deferredSource.resolution = this._resolution;
		}
	}
	hasContent(e, t, n, r, i) {
		return this._deferredSource.hasContent(e, t, n, r, i);
	}
	lock(...e) {
		return this._deferredSource.lock(...e);
	}
	release(...e) {
		this._deferredSource.release(...e);
	}
	get(...e) {
		return this._deferredSource.get(...e);
	}
	redraw(...e) {
		this._deferredSource instanceof pc && this._deferredSource.redraw(...e);
	}
	forEachItem(...e) {
		return this._deferredSource.forEachItem(...e);
	}
	dispose() {
		super.dispose(), this._contentCache.dispose(), this._deferredSource && this._deferredSource.dispose();
	}
}, bc = class extends gn {
	get tiling() {
		return this.imageSource.tiling;
	}
	get projection() {
		return this.tiling.projection;
	}
	get aspectRatio() {
		return this.tiling && this.isReady ? this.tiling.aspectRatio : 1;
	}
	get fetchOptions() {
		return this.imageSource.fetchOptions;
	}
	set fetchOptions(e) {
		this.imageSource.fetchOptions = e;
	}
	get resolution() {
		return this.imageSource.resolution;
	}
	constructor(e = {}) {
		super(e), this.imageSource = e.imageSource ?? new pc(e), this._redrawQueue = new t(), this._redrawQueue.maxJobs = 4, this._redrawQueue.priorityCallback = () => 0;
	}
	_init() {
		return this.imageSource.fetchData = (...e) => this.fetch(...e), this.imageSource.init();
	}
	calculateLevel(e, t = this.resolution) {
		let [n, r, i, a] = e, o = i - n, s = a - r, c = this.tiling.maxLevel, l = 0;
		for (; l < c; l++) {
			let e = this.tiling.getLevel(l);
			if (e == null) continue;
			let { pixelWidth: n, pixelHeight: r } = e;
			if (n >= t / o || r >= t / s) break;
		}
		return l;
	}
	hasContent(e, t = this.calculateLevel(e)) {
		return this.imageSource.hasContent(...e, t);
	}
	getTexture(e, t = this.calculateLevel(e)) {
		return this.imageSource.get(...e, t);
	}
	lockTexture(e, t = this.calculateLevel(e)) {
		return this.imageSource.lock(...e, t);
	}
	releaseTexture(e, t = this.calculateLevel(e)) {
		this.imageSource.release(...e, t);
	}
	setResolution(e) {
		this.imageSource.resolution = e;
	}
	shouldSplit(e) {
		return !0;
	}
	setRegionVisible(e, t) {
		if (super.setRegionVisible(e, t), t) {
			let { _redrawQueue: t } = this, n = e.join("_") + "_" + this.calculateLevel(e);
			t.has(n) && t.flush(n);
		}
	}
	redraw() {
		let { imageSource: e, _redrawQueue: t, _visibleRegionCounts: n } = this;
		for (let { range: t } of n.values()) e.redraw(...t, this.calculateLevel(t));
		e.forEachItem((r, i) => {
			let a = i.join("_");
			!n.has(a) && !t.has(a) && t.add(a, () => {
				e.redraw(...i);
			});
		});
	}
}, xc = class extends bc {
	constructor(e = {}) {
		super({
			...e,
			imageSource: new yc(e)
		});
	}
	shouldSplit(e) {
		return this.imageSource.isVectorTile ? !0 : this.tiling.maxLevel > this.calculateLevel(e);
	}
}, Sc = e * Math.PI * 2, Cc = /* @__PURE__ */ new R("EPSG:3857");
function wc(e) {
	return /:4326$/i.test(e);
}
function Tc(e) {
	return /:3857$/i.test(e);
}
function Ec(e) {
	return e.trim().split(/\s+/).map((e) => parseFloat(e));
}
function Dc(e, t) {
	wc(t) && ([e[1], e[0]] = [e[0], e[1]]);
}
function Oc(e, t) {
	if (Tc(t)) return Cc.fromNormalizedToCartographic(.5 + e[0] / Sc, .5 + e[1] / Sc, e), e[0] *= N.RAD2DEG, e[1] *= N.RAD2DEG, e;
}
function kc(e) {
	e[0] *= N.DEG2RAD, e[1] *= N.DEG2RAD;
}
var Ac = class extends i {
	parse(e) {
		let t = new TextDecoder("utf-8").decode(new Uint8Array(e)), n = new DOMParser().parseFromString(t, "text/xml"), r = n.querySelector("Contents"), i = zc(r, "TileMatrixSet").map((e) => Lc(e)), a = zc(r, "Layer").map((e) => Mc(e)), o = jc(n.querySelector("ServiceIdentification"));
		return a.forEach((e) => {
			e.tileMatrixSets = e.tileMatrixSetLinks.map((e) => i.find((t) => t.identifier === e));
		}), {
			serviceIdentification: o,
			tileMatrixSets: i,
			layers: a
		};
	}
};
function jc(e) {
	return {
		title: e.querySelector("Title").textContent,
		abstract: e.querySelector("Abstract")?.textContent || "",
		serviceType: e.querySelector("ServiceType").textContent,
		serviceTypeVersion: e.querySelector("ServiceTypeVersion").textContent
	};
}
function Mc(e) {
	let t = e.querySelector("Title").textContent, n = e.querySelector("Identifier").textContent, r = e.querySelector("Format").textContent, i = zc(e, "ResourceURL").map((e) => Nc(e)), a = zc(e, "TileMatrixSetLink").map((e) => zc(e, "TileMatrixSet")[0].textContent), o = zc(e, "Style").map((e) => Ic(e)), s = zc(e, "Dimension").map((e) => Pc(e)), c = Fc(e.querySelector("WGS84BoundingBox"));
	return c ||= Fc(e.querySelector("BoundingBox")), {
		title: t,
		identifier: n,
		format: r,
		dimensions: s,
		tileMatrixSetLinks: a,
		styles: o,
		boundingBox: c,
		resourceUrls: i
	};
}
function Nc(e) {
	return {
		template: e.getAttribute("template"),
		format: e.getAttribute("format"),
		resourceType: e.getAttribute("resourceType")
	};
}
function Pc(e) {
	return {
		identifier: e.querySelector("Identifier").textContent,
		uom: e.querySelector("UOM")?.textContent || "",
		defaultValue: e.querySelector("Default").textContent,
		current: e.querySelector("Current")?.textContent === "true",
		values: zc(e, "Value").map((e) => e.textContent)
	};
}
function Fc(e) {
	if (!e) return null;
	let t = e.nodeName.endsWith("WGS84BoundingBox") ? "urn:ogc:def:crs:CRS::84" : e.getAttribute("crs"), n = Ec(e.querySelector("LowerCorner").textContent), r = Ec(e.querySelector("UpperCorner").textContent);
	return Dc(n, t), Dc(r, t), Oc(n, t), Oc(r, t), kc(n), kc(r), {
		crs: t,
		lowerCorner: n,
		upperCorner: r,
		bounds: [...n, ...r]
	};
}
function Ic(e) {
	return {
		title: e.querySelector("Title")?.textContent || null,
		identifier: e.querySelector("Identifier").textContent,
		isDefault: e.getAttribute("isDefault") === "true"
	};
}
function Lc(e) {
	let t = e.querySelector("SupportedCRS").textContent, n = e.querySelector("Title")?.textContent || "", r = e.querySelector("Identifier").textContent, i = e.querySelector("Abstract")?.textContent || "", a = [];
	return e.querySelectorAll("TileMatrix").forEach((e, n) => {
		let r = Rc(e), i = 28e-5 * r.scaleDenominator, o = r.tileWidth * r.matrixWidth * i, s = r.tileHeight * r.matrixHeight * i, c;
		Dc(r.topLeftCorner, t), c = Tc(t) ? [r.topLeftCorner[0] + o, r.topLeftCorner[1] - s] : [r.topLeftCorner[0] + 360 * o / Sc, r.topLeftCorner[1] - 360 * s / Sc], Oc(c, t), Oc(r.topLeftCorner, t), kc(c), kc(r.topLeftCorner), r.bounds = [...r.topLeftCorner, ...c], [r.bounds[1], r.bounds[3]] = [r.bounds[3], r.bounds[1]], a.push(r);
	}), {
		title: n,
		identifier: r,
		abstract: i,
		supportedCRS: t,
		tileMatrices: a
	};
}
function Rc(e) {
	return {
		identifier: e.querySelector("Identifier").textContent,
		tileWidth: parseFloat(e.querySelector("TileWidth").textContent),
		tileHeight: parseFloat(e.querySelector("TileHeight").textContent),
		matrixWidth: parseFloat(e.querySelector("MatrixWidth").textContent),
		matrixHeight: parseFloat(e.querySelector("MatrixHeight").textContent),
		scaleDenominator: parseFloat(e.querySelector("ScaleDenominator").textContent),
		topLeftCorner: Ec(e.querySelector("TopLeftCorner").textContent),
		bounds: null
	};
}
function zc(e, t) {
	return [...e.children].filter((e) => e.tagName === t);
}
// src/three/plugins/loaders/WMSCapabilitiesLoader.js
var Bc = e * Math.PI * 2, Vc = /* @__PURE__ */ new R("EPSG:3857");
function Hc(e) {
	return /:4326$/i.test(e);
}
function Uc(e) {
	return /:3857$/i.test(e);
}
function Wc(e, t) {
	return Uc(t) && (Vc.fromNormalizedToCartographic(.5 + e[0] / (Math.PI * 2 * Bc), .5 + e[1] / (Math.PI * 2 * Bc), e), e[0] *= N.RAD2DEG, e[1] *= N.RAD2DEG), e;
}
function Gc(e, t, n) {
	let [r, i] = n.split(".").map((e) => parseInt(e)), a = r === 1 && i < 3 || r < 1;
	Hc(t) && a && ([e[0], e[1]] = [e[1], e[0]]);
}
function Kc(e) {
	e[0] *= N.DEG2RAD, e[1] *= N.DEG2RAD;
}
function qc(e, t) {
	if (!e) return null;
	let n = e.getAttribute("CRS") || e.getAttribute("crs") || e.getAttribute("SRS") || "", r = parseFloat(e.getAttribute("minx")), i = parseFloat(e.getAttribute("miny")), a = parseFloat(e.getAttribute("maxx")), o = parseFloat(e.getAttribute("maxy")), s = [r, i], c = [a, o];
	return Gc(s, n, t), Gc(c, n, t), Wc(s, n), Wc(c, n), Kc(s), Kc(c), {
		crs: n,
		bounds: [...s, ...c]
	};
}
function Jc(e) {
	let t = parseFloat(e.querySelector("westBoundLongitude").textContent), n = parseFloat(e.querySelector("eastBoundLongitude").textContent), r = parseFloat(e.querySelector("southBoundLatitude").textContent), i = parseFloat(e.querySelector("northBoundLatitude").textContent), a = [t, r], o = [n, i];
	return Kc(a), Kc(o), [...a, ...o];
}
function Yc(e) {
	let t = parseFloat(e.getAttribute("minx").textContent), n = parseFloat(e.getAttribute("maxx").textContent), r = parseFloat(e.getAttribute("miny").textContent), i = parseFloat(e.getAttribute("maxy").textContent), a = [t, r], o = [n, i];
	return Kc(a), Kc(o), [...a, ...o];
}
function Xc(e) {
	return {
		name: e.querySelector("Name").textContent,
		title: e.querySelector("Title").textContent,
		legends: [...e.querySelectorAll("LegendURL")].map((e) => ({
			width: parseInt(e.getAttribute("width")),
			height: parseInt(e.getAttribute("height")),
			format: e.querySelector("Format").textContent,
			url: $c(e.querySelector("OnlineResource"))
		}))
	};
}
function Zc(e, t, n = {}) {
	let { styles: r = [], crs: i = [], contentBoundingBox: a = null, queryable: o = !1, opaque: s = !1 } = n, c = e.querySelector(":scope > Name")?.textContent || null, l = e.querySelector(":scope > Title")?.textContent || "", u = e.querySelector(":scope > Abstract")?.textContent || "", d = [...e.querySelectorAll(":scope > Keyword")].map((e) => e.textContent), f = [...e.querySelectorAll(":scope > BoundingBox")].map((e) => qc(e, t));
	i = [...i, ...Array.from(e.querySelectorAll("CRS")).map((e) => e.textContent)], r = [...r, ...Array.from(e.querySelectorAll(":scope > Style")).map((e) => Xc(e))], e.hasAttribute("queryable") && (o = e.getAttribute("queryable") === "1"), e.hasAttribute("opaque") && (s = e.getAttribute("opaque") === "1"), e.querySelector("EX_GeographicBoundingBox") ? a = Jc(e.querySelector("EX_GeographicBoundingBox")) : e.querySelector("LatLonBoundingBox") && (a = Yc(e.querySelector("LatLonBoundingBox")));
	let p = Array.from(e.querySelectorAll(":scope > Layer")).map((e) => Zc(e, t, {
		styles: r,
		crs: i,
		contentBoundingBox: a,
		queryable: o,
		opaque: s
	}));
	return {
		name: c,
		title: l,
		abstract: u,
		queryable: o,
		opaque: s,
		keywords: d,
		crs: i,
		boundingBoxes: f,
		contentBoundingBox: a,
		styles: r,
		subLayers: p
	};
}
function Qc(e) {
	return {
		name: e.querySelector("Name")?.textContent || "",
		title: e.querySelector("Title")?.textContent || "",
		abstract: e.querySelector("Abstract")?.textContent || "",
		keywords: Array.from(e.querySelectorAll("Keyword")).map((e) => e.textContent),
		maxWidth: parseFloat(e.querySelector("MaxWidth")) || null,
		maxHeight: parseFloat(e.querySelector("MaxHeight")) || null,
		layerLimit: parseFloat(e.querySelector("LayerLimit")) || null
	};
}
function $c(e) {
	return e ? (e.getAttribute("xlink:href") || e.getAttributeNS("http://www.w3.org/1999/xlink", "href") || "").trim() : "";
}
function el(e) {
	let t = Array.from(e.querySelectorAll("Format")).map((e) => e.textContent.trim()), n = Array.from(e.querySelectorAll("DCPType")).map((e) => {
		let t = e.querySelector("HTTP"), n = t.querySelector("Get OnlineResource") || t.querySelector("Get > OnlineResource") || t.querySelector("Get"), r = t.querySelector("Post OnlineResource") || t.querySelector("Post > OnlineResource") || t.querySelector("Post");
		return {
			type: "HTTP",
			get: $c(n),
			post: $c(r)
		};
	});
	return {
		formats: t,
		dcp: n,
		href: n[0].get
	};
}
function tl(e) {
	let t = {};
	return Array.from(e.querySelectorAll(":scope > *")).forEach((e) => {
		let n = e.localName;
		t[n] = el(e);
	}), t;
}
function nl(e, t = []) {
	return e.forEach((e) => {
		e.name !== null && t.push(e), nl(e.subLayers, t);
	}), t;
}
var rl = class extends i {
	parse(e) {
		let t = new TextDecoder("utf-8").decode(new Uint8Array(e)), n = new DOMParser().parseFromString(t, "text/xml"), r = (n.querySelector("WMS_Capabilities") || n.querySelector("WMT_MS_Capabilities")).getAttribute("version"), i = n.querySelector("Capability"), a = Qc(n.querySelector(":scope > Service")), o = tl(i.querySelector(":scope > Request"));
		return {
			version: r,
			service: a,
			layers: nl(Array.from(i.querySelectorAll(":scope > Layer")).map((e) => Zc(e, r))),
			request: o
		};
	}
};
export { ni as A, bn as B, Hi as C, oi as D, si as E, nr as F, _n as G, gn as H, er as I, vn as J, xn as K, $n as L, Jr as M, Wr as N, ii as O, or as P, lt as Q, wn as R, Gi as S, bi as T, hn as U, Tn as V, Cn as W, ut as X, yt as Y, ct as Z, Oa as _, sc as a, qi as b, Es as c, ds as d, rs as f, Go as g, qo as h, xc as i, $r as j, ri as k, us as l, es as m, Ac as n, oc as o, ts as p, Sn as q, bc as r, Ns as s, rl as t, cs as u, Wi as v, Mi as w, Ki as x, Ui as y, yn as z };

//# sourceMappingURL=plugins-CxolAqBM.js.map