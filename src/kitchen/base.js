import { profile, shape, circle, rect } from '../core/shape.js';
import { xf } from '../core/vec.js';
import { roundedPath } from '../core/path.js';
import { knob } from '../furniture/parts.js';
import { GAP, faceFrame, shakerFront, cupPull } from './cabinetry.js';

// 橱柜：一排 2.4m 靠墙地柜。从左到右：三斗抽屉 | 白色陶瓷围裙水槽 + 两扇门 | 电磁炉 + 三斗抽屉
//   · 墨绿色烤漆，英式面框 + 嵌入式 Shaker 门板（见 cabinetry.js）；抽屉是黄铜杯形拉手，水槽下的门是小圆钮；
//   · 大理石台面是一整块挤出：俯视轮廓在水槽处挖一个 U 形缺口（缺口内角是圆角，跟着盆口走），
//     纹理从头到尾连续，边缘一圈 3mm 圆边；两头各探出柜体 1.5cm，前面探出面框 3.5cm；
//   · 水槽是一次闭合扫掠：“壁”的截面（盆底圆角 → 内壁 → 盆沿 → 围裙外壁 → 底边）沿圆角矩形走一圈，
//     围裙正面凸出门板 2cm；盆底是一张面，塞在圆角底下；
//   · 台面到吊柜底之间贴手工釉面砖（zellige），贴图按台面对齐，最下面一排是整砖，最上面一排是切过的半砖；
//   · 原点在柜子宽度中点的地面上，柜背贴墙（z = -0.3），正面朝 +z。
const X0 = -1.2, X1 = 1.2;
const Z = { back: -0.3, carcass: 0.26, face: 0.285, top: 0.32 };
const Y = { plinth: 0.1, top: 0.86, counter: 0.9, splash: 1.45 };
const ST = 0.045; // 竖梃宽
const DIV = [-0.6, 0.3]; // 三段的分界（竖梃中线）
const DRAWER_RAILS = [[0.1, 0.14], [0.4, 0.43], [0.63, 0.66], [0.82, 0.86]]; // 抽屉段的横档：下 26 / 中 20 / 上 16cm 三斗
const SINK = { cx: -0.15, w: 0.76, zb: -0.17, zf: 0.305, y0: 0.64, rim: 0.895, tw: 0.022, rc: 0.045, depth: 0.23, fr: 0.02 };
const HOB = { cx: 0.74, cz: 0.01, w: 0.59, d: 0.52, t: 0.005 };

// 水槽壁的截面：在 (x 朝盆中心, y 向上) 平面里，y = 0 是盆沿
function sinkProfile(k) {
  const q = (...v) => k.q(...v);
  const h = SINK.tw / 2, fr = SINK.fr, D = SINK.depth, B = SINK.rim - SINK.y0;
  const pts = [];
  // 盆底和内壁之间的大圆角（显式取点：从盆底一侧开始，最后一点和内壁相切）
  const nf = q(3, 2, 1);
  for (let i = 0; i <= nf; i++) {
    const a = -Math.PI / 2 - (i / nf) * (Math.PI / 2);
    pts.push([h + fr + fr * Math.cos(a), -D + fr + fr * Math.sin(a), { smooth: true }]);
  }
  pts.push(
    [h, 0, { r: q(0.006, 0.005, 0), segs: 1 }], // 盆沿内圆角（加权法线，一段斜面就当圆角着色）
    [-h, 0, { r: q(0.006, 0.005, 0), segs: 1 }], // 围裙上沿
    [-h, -B], // 围裙下沿
    [h + 0.02, -B], // 底边往里收一段：从下往上看不穿
  );
  const sh = profile(pts);
  // 圆角段用解析法线（指向圆心），盆底到内壁的明暗是连续的
  const c = [h + fr, -D + fr];
  for (const sg of sh.segs) {
    for (const [p, key] of [[sg.a, 'na'], [sg.b, 'nb']]) {
      const dx = c[0] - p[0], dy = c[1] - p[1], l = Math.hypot(dx, dy);
      if (Math.abs(l - fr) < 1e-6 && p[1] < -D + fr + 1e-6) sg[key] = [dx / l, dy / l];
    }
  }
  return sh;
}

// 圆角矩形闭合路径（xz 平面，高度 y）：从前沿开始朝 +x 走，从上往下看逆时针绕一圈 ——
// 这样扫掠标架的 R 处处指向盆中心（截面 x > 0 在盆里面）
function roundRectLoop(x0, x1, zb, zf, r, n, y) {
  const C = [[x1 - r, zf - r], [x1 - r, zb + r], [x0 + r, zb + r], [x0 + r, zf - r]];
  const pts = [];
  C.forEach(([cx, cz], c) => {
    for (let i = 0; i <= n; i++) {
      const a = (c + i / n) * (Math.PI / 2);
      pts.push([cx + r * Math.sin(a), y, cz + r * Math.cos(a)]);
    }
  });
  return pts;
}

function sink(k) {
  const q = (...v) => k.q(...v);
  const { cx, w, zb, zf, tw, rc, rim, depth, fr } = SINK;
  const h = tw / 2;
  k.sweep({
    name: 'sink', mat: 'ceramic', shape: sinkProfile(k), closed: true, caps: [false, false], up: [0, 1, 0], maxChart: 1.2,
    path: roundRectLoop(cx - w / 2 + h, cx + w / 2 - h, zb + h, zf - h, rc, q(3, 2, 1), rim),
  });
  // 盆底：一张面，比圆角的收口低 0.5mm、四边伸进圆角底下 8mm
  const ix0 = cx - w / 2 + tw, ix1 = cx + w / 2 - tw, iz0 = zb + tw, iz1 = zf - tw;
  const e = fr - 0.008;
  k.box({
    name: 'sinkFloor', mat: 'ceramic', size: [ix1 - ix0 - 2 * e, 0.001, iz1 - iz0 - 2 * e], segs: 0,
    omit: ['ny', 'px', 'nx', 'pz', 'nz'],
    xf: xf({ pos: [cx, rim - depth - 0.001, (iz0 + iz1) / 2] }),
  });
  // 下水口：不锈钢法兰 + 黑色的“孔”（一张比盆底高 1mm 的圆片）
  if (k.lod < 1) {
    const at = xf({ pos: [cx, rim - depth - 0.0005, (iz0 + iz1) / 2 - 0.03] });
    k.lathe({
      name: 'drain', mat: 'stainless', segs: q(10, 6),
      profile: profile([[0.042, 0.0003], [0.039, 0.0022, { r: q(0.0015, 0), segs: 1 }], [0.029, 0.0022], [0.026, 0.001]]),
      xf: at,
    });
    k.lathe({ name: 'drainHole', mat: 'steel', segs: q(10, 6), profile: profile([[0.026, 0.001], [0, 0.001]]), xf: at });
  }
  return { ix0, ix1, iz0, iz1 };
}

// 鹅颈龙头（黄铜）：底座 + 一根弯成倒 U 的管子 + 侧面单把手
function faucet(k, x, z) {
  const q = (...v) => k.q(...v);
  const y0 = Y.counter, r = 0.011, zOut = -0.005;
  k.lathe({
    name: 'faucetBase', mat: 'brass', segs: q(10, 7),
    profile: profile([[0.027, 0], [0.027, 0.005, { r: q(0.002, 0.0015, 0), segs: 1 }], [0.017, 0.013, { smooth: true }], [0.0135, 0.03]]),
    xf: xf({ pos: [x, y0, z] }),
  });
  const top = y0 + 0.37, R = (zOut - z) / 2;
  k.sweep({
    name: 'faucetNeck', mat: 'brass', shape: circle(r, q(8, 6)), caps: [false, true], up: [1, 0, 0],
    // 倒 U 的两个弯半径相同、正好接成半圆；出水口前 1.5cm 放大一圈（起泡器）
    path: roundedPath([[x, y0 + 0.025, z], [x, top, z], [x, top, zOut], [x, top - 0.225, zOut], [x, top - 0.24, zOut]], R, q(5, 3)),
    scale: (t) => (t > 0.9999 ? 1.15 : 1),
  });
  if (k.lod < 1) {
    // 把手：从立管侧面伸出的一根细杆，杆头收细
    const hy = y0 + 0.1;
    k.lathe({
      name: 'faucetHub', mat: 'brass', segs: q(8, 6),
      profile: profile([[0.0095, 0], [0.0095, 0.022, { r: q(0.002, 0), segs: 1 }], [0, 0.022]]),
      xf: xf({ pos: [x + r - 0.002, hy, z], rot: [0, 0, -Math.PI / 2] }),
    });
    k.sweep({
      name: 'faucetLever', mat: 'brass', shape: circle(0.0042, q(6, 5)), caps: [false, true], up: [0, 0, 1],
      path: roundedPath([[x + r + 0.018, hy, z], [x + r + 0.03, hy + 0.012, z], [x + r + 0.085, hy + 0.022, z]], 0.015, q(2, 1)),
      scale: (t) => 1 - 0.3 * t,
    });
  }
}

// 电磁炉：黑色微晶玻璃面板（压在台面上，四边 2mm 斜边）+ 四个炉圈的丝印
function cooktop(k) {
  const q = (...v) => k.q(...v);
  const { cx, cz, w, d, t } = HOB;
  k.extrude({
    name: 'hob', mat: 'glass_black', shape: rect(w, d, { r: 0.004 }), depth: t, axis: 'y', caps: [false, true],
    bevel: [0, { w: 0.002, h: 0.002, flat: true }], density: { side: 0.3 },
    xf: xf({ pos: [cx, Y.counter, cz] }),
  });
  if (k.lod < 1) {
    const zones = [[-0.145, -0.105, 0.1], [0.145, -0.105, 0.075], [-0.145, 0.13, 0.075], [0.145, 0.125, 0.095]];
    zones.forEach(([dx, dz, r], i) => k.lathe({
      name: `zone${i}`, mat: 'glass_print', segs: q(20, 14),
      profile: profile([[r + 0.0012, 0], [r - 0.0012, 0]]),
      xf: xf({ pos: [cx + dx, Y.counter + t + 0.0003, cz + dz] }),
    }));
    // 触控条：前沿正中一道短线
    k.box({
      name: 'hobTouch', mat: 'glass_print', size: [0.09, 0.001, 0.003], segs: 0, omit: ['ny', 'px', 'nx', 'pz', 'nz'],
      xf: xf({ pos: [cx, Y.counter + t - 0.0002, cz + d / 2 - 0.03] }),
    });
  }
}

export default {
  id: 'kitchen_base',
  name: '橱柜',
  nameEn: 'Shaker Kitchen Base Run',
  category: 'kitchen',
  aoDensity: 130,
  shadow: { margin: 0.2, maxDist: 0.6, density: 60 },
  view: { el: 18, az: 24 },
  build(k) {
    const q = (...v) => k.q(...v);
    const zDoor = Z.face - 0.02; // 门板背面
    // —— 柜体（门缝里看见的那一面）、踢脚 ——
    const railYs = DRAWER_RAILS.flat();
    const nodes = (vals, c, hh) => [-1, ...vals.map((v) => (v - c) / hh).filter((t) => t > -1 + 1e-6 && t < 1 - 1e-6), 1];
    const cy = (Y.plinth + Y.top) / 2, hy = (Y.top - Y.plinth) / 2, cz = (Z.back + Z.carcass) / 2, hz = (Z.carcass - Z.back) / 2;
    k.box({
      name: 'carcass', mat: 'paint_green', size: [X1 - X0, Y.top - Y.plinth, Z.carcass - Z.back], segs: 0,
      omit: ['nz', 'py'], density: { pz: 0.3, ny: 0.3 },
      // 侧面在面框横档的高度、踢脚正面的深度上加顶点：和面框竖梃、踢脚的侧面棱对棱
      div: [1, nodes(railYs, cy, hy), nodes([Z.face - 0.06], cz, hz)],
      xf: xf({ pos: [0, cy, cz] }),
    });
    k.box({
      name: 'plinth', mat: 'paint_green', size: [X1 - X0, Y.plinth, Z.face - 0.06 - Z.back], segs: 0,
      omit: ['nz', 'ny', 'py'], density: { pz: 0.5 },
      xf: xf({ pos: [0, Y.plinth / 2, (Z.face - 0.06 + Z.back) / 2] }),
    });
    // —— 面框 ——
    const A = [X0 + ST, DIV[0] - ST / 2], B = [DIV[0] + ST / 2, DIV[1] - ST / 2], C = [DIV[1] + ST / 2, X1 - ST];
    const sx0 = SINK.cx - SINK.w / 2, sx1 = SINK.cx + SINK.w / 2;
    const drawerRails = (x) => DRAWER_RAILS.map(([y0, y1], i) => ({ x0: x[0], x1: x[1], y0, y1, omit: i === DRAWER_RAILS.length - 1 ? ['py'] : [] }));
    faceFrame(k, {
      name: 'frame', mat: 'paint_green', z0: Z.carcass, z1: Z.face, y0: Y.plinth, y1: Y.top,
      stiles: [[X0, X0 + ST], [DIV[0] - ST / 2, DIV[0] + ST / 2], [DIV[1] - ST / 2, DIV[1] + ST / 2], [X1 - ST, X1]],
      rails: [
        ...drawerRails(A), ...drawerRails(C),
        { x0: B[0], x1: B[1], y0: 0.1, y1: 0.14 },
        { x0: B[0], x1: B[1], y0: 0.61, y1: SINK.y0, omit: ['py'] },
        // 水槽围裙两边的窄条：一头顶着竖梃，一头露在水槽旁边
        { x0: B[0], x1: sx0, y0: SINK.y0, y1: Y.top, keep: ['px'], omit: ['py', 'ny'] },
        { x0: sx1, x1: B[1], y0: SINK.y0, y1: Y.top, keep: ['nx'], omit: ['py', 'ny'] },
      ],
    });
    // —— 抽屉面板 + 杯形拉手 ——
    const fwD = 0.045, pd = 0.007;
    for (const [sec, x] of [['A', A], ['C', C]]) {
      for (let i = 0; i < DRAWER_RAILS.length - 1; i++) {
        const y0 = DRAWER_RAILS[i][1], y1 = DRAWER_RAILS[i + 1][0];
        shakerFront(k, { name: `drawer${sec}${i}`, mat: 'paint_green', x0: x[0] + GAP, x1: x[1] - GAP, y0: y0 + GAP, y1: y1 - GAP, z: zDoor, fw: fwD, pd });
        if (k.lod < 2) cupPull(k, { name: `pull${sec}${i}`, pos: [(x[0] + x[1]) / 2, (y0 + y1) / 2 + 0.015, Z.face - pd] });
      }
    }
    // —— 水槽下两扇门 + 小圆钮（钮在两扇门相对的一侧，靠上）——
    const dy0 = 0.14 + GAP, dy1 = 0.61 - GAP, mid = (B[0] + B[1]) / 2;
    const fwS = 0.055;
    shakerFront(k, { name: 'doorL', mat: 'paint_green', x0: B[0] + GAP, x1: mid - GAP / 2, y0: dy0, y1: dy1, z: zDoor, fw: fwS, pd });
    shakerFront(k, { name: 'doorR', mat: 'paint_green', x0: mid + GAP / 2, x1: B[1] - GAP, y0: dy0, y1: dy1, z: zDoor, fw: fwS, pd });
    if (k.lod < 2) {
      for (const s of [-1, 1]) {
        knob(k, { name: `knob${s > 0 ? 'R' : 'L'}`, mat: 'brass', d: 0.026, h: 0.024, segs: q(8, 6), pos: [mid + s * (GAP / 2 + fwS / 2), dy1 - 0.07, Z.face], rot: [Math.PI / 2, 0, 0] });
      }
    }
    // —— 水槽、龙头 ——
    const bowl = sink(k);
    if (k.lod < 2) faucet(k, SINK.cx, (Z.back + bowl.iz0) / 2 - 0.004);
    // —— 台面：俯视轮廓（x, -z）挖出水槽缺口 ——
    const ov = 0.015; // 两头探出
    const nx0 = bowl.ix0 + 0.003, nx1 = bowl.ix1 - 0.003, nzb = bowl.iz0 + 0.003;
    const rn = SINK.rc - SINK.tw / 2 - 0.003; // 缺口内角 = 盆口内角
    const top = shape([
      [X0 - ov, -Z.back], [X0 - ov, -Z.top, { r: 0.003 }], [nx0, -Z.top, { r: 0.002 }],
      [nx0, -nzb, { r: rn, segs: q(3, 2, 1) }], [nx1, -nzb, { r: rn, segs: q(3, 2, 1) }],
      [nx1, -Z.top, { r: 0.002 }], [X1 + ov, -Z.top, { r: 0.003 }], [X1 + ov, -Z.back],
    ]);
    k.extrude({
      name: 'counter', mat: 'marble_slab', shape: top, depth: Y.counter - Y.top, axis: 'y',
      bevel: [0, q(0.003, 0.003, 0.002)], bsegs: q(2, 1, 1), density: { cap0: 0.3 },
      xf: xf({ pos: [0, Y.top, 0] }),
    });
    cooktop(k);
    // —— 墙砖：台面到吊柜底 ——
    const sb = k.box({
      name: 'splash', mat: 'zellige', size: [X1 - X0, Y.splash - Y.counter, 0.01], segs: 0, grain: 'x',
      omit: ['nz', 'ny'], density: { pz: 0.6 },
      xf: xf({ pos: [0, (Y.counter + Y.splash) / 2, Z.back + 0.005] }),
    });
    sb.uvShift = [(X1 - X0) / 2, (Y.splash - Y.counter) / 2]; // 砖缝从台面左端、台面上沿起算
  },
};
