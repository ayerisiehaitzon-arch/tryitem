import { profile, rect, circle } from '../core/shape.js';
import { xf } from '../core/vec.js';
import { roundedPath } from '../core/path.js';
import { barPull } from '../furniture/parts.js';
import { reedProfile } from '../kitchen/cabinetry.js';

// 浴室柜：悬挂在墙上的胡桃木柜 + 大理石台面 + 台上陶瓷盆 + 入墙黄铜龙头，上方一面黄铜框圆镜
//   · 原点在墙根、宽度中点（z = 0 是墙，y = 0 是地面）。贴着墙和地面两个面：墙上一张接触阴影，
//     地上一张 —— 柜子离地 42cm，地上是柜底投下的一片软影；
//   · 抽屉面是竖向凸条（和岛台同一个截面函数），两头封边；上沿一根黄铜 D 形拉手；
//   · 台上盆是一次车削：外壁 → 盆沿 → 内壁一直到盆底，法线平滑；盆底一枚黄铜下水盖；
//   · 龙头入墙：墙上一个圆底座，出水管平伸出去、末端往下一弯；右边同一高度一个黄铜旋钮；
//   · 圆镜：银镜（金属度 1、几乎没有粗糙度，直接映出环境）+ 一圈车削的黄铜框，
//     一根皮带挂在上方的黄铜墙钮上。
const W = 1.0, D = 0.44;
const Y0 = 0.42, Y1 = 0.84;
const TOP = { t: 0.02, side: 0.01, front: 0.02 };
const BASIN = { z: 0.25, r: 0.2 };
const MIRROR = { r: 0.3, y: 1.52 };
const REED = { n: 28, base: 0.012, sag: 0.006, ends: true };

export default {
  id: 'vanity',
  name: '浴室柜',
  nameEn: 'Floating Walnut Vanity & Mirror',
  category: 'bathroom',
  mount: 'wall',
  planes: ['wall', 'floor'],
  aoDensity: 130,
  shadow: {
    wall: { margin: 0.14, maxDist: 0.3, density: 70, strength: 0.75 },
    floor: { margin: 0.28, maxDist: 0.8, density: 45, strength: 0.45 },
  },
  view: { el: 12, az: 28 },
  build(k) {
    const q = (...v) => k.q(...v);
    const top = Y1 + TOP.t;
    // —— 柜体：背面贴墙，顶面被台面盖住 ——
    k.box({
      name: 'body', mat: 'walnut', size: [W, Y1 - Y0, D], r: q(0.004, 0.003, 0), segs: q(1, 1, 0), grain: 'x',
      omit: ['nz', 'py'], density: { ny: 0.6, pz: 0.4 },
      xf: xf({ pos: [0, (Y0 + Y1) / 2, D / 2] }),
    });
    // —— 抽屉面：竖向凸条，四周比柜体缩进 5mm ——
    const e = 0.005, crest = D + REED.base + REED.sag;
    k.sweep({
      name: 'reeds', mat: 'walnut', shape: reedProfile(k, -W / 2 + e, W / 2 - e, REED), up: [0, 0, 1], caps: [false, false],
      path: [[0, Y0 + e, D], [0, Y1 - e, D]], maxChart: 1.2,
    });
    k.box({
      name: 'reedsSole', mat: 'walnut', size: [W - 2 * e, 0.001, REED.base + REED.sag], segs: 0, omit: ['py', 'px', 'nx', 'pz', 'nz'],
      xf: xf({ pos: [0, Y0 + e - 0.0005, D + (REED.base + REED.sag) / 2] }),
    });
    if (k.lod < 2) barPull(k, { name: 'pull', mat: 'brass', len: 0.26, depth: 0.026, r: 0.0055, segs: q(6, 5), corner: 0.01, csegs: q(2, 1), pos: [0, Y1 - 0.055, crest], axis: 'x' });
    // —— 台面：前角小圆角，上沿 2mm 圆边 ——
    const tw = W + 2 * TOP.side, td = D + TOP.front;
    k.extrude({
      name: 'top', mat: 'marble_slab', shape: rect(tw, td, { corners: [0.004, 0.004, 0, 0], segs: q(2, 1, 1) }), depth: TOP.t, axis: 'y',
      caps: [false, true], bevel: [0, q(0.002, 0.002, 0)], bsegs: 1,
      xf: xf({ pos: [0, Y1, td / 2] }),
    });
    // —— 台上盆（车削）+ 下水盖 ——
    const s = { smooth: true };
    k.lathe({
      name: 'basin', mat: 'ceramic', segs: q(20, 14, 10),
      profile: profile([
        [0.085, 0], [0.14, 0.034, s], [0.186, 0.085, s], [0.2, 0.128, { r: q(0.004, 0.003, 0), segs: 1 }],
        [0.19, 0.13, { r: q(0.004, 0.003, 0), segs: 1 }], [0.168, 0.075, s], [0.1, 0.034, s], [0, 0.026],
      ]),
      xf: xf({ pos: [0, top, BASIN.z] }),
    });
    if (k.lod < 2) {
      // 盆底中间是个浅锥：下水盖的外沿落在锥面上
      k.lathe({ name: 'drain', mat: 'brass', segs: q(10, 6), profile: profile([[0.022, 0], [0.02, 0.001], [0, 0.0012]]), xf: xf({ pos: [0, top + 0.028, BASIN.z] }) });
    }
    // —— 入墙龙头：墙上的圆底座 + 出水管；上面一个旋钮 ——
    const toWall = [Math.PI / 2, 0, 0]; // 车削轴 → +z
    const ys = top + 0.2, xk = 0.17;
    const rose = (name, x) => k.lathe({
      name, mat: 'brass', segs: q(10, 8, 6),
      profile: profile([[0.028, 0], [0.028, 0.005], [0.012, 0.011, { smooth: true }], [0.009, 0.016]]),
      xf: xf({ pos: [x, ys, 0], rot: toWall }),
    });
    rose('spoutRose', 0);
    k.sweep({
      name: 'spout', mat: 'brass', shape: circle(0.0085, q(8, 6, 5)), caps: [false, true], up: [1, 0, 0],
      path: roundedPath([[0, ys, 0.012], [0, ys, 0.2], [0, ys - 0.035, 0.23]], 0.03, q(3, 2, 1)),
    });
    // 旋钮在出水口右边，同一高度（两件式入墙龙头）
    if (k.lod < 2) {
      rose('knobRose', xk);
      k.lathe({
        name: 'knob', mat: 'brass', segs: q(10, 8),
        profile: profile([[0.02, 0.012], [0.021, 0.04, { r: q(0.004, 0), segs: 1 }], [0, 0.041]]),
        xf: xf({ pos: [xk, ys, 0], rot: toWall }),
      });
    }
    // —— 圆镜：银镜 + 黄铜框（车削，框的内唇压住镜子边缘）——
    const ms = q(32, 22, 14);
    const at = xf({ pos: [0, MIRROR.y, 0], rot: toWall });
    k.lathe({ name: 'mirror', mat: 'mirror', segs: ms, profile: profile([[MIRROR.r, 0.012], [0, 0.012]]), xf: at });
    k.lathe({
      name: 'frame', mat: 'brass', segs: ms,
      profile: profile([
        [MIRROR.r + 0.012, 0], [MIRROR.r + 0.012, 0.014, { r: q(0.004, 0.003, 0), segs: 1 }],
        [MIRROR.r - 0.004, 0.02], [MIRROR.r - 0.004, 0.012],
      ]),
      xf: at,
    });
    // 皮带：从墙钮垂下来，钻到镜框和镜子后面（只露出墙钮到镜框之间的一段）；墙钮是一个黄铜小圆钮
    const hy = MIRROR.y + MIRROR.r + 0.16;
    if (k.lod < 2) {
      k.sweep({
        name: 'strap', mat: 'leather', shape: rect(0.028, 0.004), caps: [false, false], up: [0, 0, 1],
        path: [[0, hy + 0.01, 0.006], [0, MIRROR.y + MIRROR.r - 0.03, 0.006]],
      });
    }
    k.lathe({
      name: 'hook', mat: 'brass', segs: q(10, 8, 6),
      profile: profile([[0.016, 0], [0.016, 0.006], [0.009, 0.012, { smooth: true }], [0.012, 0.03, { smooth: true }], [0, 0.034]]),
      xf: xf({ pos: [0, hy, 0], rot: toWall }),
    });
  },
};
