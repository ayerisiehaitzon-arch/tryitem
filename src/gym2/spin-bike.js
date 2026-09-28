import { shape, rect, circle, profile } from '../core/shape.js';
import { xf, smoothstep, norm, add, scale, sub, cross } from '../core/vec.js';
import { roundedPath, sampleCurve3, bezier3 } from '../core/path.js';
import { GYM2_ATLAS, gym2UV } from '../materials/atlas.js';
import { sw, mapUV, ccw, catmull, subPath, pathLength, hull2, tiltX } from './parts.js';

// 动感单车：一根弯成“λ”的扁钢车架，前面一只镀铬边的飞轮，把手上方一块 22 寸的骑行课程屏。
//   · 车架：后脚管上起一根扁管（圆角矩形截面），贴着地往前、过中轴后往上弯成立柱，一路扫掠下来没有接缝；
//     座管从后半段斜着伸出去。前后两根脚管，前脚管两头各一只搬运轮，四角四颗橡胶脚垫；
//   · 飞轮：车削的一整只，镀铬的轮缘、缎黑的辐板、铝轮毂，夹在一对前叉里，前叉从前脚管穿过轮轴一直伸到立柱两侧；
//     飞轮前上方一只红色的磁控刹车（两片磁铁夹着轮缘），吊在一对绕轮轴转的摆臂上，一根刹车线弯回立柱；
//   · 右边（+x）是皮带罩：中轴的大圆和飞轮轮毂的小圆连成一个整体轮廓，外面印着 MAGNETIC；
//   · 铝曲柄是“两头圆”的轮廓挤出，一前一后；脚踏带鞋头笼；
//   · 座管和立柱顶上各一个锁紧套（红色拔销），铝的座杆背面贴着高度刻度，座杆顶上一条前后调节的滑轨托着座垫；
//     座垫是一块按长度收窄、中间下凹、两侧下垂的形变盒子，黑色皮面；
//   · 多握位把手：中间一段横把，两边往前绕成“牛角”，横把两侧和牛角上套着泡棉握把；
//   · 把手中间立起一根鹅颈，托着向后仰 18° 的触摸屏：屏幕上是“爬坡课”（进度、爬坡剖面、踏频 / 功率 / 阻力 / 心率、功率区间），自发光；
//   · 立柱背面一只红色的阻力旋钮（45° 朝上朝后），立柱前面一个水壶架插着一只红色水壶；立柱两侧印着 TRYITEM。
// 原点在占地中心（地面上），骑车的人朝 -z，+x 是骑车人的右手边
const BB = { z: 0.02, y: 0.29 };
const FW = { z: -0.33, y: 0.34, r: 0.215 };
const FRAME = [[0.52, 0.098], [0.28, 0.14], [0.08, 0.25], [-0.03, 0.36], [-0.1, 0.52], [-0.14, 0.7], [-0.165, 0.86]];   // (z, y)
const CRANK = { len: 0.17, ang: 0.44 };   // 右曲柄朝前下 25°
const SEAT = { s0: [0, 0.16, 0.255], s1: [0, 0.64, 0.36], out: 0.215 };
const TILT = 0.314;   // 屏幕后仰

// 车架中心线（密采样，挂件按高度查位置和方向，和 LOD 无关）
const DENSE = catmull(FRAME.map(([z, y]) => [0, y, z]), 24);
function frameAt(y) {
  let i = 0;
  while (i < DENSE.length - 2 && DENSE[i + 1][1] < y) i++;
  const a = DENSE[i], b = DENSE[i + 1], t = (y - a[1]) / (b[1] - a[1]);
  const p = a.map((v, j) => v + (b[j] - v) * t), d = norm(sub(b, a));
  return { p, d, rear: [0, -d[2], d[1]], front: [0, d[2], -d[1]] };
}
const lin = (p, ...terms) => terms.reduce((acc, [v, s]) => add(acc, scale(v, s)), p);
const onX = (pos, s = 1) => xf({ pos, rot: [0, 0, -s * Math.PI / 2] });   // 车削轴 +y → ±x

export default {
  id: 'spin_bike',
  name: '动感单车',
  nameEn: 'Indoor Cycling Bike',
  category: 'gym2',
  aoDensity: 200,
  shadow: { margin: 0.2, maxDist: 0.5, density: 80 },
  view: { el: 14, az: 42 },
  build(k) {
    const q = (...v) => k.q(...v);
    const sm = { smooth: true };

    // —— 车架：一根扫掠的扁管（截面 x → 车架平面里的法向，y → 左右）——
    const path = catmull(FRAME.map(([z, y]) => [0, y, z]), q(4, 2, 1));
    sw(k.sweep({
      name: 'frame', mat: 'gym2', shape: rect(0.09, 0.06, { r: q(0.02, 0.015, 0.01), segs: q(2, 1, 1) }),
      path, up: [1, 0, 0], caps: [true, false],
    }), 'frame');
    // 前后脚管 + 脚垫；前脚管两头朝前各一只搬运轮
    for (const [n, z] of [['F', -0.56], ['B', 0.5]]) {
      sw(k.box({ name: `foot${n}`, mat: 'gym2', size: [0.56, 0.058, 0.08], r: q(0.022, 0.018, 0.01), segs: q(2, 1, 1), omit: ['ny'], xf: xf({ pos: [0, 0.044, z] }) }), 'frame');
      for (const s of [-1, 1]) {
        sw(k.lathe({ name: `pad${n}${s > 0 ? 'R' : 'L'}`, mat: 'gym2', segs: q(8, 6, 4), profile: profile([[0.026, 0], [0.026, 0.012, { r: 0.003, segs: 1 }], [0, 0.016]]), xf: xf({ pos: [s * 0.235, 0, z] }) }), 'rubber');
      }
    }
    for (const s of [-1, 1]) {
      const pos = [s * 0.2 - 0.011, 0.034, -0.632];
      sw(k.lathe({ name: `wheel${s > 0 ? 'R' : 'L'}`, mat: 'gym2', segs: q(10, 8, 5), profile: profile([[0.012, 0], [0.028, 0.001, sm], [0.031, 0.011, sm], [0.028, 0.021, sm], [0.012, 0.022]]), xf: onX(pos) }), 'nylon');
      sw(k.lathe({ name: `wheelHub${s > 0 ? 'R' : 'L'}`, mat: 'gym2', segs: q(8, 6, 4), profile: profile([[0.012, -0.001], [0.012, 0.023], [0, 0.023]]), xf: onX(pos) }), 'steel');
    }

    // —— 前叉：从前脚管穿过飞轮轴，一直伸到立柱两侧（上端往里收，贴住立柱）——
    {
      const d = [0, 0.8, 0.6], at = (t, x) => [x, FW.y + d[1] * t, FW.z + d[2] * t];
      for (const s of [-1, 1]) {
        sw(k.sweep({
          name: `fork${s > 0 ? 'R' : 'L'}`, mat: 'gym2', shape: rect(0.045, 0.018, { r: q(0.006, 0.004, 0), segs: 1 }), up: [1, 0, 0], caps: [false, false],
          path: roundedPath([at(-0.35, s * 0.045), at(0.24, s * 0.045), at(0.36, s * 0.021)], q(0.03, 0.03, 0), q(3, 2, 1)),
        }), 'frame');
      }
      // 轮轴和左边的六角螺母
      sw(k.lathe({ name: 'axle', mat: 'gym2', segs: q(8, 6, 4), profile: profile([[0.009, 0], [0.009, 0.12], [0, 0.12]]), xf: onX([-0.06, FW.y, FW.z]) }), 'steel');
      sw(k.lathe({ name: 'nut', mat: 'gym2', segs: 6, profile: profile([[0.0145, 0], [0.0145, 0.008, { r: 0.0015, segs: 1 }], [0, 0.008]]), xf: onX([-0.054, FW.y, FW.z], -1) }), 'steel');
    }

    // —— 飞轮：镀铬轮缘 + 缎黑辐板 + 铝轮毂（车削轴转到 x）——
    {
      const place = onX([0, FW.y, FW.z]), R = FW.r;
      sw(k.lathe({
        name: 'rim', mat: 'gym2', segs: q(36, 24, 16),
        profile: profile(k.lod < 2
          ? [[0.171, -0.008], [0.171, -0.022], [R - 0.004, -0.022, { r: q(0.003, 0), segs: 1 }], [R, -0.018, sm], [R, 0.018, { r: q(0.003, 0), segs: 1 }], [R - 0.004, 0.022], [0.171, 0.022], [0.171, 0.008]]
          : [[0.171, -0.022], [R, -0.022], [R, 0.022], [0.171, 0.022]]),
        xf: place,
      }), 'chrome');
      sw(k.lathe({ name: 'web', mat: 'gym2', segs: q(28, 18, 12), profile: profile([[0.036, -0.011], [0.172, -0.007], [0.172, 0.007], [0.036, 0.011]]), xf: place }), 'satin');
      sw(k.lathe({ name: 'hub', mat: 'gym2', segs: q(14, 10, 6), profile: profile([[0, -0.03], [0.03, -0.03, { r: 0.004, segs: 1 }], [0.036, -0.022], [0.036, 0.022], [0.03, 0.03, { r: 0.004, segs: 1 }], [0, 0.03]]), xf: place }), 'aluminum');
    }

    // —— 磁控刹车：飞轮前上方，两片磁铁夹住轮缘，吊在一对绕轮轴转的摆臂上 ——
    const brakeRot = tiltX(Math.cos(0.61), -Math.sin(0.61));   // 局部 y → 径向（从顶上往前转 35°），局部 z → 切向
    const BR = xf({ pos: [0, FW.y, FW.z], rot: [brakeRot, 0, 0] });
    {
      const r4 = { r: q(0.004, 0.003, 0), segs: q(1, 1, 0) };
      for (const s of [-1, 1]) {
        sw(k.box({ name: `magnet${s > 0 ? 'R' : 'L'}`, mat: 'gym2', size: [0.014, 0.072, 0.085], ...r4, xf: BR.mul(xf({ pos: [s * 0.034, 0.2, 0] })) }), 'red');
        sw(k.box({ name: `swing${s > 0 ? 'R' : 'L'}`, mat: 'gym2', size: [0.006, 0.13, 0.026], segs: 0, xf: BR.mul(xf({ pos: [s * 0.028, 0.105, 0] })) }), 'satin');
      }
      sw(k.box({ name: 'bridge', mat: 'gym2', size: [0.082, 0.014, 0.085], ...r4, xf: BR.mul(xf({ pos: [0, 0.229, 0] })) }), 'red');
      // 刹车线：从磁铁架顶上弯回立柱前面
      if (k.lod < 2) {
        const P0 = BR.apply([0, 0.236, 0.02]), P3 = add(frameAt(0.55).p, scale(frameAt(0.55).front, 0.04));
        const cable = sampleCurve3(bezier3(P0, [0, 0.6, -0.43], [0, 0.595, -0.27], P3), q(10, 6));
        sw(k.sweep({ name: 'brakeCable', mat: 'gym2', shape: circle(0.0035, 5), path: cable.map((p) => [-0.012, p[1], p[2]]), caps: [false, false] }), 'cable');
      }
    }

    // —— 皮带罩（+x）：中轴大圆和飞轮轮毂小圆连成一个轮廓，沿 x 挤出；外面印 MAGNETIC ——
    const GX = [0.07, 0.106];
    {
      const pts = hull2([[-BB.z, BB.y], 0.11, q(28, 18, 12)], [[-FW.z, FW.y], 0.07, q(18, 12, 8)]);
      sw(k.extrude({
        name: 'guard', mat: 'gym2', shape: shape(ccw(pts)), depth: GX[1] - GX[0], axis: 'x',
        bevel: [q(0.003, 0.002, 0), q(0.008, 0.006, 0.003)], bsegs: q(2, 1, 1), density: { cap0: 0.3 }, xf: xf({ pos: [GX[0], 0, 0] }),
      }), 'satin');
      const { w: DW, h: DH } = { w: 0.18, h: 0.045 };
      const a = Math.atan2(FW.y - BB.y, BB.z - FW.z);
      const decal = k.box({ name: 'guardDecal', mat: 'gym2', size: [0.0006, DH, DW], segs: 0, omit: ['nx', 'py', 'ny', 'pz', 'nz'] });
      mapUV(decal, (p) => gym2UV('decal2', (DW / 2 - p[2]) / DW, (DH / 2 - p[1]) / DH));
      decal.transform(xf({ pos: [GX[1] + 0.0003, (BB.y + FW.y) / 2, (BB.z + FW.z) / 2], rot: [a, 0, 0] }));
    }

    // —— 中轴、曲柄、脚踏：右曲柄朝前下，左曲柄朝后上 ——
    sw(k.lathe({ name: 'bbShell', mat: 'gym2', segs: q(14, 10, 6), profile: profile([[0, 0], [0.036, 0, { r: 0.003, segs: 1 }], [0.036, 0.12], [0, 0.12]]), xf: onX([-0.05, BB.y, BB.z]) }), 'frame');
    sw(k.lathe({ name: 'spindle', mat: 'gym2', segs: q(8, 6, 4), profile: profile([[0.011, 0], [0.011, 0.062]]), xf: onX([-0.05, BB.y, BB.z], -1) }), 'steel');
    for (const s of [1, -1]) {
      const a = s > 0 ? CRANK.ang : CRANK.ang + Math.PI;
      const pz = BB.z - CRANK.len * Math.cos(a), py = BB.y - CRANK.len * Math.sin(a);
      const n = s > 0 ? 'R' : 'L';
      const x0 = 0.109, x1 = 0.125;
      sw(k.extrude({
        name: `crank${n}`, mat: 'gym2', shape: shape(ccw(hull2([[-BB.z, BB.y], 0.024, q(16, 10, 8)], [[-pz, py], 0.017, q(12, 8, 6)]))), depth: x1 - x0, axis: 'x',
        bevel: q(0.004, 0.003, 0), bsegs: 1, xf: xf({ pos: [s > 0 ? x0 : -x1, 0, 0] }),
      }), 'aluminum');
      if (k.lod < 2) sw(k.lathe({ name: `crankCap${n}`, mat: 'gym2', segs: q(12, 8, 6), profile: profile([[0.018, 0], [0.018, 0.003, { r: 0.0015, segs: 1 }], [0, 0.0045]]), xf: onX([s * x1, BB.y, BB.z], s) }), 'satin');
      sw(k.lathe({ name: `pedalAxle${n}`, mat: 'gym2', segs: q(8, 6, 4), profile: profile([[0.0065, 0], [0.0065, 0.013]]), xf: onX([s * x1, py, pz], s) }), 'steel');
      // 脚踏：尼龙踏板 + 鞋头笼（一道往后仰的拱）
      const cx = s * 0.182;
      sw(k.box({ name: `pedal${n}`, mat: 'gym2', size: [0.09, 0.022, 0.078], r: q(0.006, 0.004, 0), segs: q(1, 1, 0), xf: xf({ pos: [cx, py, pz] }) }), 'nylon');
      if (k.lod < 2) {
        const arch = [];
        const na = q(8, 5);
        for (let i = 0; i <= na; i++) {
          const f = (Math.PI * i) / na;
          arch.push([cx - 0.043 * Math.cos(f), py + 0.008 + 0.052 * Math.sin(f), pz - 0.036 + 0.05 * Math.sin(f)]);
        }
        sw(k.sweep({ name: `cage${n}`, mat: 'gym2', shape: rect(0.012, 0.005), path: arch, up: [0, 0, 1], caps: [true, true] }), 'plastic');
      }
    }

    // —— 座管、锁紧套、座杆（背面贴刻度）、滑轨、座垫 ——
    const ds = norm(sub(SEAT.s1, SEAT.s0)), sRear = [0, -ds[2], ds[1]];
    const S2 = lin(SEAT.s1, [ds, SEAT.out]);
    sw(k.sweep({ name: 'seatTube', mat: 'gym2', shape: rect(0.062, 0.056, { r: q(0.012, 0.01, 0.006), segs: q(2, 1, 1) }), path: [SEAT.s0, SEAT.s1], up: [1, 0, 0], caps: [false, false] }), 'frame');
    const collar = (name, p, d, size) => sw(k.box({ name, mat: 'gym2', size, r: q(0.006, 0.004, 0), segs: q(1, 1, 0), xf: xf({ pos: p, rot: [tiltX(d[1], d[2]), 0, 0] }) }), 'frame');
    const popPin = (name, p, axis) => {
      const P = xf({ pos: p, rot: [tiltX(axis[1], axis[2]), 0, 0] });
      sw(k.lathe({ name: `${name}Stem`, mat: 'gym2', segs: q(8, 6, 4), profile: profile([[0.008, -0.004], [0.008, 0.016]]), xf: P }), 'satin');
      sw(k.lathe({ name: `${name}Knob`, mat: 'gym2', segs: q(12, 8, 6), profile: profile([[0.017, 0.016], [0.018, 0.03, { r: 0.004, segs: q(2, 1, 1) }], [0, 0.034]]), xf: P }), 'red');
    };
    collar('seatCollar', lin(SEAT.s1, [ds, -0.018]), ds, [0.07, 0.045, 0.074]);
    popPin('seatPin', lin(SEAT.s1, [ds, -0.02], [sRear, 0.035]), sRear);
    sw(k.sweep({ name: 'seatPost', mat: 'gym2', shape: rect(0.042, 0.042, { r: 0.004, segs: 1 }), path: [lin(SEAT.s1, [ds, -0.08]), S2], up: [1, 0, 0], caps: [false, true] }), 'aluminum');
    {
      // 刻度贴纸：图集里的刻度条取 3 ~ 7 档，缩小贴在座杆背面
      const SC = GYM2_ATLAS.scale, L = 0.17, W = 0.026, sb = SC.y0 + 2 * SC.pitch - 0.04, st = SC.y0 + 6 * SC.pitch + 0.04;
      const tape = k.box({ name: 'seatScale', mat: 'gym2', size: [W, L, 0.0006], segs: 0, omit: ['px', 'nx', 'py', 'ny', 'nz'] });
      mapUV(tape, (p) => gym2UV('scale', (p[0] + W / 2) / W, 1 - (sb + ((p[1] + L / 2) / L) * (st - sb)) / SC.h));
      tape.transform(xf({ pos: lin(SEAT.s1, [ds, 0.012 + L / 2], [sRear, 0.0213]), rot: [tiltX(ds[1], ds[2]), 0, 0] }));
    }
    sw(k.box({ name: 'seatClamp', mat: 'gym2', size: [0.052, 0.036, 0.056], r: q(0.005, 0.004, 0), segs: q(1, 1, 0), xf: xf({ pos: [0, S2[1] + 0.004, S2[2]] }) }), 'satin');
    sw(k.box({ name: 'seatRail', mat: 'gym2', size: [0.026, 0.02, 0.2], r: q(0.004, 0.003, 0), segs: q(1, 1, 0), xf: xf({ pos: [0, S2[1] + 0.02, S2[2] - 0.005] }) }), 'aluminum');
    {
      const L = 0.27, W = 0.165;
      k.box({
        name: 'saddle', mat: 'leather_black', size: [W, 0.05, L], r: q(0.018, 0.014, 0.008), segs: q(2, 1, 1), div: q([4, 1, 8], [2, 1, 4], [1, 1, 2]), grain: 'z',
        deform: (p) => {
          const t = Math.min(1, Math.max(0, (p[2] + L / 2) / L));   // 0 = 鼻尖（朝前）
          const wf = (0.3 + 0.7 * smoothstep(0.1, 0.72, t)) * (1 - 0.1 * smoothstep(0.86, 1, t));
          const xn = p[0] / (W / 2);
          const th = 0.72 + 0.28 * smoothstep(0.05, 0.5, t);
          const lift = 0.012 * smoothstep(0.6, 1, t) + 0.005 * (1 - smoothstep(0, 0.3, t)) - 0.004;
          return [p[0] * wf, p[1] * th + lift - 0.012 * xn * xn * (0.4 + 0.6 * t), p[2]];
        },
        xf: xf({ pos: [0, S2[1] + 0.059, S2[2] - 0.01] }),
      });
    }

    // —— 立柱顶：锁紧套、铝把立、把手夹、鹅颈、屏幕 ——
    const G = [0, FRAME[6][1], FRAME[6][0]];
    const dG = norm(sub(DENSE[DENSE.length - 1], DENSE[DENSE.length - 4]));
    const gRear = [0, -dG[2], dG[1]];
    collar('headCollar', lin(G, [dG, -0.02]), dG, [0.074, 0.045, 0.102]);
    popPin('headPin', lin(G, [dG, -0.022], [gRear, 0.049]), gRear);
    const H = lin(G, [dG, 0.13]);
    sw(k.sweep({ name: 'barPost', mat: 'gym2', shape: rect(0.046, 0.046, { r: 0.005, segs: 1 }), path: [lin(G, [dG, -0.08]), H], up: [1, 0, 0], caps: [false, false] }), 'aluminum');
    const Hc = [0, H[1] - 0.005, H[2]];
    sw(k.box({ name: 'barClamp', mat: 'gym2', size: [0.076, 0.05, 0.056], r: q(0.008, 0.006, 0), segs: q(2, 1, 0), xf: xf({ pos: Hc, rot: [tiltX(dG[1], dG[2]), 0, 0] }) }), 'satin');
    // 多握位把手：横把 → 两边往前绕 → 收成牛角，末端上翘
    {
      const [, hy, hz] = Hc;
      const half = [[0.235, hy, hz], [0.235, hy + 0.004, hz - 0.165], [0.115, hy + 0.02, hz - 0.245], [0.092, hy + 0.085, hz - 0.285]];
      const poly = [...[...half].reverse().map(([x, y, z]) => [-x, y, z]), ...half];
      const bar = roundedPath(poly, [0, 0.04, 0.07, 0.055, 0.055, 0.07, 0.04, 0], q(4, 2, 1));
      const rb = 0.0145, rg = 0.0185, nb = q(10, 7, 5);
      sw(k.sweep({ name: 'handlebar', mat: 'gym2', shape: circle(rb, nb), path: bar, caps: [true, true] }), 'satin');
      const Lb = pathLength(bar), mid = Lb / 2;
      const grips = [['L', 0, 0.2], ['R', Lb - 0.2, Lb], ['CL', mid - 0.17, mid - 0.05], ['CR', mid + 0.05, mid + 0.17]];
      for (const [n, s0, s1] of grips.slice(0, k.lod < 2 ? 4 : 2)) {
        sw(k.sweep({ name: `grip${n}`, mat: 'gym2', shape: circle(rg, nb), path: subPath(bar, s0, s1), caps: [true, true] }), 'foam');
      }
    }
    {
      const n = [0, Math.sin(TILT), Math.cos(TILT)];
      const C = [0, Hc[1] + 0.28, Hc[2] - 0.005];
      const SX = xf({ pos: C, rot: [-TILT, 0, 0] });
      sw(k.sweep({ name: 'stalk', mat: 'gym2', shape: circle(0.0145, q(10, 8, 6)), path: [add(Hc, [0, 0.015, 0]), lin(C, [n, -0.034])], caps: [false, true] }), 'satin');
      sw(k.box({ name: 'mount', mat: 'gym2', size: [0.1, 0.1, 0.014], r: q(0.004, 0), segs: q(1, 0), xf: SX.mul(xf({ pos: [0, 0, -0.031] })) }), 'satin');
      sw(k.box({ name: 'screenBody', mat: 'gym2', size: [0.45, 0.29, 0.024], r: q(0.01, 0.008, 0.005), segs: q(2, 1, 1), xf: SX.mul(xf({ pos: [0, 0, -0.012] })) }), 'satin');
      const { w: SW, h: SH } = { w: 0.43, h: 0.269 };
      const disp = k.box({ name: 'screen', mat: 'gym2', size: [SW, SH, 0.0008], segs: 0, omit: ['px', 'nx', 'py', 'ny', 'nz'] });
      mapUV(disp, (p) => gym2UV('bikeScreen', (p[0] + SW / 2) / SW, (SH / 2 - p[1]) / SH));
      disp.transform(SX.mul(xf({ pos: [0, 0, 0.0004] })));
    }

    // —— 立柱上的东西：两侧的 TRYITEM 贴标、背面的阻力旋钮、前面的水壶架和水壶 ——
    {
      const { p, d } = frameAt(0.755), L = 0.17, W = 0.042;
      for (const s of [1, -1]) {
        const decal = k.box({ name: `frameDecal${s > 0 ? 'R' : 'L'}`, mat: 'gym2', size: [0.0006, L, W], segs: 0, omit: [s > 0 ? 'nx' : 'px', 'py', 'ny', 'pz', 'nz'] });
        mapUV(decal, (v) => gym2UV('decal', (v[1] + L / 2) / L, s > 0 ? (W / 2 - v[2]) / W : (v[2] + W / 2) / W));
        decal.transform(xf({ pos: [s * 0.0303, p[1], p[2]], rot: [tiltX(d[1], d[2]), 0, 0] }));
      }
    }
    {
      const { p, d, rear } = frameAt(0.745);
      const ax = norm(add(rear, d));
      const P = xf({ pos: lin(p, [rear, 0.036]), rot: [tiltX(ax[1], ax[2]), 0, 0] });
      sw(k.lathe({ name: 'knobBoss', mat: 'gym2', segs: q(12, 8, 6), profile: profile([[0.021, -0.012], [0.021, 0.02, { r: 0.003, segs: 1 }], [0, 0.02]]), xf: P }), 'frame');
      sw(k.lathe({ name: 'knob', mat: 'gym2', segs: q(16, 10, 8), profile: profile([[0.03, 0.02], [0.033, 0.034, sm], [0.031, 0.047, { r: 0.006, segs: q(2, 1, 1) }], [0, 0.049]]), xf: P }), 'red');
      sw(k.lathe({ name: 'knobCap', mat: 'gym2', segs: q(12, 8, 6), profile: profile([[0.016, 0.0488], [0.016, 0.0515, { r: 0.0015, segs: 1 }], [0, 0.052]]), xf: P }), 'satin');
    }
    {
      const { p, front } = frameAt(0.64), { d } = frameAt(0.72);
      const base = lin(p, [front, 0.093]);
      const B = xf({ pos: base, rot: [tiltX(d[1], d[2]), 0, 0] });
      sw(k.lathe({
        name: 'bottle', mat: 'gym2', segs: q(14, 10, 6), xf: B,
        profile: profile(k.lod < 2
          ? [[0, 0], [0.031, 0, { r: 0.004, segs: 1 }], [0.034, 0.008, sm], [0.034, 0.06, sm], [0.031, 0.08, sm], [0.031, 0.1, sm], [0.034, 0.118, sm], [0.034, 0.162, sm], [0.027, 0.182, sm], [0.018, 0.187]]
          : [[0, 0], [0.033, 0], [0.034, 0.162, sm], [0.018, 0.187]]),
      }), 'bottle');
      sw(k.lathe({ name: 'bottleCap', mat: 'gym2', segs: q(12, 8, 5), xf: B, profile: profile([[0.0185, 0.184], [0.0185, 0.205, { r: q(0.002, 0.002, 0), segs: 1 }], [0.012, 0.21], [0.0065, 0.222, { r: q(0.002, 0), segs: 1 }], [0, 0.224]]) }), 'cap');
      // 水壶架：两道箍 + 贴着立柱的背板
      const ex = [1, 0, 0], ey = cross(d, ex);
      for (const [i, h] of (k.lod < 2 ? [0.045, 0.15] : []).entries()) {
        const ring = [];
        const nr = q(12, 8, 6);
        for (let j = 0; j < nr; j++) {
          const t = (2 * Math.PI * j) / nr;
          ring.push(lin(base, [d, h], [ex, 0.0365 * Math.cos(t)], [ey, 0.0365 * Math.sin(t)]));
        }
        sw(k.sweep({ name: `cageRing${i}`, mat: 'gym2', shape: rect(0.004, 0.012), path: ring, closed: true, up: d, caps: [false, false] }), 'satin');
      }
      sw(k.box({ name: 'cageBack', mat: 'gym2', size: [0.024, 0.14, 0.008], segs: 0, xf: xf({ pos: lin(base, [d, 0.1], [front, -0.04]), rot: [tiltX(d[1], d[2]), 0, 0] }) }), 'satin');
    }
  },
};
