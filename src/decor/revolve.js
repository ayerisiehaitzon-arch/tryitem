import { sampleCurve } from './profiles.js';

// 沿设计曲线车削出一件器物（花瓶 / 花盆）。
//   · 轮廓取点：按剪影误差 tol 自适应（profiles.js），法线是曲线的真实法线；
//   · 圆周分段 segs 和 tol 取同一量级的误差（半径 r、分段 n 的剪影误差 ≈ r·(1 - cos(π/n))）；
//   · UV0 = uv(u, v)：u 绕一圈 0→1（接缝在背面 -Z），v 为高精度弧长 / 总长 —— 各级 LOD 贴图完全对齐；
//   · UV1（AO）：每个分区（外壁 / 内壁）一个圆柱展开图块，图块 id 稳定，低 LOD 直接复用。
export function revolve(k, { name, mat, cv, segs, tol, maxAngle = 0.9, uv, scale = 1, xf: place = null, density = {} }) {
  const part = k.part(mat, name);
  const rings = sampleCurve(cv, { tol: tol / scale, maxAngle });
  const charts = {};
  for (const [z, info] of Object.entries(cv.zones)) {
    charts[z] = k.chart(`${name}:${z}`, 2 * Math.PI * info.rmax * scale, (info.s1 - info.s0) * scale, { density: density[z] ?? 1 });
  }
  const ids = rings.map((R) => {
    const z = cv.zones[R.zone];
    const row = [];
    for (let j = 0; j <= segs; j++) {
      const a = Math.PI + (2 * Math.PI * j) / segs, sa = Math.sin(a), ca = Math.cos(a);
      row.push(part.v(
        [R.p[0] * sa * scale, R.p[1] * scale, R.p[0] * ca * scale],
        [R.n[0] * sa, R.n[1], R.n[0] * ca],
        uv(j / segs, R.v), charts[R.zone], [j / segs, (R.s - z.s0) / Math.max(1e-9, z.s1 - z.s0)],
      ));
    }
    return row;
  });
  for (let i = 0; i + 1 < rings.length; i++) {
    const A = rings[i], B = rings[i + 1];
    if (A.zone !== B.zone) continue; // 分区边界上的重复环
    if (Math.hypot(A.p[0] - B.p[0], A.p[1] - B.p[1]) < 1e-9) continue; // 拐角处的重复环
    for (let j = 0; j < segs; j++) part.quad(ids[i][j], ids[i][j + 1], ids[i + 1][j + 1], ids[i + 1][j]);
  }
  if (place) part.transform(place);
  return part;
}
