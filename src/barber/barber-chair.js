import { shape, rect } from '../core/shape.js';
import { xf } from '../core/vec.js';
import { barberUV } from '../materials/atlas.js';
import { sw, put, rod, tube, turned, ballKnob, mapUV, aim, ccw, tuft, seamNodes } from './parts.js';

// 老式液压理发椅：
//   · 镀铬的圆顶底座（贴地一圈黑胶圈）、镀铬的液压立柱，右边一根脚踏泵杆（黑色橡胶踏面）；
//   · 白色搪瓷的座下壳（上沿一圈镀铬嵌条），两边搪瓷的扶手侧板，上面酒红皮面的扶手垫；
//   · 座垫和靠背是酒红色的皮，一道道车线把皮面分成几条鼓起来的（座垫前后走向、靠背上下走向）；
//   · 靠背往后仰 12°，后面一块搪瓷背壳，顶上两根镀铬杆撑着一个皮头枕；
//   · 前面两根镀铬吊杆挂着一块铸造的脚踏板（凸起的菱格、中间椭圆铭牌），前沿微微翘起；
//   · 左边一根调靠背角度的镀铬拉杆，黑色球头。
// 原点在底座正下方的地面，正面朝 +z。
const sm = { smooth: true };
const HOUSING = { w: 0.54, h: 0.13, d: 0.52, y0: 0.39 };
const SEAT = { w: 0.5, t: 0.1, d: 0.49, y0: HOUSING.y0 + HOUSING.h, z: 0.01 };
const BACK = { w: 0.48, h: 0.6, t: 0.1, tilt: (12 * Math.PI) / 180, pivot: [0, 0.6, -0.2] };
const ARM = { x0: 0.265, t: 0.05, top: 0.745 };
const SEAM = { seat: [-0.15, -0.05, 0.05, 0.15], back: [-0.144, -0.048, 0.048, 0.144] };   // 车线的位置（沿 x）

// 圆角矩形的一圈路径：在 (a, b) 两个轴张成的平面上（'xz' 水平、'xy' 竖直），半尺寸 ha × hb、圆角 r，每个角 n 段，另一轴的坐标是 c
function roundRectPath(ha, hb, r, n, c, plane = 'xz') {
  const pts = [];
  for (const [ca, cb, a0] of [[ha - r, hb - r, 0], [-(ha - r), hb - r, Math.PI / 2], [-(ha - r), -(hb - r), Math.PI], [ha - r, -(hb - r), 1.5 * Math.PI]]) {
    for (let i = 0; i <= n; i++) {
      const a = a0 + (Math.PI / 2) * (i / n), u = ca + r * Math.cos(a), v = cb + r * Math.sin(a);
      pts.push(plane === 'xz' ? [u, c, v] : [u, v, c]);
    }
  }
  return pts;
}

export default {
  id: 'barber_chair',
  name: '理发椅',
  nameEn: 'Hydraulic Barber Chair',
  category: 'barber',
  aoDensity: 220,
  shadow: { margin: 0.14, maxDist: 0.6, density: 110 },
  view: { el: 12, az: 28 },
  build(k) {
    const q = (...v) => k.q(...v);
    // —— 底座、立柱、脚踏泵 ——
    turned(k, 'footRing', [[0.272, 0], [0.297, 0], [0.3, 0.006, sm], [0.296, 0.013], [0.28, 0.014]], 'rubber', { segs: q(36, 24, 14) });
    turned(k, 'base', [[0.284, 0.012], [0.293, 0.019, sm], [0.287, 0.031, sm], [0.25, 0.053, sm], [0.16, 0.073, sm], [0.1, 0.083, sm], [0.076, 0.087], [0, 0.088]], 'chrome', { segs: q(36, 24, 14) });
    turned(k, 'column', [[0.075, 0.086], [0.075, 0.3], [0.079, 0.305]], 'chrome', { segs: q(24, 16, 10) });
    turned(k, 'columnHead', [[0.079, 0.305], [0.095, 0.315, sm], [0.102, 0.335, sm], [0.102, HOUSING.y0 + 0.004]], 'enamel', { segs: q(24, 16, 10) });
    const pedal = [[0.07, 0.14, 0.03], [0.285, 0.1, 0.125]];
    rod(k, 'pumpLever', pedal[0], pedal[1], 0.012, 'chrome', { segs: q(8, 6, 4) });
    const pa = -Math.atan2(pedal[1][2] - pedal[0][2], pedal[1][0] - pedal[0][0]);
    sw(k.box({ name: 'pumpPad', mat: 'barber', size: [0.1, 0.022, 0.064], r: 0.008, segs: q(2, 1, 1), xf: xf({ pos: [0.315, 0.1, 0.138], rot: [0, pa, 0] }) }), 'rubber');

    // —— 座下壳（搪瓷）和上沿的镀铬嵌条 ——
    sw(k.box({ name: 'housing', mat: 'barber', size: [HOUSING.w, HOUSING.h, HOUSING.d], r: 0.035, segs: q(2, 2, 1), xf: xf({ pos: [0, HOUSING.y0 + HOUSING.h / 2, 0] }) }), 'enamel');
    if (k.lod < 2) {
      sw(k.sweep({ name: 'housingTrim', mat: 'barber', shape: rect(0.012, 0.006, { r: 0.0025, segs: 1 }), path: roundRectPath(HOUSING.w / 2 + 0.002, HOUSING.d / 2 + 0.002, 0.037, q(4, 3), SEAT.y0 - 0.008), closed: true, caps: [false, false], up: [0, 1, 0] }), 'chrome');

    }

    // —— 座垫：五条前后走向的鼓包 ——
    {
      const h = [SEAT.w / 2, SEAT.t / 2, SEAT.d / 2];
      k.box({
        name: 'seat', mat: 'leather_oxblood', size: [SEAT.w, SEAT.t, SEAT.d], r: 0.04, segs: q(3, 2, 1), omit: ['ny'],
        div: [k.lod < 2 ? seamNodes(h[0] - 0.04, SEAM.seat, q(10, 6), 0.009, k.lod > 0) : 1, 1, q(6, 4, 1)],
        deform: tuft(h, { n: 1, across: 0, seams: SEAM.seat, depth: 0.011, w: 0.009, puff: 0.018 }),
        xf: xf({ pos: [0, SEAT.y0 + SEAT.t / 2, SEAT.z] }),
      });
    }

    // —— 扶手：搪瓷侧板（侧面轮廓沿 x 挤出）、皮面扶手垫 ——
    {
      const outline = [[-0.215, 0.4], [0.19, 0.4], [0.222, 0.52, { r: q(0.06, 0.04, 0), segs: q(3, 2, 1) }], [0.262, 0.66, { r: q(0.05, 0.03, 0), segs: q(3, 2, 1) }], [0.258, ARM.top, { r: q(0.03, 0.02, 0), segs: q(2, 1, 1) }], [-0.2, ARM.top, { r: q(0.02, 0.015, 0), segs: q(2, 1, 1) }], [-0.226, 0.6]];
      const sh = shape(ccw(outline.map(([z, y, o]) => (o ? [-z, y, o] : [-z, y]))));
      for (const s of [-1, 1]) {
        const tag = s > 0 ? 'R' : 'L';
        sw(k.extrude({ name: `armPanel${tag}`, mat: 'barber', shape: sh, depth: ARM.t, axis: 'x', bevel: { w: 0.008, h: 0.008 }, bsegs: q(2, 1, 1), xf: xf({ pos: [s > 0 ? ARM.x0 : -ARM.x0 - ARM.t, 0, 0] }) }), 'enamel');
        const hp = [0.0375, 0.0225, 0.25];
        k.box({
          name: `armPad${tag}`, mat: 'leather_oxblood', size: [0.075, 0.045, 0.5], r: 0.02, segs: q(3, 2, 1), div: [1, 1, q(6, 3, 1)], omit: ['ny'],
          deform: tuft(hp, { n: 1, across: 2, seams: [], depth: 0, w: 1, puff: 0.006 }),
          xf: xf({ pos: [s * (ARM.x0 + ARM.t / 2), ARM.top + 0.0225, 0.025] }),
        });
      }
    }

    // —— 靠背：皮靠背（五条上下走向的鼓包）、搪瓷背壳、两根镀铬杆撑着的皮头枕；整体往后仰 ——
    {
      const place = xf({ pos: BACK.pivot, rot: [-BACK.tilt, 0, 0] });
      const parts = [];
      const h = [BACK.w / 2, BACK.h / 2, BACK.t / 2];
      parts.push(k.box({
        name: 'back', mat: 'leather_oxblood', size: [BACK.w, BACK.h, BACK.t], r: 0.045, segs: q(3, 2, 1), omit: ['nz'],
        div: [k.lod < 2 ? seamNodes(h[0] - 0.045, SEAM.back, q(10, 6), 0.009, k.lod > 0) : 1, q(8, 5, 1), 1],
        deform: tuft(h, { n: 2, across: 0, seams: SEAM.back, depth: 0.011, w: 0.009, puff: 0.02 }),
        xf: xf({ pos: [0, BACK.h / 2, -BACK.t / 2] }),
      }));
      parts.push(sw(k.box({ name: 'backShell', mat: 'barber', size: [BACK.w + 0.04, BACK.h + 0.04, 0.05], r: 0.022, segs: q(2, 1, 1), xf: xf({ pos: [0, BACK.h / 2, -BACK.t - 0.022] }) }), 'enamel'));
      // 背壳四周一圈镀铬嵌条
      if (k.lod < 2) parts.push(sw(k.sweep({ name: 'backTrim', mat: 'barber', shape: rect(0.006, 0.03, { r: 0.0025, segs: 1 }), path: roundRectPath(BACK.w / 2 + 0.022, BACK.h / 2 + 0.022, 0.024, q(4, 3), -BACK.t - 0.022, 'xy').map(([x, y, z]) => [x, y + BACK.h / 2, z]), closed: true, caps: [false, false], up: [0, 0, 1] }), 'chrome'));
      if (k.lod < 2) for (const s of [-1, 1]) parts.push(rod(k, `headBar${s > 0 ? 'R' : 'L'}`, [s * 0.08, BACK.h + 0.015, -BACK.t - 0.02], [s * 0.08, BACK.h + 0.13, -0.085], 0.009, 'chrome', { segs: q(8, 6, 4) }));
      parts.push(k.box({
        name: 'headrest', mat: 'leather_oxblood', size: [0.3, 0.12, 0.085], r: 0.035, segs: q(3, 2, 1), div: [q(8, 4, 1), 1, 1],
        deform: tuft([0.15, 0.06, 0.0425], { n: 2, across: 0, seams: [], depth: 0, w: 1, puff: 0.012 }),
        xf: xf({ pos: [0, BACK.h + 0.165, -0.06], rot: [0.18, 0, 0] }),
      }));
      put(parts, place);
    }

    // —— 脚踏板：两根镀铬吊杆 + 铸造踏板（顶面贴图集里的菱格和铭牌）——
    {
      const P = { w: 0.42, t: 0.014, d: 0.2, pos: [0, 0.25, 0.37], tilt: -0.2 };
      const plate = k.box({ name: 'footPlate', mat: 'barber', size: [P.w, P.t, P.d], r: 0.006, segs: q(1, 1, 0) });
      mapUV(plate, (p, n) => (n[1] > 0.7 ? barberUV('footplate', (p[0] + P.w / 2) / P.w, (p[2] + P.d / 2) / P.d) : barberUV('footplate', 0.01, 0.5)));
      plate.transform(xf({ pos: P.pos, rot: [P.tilt, 0, 0] }));
      for (const s of [-1, 1]) {
        const a = [s * 0.19, HOUSING.y0 + 0.02, HOUSING.d / 2 - 0.03], b = [s * 0.195, P.pos[1] + 0.008, P.pos[2] - 0.075];
        sw(k.sweep({ name: `footHanger${s > 0 ? 'R' : 'L'}`, mat: 'barber', shape: rect(0.03, 0.009, { r: 0.003, segs: 1 }), path: [a, b], caps: [true, true], up: [1, 0, 0] }), 'chrome');
      }
    }

    // —— 靠背拉杆（左边）——
    if (k.lod < 2) {
      const pts = [[-HOUSING.w / 2 + 0.01, 0.47, -0.12], [-0.335, 0.49, -0.16], [-0.345, 0.6, -0.235]];
      tube(k, 'reclineLever', pts, 0.007, 'chrome', { bend: 0.04, segs: q(8, 6) });
      const d = [pts[2][0] - pts[1][0], pts[2][1] - pts[1][1], pts[2][2] - pts[1][2]];
      ballKnob(k, 'reclineKnob', { r: 0.016, stem: 0.012, place: aim(d, [1, 0, 0], pts[2]) });
    }
  },
};
