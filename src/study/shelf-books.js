import { xf } from '../core/vec.js';
import { bookUV } from '../materials/atlas.js';

// 书架墙上的书：一面墙一百多本书，摆件里那种“每本书都是完整模型”（book()，约 40 个三角形）太贵了。
// 这里只做看得见的面，和摆件共用同一张书的调色板图集（一个材质）：
//   · 书脊：椭圆弧，LOD0 两段（法线取椭圆的解析法线，高光一路圆过去）；LOD1/2 是一张平面，
//     法线仍按弧的两侧倾斜 —— 远看还是圆背；
//   · 顶面：书页的细纹（沿书脊→前口方向），前沿就是书脊弧；
//   · 侧面：只做比邻居高出来的那一截；和邻居之间有缝、或者在一排的两头，才做整面；
//   · 贴着书架背板的前口、压在层板上的底面都不做。
// 图块：一整排书的书脊共用一个 AO 图块（每本书占一列，宽度 = 书的厚度），顶面、侧面各一个 ——
// 一百多本书只有几十个图块。坐标：书脊朝 +z，书脊最前沿在 z = zf，书立在 y = y0 上，x 是书的左边缘。
const lerp = (a, b, t) => a + (b - a) * t;
const rsOf = (T) => Math.min(0.3 * T, 0.0065); // 书脊弧的拱高

// 书脊弧上的点：t = 0 左边缘、1 右边缘；返回 x 偏移（相对左边缘）、z 偏移（相对 zf，≤ 0）、法线
function spineAt(T, t, flat) {
  const rs = rsOf(T), phi = Math.PI * (1 - t);
  const c = Math.cos(phi), s = Math.sin(phi);
  if (flat) {
    // 一张平面：两条边的法线取弧上 ±45° 处的法线
    const a = Math.PI * (t < 0.5 ? 0.75 : 0.25);
    return { dx: t * T, dz: 0, n: [Math.cos(a) / (T / 2), 0, Math.sin(a) / rs] };
  }
  return { dx: T / 2 + (T / 2) * c, dz: -rs + rs * s, n: [c / (T / 2), 0, s / rs] };
}

// 一排立着的书。books: [{ x, T, H, D, pal }]（按 x 排好）；place：整排再做一次变换（斜靠的书）
export function bookRow(k, { name, books, y0, zf, place = null, sides = true }) {
  const q = (...v) => k.q(...v);
  const part = k.part('books', name);
  const flat = k.lod > 0;
  const n = flat ? 1 : 2;
  const X0 = books[0].x, X1 = books[books.length - 1].x + books[books.length - 1].T;
  const L = X1 - X0;
  const Hmax = Math.max(...books.map((b) => b.H)), Dmax = Math.max(...books.map((b) => b.D));
  const chSpine = k.chart(`${name}:spine`, L, Hmax);
  const chTop = k.chart(`${name}:top`, L, Dmax, { density: 0.7 });
  const [pu0, pv0, pu1, pv1] = bookUV('pages');

  // 侧面（露出来的那几截）：先按 LOD0 的规则列出来，图块排布和 LOD 无关
  const TOUCH = 0.0015;
  const exposed = [];
  books.forEach((b, i) => {
    for (const s of [-1, 1]) {
      const nb = books[i + s];
      const gap = !nb ? Infinity : s < 0 ? b.x - (nb.x + nb.T) : nb.x - (b.x + b.T);
      const ya = gap > TOUCH ? 0 : nb.H;
      if (b.H - ya > 0.004) exposed.push({ i, s, ya, yb: b.H });
    }
  });
  const sideLen = exposed.reduce((a, e) => a + books[e.i].D, 0);
  const chSide = exposed.length ? k.chart(`${name}:sides`, sideLen, Hmax, { density: 0.8 }) : -1;

  // 最远一级：同一套书（同色、同高、挨着）并成一张面，只留书脊 —— 远看就是一排色块
  if (k.lod >= 2) {
    const merged = [];
    for (const b of books) {
      const m = merged[merged.length - 1];
      if (m && m.pal === b.pal && Math.abs(m.H - b.H) < 0.004 && b.x - (m.x + m.T) <= TOUCH) {
        m.T = b.x + b.T - m.x;
        m.H = Math.max(m.H, b.H);
      } else merged.push({ ...b });
    }
    for (const { x, T, H, pal } of merged) {
      const [su0, sv0, su1, sv1] = bookUV('spine', pal);
      const sp = (j, y) => {
        const r = spineAt(T, j, true);
        return part.v([x + r.dx, y0 + y, zf], r.n, [lerp(su0, su1, j), lerp(sv0, sv1, 1 - y / H)], chSpine, [(x + r.dx - X0) / L, y / Hmax]);
      };
      part.quad(sp(0, 0), sp(1, 0), sp(1, H), sp(0, H));
    }
    if (place) part.transform(place);
    return part;
  }

  books.forEach((b) => {
    const { x, T, H, D, pal } = b;
    const [su0, sv0, su1, sv1] = bookUV('spine', pal);
    // 书脊
    const ring = [];
    for (let j = 0; j <= n; j++) ring.push(spineAt(T, j / n, flat));
    const sp = (r, j, y) => part.v(
      [x + r.dx, y0 + y, zf + r.dz], r.n,
      [lerp(su0, su1, j / n), lerp(sv0, sv1, 1 - y / H)],
      chSpine, [(x + r.dx - X0) / L, y / Hmax],
    );
    const bot = ring.map((r, j) => sp(r, j, 0)), top = ring.map((r, j) => sp(r, j, H));
    for (let j = 0; j < n; j++) part.quad(bot[j], bot[j + 1], top[j + 1], top[j]);
    // 顶面：前沿是书脊弧，后沿在 zf - D；书页细纹沿深度方向
    const tv = (px, pz) => part.v(
      [px, y0 + H, pz], [0, 1, 0],
      [lerp(pu0, pu1, (zf - pz) / D), lerp(pv0, pv1, (px - x) / T)],
      chTop, [(px - X0) / L, (zf - pz) / Dmax],
    );
    const back = [tv(x + T, zf - D), tv(x, zf - D)];
    const front = ring.map((r) => tv(x + r.dx, zf + r.dz));
    // 扇形三角化：从左后角出发
    const poly = [back[1], ...front, back[0]];
    for (let j = 1; j + 1 < poly.length; j++) part.tri(poly[0], poly[j], poly[j + 1]);
  });

  // 侧面：封面色块（只在最近一级：稍远一点，这一截侧面就只剩一两个像素）
  if (sides && k.lod === 0) {
    let s0 = 0;
    for (const e of exposed) {
      const b = books[e.i];
      const [wu0, wv0, wu1, wv1] = bookUV('swatch', b.pal);
      const px = e.s < 0 ? b.x : b.x + b.T;
      const zs = flat ? zf : zf - rsOf(b.T);
      const sv = (pz, y) => part.v(
        [px, y0 + y, pz], [e.s, 0, 0],
        [lerp(wu0, wu1, (zs - pz) / b.D), lerp(wv0, wv1, 1 - y / b.H)],
        chSide, [(s0 + (zs - pz)) / sideLen, y / Hmax],
      );
      part.quad(sv(zs, e.ya), sv(zf - b.D, e.ya), sv(zf - b.D, e.yb), sv(zs, e.yb));
      s0 += b.D;
    }
  }
  if (place) part.transform(place);
  return part;
}

// 一摞平放的书：books 自下而上 [{ T, H, D, pal, dx, turn }]（H 是书的高度，平放后沿 x；dx、turn 是每本的错位和转角）。
// 看得见的面：书脊（朝 +z，弧在竖直方向）、顶面（封面色）、两头（书页）。每本书三个小图块。
export function bookStack(k, { name, books, x, y0, zf }) {
  const part = k.part('books', name);
  const flat = k.lod > 0;
  const n = flat ? 1 : 2;
  const [pu0, pv0, pu1, pv1] = bookUV('pages');
  let y = y0;
  books.forEach((b, i) => {
    const { T, H, D, pal, dx = 0, turn = 0 } = b;
    const [su0, sv0, su1, sv1] = bookUV('spine', pal);
    const [wu0, wv0, wu1, wv1] = bookUV('swatch', pal);
    // 局部坐标：书的中心在 (0, 0, 0)，书脊朝 +z、最前沿在 z = D/2；再绕竖直轴转一点、摆到位
    const P = xf({ pos: [x + dx, y + T / 2, zf - D / 2], rot: [0, turn, 0] });
    const v = (p, nn, t, ch, u) => part.v(P.apply(p), P.applyDir(nn), t, ch, u);
    const cf = k.chart(`${name}.${i}:f`, H, T), ct = k.chart(`${name}.${i}:t`, H, D, { density: 0.7 }), ce = k.chart(`${name}.${i}:e`, 2 * D, T, { density: 0.6 });
    // 书脊：弧在竖直方向（t = 0 在下）
    const ring = [];
    for (let j = 0; j <= n; j++) {
      const r = spineAt(T, j / n, flat);
      ring.push({ y: r.dx - T / 2, z: D / 2 + r.dz, n: [0, r.n[0], r.n[2]] });
    }
    const sp = (r, j, px) => v([px, r.y, r.z], r.n, [lerp(su0, su1, j / n), lerp(sv0, sv1, 0.5 - px / H)], cf, [px / H + 0.5, j / n]);
    const L = ring.map((r, j) => sp(r, j, -H / 2)), R = ring.map((r, j) => sp(r, j, H / 2));
    for (let j = 0; j < n; j++) part.quad(L[j], L[j + 1], R[j + 1], R[j]);
    // 顶面（封面）：从书脊弧的顶边到前口
    const zt = ring[n].z;
    const tv = (px, pz) => v([px, T / 2, pz], [0, 1, 0], [lerp(wu0, wu1, px / H + 0.5), lerp(wv0, wv1, (D / 2 - pz) / D)], ct, [px / H + 0.5, (D / 2 - pz) / D]);
    part.quad(tv(-H / 2, zt), tv(H / 2, zt), tv(H / 2, -D / 2), tv(-H / 2, -D / 2));
    // 两头：书页（细纹沿深度方向），前沿是书脊弧；最远一级不做
    for (const s of k.lod < 2 ? [-1, 1] : []) {
      const ev = (py, pz) => v(
        [s * H / 2, py, pz], [s, 0, 0],
        [lerp(pu0, pu1, (D / 2 - pz) / D), lerp(pv0, pv1, py / T + 0.5)],
        ce, [((s > 0 ? D : 0) + (D / 2 - pz)) / (2 * D), py / T + 0.5],
      );
      const poly = [ev(-T / 2, -D / 2), ...ring.map((r) => ev(r.y, r.z)), ev(T / 2, -D / 2)];
      for (let j = 1; j + 1 < poly.length; j++) part.tri(poly[0], poly[j], poly[j + 1]);
    }
    y += T;
  });
  return { part, top: y };
}

// 按“一套一套”的节奏排一段书：同一套书颜色、高度相同，厚度略有出入；套与套之间偶尔留一道缝。
// r 是确定性随机数；返回 { books, x }（x 是排到的位置）。align = 'right' 时从右往左排
export function fillBooks(r, { x0, x1, clear, zDepth, align = 'left', pals }) {
  const out = [];
  const width = x1 - x0;
  let used = 0, set = null, gap = 0;
  while (true) {
    if (!set || set.left === 0) {
      const H = Math.min(clear - 0.025, 0.19 + r() * 0.11);
      set = {
        left: 1 + Math.floor(r() * (r() < 0.3 ? 5 : 3)),
        T: 0.022 + r() * (r() < 0.2 ? 0.035 : 0.02),
        H, D: Math.min(zDepth, H * (0.66 + r() * 0.1)),
        pal: pals[Math.floor(r() * pals.length)],
      };
      gap = out.length && r() < 0.35 ? 0.002 + r() * 0.004 : 0; // 套与套之间偶尔留一道缝
    }
    const T = set.T * (0.88 + 0.24 * r());
    if (used + gap + T > width) break;
    out.push({ T, H: set.H * (0.985 + 0.03 * r()), D: set.D, pal: set.pal, gap });
    used += gap + T + 0.0004;
    gap = 0;
    set.left--;
  }
  // 排位置
  let x = align === 'right' ? x1 - used : x0;
  for (const b of out) { x += b.gap; b.x = x; x += b.T + 0.0004; }
  return { books: out, used };
}
