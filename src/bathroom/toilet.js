import { profile, rect } from '../core/shape.js';
import { xf } from '../core/vec.js';
import { egg, eggShape } from './shapes.js';

// 马桶：落地、背面贴墙的连体式马桶，白色釉面陶瓷
//   · 原点在墙根、宽度中点（z = 0 是墙，马桶朝 +z 伸出；y = 0 是地面）。贴着地面和墙两个面：
//     AO 两个面都挡，接触阴影地上、墙上各一张；
//   · 底座和盆是一次放样：7 层“蛋形”截面（后半截方、贴墙的一面是平的，前半截圆、往前收窄），
//     从地面的小脚一路鼓到盆沿，最上面一层往里收一点，就是一圈圆润的肩；
//   · 盖子合着，盆里面不用建模。座圈、盖子各是一次挤出（同一种蛋形截面），
//     盖子比座圈小一圈、上沿一圈大圆边 —— 两层之间一道细缝，缝里的阴影是 AO；
//   · 水箱是圆角挤出，顶上一枚黄铜按钮；座圈后面两只黄铜合页。
const RIM = 0.405; // 盆沿高度
const SEAT = { t: 0.018, z0: 0.18, z1: 0.6, a: 0.176 };
const LID = { t: 0.024, inset: 0.004 };
const TANK = { w: 0.35, d: 0.16, top: 0.795 };

// 底座的层（从地面到盆沿）：高度、半宽、前沿；后沿都贴墙（z0 = 0）
const BODY = [
  [0, 0.128, 0.45], [0.07, 0.132, 0.465], [0.18, 0.145, 0.495], [0.28, 0.163, 0.54],
  [0.35, 0.177, 0.578], [0.39, 0.183, 0.597], [RIM, 0.178, 0.594],
];

export default {
  id: 'toilet',
  name: '马桶',
  nameEn: 'Back-to-Wall Toilet',
  category: 'bathroom',
  planes: ['floor', 'wall'],
  aoDensity: 160,
  shadow: {
    floor: { margin: 0.16, maxDist: 0.5, density: 90 },
    wall: { margin: 0.12, maxDist: 0.3, density: 80, strength: 0.7 },
  },
  view: { el: 16, az: 34 },
  build(k) {
    const q = (...v) => k.q(...v);
    const n = q(24, 16, 10);
    // —— 底座 + 盆：放样，顶上封口（被座圈、水箱盖住，只露出窄窄一条）——
    k.loft({
      name: 'body', mat: 'ceramic', caps: [false, true], density: { cap1: 0.4 },
      rings: BODY.map(([y, a, z1]) => egg(n, { y, a, z0: 0, z1, pb: 6, pf: 2.3, egg: 0.16 })),
    });
    // —— 座圈 + 盖子 ——
    const ns = q(22, 16, 10);
    const seatOutline = { a: SEAT.a, z0: SEAT.z0, z1: SEAT.z1, pb: 3, pf: 2.3, egg: 0.14 };
    k.extrude({
      name: 'seat', mat: 'ceramic', shape: eggShape(ns, seatOutline), depth: SEAT.t, axis: 'y', caps: [false, true],
      bevel: [0, q(0.004, 0.003, 0)], bsegs: 1, density: { side: 0.6, cap1: 0.3 },
      xf: xf({ pos: [0, RIM, 0] }),
    });
    const i = LID.inset;
    k.extrude({
      name: 'lid', mat: 'ceramic', axis: 'y', caps: [false, true],
      shape: eggShape(ns, { ...seatOutline, a: SEAT.a - i, z0: SEAT.z0 + i, z1: SEAT.z1 - i }), depth: LID.t,
      bevel: [0, q({ w: 0.016, h: 0.012 }, { w: 0.014, h: 0.01 }, { w: 0.01, h: 0.008 })], bsegs: q(2, 2, 1), density: { side: 0.6 },
      xf: xf({ pos: [0, RIM + SEAT.t, 0] }),
    });
    // —— 水箱：圆角挤出，上沿圆边；顶上一枚黄铜按钮 ——
    k.extrude({
      name: 'tank', mat: 'ceramic', shape: rect(TANK.w, TANK.d, { r: 0.028, segs: q(3, 2, 1) }), depth: TANK.top - RIM, axis: 'y',
      caps: [false, true], bevel: [0, q({ w: 0.012, h: 0.012 }, { w: 0.01, h: 0.01 }, { w: 0.006, h: 0.006 })], bsegs: q(3, 2, 1),
      xf: xf({ pos: [0, RIM, TANK.d / 2] }),
    });
    if (k.lod < 2) {
      k.lathe({
        name: 'button', mat: 'brass', segs: q(12, 8),
        profile: profile([[0.024, 0], [0.024, 0.003, { r: q(0.0015, 0), segs: 1 }], [0, 0.005]]),
        xf: xf({ pos: [0, TANK.top - 0.0005, TANK.d / 2] }),
      });
      // 合页：沿 x 的小圆柱（车削轴转到 x）
      for (const s of [-1, 1]) {
        k.lathe({
          name: `hinge${s > 0 ? 'R' : 'L'}`, mat: 'brass', segs: q(7, 5),
          profile: profile([[0, -0.016], [0.0085, -0.015], [0.0085, 0.015], [0, 0.016]]),
          xf: xf({ pos: [s * 0.095, RIM + 0.012, SEAT.z0 + 0.004], rot: [0, 0, Math.PI / 2] }),
        });
      }
    }
  },
};
