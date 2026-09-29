import { shape, profile } from '../core/shape.js';
import { xf } from '../core/vec.js';
import { roundedPath } from '../core/path.js';

// 石膏几何体静物台：素描课上的那一套。
//   · 一个白色哑光漆的方展台；一块炭灰色的亚麻衬布铺在台面上，从前沿垂下来一直拖到地上，
//     垂下来的那段越往下褶越深（褶只往外鼓，不会穿进台子），落在地上的那截向前摊开、起几道棱；
//   · 台面上五件石膏：圆锥、十字贯穿体（竖着一根方柱、横着穿过一根）、斜放的正方体、球、横躺的六棱柱；
//   · 原点在展台底面中心，正面朝 +z。
const PL = { w: 0.7, h: 0.72, d: 0.5 };
const CLOTH = { x0: -0.3, x1: 0.25, t: 0.0025, back: 0.03, reach: 0.24, amp: 0.04, bend: 0.06 };

export default {
  id: 'still_life',
  name: '石膏静物台',
  nameEn: 'Plaster Still Life',
  category: 'studio',
  aoDensity: 260,
  shadow: { margin: 0.15, maxDist: 0.5, density: 110 },
  view: { el: 16, az: 24 },
  build(k) {
    const q = (...v) => k.q(...v);
    const sm = { smooth: true };

    // —— 展台 ——
    k.box({ name: 'plinth', mat: 'paint', size: [PL.w, PL.h, PL.d], r: q(0.004, 0.003, 0), segs: q(2, 1, 0), omit: ['ny'], xf: xf({ pos: [0, PL.h / 2, 0] }) });

    // —— 衬布：一条开放截面（沿 x 的一排点）沿着 台面 → 前沿 → 前立面 → 地面 的路径扫过去 ——
    {
      const y = PL.h + CLOTH.t, zf = PL.d / 2 + CLOTH.t, xc = (CLOTH.x0 + CLOTH.x1) / 2, W = CLOTH.x1 - CLOTH.x0;
      const corners = [[xc, y, -PL.d / 2 + CLOTH.back], [xc, y, zf], [xc, CLOTH.t, zf], [xc, CLOTH.t, zf + CLOTH.reach]];
      // 台面上那段不起褶，不用加密
      const path = densify(roundedPath(corners, [0, 0.012, CLOTH.bend, 0], q(4, 3, 2)), q(0.06, 0.09, 0.16), (a, b) => a[1] > PL.h && b[1] > PL.h && b[2] < PL.d / 2 - 0.02);
      const nw = q(28, 16, 8);
      // 截面沿 shape y（→ 标架 U = up）排开；up 取 -x，标架 R（= 法线）在台面上朝上、在立面上朝外
      const sec = profile(Array.from({ length: nw + 1 }, (_, i) => [0, -W / 2 + (W * i) / nw, sm]));
      const cloth = k.sweep({ name: 'cloth', mat: 'drape', shape: sec, path, caps: [false, false], up: [-1, 0, 0], maxChart: 1.5 });
      // 褶：沿 x 几个不同波长的正弦叠起来，沿着没变形时的法线往外鼓（立面上朝 +z，落地的弯角处朝弯心，地上朝 +y）；
      // 台面上不起褶（上面要放东西），前沿往下越来越深，落在地上的那截往布头慢慢收。鼓的量小于弯角半径，布不会翻折。
      // 另外布往下略微张开，落地的布头是一条起伏的边
      const rnd = k.rand('cloth');
      const ph = [rnd(), rnd(), rnd(), rnd()].map((v) => v * Math.PI * 2);
      const wave = (x) => {
        const s = (x - CLOTH.x0) / W;
        return 0.55 * Math.sin(s * Math.PI * 2 * 3.2 + ph[0]) + 0.3 * Math.sin(s * Math.PI * 2 * 5.3 + ph[1]) + 0.15 * Math.sin(s * Math.PI * 2 * 8.7 + ph[2]);
      };
      const ss = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
      const cy = CLOTH.t + CLOTH.bend, cz = zf + CLOTH.bend;   // 落地弯角的圆心
      cloth.deform(([px, py, pz]) => {
        if (pz < PL.d / 2 - 0.002 && py > PL.h - 0.01) return [px, py, pz];
        let n;
        if (py >= cy) n = [0, 1e-9, 1];
        else if (pz <= cz) { const l = Math.hypot(cy - py, cz - pz) || 1; n = [0, (cy - py) / l, (cz - pz) / l]; }
        else n = [0, 1, 0];
        const drop = ss(PL.h - 0.01, PL.h - 0.3, py);
        const fade = 1 - 0.8 * ss(cz + 0.02, zf + CLOTH.reach, pz);
        const A = CLOTH.amp * drop * fade * (0.5 + 0.5 * wave(px));
        const flare = 1 + 0.07 * drop;
        const hem = pz > cz ? ((pz - cz) / (zf + CLOTH.reach - cz)) * 0.035 * Math.sin(px * 13 + ph[3]) : 0;
        return [xc + (px - xc) * flare, py + A * n[1], pz + A * n[2] + hem];
      });
    }

    // —— 石膏几何体（台面上，衬布上面）——
    const y0 = PL.h + CLOTH.t;
    const gy = (name, size, pos, rot = [0, 0, 0]) => k.box({ name, mat: 'gypsum', size, r: q(0.0015, 0.0015, 0), segs: q(1, 1, 0), xf: xf({ pos, rot }) });
    // 正方体：斜着放
    gy('cube', [0.13, 0.13, 0.13], [-0.05, y0 + 0.065, -0.05], [0, 0.55, 0]);
    // 十字贯穿体：一根竖的方柱，中段横穿一根
    gy('crossV', [0.058, 0.24, 0.058], [0.19, y0 + 0.12, -0.13], [0, 0.35, 0]);
    gy('crossH', [0.2, 0.058, 0.058], [0.19, y0 + 0.14, -0.13], [0, 0.35, 0]);
    // 圆锥
    k.lathe({ name: 'cone', mat: 'gypsum', segs: q(24, 16, 10), profile: profile([[0, 0], [0.068, 0], [0, 0.21]]), xf: xf({ pos: [-0.24, y0, -0.12] }) });
    // 球
    {
      const r = 0.07, n = q(12, 8, 6);
      const pts = Array.from({ length: n + 1 }, (_, i) => { const a = -Math.PI / 2 + (Math.PI * i) / n; return [r * Math.cos(a), r + r * Math.sin(a), i === 0 || i === n ? {} : sm]; });
      k.lathe({ name: 'sphere', mat: 'gypsum', segs: q(24, 16, 10), profile: profile(pts), xf: xf({ pos: [0.13, y0, 0.1] }) });
    }
    // 六棱柱：横躺着，一个平面着地
    {
      const R = 0.05, L = 0.17;
      const hex = shape(Array.from({ length: 6 }, (_, i) => { const a = (i * Math.PI) / 3; return [R * Math.cos(a), R * Math.sin(a)]; }));
      k.extrude({ name: 'hexPrism', mat: 'gypsum', shape: hex, depth: L, axis: 'x', center: true, bevel: q(0.0012, 0.001, 0), bsegs: 1, xf: xf({ pos: [-0.19, y0 + R * Math.cos(Math.PI / 6), 0.12], rot: [0, -0.35, 0] }) });
    }
  },
};

// 把折线加密：每段不超过 maxLen（褶的深浅沿路径变化，需要足够的截面）；skip(a, b) 为真的段不加密
function densify(pts, maxLen, skip = () => false) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const n = skip(a, b) ? 1 : Math.max(1, Math.ceil(L / maxLen));
    for (let j = 1; j <= n; j++) out.push(a.map((v, c) => v + ((b[c] - v) * j) / n));
  }
  return out;
}
