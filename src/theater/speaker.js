import { shape, profile } from '../core/shape.js';
import { xf } from '../core/vec.js';
import { curve } from '../decor/profiles.js';
import { revolve } from '../decor/revolve.js';
import { theaterUV, THEATER_ATLAS } from '../materials/atlas.js';
import { sw, mapUV, ccw } from './parts.js';

// 落地音箱：1.1m 高的三分频落地箱，一对放在幕布两边。
//   · 箱体的横截面是一只琵琶形：正面平、两侧先微微鼓出再往后收，收成一道窄窄的圆背（沿高度挤出，胡桃木纹横着绕一圈，
//     顶上一圈圆边）；正面贴一块黑色皮革的面板；
//   · 喇叭单元都是车削的：铝的高音波导里一颗深灰的丝膜球顶；中音是银灰色的编织振膜、中间一颗铝的相位塞；
//     两只低音是深灰纸盆、黑色的防尘帽，每只外面一圈橡胶折环、一圈深色的金属饰圈；单元都装在 3.2cm 厚的面板的开孔里
//     （面板沿中线分成左右两半，每半带一串半圆缺口）；
//     振膜按自己的展开（u 绕一圈、v 从外沿到中心）映射到图集里画好的纤维 / 编织纹；
//   · 面板下方一个圆的倒相孔（喇叭口往里收），最底下一块铝铭牌；
//   · 箱体坐在一块往外放出 2cm 的黑色底座上，底座下面三颗镀铬的钉脚（前两后一）。
// 原点在占地的中心（地面上），正面朝 +z
const SP = { y0: 0.06, h: 1.04, zf: 0.17, baffle: { w: 0.22, h: 1.0, t: 0.032 } };
const ZB = SP.zf + SP.baffle.t;   // 面板正面

// 一侧的半宽（从正面往后）：正面两角圆、两侧先鼓后收、背后收成一道圆
const SIDE = [[0.124, 0.14], [0.126, 0.08], [0.121, 0.0], [0.108, -0.06], [0.088, -0.11], [0.064, -0.15], [0.04, -0.178], [0.018, -0.192]];
function outline(k, grow = 0) {
  const q = (...v) => k.q(...v);
  const sm = { smooth: true };
  const g = (x, z) => [x + Math.sign(x) * grow, z];
  const pts = [
    [...g(-0.118, SP.zf + grow), { r: q(0.018, 0.014, 0.008) + grow, segs: q(3, 2, 1) }],
    [...g(0.118, SP.zf + grow), { r: q(0.018, 0.014, 0.008) + grow, segs: q(3, 2, 1) }],
    ...SIDE.map(([x, z]) => [...g(x, z - (z < 0 ? grow : 0)), sm]),
    [0, -0.196 - grow, sm],
    ...[...SIDE].reverse().map(([x, z]) => [...g(-x, z - (z < 0 ? grow : 0)), sm]),
  ];
  // (x, z) → 挤出轴 'y' 的截面坐标 (x, -z)
  return shape(ccw(pts.map(([x, z, o]) => [x, -z, o])));
}

// 一只喇叭单元：place 把单元的轴（车削的 y）转到 +z，y = 0 是面板表面
function driver(k, name, place, d) {
  const q = (...v) => k.q(...v);
  const sm = { smooth: true };
  const segs = q(...d.segs);
  const [R0, R1] = d.ring;
  sw(k.lathe({ name: `${name}Ring`, mat: 'theater', segs, profile: profile([[R0, -0.002], [R0, 0.003, { r: 0.002, segs: 1 }], [R1 + 0.002, 0.004, sm], [R1, 0.0]]), xf: place }), 'darkMetal');
  const [S0, S1] = d.sur, rc = (S0 + S1) / 2, rr = (S0 - S1) / 2;
  const ns = q(4, 2, 1);
  const sur = [];
  for (let i = 0; i <= ns; i++) {
    const ph = (Math.PI * i) / ns;
    sur.push([rc + rr * Math.cos(ph), -0.001 + rr * 0.9 * Math.sin(ph), i === 0 || i === ns ? {} : sm]);
  }
  sw(k.lathe({ name: `${name}Surround`, mat: 'theater', segs, profile: profile(sur), xf: place }), 'rubber');
  // 振膜：略带弧度的锥面，贴图按展开映射
  const [C0, C1] = d.cone, dep = d.depth;
  const cv = curve([[C0, -0.001, { c: 1 }], [(C0 + C1) / 2 + 0.004, -dep * 0.62], [C1, -dep]]);
  revolve(k, { name: `${name}Cone`, mat: 'theater', cv, segs, tol: q(0.0015, 0.003, 0.006), uv: (u, v) => theaterUV(d.tex, u, v), xf: place });
  if (d.plug) {
    const c = C1;
    sw(k.lathe({ name: `${name}Plug`, mat: 'theater', segs, profile: profile([[c, -dep], [c * 0.96, -dep + 0.012, sm], [c * 0.72, -dep + 0.023, sm], [c * 0.36, -dep + 0.029, sm], [0, -dep + 0.031]]), xf: place }), 'aluminum');
  } else {
    const c = C1, hh = d.cap;
    sw(k.lathe({ name: `${name}Cap`, mat: 'theater', segs, profile: profile([[c, -dep], [c * 0.8, -dep + hh * 0.6, sm], [c * 0.45, -dep + hh * 0.92, sm], [0, -dep + hh]]), xf: place }), 'felt');
  }
}

export default {
  id: 'tower_speaker',
  name: '落地音箱',
  nameEn: 'Floor-Standing Tower Speaker',
  category: 'theater',
  aoDensity: 260,
  shadow: { margin: 0.12, maxDist: 0.45, density: 110 },
  view: { el: 12, az: 28 },
  build(k) {
    const q = (...v) => k.q(...v);
    const { y0, h, zf, baffle: BF } = SP;

    // —— 底座和钉脚 ——
    const PB = { y: 0.025, t: 0.035 };
    sw(k.extrude({
      name: 'plinth', mat: 'theater', shape: outline(k, 0.02), depth: PB.t, axis: 'y',
      bevel: [0, q(0.003, 0.002, 0)], bsegs: 1, xf: xf({ pos: [0, PB.y, 0] }),
    }), 'satinBlack');
    // 三颗钉脚：前面两颗、后面一颗（三点落地，地面不平也不晃）
    for (const [i, [x, z]] of [[-0.12, 0.175], [0.12, 0.175], [0, -0.19]].entries()) {
      sw(k.lathe({ name: `spike${i}`, mat: 'theater', segs: q(10, 6, 4), profile: profile([[0.0006, 0], [0.011, 0.018], [0.011, PB.y]]), xf: xf({ pos: [x, 0, z] }) }), 'chrome');
    }

    // —— 箱体：琵琶形截面挤出，顶上圆边；木纹横着绕 ——
    k.extrude({
      name: 'cabinet', mat: 'walnut', shape: outline(k), depth: h, axis: 'y', grain: 'across',
      bevel: [q(0.003, 0.002, 0), { w: q(0.009, 0.007, 0.004), h: q(0.009, 0.007, 0.004) }], bsegs: q(3, 2, 1),
      density: { cap0: 0.2 }, xf: xf({ pos: [0, y0, 0] }),
    });
    // —— 黑色皮面板：3.2cm 厚，单元装在面板的开孔里。挤出只认简单多边形，所以面板沿中线分成左右两半，
    //    每半是外框加上一串半圆缺口（和博古架的月洞、扶手箱的杯架一样），两半共用一个纹理偏移 ——
    const YT = y0 + h - 0.1, YM = y0 + h - 0.245, YA = y0 + 0.555, YB = y0 + 0.335, YP = y0 + 0.145;
    const holes = [[YT, 0.046], [YM, 0.075], [YA, 0.095], [YB, 0.095], [YP, 0.04]];
    {
      const na = q(8, 6, 4), yb0 = y0 + h / 2 - BF.h / 2, yb1 = yb0 + BF.h, corner = { r: q(0.006, 0.004, 0), segs: 1 };
      for (const sx of [-1, 1]) {
        const pts = [[0, yb0], [BF.w / 2, yb0, corner], [BF.w / 2, yb1, corner], [0, yb1]];
        for (const [yc, r] of holes) {
          for (let i = 0; i <= na; i++) {
            const th = Math.PI / 2 - (Math.PI * i) / na;
            pts.push([r * Math.cos(th), yc + r * Math.sin(th), i === 0 || i === na ? {} : { smooth: true }]);
          }
        }
        const part = k.extrude({
          name: `baffle${sx > 0 ? 'R' : 'L'}`, mat: 'leather_black', shape: shape(ccw(pts.map(([x, y, o]) => [sx * x, y, o]))), depth: BF.t,
          // 不倒角：倒角会顺着中缝也倒一道，拼起来中间一条 V 形槽
          caps: [false, true], grain: 'len', xf: xf({ pos: [0, 0, zf] }),
        });
        part.uvKey = 'baffle';
      }
    }

    // —— 喇叭单元 ——
    const at = (y) => xf({ pos: [0, y, ZB], rot: [Math.PI / 2, 0, 0] });
    // 高音：铝波导 + 丝膜球顶
    {
      const P = at(YT), sm = { smooth: true };
      sw(k.lathe({ name: 'tweeterGuide', mat: 'theater', segs: q(16, 10, 8), profile: profile([[0.05, -0.002], [0.05, 0.003, { r: 0.002, segs: 1 }], [0.042, 0.0035, sm], [0.03, -0.0015, sm], [0.02, -0.006, sm], [0.016, -0.0075]]), xf: P }), 'aluminum');
      sw(k.lathe({ name: 'tweeterDome', mat: 'theater', segs: q(14, 10, 6), profile: profile([[0.016, -0.0075], [0.013, -0.0028, sm], [0.007, 0.0006, sm], [0, 0.0016]]), xf: P }), 'silk');
    }
    driver(k, 'mid', at(YM), { segs: [16, 10, 8], ring: [0.078, 0.073], sur: [0.072, 0.066], cone: [0.066, 0.02], depth: 0.02, tex: 'weave', plug: true });
    driver(k, 'wooferA', at(YA), { segs: [20, 12, 8], ring: [0.098, 0.093], sur: [0.092, 0.083], cone: [0.083, 0.032], depth: 0.028, cap: 0.012, tex: 'cone' });
    driver(k, 'wooferB', at(YB), { segs: [20, 12, 8], ring: [0.098, 0.093], sur: [0.092, 0.083], cone: [0.083, 0.032], depth: 0.028, cap: 0.012, tex: 'cone' });
    // 倒相孔：喇叭口往面板里收
    {
      const sm = { smooth: true };
      // 管子伸到面板背后，管底一块黑盖子：从正面看进去是一个深洞
      sw(k.lathe({ name: 'port', mat: 'theater', segs: q(14, 10, 6), profile: profile([[0.043, -0.001], [0.043, 0.002, { r: 0.0015, segs: 1 }], [0.035, 0.0015, sm], [0.029, -0.01, sm], [0.028, -BF.t + 0.002], [0, -BF.t + 0.002]]), xf: at(YP) }), 'felt');
    }
    // 铭牌
    {
      const { w: BW, h: BH } = THEATER_ATLAS.badge;
      const yb = y0 + 0.07;
      const badge = k.box({ name: 'badge', mat: 'theater', size: [BW, BH, 0.0008], segs: 0, omit: ['px', 'nx', 'py', 'ny', 'nz'], xf: xf({ pos: [0, yb, ZB + 0.0004] }) });
      mapUV(badge, (p) => theaterUV('badge', (p[0] + BW / 2) / BW, (yb + BH / 2 - p[1]) / BH));
    }
  },
};
