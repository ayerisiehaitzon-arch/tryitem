import { shape, profile, rect, circle } from '../core/shape.js';
import { xf } from '../core/vec.js';
import { WORKSHOP_ATLAS, workshopUV, workshopSwatch } from '../materials/atlas.js';
import { PEG, BOARD, HOOK, hole, pliersHandle } from './layout.js';
import { sw, mapUV, rod, pencil, ccw, catmull } from './parts.js';

// 洞洞板工具墙：一块 1.2 × 0.9 m 的灰蓝色洞洞板，垫着两根木条离墙 22mm，四周一圈松木边框。
//   · 板上用白漆画着每件工具的轮廓（贴图，和下面挂工具的位置是同一份数据 layout.js）；
//     手锯和角尺的位置只剩轮廓和空着的挂钩 —— 它们一个卡在锯木架上，一个躺在木工桌上；
//   · 挂钩都插在孔里（镀锌钢丝，水平伸出来、末端上翘），工具搁在挂钩上：
//     水平尺、锤子、一排螺丝刀（插在木架子上）、两把钳子、五把梅花开口扳手、一把活扳手、卷尺、
//     三把 F 夹、一排凿子（木架子）、一卷橙色的延长线；
//   · 下面一块小搁板（两个钢托架）：三个装螺丝钉的玻璃罐、一个插满铅笔的红铁罐；延长线的两个插头垂在罐子和笔筒之间；
//   · 壁挂：原点在墙面上、洞洞板的中心（z = 0 是墙，板朝 +z）。
const ZF = PEG.stand + PEG.t;                        // 板面离墙
const X = (bx) => bx - PEG.w / 2, Y = (by) => by - PEG.h / 2;
const HX = (c) => X(hole(c)), HY = (r) => Y(hole(r));

export default {
  id: 'pegboard',
  name: '洞洞板工具墙',
  nameEn: 'Pegboard Tool Wall',
  category: 'workshop',
  mount: 'wall',
  aoDensity: 300,
  shadow: { margin: 0.1, maxDist: 0.14, density: 150, strength: 0.6 },
  view: { el: 6, az: 16 },
  build(k) {
    const q = (...v) => k.q(...v);
    const sm = { smooth: true };

    // —— 板、垫木、边框 ——
    {
      const b = k.box({ name: 'board', mat: 'workshop', size: [PEG.w, PEG.h, PEG.t], segs: 0, omit: ['nz'] });
      const edge = workshopSwatch('hardboard');
      mapUV(b, (p, n) => (n[2] > 0.7 ? workshopUV('pegboard', (p[0] + PEG.w / 2) / PEG.w, (PEG.h / 2 - p[1]) / PEG.h) : edge));
      b.transform(xf({ pos: [0, 0, PEG.stand + PEG.t / 2] }));
      for (const s of [-1, 1]) {
        k.box({ name: `furring${s > 0 ? 'T' : 'B'}`, mat: 'pine', size: [PEG.w - 0.02, 0.05, PEG.stand], segs: 0, omit: ['nz', 'pz'], grain: 'x', xf: xf({ pos: [0, s * (PEG.h / 2 - 0.04), PEG.stand / 2] }) });
      }
      const fw = 0.022, fd = ZF + 0.01;
      for (const s of [-1, 1]) {
        k.box({ name: `frame${s > 0 ? 'T' : 'B'}`, mat: 'pine', size: [PEG.w + 2 * fw, fw, fd], r: 0.002, segs: q(1, 1, 0), omit: ['nz'], grain: 'x', xf: xf({ pos: [0, s * (PEG.h / 2 + fw / 2), fd / 2] }) });
        k.box({ name: `frame${s > 0 ? 'R' : 'L'}`, mat: 'pine', size: [fw, PEG.h, fd], r: 0.002, segs: q(1, 1, 0), omit: ['nz', 'py', 'ny'], grain: 'y', xf: xf({ pos: [s * (PEG.w / 2 + fw / 2), 0, fd / 2] }) });
      }
    }

    // —— 挂钩：插在第 c 列、第 r 排的孔里，水平伸出 L，末端上翘 ——
    const peg = (name, [c, r], L = 0.055) => {
      const x = HX(c), y = HY(r);
      const path = [[x, y, ZF - 0.002], [x, y, ZF + L - 0.009], [x, y + 0.005, ZF + L]];
      sw(k.sweep({ name, mat: 'workshop', shape: circle(HOOK.r, q(6, 5, 3)), path, up: [0, 1, 0] }), 'zinc');
    };
    const hooks = [
      ...BOARD.saw.hooks, ...BOARD.level.hooks, ...BOARD.hammer.hooks, ...BOARD.drivers.hooks, ...BOARD.pliers.map((p) => p.hook),
      ...BOARD.wrenches.cols.map((c) => [c, BOARD.wrenches.row]), BOARD.adjust.hook, BOARD.tape.hook, ...BOARD.square.hooks,
      ...BOARD.clamps.hooks, ...BOARD.chisels.hooks, ...BOARD.spare,
    ];
    hooks.forEach((h, i) => peg(`hook${i}`, h));
    peg('cordHook', BOARD.cord.hook, 0.07);

    level(k);
    hammer(k);
    drivers(k);
    BOARD.pliers.forEach((p, i) => pliers(k, `pliers${i}`, p));
    BOARD.wrenches.xs.forEach((x, i) => wrench(k, `wrench${i}`, i));
    adjustable(k);
    tape(k);
    BOARD.clamps.xs.forEach((x, i) => clamp(k, `clamp${i}`, x));
    chisels(k);
    shelf(k);
    cord(k);
  },
};

// ——————————————————————— 水平尺 ———————————————————————
// 黄色喷塑的铝型材：正面是贴图（刻度、字、三个水泡），上下两条磨亮的测量面，两头黑色的塑料端盖
function level(k) {
  const q = (...v) => k.q(...v);
  const L = BOARD.level, len = L.x1 - L.x0, R = WORKSHOP_ATLAS.level;
  const cx = X((L.x0 + L.x1) / 2), cy = Y(L.y0 + L.h / 2), cz = ZF + L.d / 2 + 0.001;
  const lv = k.box({ name: 'level', mat: 'workshop', size: [len, L.h, L.d], segs: 0, omit: ['nz'] });
  const yel = workshopSwatch('yellow'), alu = workshopSwatch('aluminum');
  mapUV(lv, (p, n) => (n[2] > 0.7 ? workshopUV('level', (p[0] + len / 2) / R.w, (L.h / 2 - p[1]) / R.h) : Math.abs(n[1]) > 0.7 ? alu : yel));
  lv.transform(xf({ pos: [cx, cy, cz] }));
  for (const s of [-1, 1]) {
    sw(k.box({ name: `levelCap${s > 0 ? 'R' : 'L'}`, mat: 'workshop', size: [0.013, L.h + 0.003, L.d + 0.003], r: q(0.003, 0.002, 0), segs: q(1, 1, 0), omit: ['nz'], xf: xf({ pos: [cx + s * (len / 2 - 0.0055), cy, cz] }) }), 'blackPlastic');
  }
}

// ——————————————————————— 锤子 ———————————————————————
// 羊角锤：山核桃木柄（下粗上细的椭圆截面），锤头 = 中间的锤眼 + 左边圆柱形的锤面 + 右边往下弯的羊角
function hammer(k) {
  const q = (...v) => k.q(...v);
  const sm = { smooth: true };
  const H = BOARD.hammer, x = X(H.x), yh = Y(H.yHead), zc = ZF + 0.014, ye = Y(H.yEnd);
  sw(k.sweep({ name: 'hammerHandle', mat: 'workshop', shape: circle(1, q(12, 8, 6), { rx: 0.0125, ry: 0.0095 }), path: [[x, ye, zc], [x, yh + 0.008, zc]], up: [0, 0, 1], scale: (t) => 1.08 - 0.28 * t }), 'hickory');
  sw(k.box({ name: 'hammerEye', mat: 'workshop', size: [0.03, 0.03, 0.026], r: q(0.003, 0.002, 0), segs: q(1, 1, 0), xf: xf({ pos: [x, yh, zc] }) }), 'steel');
  // 锤面：车削，轴朝 -x
  const faceLen = H.x - H.head[0] - 0.012;
  sw(k.lathe({ name: 'hammerFace', mat: 'workshop', segs: q(14, 10, 6), profile: profile([[0.0125, 0], [0.0105, faceLen * 0.35, sm], [0.0112, faceLen * 0.65, sm], [0.0136, faceLen - 0.008], [0.0136, faceLen - 0.002, { r: 0.0015, segs: 1 }], [0, faceLen]]), xf: xf({ pos: [x - 0.012, yh, zc], rot: [0, 0, Math.PI / 2] }) }), 'steel');
  // 羊角：侧面轮廓挤出，底边在挂钩那里是平的（刚好搁在钩上），往尖上往下弯
  const cl = H.head[1] - H.x;
  const claw = [[0.012, -0.014], [0.042, -0.014], [cl - 0.012, -0.017], [cl - 0.001, -0.024], [cl, -0.018], [cl - 0.014, -0.005], [0.04, 0.007], [0.026, 0.012], [0.012, 0.014]];
  sw(k.extrude({ name: 'hammerClaw', mat: 'workshop', shape: shape(ccw(claw.map(([a, b]) => [x + a, yh + b]))), depth: 0.022, center: true, bevel: q(0.0015, 0.001, 0), xf: xf({ pos: [0, 0, zc] }) }), 'steel');
}

// ——————————————————————— 螺丝刀 ———————————————————————
function drivers(k) {
  const q = (...v) => k.q(...v);
  const sm = { smooth: true };
  const D = BOARD.drivers, [x0, x1, ry, rt, rd] = D.rack;
  const zc = ZF + rd / 2, top = Y(ry + rt);
  k.box({ name: 'driverRack', mat: 'pine', size: [x1 - x0, rt, rd], r: 0.002, segs: q(1, 1, 0), omit: ['nz'], grain: 'x', xf: xf({ pos: [X((x0 + x1) / 2), Y(ry + rt / 2), zc] }) });
  D.xs.forEach((bx, i) => {
    const x = X(bx), place = xf({ pos: [x, top, zc] });
    sw(k.lathe({ name: `driverGrip${i}`, mat: 'workshop', segs: q(12, 8, 6), profile: profile([[0.006, 0], [0.011, 0.004, sm], [0.0125, 0.012, sm], [0.0145, 0.03]]), xf: place }), 'blackPlastic');
    sw(k.lathe({ name: `driverHandle${i}`, mat: 'workshop', segs: q(12, 8, 6), profile: profile([[0.0145, 0.03], [0.0155, 0.065, sm], [0.0148, 0.088, sm], [0.011, 0.097, sm], [0, D.handle]]), xf: place }), D.colors[i]);
    const yb = Y(ry - D.shafts[i]);
    rod(k, `driverShaft${i}`, [x, top + 0.002, zc], [x, yb + 0.01, zc], 0.0029, 'chrome', { segs: q(8, 6, 4) });
    if (i % 2 === 0) sw(k.box({ name: `driverTip${i}`, mat: 'workshop', size: [0.0058, 0.012, 0.0014], segs: 0, xf: xf({ pos: [x, yb + 0.006, zc] }) }), 'chrome');
    else sw(k.lathe({ name: `driverTip${i}`, mat: 'workshop', segs: 4, profile: profile([[0, 0], [0.0022, 0.004], [0.0029, 0.01]]), xf: xf({ pos: [x, yb, zc] }) }), 'chrome');
  });
}

// ——————————————————————— 钳子 ———————————————————————
// 钳嘴朝下：钢的钳嘴（挤出）、轴，两根钳柄（钢，外面套一截彩色的塑胶套）
function pliers(k, name, p) {
  const q = (...v) => k.q(...v);
  const x = X(p.x), piv = Y(p.y0 + p.len * 0.3), y0 = Y(p.y0), zc = ZF + 0.0075;
  const jaw = [[x - 0.0028, y0], [x + 0.0028, y0], [x + 0.0085, piv - 0.03], [x + 0.0115, piv - 0.008], [x - 0.0115, piv - 0.008], [x - 0.0085, piv - 0.03]];
  sw(k.extrude({ name: `${name}Jaw`, mat: 'workshop', shape: shape(ccw(jaw)), depth: 0.009, center: true, bevel: q(0.001, 0.0008, 0), xf: xf({ pos: [0, 0, zc] }) }), 'steel');
  sw(k.lathe({ name: `${name}Pivot`, mat: 'workshop', segs: q(14, 10, 6), profile: profile([[0.0115, -0.0055], [0.0115, 0.0055, { r: 0.0015, segs: 1 }], [0.003, 0.006], [0, 0.006]]), xf: xf({ pos: [x, piv, zc], rot: [Math.PI / 2, 0, 0] }) }), 'steel');
  for (const sd of [-1, 1]) {
    const [a, b, e] = pliersHandle(p, sd).map(([bx, by]) => [X(bx), Y(by), zc]);
    const tag = sd > 0 ? 'R' : 'L';
    // 钢柄：轴到塑胶套之间一小段
    const m = [a[0] + (b[0] - a[0]) * 0.55, a[1] + (b[1] - a[1]) * 0.55, zc];
    sw(k.sweep({ name: `${name}Steel${tag}`, mat: 'workshop', shape: rect(0.0085, 0.008, { r: q(0.002, 0.0015, 0), segs: 1 }), path: [[x + sd * 0.002, piv, zc], a, m], up: [0, 0, 1] }), 'steel');
    // 塑胶套：一段平滑的曲线，尾端略粗
    const path = catmull([m, b, e], q(4, 3, 2));
    sw(k.sweep({ name: `${name}Grip${tag}`, mat: 'workshop', shape: circle(1, q(8, 6, 4), { rx: 0.0062, ry: 0.0056 }), path, up: [0, 0, 1], scale: (t) => 0.95 + 0.15 * t }), p.grip);
  }
}

// ——————————————————————— 梅花开口扳手 ———————————————————————
// 上头梅花圈（套在挂钩上），中间扁的杆，下头开口（开口斜 15°）；镀铬
function wrench(k, name, i) {
  const q = (...v) => k.q(...v);
  const W = BOARD.wrenches, s = W.sizes[i], L = W.lens[i];
  const x = X(W.xs[i]), top = Y(W.tops[i]), zc = ZF + 0.0035, t = 0.0055;
  const rc = top - s;
  sw(k.lathe({ name: `${name}Ring`, mat: 'workshop', segs: q(16, 12, 8), profile: profile([[0.55 * s, -t / 2], [s, -t / 2], [s, t / 2], [0.55 * s, t / 2], [0.55 * s, -t / 2]]), xf: xf({ pos: [x, rc, zc], rot: [Math.PI / 2, 0, 0] }) }), 'chrome');
  const ya = top - 1.7 * s, yb = top - L + 1.9 * s;
  sw(k.box({ name: `${name}Shaft`, mat: 'workshop', size: [0.9 * s, ya - yb, t - 0.001], r: q(0.0012, 0.001, 0), segs: q(1, 1, 0), xf: xf({ pos: [x, (ya + yb) / 2, zc] }) }), 'chrome');
  // 开口：半径 1.15s 的圆去掉一条宽 0.95s 的槽
  const R = 1.15 * s, hw = 0.475 * s, phi = -Math.PI / 2 + 0.26, oc = [x, top - L + 1.1 * s];
  const al = Math.asin(hw / R), n = q(14, 10, 6);
  const du = [Math.cos(phi), Math.sin(phi)], dv = [-du[1], du[0]];
  const at = (u, v) => [oc[0] + du[0] * u + dv[0] * v, oc[1] + du[1] * u + dv[1] * v];
  const pts = [];
  for (let j = 0; j <= n; j++) {
    const a = phi + al + ((2 * Math.PI - 2 * al) * j) / n;
    pts.push([oc[0] + R * Math.cos(a), oc[1] + R * Math.sin(a), { smooth: j > 0 && j < n }]);
  }
  pts.push(at(-0.25 * s, -hw), at(-0.25 * s, hw));
  sw(k.extrude({ name: `${name}Open`, mat: 'workshop', shape: shape(ccw(pts)), depth: t, center: true, bevel: q(0.0008, 0.0006, 0), xf: xf({ pos: [0, 0, zc] }) }), 'chrome');
}

// ——————————————————————— 活扳手 ———————————————————————
function adjustable(k) {
  const q = (...v) => k.q(...v);
  const A = BOARD.adjust, x = X(A.x), top = Y(A.top), zc = ZF + 0.0045;
  const head = [[x - 0.026, top - 0.034, { r: 0.006, segs: 2 }], [x - 0.017, top - 0.05, { r: 0.004, segs: 2 }], [x + 0.012, top - 0.05, { r: 0.004, segs: 2 }], [x + 0.02, top - 0.03], [x + 0.02, top - 0.004, { r: 0.003, segs: 1 }],
    [x + 0.015, top], [x + 0.007, top], [x + 0.007, top - 0.022], [x - 0.013, top - 0.022], [x - 0.013, top], [x - 0.02, top, { r: 0.003, segs: 1 }], [x - 0.026, top - 0.012]];
  sw(k.extrude({ name: 'adjHead', mat: 'workshop', shape: shape(ccw(head)), depth: 0.009, center: true, bevel: q(0.001, 0.0008, 0), xf: xf({ pos: [0, 0, zc] }) }), 'chrome');
  const hl = A.len - 0.045;
  sw(k.box({ name: 'adjHandle', mat: 'workshop', size: [0.02, hl, 0.0065], r: q(0.0025, 0.002, 0), segs: q(1, 1, 0), xf: xf({ pos: [x, top - 0.045 - hl / 2 + 0.004, zc] }) }), 'chrome');
  sw(k.lathe({ name: 'adjEnd', mat: 'workshop', segs: q(12, 8, 6), profile: profile([[0.0105, -0.00325], [0.0105, 0.00325, { r: 0.002, segs: 1 }], [0, 0.00325]]), xf: xf({ pos: [x, top - A.len + 0.0105, zc], rot: [Math.PI / 2, 0, 0] }) }), 'chrome');
  sw(k.lathe({ name: 'adjHole', mat: 'workshop', segs: q(10, 8), profile: profile([[0.0042, 0], [0, 0]]), xf: xf({ pos: [x, top - A.len + 0.0105, zc + 0.0033], rot: [Math.PI / 2, 0, 0] }) }), 'holeDark');
  if (k.lod < 2) sw(k.lathe({ name: 'adjWorm', mat: 'workshop', segs: q(10, 6), profile: profile([[0.0055, -0.008], [0.0062, -0.006, { smooth: true }], [0.0062, 0.006, { smooth: true }], [0.0055, 0.008]]), xf: xf({ pos: [x - 0.004, top - 0.032, zc + 0.002], rot: [0, 0, Math.PI / 2] }) }), 'steelDark');
}

// ——————————————————————— 卷尺 ———————————————————————
function tape(k) {
  const q = (...v) => k.q(...v);
  const T = BOARD.tape, [cx, cy] = [X(T.c[0]), Y(T.c[1])], zc = ZF + T.d / 2 + 0.001;
  sw(k.box({ name: 'tapeCase', mat: 'workshop', size: [T.w, T.h, T.d], r: 0.012, segs: q(3, 2, 1), xf: xf({ pos: [cx, cy, zc] }) }), 'yellow');
  sw(k.lathe({ name: 'tapeBadge', mat: 'workshop', segs: q(16, 12, 8), profile: profile([[0.023, 0], [0.023, 0.002, { r: 0.0015, segs: 1 }], [0, 0.0025]]), xf: xf({ pos: [cx + 0.004, cy + 0.002, zc + T.d / 2 - 0.0005], rot: [Math.PI / 2, 0, 0] }) }), 'blackPlastic');
  // 尺带出口：左下角探出一截黄色的尺带和黄铜的尺钩
  sw(k.box({ name: 'tapeBlade', mat: 'workshop', size: [0.012, 0.0016, 0.019], segs: 0, xf: xf({ pos: [cx - T.w / 2 - 0.004, cy - T.h / 2 + 0.006, zc] }) }), 'yellow');
  sw(k.box({ name: 'tapeHook', mat: 'workshop', size: [0.0016, 0.009, 0.021], segs: 0, xf: xf({ pos: [cx - T.w / 2 - 0.0105, cy - T.h / 2 + 0.0095, zc] }) }), 'brass');
  if (k.lod < 2) sw(k.box({ name: 'tapeLock', mat: 'workshop', size: [0.018, 0.005, 0.01], r: q(0.002, 0), segs: q(1, 0), xf: xf({ pos: [cx - 0.012, cy + T.h / 2 + 0.001, zc + 0.004] }) }), 'blackPlastic');
}

// ——————————————————————— F 夹 ———————————————————————
// 镀锌的扁钢条，上头固定钳口、中间滑动钳口（铸铁），丝杆从滑动钳口的尖上穿下来，底下一个木手柄
function clamp(k, name, bx) {
  const q = (...v) => k.q(...v);
  const sm = { smooth: true };
  const C = BOARD.clamps, x = X(bx), y0 = Y(C.y0), top = y0 + C.len, re = C.reach, zc = ZF + 0.011;
  sw(k.box({ name: `${name}Bar`, mat: 'workshop', size: [0.018, C.len, 0.006], r: q(0.001, 0), segs: q(1, 0), xf: xf({ pos: [x, y0 + C.len / 2, zc] }) }), 'zinc');
  const fixed = [[x - 0.012, top - 0.03], [x + 0.045, top - 0.03], [x + re, top - 0.02], [x + re, top], [x - 0.012, top]];
  sw(k.extrude({ name: `${name}Fixed`, mat: 'workshop', shape: shape(ccw(fixed)), depth: 0.02, center: true, bevel: q(0.0015, 0.001, 0), xf: xf({ pos: [0, 0, zc] }) }), 'steelDark');
  const ys = y0 + C.len * 0.52;
  const slide = [[x - 0.012, ys], [x + 0.045, ys], [x + re, ys + 0.008], [x + re, ys + 0.028], [x - 0.012, ys + 0.028]];
  sw(k.extrude({ name: `${name}Slide`, mat: 'workshop', shape: shape(ccw(slide)), depth: 0.02, center: true, bevel: q(0.0015, 0.001, 0), xf: xf({ pos: [0, 0, zc] }) }), 'steelDark');
  const sx = x + re - 0.012;
  rod(k, `${name}Screw`, [sx, y0 + 0.068, zc], [sx, ys + 0.04, zc], 0.0045, 'zinc', { segs: q(8, 6, 4) });
  if (k.lod < 2) sw(k.lathe({ name: `${name}Pad`, mat: 'workshop', segs: q(10, 8), profile: profile([[0.0095, 0], [0.0095, 0.004, sm], [0, 0.0045]]), xf: xf({ pos: [sx, ys + 0.038, zc] }) }), 'zinc');
  sw(k.lathe({ name: `${name}Handle`, mat: 'workshop', segs: q(12, 8, 6), profile: profile([[0.0065, 0], [0.0105, 0.006, sm], [0.012, 0.022, sm], [0.0118, 0.05, sm], [0.0095, 0.065, sm], [0.006, 0.07]]), xf: xf({ pos: [sx, y0, zc] }) }), 'hickory');
}

// ——————————————————————— 凿子 ———————————————————————
function chisels(k) {
  const q = (...v) => k.q(...v);
  const sm = { smooth: true };
  const C = BOARD.chisels, [x0, x1, ry, rt, rd] = C.rack;
  const zc = ZF + rd / 2, top = Y(ry + rt);
  k.box({ name: 'chiselRack', mat: 'pine', size: [x1 - x0, rt, rd], r: 0.002, segs: q(1, 1, 0), omit: ['nz'], grain: 'x', xf: xf({ pos: [X((x0 + x1) / 2), Y(ry + rt / 2), zc] }) });
  C.xs.forEach((bx, i) => {
    const x = X(bx), w = C.widths[i];
    sw(k.lathe({ name: `chiselFerrule${i}`, mat: 'workshop', segs: q(10, 8, 6), profile: profile([[0.0075, 0], [0.0092, 0.004, sm], [0.0095, 0.013]]), xf: xf({ pos: [x, top, zc] }) }), 'brass');
    sw(k.lathe({ name: `chiselHandle${i}`, mat: 'workshop', segs: q(12, 8, 6), profile: profile([[0.0095, 0.013], [0.0118, 0.025, sm], [0.0138, 0.055, sm], [0.0145, 0.085, sm], [0.0128, 0.1, sm], [0.008, 0.108, sm], [0, C.handle]]), xf: xf({ pos: [x, top, zc] }) }), 'hickory');
    const yb = Y(ry - C.blade);
    sw(k.box({ name: `chiselBlade${i}`, mat: 'workshop', size: [w, top - yb, 0.0042], segs: 0, xf: xf({ pos: [x, (top + yb) / 2, zc] }) }), 'steel');
    if (k.lod < 2) sw(k.box({ name: `chiselBevel${i}`, mat: 'workshop', size: [w, 0.01, 0.0044], segs: 0, xf: xf({ pos: [x, yb + 0.005, zc] }) }), 'chrome');
  });
}

// ——————————————————————— 搁板、玻璃罐、笔筒 ———————————————————————
function shelf(k) {
  const q = (...v) => k.q(...v);
  const sm = { smooth: true };
  const S = BOARD.shelf, zc = ZF + S.d / 2, yt = Y(S.y + S.t);
  k.box({ name: 'shelf', mat: 'pine', size: [S.x1 - S.x0, S.t, S.d], r: 0.002, segs: q(1, 1, 0), omit: ['nz'], grain: 'x', xf: xf({ pos: [X((S.x0 + S.x1) / 2), Y(S.y + S.t / 2), zc] }) });
  // 钢托架：竖条贴着板、横条托着搁板、一根斜撑
  S.brackets.forEach((c, i) => {
    const x = HX(c), yb = Y(S.y);
    sw(k.box({ name: `bracketUp${i}`, mat: 'workshop', size: [0.012, 0.065, 0.003], segs: 0, omit: ['nz'], xf: xf({ pos: [x, yb - 0.0325, ZF + 0.0015] }) }), 'zinc');
    sw(k.box({ name: `bracketArm${i}`, mat: 'workshop', size: [0.012, 0.004, S.d - 0.012], segs: 0, xf: xf({ pos: [x, yb - 0.002, ZF + (S.d - 0.012) / 2] }) }), 'zinc');
    rod(k, `bracketBrace${i}`, [x, yb - 0.058, ZF + 0.003], [x, yb - 0.004, ZF + 0.07], 0.0022, 'zinc', { segs: q(6, 4, 3) });
  });
  // 玻璃罐：玻璃（透明）、里面一罐螺丝（贴图）、黄铜色的盖子
  S.jars.forEach((bx, j) => {
    const place = xf({ pos: [X(bx), yt, zc] });
    k.lathe({ name: `jar${j}`, mat: 'glass', segs: q(18, 12, 8), profile: profile([[0, 0.0008], [0.03, 0.0008, sm], [0.034, 0.006, sm], [0.034, 0.074, sm], [0.031, 0.082, sm], [0.028, 0.086], [0.028, 0.091]]), xf: place });
    // 螺丝：侧面一个放样的圆筒（UV 按环 / 列给，绕一圈正好一张贴图），顶上一个平面投影的小鼓包
    const n = q(18, 12, 8), fh = 0.05 + 0.008 * j, rf = 0.0325, v0 = [0, 0.27, 0.54][j];
    const rings = [0.003, fh].map((y) => Array.from({ length: n }, (_, a) => [rf * Math.cos((2 * Math.PI * a) / n), y, -rf * Math.sin((2 * Math.PI * a) / n)]));
    const side = k.loft({ name: `jarFill${j}`, mat: 'workshop', rings });
    side.T = side.P.map((_, idx) => workshopUV('screws', (idx % (n + 1)) / n, v0 + (1 - Math.floor(idx / (n + 1))) * 0.45));
    side.transform(place);
    const dome = k.lathe({ name: `jarPile${j}`, mat: 'workshop', segs: n, profile: profile([[rf, fh], [0.022, fh + 0.006, sm], [0, fh + 0.009]]) });
    mapUV(dome, (p) => workshopUV('screws', 0.5 + p[0] / 0.1, 0.5 + p[2] / 0.1));
    dome.transform(place);
    sw(k.lathe({ name: `jarLid${j}`, mat: 'workshop', segs: q(18, 12, 8), profile: profile([[0.0295, 0.085], [0.0306, 0.0865, sm], [0.0306, 0.1, sm], [0.0285, 0.1025, sm], [0, 0.103]]), xf: place }), 'lid');
  });
  // 红铁罐里插着几支铅笔
  {
    const place = xf({ pos: [X(S.can), yt, zc] });
    sw(k.lathe({ name: 'can', mat: 'workshop', segs: q(18, 12, 8), profile: profile([[0, 0.0008], [0.034, 0.0008, sm], [0.037, 0.004, sm], [0.037, 0.106, sm], [0.0362, 0.11]]), xf: place }), 'canRed');
    sw(k.lathe({ name: 'canRim', mat: 'workshop', segs: q(18, 12, 8), profile: profile([[0.0362, 0.107], [0.038, 0.1092, sm], [0.0362, 0.1115], [0.0345, 0.1105]]), xf: place }), 'zinc');
    sw(k.lathe({ name: 'canInside', mat: 'workshop', segs: q(18, 12, 8), profile: profile([[0.0348, 0.104], [0, 0.104]]), xf: place }), 'holeDark');
    const pens = [[-0.012, -0.008, 0.1, -0.12, 'pencilYellow'], [0.011, -0.01, -0.16, -0.08, 'redPlastic'], [0.004, 0.013, 0.05, 0.16, 'pencilYellow'], [-0.014, 0.01, 0.18, 0.1, 'bluePlastic']];
    pens.forEach(([dx, dz, rz, rx, color], i) => {
      if (k.lod === 2 && i > 1) return;
      pencil(k, `canPencil${i}`, { L: 0.175, color, place: xf({ pos: [X(S.can) + dx, yt + 0.004, zc + dz], rot: [rx, 0, rz] }) });
    });
  }
}

// ——————————————————————— 延长线 ———————————————————————
// 一卷橙色的电线（三圈，一圈比一圈离板远一点），从挂钩上垂下来；两头从卷的右下方垂到搁板上方，末端各一个插头
function cord(k) {
  const q = (...v) => k.q(...v);
  const [c, r] = BOARD.cord.hook, R = BOARD.cord.r, cr = 0.0055;
  const hx = HX(c), hy = HY(r) + HOOK.r + cr, z0 = ZF + 0.013;
  const th0 = (320 * Math.PI) / 180, th1 = (1420 * Math.PI) / 180, n = Math.round(q(22, 14, 9) * (th1 - th0) / (2 * Math.PI));
  const at = (th) => {
    const t = (th - th0) / (2 * Math.PI), Rt = R * (1 + 0.05 * Math.sin(2.3 * t + 0.4));
    const cx = hx + 0.006 * Math.sin(1.7 * t), cy = hy - Rt;
    return [cx + Rt * Math.cos(th), cy + Rt * Math.sin(th), z0 + 0.0115 * t];
  };
  const path = Array.from({ length: n + 1 }, (_, i) => at(th0 + ((th1 - th0) * i) / n));
  sw(k.sweep({ name: 'cordCoil', mat: 'workshop', shape: circle(cr, q(8, 6, 4)), path, up: [0, 0, 1] }), 'cordOrange');
  // 两头：从卷的右下方垂下来（夹在第三个罐子和笔筒之间），末端一个插头
  const yb = Y(BOARD.shelf.y + BOARD.shelf.t);
  const ends = [
    { name: 'A', from: path[0], ctrl: [[hx + 0.068, hy - 2 * R + 0.0], [hx + 0.064, yb + 0.068]], plug: 'male' },
    { name: 'B', from: path[path.length - 1], ctrl: [[hx + 0.1, hy - 2 * R + 0.02], [hx + 0.11, yb + 0.075]], plug: 'female' },
  ];
  for (const e of ends) {
    const z = e.from[2];
    const pts = catmull([e.from, ...e.ctrl.map(([x, y]) => [x, y, z])], q(5, 3, 2));
    sw(k.sweep({ name: `cordTail${e.name}`, mat: 'workshop', shape: circle(cr, q(8, 6, 4)), path: pts, up: [0, 0, 1] }), 'cordOrange');
    const [px, py] = e.ctrl[1];
    if (e.plug === 'male') {
      sw(k.box({ name: 'plugA', mat: 'workshop', size: [0.024, 0.036, 0.017], r: q(0.004, 0.003, 0), segs: q(2, 1, 0), xf: xf({ pos: [px, py - 0.016, z] }) }), 'cordOrange');
      if (k.lod < 2) for (const s of [-1, 1]) sw(k.box({ name: `plugPin${s > 0 ? 'R' : 'L'}`, mat: 'workshop', size: [0.0016, 0.016, 0.0065], segs: 0, xf: xf({ pos: [px + s * 0.0063, py - 0.041, z] }) }), 'brass');
    } else {
      sw(k.box({ name: 'plugB', mat: 'workshop', size: [0.032, 0.042, 0.03], r: q(0.005, 0.004, 0), segs: q(2, 1, 0), xf: xf({ pos: [px, py - 0.019, z] }) }), 'cordOrange');
      sw(k.box({ name: 'plugFace', mat: 'workshop', size: [0.024, 0.001, 0.022], segs: 0, xf: xf({ pos: [px, py - 0.0405, z] }) }), 'blackPlastic');
    }
  }
}
