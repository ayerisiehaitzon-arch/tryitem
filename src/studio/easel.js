import { shape, profile } from '../core/shape.js';
import { xf } from '../core/vec.js';
import { studioUV, studioSwatch } from '../materials/atlas.js';
import { sw, mapUV, ccw, tiltX, brush } from './parts.js';

// 画架：一座 H 型的橡木画室画架，夹着一幅画到一半的油画（60 × 80cm 的内框油画布），托盘上躺着几支画笔和一支铅笔。
//   · 底座：两条纵梁、两条横梁（前面一条托着立柱，后面一条接两根斜撑）；两根立柱、底下一道横档、顶上一根横梁，
//     正面看是一个 “H”；两根斜撑从底座后面撑到立柱中段，侧面看是一个三角；
//   · 升降杆贴在横档前面，上下两个导向卡子（上面的带锁紧旋钮）；托盘和顶上的夹子都是卡在升降杆上的滑块，背后一颗蝶形旋钮；
//   · 画布：正面是画（颜料的厚度在法线里），四个侧面是包过来的白底布，背面是没上底料的亚麻：
//     一圈内框木条、中间一根横撑，布边翻到木条背面、一排钉子钉住，布上盖着厂家的印章和铅笔写的画名；
//   · 原点在底座中心的地面上，画面朝 +z。
const RAIL = { x: 0.29, w: 0.05, h: 0.065, z0: -0.42, z1: 0.22 };   // 底座的两条纵梁
const UP = { x: 0.2, w: 0.045, d: 0.035, top: 1.74 };                 // 两根立柱（z = 0 居中）
const HEAD = { h: 0.06, over: 0.03 };                                  // 顶上的横梁
const MAST = { w: 0.05, d: 0.028, y0: 0.34, y1: 2.02 };               // 升降杆，贴在横档前面
const MZ = UP.d / 2 + MAST.d / 2;                                      // 升降杆中心的 z
const CZ = UP.d / 2 + MAST.d;                                          // 升降杆前面 = 画布背面
const CAN = { w: 0.6, h: 0.8, d: 0.022, bar: 0.045 };                  // 画布和内框木条
const TRAY = { y: 0.82, depth: 0.11, w: 0.64, t: 0.02 };               // 托盘顶面的高度
const BRACE = { z: -0.36, y: 1.0 };                                    // 斜撑：底座后横梁 → 立柱中段

export default {
  id: 'easel',
  name: '画架',
  nameEn: 'H-Frame Studio Easel',
  category: 'studio',
  aoDensity: 240,
  shadow: { margin: 0.18, maxDist: 0.8, density: 90 },
  view: { el: 12, az: 26 },
  build(k) {
    const q = (...v) => k.q(...v);
    const R = q(0.004, 0.003, 0), RS = q(2, 1, 0);
    const oak = (name, size, pos, grain, o = {}) => k.box({ name, mat: 'oak', size, r: R, segs: RS, grain, xf: xf({ pos, rot: o.rot ?? [0, 0, 0] }), omit: o.omit ?? [] });

    // —— 底座 ——
    for (const s of [-1, 1]) {
      oak(`rail${s > 0 ? 'R' : 'L'}`, [RAIL.w, RAIL.h, RAIL.z1 - RAIL.z0], [s * RAIL.x, RAIL.h / 2, (RAIL.z0 + RAIL.z1) / 2], 'z', { omit: ['ny'] });
    }
    const inner = 2 * (RAIL.x - RAIL.w / 2);
    oak('crossFront', [inner, RAIL.h - 0.005, 0.055], [0, (RAIL.h - 0.005) / 2, 0], 'x', { omit: ['ny', 'px', 'nx'] });
    oak('crossBack', [inner, RAIL.h - 0.015, 0.045], [0, (RAIL.h - 0.015) / 2, BRACE.z], 'x', { omit: ['ny', 'px', 'nx'] });

    // —— H 形：两根立柱、下横档、顶横梁 ——
    for (const s of [-1, 1]) {
      oak(`post${s > 0 ? 'R' : 'L'}`, [UP.w, UP.top - RAIL.h + 0.005, UP.d], [s * UP.x, (UP.top + RAIL.h - 0.005) / 2, 0], 'y', { omit: ['ny', 'py'] });
    }
    oak('rungLow', [2 * UP.x - UP.w, 0.05, UP.d * 0.8], [0, 0.42, 0], 'x', { omit: ['px', 'nx'] });
    oak('head', [2 * (UP.x + UP.w / 2 + HEAD.over), HEAD.h, UP.d + 0.006], [0, UP.top + HEAD.h / 2, 0], 'x');

    // —— 两根斜撑：从底座后横梁顶上撑到立柱背面 ——
    {
      const a = [BRACE.z, RAIL.h - 0.015], b = [-UP.d / 2 - 0.012, BRACE.y];
      const dy = b[1] - a[1], dz = b[0] - a[0], L = Math.hypot(dy, dz);
      for (const s of [-1, 1]) {
        oak(`brace${s > 0 ? 'R' : 'L'}`, [0.03, L + 0.02, 0.024], [s * UP.x, (a[1] + b[1]) / 2, (a[0] + b[0]) / 2], 'y', { rot: [tiltX(dy, dz), 0, 0] });
      }
    }

    // —— 升降杆和两个导向卡子（上面的带锁紧旋钮）——
    oak('mast', [MAST.w, MAST.y1 - MAST.y0, MAST.d], [0, (MAST.y0 + MAST.y1) / 2, MZ], 'y');
    const guide = (name, y, h) => {
      oak(`${name}Front`, [MAST.w + 0.03, h, 0.012], [0, y, CZ + 0.006], 'x');
      for (const s of [-1, 1]) oak(`${name}${s > 0 ? 'R' : 'L'}`, [0.015, h, MAST.d], [s * (MAST.w / 2 + 0.0075), y, MZ], 'y', { omit: ['nz', 'pz'] });
    };
    guide('guideLow', 0.42, 0.05);
    guide('guideTop', UP.top + HEAD.h / 2, HEAD.h - 0.01);
    knob(k, 'lockKnob', [0, UP.top + HEAD.h / 2, CZ + 0.012], 1);

    // —— 托盘：卡在升降杆上的滑块（两块三角的侧板夹着升降杆，后面一块压板和旋钮），前面一块托板带挡边 ——
    {
      const yt = TRAY.y - TRAY.t, yb = TRAY.y - 0.15, zb = UP.d / 2 - 0.014;
      const cheek = shape(ccw([[zb, yb], [CZ, yb], [CZ + 0.085, yt], [zb, yt]].map(([z, y]) => [-z, y])));
      for (const s of [-1, 1]) {
        k.extrude({ name: `trayCheek${s > 0 ? 'R' : 'L'}`, mat: 'oak', shape: cheek, depth: 0.014, axis: 'x', bevel: q(0.003, 0.002, 0), bsegs: 1, xf: xf({ pos: [s > 0 ? MAST.w / 2 : -MAST.w / 2 - 0.014, 0, 0] }) });
      }
      oak('trayBack', [MAST.w, 0.13, 0.014], [0, yb + 0.07, zb + 0.007], 'x', { omit: ['px', 'nx'] });
      knob(k, 'trayKnob', [0, yb + 0.07, zb], -1);
      oak('tray', [TRAY.w, TRAY.t, TRAY.depth], [0, TRAY.y - TRAY.t / 2, CZ + TRAY.depth / 2], 'x');
      oak('trayLip', [TRAY.w, 0.032, 0.012], [0, TRAY.y + 0.009, CZ + TRAY.depth - 0.006], 'x', { omit: ['ny'] });
    }

    // —— 顶上的夹子：压住画布上沿，前面一道唇扣住画面 ——
    {
      const y0 = TRAY.y + CAN.h, yT = y0 + 0.055, zf = CZ + CAN.d + 0.013;
      const jaw = shape(ccw([[CZ, y0], [CZ + CAN.d + 0.001, y0], [CZ + CAN.d + 0.001, y0 - 0.022], [zf, y0 - 0.022], [zf, yT], [CZ, yT]].map(([z, y]) => [-z, y])));
      k.extrude({ name: 'clamp', mat: 'oak', shape: jaw, depth: 0.09, axis: 'x', center: true, bevel: q(0.003, 0.002, 0), bsegs: 1 });
      for (const s of [-1, 1]) oak(`clamp${s > 0 ? 'R' : 'L'}`, [0.014, yT - y0, MAST.d + 0.014], [s * (MAST.w / 2 + 0.007), (y0 + yT) / 2, MZ - 0.007], 'y', { omit: ['pz'] });
      oak('clampBack', [MAST.w, yT - y0, 0.014], [0, (y0 + yT) / 2, UP.d / 2 - 0.007], 'x', { omit: ['px', 'nx'] });
      knob(k, 'clampKnob', [0, (y0 + yT) / 2, UP.d / 2 - 0.014], -1);
    }

    // —— 画布 ——
    canvas(k, xf({ pos: [0, TRAY.y, CZ + CAN.d] }));

    // —— 托盘上：四支画笔、一支铅笔 ——
    const yb = TRAY.y;
    const lay = (x, z, R, yaw) => xf({ pos: [x, yb + R, CZ + CAN.d + z], rot: [0, yaw, -Math.PI / 2] });
    brush(k, 'brush0', { L: 0.3, R: 0.0044, handle: 'handleRed', tip: 'lilac', place: lay(-0.2, 0.017, 0.0044, 0.05) });
    brush(k, 'brush1', { L: 0.27, R: 0.0038, handle: 'handleWood', tip: 'paintBlue', place: lay(-0.12, 0.034, 0.0038, -0.08) });
    brush(k, 'brush2', { L: 0.32, R: 0.0048, handle: 'handleBlack', tip: 'paintYellow', place: lay(-0.02, 0.05, 0.0048, 0.03) });
    brush(k, 'brush3', { L: 0.24, R: 0.0034, handle: 'handleRed', tip: 'paintGreen', place: lay(0.05, 0.068, 0.0034, -0.14) });
    pencil(k, 'pencil', [0.12, yb, CZ + CAN.d + 0.03], 2.9);
  },
};

// 蝶形旋钮：黑色的胶木，一个圆柱的芯、两片翅膀；dir = +1 朝 +z、-1 朝 -z
function knob(k, name, pos, dir) {
  const q = (...v) => k.q(...v);
  const rot = [dir > 0 ? Math.PI / 2 : -Math.PI / 2, 0, 0];
  sw(k.lathe({
    name: `${name}Hub`, mat: 'studio', segs: q(10, 7, 5),
    profile: profile([[0.0045, 0], [0.0045, 0.006], [0.0095, 0.007], [0.0095, 0.02, { r: q(0.003, 0.002, 0), segs: 1 }], [0, 0.021]]),
    xf: xf({ pos, rot }),
  }), 'handleBlack');
  const sm = { smooth: true };
  const wing = shape(ccw([
    [-0.009, 0.007], [-0.024, 0.009, sm], [-0.031, 0.016, sm], [-0.027, 0.023, sm], [-0.012, 0.02],
    [0.012, 0.02], [0.027, 0.023, sm], [0.031, 0.016, sm], [0.024, 0.009, sm], [0.009, 0.007],
  ]));
  sw(k.extrude({ name: `${name}Wing`, mat: 'studio', shape: wing, depth: 0.006, axis: 'z', center: true, bevel: q(0.0015, 0), bsegs: 1, xf: xf({ pos, rot }) }), 'handleBlack');
}

// 画布：局部坐标原点在画面的底边中点，画面在 z = 0、朝 +z，布和内框往 -z 走 CAN.d
function canvas(k, place) {
  const q = (...v) => k.q(...v);
  const { w: W, h: H, d: D, bar: B } = CAN;
  const canvasSw = studioSwatch('canvas'), pine = studioSwatch('pine');
  const parts = [];
  const front = (p) => studioUV('painting', (p[0] + W / 2) / W, 1 - p[1] / H);
  const back = (p) => studioUV('back', (W / 2 - p[0]) / W, 1 - p[1] / H);
  // 画面 + 四个侧面（包过来的白底布）；背面敞着
  const slab = k.box({ name: 'canvas', mat: 'studio', size: [W, H, D], segs: 0, omit: ['nz'], xf: xf({ pos: [0, H / 2, -D / 2] }) });
  parts.push(mapUV(slab, (p, n) => (n[2] > 0.7 ? front(p) : canvasSw)));
  // 布的背面（从后面看，印章和铅笔字是正的）
  const linen = k.box({ name: 'linen', mat: 'studio', size: [W - 2 * B, H - 2 * B, 0.001], segs: 0, omit: ['pz', 'px', 'nx', 'py', 'ny'], xf: xf({ pos: [0, H / 2, -0.0015] }) });
  parts.push(mapUV(linen, back));
  // 内框：四根木条，背面是翻过来的布边（亚麻），里侧是木头
  const bars = [
    ['barL', [B, H, D], [-W / 2 + B / 2, H / 2], ['nx', 'pz']],
    ['barR', [B, H, D], [W / 2 - B / 2, H / 2], ['px', 'pz']],
    ['barB', [W - 2 * B, B, D], [0, B / 2], ['ny', 'pz', 'px', 'nx']],
    ['barT', [W - 2 * B, B, D], [0, H - B / 2], ['py', 'pz', 'px', 'nx']],
  ];
  for (const [name, size, [x, y], omit] of bars) {
    const b = k.box({ name, mat: 'studio', size, segs: 0, omit, xf: xf({ pos: [x, y, -D / 2 - 0.0005] }) });
    parts.push(mapUV(b, (p, n) => (n[2] < -0.7 ? back(p) : pine)));
  }
  // 中间的横撑（比木条薄，离布有一道缝）
  parts.push(sw(k.box({ name: 'crossbar', mat: 'studio', size: [W - 2 * B, 0.05, D - 0.006], segs: 0, omit: ['px', 'nx'], xf: xf({ pos: [0, H / 2, -D / 2 - 0.0035] }) }), 'pine'));
  // 背面的钉子：一排排钉住翻过来的布边
  if (k.lod === 0) {
    const pts = [];
    for (let i = 0; i < 7; i++) { const x = -W / 2 + 0.06 + (i * (W - 0.12)) / 6; pts.push([x, B * 0.45, 0], [x, H - B * 0.45, 0]); }
    for (let i = 0; i < 9; i++) { const y = 0.06 + (i * (H - 0.12)) / 8; pts.push([-W / 2 + B * 0.45, y, 1], [W / 2 - B * 0.45, y, 1]); }
    pts.forEach(([x, y, v], i) => {
      parts.push(sw(k.box({ name: `staple${i}`, mat: 'studio', size: v ? [0.0016, 0.011, 0.0008] : [0.011, 0.0016, 0.0008], segs: 0, omit: ['pz'], xf: xf({ pos: [x, y, -D - 0.0009] }) }), 'silver'));
    });
  }
  for (const p of parts) p.transform(place);
}

// 一支六棱的铅笔：绿漆的杆、削出来的木头尖、石墨芯
function pencil(k, name, pos, yaw) {
  const r = 0.0037, L = 0.17;
  const lay = xf({ pos: [pos[0], pos[1] + r * 0.87, pos[2]], rot: [0, yaw, -Math.PI / 2] });
  sw(k.lathe({ name: `${name}Body`, mat: 'studio', segs: 6, profile: profile([[0, 0], [r, 0.0005], [r, L - 0.022]]), xf: lay }), 'pencilGreen');
  sw(k.lathe({ name: `${name}Wood`, mat: 'studio', segs: 6, profile: profile([[r, L - 0.022], [0.0012, L - 0.004]]), xf: lay }), 'handleWood');
  sw(k.lathe({ name: `${name}Lead`, mat: 'studio', segs: 6, profile: profile([[0.0012, L - 0.004], [0, L]]), xf: lay }), 'graphite');
}

