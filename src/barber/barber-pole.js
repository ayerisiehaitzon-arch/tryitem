import { profile } from '../core/shape.js';
import { xf } from '../core/vec.js';
import { srgb } from '../materials/library.js';
import { barberUV } from '../materials/atlas.js';
import { sw, rod, turned } from './parts.js';

// 理发店的旋转灯柱（挂墙）：墙上一条镀铬的背板、上下两根镀铬的支臂；
// 下面一个镀铬的尖底座，中间一截透明的玻璃筒，里面是红、白、蓝、白四道斜条纹的转筒（自发光），
// 上面一圈镀铬的盖子托着一只乳白的玻璃球灯，球顶一个镀铬的尖。
// 墙上的光斑是烘焙的贴花：转筒当作一条竖的线光源，玻璃球当作一个点光源。
// 壁挂：原点在墙面上（z = 0 是墙），y = 0 是最下面那个尖的高度；灯柱的轴离墙 13cm。
const Z = 0.13, sm = { smooth: true };
const P = { y0: 0.12, y1: 0.57, r: 0.07, glass: 0.08 };
const GLOBE = { y: 0.69, r: 0.068 };

export default {
  id: 'barber_pole',
  name: '理发店灯柱',
  nameEn: 'Barber Pole',
  category: 'barber',
  mount: 'wall',
  aoDensity: 260,
  shadow: { margin: 0.2, maxDist: 0.3, density: 150, fade: 0.3 },
  glow: {
    lights: [{ a: [0, P.y0 + 0.03, Z], b: [0, P.y1 - 0.03, Z], power: 3 }, { a: [0, GLOBE.y, Z], b: [0, GLOBE.y, Z], power: 2 }],
    rect: { u0: -0.42, u1: 0.42, v0: -0.2, v1: 1.0 }, fade: [0.3, 0.3, 0.26, 0.26],
    density: 110, samples: 120, strength: 0.55, gamma: 0.9, color: srgb(255, 232, 218),
  },
  view: { el: 8, az: 28 },
  build(k) {
    const q = (...v) => k.q(...v);
    const at = (y) => xf({ pos: [0, y, Z] });
    // —— 墙上的背板和两根支臂 ——
    sw(k.box({ name: 'backPlate', mat: 'barber', size: [0.05, 0.74, 0.008], r: 0.003, segs: q(1, 1, 0), omit: ['nz'], xf: xf({ pos: [0, 0.39, 0.004] }) }), 'chrome');
    for (const [i, y] of [[0, 0.1], [1, 0.605]]) rod(k, `arm${i}`, [0, y, 0.006], [0, y, Z - 0.05], 0.009, 'chrome', { segs: q(8, 6, 4) });
    // —— 下面的尖底座 ——
    turned(k, 'bottomCap', [[0, 0], [0.012, 0.012, sm], [0.022, 0.03, sm], [0.05, 0.062, sm], [0.078, 0.086, sm], [0.086, 0.1], [0.086, P.y0 + 0.004], [0.066, P.y0 + 0.004]], 'chrome', { segs: q(24, 16, 10), place: at(0) });
    // —— 转筒（贴图集里的条纹，u 绕一圈、v 沿高度）和外面的玻璃筒 ——
    const drum = k.lathe({ name: 'drum', mat: 'barber', grain: 'around', segs: q(28, 20, 12), profile: profile([[P.r, P.y0], [P.r, P.y1]]) });
    drum.T = drum.T.map(([a, s]) => barberUV('pole', a / (2 * Math.PI * P.r), 1 - s / (P.y1 - P.y0)));
    drum.transform(at(0));
    k.lathe({ name: 'glassTube', mat: 'glass', segs: q(28, 20, 12), profile: profile([[P.glass, P.y0], [P.glass, P.y1]]), xf: at(0) });
    // —— 上面的盖子、乳白球灯、球顶的尖 ——
    turned(k, 'topCap', [[0.066, P.y1 - 0.004], [0.086, P.y1 - 0.004], [0.086, P.y1 + 0.03, sm], [0.076, P.y1 + 0.05, sm], [0.064, P.y1 + 0.07], [0.058, P.y1 + 0.094]], 'chrome', { segs: q(24, 16, 10), place: at(0) });
    {
      const R = GLOBE.r, n = q(12, 8, 5), pts = [];
      const a0 = -Math.asin(0.45);
      for (let j = 0; j <= n; j++) { const a = a0 + ((Math.PI / 2 - a0) * j) / n; pts.push([R * Math.cos(a), R * Math.sin(a), sm]); }
      pts[pts.length - 1][0] = 0;
      k.lathe({ name: 'globe', mat: 'opal', segs: q(22, 16, 10), profile: profile(pts), xf: at(GLOBE.y) });
    }
    turned(k, 'finial', [[0.016, 0], [0.018, 0.006, sm], [0.012, 0.018, sm], [0.004, 0.034, sm], [0, 0.04]], 'chrome', { segs: q(12, 8, 6), place: at(GLOBE.y + GLOBE.r - 0.004) });
  },
};
