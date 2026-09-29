import { shape, profile, rect, circle } from '../core/shape.js';
import { xf } from '../core/vec.js';
import { sewUV } from '../materials/atlas.js';
import { sw, rod, pin, catmull } from './parts.js';

// 人台：燕麦色亚麻包面的女装人台，立在胡桃木的三脚架上，身上别着一条做了一半的碎花半身裙，脖子上挂着一条软尺。
//   · 躯干是十几圈截面放样出来的：臀、腰、胸（前面两个鼓包）、肩（又宽又扁）、脖子；截面是略方的超椭圆，前后深度不同；
//     前中、后中各一道缝线；脖子顶上一个胡桃木的盖子和一颗黄铜小钮；
//   · 三脚架：中间一根旋木立柱，三条弯腿从柱脚的木盘伸出去，脚上黄铜脚套；柱子顶上一个黄铜的升降箍和一个 T 形拧把，
//     一根钢杆插进躯干底下；
//   · 半身裙：腰头包着人台的腰，往下贴着臀，再往外张开成 A 字，一直垂到躯干底下；下摆一圈褶（越往下越深），
//     腰头和下摆上别着几根彩色珠头的大头针；
//   · 软尺从脖子后面绕过两边肩膀，两头垂在胸前（一头是 0，一头是 150cm），末端包着金属片。
// 原点在三脚架正中的地面，正面朝 +z。
const Y0 = 0.95; // 躯干底面离地
// 截面表：[离底面的高度, 半宽, 前半深, 后半深, 胸部鼓包]
const RINGS = [
  [0.0, 0.168, 0.118, 0.128, 0], [0.06, 0.176, 0.124, 0.134, 0], [0.14, 0.162, 0.114, 0.12, 0], [0.24, 0.13, 0.094, 0.094, 0],
  [0.32, 0.138, 0.1, 0.098, 0.35], [0.38, 0.152, 0.106, 0.098, 1], [0.44, 0.158, 0.1, 0.094, 0.6], [0.49, 0.166, 0.086, 0.087, 0],
  // 肩：又宽又扁，往脖子那边圆圆地斜上去
  [0.52, 0.174, 0.074, 0.078, 0], [0.54, 0.171, 0.068, 0.073, 0], [0.555, 0.159, 0.064, 0.069, 0], [0.568, 0.139, 0.06, 0.065, 0],
  [0.579, 0.115, 0.057, 0.061, 0], [0.589, 0.09, 0.054, 0.057, 0], [0.6, 0.064, 0.051, 0.053, 0],
  [0.66, 0.054, 0.047, 0.049, 0],
];
const E = 2 / 2.3;   // 超椭圆：略方
const sgnPow = (v, e) => Math.sign(v) * Math.abs(v) ** e;
const bump = (x) => Math.exp(-(((x - 0.072) / 0.045) ** 2)) + Math.exp(-(((x + 0.072) / 0.045) ** 2));
// 按高度插值截面表
function ringAt(dy) {
  for (let i = 0; i + 1 < RINGS.length; i++) {
    const a = RINGS[i], b = RINGS[i + 1];
    if (dy <= b[0] || i === RINGS.length - 2) {
      const t = Math.max(0, Math.min(1, (dy - a[0]) / (b[0] - a[0])));
      return a.map((v, j) => v + (b[j] - v) * t);
    }
  }
  return RINGS[0];
}
// 截面上角度 th（0 = +x，π/2 = 正前方）的一点；grow：往外放出去多少（裙子、软尺）
function torsoPoint([dy, hw, fr, bk, bust], th, grow = 0) {
  const c = Math.cos(th), s = Math.sin(th);
  const x = (hw + grow) * sgnPow(c, E);
  let z = ((s >= 0 ? fr : bk) + grow) * sgnPow(s, E);
  if (s > 0 && bust) z += bust * 0.03 * bump(x) * s;
  return [x, Y0 + dy, z];
}
// 正面表面上 x 处的 z（软尺贴着胸口走）
function frontZ(dy, x) {
  const [, hw, fr, , bust] = ringAt(dy);
  const c = Math.min(1, Math.abs(x) / hw) ** (1 / E), s = Math.sqrt(Math.max(0, 1 - c * c));
  return fr * s ** E + bust * 0.03 * bump(x) * s;
}

export default {
  id: 'dress_form',
  name: '人台',
  nameEn: 'Dress Form with Pinned Skirt',
  category: 'sewing',
  aoDensity: 260,
  shadow: { margin: 0.12, maxDist: 1.2, density: 110 },
  view: { el: 12, az: 24 },
  build(k) {
    const q = (...v) => k.q(...v);
    const sm = { smooth: true };
    const n = q(28, 20, 12);
    const angs = Array.from({ length: n }, (_, j) => -Math.PI / 2 + (2 * Math.PI * j) / n);   // 接缝在正后方

    // —— 躯干 ——
    k.loft({ name: 'torso', mat: 'linen', rings: RINGS.map((r) => angs.map((a) => torsoPoint(r, a))), caps: [true, false] });
    // 前中、后中的缝线
    for (const [tag, th] of [['CF', Math.PI / 2], ['CB', -Math.PI / 2]]) {
      const path = RINGS.filter((r) => r[0] <= 0.6).map((r) => torsoPoint(r, th, 0.0012));
      sw(k.sweep({ name: `seam${tag}`, mat: 'sewing', shape: circle(0.0013, 4), path, up: [1, 0, 0], caps: [false, false] }), 'seam');
    }
    // 脖子顶上的木盖和黄铜小钮
    const yt = Y0 + RINGS[RINGS.length - 1][0];
    k.lathe({ name: 'neckCap', mat: 'walnut', segs: q(16, 12, 8), profile: profile([[0.057, -0.004], [0.059, 0.004, sm], [0.052, 0.013, sm], [0.022, 0.018, sm], [0, 0.019]]), xf: xf({ pos: [0, yt, 0] }) });
    sw(k.lathe({ name: 'finial', mat: 'sewing', segs: q(10, 8, 6), profile: profile([[0.006, 0], [0.004, 0.006, sm], [0.009, 0.014, sm], [0.006, 0.021, sm], [0, 0.023]]), xf: xf({ pos: [0, yt + 0.018, 0] }) }), 'brass');

    // —— 三脚架 ——
    k.lathe({ name: 'column', mat: 'walnut', segs: q(12, 10, 8), profile: profile([[0.05, 0.17], [0.052, 0.19, sm], [0.05, 0.245, sm], [0.03, 0.27, sm], [0.02, 0.3, sm], [0.017, 0.5, sm], [0.02, 0.68, sm], [0.026, 0.71, sm], [0.026, 0.74], [0.014, 0.75]]) });
    sw(k.lathe({ name: 'collar', mat: 'sewing', segs: q(12, 10, 8), profile: profile([[0.02, 0.735], [0.029, 0.738, sm], [0.03, 0.765, sm], [0.02, 0.77]]) }), 'brass');
    rod(k, 'knobStem', [0.028, 0.752, 0], [0.058, 0.752, 0], 0.004, 'brass', { segs: q(6, 5, 4) });
    rod(k, 'knobBar', [0.058, 0.752, -0.018], [0.058, 0.752, 0.018], 0.0045, 'brass', { segs: q(6, 5, 4) });
    rod(k, 'post', [0, 0.765, 0], [0, Y0 + 0.01, 0], 0.009, 'chrome', { segs: q(8, 6, 5), caps: [false, false] });
    for (let i = 0; i < 3; i++) {
      const a = -Math.PI / 2 + (2 * Math.PI * i) / 3, c = Math.cos(a), s = Math.sin(a);
      const pts = catmull([[0.035, 0.21], [0.13, 0.17], [0.23, 0.085], [0.3, 0.03]], q(4, 3, 2)).map(([r, y]) => [r * c, y, r * s]);
      k.sweep({ name: `leg${i}`, mat: 'walnut', shape: rect(0.028, 0.024, { r: 0.008, segs: 1 }), path: pts, up: [0, 1, 0], scale: (t) => 1 - 0.3 * t });
      sw(k.lathe({ name: `foot${i}`, mat: 'sewing', segs: q(10, 8, 6), profile: profile([[0.014, 0], [0.016, 0.004, sm], [0.014, 0.03, sm], [0, 0.034]]), xf: xf({ pos: [0.3 * c, 0, 0.3 * s] }) }), 'brass');
    }

    // —— 半身裙：腰头 + 裙身（贴着臀，往下张开成 A 字，下摆的褶越往下越深）——
    // 臀围最宽处（离底面 6cm）以下不再贴着人台（人台底下往里收），直接往外张开
    const skirtAt = (dy) => {
      if (dy >= 0.06) return ringAt(dy);
      const [, hw, fr, bk] = RINGS[1], t = 0.06 - dy;
      return [dy, hw + 0.3 * t, fr + 0.26 * t, bk + 0.26 * t, 0];
    };
    const folds = 9, famp = q(1, 1, 0.4);
    const SK = [0.228, 0.2, 0.14, 0.06, 0.0, -0.08, -0.16, -0.24, -0.31];
    const skirtPoint = (dy, a) => {
      const t = Math.max(0, Math.min(1, -dy / 0.31)), amp = famp * (0.012 + 0.07 * t ** 1.2);
      const r = skirtAt(dy), p = torsoPoint(r, a, 0.006 + 0.004 * t);
      const f = 1 + amp * Math.sin(folds * a + 0.7);
      return [p[0] * f, p[1] - 0.012 * t * (0.5 + 0.5 * Math.sin(folds * a + 0.7)), p[2] * f];
    };
    const ns = q(36, 24, 16), sangs = Array.from({ length: ns }, (_, j) => -Math.PI / 2 + (2 * Math.PI * j) / ns);
    const SKR = [...SK].reverse();
    const skirt = k.loft({ name: 'skirt', mat: 'calico', rings: SKR.map((dy) => sangs.map((a) => skirtPoint(dy, a))) });
    // 布纹：放样自带的 UV 每圈各按弧长走，下摆比腰长一倍，花会被拉成斜的；改成把裙身当成一个圆锥摊平 ——
    // 锥顶在腰上方（按下摆张开的斜率定），点到锥顶的斜距是半径、角度乘 sinα。第 i 圈第 j 个点的下标是 i·(ns + 1) + j，
    // 首尾两个点位置相同、角度差一整圈，后背的接缝两边各用各的 UV
    {
      const tanA = 0.3, sinA = tanA / Math.hypot(1, tanA), cosA = 1 / Math.hypot(1, tanA), yApex = Y0 + 0.06 + RINGS[1][1] / tanA;
      skirt.T = skirt.T.map((_, idx) => {
        const i = Math.floor(idx / (ns + 1)), j = idx % (ns + 1);
        const rho = (yApex - skirt.P[idx][1]) / cosA, psi = ((2 * Math.PI * j) / ns) * sinA;
        return [rho * Math.cos(psi), rho * Math.sin(psi)];
      });
    }
    // 腰头：比裙身厚一点，上沿往里收；按圆柱展开
    const band = k.loft({ name: 'waistband', mat: 'calico', rings: [[0.222, 0.0085], [0.255, 0.0085], [0.257, 0.004]].map(([dy, g]) => sangs.map((a) => torsoPoint(ringAt(dy), a, g))) });
    band.T = band.T.map((_, idx) => [((idx % (ns + 1)) / ns) * 0.72, band.P[idx][1]]);
    // 大头针：腰头侧边几根横着别，下摆一圈竖着别（别住折边）
    let pi = 0;
    for (const a of [0.25, 2.9]) {
      const p = torsoPoint(ringAt(0.24), a, 0.0085), dir = [Math.cos(a), 0.25, Math.sin(a) * 0.5];
      pin(k, `waistPin${pi}`, [p[0] - dir[0] * 0.012, p[1], p[2] - dir[2] * 0.012], dir, 0.03, pi++);
    }
    for (const a of [0.55, 1.1, 1.75, 2.4]) {
      const p = skirtPoint(-0.285, a);
      pin(k, `hemPin${pi}`, [p[0] * 1.01, p[1] - 0.012, p[2] * 1.01], [Math.cos(a) * 0.08, 1, Math.sin(a) * 0.08], 0.034, pi++);
    }

    // —— 软尺：两段，从左边胸前的一头（0cm）绕过脖子后面到右边胸前（150cm）——
    const W = 0.016, T = 0.0006;
    const strand = (side) => {
      const x = side * 0.07, dyEnd = side < 0 ? 0.17 : 0.12;
      const zb = frontZ(0.38, x) + 0.007;
      const front = [[x, Y0 + dyEnd, zb], [x, Y0 + 0.3, zb], [x, Y0 + 0.38, frontZ(0.38, x) + 0.0035], [x, Y0 + 0.46, frontZ(0.46, x) + 0.003],
        [x * 0.97, Y0 + 0.53, frontZ(0.53, x) + 0.003], [side * 0.069, Y0 + 0.582, 0.024], [side * 0.067, Y0 + 0.596, -0.02], [side * 0.042, Y0 + 0.601, -0.056], [0, Y0 + 0.603, -0.061]];
      return catmull(front, q(3, 2, 2));
    };
    // 两段都从垂着的那头往脖子后面扫（起点的“上”朝前，尺面贴着胸口）；右边那段的刻度倒着贴：垂着的一头是 150
    [['tapeA', -1], ['tapeB', 1]].forEach(([region, side]) => {
      const path = strand(side);
      const tape = k.sweep({ name: region, mat: 'sewing', shape: rect(W, T), path, up: [0, 0, 1], caps: [true, true] });
      const L = Math.max(...tape.T.map((t) => t[0]));
      // 截面四条边：底面 → 右边 → 顶面 → 左边；两个大面都贴刻度，两条窄边取尺边的颜色
      tape.T = tape.T.map(([s, sa]) => {
        const v = sa <= W ? sa / W : sa <= W + T ? 1 : sa <= 2 * W + T ? 1 - (sa - W - T) / W : 0;
        const u = Math.min(1, s / L);
        return sewUV(region, side < 0 ? u : 1 - u, side < 0 ? v : 1 - v);
      });
      // 末端的金属片
      const e = path[0];
      sw(k.box({ name: `${region}Tip`, mat: 'sewing', size: [W + 0.002, 0.012, 0.0018], r: 0.0006, segs: q(1, 1, 0), xf: xf({ pos: [e[0], e[1] + 0.004, e[2]] }) }), 'chrome');
    });
  },
};
