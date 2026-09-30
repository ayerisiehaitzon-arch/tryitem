import { shape, profile, rect } from '../core/shape.js';
import { xf } from '../core/vec.js';
import { potteryUV } from '../materials/atlas.js';
import { sw, put, rod, tube, turned, pot, mapUV, aim, ccw, catmull } from './parts.js';

// 拉坯机：钢灰蓝的机身立在四条短腿上，上面一只灰色的泥浆盆（盆底积着一层湿泥浆），铝转盘上扣着一块石膏托板，
// 托板上一只正在拉的湿泥坯（筒形、微微鼓肚，底下一圈挤出来的泥）；盆沿上搭着一块木刮板和一块黄海绵；
// 右边一个小托盘放着两团揉好的泥；地上一个脚踏（电线接到机身），拉坯的人坐的木凳在后面，
// 旁边地上一只水桶（半桶泥水，漂着一块海绵）。原点在转盘正下方的地面，拉坯的人坐在 -z 那边、面朝 +z。
const sm = { smooth: true };
const BODY = { w: 0.5, d: 0.56, y0: 0.12, y1: 0.38 };
const HEAD = { r: 0.17, y: 0.462 };
const BAT = { r: 0.15, t: 0.014 };

export default {
  id: 'pottery_wheel',
  name: '拉坯机',
  nameEn: 'Pottery Wheel with Stool',
  category: 'pottery',
  aoDensity: 230,
  shadow: { margin: 0.16, maxDist: 0.55, density: 100 },
  view: { el: 22, az: 30 },
  build(k) {
    const q = (...v) => k.q(...v);
    // —— 机身和四条腿 ——
    sw(k.box({ name: 'body', mat: 'pottery', size: [BODY.w, BODY.y1 - BODY.y0, BODY.d], r: 0.03, segs: q(2, 2, 1), xf: xf({ pos: [0, (BODY.y0 + BODY.y1) / 2, 0] }) }), 'wheelBody');
    for (const [i, [sx, sz]] of [[0, [-1, -1]], [1, [1, -1]], [2, [-1, 1]], [3, [1, 1]]]) {
      const x = sx * (BODY.w / 2 - 0.05), z = sz * (BODY.d / 2 - 0.05);
      rod(k, `leg${i}`, [x, 0.012, z], [x, BODY.y0 + 0.01, z], 0.018, 'steel', { segs: q(10, 8, 6), caps: [false, false] });
      turned(k, `foot${i}`, [[0, 0], [0.026, 0], [0.026, 0.008, sm], [0.019, 0.014], [0, 0.015]], 'rubber', { segs: q(10, 8, 6), place: xf({ pos: [x, 0, z] }) });
    }
    // —— 泥浆盆（外壁往上、翻过盆沿、内壁往下到盆底）、盆底的一层泥浆 ——
    turned(k, 'splashPan', [[0.1, BODY.y1 + 0.004], [0.2, BODY.y1 + 0.004, sm], [0.29, BODY.y1 + 0.012, sm], [0.302, BODY.y1 + 0.1, sm], [0.306, BODY.y1 + 0.114], [0.298, BODY.y1 + 0.117],
      [0.292, BODY.y1 + 0.108, sm], [0.282, BODY.y1 + 0.03, sm], [0.265, BODY.y1 + 0.016, sm], [0.06, BODY.y1 + 0.015]], 'panGrey', { segs: q(36, 24, 14) });
    // 泥浆面朝上（轮廓从外往里走，法线朝上）
    k.lathe({ name: 'slipPuddle', mat: 'clay_wet', segs: q(36, 24, 14), profile: profile([[0.275, BODY.y1 + 0.03], [0.262, BODY.y1 + 0.021, sm], [0.2, BODY.y1 + 0.019, sm], [0.06, BODY.y1 + 0.017]]) });
    // —— 转盘（铝面贴图集里的同心刻线）、转轴、石膏托板 ——
    {
      const head = k.lathe({ name: 'wheelHead', mat: 'pottery', segs: q(32, 22, 12), profile: profile([[0.03, BODY.y1 + 0.016], [0.03, HEAD.y - 0.02], [HEAD.r - 0.006, HEAD.y - 0.02], [HEAD.r, HEAD.y - 0.014, sm], [HEAD.r, HEAD.y - 0.004, sm], [HEAD.r - 0.005, HEAD.y], [0, HEAD.y]]) });
      mapUV(head, (p, n) => (n[1] > 0.95 && p[1] > HEAD.y - 0.001 ? potteryUV('turntable', 0.5 + p[0] / 0.36, 0.5 + p[2] / 0.36) : potteryUV('turntable', 0.5 + (p[0] / 0.36) * 0.9, 0.5 + (p[2] / 0.36) * 0.9)));
    }
    turned(k, 'bat', [[0, HEAD.y], [BAT.r - 0.004, HEAD.y], [BAT.r, HEAD.y + 0.004, sm], [BAT.r, HEAD.y + BAT.t - 0.003, sm], [BAT.r - 0.003, HEAD.y + BAT.t], [0, HEAD.y + BAT.t]], 'plaster', { segs: q(28, 20, 12) });
    // —— 湿泥坯：筒形、微微鼓肚，底下一圈挤出来的泥，口沿收一道（湿泥材质，旋纹顺着轮廓）——
    {
      const y = HEAD.y + BAT.t;
      k.lathe({ name: 'wetPot', mat: 'clay_wet', grain: 'around', segs: q(28, 20, 12), profile: profile([
        [0, y], [0.088, y, sm], [0.084, y + 0.006, sm], [0.07, y + 0.018, sm], [0.066, y + 0.05, sm], [0.07, y + 0.1, sm], [0.068, y + 0.15, sm], [0.063, y + 0.186, sm], [0.0645, y + 0.196],
        [0.061, y + 0.1985], [0.058, y + 0.194, sm], [0.059, y + 0.15, sm], [0.0615, y + 0.1, sm], [0.0575, y + 0.05, sm], [0.048, y + 0.024, sm], [0.02, y + 0.018, sm], [0, y + 0.018],
      ]) });
    }
    // —— 盆沿上的木刮板和黄海绵、右边的小托盘和两团泥 ——
    {
      const rim = BODY.y1 + 0.117;
      // 木刮板：腰子形，一边外凸、一边内凹
      const rib = [[-0.046, 0, sm], [-0.036, 0.022, sm], [0, 0.03, sm], [0.036, 0.022, sm], [0.046, 0, sm], [0.032, -0.013, sm], [0, -0.006, sm], [-0.032, -0.013, sm]];
      sw(k.extrude({ name: 'rib', mat: 'pottery', shape: shape(ccw(rib.map(([x, yy, o]) => (o ? [x, -yy, o] : [x, -yy])))), depth: 0.004, axis: 'y', bevel: { w: 0.0012, h: 0.0012 }, xf: xf({ pos: [-0.2, rim + 0.001, 0.22], rot: [0, 0.8, 0] }) }), 'toolWood');
      sw(k.box({ name: 'sponge', mat: 'pottery', size: [0.07, 0.03, 0.05], r: 0.012, segs: q(2, 1, 1), puff: { top: 0.004, side: 0.003 }, xf: xf({ pos: [0.23, rim + 0.012, -0.18], rot: [0.05, 0.6, 0] }) }), 'sponge');
      const tx = BODY.w / 2 + 0.14, ty = BODY.y1 + 0.06;
      sw(k.box({ name: 'tray', mat: 'pottery', size: [0.16, 0.012, 0.3], r: 0.004, segs: q(1, 1, 0), xf: xf({ pos: [tx, ty, 0.02] }) }), 'panGrey');
      for (const s of [-1, 1]) sw(k.box({ name: `trayLip${s > 0 ? 'F' : 'B'}`, mat: 'pottery', size: [0.16, 0.02, 0.008], r: 0.003, segs: q(1, 1, 0), xf: xf({ pos: [tx, ty + 0.012, 0.02 + s * 0.146] }) }), 'panGrey');
      sw(k.box({ name: 'trayLipR', mat: 'pottery', size: [0.008, 0.02, 0.3], r: 0.003, segs: q(1, 1, 0), xf: xf({ pos: [tx + 0.076, ty + 0.012, 0.02] }) }), 'panGrey');
      for (const s of [-1, 1]) rod(k, `trayArm${s > 0 ? 'F' : 'B'}`, [BODY.w / 2 - 0.01, BODY.y1 - 0.08, 0.02 + s * 0.09], [tx - 0.04, ty - 0.008, 0.02 + s * 0.09], 0.008, 'steel', { segs: q(8, 6, 4) });
      // 两团揉好的泥：压扁一点的圆球（车削的半球 + 底面）
      for (const [i, z, r] of [[0, -0.05, 0.048], [1, 0.08, 0.042]]) {
        const n = q(8, 6, 4), pts = [[0, 0], [r * 0.96, 0.002]];
        for (let j = 1; j <= n; j++) { const a = (Math.PI / 2) * (j / n); pts.push([r * Math.cos(a), 0.004 + r * 0.82 * Math.sin(a), sm]); }
        pts[pts.length - 1] = [0, 0.004 + r * 0.82];
        k.lathe({ name: `clayBall${i}`, mat: 'clay_wet', grain: 'around', segs: q(14, 10, 6), profile: profile(pts), xf: xf({ pos: [tx - 0.01, ty + 0.006, z], rot: [0, i * 1.3, 0] }) });
      }
    }
    // —— 脚踏：楔形的踏板（侧面轮廓挤出），黑色；电线弯到机身 ——
    {
      const px = -0.26, pz = -0.36, ped = [[0, 0], [0.24, 0], [0.24, 0.035, { r: 0.008, segs: q(2, 1, 1) }], [0.02, 0.09, { r: 0.012, segs: q(2, 1, 1) }], [0, 0.07]];
      sw(k.extrude({ name: 'pedal', mat: 'pottery', shape: shape(ccw(ped.map(([z, y, o]) => (o ? [z, y, o] : [z, y])))), depth: 0.12, axis: 'x', bevel: { w: 0.006, h: 0.006 }, bsegs: q(2, 1, 1), xf: xf({ pos: [px - 0.06, 0, pz + 0.12] }) }), 'black');
      const cord = catmull([[px, 0.02, pz + 0.12], [px + 0.02, 0.008, pz + 0.2], [px + 0.1, 0.008, pz + 0.26], [-0.2, 0.05, -0.22], [-BODY.w / 2 + 0.02, 0.18, -0.2]], q(4, 3, 2));
      sw(k.sweep({ name: 'pedalCord', mat: 'pottery', shape: rect(0.007, 0.007, { r: 0.0035, segs: 2 }), path: cord, caps: [false, false], up: [0, 1, 0] }), 'cord');
    }
    // —— 木凳：圆凳面、三条外撇的腿、一圈横撑（橡木）——
    {
      const c = [0, 0, -0.55], y = 0.46;
      k.lathe({ name: 'stoolSeat', mat: 'oak', segs: q(24, 16, 10), profile: profile([[0, y - 0.035], [0.165, y - 0.035], [0.17, y - 0.03, sm], [0.172, y - 0.008, sm], [0.165, y], [0, y]]), xf: xf({ pos: c }) });
      for (let i = 0; i < 3; i++) {
        const a = (2 * Math.PI * i) / 3 + Math.PI / 6, dx = Math.cos(a), dz = Math.sin(a);
        rod(k, `stoolLeg${i}`, [c[0] + dx * 0.19, 0, c[2] + dz * 0.19], [c[0] + dx * 0.11, y - 0.035, c[2] + dz * 0.11], 0.017, null, { segs: q(8, 6, 5), caps: [true, false], mat: 'oak' });
        if (k.lod < 2) {
          const b = (2 * Math.PI * (i + 1)) / 3 + Math.PI / 6;
          rod(k, `stoolRung${i}`, [c[0] + dx * 0.165, 0.18, c[2] + dz * 0.165], [c[0] + Math.cos(b) * 0.165, 0.18, c[2] + Math.sin(b) * 0.165], 0.01, null, { segs: q(6, 5, 4), caps: [false, false], mat: 'oak' });
        }
      }
    }
    // —— 水桶：白色塑料桶、半桶泥水、漂着一块海绵、铁丝提手 ——
    {
      const c = [0.46, 0, -0.32];
      turned(k, 'bucket', [[0, 0], [0.12, 0], [0.122, 0.004, sm], [0.145, 0.26, sm], [0.152, 0.27], [0.146, 0.274], [0.139, 0.266, sm], [0.116, 0.012, sm], [0, 0.01]], 'bucket', { segs: q(24, 16, 10), place: xf({ pos: c }) });
      turned(k, 'bucketWater', [[0.136, 0.16], [0, 0.16]], 'water', { segs: q(24, 16, 10), place: xf({ pos: c }) });
      sw(k.box({ name: 'bucketSponge', mat: 'pottery', size: [0.07, 0.028, 0.05], r: 0.01, segs: q(2, 1, 1), xf: xf({ pos: [c[0] - 0.03, 0.166, c[2] + 0.02], rot: [0.08, 0.5, 0.05] }) }), 'sponge');
      if (k.lod < 2) {
        const hp = [];
        for (let i = 0; i <= 10; i++) { const a = Math.PI * (i / 10); hp.push([c[0] + 0.15 * Math.cos(a), 0.262 + 0.04 * Math.sin(a) * 0.6, c[2] + 0.03 * Math.sin(a)]); }
        sw(k.sweep({ name: 'bucketHandle', mat: 'pottery', shape: rect(0.004, 0.004, { r: 0.0018, segs: 1 }), path: catmull(hp, 1), caps: [true, true], up: [0, 0, 1] }), 'steel');
      }
    }
  },
};
