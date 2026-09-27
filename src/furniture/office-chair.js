import { shape, profile, rect, circle } from '../core/shape.js';
import { xf, smoothstep } from '../core/vec.js';
import { roundedPath } from '../core/path.js';
import { puffDeform } from '../prims/box.js';
import { rod } from './parts.js';

// 办公椅：抛光铝五星脚 + 炭灰亚麻座面 / 靠背 + 黑色扶手
//   · 五星脚是“一个星形截面挤出”再加一个下垂形变：一次挤出就得到五条带圆头的脚，
//     比五根扫掠管省一半以上的面；下垂形变让脚尖比中心低 22mm，轮廓一下就对了
//   · 座面前沿“瀑布式”下弯、靠背两侧前包 + 腰托鼓起，全是形变，只在需要弯的方向加节点
//   · 坐垫底面、外壳朝里的一面这类完全被挡住的面不生成
export default {
  id: 'office_chair',
  name: '办公椅',
  nameEn: 'Studio Task Chair',
  build(k) {
    const q = (...v) => k.q(...v);

    // —— 五星脚 ——
    const rTip = 0.315, rIn = 0.062, wTip = 0.036;
    const pts = [];
    for (let i = 0; i < 5; i++) {
      const a = (i * 72 - 90) * (Math.PI / 180); // shape 空间角度；i=0 指向正前方（+z）
      const d = [Math.cos(a), Math.sin(a)], p = [-Math.sin(a), Math.cos(a)];
      const v = a - (36 * Math.PI) / 180;
      const tip = { r: wTip * 0.46, segs: q(2, 1, 1) };
      pts.push([rIn * Math.cos(v), rIn * Math.sin(v), { r: q(0.02, 0.02, 0), segs: 1 }]);
      pts.push([rTip * d[0] - (wTip / 2) * p[0], rTip * d[1] - (wTip / 2) * p[1], tip]);
      pts.push([rTip * d[0] + (wTip / 2) * p[0], rTip * d[1] + (wTip / 2) * p[1], tip]);
    }
    const star = k.extrude({
      name: 'base', mat: 'aluminum', axis: 'y', shape: shape(pts), depth: 0.024,
      bevel: [0, q(0.005, 0.004, 0)], bsegs: 1, density: { cap0: 0.3 },
      xf: xf({ pos: [0, 0.08, 0] }),
    });
    const droop = 0.022;
    star.deform((p) => [p[0], p[1] - droop * (Math.hypot(p[0], p[2]) / rTip) ** 2, p[2]]);

    // —— 脚轮：透镜形轮子 + 短立轴 ——
    const wheel = profile([
      [0, -0.012], [0.017, -0.012, { smooth: true }], [0.025, 0, { smooth: true }], [0.017, 0.012, { smooth: true }], [0, 0.012],
    ], { smooth: true });
    for (let i = 0; i < 5; i++) {
      const f = (i * 72 * Math.PI) / 180;
      const s = Math.sin(f), c = Math.cos(f);
      const r = rTip - 0.012;
      k.lathe({ name: `wheel${i}`, mat: 'plastic_black', profile: wheel, segs: q(8, 6, 4), xf: xf({ pos: [r * s, 0.025, r * c], rot: [Math.PI / 2, f + Math.PI / 2, 0] }) });
      if (k.lod < 2) rod(k, { name: `stem${i}`, mat: 'plastic_black', r: 0.0065, segs: q(5, 4), a: [r * s, 0.03, r * c], b: [r * s, 0.07, r * c] });
    }

    // —— 气压杆：底座杯 + 伸缩护套 ——
    k.lathe({
      name: 'column', mat: 'plastic_black', segs: q(10, 7, 6),
      profile: profile([
        [0.036, 0.09],
        [0.036, 0.125, { r: q(0.006, 0.005, 0), segs: 1 }],
        [0.026, 0.135, { r: q(0.004, 0, 0), segs: 1 }],
        [0.026, 0.3, { r: q(0.003, 0, 0), segs: 1 }],
        [0.02, 0.31],
        [0.02, 0.4],
      ]),
    });

    // —— 底盘机构 + 调节杆 ——
    k.box({ name: 'mech', mat: 'plastic_black', size: [0.19, 0.045, 0.23], r: q(0.006, 0.005, 0), segs: q(1, 1, 0), xf: xf({ pos: [0, 0.415, 0] }) });
    if (k.lod < 2) rod(k, { name: 'lever', mat: 'plastic_black', r: 0.005, segs: q(5, 4), caps: [false, true], a: [0.09, 0.412, 0.04], b: [0.21, 0.405, 0.075] });

    // —— 座面：外壳 + 坐垫（前沿瀑布式下弯）——
    const seatY = 0.4375, seatZ = 0.015;
    k.box({
      name: 'seatShell', mat: 'plastic_black', size: [0.465, 0.02, 0.455], r: q(0.008, 0.006, 0), segs: q(2, 1, 0), omit: ['py'],
      density: { ny: 0.3 }, xf: xf({ pos: [0, seatY + 0.01, seatZ] }),
    });
    const cs = [0.49, 0.07, 0.48];
    const ch = cs.map((v) => v / 2);
    const puff = puffDeform(ch, { top: 0.014, side: 0.004 });
    const waterfall = (p) => {
      const o = puff(p);
      o[1] -= 0.018 * smoothstep(0.06, ch[2], p[2]) * (0.5 + 0.5 * (p[1] / ch[1]));
      return o;
    };
    k.box({
      name: 'seat', mat: 'linen_charcoal', size: cs, r: q(0.03, 0.028, 0.02), segs: q(3, 2, 0),
      div: q([2, 1, [-1, -0.4, 0.3, 0.72, 1]], [1, 1, [-1, 0.5, 1]], 1), deform: k.lod < 2 ? waterfall : null, omit: ['ny'],
      xf: xf({ pos: [0, seatY + 0.02 + cs[1] / 2, seatZ] }),
    });

    // —— 靠背：两侧前包 + 腰托；外壳在后面 ——
    const bs = [0.46, 0.5, 0.06];
    const bh = bs.map((v) => v / 2);
    const wrap = (p, lumbar) => {
      const nx = p[0] / bh[0], ny = p[1] / bh[1];
      const z = p[2] + 0.034 * nx * nx + lumbar * 0.016 * Math.exp(-(((ny + 0.45) / 0.35) ** 2)) * Math.max(0, 1 - nx * nx);
      return [p[0] * (1 - 0.045 * (ny + 1)), p[1], z]; // 上窄下宽
    };
    const backPuff = puffDeform(bh, { sideZ: 0.008, top: 0.004 });
    const tilt = (-9 * Math.PI) / 180;
    const backPos = [0, 0.83, -0.228];
    const xs = q([-1, -0.5, 0, 0.5, 1], [-1, 0, 1], 1);
    k.box({
      name: 'back', mat: 'linen_charcoal', size: bs, r: q(0.025, 0.022, 0.018), segs: q(2, 2, 0),
      // 背面不省略：坐垫圆角和外壳边缘之间有一圈缝，省了背面会从缝里看穿
      div: [xs, q([-1, -0.62, -0.28, 0.2, 1], [-1, -0.4, 1], 1), 1],
      deform: k.lod < 2 ? (p) => wrap(backPuff(p), 1) : null,
      xf: xf({ pos: backPos, rot: [tilt, 0, 0] }),
    });
    k.box({
      name: 'backShell', mat: 'plastic_black', size: [0.47, 0.51, 0.016], r: q(0.008, 0.006, 0), segs: q(1, 1, 0),
      div: [xs, 1, 1], density: { nz: 0.6, pz: 0.3 },
      deform: k.lod < 2 ? (p) => wrap([p[0], p[1], p[2] - bh[2] - 0.008], 0) : null,
      xf: xf({ pos: backPos, rot: [tilt, 0, 0] }),
    });

    // —— 铝脊：从机构后部弯上来，托住靠背外壳 ——
    k.sweep({
      // 靠背外壳背面：y≈0.58 处 z≈-0.238，y≈0.8 处 z≈-0.272；铝脊中心线贴着它走
      name: 'spine', mat: 'aluminum', shape: rect(0.013, 0.052, { r: q(0.004, 0, 0), segs: 1 }), up: [1, 0, 0], caps: [true, true],
      path: roundedPath([[0, 0.41, -0.07], [0, 0.41, -0.236], [0, 0.56, -0.244], [0, 0.8, -0.279]], q(0.06, 0.05, 0), q(2, 1, 1)),
    });

    // —— 扶手：L 形支架 + 扶手垫 ——
    if (k.lod < 2) {
      for (const s of [1, -1]) {
        const side = s > 0 ? 'R' : 'L';
        k.sweep({
          name: `armPost${side}`, mat: 'plastic_black', shape: rect(0.018, 0.04, { r: q(0.004, 0), segs: 1 }), up: [0, 0, 1], caps: [false, false],
          path: roundedPath([[s * 0.08, 0.425, -0.03], [s * 0.255, 0.425, -0.03], [s * 0.255, 0.655, -0.03]], q(0.045, 0.04), q(3, 1)),
        });
        k.box({
          name: `armPad${side}`, mat: 'plastic_black', size: [0.075, 0.026, 0.26], r: q(0.011, 0.01), segs: q(2, 1),
          xf: xf({ pos: [s * 0.255, 0.668, -0.02] }),
        });
      }
    }
  },
};
