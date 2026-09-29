import { gameSwatch } from '../materials/atlas.js';

// 游戏室几件东西共用的小工具
// 部件整个指向游戏室图集里的一个纯色格子
export function sw(part, name) {
  const uv = gameSwatch(name);
  part.T = part.T.map(() => uv);
  return part;
}
// 按顶点位置（和法线）给 UV
export function mapUV(part, f) {
  part.T = part.P.map((p, i) => f(p, part.N[i]));
  return part;
}
export { ccw } from '../gym2/parts.js';
// 圆弧上的点：圆心 c = [x, z]、半径 r，角度 a0 → a1（弧度），n 段
export function arcPts(c, r, a0, a1, n) {
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / n;
    return [c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)];
  });
}
