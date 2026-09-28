import { profile, triangulate } from '../core/shape.js';
import { pianoSwatch, pianoUV, scoreUV, SCORE } from '../materials/atlas.js';
import { HARP } from './outline.js';

// 钢琴图集（piano 材质）上的取色：部件整个指向一个纯色格子
export function swatch(part, name) {
  const uv = pianoSwatch(name);
  part.T = part.T.map(() => uv);
  return part;
}

// 琴肚子里俯视的一点 → 音板 / 铁骨贴图上的 UV
export const harpUV = (x, z) => pianoUV('harp', (x - HARP.x0) / (HARP.x1 - HARP.x0), (HARP.z0 - z) / (HARP.z0 - HARP.z1));

// 一块水平的平面多边形（琴底板、琴肚子里的平面）：pts 是 [x, z] 点列，up 决定朝上还是朝下
export function flatPoly(k, { name, mat, pts, y, up = true, uv = null, density = 1 }) {
  const part = k.part(mat, name);
  const xs = pts.map((p) => p[0]), zs = pts.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
  const ch = k.chart(`${name}:f`, x1 - x0, z1 - z0, { density });
  const n = [0, up ? 1 : -1, 0];
  const ids = pts.map(([x, z]) => part.v([x, y, z], n, uv ? uv(x, z) : [x, z], ch, [(x - x0) / (x1 - x0), (z - z0) / (z1 - z0)]));
  for (const [a, b, c] of triangulate(pts)) part.tri(ids[a], ids[b], ids[c]);
  return part;
}

// 一本摊开的乐谱：左右两页，每页的正面（谱）和背面（空白）各是一次扫掠；页面从书脊往外先鼓起来、再落回到外沿。
// 局部坐标：书脊底端为原点，x 横跨书页（+x 是右页），y 沿书页往上，z 朝着看谱的人；place 把它放到谱架上。
// 扫掠的标架：路径沿 +y，“上”取 +z → 截面的 x 对应局部的 -x，截面的 y 对应 +z；
// 开放截面的外法线在行进方向右侧，所以正面的截面点按局部 x 从左往右排
export function scoreSpread(k, { name, place, pages, bow = 0.01, segs = 8 }) {
  const { W, H } = SCORE;
  const blank = scoreUV(pages[0], SCORE.blank[0], SCORE.blank[1]);
  pages.forEach((page, side) => {
    const s = side ? 1 : -1;
    // 页面截面：t = 0 书脊，t = 1 外沿
    const pt = (t, off) => [-s * W * t, bow * Math.sin(Math.PI * Math.pow(t, 0.75)) + 0.0025 * t + off];
    const ts = Array.from({ length: segs + 1 }, (_, i) => i / segs);
    for (const face of ['F', 'B']) {
      const off = face === 'F' ? 0 : -0.0004;
      // 正面：局部 x 从左往右；背面反过来
      let order = side ? ts : [...ts].reverse();
      if (face === 'B') order = [...order].reverse();
      const pts = order.map((t, i) => {
        const p = pt(t, off);
        return i === 0 || i === order.length - 1 ? p : [p[0], p[1], { smooth: true }];
      });
      const part = k.sweep({
        name: `${name}${side}${face}`, mat: 'score', shape: profile(pts), caps: [false, false], up: [0, 0, 1],
        path: [[0, 0, 0], [0, H, 0]],
      });
      part.T = part.P.map((p) => {
        if (face === 'B') return blank;
        const u = side ? p[0] / W : (p[0] + W) / W;
        return scoreUV(page, Math.min(1, Math.max(0, u)), Math.min(1, Math.max(0, 1 - p[1] / H)));
      });
      part.transform(place);
    }
  });
}
