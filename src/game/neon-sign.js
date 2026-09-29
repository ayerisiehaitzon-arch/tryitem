import { rect, circle, profile } from '../core/shape.js';
import { xf } from '../core/vec.js';
import { roundedPath } from '../core/path.js';
import { GLYPHS, textWidth } from '../materials/gym-textures.js';
import { srgb } from '../materials/library.js';
import { sw } from './parts.js';

// 霓虹灯牌：墙上一块透明亚克力板，四颗镀铬的支撑钉，板前面弯着粉红色的“GAME ON”灯管。
//   · 灯管的走向就是贴图里那套细线字体的笔画（和配重片、灯箱上的字同一份数据）：每一笔一条圆截面的扫掠，
//     折角处倒一个小圆（霓虹灯管是烧弯的）；灯管整根自发光；
//   · 墙上那一片粉红的光晕是烘焙的光斑：每一段灯管当作一条线光源，亚克力板按 90% 透光算；
//   · 壁挂：原点在墙面上、灯牌的中心（z = 0 是墙，灯牌朝 +z）。
const H = 0.17, TEXT = 'GAME ON', TRACK = 0.2;
const TUBE = { r: 0.0056, z: 0.05 };
const PANEL = { w: 1.04, h: 0.33, z: 0.03, t: 0.006 };

// 每一笔：3D 折线（米），灯牌中心在原点
function strokes() {
  const out = [];
  let x = -textWidth(TEXT, H) / 2;
  for (const ch of TEXT) {
    const g = GLYPHS[ch];
    for (const line of g.s ?? []) out.push(line.map(([gx, gy]) => [x + gx * H, H / 2 - gy * H, TUBE.z]));
    x += (g.w + TRACK) * H;
  }
  return out;
}
const STROKES = strokes();
const closedLoop = (pts) => Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) < 1e-6;

export default {
  id: 'neon_sign',
  name: '霓虹灯牌',
  nameEn: 'Neon Sign',
  category: 'game',
  mount: 'wall',
  aoDensity: 260,
  shadow: { margin: 0.12, maxDist: 0.12, density: 150, strength: 0.6 },
  glow: {
    lights: STROKES.flatMap((pts) => pts.slice(1).map((b, i) => ({ a: pts[i], b, power: Math.hypot(b[0] - pts[i][0], b[1] - pts[i][1]) }))),
    rect: { u0: -0.7, u1: 0.7, v0: -0.44, v1: 0.44 }, fade: [0.3, 0.3, 0.3, 0.3], transmit: { glass: 0.9 },
    density: 100, samples: 200, strength: 1.3, gamma: 0.9, color: srgb(255, 70, 190),
  },
  view: { el: 6, az: 18 },
  build(k) {
    const q = (...v) => k.q(...v);
    // —— 亚克力板（圆角矩形挤出）和四颗支撑钉 ——
    k.extrude({ name: 'panel', mat: 'glass', shape: rect(PANEL.w, PANEL.h, { r: 0.022, segs: q(3, 2, 1) }), depth: PANEL.t, xf: xf({ pos: [0, 0, PANEL.z] }) });
    for (const [i, [sx, sy]] of [[-1, -1], [1, -1], [-1, 1], [1, 1]].entries()) {
      sw(k.lathe({
        name: `standoff${i}`, mat: 'game', segs: q(10, 6, 4),
        profile: profile([[0.0095, 0], [0.0095, PANEL.z + PANEL.t + 0.006, { r: 0.003, segs: 1 }], [0, PANEL.z + PANEL.t + 0.008]]),
        xf: xf({ pos: [sx * (PANEL.w / 2 - 0.03), sy * (PANEL.h / 2 - 0.03), 0], rot: [Math.PI / 2, 0, 0] }),
      }), 'chrome');
    }
    // 变压器：板后面右下角一个小黑盒（隔着亚克力看得见）
    sw(k.box({ name: 'driver', mat: 'game', size: [0.1, 0.045, 0.025], r: q(0.004, 0), segs: q(1, 0), omit: ['nz'], xf: xf({ pos: [PANEL.w / 2 - 0.14, -PANEL.h / 2 + 0.05, 0.0125] }) }), 'black');

    // —— 灯管：每一笔一条扫掠，折角倒小圆 ——
    STROKES.forEach((pts, i) => {
      const closed = closedLoop(pts);
      const path = closed ? pts.slice(0, -1) : roundedPath(pts, pts.map((_, j) => (j === 0 || j === pts.length - 1 ? 0 : 0.012)), q(3, 2, 1));
      sw(k.sweep({ name: `tube${i}`, mat: 'game', shape: circle(TUBE.r, q(7, 5, 4)), path, closed, up: [0, 0, 1], caps: [!closed, !closed] }), 'neonPink');
      // 灯管两头的黑色电极护套（伸进板子里）
      if (!closed && k.lod < 2) {
        for (const [n, e] of [['A', pts[0]], ['B', pts[pts.length - 1]]]) {
          sw(k.lathe({ name: `cap${i}${n}`, mat: 'game', segs: 6, profile: profile([[0.0058, 0], [0.0058, TUBE.z - PANEL.z - PANEL.t], [0, TUBE.z - PANEL.z - PANEL.t]]), xf: xf({ pos: [e[0], e[1], PANEL.z + PANEL.t], rot: [Math.PI / 2, 0, 0] }) }), 'black');
        }
      }
    });
  },
};
