import { profile, circle } from '../core/shape.js';
import { xf } from '../core/vec.js';
import { sw, put, rod, turned, bottle, catmull } from './parts.js';
import { comb, clippers, shears, razor, shavingMug, pomade, sprayBottle, neckDuster, towel, disinfectantJar, JAR } from './tools.js';

// 理发工作台：靠墙的胡桃木矮柜（左右两扇门、中间三个抽屉、黄铜拉手，黑色踢脚），抛光的白色大理石台面和挡水板；
// 上面一面胡桃木框的大镜子，镜子上方一根黄铜灯杆吊着三盏乳白球灯。台面上摆满了东西：
// 左边一摞叠好的毛巾、泡着梳子的消毒液罐（盖子放在旁边），靠挡水板一排月桂须后水、护发水、薄荷须后水和一罐爽身粉，
// 两盒发蜡、一只剃须杯（泡沫里立着獾毛刷）、一个喷水壶；前面一把推子（电线插在挡水板上的插座里）、一把理发剪、
// 一把打开的折叠剃刀、一把梳子和一把扫碎发的软毛刷。
// 原点在墙根（z = 0 是墙面）、柜子宽度的中点，正面朝 +z。
const sm = { smooth: true };
const W = 1.4, D = 0.5, TOP = 0.88, PLINTH = 0.09, FRONT = 0.02;
const MIR = { w: 1.12, h: 0.96, y0: 1.06, fw: 0.07 };
const LAMP = { y: 2.2, z: 0.13, xs: [-0.36, 0, 0.36], r: 0.055, drop: 0.078 };
export const STATION_GLOBES = LAMP.xs.map((x) => [x, LAMP.y - LAMP.drop, LAMP.z]);

export default {
  id: 'barber_station',
  name: '理发工作台',
  nameEn: 'Barber Station with Mirror',
  category: 'barber',
  planes: ['floor', 'wall'],
  aoDensity: 150,
  shadow: {
    floor: { margin: 0.16, maxDist: 0.45, density: 80 },
    wall: { margin: 0.12, maxDist: 0.3, density: 60, strength: 0.6 },
  },
  // 三盏球灯照在镜子周围的墙上
  glow: {
    plane: 'wall',
    lights: STATION_GLOBES.map((p) => ({ a: p, b: p, power: 1 })),
    rect: { u0: -0.85, u1: 0.85, v0: 1.3, v1: 2.58 },
    fade: [0.25, 0.25, 0.3, 0.12],
    density: 70, samples: 96, strength: 0.5, gamma: 0.9,
  },
  view: { el: 10, az: 20 },
  build(k) {
    const q = (...v) => k.q(...v);
    // —— 柜体：黑色踢脚（缩进去）、胡桃木柜身 ——
    sw(k.box({ name: 'plinth', mat: 'barber', size: [W - 0.06, PLINTH, D - FRONT - 0.05], segs: 0, omit: ['ny', 'nz'], xf: xf({ pos: [0, PLINTH / 2, (D - FRONT - 0.05) / 2] }) }), 'black');
    k.box({ name: 'carcass', mat: 'walnut', size: [W, TOP - 0.03 - PLINTH, D - FRONT], r: 0.004, segs: q(1, 1, 0), grain: 'x', omit: ['ny', 'nz'], xf: xf({ pos: [0, PLINTH + (TOP - 0.03 - PLINTH) / 2, (D - FRONT) / 2] }) });
    // —— 门和抽屉：门板上一块凸起的芯板，抽屉面平的；黄铜拉手 ——
    {
      const y0 = PLINTH + 0.006, y1 = TOP - 0.036, zf = D - FRONT, g = 0.004;
      const cols = [[-W / 2 + g, -0.235], [-0.231, 0.231], [0.235, W / 2 - g]];
      const front = (name, x0, x1, a, b, grain) => k.box({ name, mat: 'walnut', size: [x1 - x0, b - a, FRONT], r: 0.003, segs: q(1, 1, 0), grain, omit: ['nz'], xf: xf({ pos: [(x0 + x1) / 2, (a + b) / 2, zf + FRONT / 2] }) });
      for (const [i, [x0, x1]] of [[0, cols[0]], [1, cols[2]]]) {
        front(`door${i}`, x0, x1, y0, y1, 'y');
        k.box({ name: `doorPanel${i}`, mat: 'walnut', size: [x1 - x0 - 0.1, y1 - y0 - 0.1, 0.008], r: 0.004, segs: q(1, 1, 0), grain: 'y', omit: ['nz'], xf: xf({ pos: [(x0 + x1) / 2, (y0 + y1) / 2, zf + FRONT + 0.004] }) });
        const kx = i === 0 ? x1 - 0.04 : x0 + 0.04;
        turned(k, `knob${i}`, [[0, 0], [0.008, 0], [0.006, 0.012, sm], [0.012, 0.022, sm], [0.011, 0.03, sm], [0, 0.032]], 'brass', { segs: q(12, 8, 6), place: xf({ pos: [kx, 0.62, zf + FRONT + 0.008], rot: [Math.PI / 2, 0, 0] }) });
      }
      const hs = [0.3, 0.24, 0.2], ys = [y0];
      for (const h of hs) ys.push(ys.at(-1) + h * ((y1 - y0) / hs.reduce((a, b) => a + b)));
      ys.forEach((a, j) => {
        if (j === hs.length) return;
        const b = ys[j + 1], [x0, x1] = cols[1];
        front(`drawer${j}`, x0, x1, a + (j > 0 ? g / 2 : 0), b - (j < hs.length - 1 ? g / 2 : 0), 'x');
        // 杯形拉手：一段黄铜半圆壳（车削的一半）→ 用一根短横杆加两个脚代替，远看一样
        const yc = (a + b) / 2 + 0.02, zc = zf + FRONT;
        rod(k, `pull${j}`, [-0.06, yc, zc + 0.022], [0.06, yc, zc + 0.022], 0.0055, 'brass', { segs: q(8, 6, 4) });
        if (k.lod < 2) for (const s of [-1, 1]) rod(k, `pullPost${j}${s > 0 ? 'R' : 'L'}`, [s * 0.05, yc, zc], [s * 0.05, yc, zc + 0.022], 0.004, 'brass', { segs: q(6, 5, 4), caps: [false, false] });
      });
    }
    // —— 台面和挡水板（抛光大理石）——
    k.box({ name: 'top', mat: 'marble_slab', size: [W + 0.02, 0.03, D + 0.02], r: 0.008, segs: q(2, 1, 1), xf: xf({ pos: [0, TOP - 0.015, (D + 0.02) / 2] }) });
    k.box({ name: 'splash', mat: 'marble_slab', size: [W + 0.02, 0.12, 0.02], r: 0.004, segs: q(1, 1, 0), omit: ['nz', 'ny'], xf: xf({ pos: [0, TOP + 0.06, 0.01] }) });
    // 挡水板上的插座（推子的电线插在这里）
    const OUT = [-0.2, TOP + 0.062, 0.02];
    sw(k.box({ name: 'outlet', mat: 'barber', size: [0.07, 0.07, 0.006], r: 0.004, segs: q(1, 1, 0), omit: ['nz'], xf: xf({ pos: [OUT[0], OUT[1], OUT[2] + 0.003] }) }), 'white');
    sw(k.box({ name: 'plug', mat: 'barber', size: [0.026, 0.034, 0.02], r: 0.004, segs: q(1, 1, 0), omit: ['nz'], xf: xf({ pos: [OUT[0], OUT[1], OUT[2] + 0.016] }) }), 'cord');

    // —— 镜子：胡桃木线条框（沿框的中心线扫掠一圈，拐角斜接），银镜嵌在框里 ——
    {
      const cy = MIR.y0 + MIR.h / 2, hw = MIR.w / 2 - MIR.fw / 2, hh = MIR.h / 2 - MIR.fw / 2, e = MIR.fw / 2;
      const prof = profile(q(
        [[e, 0.008], [e, 0.016], [e - 0.007, 0.02, sm], [e - 0.015, 0.028, sm], [e - 0.024, 0.034, sm], [e - 0.035, 0.036, sm], [e - 0.047, 0.034, sm], [e - 0.058, 0.028, sm], [-e + 0.005, 0.021], [-e, 0.019], [-e, 0]],
        [[e, 0.008], [e, 0.016], [e - 0.015, 0.028, sm], [e - 0.035, 0.036, sm], [e - 0.058, 0.028, sm], [-e, 0.019], [-e, 0]],
        [[e, 0.008], [e - 0.02, 0.032], [e - 0.05, 0.032], [-e, 0.019], [-e, 0]],
      ));
      k.sweep({ name: 'mirrorFrame', mat: 'walnut', shape: prof, closed: true, caps: [false, false], up: [0, 0, 1], path: [[-hw, cy - hh, 0], [hw, cy - hh, 0], [hw, cy + hh, 0], [-hw, cy + hh, 0]] });
      k.box({ name: 'mirror', mat: 'mirror', size: [MIR.w - 2 * MIR.fw + 0.02, MIR.h - 2 * MIR.fw + 0.02, 0.006], segs: 0, omit: ['nz'], xf: xf({ pos: [0, cy, 0.007] }) });
    }

    // —— 镜前灯：两块墙上的底盘、两根灯臂、一根黄铜灯杆，三盏吊着的乳白球灯 ——
    {
      for (const s of [-1, 1]) {
        const x = s * 0.5;
        turned(k, `lampPlate${s > 0 ? 'R' : 'L'}`, [[0.045, 0], [0.045, 0.008, sm], [0.02, 0.014, sm], [0, 0.015]], 'brass', { segs: q(16, 10, 6), place: xf({ pos: [x, LAMP.y, 0], rot: [Math.PI / 2, 0, 0] }) });
        rod(k, `lampArm${s > 0 ? 'R' : 'L'}`, [x, LAMP.y, 0.012], [x, LAMP.y, LAMP.z], 0.007, 'brass', { segs: q(8, 6, 4), caps: [false, false] });
      }
      rod(k, 'lampBar', [-0.56, LAMP.y, LAMP.z], [0.56, LAMP.y, LAMP.z], 0.011, 'brass', { segs: q(10, 8, 6) });
      for (const s of [-1, 1]) turned(k, `lampEnd${s > 0 ? 'R' : 'L'}`, [[0.011, 0], [0.014, 0.004, sm], [0.012, 0.012, sm], [0.006, 0.02, sm], [0, 0.022]], 'brass', { segs: q(10, 8, 6), place: xf({ pos: [s * 0.56, LAMP.y, LAMP.z], rot: [0, 0, -s * Math.PI / 2] }) });
      LAMP.xs.forEach((x, i) => {
        const c = [x, LAMP.y - LAMP.drop, LAMP.z];
        turned(k, `fitter${i}`, [[0.012, LAMP.y - 0.01], [0.012, LAMP.y - 0.03], [0.03, c[1] + LAMP.r * 0.62, sm], [0.034, c[1] + LAMP.r * 0.5], [0.028, c[1] + LAMP.r * 0.5]], 'brass', { segs: q(14, 10, 6), place: xf({ pos: [x, 0, LAMP.z] }) });
        const R = LAMP.r, n = q(10, 7, 5), pts = [];
        for (let j = 0; j <= n; j++) { const a = -Math.PI / 2 + (Math.PI * 0.88 * j) / n; pts.push([R * Math.cos(a), R * Math.sin(a), sm]); }
        pts[0][0] = 0;
        k.lathe({ name: `globe${i}`, mat: 'opal', segs: q(20, 14, 8), profile: profile(pts), xf: xf({ pos: c }) });
      });
    }

    // —— 台面上的东西 ——
    const T = TOP;
    // 左边一摞毛巾
    [[0, -0.53, 0.2, 0.04], [1, -0.525, 0.205, -0.03], [2, -0.535, 0.198, 0.07]].forEach(([i, x, z, a]) => towel(k, `towel${i}`, { place: xf({ pos: [x, T + i * 0.034, z], rot: [0, a, 0] }) }));
    // 消毒液罐、摘下来的镀铬盖子
    disinfectantJar(k, 'jar', { place: xf({ pos: [-0.27, T, 0.17] }) });
    turned(k, 'jarLid', [[0, 0], [JAR.r + 0.003, 0], [JAR.r + 0.004, 0.003, sm], [JAR.r + 0.004, 0.02, sm], [JAR.r + 0.001, 0.023], [0, 0.023]], 'chrome', { segs: q(24, 16, 10), place: xf({ pos: [-0.42, T, 0.4] }) });
    // 靠挡水板的一排瓶子
    bottle(k, 'bayRum', 'bayRum', { place: xf({ pos: [-0.1, T, 0.075], rot: [0, 0.1, 0] }) });
    bottle(k, 'tonic', 'tonic', { place: xf({ pos: [-0.015, T, 0.07], rot: [0, -0.15, 0] }) });
    bottle(k, 'aftershave', 'aftershave', { place: xf({ pos: [0.08, T, 0.085], rot: [0, 0.2, 0] }) });
    bottle(k, 'talc', 'talc', { place: xf({ pos: [0.18, T, 0.07], rot: [0, -0.3, 0] }) });
    // 两盒发蜡
    pomade(k, 'pomadeA', 'pomadeA', { place: xf({ pos: [0.3, T, 0.2], rot: [0, 0.4, 0] }) });
    pomade(k, 'pomadeB', 'pomadeB', { place: xf({ pos: [0.33, T, 0.085], rot: [0, -0.3, 0] }) });
    // 剃须杯和刷子、喷水壶
    shavingMug(k, 'mug', { place: xf({ pos: [0.47, T, 0.13], rot: [0, 2.2, 0] }) });
    sprayBottle(k, 'spray', { place: xf({ pos: [0.6, T, 0.11], rot: [0, 2.4, 0] }) });
    // 前面：推子（电线弯弯曲曲地回到挡水板上的插座）、剪刀、剃刀、梳子、毛刷
    {
      const place = xf({ pos: [-0.1, T, 0.36], rot: [0, 0.5, 0] });
      const tail = place.apply(clippers(k, 'clipper', { place }));
      const ctrl = [tail, [tail[0] - 0.035, T + 0.0045, tail[2] + 0.02], [tail[0] - 0.07, T + 0.0045, tail[2] - 0.035], [-0.19, T + 0.0045, 0.25], [OUT[0] + 0.012, T + 0.0045, 0.09], [OUT[0], T + 0.03, 0.05], [OUT[0], OUT[1] - 0.012, 0.045], [OUT[0], OUT[1], 0.037]];
      const path = catmull(ctrl, q(5, 3, 2));
      sw(k.sweep({ name: 'clipperCord', mat: 'barber', shape: circle(0.0035, q(6, 5, 4)), path, caps: [false, false], up: [0, 1, 0] }), 'cord');
    }
    shears(k, 'shears', { open: 0.16, place: xf({ pos: [0.13, T + 0.0001, 0.37], rot: [0, 0.6, 0] }) });
    razor(k, 'razor', { place: xf({ pos: [0.36, T, 0.4], rot: [0, -0.25, 0] }) });
    comb(k, 'comb', { L: 0.18, place: xf({ pos: [0.36, T + 0.002, 0.3], rot: [Math.PI / 2, -0.15, 0] }) });
    // 毛刷：刷头搁在台面上、柄尾也碰到台面（绕自己的横轴先歪一点，再转方向）
    neckDuster(k, 'duster', { place: xf({ pos: [0.53, T + 0.037, 0.39], rot: [0, 2.6, 0] }).mul(xf({ pos: [-0.16, 0, 0], rot: [0, 0, 0.17] })) });
  },
};
