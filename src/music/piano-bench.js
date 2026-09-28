import { rect, circle, profile } from '../core/shape.js';
import { xf, smoothstep } from '../core/vec.js';

// 琴凳：演奏用的升降琴凳，黑色钢琴烤漆，坐面是菱形拉扣的黑色皮面。
//   · 坐面是一个圆角盒子加一个形变：整体微微拱起，11 颗扣子（4 + 3 + 4 排成菱形）把皮面往下拉，
//     扣子之间的斜线压出褶子，每个菱形格子鼓成一个小枕头；褶子在节点上加密，法线用雅可比矩阵，明暗是连续的；
//     坐面四周一圈滚边（沿圆角矩形的扫掠，每个点也跟着形变走）；
//   · 坐面底下的上框和四条腿的下框之间留一道缝，缝里是剪式升降架（两侧各一个 X）和横穿的丝杆，
//     两头各一个大旋钮 —— 转旋钮，坐面升降。
// 原点在占地的中心（地面上），长边沿 x
const W = 0.57, D = 0.36;
const LEG = { x: 0.245, z: 0.14, top: 0.3, w0: 0.036, w1: 0.05 };
const GAP = [0.3, 0.38]; // 下框顶面、上框底面
const FRAME = { h: 0.05 };
const CUSH = { h: 0.06, r: 0.02 };
// 扣子：前后两排各 4 颗，中间一排 3 颗
const BTN = [];
for (const z of [-0.085, 0.085]) for (const x of [-0.195, -0.065, 0.065, 0.195]) BTN.push([x, z]);
for (const x of [-0.13, 0, 0.13]) BTN.push([x, 0]);

export default {
  id: 'piano_bench',
  name: '琴凳',
  nameEn: 'Adjustable Tufted Piano Bench',
  category: 'music',
  aoDensity: 220,
  shadow: { margin: 0.15, maxDist: 0.45, density: 100 },
  view: { el: 24, az: 32 },
  build(k) {
    const q = (...v) => k.q(...v);
    const y0 = GAP[1] + FRAME.h; // 坐垫底
    const hx = (W - 0.015) / 2, hy = CUSH.h / 2, hz = (D - 0.015) / 2;

    // —— 拉扣的形变（坐垫的局部坐标：中心为原点）——
    // 褶子：相邻两排扣子之间的斜线，外排的扣子再往坐垫边上各拉一道
    const creases = [];
    const rows = [BTN.filter((b) => b[1] < 0), BTN.filter((b) => b[1] === 0), BTN.filter((b) => b[1] > 0)];
    for (const outer of [rows[0], rows[2]]) for (const a of outer) for (const b of rows[1]) if (Math.abs(a[0] - b[0]) < 0.07) creases.push([a, b]);
    for (const a of [...rows[0], ...rows[2]]) {
      const zs = Math.sign(a[1]) * hz;
      for (const s of [-1, 1]) creases.push([a, [a[0] + s * 0.065, zs]]);
    }
    const segDist = (x, z, a, b) => {
      const dx = b[0] - a[0], dz = b[1] - a[1];
      const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz)));
      return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t);
    };
    const tuft = k.lod < 2;
    const lift = (x, z) => {
      const ex = Math.max(0, 1 - (x / hx) ** 2), ez = Math.max(0, 1 - (z / hz) ** 2);
      let h = 0.008 * ex * ez;
      if (!tuft) return h + 0.004 * ex * ez;
      let dc = Infinity, db = Infinity;
      for (const [a, b] of creases) dc = Math.min(dc, segDist(x, z, a, b));
      for (const b of BTN) db = Math.min(db, Math.hypot(x - b[0], z - b[1]));
      // 格子鼓起来（离褶子越远越高）、褶子里压下去、扣子那里最深
      h += 0.012 * smoothstep(0, 0.04, dc) * Math.min(1, ex * 4) * Math.min(1, ez * 4);
      h -= 0.014 * Math.exp(-((db / 0.012) ** 2));
      return h;
    };
    const deform = (p) => {
      const w = smoothstep(hy - 2 * CUSH.r, hy, p[1]);
      return [p[0], p[1] + w * lift(p[0], p[2]), p[2]];
    };
    k.box({
      name: 'cushion', mat: 'leather_black', size: [2 * hx, CUSH.h, 2 * hz], r: q(CUSH.r, 0.016, 0.012), segs: q(2, 2, 1),
      div: q([26, 1, 16], [14, 1, 9], [4, 1, 3]), omit: ['ny'], deform, xf: xf({ pos: [0, y0 + hy, 0] }),
    });
    // 扣子：皮包的小圆扣，坐在凹坑里
    if (k.lod < 2) {
      BTN.forEach(([x, z], i) => {
        k.lathe({
          name: `button${i}`, mat: 'leather_black', segs: q(8, 6),
          profile: profile([[0.0075, -0.003], [0.0072, 0.0012, { smooth: true }], [0, 0.0035]]),
          xf: xf({ pos: [x, y0 + CUSH.h + lift(x, z) + 0.001, z] }),
        });
      });
    }
    // 滚边：沿坐垫顶边的一圈（圆角矩形，四个角跟坐垫一样圆），每个点跟着形变走
    if (k.lod < 1) {
      // 滚边在坐垫顶边圆角 45° 的位置：那一圈的平面圆角半径是 0.71r，圆心和坐垫的竖向圆角同心
      const rr = CUSH.r * 0.71, ix = hx - CUSH.r * 0.29, iz = hz - CUSH.r * 0.29, n = 3;
      const pts = [];
      for (const [cx, cz, a0] of [[ix - rr, iz - rr, 0], [-(ix - rr), iz - rr, 90], [-(ix - rr), -(iz - rr), 180], [ix - rr, -(iz - rr), 270]]) {
        for (let i = 0; i <= n; i++) {
          const a = ((a0 + (90 * i) / n) * Math.PI) / 180;
          const x = cx + rr * Math.cos(a), z = cz + rr * Math.sin(a);
          const p = deform([x, hy - CUSH.r * 0.3, z]);
          pts.push([p[0], y0 + hy + p[1], p[2]]);
        }
        // 长边中间加几个点，跟着拱起
        const [nx, nz] = [[-(ix - rr), iz], [-ix, -(iz - rr)], [ix - rr, -iz], [ix, iz - rr]][a0 / 90];
        const [px, pz] = [[ix - rr, iz], [-ix, iz - rr], [-(ix - rr), -iz], [ix, -(iz - rr)]][a0 / 90];
        for (let j = 1; j < 5; j++) {
          const x = px + ((nx - px) * j) / 5, z = pz + ((nz - pz) * j) / 5;
          const p = deform([x, hy - CUSH.r * 0.3, z]);
          pts.push([p[0], y0 + hy + p[1], p[2]]);
        }
      }
      k.sweep({ name: 'piping', mat: 'leather_black', shape: circle(0.0038, 5), closed: true, caps: [false, false], up: [0, 1, 0], path: pts, density: { side: 0.5 } });
    }

    // —— 上框：坐垫底下的一圈烤漆裙边 ——
    k.box({ name: 'frameTop', mat: 'lacquer', size: [W, FRAME.h, D], r: q(0.008, 0.006, 0.003), segs: q(2, 1, 1), xf: xf({ pos: [0, GAP[1] + FRAME.h / 2, 0] }) });

    // —— 下框：四条方锥腿（上粗下细）+ 四面裙板 ——
    for (const [i, sx, sz] of [[0, 1, 1], [1, -1, 1], [2, -1, -1], [3, 1, -1]]) {
      k.extrude({
        name: `leg${i}`, mat: 'lacquer', shape: rect(LEG.w0, LEG.w0, { r: q(0.005, 0.004, 0), segs: q(2, 1, 0) }), depth: LEG.top, taper: LEG.w1 / LEG.w0,
        axis: 'y', caps: [false, true], bevel: [0, q(0.003, 0)], bsegs: 1, xf: xf({ pos: [sx * LEG.x, 0, sz * LEG.z] }),
      });
    }
    const ah = 0.055, at = 0.022;
    for (const s of [-1, 1]) {
      k.box({ name: `apronZ${s > 0 ? 'F' : 'B'}`, mat: 'lacquer', size: [2 * LEG.x - LEG.w1, ah, at], r: q(0.003, 0), segs: q(1, 0), xf: xf({ pos: [0, LEG.top - ah / 2, s * (LEG.z + LEG.w1 / 2 - at / 2 - 0.004)] }) });
      k.box({ name: `apronX${s > 0 ? 'R' : 'L'}`, mat: 'lacquer', size: [at, ah, 2 * LEG.z - LEG.w1], r: q(0.003, 0), segs: q(1, 0), xf: xf({ pos: [s * (LEG.x + LEG.w1 / 2 - at / 2 - 0.004), LEG.top - ah / 2, 0] }) });
    }

    // —— 升降架：两侧各一个剪刀叉（两根扁钢交叉，中间一颗销子），一根丝杆横穿，两头的大旋钮 ——
    const gh = GAP[1] - GAP[0], gm = (GAP[0] + GAP[1]) / 2, span = 0.3;
    const ang = Math.atan2(gh - 0.01, span);
    for (const s of [-1, 1]) {
      for (const [j, a] of [[0, ang], [1, -ang]]) {
        k.box({
          name: `scissor${s > 0 ? 'F' : 'B'}${j}`, mat: 'steel', size: [Math.hypot(span, gh - 0.01), 0.016, 0.005], r: q(0.002, 0), segs: q(1, 0),
          xf: xf({ pos: [0, gm, s * (0.105 + j * 0.006)], rot: [0, 0, a] }),
        });
      }
      if (k.lod < 2) k.lathe({ name: `pivot${s > 0 ? 'F' : 'B'}`, mat: 'steel', segs: q(8, 6), profile: profile([[0.007, 0], [0.007, 0.004, { r: 0.002, segs: 1 }], [0, 0.005]]), xf: xf({ pos: [0, gm, s * 0.114], rot: [s * Math.PI / 2, 0, 0] }) });
    }
    k.sweep({ name: 'screw', mat: 'steel', shape: circle(0.008, q(8, 6, 4)), caps: [false, false], up: [0, 1, 0], path: [[-W / 2 - 0.012, gm, 0], [W / 2 + 0.012, gm, 0]] });
    for (const s of [-1, 1]) {
      k.lathe({
        // 扁圆盘：细颈、圆边，正面微微拱起
        name: `knob${s > 0 ? 'R' : 'L'}`, mat: 'lacquer', segs: q(16, 10, 8),
        profile: profile([
          [0.011, 0], [0.011, 0.01, { r: q(0.003, 0), segs: 1 }], [0.031, 0.013, { r: q(0.006, 0.004, 0), segs: 1 }],
          [0.036, 0.024, { smooth: true }], [0.032, 0.036, { r: q(0.005, 0.004, 0), segs: 1 }], [0, 0.04],
        ]),
        xf: xf({ pos: [s * (W / 2 + 0.004), gm, 0], rot: [0, 0, -s * Math.PI / 2] }),
      });
    }
  },
};
