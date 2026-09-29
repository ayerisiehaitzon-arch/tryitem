import { shape, profile, rect, circle } from '../core/shape.js';
import { xf } from '../core/vec.js';
import { PLY_T } from '../materials/library.js';
import { petUV } from '../materials/atlas.js';
import { plyPanel, outline, insetLoop } from '../kids/ply.js';
import { sw, mapUV } from './parts.js';

// 宠物餐桌：桦木胶合板的高脚碗架，放在一张灰绿色的硅胶垫上；旁边立着一袋狗粮。
//   · 碗架：一块圆角的面板开两个圆孔，两头各一块拱门形的侧板当腿；板边露出一层层的单板；
//   · 两只不锈钢碗（宽宽的卷边搭在孔沿上）：左边一碗狗粮（堆得冒尖），右边一碗水；
//   · 硅胶垫四周一圈凸起的挡边，前沿一串爪印；垫子上、面板上掉了几粒狗粮；
//   · 狗粮袋：牛皮纸袋，正面白标签，袋口卷了两道、夹着一个红色的封口夹。
// 原点在垫子正中的地面上，正面朝 +z。
const MAT = { w: 0.6, d: 0.4, t: 0.005, r: 0.04 };
const T = PLY_T;
const TOP = { w: 0.52, d: 0.27, y: 0.165, r: 0.035, z: -0.035 };   // 面板：y 是上表面高度，z 是面板中心
const HOLE = { x: 0.125, r: 0.08 };
const LEG = { x: 0.225, z: 0.11 };                                  // 侧板：中心 x、半宽（沿 z）
const BAG = { w: 0.2, h: 0.26, d: 0.09 };
const clamp01 = (v) => Math.max(0, Math.min(1, v));

// 不锈钢碗（原点在孔沿，也就是面板上表面）：外壁从碗底往上张开、穿过圆孔，碗口一圈宽卷边搭在面板上，再沿内壁回到碗底
const BOWL = [[0, -0.066], [0.05, -0.066], [0.056, -0.0645], [0.06, -0.058], [0.077, -0.008], [0.079, -0.002], [0.086, 0.001],
  [0.094, 0.0015], [0.097, 0.004], [0.095, 0.0065], [0.091, 0.006], [0.085, 0.004], [0.078, 0.001], [0.059, -0.056],
  [0.055, -0.0625], [0.049, -0.064], [0, -0.064]];

// 半块面板上开一个圆孔：外框 poly（逆时针，从孔心看过去是星形的）。
// 角度表 = 孔上均匀的 n 个角 + 外框每个顶点的角度（外框的拐点正好落在采样上），每个角度从孔心打一条射线到外框
function holeAngles(poly, c, n) {
  const angs = Array.from({ length: n }, (_, i) => (2 * Math.PI * i) / n);
  for (const [x, y] of poly) angs.push((Math.atan2(y - c[1], x - c[0]) + 2 * Math.PI) % (2 * Math.PI));
  angs.sort((a, b) => a - b);
  return angs.filter((a, i) => i === 0 || a - angs[i - 1] > 1e-4);
}
function rayHit(poly, c, a) {
  const dx = Math.cos(a), dy = Math.sin(a);
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    const ex = q[0] - p[0], ey = q[1] - p[1], den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-12) continue;
    const wx = p[0] - c[0], wy = p[1] - c[1];
    const t = (wx * ey - wy * ex) / den, u = (wx * dy - wy * dx) / den;
    if (t > 1e-9 && u >= -1e-9 && u <= 1 + 1e-9) best = Math.min(best, t);
  }
  return [c[0] + dx * best, c[1] + dy * best];
}
// 多边形只留 s·x ≥ 0 的一半
function clipHalf(poly, s) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    const ip = s * p[0] >= 0, iq = s * q[0] >= 0;
    if (ip) out.push(p);
    if (ip !== iq) { const t = p[0] / (p[0] - q[0]); out.push([0, p[1] + (q[1] - p[1]) * t]); }
  }
  return out;
}

export default {
  id: 'pet_feeder',
  name: '宠物餐桌',
  nameEn: 'Raised Dog Feeder on Silicone Mat',
  category: 'pets',
  aoDensity: 320,
  shadow: { margin: 0.1, maxDist: 0.4, density: 130 },
  view: { el: 24, az: 22 },
  build(k) {
    const q = (...v) => k.q(...v);
    const sm = { smooth: true };

    // —— 硅胶垫：薄薄一片，上面按图集里的爪印垫子平面贴；四周一圈凸起的挡边 ——
    {
      const mat = k.extrude({ name: 'mat', mat: 'pet', shape: rect(MAT.w, MAT.d, { r: MAT.r, segs: q(4, 3, 2) }), depth: MAT.t, axis: 'y', bevel: { w: 0.002, h: 0.002 }, caps: [false, true] });
      mapUV(mat, (p) => petUV('mat', clamp01((p[0] + MAT.w / 2) / MAT.w), clamp01((p[2] + MAT.d / 2) / MAT.d)));
      const e = 0.008, rr = { r: MAT.r - e, segs: q(4, 3, 2) };
      const lip = outline([[-MAT.w / 2 + e, -MAT.d / 2 + e, rr], [MAT.w / 2 - e, -MAT.d / 2 + e, rr], [MAT.w / 2 - e, MAT.d / 2 - e, rr], [-MAT.w / 2 + e, MAT.d / 2 - e, rr]]);
      sw(k.sweep({ name: 'matLip', mat: 'pet', shape: circle(0.0035, q(6, 4, 3)), path: lip.map(([x, y]) => [x, MAT.t, -y]), closed: true, caps: [false, false], up: [0, 1, 0] }), 'matGreen');
    }

    // —— 面板：一圈胶合板的边带 + 左右两半开孔的板面（上下两面）+ 孔壁 ——
    const plate = xf({ pos: [0, TOP.y - T / 2, TOP.z], rot: [-Math.PI / 2, 0, 0] });   // 板的局部 z → 世界 y，局部 y → 世界 -z
    {
      const rr = { r: TOP.r, segs: q(6, 4, 2) };
      const ring = outline([[-TOP.w / 2, -TOP.d / 2, rr], [TOP.w / 2, -TOP.d / 2, rr], [TOP.w / 2, TOP.d / 2, rr], [-TOP.w / 2, TOP.d / 2, rr]]);
      const edgeR = 0.002;
      plyPanel(k, { name: 'top', outline: ring, faces: [false, false], r: edgeR, n: q(2, 1, 1), xf: plate });
      const inner = insetLoop(ring, edgeR);
      for (const s of [-1, 1]) {
        const tag = s > 0 ? 'R' : 'L', half = clipHalf(inner, s), c = [s * HOLE.x, 0];
        const angs = holeAngles(half, c, q(24, 18, 12));
        const hole = (z) => angs.map((a) => [c[0] + HOLE.r * Math.cos(a), c[1] + HOLE.r * Math.sin(a), z]);
        const parts = [];
        for (const [f, fz] of [['F', 1], ['B', -1]]) {
          const z = (fz * T) / 2;
          const face = k.loft({ name: `plate${f}${tag}`, mat: 'birch', rings: [hole(z), angs.map((a) => [...rayHit(half, c, a), z])], orient: () => [0, 0, fz], density: { side: fz > 0 ? 1 : 0.5 } });
          // 木纹沿板长（x）平铺；左右两半共用一个偏移，木纹在中缝接得上
          mapUV(face, (p) => [p[0], p[1]]).uvKey = 'plate';
          parts.push(face);
        }
        parts.push(k.loft({ name: `plateHole${tag}`, mat: 'ply', rings: [hole(T / 2), hole(-T / 2)], orient: (i, j) => [c[0] - hole(0)[j][0], c[1] - hole(0)[j][1], 0], density: { side: 0.5 } }));
        for (const p of parts) p.transform(plate);
      }
    }

    // —— 两块侧板：拱门形，腿立在垫子上，上沿插进面板 2mm（板面一直做到面板底下，不留缝；上沿不做边带）——
    // （局部 x = 世界 z，局部 y = 世界 y）
    {
      const YB = TOP.y - T, a = 0.062, b = 0.055, h0 = MAT.t + 0.012;
      const foot = { r: 0.004, segs: q(2, 1, 1) }, under = { r: 0.001, segs: 1 };
      const na = q(10, 6, 4), Z = LEG.z;
      const side = [[-Z, MAT.t, foot], [-a, MAT.t, foot], [-a, h0, sm]];
      for (let i = 1; i < na; i++) { const t = Math.PI - (Math.PI * i) / na; side.push([a * Math.cos(t), h0 + b * Math.sin(t), sm]); }
      side.push([a, h0, sm], [a, MAT.t, foot], [Z, MAT.t, foot], [Z, YB - 0.0005], [Z, YB + 0.002, under], [-Z, YB + 0.002, under], [-Z, YB - 0.0005]);
      const sideOutline = outline(side);
      for (const s of [-1, 1]) {
        plyPanel(k, {
          name: `leg${s > 0 ? 'R' : 'L'}`, outline: sideOutline, grain: Math.PI / 2, n: q(2, 1, 1),
          edge: (p) => p[1] < YB, xf: xf({ pos: [s * LEG.x, 0, TOP.z], rot: [0, -Math.PI / 2, 0] }),
        });
      }
    }

    // —— 不锈钢碗：左边一碗狗粮、右边一碗水 ——
    const bowlSegs = q(24, 18, 12);
    for (const s of [-1, 1]) {
      const at = xf({ pos: [s * HOLE.x, TOP.y, TOP.z] });
      sw(k.lathe({ name: `bowl${s > 0 ? 'R' : 'L'}`, mat: 'pet', segs: bowlSegs, profile: profile(BOWL.map(([r, y], i) => [r, y, i > 0 && i < BOWL.length - 1 ? sm : {}])), xf: at }), 'steel');
    }
    {
      // 狗粮堆：边缘埋进碗的内壁，中间冒尖；按 0.14m 见方平面贴一碗狗粮
      const pile = k.lathe({ name: 'kibble', mat: 'pet', segs: bowlSegs, profile: profile([[0.066, -0.03], [0.0722, -0.0175, sm], [0.055, -0.0125, sm], [0.03, -0.0072, sm], [0, -0.0052]]) });
      const P = 0.14;
      mapUV(pile, (p) => petUV('kibble', clamp01((p[0] + P / 2) / P), clamp01((p[2] + P / 2) / P))).transform(xf({ pos: [-HOLE.x, TOP.y, TOP.z] }));
      // 水面：比碗口低 2cm
      k.lathe({ name: 'water', mat: 'water', segs: bowlSegs, profile: profile([[0.0706, -0.022], [0, -0.022]]), xf: xf({ pos: [HOLE.x, TOP.y, TOP.z] }) });
    }
    // 掉出来的几粒狗粮
    if (k.lod < 2) {
      [[-0.09, MAT.t, 0.155, 0.3], [-0.062, MAT.t, 0.172, 1.2], [0.03, MAT.t, 0.162, 2.1], [-0.2, MAT.t, 0.13, 0.7], [-0.015, TOP.y, TOP.z + 0.1, 1.6]].forEach(([x, y, z, a], i) => {
        sw(k.lathe({ name: `crumb${i}`, mat: 'pet', segs: 6, profile: profile([[0, -0.0028], [0.0052, -0.0014, sm], [0.0052, 0.0014, sm], [0, 0.0028]]), xf: xf({ pos: [x, y + 0.0026, z], rot: [0.15 * Math.sin(3 * a), a, 0.12] }) }), 'kibbleBrown');
      });
    }

    // —— 狗粮袋：立在垫子右边，脸朝着碗架 ——
    {
      const place = xf({ pos: [0.44, BAG.h / 2, -0.05], rot: [0, -0.4, 0] });
      const hw = BAG.w / 2, hh = BAG.h / 2;
      const bag = k.box({ name: 'bag', mat: 'pet', size: [BAG.w, BAG.h, BAG.d], r: 0.012, segs: q(2, 1, 1), div: [2, q(6, 4, 2), 1], omit: ['ny'], grain: 'y' });
      // 正面（以及它拥有的圆角带）贴图集里的牛皮纸袋正面：袋口往下 4cm 卷在里面看不见；其余几面是纯色的牛皮纸
      const front = k.charts.findIndex((ch) => ch.id === 'bag:pz');
      bag.T = bag.T.map((t, i) => (bag.C[i] === front ? petUV('bag', clamp01((t[1] + hw) / BAG.w), clamp01((0.04 + hh - t[0]) / 0.3)) : petUV('bag', 0.02, 0.05)));
      // 装满了：前后鼓出来，越往上越扁（袋口压平了卷起来）
      const sst = (e0, e1, v) => { const u = clamp01((v - e0) / (e1 - e0)); return u * u * (3 - 2 * u); };
      bag.deform(([x, y, z]) => {
        const xn = x / hw, yn = y / hh;
        return [x * (1 + 0.04 * (1 - yn * yn)), y, z * (1 - 0.72 * sst(-0.1, 1, yn)) * (1 + 0.16 * (1 - xn * xn) * (1 - 0.6 * yn * yn))];
      });
      bag.transform(place);
      // 卷起来的袋口：一根压扁的圆筒，外面夹一个红色的封口夹
      const roll = k.sweep({ name: 'bagRoll', mat: 'pet', shape: circle(1, q(10, 8, 6), { rx: 0.013, ry: 0.016 }), path: [[-hw + 0.004, hh + 0.008, 0], [hw - 0.004, hh + 0.008, 0]], up: [0, 1, 0] });
      sw(roll, 'bagFold').transform(place);
      for (const [nm, z] of [['clipF', 0.017], ['clipB', -0.017]]) {
        sw(k.box({ name: nm, mat: 'pet', size: [0.14, 0.014, 0.006], r: 0.002, segs: q(1, 1, 0), xf: xf({ pos: [0.01, hh + 0.012, z] }) }), 'clip').transform(place);
      }
      sw(k.lathe({ name: 'clipHinge', mat: 'pet', segs: q(8, 6, 4), profile: profile([[0, -0.021], [0.009, -0.021, { r: 0.002 }], [0.009, 0.021, { r: 0.002 }], [0, 0.021]]), xf: xf({ pos: [0.083, hh + 0.012, 0], rot: [Math.PI / 2, 0, 0] }) }), 'clip').transform(place);
    }
  },
};
