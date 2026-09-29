import { profile } from '../core/shape.js';
import { xf } from '../core/vec.js';
import { GAME_ATLAS, gameUV } from '../materials/atlas.js';
import { sw, mapUV } from './parts.js';

// 桌上足球：胡桃木的箱体架在四条收分的方腿上，台面是一块印着球场的板（割草纹、边线、中圈、禁区、角球弧）。
//   · 八根镀铬拉杆横穿球场：从一端的球门到另一端依次是 红门将、红后卫（2 人）、蓝前锋（3 人）、红中场（5 人）、
//     蓝中场（5 人）、红前锋（3 人）、蓝后卫（2 人）、蓝门将 —— 每队的手柄都在自己那一侧，另一侧只露出一截杆头；
//     杆子穿过箱壁的地方各一个黑色的轴套；
//   · 球员是车削的小人：脚、腿、身子、脖子、脑袋，拉杆正好穿过胸口，脚尖离台面 3mm；
//   · 两端的箱壁上挖着球门，门洞里是黑的；门下面是出球口；每一端的顶上一根钢丝串着十颗计分珠（拨过去三颗）；
//   · 箱体四个顶角包着黑色的护角；腿之间一个“H”形的拉档，脚下橡胶垫；台面上一颗白球。
// 原点在占地中心（地面上），球场的长边沿 x
const F = { y: 0.72, hx: 0.6, hz: 0.341 };            // 台面
const TOP = 0.91, BOT = 0.64, LW = 0.04, EW = 0.06;   // 箱壁顶、箱底、长边壁厚、端壁厚
const ROD = { y: 0.813, r: 0.008 };
const GOAL = { hz: 0.1, h: 0.08 };
// 八根杆：x、哪一队（1 = 红，手柄在 +z；-1 = 蓝，手柄在 -z）、每根杆上球员的 z
const RODS = [
  [-0.525, 1, [0]], [-0.375, 1, [-0.12, 0.12]], [-0.225, -1, [-0.2, 0, 0.2]], [-0.075, 1, [-0.24, -0.12, 0, 0.12, 0.24]],
  [0.075, -1, [-0.24, -0.12, 0, 0.12, 0.24]], [0.225, 1, [-0.2, 0, 0.2]], [0.375, -1, [-0.12, 0.12]], [0.525, -1, [0]],
];

export default {
  id: 'foosball_table',
  name: '桌上足球',
  nameEn: 'Foosball Table',
  category: 'game',
  aoDensity: 200,
  shadow: { margin: 0.2, maxDist: 0.6, density: 70 },
  view: { el: 26, az: 30 },
  build(k) {
    const q = (...v) => k.q(...v);
    const sm = { smooth: true };
    const wood = (name, size, pos, o = {}) => k.box({ name, mat: 'walnut', size, r: q(0.004, 0.003, 0), segs: q(1, 1, 0), xf: xf({ pos }), ...o });
    const game = (name, size, pos, swatch, o = {}) => sw(k.box({ name, mat: 'game', size, r: q(0.003, 0), segs: q(1, 0), xf: xf({ pos }), ...o }), swatch);

    // —— 台面：印着球场的一块板 ——
    {
      const { w: FW, h: FH } = GAME_ATLAS.field;
      const field = k.box({ name: 'field', mat: 'game', size: [2 * F.hx, 0.004, 2 * F.hz], segs: 0, omit: ['px', 'nx', 'ny', 'pz', 'nz'] });
      mapUV(field, (v) => gameUV('field', (v[0] + FW / 2) / FW, (v[2] + FH / 2) / FH));
      field.transform(xf({ pos: [0, F.y - 0.002, 0] }));
    }
    // —— 箱体：两块长壁、两块端壁（挖球门）、箱底 ——
    const XO = F.hx + EW, ZO = F.hz + LW;
    for (const s of [1, -1]) {
      wood(`wall${s > 0 ? 'F' : 'B'}`, [2 * XO, TOP - BOT, LW], [0, (TOP + BOT) / 2, s * (F.hz + LW / 2)], { grain: 'x', r: q(0.006, 0.004, 0), segs: q(2, 1, 0) });
      const x = s * (F.hx + EW / 2);
      for (const t of [1, -1]) {
        wood(`end${s > 0 ? 'R' : 'L'}${t > 0 ? 'F' : 'B'}`, [EW, TOP - BOT, F.hz - GOAL.hz], [x, (TOP + BOT) / 2, t * (GOAL.hz + F.hz) / 2], { grain: 'y' });
      }
      wood(`goalTop${s > 0 ? 'R' : 'L'}`, [EW, TOP - F.y - GOAL.h, 2 * GOAL.hz], [x, (TOP + F.y + GOAL.h) / 2, 0], { grain: 'z' });
      wood(`goalSill${s > 0 ? 'R' : 'L'}`, [EW, F.y - BOT, 2 * GOAL.hz], [x, (F.y + BOT) / 2, 0], { grain: 'z' });
      // 门洞里的黑盒子（回球槽）和门下面的出球口
      game(`goalBox${s > 0 ? 'R' : 'L'}`, [0.03, GOAL.h, 2 * GOAL.hz], [s * (F.hx + 0.04), F.y + GOAL.h / 2, 0], 'black', { segs: 0 });
      game(`tray${s > 0 ? 'R' : 'L'}`, [0.05, 0.035, 0.12], [s * (XO + 0.022), BOT + 0.04, 0], 'black', { r: q(0.008, 0.005, 0), segs: q(2, 1, 0) });
      // 顶角的护角
      for (const t of [1, -1]) game(`corner${s > 0 ? 'R' : 'L'}${t > 0 ? 'F' : 'B'}`, [0.075, 0.035, 0.07], [s * (XO - 0.035), TOP - 0.012, t * (ZO - 0.033)], 'black', { r: q(0.008, 0.006, 0), segs: q(2, 1, 0) });
    }
    wood('bottom', [2 * XO, 0.02, 2 * ZO], [0, BOT + 0.01, 0], { grain: 'x', omit: ['py'] });

    // —— 四条收分的方腿、H 形拉档、橡胶脚垫 ——
    for (const sx of [1, -1]) for (const sz of [1, -1]) {
      wood(`leg${sx > 0 ? 'R' : 'L'}${sz > 0 ? 'F' : 'B'}`, [0.075, BOT, 0.075], [sx * (XO - 0.07), BOT / 2, sz * (ZO - 0.07)], {
        grain: 'y', omit: ['py'], deform: (p) => { const s = 0.78 + 0.22 * (p[1] / BOT + 0.5); return [p[0] * s, p[1], p[2] * s]; },
      });
      sw(k.lathe({ name: `foot${sx > 0 ? 'R' : 'L'}${sz > 0 ? 'F' : 'B'}`, mat: 'game', segs: q(8, 6, 4), profile: profile([[0.034, 0], [0.034, 0.012, { r: 0.003, segs: 1 }], [0, 0.014]]), xf: xf({ pos: [sx * (XO - 0.07), -0.002, sz * (ZO - 0.07)] }) }), 'rubber');
    }
    for (const sx of [1, -1]) wood(`stretch${sx > 0 ? 'R' : 'L'}`, [0.04, 0.05, 2 * (ZO - 0.07)], [sx * (XO - 0.07), 0.16, 0], { grain: 'z' });
    wood('stretchMid', [2 * (XO - 0.07), 0.05, 0.04], [0, 0.16, 0], { grain: 'x' });

    // —— 拉杆、手柄、轴套、球员 ——
    const onZ = (pos) => xf({ pos, rot: [Math.PI / 2, 0, 0] });   // 车削轴 +y → +z
    // 球员的轮廓：脚、腿、胸口、脖子、脑袋（点少，明暗靠平滑法线）
    const player = profile(k.lod < 1
      ? [[0, 0], [0.013, 0.002, sm], [0.0085, 0.035, sm], [0.0165, 0.082, sm], [0.0065, 0.103], [0.0122, 0.114, sm], [0.007, 0.125, sm], [0, 0.127]]
      : [[0, 0], [0.012, 0.002, sm], [0.009, 0.035, sm], [0.016, 0.082, sm], [0.007, 0.103], [0.012, 0.114, sm], [0, 0.127]]);
    RODS.forEach(([x, team, zs], i) => {
      const zIn = -team * (ZO + 0.09), zOut = team * (ZO + 0.26);   // 杆头一侧露 9cm，手柄一侧伸出 26cm
      const z0 = Math.min(zIn, zOut), z1 = Math.max(zIn, zOut);
      sw(k.lathe({ name: `rod${i}`, mat: 'game', segs: q(7, 5, 4), profile: profile([[0, 0], [ROD.r, 0, { r: 0.002, segs: 1 }], [ROD.r, z1 - z0 - 0.002], [0, z1 - z0]]), xf: onZ([x, ROD.y, z0]) }), 'chrome');
      // 手柄（黑色橡胶，末端圆头）
      const hz = team > 0 ? z1 - 0.13 : z0;
      sw(k.lathe({
        name: `handle${i}`, mat: 'game', segs: q(8, 6, 4), xf: onZ([x, ROD.y, hz]),
        profile: profile(team > 0
          ? [[0.012, 0], [0.0175, 0.012, sm], [0.019, 0.07, sm], [0.0175, 0.118, sm], [0.008, 0.13, sm], [0, 0.131]]
          : [[0, -0.001], [0.008, 0, sm], [0.0175, 0.012, sm], [0.019, 0.06, sm], [0.0175, 0.118, sm], [0.012, 0.13]]),
      }), 'rubber');
      // 杆头的橡胶帽
      const cz = team > 0 ? z0 : z1 - 0.02;
      sw(k.lathe({ name: `tip${i}`, mat: 'game', segs: q(8, 6, 4), profile: profile(team > 0 ? [[0, 0], [0.011, 0.002, sm], [0.011, 0.02]] : [[0.011, 0], [0.011, 0.018, sm], [0, 0.02]]), xf: onZ([x, ROD.y, cz]) }), 'rubber');
      if (k.lod < 1) {
        // 轴套：贴在长壁外面，圆头朝外
        for (const s of [1, -1]) sw(k.lathe({ name: `bush${i}${s > 0 ? 'F' : 'B'}`, mat: 'game', segs: q(8, 6), profile: profile([[0.016, 0], [0.016, 0.006], [ROD.r + 0.001, 0.008]]), xf: xf({ pos: [x, ROD.y, s * ZO], rot: [s * Math.PI / 2, 0, 0] }) }), 'black');
      }
      for (const [j, z] of zs.entries()) {
        sw(k.lathe({ name: `man${i}_${j}`, mat: 'game', segs: q(8, 5, 4), profile: player, xf: xf({ pos: [x, F.y + 0.003, z], rot: [0, (team > 0 ? 0 : Math.PI) + 0.3 * Math.sin(i * 3 + j), 0] }) }), team > 0 ? 'redTeam' : 'blueTeam');
      }
    });

    // —— 计分珠：每一端的顶上一根钢丝，十颗珠子（拨过去三颗）——
    if (k.lod < 2) {
      for (const s of [1, -1]) {
        const x = s * (F.hx + EW / 2), y = TOP + 0.022;
        sw(k.lathe({ name: `wire${s > 0 ? 'R' : 'L'}`, mat: 'game', segs: 5, profile: profile([[0.002, 0], [0.002, 0.52]]), xf: onZ([x, y, -0.26]) }), 'steel');
        for (const t of [1, -1]) game(`post${s > 0 ? 'R' : 'L'}${t > 0 ? 'F' : 'B'}`, [0.012, 0.024, 0.012], [x, TOP + 0.012, t * 0.26], 'steel', { segs: 0 });
        for (let b = 0; b < 10; b++) {
          const z = b < 3 ? 0.2 - b * 0.021 : -0.215 + (b - 3) * 0.021;
          sw(k.lathe({ name: `bead${s > 0 ? 'R' : 'L'}${b}`, mat: 'game', segs: q(7, 5), profile: profile([[0.003, -0.009], [0.0105, 0, sm], [0.003, 0.009]]), xf: onZ([x, y, z]) }), s > 0 ? 'blueTeam' : 'redTeam');
        }
      }
    }
    // 一颗球
    sw(k.lathe({ name: 'ball', mat: 'game', segs: q(12, 8, 6), profile: profile([[0, -0.0175], [0.012, -0.0127, sm], [0.0175, 0, sm], [0.012, 0.0127, sm], [0, 0.0175]]), xf: xf({ pos: [0.13, F.y + 0.0175, 0.07] }) }), 'white');
  },
};
