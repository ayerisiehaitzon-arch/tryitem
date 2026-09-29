import { profile, rect } from '../core/shape.js';
import { xf } from '../core/vec.js';
import { sw, mapUV, rod, invert, plateWithHole } from './parts.js';
import { cat, catFaceYaw } from './cat.js';

// 猫爬架：浅暖灰的短毛绒平台、缠满剑麻绳的柱子。
//   · 底板上左边一个方猫窝（正面开一个圆洞，里面黑乎乎的），右边一根矮的抓柱（顶上一块小圆台）；
//   · 三层平台：右边中层、左边高层，最高处一个带软边的大圆窝 —— 一只橘猫蜷在里面睡觉；
//   · 左边高层平台的前沿垂下一根线，吊着一个红色的毛球。
// 原点在底板正下方的地面，正面朝 +z。
const BASE = { w: 0.64, d: 0.46, t: 0.025 };
const CONDO = { x: -0.12, w: 0.36, h: 0.3, d: 0.34, r: 0.02, hole: 0.075 };
const POST_R = 0.045;
const PLAT_T = 0.025;
// 平台：[中心 x, 中心 z, 宽, 深, 底面高度]
const MID = [0.16, -0.03, 0.36, 0.32, 0.56], HIGH = [-0.17, -0.03, 0.4, 0.34, 0.9];
const PERCH = { x: 0.06, z: -0.02, y: 1.2 };
const SCRATCH = { x: 0.24, z: 0.17, top: 0.36, r: 0.09 };

export default {
  id: 'cat_tree',
  name: '猫爬架',
  nameEn: 'Cat Tree with Sleeping Cat',
  category: 'pets',
  aoDensity: 300,
  shadow: { margin: 0.15, maxDist: 0.9, density: 120 },
  view: { el: 16, az: 24 },
  build(k) {
    const q = (...v) => k.q(...v);
    const sm = { smooth: true };
    const board = (name, [cx, cz, w, d, y], r = 0.05) => k.extrude({ name, mat: 'plush', shape: rect(w, d, { r, segs: q(4, 3, 2) }), depth: PLAT_T, axis: 'y', bevel: { w: 0.008, h: 0.008 }, bsegs: q(2, 1, 1), xf: xf({ pos: [cx, y, cz] }) });

    // —— 底板 ——
    k.extrude({ name: 'base', mat: 'plush', shape: rect(BASE.w, BASE.d, { r: 0.06, segs: q(4, 3, 2) }), depth: BASE.t, axis: 'y', bevel: { w: 0.008, h: 0.008 }, bsegs: q(2, 1, 1), caps: [false, true] });

    // —— 猫窝：毛绒的方盒子，正面是一块开圆洞的板，里面衬一层反过来的深色内衬 ——
    {
      const { x, w, h, d, r } = CONDO, y0 = BASE.t, yc = y0 + h / 2;
      k.box({ name: 'condo', mat: 'plush', size: [w, h, d], r, segs: q(2, 1, 1), omit: ['pz'], xf: xf({ pos: [x, yc, 0] }) });
      const [front, back] = plateWithHole(k, 'condoFront', { mat: 'plush', w: w - 2 * r, h: h - 2 * r, t: 0.02, c: [0, -0.005], r: CONDO.hole, n: q(20, 14, 10) });
      // 板面按平面贴（放样自带的 UV 是绕着洞一圈的，毛绒会被拉成放射状）
      for (const p of [front, back]) mapUV(p, (v) => [v[0], v[1]]);
      for (const p of k.parts.filter((p) => p.name.startsWith('condoFront'))) p.transform(xf({ pos: [x, yc, d / 2 - 0.01] }));
      const lining = k.box({ name: 'condoLining', mat: 'pet', size: [w - 0.04, h - 0.04, d - 0.04], segs: 0, omit: ['pz'], xf: xf({ pos: [x, yc, 0] }) });
      sw(invert(lining), 'hole');
    }

    // —— 剑麻柱 ——
    const post = (name, x, z, y0, y1) => k.lathe({ name, mat: 'sisal', grain: 'around', segs: q(14, 10, 7), profile: profile([[POST_R, y0], [POST_R, y1]]), xf: xf({ pos: [x, 0, z] }) });
    post('postA', 0.2, -0.1, BASE.t, MID[4]);
    post('postB', -0.2, -0.08, BASE.t + CONDO.h, HIGH[4]);
    post('postC', 0.16, -0.06, MID[4] + PLAT_T, PERCH.y);
    post('postD', SCRATCH.x, SCRATCH.z, BASE.t, SCRATCH.top);

    // —— 平台 ——
    board('platMid', MID);
    board('platHigh', HIGH);
    k.lathe({ name: 'scratchTop', mat: 'plush', segs: q(18, 12, 8), profile: profile([[0, SCRATCH.top], [SCRATCH.r - 0.008, SCRATCH.top, sm], [SCRATCH.r, SCRATCH.top + 0.008, sm], [SCRATCH.r, SCRATCH.top + 0.017, sm], [SCRATCH.r - 0.008, SCRATCH.top + PLAT_T], [0, SCRATCH.top + PLAT_T]]), xf: xf({ pos: [SCRATCH.x, 0, SCRATCH.z] }) });

    // —— 最高处的大圆窝：底是平的，四周一圈鼓鼓的软边 ——
    k.lathe({ name: 'perch', mat: 'plush', segs: q(28, 18, 12), profile: profile([[0, 0], [0.222, 0], [0.24, 0.018, sm], [0.244, 0.052, sm], [0.23, 0.078, sm], [0.206, 0.083, sm], [0.191, 0.066, sm], [0.186, 0.042, sm], [0.168, 0.035], [0, 0.035]]), xf: xf({ pos: [PERCH.x, PERCH.y, PERCH.z] }) });
    // 脸朝着右前方（看过来的那一边）
    cat(k, xf({ pos: [PERCH.x, PERCH.y + 0.035, PERCH.z], rot: [0, 0.45 - catFaceYaw(), 0] }));

    // —— 垂下来的毛球 ——
    {
      const x = -0.08, z = HIGH[1] + HIGH[3] / 2 - 0.035, y1 = HIGH[4], y0 = 0.6;
      rod(k, 'string', [x, y1 + 0.004, z], [x, y0 + 0.026, z], 0.0012, 'string', { segs: q(5, 4, 3) });
      const ball = k.lathe({ name: 'pomPom', mat: 'pet', segs: q(12, 8, 6), profile: profile([[0, -0.028], [0.018, -0.022, sm], [0.028, 0, sm], [0.018, 0.022, sm], [0, 0.028]]) });
      ball.deform(([px, py, pz]) => { const f = 1 + 0.08 * Math.sin(px * 260) * Math.sin(py * 230 + 1) * Math.sin(pz * 250 + 2); return [px * f, py * f, pz * f]; });
      sw(ball, 'pomPom').transform(xf({ pos: [x, y0, z] }));
    }
  },
};
