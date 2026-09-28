import { profile, rect } from '../core/shape.js';
import { xf } from '../core/vec.js';
import { roundedPath } from '../core/path.js';
import { roundLeg } from '../furniture/parts.js';
import { PLY_T } from '../materials/library.js';
import { outline, plyPanel, plyBent, flipPart } from './ply.js';
import { rainbow, block, house, pictureBook } from './toys.js';

// 玩具柜：一整块弯曲的桦木胶合板绕成柜体（上下左右一圈，四个大圆角），立在四条圆腿上
//   · 柜体正面的一圈板边露出 13 层单板，顺着圆角一起弯过去（弯曲胶合板的边就是这样）；
//   · 两块竖隔板分出三格：左右两格各一只亚麻收纳筐（一只推到底，一只拉出来一点），中间一格一块层板，
//     下层立着几本绘本，上层一排小木房子；
//   · 柜顶：一套彩虹叠叠乐、一摞方块积木。
// 原点在墙根、宽度中点（z = 0 是墙面），背板离墙 1.2cm。
const W = 1.2, H = 0.5, D = 0.38, LEG = 0.12, RC = 0.07;
const T = PLY_T;
const ZB = 0.012, ZF = ZB + D; // 柜体背面、正面
const Y0 = LEG, Y1 = LEG + H;  // 柜体底面（外）、顶面（外）
const BAY = (W - 2 * T - 2 * T) / 3; // 每格的净宽
const XD = BAY / 2 + T / 2; // 隔板中心

export default {
  id: 'toy_cabinet',
  name: '玩具柜',
  nameEn: 'Bent Birch Toy Cabinet',
  category: 'kids',
  planes: ['floor', 'wall'],
  aoDensity: 150,
  shadow: {
    floor: { margin: 0.14, maxDist: 0.35, density: 90 },
    wall: { margin: 0.1, maxDist: 0.3, density: 70, strength: 0.7 },
  },
  view: { el: 16, az: 28 },
  build(k) {
    const q = (...v) => k.q(...v);
    // —— 柜体：一圈弯曲胶合板（路径是外表面，逆时针）——
    const c = { r: RC, segs: q(8, 5, 3) };
    const loop = outline([[-W / 2, Y0, c], [W / 2, Y0, c], [W / 2, Y1, c], [-W / 2, Y1, c]]);
    plyBent(k, { name: 'shell', path: loop, D, n: q(2, 1, 1), xf: xf({ pos: [0, 0, ZB] }), density: { in: 0.8 } });
    // 背板（6mm，只有朝里的一面看得见）：嵌在柜体里
    const ci = { r: RC - T, segs: q(8, 5, 3) };
    const inner = outline([[-W / 2 + T, Y0 + T, ci], [W / 2 - T, Y0 + T, ci], [W / 2 - T, Y1 - T, ci], [-W / 2 + T, Y1 - T, ci]]);
    plyPanel(k, { name: 'back', outline: inner, T: 0.006, faces: [true, false], edge: false, xf: xf({ pos: [0, 0, ZB + 0.003] }), density: { front: 0.5 } });

    // —— 两块竖隔板（比柜体正面缩进 1cm），中间一格一块层板 ——
    const zBack = ZB + 0.006, zFront = ZF - 0.01;
    const sc = { r: 0.003, segs: 1 };
    const div = outline([[zBack, Y0 + T, sc], [zFront, Y0 + T, sc], [zFront, Y1 - T, sc], [zBack, Y1 - T, sc]]);
    for (const s of [-1, 1]) {
      plyPanel(k, {
        name: `divider${s > 0 ? 'R' : 'L'}`, outline: div, grain: Math.PI / 2, n: q(2, 1, 1),
        edge: (p) => p[0] > zFront - 0.004, xf: xf({ pos: [s * XD, 0, 0], rot: [0, -Math.PI / 2, 0] }),
      });
    }
    const ys = (Y0 + Y1) / 2;
    const shelf = outline([[-XD + T / 2, -zFront, sc], [XD - T / 2, -zFront, sc], [XD - T / 2, -zBack, sc], [-XD + T / 2, -zBack, sc]]);
    plyPanel(k, {
      name: 'shelf', outline: shelf, n: q(2, 1, 1), edge: (p) => p[1] < -zFront + 0.004,
      xf: xf({ pos: [0, ys, 0], rot: [-Math.PI / 2, 0, 0] }),
    });

    // —— 腿：四条锥形圆腿，插进柜底 ——
    for (const [i, sx, z] of [[0, -1, ZF - 0.07], [1, 1, ZF - 0.07], [2, 1, ZB + 0.07], [3, -1, ZB + 0.07]]) {
      roundLeg(k, { name: `leg${i}`, mat: 'birch', r0: 0.012, r1: 0.017, h: LEG + 0.004, segs: q(8, 6, 5), pos: [sx * (W / 2 - 0.13), 0, z] });
    }

    // —— 收纳筐：亚麻布，四壁微微鼓出来；口沿一圈包边，正面一个布提手 ——
    const bin = (name, mat, x, pull) => {
      const bs = [BAY - 0.04, 0.27, D - 0.05], bh = bs.map((v) => v / 2);
      const zc = ZF - 0.012 - bh[2] + pull;
      const at = (p) => xf({ pos: [x + p[0], Y0 + T + p[1], zc + p[2]] });
      k.box({
        name: `${name}Out`, mat, size: bs, r: q(0.022, 0.018, 0.012), segs: q(2, 1, 1), div: q([2, 2, 2], [1, 1, 1], 1),
        omit: ['py'], puff: q({ sideX: 0.007, sideZ: 0.007 }, { sideX: 0.005, sideZ: 0.005 }, null), grain: 'x',
        xf: at([0, bh[1], 0]),
      });
      // 内壁（翻过来的盒子）：口沿以下看得见，底被 AO 压暗
      const t = 0.005;
      flipPart(k.box({
        name: `${name}In`, mat, size: [bs[0] - 2 * t, bs[1] - t, bs[2] - 2 * t], r: q(0.018, 0.014, 0), segs: q(1, 1, 0),
        omit: ['py'], grain: 'x', density: { ny: 0.5 }, xf: at([0, bh[1] + t / 2, 0]),
      }));
      // 口沿：一圈半圆包边（沿口沿的圆角矩形走）
      const rr = q(0.022, 0.018, 0.012) - t / 2;
      const rim = outline([[-bh[0] + t / 2, -bh[2] + t / 2, { r: rr, segs: q(3, 2, 1) }], [bh[0] - t / 2, -bh[2] + t / 2, { r: rr, segs: q(3, 2, 1) }],
        [bh[0] - t / 2, bh[2] - t / 2, { r: rr, segs: q(3, 2, 1) }], [-bh[0] + t / 2, bh[2] - t / 2, { r: rr, segs: q(3, 2, 1) }]]);
      const half = [];
      for (let i = 0; i <= q(3, 2, 1); i++) {
        const a = (Math.PI * i) / q(3, 2, 1);
        half.push([(t / 2 + 0.0008) * Math.cos(a), (t / 2 + 0.0008) * Math.sin(a), { smooth: true }]);
      }
      k.sweep({
        name: `${name}Rim`, mat, shape: profile(half), closed: true, caps: [false, false], up: [0, 1, 0],
        path: rim.map(([px, pz]) => [x + px, Y0 + T + bs[1], zc - pz]),
      });
      // 提手：正面一条布带，两头缝在筐上，中间鼓出来
      if (k.lod < 2) {
        const yh = Y0 + T + bs[1] - 0.045, zf = zc + bh[2] + 0.004;
        k.sweep({
          name: `${name}Handle`, mat, shape: rect(0.004, 0.024), caps: [false, false], up: [0, 1, 0],
          path: roundedPath([[x - 0.045, yh, zf - 0.003], [x - 0.03, yh, zf + 0.016], [x + 0.03, yh, zf + 0.016], [x + 0.045, yh, zf - 0.003]], 0.01, q(2, 1)),
        });
      }
    };
    bin('binL', 'linen_blush', -(XD + T / 2 + BAY / 2), 0);
    bin('binR', 'linen_sage', XD + T / 2 + BAY / 2, 0.045);

    // —— 中间一格：下层绘本，上层小房子 ——
    const yIn = Y0 + T; // 柜底内表面
    const books = [
      { w: 0.21, h: 0.2, t: 0.011, color: 'blue', x: -0.16 },
      { w: 0.19, h: 0.22, t: 0.013, color: 'yellow', x: -0.146 },
      { w: 0.2, h: 0.19, t: 0.01, color: 'green', x: -0.132 },
    ];
    books.forEach((b, i) => {
      pictureBook(k, { name: `book${i}`, ...b, place: xf({ pos: [b.x, yIn, ZF - 0.03], rot: [0, 0, 0] }) });
    });
    // 第四本往左斜靠在第三本的上角：左面在 0.19m 高处碰到 x = -0.127；绕底边转 0.3 弧度，底角抬起 t/2·sinθ 免得插进柜底
    pictureBook(k, { name: 'book3', w: 0.2, h: 0.2, t: 0.012, color: 'pink', place: xf({ pos: [-0.0625, yIn + 0.0018, ZF - 0.035], rot: [0, 0, 0.3] }) });
    // 右边平放一本（先放倒，再在水平面里转一点）
    pictureBook(k, {
      name: 'book4', w: 0.22, h: 0.2, t: 0.012, color: 'teal',
      place: xf({ pos: [0.172, yIn + 0.006, ZF - 0.045], rot: [0, 0.05, 0] }).mul(xf({ rot: [0, 0, Math.PI / 2] })),
    });
    // 小房子各级 LOD 都留着（LOD2 没有倒角，一栋 36 个三角形）：AO 图集是 LOD0 烘的，去掉了会在层板上留下影子
    const yS = ys + T / 2;
    house(k, { name: 'house0', w: 0.07, h: 0.07, d: 0.06, body: 'cream', roof: 'red', place: xf({ pos: [-0.105, yS, ZF - 0.13], rot: [0, 0.25, 0] }) });
    house(k, { name: 'house1', w: 0.06, h: 0.1, d: 0.06, body: 'pink', roof: 'blue', place: xf({ pos: [0.0, yS, ZF - 0.15], rot: [0, -0.1, 0] }) });
    house(k, { name: 'house2', w: 0.065, h: 0.055, d: 0.06, body: 'yellow', roof: 'green', place: xf({ pos: [0.1, yS, ZF - 0.12], rot: [0, -0.3, 0] }) });

    // —— 柜顶：彩虹叠叠乐 + 一摞方块 ——
    rainbow(k, {
      name: 'arc', colors: ['red', 'orange', 'yellow', 'green', 'blue', 'lilac'], R: 0.14,
      place: xf({ pos: [-0.26, Y1, ZB + 0.2], rot: [0, 0.18, 0] }),
    });
    const cube = 0.045;
    block(k, { name: 'cube0', size: [cube, cube, cube], color: 'yellow', pos: [0.28, Y1, ZB + 0.2], rot: [0, 0.2, 0] });
    block(k, { name: 'cube1', size: [cube, cube, cube], color: 'teal', pos: [0.284, Y1 + cube, ZB + 0.198], rot: [0, 0.55, 0] });
    block(k, { name: 'cube2', size: [cube, cube, cube], color: 'pink', pos: [0.28, Y1 + 2 * cube, ZB + 0.2], rot: [0, 0.05, 0] });
    block(k, { name: 'cube3', size: [cube, cube, cube], color: 'beech', pos: [0.35, Y1, ZB + 0.24], rot: [0, -0.3, 0] });
  },
};
