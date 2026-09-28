import { shape, rect, profile } from '../core/shape.js';
import { xf, smoothstep } from '../core/vec.js';
import { GYM2_ATLAS, gym2UV } from '../materials/atlas.js';
import { sw, mapUV, ccw, catmull } from './parts.js';

// 水阻划船机：橡木框架 + 透明水箱，拉的时候桨叶在水里搅，阻力来自水。
//   · 前面一块方形橡木底板，上面坐着一只透明水箱：箱壁有厚度（从外面能看见远处那一面箱壁），上下两道黑色箍，
//     箱里的水是半透明的蓝绿色，透过水看得见底板的木纹和一对交叉的深灰桨叶；箱顶正中是黑色的传动罩；
//   · 水箱两侧各一块前倾的橡木立板，顶上一根横梁架着液晶表（灰绿底的段码：500 米配速、桨频、距离、时间、强度条），
//     表下面四个小按键；
//   · 两根橡木导轨从立板之间的横梁一直伸到后面的梯形后脚（底下挖一道拱），导轨尾端两块橡胶挡块；
//   · 座椅小车：四只轮子骑在两根导轨上，上面一块带臀形凹面的橡木座板；
//   · 脚踏板 45° 斜架在两块立板之间：两块黑色橡胶脚垫、脚跟托、一道拱起来的尼龙绑带；
//   · 把手（车削的橡木横杆 + 两段黑色握把）歇在导轨前端，一根黑色的拉带从把手中间钻到脚踏板底下，接进水箱顶上的传动罩。
// 原点在占地中心（地面上），人朝 -z 坐（水箱在 -z 那头）
const TANK = { z: -0.74, r: 0.25, y0: 0.055, y1: 0.275, water: 0.2 };
const RAIL = { x: 0.07, w: 0.045, y0: 0.29, y1: 0.365, z0: -0.58, z1: 1.0 };
const UP = { x: 0.272, t: 0.028 };
const SEAT = { z: 0.3 };

export default {
  id: 'rowing_machine',
  name: '划船机',
  nameEn: 'Water Rowing Machine',
  category: 'gym2',
  aoDensity: 160,
  shadow: { margin: 0.2, maxDist: 0.45, density: 70 },
  view: { el: 20, az: 38 },
  build(k) {
    const q = (...v) => k.q(...v);
    const sm = { smooth: true };
    const oak = (name, o) => k.box({ name, mat: 'oak', r: q(0.004, 0.003, 0), segs: q(1, 1, 0), ...o });

    // —— 底板 + 脚垫 ——
    oak('base', { size: [0.6, 0.035, 0.6], grain: 'z', omit: ['ny'], xf: xf({ pos: [0, 0.0375, TANK.z] }) });
    for (const [x, z] of [[-0.26, -0.26], [0.26, -0.26], [-0.26, 0.26], [0.26, 0.26]]) {
      sw(k.lathe({ name: `baseFoot${x > 0 ? 'R' : 'L'}${z > 0 ? 'B' : 'F'}`, mat: 'gym2', segs: q(8, 6, 4), profile: profile([[0.024, 0], [0.024, 0.02]]), xf: xf({ pos: [x, 0, TANK.z + z] }) }), 'rubber');
    }

    // —— 水箱：黑色上下箍、有厚度的透明箱壁、箱顶、水、桨叶、传动罩 ——
    {
      const { r: R, y0, y1, water } = TANK;
      const at = xf({ pos: [0, 0, TANK.z] });
      const ts = q(32, 22, 14);
      sw(k.lathe({ name: 'tankBase', mat: 'gym2', segs: ts, profile: profile([[R + 0.004, y0], [R + 0.004, y0 + 0.028, { r: 0.003, segs: 1 }], [R - 0.012, y0 + 0.028]]), xf: at }), 'plastic');
      sw(k.lathe({ name: 'tankRing', mat: 'gym2', segs: ts, profile: profile([[R - 0.008, y1 - 0.028], [R + 0.004, y1 - 0.028, { r: 0.002, segs: 1 }], [R + 0.004, y1, { r: 0.003, segs: 1 }], [R - 0.03, y1]]), xf: at }), 'plastic');
      // 箱壁：外表面往上、内表面往下（远处那一面箱壁从里面看得见）
      k.lathe({ name: 'tankWall', mat: 'glass', segs: ts, profile: profile([[R, y0 + 0.028], [R, y1 - 0.028], [R - 0.005, y1 - 0.028], [R - 0.005, y0 + 0.028]]), xf: at });
      k.lathe({ name: 'tankLid', mat: 'glass', segs: ts, profile: profile([[R - 0.03, y1], [0.06, y1]]), xf: at });
      k.lathe({ name: 'water', mat: 'water', segs: ts, profile: profile([[0, y0 + 0.004], [R - 0.006, y0 + 0.004], [R - 0.006, water], [0, water]]), xf: at });
      // 桨叶：两片交叉的平板，套在一根中轴上
      sw(k.lathe({ name: 'shaft', mat: 'gym2', segs: q(10, 8, 6), profile: profile([[0.022, y0 + 0.01], [0.022, y1], [0, y1]]), xf: at }), 'paddle');
      for (const [i, a] of [0.35, 0.35 + Math.PI / 2].entries()) {
        sw(k.box({ name: `blade${i}`, mat: 'gym2', size: [0.42, 0.085, 0.01], r: q(0.004, 0), segs: q(1, 0), xf: xf({ pos: [0, 0.135, TANK.z], rot: [0, a, 0] }) }), 'paddle');
      }
      sw(k.lathe({ name: 'drive', mat: 'gym2', segs: q(16, 10, 8), profile: profile([[0.064, y1 - 0.004], [0.064, y1 + 0.03, { r: 0.012, segs: q(2, 1, 1) }], [0.03, y1 + 0.044, sm], [0, y1 + 0.046]]), xf: at }), 'plastic');
      // 注水口的小盖
      sw(k.lathe({ name: 'plug', mat: 'gym2', segs: q(10, 6, 4), profile: profile([[0.022, y1 - 0.002], [0.022, y1 + 0.012, { r: 0.003, segs: 1 }], [0, y1 + 0.013]]), xf: xf({ pos: [0.13, 0, TANK.z - 0.12] }) }), 'plastic');
    }

    // —— 两块前倾的立板（顶角圆），立板间的导轨横梁、顶横梁 ——
    {
      const c = { r: q(0.03, 0.02, 0.01), segs: q(3, 2, 1) };
      // 截面坐标 = (-z, y)（挤出轴 x）
      const side = shape(ccw([[0.46, 0.055], [0.6, 0.055], [0.78, 0.6, c], [0.68, 0.6, c]]));
      for (const s of [-1, 1]) {
        k.extrude({
          name: `upright${s > 0 ? 'R' : 'L'}`, mat: 'oak', shape: side, depth: UP.t, axis: 'x', grain: 'across',
          bevel: q(0.004, 0.003, 0), bsegs: q(2, 1, 1), xf: xf({ pos: [s * UP.x - UP.t / 2, 0, 0] }),
        });
      }
      oak('railBeam', { size: [2 * (UP.x - UP.t / 2), RAIL.y1 - RAIL.y0, 0.07], grain: 'x', xf: xf({ pos: [0, (RAIL.y0 + RAIL.y1) / 2, -0.58] }) });
      oak('topBeam', { size: [2 * (UP.x - UP.t / 2), 0.04, 0.08], grain: 'x', xf: xf({ pos: [0, 0.58, -0.73] }) });
    }

    // —— 导轨、尾端挡块、后脚 ——
    for (const s of [-1, 1]) {
      oak(`rail${s > 0 ? 'R' : 'L'}`, { size: [RAIL.w, RAIL.y1 - RAIL.y0, RAIL.z1 - RAIL.z0], r: q(0.006, 0.004, 0), segs: q(2, 1, 0), grain: 'z', xf: xf({ pos: [s * RAIL.x, (RAIL.y0 + RAIL.y1) / 2, (RAIL.z0 + RAIL.z1) / 2] }) });
      sw(k.box({ name: `stop${s > 0 ? 'R' : 'L'}`, mat: 'gym2', size: [RAIL.w - 0.006, 0.03, 0.035], r: q(0.006, 0.004, 0), segs: q(1, 1, 0), omit: ['ny'], xf: xf({ pos: [s * RAIL.x, RAIL.y1 + 0.015, RAIL.z1 - 0.03] }) }), 'rubber');
    }
    {
      const a = { r: q(0.03, 0.02, 0), segs: q(3, 2, 1) };
      // 梯形后脚，底下挖一道拱（截面在 x-y 平面，沿 z 挤出）
      const foot = shape(ccw([[-0.2, 0.02], [-0.095, 0.02], [-0.075, 0.12, a], [0.075, 0.12, a], [0.095, 0.02], [0.2, 0.02], [0.125, RAIL.y0, { r: 0.01, segs: 1 }], [-0.125, RAIL.y0, { r: 0.01, segs: 1 }]]));
      k.extrude({ name: 'rearFoot', mat: 'oak', shape: foot, depth: 0.09, axis: 'z', grain: 'across', bevel: q(0.004, 0.003, 0), bsegs: q(2, 1, 1), xf: xf({ pos: [0, 0, 0.895] }) });
      for (const s of [-1, 1]) sw(k.box({ name: `rearPad${s > 0 ? 'R' : 'L'}`, mat: 'gym2', size: [0.09, 0.02, 0.08], segs: 0, omit: ['ny'], xf: xf({ pos: [s * 0.15, 0.01, 0.94] }) }), 'rubber');
    }

    // —— 座椅小车：四只轮子骑在导轨上，底板 + 带凹面的橡木座板 ——
    {
      const wy = RAIL.y1 + 0.018;
      for (const [i, [s, dz]] of [[-1, -1], [1, -1], [-1, 1], [1, 1]].entries()) {
        sw(k.lathe({ name: `roller${i}`, mat: 'gym2', segs: q(12, 8, 6), profile: profile([[0.006, 0], [0.018, 0.001, sm], [0.019, 0.012, sm], [0.018, 0.023, sm], [0.006, 0.024]]), xf: xf({ pos: [s * RAIL.x - 0.012, wy, SEAT.z + dz * 0.08], rot: [0, 0, -Math.PI / 2] }) }), 'nylon');
      }
      sw(k.box({ name: 'carriage', mat: 'gym2', size: [0.2, 0.014, 0.22], r: q(0.004, 0), segs: q(1, 0), xf: xf({ pos: [0, wy + 0.026, SEAT.z] }) }), 'plastic');
      const W = 0.3, L = 0.25;
      k.box({
        name: 'seat', mat: 'oak', size: [W, 0.035, L], r: q(0.012, 0.009, 0.005), segs: q(2, 1, 1), div: q([6, 1, 5], [3, 1, 2], 1), grain: 'x',
        deform: (p) => {
          if (p[1] < 0) return p;
          // 两处坐骨的浅凹 + 前沿中间微微隆起
          const dip = (cx) => Math.exp(-(((p[0] - cx) / 0.06) ** 2) - (((p[2] - 0.03) / 0.07) ** 2));
          const ridge = Math.exp(-((p[0] / 0.04) ** 2)) * smoothstep(0, 0.12, -p[2]);
          const f = p[1] / 0.0175;
          return [p[0], p[1] - f * (0.009 * (dip(-0.07) + dip(0.07)) - 0.004 * ridge), p[2]];
        },
        xf: xf({ pos: [0, wy + 0.033 + 0.0175, SEAT.z] }),
      });
    }

    // —— 脚踏板：45° 斜板、两块橡胶脚垫、脚跟托、拱起的绑带 ——
    {
      // 局部 y → 斜板法线（朝后上），局部 z → 沿斜坡往下；下沿 (y 0.405, z -0.585)，上沿收在顶横梁底下
      const F = xf({ pos: [0, 0.405 + 0.1 * Math.SQRT1_2, -0.585 - 0.1 * Math.SQRT1_2], rot: [Math.PI / 4, 0, 0] });
      oak('footboard', { size: [2 * (UP.x - UP.t / 2), 0.02, 0.2], grain: 'x', xf: F.mul(xf({ pos: [0, -0.01, 0] })) });
      for (const s of [-1, 1]) {
        const n = s > 0 ? 'R' : 'L', X = s * 0.095;
        sw(k.box({ name: `pad${n}`, mat: 'gym2', size: [0.12, 0.012, 0.19], r: q(0.005, 0.004, 0), segs: q(1, 1, 0), omit: ['ny'], xf: F.mul(xf({ pos: [X, 0.006, 0] })) }), 'rubber');
        sw(k.box({ name: `heel${n}`, mat: 'gym2', size: [0.12, 0.045, 0.02], r: q(0.006, 0.004, 0), segs: q(1, 1, 0), omit: ['ny'], xf: F.mul(xf({ pos: [X, 0.0345, 0.085] })) }), 'plastic');
        if (k.lod < 2) {
          const arch = [];
          const na = q(8, 5);
          for (let i = 0; i <= na; i++) {
            const t = (Math.PI * i) / na;
            arch.push(F.apply([X - 0.064 * Math.cos(t), 0.012 + 0.05 * Math.sin(t), 0.01]));
          }
          sw(k.sweep({ name: `strap${n}`, mat: 'gym2', shape: rect(0.004, 0.036), path: arch, up: F.applyDir([0, 0, 1]), caps: [true, true] }), 'strap');
          sw(k.box({ name: `buckle${n}`, mat: 'gym2', size: [0.004, 0.022, 0.03], segs: 0, xf: F.mul(xf({ pos: [X + 0.067, 0.03, 0.01] })) }), 'steel');
        }
      }
    }

    // —— 把手（歇在导轨前端）和拉带 ——
    const HY = RAIL.y1 + 0.016, HZ = -0.525;
    {
      const P = xf({ pos: [-0.24, HY, HZ], rot: [0, 0, -Math.PI / 2] });
      k.lathe({ name: 'handle', mat: 'oak', segs: q(10, 8, 6), profile: profile([[0, 0], [0.013, 0, { r: 0.003, segs: 1 }], [0.015, 0.12, sm], [0.016, 0.24, sm], [0.015, 0.36, sm], [0.013, 0.48, { r: 0.003, segs: 1 }], [0, 0.48]]), grain: 'profile', xf: P });
      for (const s of [-1, 1]) {
        sw(k.lathe({ name: `handleGrip${s > 0 ? 'R' : 'L'}`, mat: 'gym2', segs: q(10, 8, 6), profile: profile([[0.0175, 0], [0.019, 0.01, sm], [0.019, 0.09, sm], [0.0175, 0.1]]), xf: xf({ pos: [s > 0 ? 0.125 : -0.225, HY, HZ], rot: [0, 0, -Math.PI / 2] }) }), 'foam');
      }
      sw(k.box({ name: 'handleClip', mat: 'gym2', size: [0.04, 0.036, 0.03], r: q(0.004, 0), segs: q(1, 0), xf: xf({ pos: [0, HY, HZ - 0.012] }) }), 'steel');
      const strap = catmull([[0, HY, HZ - 0.025], [0, HY - 0.008, -0.6], [0, 0.34, -0.665], [0, TANK.y1 + 0.046, TANK.z]], q(4, 2, 1));
      sw(k.sweep({ name: 'pullStrap', mat: 'gym2', shape: rect(0.002, 0.03), path: strap, up: [1, 0, 0], caps: [false, false] }), 'strap');
    }

    // —— 液晶表：顶横梁上一根短杆，表面后仰朝着人 ——
    {
      const TILT = 0.44;
      const C = [0, 0.725, -0.745];
      const MX = xf({ pos: C, rot: [-TILT, 0, 0] });
      sw(k.lathe({ name: 'monitorPost', mat: 'gym2', segs: q(8, 6, 4), profile: profile([[0.012, 0], [0.012, 0.075]]), xf: xf({ pos: [0, 0.598, -0.735] }) }), 'plastic');
      sw(k.box({ name: 'monitor', mat: 'gym2', size: [0.25, 0.17, 0.045], r: q(0.012, 0.009, 0.005), segs: q(2, 1, 1), xf: MX.mul(xf({ pos: [0, 0, -0.0225] })) }), 'plastic');
      const { w: LW, h: LH } = GYM2_ATLAS.rowerScreen;
      const lcd = k.box({ name: 'lcd', mat: 'gym2', size: [LW, LH, 0.0008], segs: 0, omit: ['px', 'nx', 'py', 'ny', 'nz'] });
      mapUV(lcd, (p) => gym2UV('rowerScreen', (p[0] + LW / 2) / LW, (LH / 2 - p[1]) / LH));
      lcd.transform(MX.mul(xf({ pos: [0, 0.012, 0.0004] })));
      if (k.lod < 2) {
        for (let i = 0; i < 4; i++) {
          sw(k.box({ name: `button${i}`, mat: 'gym2', size: [0.03, 0.012, 0.004], r: 0.002, segs: 1, omit: ['nz'], xf: MX.mul(xf({ pos: [-0.063 + i * 0.042, -0.066, 0.002] })) }), i === 0 ? 'red' : 'white');
        }
      }
    }
  },
};
