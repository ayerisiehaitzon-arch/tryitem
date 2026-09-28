import { shape, rect, circle, profile } from '../core/shape.js';
import { xf } from '../core/vec.js';
import { roundedPath } from '../core/path.js';
import { gymHexUV, gymSwatch } from '../materials/atlas.js';
import { swatch } from './parts.js';

// 哑铃架：两层的黑钢哑铃架，架上八对六角橡胶哑铃（2.5 ~ 20kg），架子右前方的地上一只铸铁壶铃。
//   · 两头的架子是一根方钢管弯成的“梯形框”（一条闭合路径的扫掠，四个角倒圆），两层托板是橡木板，
//     往前倾 10°（哑铃头朝外、拿取顺手），前沿一道黑钢挡边；托板前后各一根横梁连到两头的框上；
//   · 哑铃头是六边形的挤出（平的一面朝下放着），两端倒角；整个哑铃头按“到中心的距离 / 外接圆半径”铺进图集里
//     这个重量的那一格 —— 端面上是一圈凸起的六边形边框和白色的重量（2.5 KG ……），侧面落在格子边上的黑橡胶里；
//   · 握把是滚花镀铬（单独一张可平铺的滚花贴图，一颗颗 2mm 的小金字塔）。
// 原点在架子占地的中心（地面上），哑铃头朝 +z
const FX = 0.68; // 两头框的位置（架子总长 1.4m）
const TUBE = 0.04;
const TILT = (10 * Math.PI) / 180;
// 框：前脚、前上角、后上角、后脚（y, z）
const FRAME = [[0.02, 0.29], [0.8, 0.11], [0.8, -0.11], [0.02, -0.29]];
// 框前后两条腿在高度 y 处的 z（腿是直线）
const legZ = (y, s) => s * (FRAME[0][1] + ((FRAME[1][1] - FRAME[0][1]) * (y - FRAME[0][0])) / (FRAME[1][0] - FRAME[0][0]));
// 两层托板：前沿的高度（托板往前倾，前低后高）
const TIERS = [
  { yf: 0.3, weights: [4, 5, 6, 7] },
  { yf: 0.6, weights: [0, 1, 2, 3] },
];
// 每个重量的哑铃：外接圆半径 R、单个哑铃头长 hl、握把半径 hr
const BELLS = [
  { R: 0.047, hl: 0.045, hr: 0.0155 }, { R: 0.056, hl: 0.055, hr: 0.0155 }, { R: 0.062, hl: 0.062, hr: 0.016 }, { R: 0.067, hl: 0.07, hr: 0.016 },
  { R: 0.071, hl: 0.078, hr: 0.0165 }, { R: 0.075, hl: 0.085, hr: 0.0165 }, { R: 0.078, hl: 0.092, hr: 0.017 }, { R: 0.082, hl: 0.098, hr: 0.017 },
];
const GRIP = 0.13; // 两个哑铃头之间的握把长

// 一只哑铃（局部坐标：原点在握把中心，轴沿 z，六边形平的一面朝下；底面在 y = -R·cos30°）
function dumbbell(k, name, wi, place) {
  const q = (...v) => k.q(...v);
  const { R, hl, hr } = BELLS[wi];
  const hex = shape(Array.from({ length: 6 }, (_, i) => [R * Math.cos((i * Math.PI) / 3), R * Math.sin((i * Math.PI) / 3)]));
  const rubber = gymSwatch('rubber');
  for (const s of [-1, 1]) {
    // 只有朝外的一端倒角；朝握把的一端是直角 —— 那一面单独涂成纯橡胶（上面不印字），不会和侧面的 UV 连成一片
    const b = q(0.004, 0.003, 0);
    const zIn = s > 0 ? GRIP / 2 : -GRIP / 2;
    const head = k.extrude({
      name: `${name}${s > 0 ? 'F' : 'B'}`, mat: 'gym', shape: hex, depth: hl, axis: 'z',
      bevel: s > 0 ? [0, b] : [b, 0], bsegs: 1, xf: xf({ pos: [0, 0, s > 0 ? zIn : zIn - hl] }),
    });
    // 按到轴心的位置铺进这一格：外端面上看得见重量（从外面看是正的），侧面落在格子边上的黑橡胶里
    head.T = head.P.map((p, i) => (Math.abs(p[2] - zIn) < 1e-6 && Math.abs(head.N[i][2]) > 0.9
      ? rubber : gymHexUV(wi, (s * p[0]) / R, -p[1] / R)));
    head.transform(place);
  }
  if (k.lod < 2) {
    k.sweep({
      name: `${name}Grip`, mat: 'knurl', shape: circle(hr, q(10, 6)), caps: [false, false],
      path: [[0, 0, -GRIP / 2 - 0.01], [0, 0, GRIP / 2 + 0.01]].map((p) => place.apply(p)),
    });
  }
}

export default {
  id: 'dumbbell_rack',
  name: '哑铃架',
  nameEn: 'Two-Tier Dumbbell Rack',
  category: 'gym',
  aoDensity: 150,
  shadow: { margin: 0.2, maxDist: 0.5, density: 70 },
  view: { el: 18, az: 24 },
  build(k) {
    const q = (...v) => k.q(...v);
    const tube = rect(TUBE, TUBE, { r: q(0.005, 0), segs: q(1, 0) });

    // —— 两头的梯形框：一根方钢管沿闭合路径弯出来，四个角倒圆 ——
    for (const s of [-1, 1]) {
      // 从底边中点出发绕一圈：四个角都倒圆
      const pts = FRAME.map(([y, z]) => [s * FX, y, z]);
      const mid = [s * FX, FRAME[0][0], 0];
      k.sweep({
        name: `frame${s > 0 ? 'R' : 'L'}`, mat: 'steel', shape: tube, closed: true, caps: [false, false], up: [1, 0, 0],
        path: roundedPath([mid, ...pts, mid], 0.05, q(3, 2, 1)).slice(0, -1),
      });
      // 橡胶脚垫
      for (const z of [FRAME[0][1] - 0.01, FRAME[3][1] + 0.01]) {
        swatch(k.box({
          name: `foot${s > 0 ? 'R' : 'L'}${z > 0 ? 'F' : 'B'}`, mat: 'gym', size: [0.05, 0.012, 0.06], r: q(0.003, 0), segs: q(1, 0), omit: ['ny'],
          xf: xf({ pos: [s * FX, 0.006, z] }),
        }), 'rubber');
      }
    }

    // —— 两层托板：前后两根横梁正好接在两头框的前腿、后腿上（后梁高一点，托板往前倾 10°），
    //    橡木板搁在两根梁上，前沿一道钢挡边 ——
    TIERS.forEach((tier, ti) => {
      const y1 = tier.yf, z1 = legZ(y1, 1);
      let y2 = y1 + 0.07, z2 = legZ(y2, -1);
      for (let it = 0; it < 4; it++) { y2 = y1 + Math.tan(TILT) * (z1 - z2); z2 = legZ(y2, -1); }
      const span = Math.hypot(z1 - z2, y2 - y1), d = span + 0.06;
      // 托板坐标系：原点在两根梁中心连线的中点，绕 x 转 TILT（+z 是前沿，往下倾）
      const tilt = xf({ pos: [0, (y1 + y2) / 2, (z1 + z2) / 2], rot: [TILT, 0, 0] });
      const top = 0.015 + 0.022; // 托板上表面（梁 3cm 见方，板厚 22mm）
      k.box({
        name: `tray${ti}`, mat: 'oak', size: [2 * FX - TUBE, 0.022, d], r: q(0.003, 0.002, 0), segs: q(1, 1, 0), grain: 'x',
        omit: ['px', 'nx'], density: { ny: 0.4 }, xf: tilt.mul(xf({ pos: [0, 0.015 + 0.011, 0] })),
      });
      k.box({
        name: `lip${ti}`, mat: 'steel', size: [2 * FX - TUBE, 0.05, 0.006], r: q(0.002, 0), segs: q(1, 0), omit: ['px', 'nx'],
        xf: tilt.mul(xf({ pos: [0, 0.04, d / 2 + 0.003] })),
      });
      for (const [e, zz] of [['F', span / 2], ['B', -span / 2]]) {
        k.sweep({
          name: `beam${ti}${e}`, mat: 'steel', shape: rect(0.03, 0.03), caps: [false, false], up: [0, 1, 0],
          path: [[-FX, 0, zz], [FX, 0, zz]].map((p) => tilt.apply(p)),
        });
      }
      // 哑铃：一对一对，从左往右由轻到重；平的一面贴着托板，顺着托板往前倾
      const widths = tier.weights.map((wi) => BELLS[wi].R * Math.sqrt(3));
      const total = widths.reduce((a, w) => a + 2 * w, 0);
      const gapIn = 0.01, room = 2 * FX - TUBE - 0.06;
      const gapOut = (room - total - tier.weights.length * gapIn) / (tier.weights.length - 1);
      let x = -room / 2;
      tier.weights.forEach((wi, j) => {
        const w = widths[j], ap = BELLS[wi].R * Math.cos(Math.PI / 6);
        for (let m = 0; m < 2; m++) {
          const rnd = k.rand(`bell${ti}${j}${m}`);
          dumbbell(k, `bell${ti}${j}${m}`, wi, tilt.mul(xf({ pos: [x + w / 2, top + ap, (rnd() - 0.5) * 0.012] })));
          x += w + (m === 0 ? gapIn : 0);
        }
        x += gapOut;
      });
    });

    // —— 地上一只 16kg 的铸铁壶铃 ——
    {
      const place = xf({ pos: [0.52, 0, 0.42], rot: [0, -0.5, 0] });
      const s = { smooth: true };
      swatch(k.lathe({
        name: 'kettlebell', mat: 'gym', segs: q(16, 10, 8),
        profile: profile([[0.045, 0], [0.09, 0.03, s], [0.105, 0.1, s], [0.088, 0.165, s], [0.05, 0.195, s], [0, 0.2]]),
        xf: place,
      }), 'iron');
      swatch(k.sweep({
        name: 'kettlebellHandle', mat: 'gym', shape: circle(0.017, q(10, 6, 4)), caps: [false, false], up: [0, 0, 1],
        path: roundedPath([[-0.07, 0.15, 0], [-0.075, 0.27, 0], [0.075, 0.27, 0], [0.07, 0.15, 0]], 0.05, q(4, 2, 1)).map((p) => place.apply(p)),
      }), 'iron');
    }
  },
};
