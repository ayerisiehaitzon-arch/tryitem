import { Xform } from '../core/vec.js';

/**
 * 车削体（绕 Y 轴旋转的轮廓）—— 圆腿、旋木件、灯座、灯罩、把手、圆桌面边缘……
 *
 *   profile  开放轮廓（shape.profile），点在 (r, y) 平面，自下而上沿外表面走
 *   segs     圆周分段。低面数的要诀：分段只需保证“轮廓剪影”看起来圆，
 *            明暗的圆润全靠平滑法线，所以细腿 6~8 段就足够。
 *   phase    起始角（UV 接缝默认放在背面 -Z）
 *   grain    'profile' 纹理 u 沿轮廓（车木纹理）/ 'around' 沿圆周 /
 *            'planar' 全部用顶视平面投影（石材、圆座面：顶面花纹自然延续到边缘上）
 *
 * 轮廓按拐角自动分成若干“环带”，近似水平的环带用平面投影图块（避免轴心处拉伸），
 * 其余用展开的圆柱图块。
 */
export function lathe(k, o) {
  const {
    name, mat, profile: pr, segs = 16, phase = 0, grain = 'profile',
    density = {}, xf = null, maxChart = 0.9,
  } = o;
  const part = k.part(mat, name);
  const bands = new Map();
  for (const sg of pr.segs) {
    if (!bands.has(sg.group)) bands.set(sg.group, []);
    bands.get(sg.group).push(sg);
  }
  const ang = (j) => phase + Math.PI + (2 * Math.PI * j) / segs;

  for (const [gi, list] of bands) {
    let rmax = 1e-4;
    // 按弧长统计：大部分是水平面 → 平面投影图块
    let flatLen = 0, allLen = 0;
    for (const sg of list) {
      rmax = Math.max(rmax, sg.a[0], sg.b[0]);
      const L = sg.sb - sg.sa;
      allLen += L;
      if (Math.abs(sg.na[1]) > 0.97 && Math.abs(sg.nb[1]) > 0.97) flatLen += L;
    }
    let flat = flatLen > 0.6 * allLen;
    // 低 LOD 沿用 LOD0 的图块类型（圆角段数变化不会导致图块对不上）
    if (k.layout) {
      if (k.layout.rects[`${name}:b${gi}`]) flat = true;
      else if (k.layout.rects[`${name}:b${gi}.0`]) flat = false;
    }
    const s0 = list[0].sa;
    const L = Math.max(1e-6, list[list.length - 1].sb - s0);

    if (flat) {
      // 平面环带（圆盘 / 圆环）：平面投影
      const ch = k.chart(`${name}:b${gi}`, 2 * rmax, 2 * rmax, { density: density[gi] ?? 1 });
      for (const sg of list) {
        const ring = (p, n2) => {
          const ids = [];
          for (let j = 0; j <= segs; j++) {
            const t = ang(j);
            const x = p[0] * Math.sin(t), z = p[0] * Math.cos(t);
            ids.push(part.v([x, p[1], z], [n2[0] * Math.sin(t), n2[1], n2[0] * Math.cos(t)], [x, z], ch,
              [(x / rmax + 1) / 2, (z / rmax + 1) / 2]));
          }
          return ids;
        };
        const A = ring(sg.a, sg.na), B = ring(sg.b, sg.nb);
        for (let j = 0; j < segs; j++) part.quad(A[j], A[j + 1], B[j + 1], B[j]);
      }
      continue;
    }

    // 圆柱展开环带，周长过长时沿圆周切成几片
    const C = 2 * Math.PI * rmax;
    const K = Math.min(segs, k.pieces(`${name}:b${gi}`, C, maxChart));
    for (let p = 0; p < K; p++) {
      const c0 = Math.round((p * segs) / K), c1 = Math.round(((p + 1) * segs) / K);
      const ch = k.chart(`${name}:b${gi}.${p}`, C / K, L, { density: density[gi] ?? 1 });
      for (const sg of list) {
        const ring = (pt, n2, s) => {
          const ids = [];
          for (let j = c0; j <= c1; j++) {
            const t = ang(j);
            const arc = ((2 * Math.PI * j) / segs) * rmax;
            const px = pt[0] * Math.sin(t), pz = pt[0] * Math.cos(t);
            const t0 = grain === 'planar' ? [px, pz] : grain === 'profile' ? [s, arc] : [arc, s];
            ids.push(part.v(
              [px, pt[1], pz],
              [n2[0] * Math.sin(t), n2[1], n2[0] * Math.cos(t)],
              t0, ch, [(j - c0) / (c1 - c0), (s - s0) / L],
            ));
          }
          return ids;
        };
        const A = ring(sg.a, sg.na, sg.sa), B = ring(sg.b, sg.nb, sg.sb);
        for (let j = 0; j < c1 - c0; j++) part.quad(A[j], A[j + 1], B[j + 1], B[j]);
      }
    }
  }
  if (xf) part.transform(xf instanceof Xform ? xf : xf);
  return part;
}
