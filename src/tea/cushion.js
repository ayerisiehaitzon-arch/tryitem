import { curve, curveAt } from '../decor/profiles.js';
import { revolve } from '../decor/revolve.js';
import { STRAW, strawUV } from '../materials/atlas.js';

// 蒲团：蒲草编成三股辫，一圈圈盘起来缝成的圆墩，直径 47cm、高 13cm。
//   · 顶面是一条阿基米德螺线（每圈往外一个辫子宽），中心一个扎紧的结；侧面是一排排横着的辫子，
//     中间微微鼓出来，底边往里收；顶上一圈圆边把两部分接起来（两段曲线在接缝处切线相同，明暗连续）；
//   · 贴图（materials/tea-textures.js 的 straw）按同样的尺寸画：顶面俯视投影，侧面 u 绕一圈、v 从顶边往下量。
// 原点在底面中心
const SIDE = curve([
  [0.2, 0.0, { c: 1 }], [0.216, 0.005], [0.229, 0.018], [0.2365, 0.04], [0.2385, 0.065], [0.2365, 0.09], [0.2325, 0.102],
  [0.2285, 0.109], [0.222, 0.115],
]);
const TOP = curve([[0.222, 0.115], [0.2155, 0.121], [0.205, 0.1245], [0.17, 0.1272], [0.1, 0.1285], [0.0, 0.129]]);
const R0 = STRAW.R + 0.005, H = 0.15;

export default {
  id: 'tea_cushion',
  name: '蒲团',
  nameEn: 'Braided Cattail Floor Cushion',
  category: 'tea',
  aoDensity: 300,
  shadow: { margin: 0.1, maxDist: 0.3, density: 120 },
  view: { el: 30, az: 20, dist: 0.9 },
  build(k) {
    const q = (...v) => k.q(...v);
    const segs = q(36, 24, 14), tol = q(0.0008, 0.0016, 0.004);
    const Ls = SIDE.length;
    revolve(k, { name: 'side', mat: 'straw', cv: SIDE, segs, tol, uv: (u, v) => strawUV('side', u, ((1 - v) * Ls) / H) });
    revolve(k, {
      name: 'top', mat: 'straw', cv: TOP, segs, tol,
      uv: (u, v) => {
        const r = curveAt(TOP, v).r, a = Math.PI + 2 * Math.PI * u;
        return strawUV('top', (r * Math.sin(a) + R0) / (2 * R0), (r * Math.cos(a) + R0) / (2 * R0));
      },
    });
  },
};
