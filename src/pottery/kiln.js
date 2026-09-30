import { shape, rect } from '../core/shape.js';
import { xf } from '../core/vec.js';
import { potteryUV, potterySwatch } from '../materials/atlas.js';
import { sw, put, rod, turned, pot, mapUV, aim, catmull } from './parts.js';
import { rotAbout } from '../machine/parts.js';

// 电窑（八角形，顶开盖）：不锈钢外壳和三道箍立在钢架上，盖子往后掀开、立在窑后面，露出盖子底下的耐火砖；
// 窑里是一圈轻质耐火砖（四道槽里盘着电热丝，贴图），窑底铺着一块圆硼板、三根支柱，板上摆着几件等着烧的素坯；
// 正面一个控制器（红色数码管）、下面一块铭牌，左前面一张高温警示贴，前面两个斜面上各两个看火孔的塞子；
// 控制器底下一根电源线拖到窑后面；右后方地上叠着三块备用的硼板和几根支柱。
// 原点在窑正下方的地面，正面朝 +z。
const N = 8, C8 = Math.cos(Math.PI / 8), S8 = Math.sin(Math.PI / 8);
const K = { Ro: 0.39, wall: 0.075, y0: 0.2, y1: 0.82, floor: 0.07, lid: 0.07, open: 1.4 };
K.Ri = K.Ro - K.wall / C8;                 // 内壁（角上）的半径
const ao = K.Ro * C8, ai = K.Ri * C8;      // 外 / 内壁的边心距
const FLOOR = K.y0 + K.floor;
// 正八边形（平面朝 ±x、±z），shape 坐标（axis 'y'：shape (x, y) → 世界 (x, -z)）
const oct = (R) => Array.from({ length: N }, (_, i) => { const a = Math.PI / 8 + (i * Math.PI) / 4; return [R * Math.cos(a), -R * Math.sin(a)]; }).reverse();
// 第 f 个面的法线方向（f = 0 朝 +x，逆时针转到 +z 是 f = 2）
const facetN = (f) => { const a = (f * Math.PI) / 4; return [Math.cos(a), 0, Math.sin(a)]; };

export default {
  id: 'electric_kiln',
  name: '电窑',
  nameEn: 'Electric Kiln (Lid Open)',
  category: 'pottery',
  aoDensity: 200,
  shadow: { margin: 0.18, maxDist: 0.7, density: 90 },
  view: { el: 30, az: 24 },
  build(k) {
    const q = (...v) => k.q(...v);
    // —— 外壳：八角的不锈钢筒、三道箍 ——
    k.extrude({ name: 'jacket', mat: 'stainless', shape: shape(oct(K.Ro)), depth: K.y1 - K.y0, axis: 'y', caps: [true, false], xf: xf({ pos: [0, K.y0, 0] }) });
    for (const [i, y] of [[0, 0.29], [1, 0.51], [2, 0.73]]) k.extrude({ name: `band${i}`, mat: 'stainless', shape: shape(oct(K.Ro + 0.005)), depth: 0.028, axis: 'y', caps: [false, false], xf: xf({ pos: [0, y, 0] }) });
    // —— 窑壁顶上一圈砖（外八角到内八角的平环）——
    {
      const ring = (R) => Array.from({ length: N }, (_, i) => { const a = Math.PI / 8 + (i * Math.PI) / 4; return [R * Math.cos(a), K.y1, R * Math.sin(a)]; });
      const top = k.loft({ name: 'wallTop', mat: 'pottery', rings: [ring(K.Ro), ring(K.Ri)], orient: () => [0, 1, 0] });
      mapUV(top, (p) => potteryUV('firebrick', 0.5 + p[0] / 2.0, 0.08 + (p[2] + 0.4) / 3.2));
    }
    // —— 内壁：八块平的砖墙（各自朝里），贴图集里的耐火砖一圈展开：u 沿周长、v 从顶往下 ——
    {
      const side = 2 * K.Ri * S8, H = K.y1 - FLOOR;
      for (let f = 0; f < N; f++) {
        const n = facetN(f), a = (f * Math.PI) / 4;
        const b = k.box({ name: `wall${f}`, mat: 'pottery', size: [side, H, 0.001], segs: 0, omit: ['px', 'nx', 'py', 'ny', 'nz'] });
        mapUV(b, (p) => potteryUV('firebrick', (f + p[0] / side + 0.5) / N, (H / 2 - p[1]) / 0.64));
        // 局部 +z（砖面）朝向窑心：绕 y 转到 -n 方向
        b.transform(xf({ pos: [n[0] * ai, FLOOR + H / 2, n[2] * ai], rot: [0, Math.atan2(-n[0], -n[2]), 0] }));
      }
      const fl = k.extrude({ name: 'kilnFloor', mat: 'pottery', shape: shape(oct(K.Ri + 0.002)), depth: 0.01, axis: 'y', caps: [false, true], xf: xf({ pos: [0, FLOOR - 0.01, 0] }) });
      mapUV(fl, (p) => potteryUV('firebrick', 0.3 + p[0] / 2.0, 0.55 + p[2] / 1.6));
    }
    // —— 窑里：三根支柱（两节摞起来）、一块圆硼板架在窑膛上半截，板上几件素坯（从窑口看得见）——
    {
      const y = FLOOR + 0.28;
      for (let i = 0; i < 3; i++) {
        const a = (2 * Math.PI * i) / 3 + 0.3;
        for (let j = 0; j < 2; j++) sw(k.box({ name: `post${i}${j}`, mat: 'pottery', size: [0.03, 0.14, 0.03], r: 0.003, segs: q(1, 1, 0), xf: xf({ pos: [0.2 * Math.cos(a), FLOOR + 0.07 + 0.14 * j, 0.2 * Math.sin(a)], rot: [0, a + j * 0.2, 0] }) }), 'post');
      }
      turned(k, 'shelf', [[0, y], [0.268, y], [0.272, y + 0.004], [0.272, y + 0.012], [0.268, y + 0.016], [0, y + 0.016]], 'kilnShelf', { segs: q(32, 22, 12) });
      const top = y + 0.016;
      pot(k, 'bisqueVase', { shape: 'vase', state: 'bisque' }, { place: xf({ pos: [-0.1, top, -0.1] }), s: 0.78 });
      pot(k, 'bisqueBowl0', { shape: 'bowl', state: 'bisque' }, { place: xf({ pos: [0.1, top, -0.1] }) });
      pot(k, 'bisqueBowl1', { shape: 'teaBowl', state: 'bisque' }, { place: xf({ pos: [0.14, top, 0.09] }) });
      pot(k, 'bisqueMug', { shape: 'yunomi', state: 'bisque' }, { place: xf({ pos: [-0.04, top, 0.14] }) });
      pot(k, 'bisqueJar', { shape: 'jar', state: 'bisque' }, { place: xf({ pos: [-0.17, top, 0.06] }), s: 0.7 });
    }
    // —— 盖子：不锈钢的边、盖面、底下一层耐火砖；前沿一个把手、后面两个铰链；往后掀开 80° ——
    {
      const place = rotAbout([1, 0, 0], -K.open, [0, K.y1 + K.lid / 2, -ao - 0.03]), parts = [];
      const slab = k.extrude({ name: 'lidSlab', mat: 'pottery', shape: shape(oct(K.Ro - 0.004)), depth: K.lid - 0.004, axis: 'y', caps: [true, true], xf: xf({ pos: [0, K.y1 + 0.002, 0] }) });
      const brick = potterySwatch('post');
      mapUV(slab, (p, n) => (n[1] < -0.5 ? potteryUV('firebrick', 0.6 + p[0] / 2.0, 0.3 + p[2] / 1.6) : brick));
      parts.push(slab);
      parts.push(k.extrude({ name: 'lidBand', mat: 'stainless', shape: shape(oct(K.Ro + 0.001)), depth: K.lid, axis: 'y', caps: [false, false], xf: xf({ pos: [0, K.y1, 0] }) }));
      const hy = K.y1 + K.lid + 0.035;
      parts.push(rod(k, 'lidHandle', [-0.1, hy, ao - 0.05], [0.1, hy, ao - 0.05], 0.011, 'steel', { segs: q(10, 8, 6) }));
      for (const s of [-1, 1]) parts.push(rod(k, `lidHandlePost${s > 0 ? 'R' : 'L'}`, [s * 0.09, K.y1 + K.lid, ao - 0.05], [s * 0.09, hy, ao - 0.05], 0.008, 'steel', { segs: q(8, 6, 4), caps: [false, false] }));
      put(parts, place);
      for (const s of [-1, 1]) {
        sw(k.box({ name: `hinge${s > 0 ? 'R' : 'L'}`, mat: 'pottery', size: [0.05, 0.1, 0.05], r: 0.006, segs: q(1, 1, 0), xf: xf({ pos: [s * 0.18, K.y1 - 0.02, -ao - 0.02] }) }), 'steel');
      }
      rod(k, 'hingePin', [-0.22, K.y1 + K.lid / 2, -ao - 0.03], [0.22, K.y1 + K.lid / 2, -ao - 0.03], 0.012, 'steel', { segs: q(10, 8, 6) });
    }
    // —— 钢架：四条方腿、一圈托着窑底的角钢 ——
    k.extrude({ name: 'standRing', mat: 'pottery', shape: shape(oct(K.Ro - 0.02)), depth: 0.03, axis: 'y', caps: [false, false], xf: xf({ pos: [0, K.y0 - 0.03, 0] }) });
    sw(k.parts.at(-1), 'steel');
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + (i * Math.PI) / 2, r = K.Ro * 0.84;
      sw(k.box({ name: `leg${i}`, mat: 'pottery', size: [0.035, K.y0 - 0.015, 0.035], r: 0.003, segs: q(1, 1, 0), xf: xf({ pos: [r * Math.cos(a), (K.y0 - 0.015) / 2, r * Math.sin(a)], rot: [0, a, 0] }) }), 'steel');
    }
    // —— 正面：控制器（面板贴图集）、两根支脚、铭牌；左前面的警示贴；前面两个斜面上的看火孔塞子 ——
    {
      const W = 0.22, H = 0.13, D = 0.09, z = ao + 0.035 + D / 2, y = 0.56;
      const box = k.box({ name: 'controlBox', mat: 'pottery', size: [W, H, D], r: 0.008, segs: q(2, 1, 1), xf: xf({ pos: [0, y, z] }) });
      const blk = potterySwatch('black');
      mapUV(box, (p, n) => (n[2] > 0.9 ? potteryUV('controller', 0.5 + (p[0] / W) * 1.02, 0.5 - ((p[1] - y) / H) * 1.02) : blk));
      for (const s of [-1, 1]) rod(k, `standoff${s > 0 ? 'R' : 'L'}`, [s * 0.07, y, ao - 0.005], [s * 0.07, y, ao + 0.036], 0.01, 'steel', { segs: q(8, 6, 4), caps: [false, false] });
      turned(k, 'switch', [[0, 0], [0.012, 0], [0.012, 0.012], [0.006, 0.02], [0, 0.021]], 'red', { segs: q(10, 8, 6), place: aim([0, -1, 0], [0, 0, 1], [0.08, y - H / 2, z]) });
      const plate = k.box({ name: 'kilnPlate', mat: 'pottery', size: [0.16, 0.04, 0.002], segs: 0, omit: ['nz', 'px', 'nx', 'py', 'ny'], xf: xf({ pos: [0, 0.37, ao + 0.001] }) });
      mapUV(plate, (p) => potteryUV('kilnPlate', 0.5 + p[0] / 0.16, 0.5 - (p[1] - 0.37) / 0.04));
      const fl = facetN(3), stk = k.box({ name: 'hotSticker', mat: 'pottery', size: [0.1, 0.025, 0.001], segs: 0, omit: ['nz', 'px', 'nx', 'py', 'ny'] });
      mapUV(stk, (p) => potteryUV('hotSticker', 0.5 + p[0] / 0.1, 0.5 - p[1] / 0.025));
      stk.transform(xf({ pos: [fl[0] * (ao + 0.001), 0.66, fl[2] * (ao + 0.001)], rot: [0, Math.atan2(fl[0], fl[2]), 0] }));
      for (const f of [1, 3]) for (const [j, yy] of [[0, 0.42], [1, 0.64]]) {
        if (f === 3 && j === 1) continue;
        const n = facetN(f);
        turned(k, `peep${f}${j}`, [[0, -0.01], [0.012, -0.01], [0.012, 0.004], [0.017, 0.006, { smooth: true }], [0.017, 0.016, { smooth: true }], [0.012, 0.022, { smooth: true }], [0, 0.023]], 'post', { segs: q(10, 8, 6), place: aim(n, [0, 1, 0], [n[0] * ao, yy, n[2] * ao]) });
      }
      // 电源线：控制器底下垂下来，沿地面拖到窑后面
      const cord = catmull([[-0.07, y - H / 2, z - 0.01], [-0.09, y - 0.25, z + 0.02], [-0.13, 0.02, z + 0.06], [-0.34, 0.008, z - 0.05], [-0.48, 0.008, -0.1], [-0.42, 0.008, -0.5], [-0.3, 0.02, -0.7]], q(4, 3, 2));
      sw(k.sweep({ name: 'powerCord', mat: 'pottery', shape: rect(0.013, 0.013, { r: 0.006, segs: 2 }), path: cord, caps: [false, true], up: [0, 1, 0] }), 'cord');
    }
    // —— 右后方地上：三块备用的硼板、上面几根支柱 ——
    {
      const c = [0.46, 0, -0.42];
      for (let i = 0; i < 3; i++) turned(k, `spareShelf${i}`, [[0, 0], [0.196, 0], [0.2, 0.004], [0.2, 0.012], [0.196, 0.016], [0, 0.016]], 'kilnShelf', { segs: q(28, 18, 10), place: xf({ pos: [c[0] + 0.006 * (i % 2), 0.016 * i, c[2] - 0.004 * i], rot: [0, i * 0.4, 0] }) });
      [[0.09, 0.04, 0.3], [0.12, -0.06, 1.1], [0.02, 0.1, 2.2], [-0.1, 0.08, 0.7]].forEach(([dx, dz, a], i) => {
        sw(k.box({ name: `sparePost${i}`, mat: 'pottery', size: [0.03, 0.1, 0.03], r: 0.003, segs: q(1, 1, 0), xf: xf({ pos: [c[0] + dx, 0.048 + 0.05, c[2] + dz], rot: [0, a, 0] }) }), 'post');
      });
    }
  },
};
