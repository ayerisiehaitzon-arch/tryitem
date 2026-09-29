import { shape, profile, rect } from '../core/shape.js';
import { xf } from '../core/vec.js';
import { SEW_ATLAS, sewUV, fabricUV } from '../materials/atlas.js';
import { SKIRT_PIECE } from './layout.js';
import { sw, mapUV, pin, scissors, ccw } from './parts.js';

// 裁剪台：站着裁布的高台子。白漆的柜体、正面 3 × 2 个开放的格子，塞满叠好的布（芥末黄、藏青波点、红白格、鼠尾草绿、
// 蓝白条纹、碎花、粉色小点、牛仔布），右上那格横躺着三卷布；橡木台面上铺着一张墨绿的切割垫。
// 垫子上铺开一块碎花布，上面压着裙子前片的纸样（两块压铁、三根大头针），旁边一把黑柄的大裁缝剪、一把滚刀、
// 一块粉色的划粉，台面后沿横放着一把木尺。
// 原点在台子正下方的地面，正面（格子开口）朝 +z。
const TOP = { w: 1.4, d: 0.8, h: 0.9, t: 0.03 };
const P = 0.018;
const CAB = { x: 0.68, z: 0.37, y0: 0.07 };

export default {
  id: 'cutting_table',
  name: '裁剪台',
  nameEn: 'Cutting Table with Fabric Cubbies',
  category: 'sewing',
  aoDensity: 260,
  shadow: { margin: 0.12, maxDist: 0.9, density: 100 },
  view: { el: 22, az: 24 },
  build(k) {
    const q = (...v) => k.q(...v);
    const sm = { smooth: true };
    const { w, d, h, t } = TOP;
    const rnd = k.rand('cutting');

    // —— 台面和柜体 ——
    k.extrude({ name: 'top', mat: 'oak', shape: rect(w, d, { r: 0.01, segs: q(3, 2, 1) }), depth: t, axis: 'y', bevel: { w: 0.003, h: 0.003 }, bsegs: q(2, 1, 1), grain: 'across', xf: xf({ pos: [0, h - t, 0] }) });
    const yTop = h - t, H = yTop - CAB.y0, D = 2 * CAB.z;
    const panel = (name, size, pos) => k.box({ name, mat: 'paint', size, r: 0.002, segs: q(1, 1, 0), xf: xf({ pos }) });
    k.box({ name: 'plinth', mat: 'paint', size: [2 * CAB.x - 0.06, CAB.y0, D - 0.06], segs: 0, omit: ['ny', 'py'], xf: xf({ pos: [0, CAB.y0 / 2, -0.02] }) });
    for (const s of [-1, 1]) panel(`side${s > 0 ? 'R' : 'L'}`, [P, H, D], [s * (CAB.x - P / 2), CAB.y0 + H / 2, 0]);
    panel('bottom', [2 * CAB.x - 2 * P, P, D], [0, CAB.y0 + P / 2, 0]);
    panel('lid', [2 * CAB.x - 2 * P, P, D], [0, yTop - P / 2, 0]);
    k.box({ name: 'back', mat: 'paint', size: [2 * CAB.x - 2 * P, H - 2 * P, 0.012], segs: 0, omit: ['nz'], xf: xf({ pos: [0, CAB.y0 + H / 2, -CAB.z + 0.006] }) });
    const inX = CAB.x - P, open = (2 * inX - 2 * P) / 3, yMid = CAB.y0 + H / 2;
    const cols = [-1, 0, 1].map((c) => c * (open + P));
    for (const s of [-1, 1]) panel(`divider${s > 0 ? 'R' : 'L'}`, [P, H - 2 * P, D - 0.012], [s * (open / 2 + P / 2), yMid, 0.006]);
    panel('shelf', [2 * inX, P, D - 0.012], [0, yMid, 0.006]);
    const rows = [[CAB.y0 + P, yMid - P / 2], [yMid + P / 2, yTop - P]];

    // —— 格子里的布 ——
    const F = SEW_ATLAS.fabrics.size;
    const folded = (name, which, size, pos, yaw) => {
      const b = k.box({ name, mat: 'sewing', size, r: q(0.01, 0.008, 0), segs: q(1, 1, 0), xf: xf({ pos, rot: [0, yaw, 0] }) });
      // 圆角盒每个面自带以面中心为原点的 UV（米）：直接当成布上的坐标
      b.T = b.T.map(([u, v]) => fabricUV(which, u / F + 0.5, v / F + 0.5));
      return b;
    };
    rows.forEach(([y0, y1], r) => cols.forEach((cx, c) => {
      const cell = r * 3 + c;
      if (cell === 5) return;   // 右上那格放布卷
      const n = r === 0 ? 5 : 4;
      let y = y0;
      for (let i = 0; i < n; i++) {
        const th = 0.032 + 0.016 * rnd(), which = Math.floor(rnd() * 8);
        folded(`fab${cell}_${i}`, which, [0.34 + 0.03 * rnd(), th, 0.3], [cx + 0.015 * (rnd() - 0.5), y + th / 2, CAB.z - 0.17 + 0.02 * (rnd() - 0.5)], 0.06 * (rnd() - 0.5));
        y += th;
        if (y > y1 - 0.08) break;
      }
    }));
    // 布卷：沿 x 躺着，两个在下、一个架在上面
    {
      const [y0] = rows[1], cx = cols[2], R = 0.05, L = open - 0.05;
      [[-0.052, y0 + R, 'gingham'], [0.052, y0 + R, 'denim'], [0, y0 + R * 2.7, 'calico']].forEach(([dz, cy, which], i) => {
        const roll = k.lathe({ name: `bolt${i}`, mat: 'sewing', grain: 'around', segs: q(14, 10, 7), profile: profile([[0, 0], [R - 0.004, 0], [R, 0.004, sm], [R, L - 0.004, sm], [R - 0.004, L], [0, L]]) });
        // 侧面按弧长绕一圈、沿长度铺布；两个端面平面贴
        roll.T = roll.T.map((tt, j) => (Math.abs(roll.N[j][1]) > 0.9 ? fabricUV(which, roll.P[j][0] / F + 0.5, roll.P[j][2] / F + 0.5) : fabricUV(which, tt[0] / (2 * Math.PI * R), roll.P[j][1] / L)));
        roll.transform(xf({ pos: [cx - L / 2, cy, CAB.z - 0.14 + dz], rot: [0, 0, -Math.PI / 2] }));
      });
    }

    // —— 台面上：切割垫、铺开的碎花布、纸样、压铁、大头针 ——
    const top = h + 0.0005;
    {
      const M = SEW_ATLAS.mat, mat = k.box({ name: 'mat', mat: 'sewing', size: [M.w, 0.003, M.h], segs: 0, omit: ['ny'] });
      mapUV(mat, (p) => sewUV('mat', p[0] / M.w + 0.5, p[2] / M.h + 0.5)).transform(xf({ pos: [-0.2, top + 0.0015, 0.04], rot: [0, 0.04, 0] }));
    }
    const fy = top + 0.0036, clothAt = xf({ pos: [-0.22, fy, 0.05], rot: [0, -0.1, 0] });
    k.box({ name: 'cloth', mat: 'calico', size: [0.64, 0.0012, 0.42], segs: 0, omit: ['ny'] }).transform(clothAt);
    // 后沿对折回来的一道
    k.box({ name: 'clothFold', mat: 'calico', size: [0.64, 0.0012, 0.09], segs: 0, omit: ['ny'], xf: xf({ pos: [0, 0.0014, -0.165] }) }).transform(clothAt);
    {
      const Z = SEW_ATLAS.pattern.size;
      const pts = ccw(SKIRT_PIECE.map(([px, py]) => [px - Z / 2, Z / 2 - py]));
      const piece = k.extrude({ name: 'pattern', mat: 'sewing', shape: shape(pts), depth: 0.0005, axis: 'y' });
      mapUV(piece, (p) => sewUV('pattern', p[0] / Z + 0.5, p[2] / Z + 0.5));
      const at = xf({ pos: [-0.2, fy + 0.0008, 0.05], rot: [0, 0.35, 0] });
      piece.transform(at);
      // 两块压铁
      for (const [px, pz, i] of [[-0.06, -0.12, 0], [0.09, 0.1, 1]]) {
        sw(k.lathe({ name: `weight${i}`, mat: 'sewing', segs: q(14, 10, 8), profile: profile([[0, 0], [0.025, 0, { r: 0.002 }], [0.025, 0.012, { r: 0.003 }], [0, 0.012]]) }), 'steel').transform(xf({ pos: [px, 0.0005, pz] })).transform(at);
      }
      // 大头针：几乎平躺着别在纸样边上
      if (k.lod < 2) {
        [[-0.1, 0.05, 0.3], [0.12, -0.05, 2.6], [0.0, 0.17, 1.4]].forEach(([px, pz, a], i) => {
          const tip = at.apply([px, 0.0014, pz]), dir = [Math.cos(a), 0.04, Math.sin(a)];
          pin(k, `pin${i}`, tip, dir, 0.032, i + 1);
        });
      }
    }
    // 大裁缝剪（黑柄）、滚刀、划粉
    scissors(k, 'shears', { s: 1.6, handle: 'black', place: xf({ pos: [0.4, top, 0.12], rot: [0, 2.6, 0] }) });
    {
      const at = xf({ pos: [0.36, top, -0.12], rot: [0, -0.5, 0] });
      const R = 0.014;
      sw(k.lathe({ name: 'cutterHandle', mat: 'sewing', segs: q(10, 8, 6), profile: profile([[0, 0], [R * 0.8, 0.004, sm], [R, 0.03, sm], [R * 0.85, 0.12, sm], [R * 0.9, 0.13, sm], [0, 0.135]]), xf: xf({ pos: [0, R, 0], rot: [0, 0, -Math.PI / 2] }) }), 'rotaryTeal').transform(at);
      sw(k.lathe({ name: 'cutterBlade', mat: 'sewing', segs: q(20, 14, 10), profile: profile([[0.0225, -0.0005], [0.0225, 0.0005], [0, 0.0005]]), xf: xf({ pos: [0.148, 0.0225, 0], rot: [Math.PI / 2, 0, 0] }) }), 'steel').transform(at);
      sw(k.box({ name: 'cutterGuard', mat: 'sewing', size: [0.03, 0.03, 0.006], r: 0.004, segs: q(2, 1, 0), xf: xf({ pos: [0.142, 0.027, 0.004] }) }), 'rotaryTeal').transform(at);
    }
    sw(k.extrude({ name: 'chalk', mat: 'sewing', shape: shape(ccw([[0, 0.028, { r: 0.004 }], [-0.024, -0.014, { r: 0.004 }], [0.024, -0.014, { r: 0.004 }]])), depth: 0.005, axis: 'y', bevel: 0.0012, xf: xf({ pos: [0.2, top, 0.26], rot: [0, 0.4, 0] }) }), 'chalk');
    // 木尺：横放在台面后沿（刻度在远的那条边上，数字从前面看是正的）
    {
      const Y = SEW_ATLAS.yardstick, stick = k.box({ name: 'yardstick', mat: 'sewing', size: [Y.len, 0.006, Y.w], segs: 0, omit: ['ny'] });
      mapUV(stick, (p) => sewUV('yardstick', p[0] / Y.len + 0.5, p[2] / Y.w + 0.5)).transform(xf({ pos: [0.05, top + 0.003, -0.33], rot: [0, 0.02, 0] }));
    }
  },
};
