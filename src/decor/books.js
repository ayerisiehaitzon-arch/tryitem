import { xf } from '../core/vec.js';
import { triangulate } from '../core/shape.js';
import { bookUV } from '../materials/atlas.js';

// 一本精装书（局部坐标：书脊朝 +z，厚度沿 x，高度沿 y，底面 y = 0）
//   · 书脊是椭圆弧，和封面相接处法线连续 → 一条柔和的高光
//   · 封面比书页四周多出 3mm，书页顶面 / 前口内缩 —— 这个“台阶”是书之所以像书的关键
//   · 全部 UV 指向调色板图集（书脊图案 / 封面纯色 / 书页细纹），整排书只用一个材质
//   · 立着放的书，底面在书架上看不见，直接不生成
export function book(k, { name, pal, T, D, H, standing = true, xf: place = null }) {
  const q = (...v) => k.q(...v);
  const part = k.part('books', name);
  const c = q(0.0022, 0.0022, 0), o = q(0.003, 0.003, 0);
  const rs = q(Math.min(0.3 * T, 0.007), Math.min(0.3 * T, 0.007), 0);
  const n = q(4, 2, 1);
  const zf = -D / 2, zs = D / 2 - rs; // 前口 z、书脊起点 z
  const [su0, sv0, su1, sv1] = bookUV('spine', pal);
  const [wu0, wv0, wu1, wv1] = bookUV('swatch', pal);
  const [pu0, pv0, pu1, pv1] = bookUV('pages');
  const lerp = (a, b, t) => a + (b - a) * t;
  const sw = (s, t) => [lerp(wu0, wu1, s), lerp(wv0, wv1, t)]; // 封面色块
  const pg = (s, t) => [lerp(pu0, pu1, s), lerp(pv0, pv1, t)]; // 书页
  const vOfY = (y) => lerp(sv0, sv1, 1 - y / H);

  // 书脊弧上的点与法线
  const arc = [];
  for (let i = 0; i <= n; i++) {
    const phi = (i / n) * Math.PI;
    const x = (T / 2) * Math.cos(phi), z = zs + rs * Math.sin(phi);
    const nn = rs > 0 ? [x / (T / 2) ** 2, 0, (z - zs) / rs ** 2] : [Math.cos(phi) > 0 ? 1 : Math.cos(phi) < 0 ? -1 : 0, 0, 1];
    arc.push({ x, z, n: nn, u: i / n });
  }
  // 外圈展开图块：左内衬 → 左前口 → 左封面 → 书脊 → 右封面 → 右前口 → 右内衬
  const coverLen = zs - zf, spineLen = Math.PI * Math.sqrt((T * T / 4 + rs * rs) / 2);
  const wrapLen = 2 * (o + c + coverLen) + spineLen;
  const wrap = k.chart(`${name}:wrap`, wrapLen, H);
  const cw = (s, y) => [s / wrapLen, y / H];

  // 书脊
  for (let i = 0; i < n; i++) {
    const a = arc[i], b = arc[i + 1];
    const sa = o + c + coverLen + spineLen * (1 - a.u), sb = o + c + coverLen + spineLen * (1 - b.u);
    const v = (p, y, s, u) => part.v([p.x, y, p.z], p.n, [lerp(su0, su1, 1 - u), vOfY(y)], wrap, cw(s, y));
    part.quad(v(a, 0, sa, a.u), v(b, 0, sb, b.u), v(b, H, sb, b.u), v(a, H, sa, a.u));
  }
  // 两块封面外侧、前口、内衬
  for (const side of [1, -1]) {
    const x = side * T / 2, xi = side * (T / 2 - c);
    const s0 = side > 0 ? o + c + coverLen + spineLen : 0; // 右侧从书脊末端往后展开
    const S = (d) => (side > 0 ? s0 + d : o + c + coverLen - d); // d：从书脊起点往前口的距离
    const outer = (z, y) => part.v([x, y, z], [side, 0, 0], sw((zs - z) / coverLen, 1 - y / H), wrap, cw(S(zs - z), y));
    part.quad(outer(zs, 0), outer(zf, 0), outer(zf, H), outer(zs, H));
    // 前口（封面板的厚度）
    const tip = (xx, y, d) => part.v([xx, y, zf], [0, 0, -1], sw(0.5, 1 - y / H), wrap, cw(S(coverLen + d), y));
    part.quad(tip(x, 0, 0), tip(xi, 0, c), tip(xi, H, c), tip(x, H, 0));
    // 封面内侧超出书页的那一圈（从前口往里看得到）
    if (k.lod === 0) {
      const inn = (z, y, d) => part.v([xi, y, z], [-side, 0, 0], sw(0.2, 1 - y / H), wrap, cw(S(coverLen + c + d), y));
      part.quad(inn(zf, 0, 0), inn(zf + o, 0, o), inn(zf + o, H, o), inn(zf, H, 0));
    }
  }

  // 顶面 / 底面的“C 形”封面边：外轮廓 + 内轮廓
  const ring = [];
  ring.push([T / 2, zf], [T / 2, zs]);
  for (let i = 1; i < n; i++) ring.push([arc[i].x, arc[i].z]);
  ring.push([-T / 2, zs], [-T / 2, zf]);
  const inner = [];
  const ki = rs > 0 ? Math.max(0.2, (rs - c) / rs) : 1;
  inner.push([-(T / 2 - c), zf], [-(T / 2 - c), zs]);
  for (let i = n - 1; i >= 1; i--) inner.push([arc[i].x * (T / 2 - c) / (T / 2), zs + (arc[i].z - zs) * ki]);
  inner.push([T / 2 - c, zs], [T / 2 - c, zf]);
  const band = c > 0 ? [...ring, ...inner] : ring;
  const tris = triangulate(band);
  for (const [end, y, ny] of [['top', H, 1], ['bot', 0, -1]]) {
    if (end === 'bot' && standing) continue;
    const ch = k.chart(`${name}:${end}`, T, D, { density: end === 'bot' ? 0.4 : 1 });
    const ids = band.map(([x, z]) => part.v([x, y, z], [0, ny, 0], sw((x + T / 2) / T, (z - zf) / D), ch, [(x + T / 2) / T, (z - zf) / D]));
    for (const [a, b, cc] of tris) part.tri(ids[a], ids[b], ids[cc]);
  }

  // 书页：顶面、前口、（躺着时）底面，展开成一条图块
  if (o > 0 || c > 0) {
    const x0 = -(T / 2 - c), x1 = T / 2 - c, y0 = o, y1 = H - o, z0 = zf + o, z1 = zs;
    const dp = z1 - z0, hp = y1 - y0;
    const pagesLen = 2 * dp + hp;
    const ch = k.chart(`${name}:pages`, pagesLen, x1 - x0);
    const px = (x) => (x - x0) / (x1 - x0);
    const top = (x, z) => part.v([x, y1, z], [0, 1, 0], pg((z1 - z) / dp, px(x)), ch, [(z1 - z) / pagesLen, px(x)]);
    part.quad(top(x0, z1), top(x1, z1), top(x1, z0), top(x0, z0));
    const fore = (x, y) => part.v([x, y, z0], [0, 0, -1], pg((y1 - y) / hp, px(x)), ch, [(dp + (y1 - y)) / pagesLen, px(x)]);
    part.quad(fore(x0, y1), fore(x1, y1), fore(x1, y0), fore(x0, y0));
    if (!standing) {
      const bot = (x, z) => part.v([x, y0, z], [0, -1, 0], pg((z - z0) / dp, px(x)), ch, [(dp + hp + (z - z0)) / pagesLen, px(x)]);
      part.quad(bot(x0, z0), bot(x1, z0), bot(x1, z1), bot(x0, z1));
    }
  }
  if (place) part.transform(place);
  return part;
}

// 一组书：一排立着的 + 一本斜靠的 + 一摞平放的
export default {
  id: 'books',
  name: '书',
  nameEn: 'Clothbound Books',
  category: 'decor',
  // 放在书架层板上：接触阴影贴花只比书的占地大一圈，不会伸出层板边缘
  shadow: { margin: 0.035, maxDist: 0.07, density: 200 },
  build(k) {
    // 固定的“随机”尺寸与配色，保证每次构建一致
    const row = [
      [0.028, 0.245, 3], [0.036, 0.232, 0], [0.022, 0.214, 11], [0.042, 0.262, 8], [0.026, 0.226, 5],
      [0.032, 0.238, 2], [0.02, 0.2, 9], [0.038, 0.25, 13],
    ];
    const front = 0.09; // 书脊对齐书架前沿
    const books = []; // 先排版，最后整体居中
    let x = 0;
    row.forEach(([T, H, pal], i) => {
      const D = 0.68 * H;
      x += T / 2 + [0.001, 0.002, 0, 0.003, 0.001, 0.002, 0.001, 0][i];
      const tilt = [0.004, -0.006, 0.003, 0, 0.005, -0.004, 0.006, 0][i];
      books.push({ name: `b${i}`, pal, T, D, H, pos: [x, 0, front - D / 2], rot: [0, 0, tilt] });
      x += T / 2;
    });
    // 斜靠的一本：左下角着地，左上角靠在前一本书的侧面上
    {
      const T = 0.03, H = 0.236, D = 0.68 * H, a = 0.28;
      const px = x + 0.0015 + (T / 2) * Math.cos(a) + H * Math.sin(a);
      books.push({ name: 'lean', pal: 6, T, D, H, pos: [px, (T / 2) * Math.sin(a), front - D / 2], rot: [0, 0, a] });
      x = px + (T / 2) * Math.cos(a); // 右下角
    }
    // 平放的一摞：书的高度方向转到水平（绕 z 转 -90°），再绕竖直轴各自错开一点
    const stack = [[0.04, 0.27, 7, 0.03], [0.03, 0.235, 12, -0.06], [0.024, 0.2, 4, 0.08]];
    const sx = x + 0.018 + 0.27 / 2;
    let y = 0;
    stack.forEach(([T, H, pal, turn], i) => {
      const D = 0.7 * H;
      books.push({
        name: `s${i}`, pal, T, D, H, standing: false,
        pos: [sx + [0, 0.012, -0.008][i], y + T / 2, front - D / 2 - 0.004 * i], rot: [turn, 0, -Math.PI / 2], center: true,
      });
      y += T;
    });
    const mid = (x0(books[0]) + sx + 0.27 / 2) / 2;
    function x0(b) { return b.pos[0] - b.T / 2; }
    for (const b of books) {
      const place = xf({ pos: [b.pos[0] - mid, b.pos[1], b.pos[2]], rot: b.rot });
      book(k, { ...b, xf: b.center ? place.mul(xf({ pos: [0, -b.H / 2, 0] })) : place });
    }
  },
};
