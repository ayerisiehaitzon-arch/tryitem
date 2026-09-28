import { theaterSwatch } from '../materials/atlas.js';

// 影音室几件东西共用的小工具
// 部件整个指向影音室图集里的一个纯色格子
export function sw(part, name) {
  const uv = theaterSwatch(name);
  part.T = part.T.map(() => uv);
  return part;
}
// 按顶点位置给 UV（位置是摆放以后的坐标）
export function mapUV(part, f) {
  part.T = part.P.map((p, i) => f(p, part.N[i]));
  return part;
}
// 把截面点列（[x, y, opts?]）整理成逆时针（外法线朝外）
export function ccw(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a < 0 ? [...pts].reverse() : pts;
}
