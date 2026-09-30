import { profile, circle } from '../core/shape.js';
import { xf } from '../core/vec.js';
import { sw, put, rod, bottle, rocksGlass, iceCube, decanter, iceBucket, BUCKET } from './parts.js';

// 黄铜酒水推车：两头各一个倒 U 形的黄铜管架（推手那头高一截，顶上那根横管就是推手），两层镜面托盘，
// 每层托盘四周一圈黄铜围栏；另一头两只大轮子（黑色胶圈、黄铜轮毂，中间一根钢轴），推手那头两只黑色胶脚。
//   · 上层：一只不锈钢冰桶（冰里斜插着一瓶香槟）、一只圆肚子的醒酒瓶（半瓶威士忌、玻璃球塞子）、
//     两杯加冰的威士忌；
//   · 下层：后面立着四瓶酒，前面横躺着一红一白两瓶葡萄酒。
// 原点在车子正下方的地面，长边沿 x（推手在 +x 那头），正面朝 +z。
const X = 0.38, Z = 0.2;                                  // 管架中心线
const S = [0.28, 0.78];                                   // 两层托盘的上表面
const WHEEL = { r: 0.09, z: 0.235 };
const sm = { smooth: true };

// 一个倒 U 形的管架：从 y0 往上到 y1，拐一个圆角，横着过去，再拐下来
function uFrame(k, x, y0, y1) {
  const rc = 0.05, n = k.q(5, 3, 2), pts = [[x, y0, -Z]];
  for (let i = 0; i <= n; i++) { const t = (Math.PI / 2) * (i / n); pts.push([x, y1 - rc + rc * Math.sin(t), -Z + rc - rc * Math.cos(t)]); }
  for (let i = 0; i <= n; i++) { const t = (Math.PI / 2) * (i / n); pts.push([x, y1 - rc + rc * Math.cos(t), Z - rc + rc * Math.sin(t)]); }
  pts.push([x, y0, Z]);
  return pts;
}
// 托盘一圈围栏：圆角矩形的闭合路径
function rimPath(k, y) {
  const rc = 0.03, n = k.q(4, 2, 1), pts = [];
  for (const [cx, cz, a0] of [[X - rc, Z - rc, 0], [-X + rc, Z - rc, Math.PI / 2], [-X + rc, -Z + rc, Math.PI], [X - rc, -Z + rc, 1.5 * Math.PI]]) {
    for (let i = 0; i <= n; i++) { const t = a0 + (Math.PI / 2) * (i / n); pts.push([cx + rc * Math.cos(t), y, cz + rc * Math.sin(t)]); }
  }
  return pts;
}

export default {
  id: 'bar_cart',
  name: '酒水推车',
  nameEn: 'Brass Bar Cart with Ice Bucket and Decanter',
  category: 'bar',
  aoDensity: 260,
  shadow: { margin: 0.14, maxDist: 0.7, density: 110 },
  view: { el: 18, az: 28 },
  build(k) {
    const q = (...v) => k.q(...v);
    const tube = circle(0.011, q(10, 8, 6));

    // —— 黄铜管架、托盘、围栏 ——
    sw(k.sweep({ name: 'frameR', mat: 'bar', shape: tube, path: uFrame(k, X, 0.05, 0.93), caps: [false, false], up: [1, 0, 0] }), 'brass');
    sw(k.sweep({ name: 'frameL', mat: 'bar', shape: tube, path: uFrame(k, -X, WHEEL.r, 0.83), caps: [false, false], up: [1, 0, 0] }), 'brass');
    S.forEach((y, i) => {
      k.box({ name: `mirror${i}`, mat: 'mirror', size: [2 * X - 0.02, 0.004, 2 * Z - 0.02], segs: 0, omit: ['ny'], xf: xf({ pos: [0, y - 0.002, 0] }) });
      sw(k.box({ name: `tray${i}`, mat: 'bar', size: [2 * X - 0.01, 0.014, 2 * Z - 0.01], r: 0.003, segs: q(1, 1, 0), xf: xf({ pos: [0, y - 0.011, 0] }) }), 'brass');
      sw(k.sweep({ name: `rim${i}`, mat: 'bar', shape: circle(0.006, q(8, 6, 4)), path: rimPath(k, y + 0.02), closed: true, caps: [false, false], up: [0, 1, 0] }), 'brass');
    });
    // 大轮子：胶圈 + 黄铜轮毂（外侧鼓一点），中间一根钢轴
    for (const [j, sz] of [[0, -1], [1, 1]]) {
      const place = xf({ pos: [-X, WHEEL.r, sz * WHEEL.z], rot: [sz * Math.PI / 2, 0, 0] });
      sw(k.lathe({ name: `tire${j}`, mat: 'bar', segs: q(24, 16, 10), profile: profile([[0.062, -0.011], [0.078, -0.013, sm], [0.087, -0.008, sm], [0.09, 0, sm], [0.087, 0.008, sm], [0.078, 0.013, sm], [0.062, 0.011]]), xf: place }), 'black');
      sw(k.lathe({ name: `hub${j}`, mat: 'bar', segs: q(20, 14, 8), profile: profile([[0, -0.009], [0.063, -0.009], [0.063, 0.009], [0.03, 0.011, sm], [0.012, 0.016, sm], [0, 0.017]]), xf: place }), 'brass');
    }
    rod(k, 'axle', [-X, WHEEL.r, -WHEEL.z], [-X, WHEEL.r, WHEEL.z], 0.006, 'steel', { segs: q(8, 6, 4), caps: [false, false] });
    // 推手那头的两只胶脚
    for (const [j, sz] of [[0, -1], [1, 1]]) {
      sw(k.lathe({ name: `foot${j}`, mat: 'bar', segs: q(10, 8, 6), profile: profile([[0, 0], [0.015, 0], [0.017, 0.004, sm], [0.0135, 0.05]]), xf: xf({ pos: [X, 0, sz * Z] }) }), 'black');
    }

    // —— 上层：冰桶里一瓶香槟，醒酒瓶，两杯加冰威士忌 ——
    const top = S[1];
    {
      const b = xf({ pos: [-0.19, top, 0.0], rot: [0, 0.4, 0] });
      iceBucket(k, 'bucket', { place: b });
      bottle(k, 'champagne', 'brut', { place: b.mul(xf({ pos: [0.03, 0.012, 0.005], rot: [0, 0.3, 0.33] })) });
      // 露头的冰块只摆在瓶子没占的那半圈
      const rnd = k.rand('ice');
      if (k.lod < 2) [-1.1, -0.35, 0.4, 1.15].forEach((a, i) => {
        iceCube(k, `bucketIce${i}`, { s: 0.03, place: b.mul(xf({ pos: [0.062 * Math.cos(a), BUCKET.ice + 0.004, 0.062 * Math.sin(a)], rot: [0.3 * rnd(), 2 * rnd(), 0.3 * rnd()] })) });
      });
    }
    decanter(k, 'decanter', { fill: 0.075, place: xf({ pos: [0.1, top, -0.08] }) });
    [[0.24, 0.09, 0.4], [0.07, 0.11, 1.3]].forEach(([x, z, r], i) => {
      const g = xf({ pos: [x, top, z], rot: [0, r, 0] });
      rocksGlass(k, `glass${i}`, { segs: q(16, 12, 8), fill: 0.04, liquid: 'whisky', place: g });
      iceCube(k, `glassIce${i}`, { s: 0.036, place: g.mul(xf({ pos: [0, 0.036, 0], rot: [0.08, 0.4 + i, 0.05] })) });
    });

    // —— 下层：四瓶酒立在后面，两瓶葡萄酒横躺在前面 ——
    const low = S[0];
    [['bourbon', -0.27, -0.08, 0.2], ['malt', -0.15, -0.11, -0.3], ['rum', -0.03, -0.08, 0.1], ['vermouth', 0.1, -0.1, -0.2]].forEach(([id, x, z, r]) => {
      bottle(k, `low${id}`, id, { lite: true, place: xf({ pos: [x, low, z], rot: [0, r, 0] }) });
    });
    // 横躺：先绕瓶身转一点（酒标朝前、略朝上），再放倒（红的瓶口朝 +x，白的朝 -x）
    bottle(k, 'lyingRed', 'wineRed', { lite: true, place: xf({ pos: [-0.12, low + 0.037, 0.06], rot: [0, -0.35, -Math.PI / 2] }) });
    bottle(k, 'lyingWhite', 'wineWhite', { lite: true, place: xf({ pos: [0.16, low + 0.04, 0.145], rot: [0, 0.35, Math.PI / 2] }) });
  },
};
