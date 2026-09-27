import { shape } from '../core/shape.js';

// 浴室陶瓷件共用的“蛋形”截面：半宽 a，前后 z0..z1（z0 在墙那边），
// 后半截的方度 pb（超椭圆指数，越大越方 —— 贴墙的一面几乎是平的），前半截 pf，egg 让前端收窄。
// 返回 n 个 3D 点（高度 y），第 0 点在墙那边的正中（放样的接缝藏在墙后）
export function egg(n, { y = 0, a, z0, z1, pb = 5, pf = 2.3, egg: e = 0.15 }) {
  const zc = (z0 + z1) / 2, b = (z1 - z0) / 2;
  const pts = [];
  for (let j = 0; j < n; j++) {
    const t = -Math.PI / 2 + (j / n) * 2 * Math.PI;
    const c = Math.cos(t), s = Math.sin(t);
    const p = s < 0 ? pb : pf;
    const sx = Math.sign(c) * Math.abs(c) ** (2 / p), sz = Math.sign(s) * Math.abs(s) ** (2 / p);
    pts.push([a * sx * (1 - e * Math.max(0, sz)), y, zc + b * sz]);
  }
  return pts;
}

// 同一个蛋形做成挤出用的闭合截面（挤出方向 y：截面 x = 世界 x，截面 y = -z），整圈平滑、逆时针
export function eggShape(n, o) {
  const pts = egg(n, o).map(([x, , z]) => [x, -z, { smooth: true }]);
  let area = 0;
  for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; area += a[0] * b[1] - b[0] * a[1]; }
  return shape(area < 0 ? pts.reverse() : pts, { smooth: true });
}
