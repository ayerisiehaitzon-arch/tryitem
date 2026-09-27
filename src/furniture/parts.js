// 家具常用部件
import { profile, circle, shape } from '../core/shape.js';
import { xf } from '../core/vec.js';
import { roundedPath } from '../core/path.js';

// 车木锥形圆腿：底部小圆角，顶部不封口（插在别的部件里看不见）
//   r0 底半径，r1 顶半径，h 高度，segs 圆周分段
export function roundLeg(k, { name, mat, r0, r1, h, segs, foot = 0.002, topCap = false, pos = [0, 0, 0], rot = [0, 0, 0] }) {
  const pts = [[0, 0], [r0, 0, { r: k.q(foot, foot, 0), segs: 1 }], [r1, h]];
  if (topCap) pts.push([0, h]);
  return k.lathe({ name, mat, profile: profile(pts), segs, xf: xf({ pos, rot }) });
}

// 两点之间的圆管 / 圆棍（不封口）
export function rod(k, { name, mat, a, b, r, segs, caps = [false, false], up = [0, 1, 0] }) {
  return k.sweep({ name, mat, shape: circle(r, segs), path: [a, b], caps, up });
}

// 车削把手：底座 + 颈 + 扁球头
export function knob(k, { name, mat, d = 0.028, h = 0.026, segs = 8, pos, rot = [0, 0, 0] }) {
  const R = d / 2;
  const pts = [
    [0.5 * R, 0],
    [0.4 * R, 0.4 * h, { smooth: true }],
    [R, 0.72 * h, { smooth: true }],
    [0.7 * R, 0.98 * h, { smooth: true }],
    [0, h],
  ];
  return k.lathe({ name, mat, profile: profile(pts), segs, xf: xf({ pos, rot }) });
}

// 平面上的一段圆弧带（闭合截面），用于弧形靠背等：
// 圆心 (cx, cy)，半径 R，厚度 t，角度范围 [-a, a]（a 从 +y 方向算起，逆时针为正），
// 端头倒角 er。返回的截面在 shape 空间（逆时针）。
export function arcBand(R, t, a, n, { cx = 0, cy = 0, er = 0.003, esegs = 2 } = {}) {
  const pts = [];
  const ro = R + t / 2, ri = R - t / 2;
  // 外弧：从 +a 到 -a（shape 空间里 y 向上，弧顶在上方 → 逆时针需要从右往左）
  for (let i = 0; i <= n; i++) {
    const ang = a - (2 * a * i) / n;
    const o = i === 0 || i === n ? { r: er, segs: esegs } : { smooth: true };
    pts.push([cx + ro * Math.sin(ang), cy + ro * Math.cos(ang), o]);
  }
  for (let i = 0; i <= n; i++) {
    const ang = -a + (2 * a * i) / n;
    const o = i === 0 || i === n ? { r: er, segs: esegs } : { smooth: true };
    pts.push([cx + ri * Math.sin(ang), cy + ri * Math.cos(ang), o]);
  }
  return shape(pts);
}

// D 形拉手：两个立脚 + 一根横杆，一条扫掠路径一次做完（拐角倒圆，截面做斜接不会变细）。
// 拉手所在平面：沿 axis（'x' 横向 / 'y' 竖向）展开，+z 方向伸出面板；两端插进面板 3mm，不封口。
export function barPull(k, { name, mat, len, depth = 0.034, r = 0.0055, segs = 6, corner = 0.011, csegs = 2, pos, axis = 'y' }) {
  const e = axis === 'y' ? [0, 1, 0] : [1, 0, 0];
  const at = (t, z) => [pos[0] + e[0] * t, pos[1] + e[1] * t, pos[2] + z];
  const pts = [at(-len / 2, -0.003), at(-len / 2, depth), at(len / 2, depth), at(len / 2, -0.003)];
  return k.sweep({
    name, mat, shape: circle(r, segs), caps: [false, false],
    path: roundedPath(pts, corner, csegs),
    up: axis === 'y' ? [1, 0, 0] : [0, 1, 0],
  });
}
