/* ==========================================================================
 * 01-util.js — math helpers, seeded noise, keyframe interpolation,
 * geometry merging and canvas texture helpers. No scene knowledge here.
 * ========================================================================== */
const U = (() => {
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const lerp = (a, b, t) => a + (b - a) * t;
  const invLerp = (a, b, x) => clamp((x - a) / (b - a), 0, 1);
  const smoothstep = (a, b, x) => {
    const t = clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };
  const smootherstep = (a, b, x) => {
    const t = clamp((x - a) / (b - a), 0, 1);
    return t * t * t * (t * (t * 6 - 15) + 10);
  };
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const easeSine = (t) => 0.5 - 0.5 * Math.cos(Math.PI * clamp(t, 0, 1));
  const easeOut = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
  const easeIn = (t) => Math.pow(clamp(t, 0, 1), 3);
  const DEG = Math.PI / 180;
  const fract = (x) => x - Math.floor(x);

  // Smooth maximum / minimum (polynomial), k = blend width in value units.
  const smax = (a, b, k) => {
    const h = clamp(0.5 + (0.5 * (a - b)) / k, 0, 1);
    return lerp(b, a, h) + k * h * (1 - h);
  };
  const smin = (a, b, k) => -smax(-a, -b, k);

  // Mulberry32 seeded RNG.
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const hash2 = (x, y) => {
    let h = (x * 374761393 + y * 668265263) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };

  // ---- 2D simplex noise (Gustavson), seeded permutation --------------------
  function makeSimplex(seed) {
    const r = rng(seed);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      const t = p[i];
      p[i] = p[j];
      p[j] = t;
    }
    const perm = new Uint8Array(512);
    const pm12 = new Uint8Array(512);
    for (let i = 0; i < 512; i++) {
      perm[i] = p[i & 255];
      pm12[i] = perm[i] % 12;
    }
    const gx = [1, -1, 1, -1, 1, -1, 1, -1, 0, 0, 0, 0];
    const gy = [1, 1, -1, -1, 0, 0, 0, 0, 1, -1, 1, -1];
    const F2 = 0.5 * (Math.sqrt(3) - 1);
    const G2 = (3 - Math.sqrt(3)) / 6;
    return function noise2(xin, yin) {
      const s = (xin + yin) * F2;
      const i = Math.floor(xin + s);
      const j = Math.floor(yin + s);
      const t = (i + j) * G2;
      const x0 = xin - (i - t);
      const y0 = yin - (j - t);
      const i1 = x0 > y0 ? 1 : 0;
      const j1 = x0 > y0 ? 0 : 1;
      const x1 = x0 - i1 + G2;
      const y1 = y0 - j1 + G2;
      const x2 = x0 - 1 + 2 * G2;
      const y2 = y0 - 1 + 2 * G2;
      const ii = i & 255;
      const jj = j & 255;
      let n0 = 0, n1 = 0, n2 = 0;
      let t0 = 0.5 - x0 * x0 - y0 * y0;
      if (t0 > 0) {
        const g = pm12[ii + perm[jj]];
        t0 *= t0;
        n0 = t0 * t0 * (gx[g] * x0 + gy[g] * y0);
      }
      let t1 = 0.5 - x1 * x1 - y1 * y1;
      if (t1 > 0) {
        const g = pm12[ii + i1 + perm[jj + j1]];
        t1 *= t1;
        n1 = t1 * t1 * (gx[g] * x1 + gy[g] * y1);
      }
      let t2 = 0.5 - x2 * x2 - y2 * y2;
      if (t2 > 0) {
        const g = pm12[ii + 1 + perm[jj + 1]];
        t2 *= t2;
        n2 = t2 * t2 * (gx[g] * x2 + gy[g] * y2);
      }
      return 70 * (n0 + n1 + n2); // ~[-1, 1]
    };
  }
  const noiseA = makeSimplex(1729);
  const noiseB = makeSimplex(4271);
  const noiseC = makeSimplex(9137);

  function fbm(n, x, y, oct, lac = 2.03, gain = 0.5) {
    let a = 1, f = 1, s = 0, norm = 0;
    for (let i = 0; i < oct; i++) {
      s += a * n(x * f, y * f);
      norm += a;
      a *= gain;
      f *= lac;
    }
    return s / norm;
  }
  // Ridged multifractal: sharp crests, suited to mountain ridgelines.
  function ridged(n, x, y, oct, lac = 2.1, gain = 0.52) {
    let a = 1, f = 1, s = 0, norm = 0, w = 1;
    for (let i = 0; i < oct; i++) {
      let v = 1 - Math.abs(n(x * f, y * f));
      v *= v;
      v *= w;
      w = clamp(v * 1.6, 0, 1);
      s += a * v;
      norm += a;
      a *= gain;
      f *= lac;
    }
    return s / norm;
  }

  // ---- Keyframe interpolation (cubic Hermite, Catmull-Rom tangents) -------
  // keys: [{t, v:[...]}], returns array. Ends have zero velocity (ease).
  function hermiteKeys(keys, t, out) {
    const n = keys.length;
    const dim = keys[0].v.length;
    out = out || new Array(dim);
    if (t <= keys[0].t) {
      for (let d = 0; d < dim; d++) out[d] = keys[0].v[d];
      return out;
    }
    if (t >= keys[n - 1].t) {
      for (let d = 0; d < dim; d++) out[d] = keys[n - 1].v[d];
      return out;
    }
    let i = 0;
    while (i < n - 2 && t > keys[i + 1].t) i++;
    const k0 = keys[i], k1 = keys[i + 1];
    const dt = k1.t - k0.t;
    const s = (t - k0.t) / dt;
    const s2 = s * s, s3 = s2 * s;
    const h00 = 2 * s3 - 3 * s2 + 1, h10 = s3 - 2 * s2 + s, h01 = -2 * s3 + 3 * s2, h11 = s3 - s2;
    for (let d = 0; d < dim; d++) {
      const m0 = tangent(keys, i, d) * dt;
      const m1 = tangent(keys, i + 1, d) * dt;
      out[d] = h00 * k0.v[d] + h10 * m0 + h01 * k1.v[d] + h11 * m1;
    }
    return out;
  }
  function tangent(keys, i, d) {
    const n = keys.length;
    const k = keys[i];
    if (k.hold || i === 0 || i === n - 1) return 0; // ease in/out at ends or hold keys
    const a = keys[i - 1], b = keys[i + 1];
    // Catmull-Rom tangent, limited to avoid overshoot on uneven spacing
    const m = (b.v[d] - a.v[d]) / (b.t - a.t);
    const m0 = (k.v[d] - a.v[d]) / (k.t - a.t);
    const m1 = (b.v[d] - k.v[d]) / (b.t - k.t);
    if (m0 * m1 <= 0 && k.mono) return 0;
    return m;
  }
  // Piecewise linear with smoothstep on each segment (for scalars like sun elevation)
  function smoothKeys(keys, t) {
    if (t <= keys[0][0]) return keys[0][1];
    for (let i = 0; i < keys.length - 1; i++) {
      const a = keys[i], b = keys[i + 1];
      if (t <= b[0]) return lerp(a[1], b[1], easeSine((t - a[0]) / (b[0] - a[0])));
    }
    return keys[keys.length - 1][1];
  }
  function linearKeys(keys, t) {
    if (t <= keys[0][0]) return keys[0][1];
    for (let i = 0; i < keys.length - 1; i++) {
      const a = keys[i], b = keys[i + 1];
      if (t <= b[0]) return lerp(a[1], b[1], (t - a[0]) / (b[0] - a[0]));
    }
    return keys[keys.length - 1][1];
  }

  // Polyline with arc-length parameterisation (3D points [x,y,z]).
  function polyline(points) {
    const cum = [0];
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i];
      cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]));
    }
    const length = cum[cum.length - 1];
    function at(dist, out) {
      out = out || [0, 0, 0];
      dist = clamp(dist, 0, length);
      let i = 1;
      while (i < cum.length - 1 && cum[i] < dist) i++;
      const a = points[i - 1], b = points[i];
      const seg = cum[i] - cum[i - 1] || 1;
      const f = (dist - cum[i - 1]) / seg;
      out[0] = lerp(a[0], b[0], f);
      out[1] = lerp(a[1], b[1], f);
      out[2] = lerp(a[2], b[2], f);
      return out;
    }
    function dirAt(dist) {
      const e = 0.6;
      const a = at(Math.max(0, dist - e)), b = at(Math.min(length, dist + e));
      return [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    }
    return { points, cum, length, at, dirAt };
  }

  // Smooth a polyline corner-cutting (Chaikin) for natural walking paths.
  function chaikin(points, iterations = 2) {
    let pts = points;
    for (let it = 0; it < iterations; it++) {
      const out = [pts[0]];
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        out.push([0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1], 0.75 * a[2] + 0.25 * b[2]]);
        out.push([0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1], 0.25 * a[2] + 0.75 * b[2]]);
      }
      out.push(pts[pts.length - 1]);
      pts = out;
    }
    return pts;
  }

  // Angle helpers
  const wrapAngle = (a) => {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  };
  const lerpAngle = (a, b, t) => a + wrapAngle(b - a) * t;

  // ---- Geometry builder: merges transformed pieces with per-piece colour --
  class GeoBuilder {
    constructor(opts = {}) {
      this.pos = [];
      this.nor = [];
      this.col = [];
      this.uv = opts.uv ? [] : null;
      this.idx = [];
      this.extra = {}; // name -> {size, data:[]}
      this.count = 0;
      this._m = new THREE.Matrix4();
      this._n = new THREE.Matrix3();
      this._v = new THREE.Vector3();
    }
    addExtra(name, size, def) {
      if (def === undefined) def = name === 'aoV' ? 1 : name === 'aTan' ? [1, 0, 0] : 0;
      if (!this.extra[name]) this.extra[name] = { size, def, data: new Array(this.count * size).fill(0) };
      return this;
    }
    // geo: THREE.BufferGeometry; matrix: THREE.Matrix4; color: THREE.Color|[r,g,b]
    add(geo, matrix, color, extras) {
      const p = geo.attributes.position;
      const n = geo.attributes.normal;
      const uv = geo.attributes.uv;
      const gc = geo.attributes.color;
      const base = this.count;
      const m = matrix || this._m.identity();
      const nm = this._n.getNormalMatrix(m);
      const v = this._v;
      let cr = 1, cg = 1, cb = 1;
      if (color) {
        if (Array.isArray(color)) [cr, cg, cb] = color;
        else { cr = color.r; cg = color.g; cb = color.b; }
      }
      for (let i = 0; i < p.count; i++) {
        v.set(p.getX(i), p.getY(i), p.getZ(i)).applyMatrix4(m);
        this.pos.push(v.x, v.y, v.z);
        if (n) {
          v.set(n.getX(i), n.getY(i), n.getZ(i)).applyMatrix3(nm).normalize();
          this.nor.push(v.x, v.y, v.z);
        } else this.nor.push(0, 1, 0);
        if (gc) this.col.push(gc.getX(i) * cr, gc.getY(i) * cg, gc.getZ(i) * cb);
        else this.col.push(cr, cg, cb);
        if (this.uv) {
          if (uv) this.uv.push(uv.getX(i), uv.getY(i));
          else this.uv.push(0, 0);
        }
      }
      for (const name in this.extra) {
        const e = this.extra[name];
        const val = extras && extras[name] !== undefined ? extras[name] : e.def;
        const src = geo.attributes[name];
        for (let i = 0; i < p.count; i++) {
          for (let k = 0; k < e.size; k++) {
            if (src) e.data.push(src.array[i * e.size + k]);
            else e.data.push(Array.isArray(val) ? val[k] : val);
          }
        }
      }
      if (geo.index) {
        const ia = geo.index.array;
        for (let i = 0; i < ia.length; i++) this.idx.push(ia[i] + base);
      } else {
        for (let i = 0; i < p.count; i++) this.idx.push(base + i);
      }
      this.count += p.count;
      return this;
    }
    // Raw triangle soup helpers
    addQuad(a, b, c, d, color, normal, extras, uvs) {
      // a,b,c,d counter-clockwise [x,y,z]
      const base = this.count;
      let nx, ny, nz;
      if (normal) [nx, ny, nz] = normal;
      else {
        const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
        const vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
        nx = uy * vz - uz * vy; ny = uz * vx - ux * vz; nz = ux * vy - uy * vx;
        const l = Math.hypot(nx, ny, nz) || 1;
        nx /= l; ny /= l; nz /= l;
      }
      const quad = [a, b, c, d];
      for (let qi = 0; qi < 4; qi++) {
        const q = quad[qi];
        this.pos.push(q[0], q[1], q[2]);
        this.nor.push(nx, ny, nz);
        this.col.push(color[0], color[1], color[2]);
        if (this.uv) {
          if (uvs) this.uv.push(uvs[qi * 2], uvs[qi * 2 + 1]);
          else this.uv.push(0, 0);
        }
      }
      for (const name in this.extra) {
        const e = this.extra[name];
        const val = extras && extras[name] !== undefined ? extras[name] : e.def;
        for (let i = 0; i < 4; i++) {
          for (let k = 0; k < e.size; k++) e.data.push(Array.isArray(val) ? val[k] : val);
        }
      }
      this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      this.count += 4;
      return this;
    }
    build() {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
      if (this.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
      for (const name in this.extra) {
        const e = this.extra[name];
        g.setAttribute(name, new THREE.Float32BufferAttribute(e.data, e.size));
      }
      const IndexArr = this.count > 65535 ? Uint32Array : Uint16Array;
      g.setIndex(new THREE.BufferAttribute(new IndexArr(this.idx), 1));
      g.computeBoundingSphere();
      g.computeBoundingBox();
      return g;
    }
  }

  // Colour helper: sRGB hex -> linear [r,g,b]
  const _c = new THREE.Color();
  const lin = (hex) => {
    _c.set(hex);
    return [_c.r, _c.g, _c.b];
  };
  const col = (hex) => new THREE.Color(hex);
  const mixc = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  const mulc = (a, k) => [a[0] * k, a[1] * k, a[2] * k];

  // Matrix composition helper
  const _q = new THREE.Quaternion();
  const _e = new THREE.Euler();
  const _s = new THREE.Vector3();
  const _p = new THREE.Vector3();
  function mat(x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, order = 'YXZ') {
    _e.set(rx, ry, rz, order);
    _q.setFromEuler(_e);
    _p.set(x, y, z);
    _s.set(sx, sy, sz);
    return new THREE.Matrix4().compose(_p, _q, _s);
  }

  // Canvas texture helper
  function canvasTexture(w, h, draw, opts = {}) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    draw(ctx, w, h);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = opts.linear ? THREE.NoColorSpace : THREE.SRGBColorSpace;
    t.anisotropy = opts.anisotropy || 4;
    if (opts.repeat) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
    }
    t.generateMipmaps = opts.mipmaps !== false;
    t.needsUpdate = true;
    return t;
  }

  // Async yield (lets the loading bar repaint between heavy build steps)
  const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
  const idle = () => new Promise((r) => setTimeout(r, 0));

  const now = () => performance.now() / 1000;

  return {
    clamp, lerp, invLerp, smoothstep, smootherstep, easeInOut, easeSine, easeOut, easeIn,
    DEG, fract, smax, smin, rng, hash2, makeSimplex, noiseA, noiseB, noiseC, fbm, ridged,
    hermiteKeys, smoothKeys, linearKeys, polyline, chaikin, wrapAngle, lerpAngle,
    GeoBuilder, lin, col, mixc, mulc, mat, canvasTexture, nextFrame, idle, now,
  };
})();
