import { shape, profile, rect } from '../core/shape.js';
import { xf } from '../core/vec.js';
import { WORKSHOP_ATLAS, workshopUV, workshopSwatch } from '../materials/atlas.js';
import { SQUARE } from './layout.js';
import { sw, mapUV, rod, shaving, pencil, ccw } from './parts.js';

// 木工桌：一张山毛榉拼板面、橡木腿的木工桌，左前腿上一副腿钳（腿钳）。
//   · 桌面 1.8 × 0.6 × 0.08 m，4cm 宽的山毛榉条拼的；前沿一排圆形的桌狗孔，两只黄铜桌狗；
//   · 四条 9cm 见方的橡木腿（前腿和桌面前沿齐平，腿钳才夹得住），上下两圈横档，下面一块胶合板搁板，堆着几块松木边角料；
//   · 腿钳：一块上宽下窄的钳口板，钢丝杆穿过钳口和桌腿，前面一个铸铁法兰和一根两头带球的木手柄（垂着）；
//     钳口底下一根平行导杆从桌腿里穿出来，插着一根定位销；
//   · 桌上：一块松木板顶着桌狗，一把 4 号平刨正刨在板上（刨口冒出来一卷刨花），板上、桌上、地上散着刨花；
//     一把角尺、一个木槌、一支铅笔。
// 原点在桌子正下方的地面，长边沿 x，正面朝 +z。
const TOP = { L: 1.8, D: 0.6, T: 0.08, y: 0.9 };
const LEG = { s: 0.09, x: 0.7, z: 0.255 };
const RAIL_Y = { low: 0.2, high: 0.77 };
const VISE = { x: -LEG.x, gap: 0.018, t: 0.06, y0: 0.2, screwY: 0.72 };
const DOG = { z: 0.225, r: 0.0095, xs: [-0.45, -0.35, -0.25, -0.15, -0.05, 0.05, 0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.75] };
// 被刨的松木板
const BOARD = { x1: 0.35 - DOG.r, len: 0.72, w: 0.15, t: 0.022 };
// 平刨（4 号）：长、宽、刨口离中心、侧壁厚、底板厚
const PL = { L: 0.245, W: 0.062, mouth: 0.0275, wall: 0.005, sole: 0.006 };

export default {
  id: 'workbench',
  name: '木工桌',
  nameEn: 'Woodworking Workbench',
  category: 'workshop',
  aoDensity: 260,
  shadow: { margin: 0.15, maxDist: 0.95, density: 150 },
  view: { el: 22, az: 30 },
  build(k) {
    const q = (...v) => k.q(...v);
    const sm = { smooth: true };
    const yTop = TOP.y;

    // —— 桌面 ——
    k.box({ name: 'top', mat: 'beech_block', size: [TOP.L, TOP.T, TOP.D], r: 0.004, segs: q(1, 1, 0), grain: 'x', xf: xf({ pos: [0, yTop - TOP.T / 2, 0] }) });
    // 桌狗孔：前沿一排（被木板压住的不画）
    const dogs = [0.35, -0.45];
    for (const [i, x] of DOG.xs.entries()) {
      if ((x > BOARD.x1 - BOARD.len - DOG.r && x < BOARD.x1 + DOG.r) || dogs.includes(x)) continue;
      sw(k.lathe({ name: `dogHole${i}`, mat: 'workshop', segs: q(14, 10, 6), profile: profile([[DOG.r, 0], [0, 0]]), xf: xf({ pos: [x, yTop + 0.0003, DOG.z] }) }), 'holeDark');
    }
    // 两只黄铜桌狗：一只顶着木板的右端，一只在左边空着
    for (const [i, x] of dogs.entries()) {
      sw(k.lathe({ name: `dog${i}`, mat: 'workshop', segs: q(12, 8, 6), profile: profile([[DOG.r - 0.0004, -0.002], [DOG.r - 0.0004, 0.013, sm], [DOG.r - 0.0024, 0.0152], [0, 0.0152]]), xf: xf({ pos: [x, yTop, DOG.z] }) }), 'brass');
    }

    // —— 腿、横档 ——
    const legH = yTop - TOP.T;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      k.box({ name: `leg${sx > 0 ? 'R' : 'L'}${sz > 0 ? 'F' : 'B'}`, mat: 'walnut', size: [LEG.s, legH, LEG.s], r: 0.003, segs: q(1, 1, 0), grain: 'y', omit: ['ny', 'py'], xf: xf({ pos: [sx * LEG.x, legH / 2, sz * LEG.z] }) });
    }
    const inX = LEG.x - LEG.s / 2, inZ = LEG.z - LEG.s / 2;
    for (const [tag, y, h] of [['Low', RAIL_Y.low, 0.1], ['High', RAIL_Y.high, 0.09]]) {
      for (const sx of [-1, 1]) {
        k.box({ name: `endRail${tag}${sx > 0 ? 'R' : 'L'}`, mat: 'walnut', size: [0.05, h, 2 * inZ], r: 0.002, segs: q(1, 0, 0), grain: 'z', omit: ['pz', 'nz'], xf: xf({ pos: [sx * LEG.x, y, 0] }) });
      }
      if (tag === 'Low') {
        for (const sz of [-1, 1]) {
          k.box({ name: `stretcher${sz > 0 ? 'F' : 'B'}`, mat: 'walnut', size: [2 * inX, h, 0.05], r: 0.002, segs: q(1, 0, 0), grain: 'x', omit: ['px', 'nx'], xf: xf({ pos: [0, y, sz * LEG.z] }) });
        }
      }
    }
    // 搁板（胶合板）搁在前后两根低横档上
    const yShelf = RAIL_Y.low + 0.05;
    k.box({ name: 'shelf', mat: 'pine', size: [2 * inX - 0.002, 0.018, 2 * LEG.z], r: 0.001, segs: q(1, 0, 0), grain: 'x', xf: xf({ pos: [0, yShelf + 0.009, 0] }) });
    // 搁板上的松木边角料
    {
      const y0 = yShelf + 0.018;
      const offcuts = [
        { size: [0.92, 0.022, 0.14], pos: [-0.12, y0 + 0.011, 0.08], ry: 0.03 },
        { size: [0.64, 0.022, 0.12], pos: [-0.05, y0 + 0.033, 0.06], ry: -0.06 },
        { size: [0.46, 0.045, 0.07], pos: [0.3, y0 + 0.0225, -0.12], ry: 0.12 },
        { size: [0.34, 0.019, 0.09], pos: [-0.42, y0 + 0.0095, -0.13], ry: -0.2 },
      ];
      offcuts.forEach((o, i) => k.box({ name: `offcut${i}`, mat: 'pine', size: o.size, r: 0.0015, segs: q(1, 0, 0), grain: 'x', xf: xf({ pos: o.pos, rot: [0, o.ry, 0] }) }));
    }

    // —— 腿钳 ——
    {
      const zc0 = TOP.D / 2 + VISE.gap, zc1 = zc0 + VISE.t, x = VISE.x;
      // 钳口板：下窄上宽，两侧一段弧线过渡
      const pts = [[-0.062, VISE.y0], [0.062, VISE.y0], [0.062, 0.52, sm], [0.075, 0.6, sm], [0.095, 0.66, sm], [0.1, 0.72, sm], [0.1, yTop],
        [-0.1, yTop], [-0.1, 0.72, sm], [-0.095, 0.66, sm], [-0.075, 0.6, sm], [-0.062, 0.52, sm]];
      k.extrude({ name: 'chop', mat: 'walnut', shape: shape(ccw(pts)), depth: VISE.t, bevel: 0.003, bsegs: q(1, 1, 0), grain: 'across', capAngle: Math.PI / 2, xf: xf({ pos: [x, 0, zc0] }) });
      // 丝杆：从桌腿后面的螺母穿过桌腿、钳口
      const sy = VISE.screwY;
      rod(k, 'screw', [x, sy, LEG.z - LEG.s / 2 - 0.03], [x, sy, zc1 + 0.01], 0.016, 'steel', { segs: q(12, 8, 6) });
      sw(k.box({ name: 'nut', mat: 'workshop', size: [0.07, 0.07, 0.012], r: q(0.003, 0), segs: q(1, 0), omit: ['pz'], xf: xf({ pos: [x, sy, LEG.z - LEG.s / 2 - 0.006] }) }), 'castIron');
      // 铸铁法兰 + 手柄套筒
      const fwd = xf({ pos: [x, sy, zc1], rot: [Math.PI / 2, 0, 0] });   // 车削轴 +y → +z
      sw(k.lathe({ name: 'hub', mat: 'workshop', segs: q(16, 10, 8), profile: profile([[0.05, 0], [0.05, 0.008, { r: 0.002, segs: 1 }], [0.032, 0.012, sm], [0.026, 0.02], [0.026, 0.052, { r: 0.004, segs: q(2, 1, 1) }], [0, 0.054]]), xf: fwd }), 'castIron');
      // 手柄：穿过套筒，垂着（稍微偏一点），两头各一个球
      const zh = zc1 + 0.037, a = 0.14, up = 0.07, dn = 0.29;
      const pa = [x - Math.sin(a) * up, sy + Math.cos(a) * up, zh], pb = [x + Math.sin(a) * dn, sy - Math.cos(a) * dn, zh];
      rod(k, 'handle', pa, pb, 0.0115, 'hickory', { segs: q(10, 8, 6) });
      for (const [i, p] of [pa, pb].entries()) {
        sw(k.lathe({ name: `handleBall${i}`, mat: 'workshop', segs: q(12, 8, 6), profile: profile([[0, -0.019], [0.013, -0.014, sm], [0.019, 0, sm], [0.013, 0.014, sm], [0, 0.019]]), xf: xf({ pos: p }) }), 'hickory');
      }
      // 平行导杆（从钳口底部穿过桌腿），一根钢销插在腿后面
      const gy = VISE.y0 + 0.1, gz0 = LEG.z - LEG.s / 2 - 0.16;
      k.box({ name: 'guide', mat: 'walnut', size: [0.05, 0.022, zc1 - gz0], r: 0.002, segs: q(1, 0, 0), grain: 'z', xf: xf({ pos: [x, gy, (zc1 + gz0) / 2] }) });
      rod(k, 'pin', [x, gy - 0.02, LEG.z - LEG.s / 2 - 0.025], [x, gy + 0.045, LEG.z - LEG.s / 2 - 0.025], 0.0045, 'steelDark', { segs: q(8, 6, 4) });
      if (k.lod < 2) {
        for (let i = 0; i < 4; i++) {
          const z = LEG.z - LEG.s / 2 - 0.055 - i * 0.025;
          sw(k.lathe({ name: `guideHole${i}`, mat: 'workshop', segs: q(8, 6), profile: profile([[0.005, 0], [0, 0]]), xf: xf({ pos: [x, gy + 0.0113, z] }) }), 'holeDark');
        }
      }
    }

    // —— 桌上的松木板和平刨 ——
    const yb = yTop + BOARD.t;
    const bx = BOARD.x1 - BOARD.len / 2;
    k.box({ name: 'board', mat: 'pine', size: [BOARD.len, BOARD.t, BOARD.w], r: 0.0015, segs: q(1, 1, 0), grain: 'x', omit: ['ny'], xf: xf({ pos: [bx, yTop + BOARD.t / 2, DOG.z] }) });
    plane(k, xf({ pos: [bx + 0.08, yb, DOG.z + 0.004], rot: [0, 0.035, 0] }));

    // —— 散落的刨花：板上、桌上、地上 ——
    {
      const curls = [
        // [x, y, z, 转角, R0, R1, 圈数, 带宽, 每圈错开, 尾巴]
        [bx - 0.2, yb, DOG.z + 0.01, 0.4, 0.009, 0.016, 1.8, 0.036, 0.006, 0.05],
        [bx + 0.26, yTop, 0.04, 1.9, 0.011, 0.02, 1.4, 0.04, 0.008, 0.07],
        [bx - 0.06, yTop, 0.0, -0.7, 0.008, 0.014, 2.2, 0.03, 0.004, 0.03],
        [bx + 0.09, yTop, -0.06, 2.6, 0.013, 0.022, 1.2, 0.042, 0.01, 0.09],
        [0.62, yTop, 0.1, 0.9, 0.009, 0.017, 1.7, 0.034, 0.006, 0.04],
        [-0.25, 0, 0.52, 0.3, 0.012, 0.021, 1.5, 0.04, 0.008, 0.08],
        [0.1, 0, 0.47, 2.2, 0.009, 0.017, 2.0, 0.036, 0.005, 0.03],
        [0.33, 0, 0.62, -1.2, 0.014, 0.024, 1.2, 0.044, 0.012, 0.11],
        [-0.03, 0, 0.66, 1.1, 0.008, 0.015, 1.8, 0.032, 0.006, 0.05],
      ];
      curls.forEach(([x, y, z, ry, R0, R1, turns, w, pitch, tail], i) => {
        if (k.lod === 2 && i % 2) return;
        shaving(k, `curl${i}`, { R0, R1, turns, w, pitch, tail, place: xf({ pos: [x, y + 0.0003, z], rot: [0, ry, 0] }).mul(xf({ pos: [0, 0, -w / 2] })) });
      });
    }

    // —— 角尺（躺在桌面左后方）——
    trySquare(k, xf({ pos: [-0.62, yTop, -0.16], rot: [0, 0.35, 0] }));
    // —— 木槌 ——
    mallet(k, xf({ pos: [0.52, yTop, -0.1], rot: [0, -0.5, 0] }));
    // —— 铅笔（躺在桌面上，六棱的一个面着地）——
    pencil(k, 'pencil', { place: xf({ pos: [bx + 0.3, yTop + 0.0037 * Math.cos(Math.PI / 6), 0.1], rot: [0, 0.6, 0] }).mul(xf({ rot: [0, 0, Math.PI / 2] })).mul(xf({ rot: [0, Math.PI / 6, 0] })) });
  },
};

// ——————————————————————— 平刨 ———————————————————————
// 局部：x 朝刨头（前进方向），y 向上（刨底 y = 0），z 横过刨身。刨刀 45° 斜着装，刃口在刨口（x = mouth）
function plane(k, place) {
  const q = (...v) => k.q(...v);
  const sm = { smooth: true };
  const { L, W, mouth: xm, wall, sole } = PL;
  // 底板：两头圆的平面轮廓，挤出 sole 厚
  const plan = rect(L, W, { r: 0.02, segs: q(3, 2, 1) });
  const solePart = k.extrude({ name: 'planeSole', mat: 'workshop', shape: plan, depth: sole, axis: 'y', bevel: 0.0008, bsegs: 1, caps: [false, true] });
  sw(solePart, 'castIron').transform(place);
  // 侧壁：沿平面轮廓扫一圈矩形截面，再把顶边压到高度曲线 h(x) 上（刨口一带最高）
  const h = (x) => 0.02 + 0.026 * Math.exp(-(((x - 0.005) / 0.075) ** 4));
  const hw = L / 2 - wall / 2, hd = W / 2 - wall / 2, rr = 0.02 - wall / 2, H = 0.05;
  const loop = [];
  const cs = q(4, 3, 2);
  for (const [cx, cz, b0] of [[hw - rr, hd - rr, 0], [-(hw - rr), hd - rr, Math.PI / 2], [-(hw - rr), -(hd - rr), Math.PI], [hw - rr, -(hd - rr), 1.5 * Math.PI]]) {
    for (let j = 0; j <= cs; j++) {
      const b = b0 + (j / cs) * (Math.PI / 2);
      loop.push([cx + rr * Math.cos(b), sole + H / 2, cz + rr * Math.sin(b)]);
    }
  }
  // 两条直边中间加几个点，顶边的高度曲线才压得出来
  const path = [];
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i], b = loop[(i + 1) % loop.length];
    path.push(a);
    const d = Math.hypot(b[0] - a[0], b[2] - a[2]);
    const m = Math.floor(d / q(0.018, 0.03, 0.06));
    for (let j = 1; j < m; j++) path.push([a[0] + ((b[0] - a[0]) * j) / m, a[1], a[2] + ((b[2] - a[2]) * j) / m]);
  }
  const walls = k.sweep({ name: 'planeWalls', mat: 'workshop', shape: rect(wall, H), path, closed: true, caps: [false, false], up: [0, 1, 0] });
  walls.deform(([x, y, z]) => [x, sole + ((y - sole) * h(x)) / H, z]);
  // 外侧面是磨亮的铸铁，里面和顶边是黑漆
  const jap = workshopSwatch('japanned'), bare = workshopSwatch('castIron');
  mapUV(walls, (p, n) => (n[1] > 0.5 || n[0] * p[0] + n[2] * p[2] * 4 < 0 ? jap : bare));
  walls.transform(place);
  // 刨身里面的黑漆底
  sw(k.box({ name: 'planeFloor', mat: 'workshop', size: [L - 0.03, 0.002, W - 2 * wall], segs: 0, omit: ['ny'], xf: place.mul(xf({ pos: [0, sole + 0.001, 0] })) }), 'japanned');
  // 刨口：刃口前面一道黑缝
  sw(k.box({ name: 'planeMouth', mat: 'workshop', size: [0.008, 0.0004, 0.05], segs: 0, omit: ['ny'], xf: place.mul(xf({ pos: [xm + 0.004, sole + 0.0022, 0] })) }), 'holeDark');

  // 刨刀组：F 的 x' 沿刨刀往上，y' 垂直刨刀的上表面（朝前上方）
  const F = place.mul(xf({ pos: [xm, 0, 0], rot: [Math.PI, 0, (3 * Math.PI) / 4] }));
  const along = (x0, x1, y0, y1, w) => ({ size: [x1 - x0, y1 - y0, w], pos: [(x0 + x1) / 2, (y0 + y1) / 2, 0] });
  const iron = along(0, 0.125, -0.0025, 0, 0.049), breaker = along(0.003, 0.117, 0, 0.002, 0.048), cap = along(0.022, 0.108, 0.002, 0.007, 0.05);
  sw(k.box({ name: 'planeIron', mat: 'workshop', size: iron.size, segs: 0, xf: F.mul(xf({ pos: iron.pos })) }), 'steel');
  sw(k.box({ name: 'planeBreaker', mat: 'workshop', size: breaker.size, segs: 0, xf: F.mul(xf({ pos: breaker.pos })) }), 'steel');
  sw(k.box({ name: 'planeCap', mat: 'workshop', size: cap.size, r: q(0.0025, 0.002, 0), segs: q(2, 1, 0), xf: F.mul(xf({ pos: cap.pos })) }), 'chrome');
  sw(k.box({ name: 'planeCam', mat: 'workshop', size: [0.022, 0.005, 0.02], r: q(0.002, 0), segs: q(1, 0), xf: F.mul(xf({ pos: [0.095, 0.0095, 0] })) }), 'chrome');
  sw(k.lathe({ name: 'planeCapScrew', mat: 'workshop', segs: q(10, 6, 4), profile: profile([[0.0065, 0], [0.0065, 0.002, sm], [0, 0.0035]]), xf: F.mul(xf({ pos: [0.06, 0.007, 0] })) }), 'steel');
  sw(k.lathe({ name: 'planeBreakerScrew', mat: 'workshop', segs: q(10, 6, 4), profile: profile([[0.006, 0], [0.006, 0.0025, sm], [0, 0.004]]), xf: F.mul(xf({ pos: [0.112, 0.001, 0] })) }), 'steel');
  // 刨刀底下的铁座（黑漆）
  {
    const s = Math.SQRT1_2, lo = (t) => [xm - s * t - s * 0.0025, s * t - s * 0.0025];
    const [a, b] = [lo(0.018), lo(0.08)];
    const frog = [[xm - 0.009, sole], [a[0], a[1]], [b[0], b[1]], [b[0] - 0.008, b[1] - 0.008], [b[0] - 0.008, sole]];
    sw(k.extrude({ name: 'planeFrog', mat: 'workshop', shape: shape(ccw(frog)), depth: 0.044, center: true, bevel: 0.001, xf: place }), 'japanned');
    // 调深浅的黄铜螺母（轴平行于刨刀）
    sw(k.lathe({ name: 'planeNut', mat: 'workshop', segs: q(14, 8, 6), profile: profile([[0.003, -0.0035], [0.011, -0.0035, { r: 0.001, segs: 1 }], [0.011, 0.0035, { r: 0.001, segs: 1 }], [0.003, 0.0035]]), xf: place.mul(xf({ pos: [xm - 0.086, 0.044, 0], rot: [0, 0, Math.PI / 4] })) }), 'brass');
  }
  // 后把手（红木，开放式手枪握把）和前面的圆头把手
  const tote = [[-0.117, 0.008], [-0.078, 0.008], [-0.08, 0.02, sm], [-0.084, 0.04, sm], [-0.083, 0.065, sm], [-0.078, 0.088, sm], [-0.071, 0.105, sm], [-0.064, 0.117, sm],
    [-0.066, 0.125, sm], [-0.075, 0.13, sm], [-0.088, 0.127, sm], [-0.097, 0.115, sm], [-0.1, 0.098, sm], [-0.103, 0.078, sm], [-0.108, 0.055, sm], [-0.115, 0.035, sm], [-0.121, 0.018, sm], [-0.122, 0.01]];
  sw(k.extrude({ name: 'planeTote', mat: 'workshop', shape: shape(ccw(tote)), depth: 0.024, center: true, bevel: { w: 0.006, h: 0.006 }, bsegs: q(2, 1, 1), xf: place }), 'rosewood');
  sw(k.lathe({ name: 'planeToteNut', mat: 'workshop', segs: q(8, 6, 4), profile: profile([[0.0045, 0], [0.0045, 0.003, sm], [0, 0.004]]), xf: place.mul(xf({ pos: [-0.077, 0.1295, 0], rot: [0, 0, 0.25] })) }), 'brass');
  sw(k.lathe({ name: 'planeKnob', mat: 'workshop', segs: q(14, 10, 6), profile: profile([[0.016, 0], [0.0162, 0.006, sm], [0.0185, 0.02, sm], [0.0205, 0.031, sm], [0.019, 0.04, sm], [0.012, 0.0465, sm], [0, 0.0485]]), xf: place.mul(xf({ pos: [0.088, sole, 0] })) }), 'rosewood');
  sw(k.lathe({ name: 'planeKnobNut', mat: 'workshop', segs: q(8, 6, 4), profile: profile([[0.0042, 0], [0.0042, 0.002, sm], [0, 0.003]]), xf: place.mul(xf({ pos: [0.088, sole + 0.0482, 0] })) }), 'brass');

  // 刨口冒出来的刨花：从刃口前面贴着断屑板冒出来，在压铁前面往上走一段，再往前卷成一卷（越卷越紧），顶上探出刨身
  {
    const s = Math.SQRT1_2, n = q(28, 16, 10);
    const p0 = [xm - s * 0.003 + s * 0.0028, s * 0.003 + s * 0.0028], p1 = [xm - 0.0091, 0.035];
    const dl = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]), d = [(p1[0] - p0[0]) / dl, (p1[1] - p0[1]) / dl];
    // 顺时针卷：圆心在行进方向右侧
    const R0 = 0.018, R1 = 0.011, c = [p1[0] + d[1] * R0, p1[1] - d[0] * R0];
    const start = Math.atan2(p1[1] - c[1], p1[0] - c[0]);
    const pts = [[p0[0], p0[1], 0]];
    for (let i = 0; i <= n; i++) {
      const f = i / n, a = start - f * 1.45 * 2 * Math.PI, r = R0 + (R1 - R0) * f;
      pts.push([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a), 0.004 * f]);
    }
    sw(k.sweep({ name: 'planeShaving', mat: 'workshop', shape: rect(0.0006, 0.04), path: pts, up: [0, 0, 1], xf: place }), 'shaving');
  }
}

// ——————————————————————— 角尺 ———————————————————————
// 平躺：尺座（红木）沿局部 x，尺身（钢）从尺座一头沿 +z 伸出去，尺身夹在尺座厚度的中间
function trySquare(k, place) {
  const q = (...v) => k.q(...v);
  const [sl, swd, st] = SQUARE.stock, [bl, bw, bt] = SQUARE.blade;
  const R = WORKSHOP_ATLAS.square;
  sw(k.box({ name: 'squareStock', mat: 'workshop', size: [sl, st, swd], r: q(0.0015, 0.001, 0), segs: q(1, 1, 0), xf: place.mul(xf({ pos: [sl / 2, st / 2, swd / 2] })) }), 'rosewood');
  // 尺身：露出来 bl，插进尺座 swd
  const blade = k.box({ name: 'squareBlade', mat: 'workshop', size: [bw, bt, bl], segs: 0 });
  const steel = workshopSwatch('steel');
  mapUV(blade, (p, n) => (n[1] > 0.7 ? workshopUV('square', (p[2] + bl / 2) / R.w, (bw / 2 - p[0]) / R.h) : steel));
  blade.transform(place.mul(xf({ pos: [bw / 2, st / 2, swd + bl / 2] })));
  // 三颗黄铜铆钉 + 尺座内侧一条黄铜护条
  if (k.lod < 2) {
    for (let i = 0; i < 3; i++) {
      sw(k.lathe({ name: `squareRivet${i}`, mat: 'workshop', segs: q(8, 6), profile: profile([[0.0028, 0], [0.0028, 0.0004], [0, 0.0006]]), xf: place.mul(xf({ pos: [0.007 + i * 0.008, st, swd / 2] })) }), 'brass');
    }
  }
  sw(k.box({ name: 'squareStrip', mat: 'workshop', size: [sl - bw - 0.004, st - 0.004, 0.0015], segs: 0, omit: ['nz'], xf: place.mul(xf({ pos: [bw + 0.002 + (sl - bw - 0.004) / 2, st / 2, swd + 0.00075] })) }), 'brass');
}

// ——————————————————————— 木槌 ———————————————————————
// 山毛榉的槌头（两个打击面往柄那头收一点），圆角矩形截面的木柄穿过槌头；侧躺：槌头一个侧面着地，柄沿 +z 伸出去、尾端搭在台面上
function mallet(k, place) {
  const q = (...v) => k.q(...v);
  const HL = 0.13, HH = 0.075, HW = 0.062, hl = 0.3;
  // 槌头轮廓在 x-z 平面（截面 y → -z：y = +HH/2 是远离木柄的那一头，宽一点），沿 +y 挤出 HW
  const head = [[-HL / 2, HH / 2], [HL / 2, HH / 2], [HL / 2 - 0.006, -HH / 2], [-HL / 2 + 0.006, -HH / 2]];
  k.extrude({ name: 'malletHead', mat: 'pine', shape: shape(ccw(head)), depth: HW, axis: 'y', bevel: 0.003, bsegs: q(1, 1, 0), xf: place });
  const a = [0, HW / 2, -HH / 2 - 0.005], b = [0, 0.0115, HH / 2 + hl];
  k.sweep({ name: 'malletHandle', mat: 'pine', shape: rect(0.03, 0.022, { r: 0.009, segs: q(2, 1, 1) }), path: [a, b], up: [0, 1, 0], xf: place });
}
