import { shape, profile, circle } from '../core/shape.js';
import { xf } from '../core/vec.js';
import { petUV } from '../materials/atlas.js';
import { sw, aim, catmull } from './parts.js';

// 狗窝：奶白羊羔绒的甜甜圈窝，直径 80cm。
//   · 一圈鼓鼓的靠枕：截面是个底下压平的圆，车削一圈以后沿圆周绗缝成 8 个鼓包（鼓包顶是圆的，缝线处收成一道细细的凹槽，又矮又细）；
//   · 中间的坐垫微微拱起、正中间被压下去一点，边缘塞在靠枕底下；
//   · 坐垫上一根红色的橡胶磨牙骨头，一个网球靠着后面的靠枕；窝前面的地上一根深蓝 / 米白 / 浅蓝三股拧成的绳结玩具，
//     两头打着结、结外面散着一撮穗子。
// 原点在窝的正中心、地面上，正面朝 +z。
const BED = { R: 0.3, a: 0.1, h: 0.2 };   // 靠枕截面圆心离中心的距离、截面半宽、靠枕高
const LOBES = 8;
const QUILT = { r: 0.06, y: 0.05 };       // 绗缝：鼓包处截面放大、缝线处缩小的比例（横向 / 高度）
const BALL_R = 0.033;
const ROPE_R = 0.011;

// 骨头的轮廓（逆时针）：中间一根杆，两头各两个圆鼓包；杆和鼓包、两个鼓包之间的凹角都倒圆
function boneOutline(m) {
  const L = 0.058, R = 0.018, dy = 0.014, hw = 0.011;
  const jx = L - Math.sqrt(R * R - (dy - hw) ** 2), nx = L + Math.sqrt(R * R - dy * dy);
  const fil = { r: 0.007, segs: 2 };
  const pts = [];
  const arc = (cx, cy, from, to) => {
    const a0 = Math.atan2(from[1] - cy, from[0] - cx);
    let a1 = Math.atan2(to[1] - cy, to[0] - cx);
    while (a1 <= a0) a1 += 2 * Math.PI;
    for (let i = 1; i < m; i++) { const a = a0 + ((a1 - a0) * i) / m; pts.push([cx + R * Math.cos(a), cy + R * Math.sin(a), { smooth: true }]); }
  };
  const J1 = [jx, -hw], N1 = [nx, 0], J2 = [jx, hw], J3 = [-jx, hw], N2 = [-nx, 0], J4 = [-jx, -hw];
  pts.push([...J1, fil]); arc(L, -dy, J1, N1);
  pts.push([...N1, fil]); arc(L, dy, N1, J2);
  pts.push([...J2, fil], [...J3, fil]); arc(-L, dy, J3, N2);
  pts.push([...N2, fil]); arc(-L, -dy, N2, J4);
  pts.push([...J4, fil]);
  return pts;
}

export default {
  id: 'dog_bed',
  name: '狗窝',
  nameEn: 'Donut Dog Bed with Toys',
  category: 'pets',
  aoDensity: 260,
  shadow: { margin: 0.12, maxDist: 0.5, density: 110 },
  view: { el: 26, az: 18 },
  build(k) {
    const q = (...v) => k.q(...v);
    const sm = { smooth: true };
    const segs = q(48, 32, 24);   // 每个鼓包 6 / 4 / 3 段，缝线正好落在顶点上

    // —— 靠枕：截面从最底下开始逆时针走一圈（下半圈压扁贴地），车削一周，再绗缝 ——
    {
      const n = q(16, 12, 8), pts = [];
      for (let i = 0; i < n; i++) {
        const t = -Math.PI / 2 + (2 * Math.PI * i) / n, s = Math.sin(t);
        pts.push([BED.R + BED.a * Math.cos(t), (BED.h / 2) * (s < 0 ? 1 - (-s) ** 0.55 : 1 + s), sm]);
      }
      const bolster = k.lathe({ name: 'bolster', mat: 'sherpa', segs, profile: shape(pts, { smooth: true }) });
      bolster.deform(([x, y, z]) => {
        // 鼓包：|sin|^0.5 顶上宽而圆、缝线处尖尖地收下去
        const r = Math.hypot(x, z), f = 2 * Math.sqrt(Math.abs(Math.sin((LOBES / 2) * Math.atan2(x, z)))) - 1;
        const rr = BED.R + (r - BED.R) * (1 + QUILT.r * f);
        return [(x * rr) / r, y * (1 + QUILT.y * f), (z * rr) / r];
      });
    }
    // —— 坐垫：从靠枕里面露出来，微微拱起、中间压下去一点 ——
    k.lathe({ name: 'cushion', mat: 'sherpa', segs, profile: profile([[0.27, 0.03], [0.255, 0.085, sm], [0.2, 0.088, sm], [0.1, 0.079, sm], [0, 0.075]]) });

    // —— 磨牙骨头：躺在坐垫中间偏左（前面的靠枕挡住了坐垫的前半边，玩具都放在后半边）——
    sw(k.extrude({ name: 'bone', mat: 'pet', shape: shape(boneOutline(q(6, 4, 3))), depth: 0.022, axis: 'y', bevel: { w: 0.0065, h: 0.0065 }, bsegs: q(2, 1, 1), xf: xf({ pos: [-0.07, 0.074, -0.02], rot: [0, 0.45, 0] }) }), 'rubberRed');

    // —— 网球：靠着右后方的靠枕。车削展开：u 沿圆周、v 从顶到底，和图集里画缝线的方式一致 ——
    {
      const n = q(8, 6, 4);
      const pr = profile(Array.from({ length: n + 1 }, (_, i) => {
        const a = -Math.PI / 2 + (Math.PI * i) / n;
        return [BALL_R * Math.cos(a), BALL_R * Math.sin(a), i > 0 && i < n ? sm : {}];
      }));
      const ball = k.lathe({ name: 'tennis', mat: 'pet', segs: q(14, 10, 8), grain: 'around', profile: pr });
      ball.T = ball.T.map(([a, s]) => petUV('tennis', a / (2 * Math.PI * BALL_R), 1 - s / pr.length));
      ball.transform(xf({ pos: [0.11, 0.0835 + BALL_R - 0.005, -0.1], rot: [0.5, 0.9, 0.3] }));
    }

    // —— 绳结玩具：窝前面地上弯弯的一根，两头打结、结外面散着穗子 ——
    {
      const y = ROPE_R;
      const path = catmull([[-0.47, y, 0.19], [-0.43, y, 0.32], [-0.33, y, 0.42], [-0.19, y, 0.48], [-0.1, y, 0.5]], q(4, 3, 2));
      k.sweep({ name: 'rope', mat: 'rope_toy', shape: circle(ROPE_R, q(8, 6, 5)), path, up: [0, 1, 0], caps: [false, false] });
      const rnd = k.rand('ropeToy');
      [[path[0], path[1]], [path[path.length - 1], path[path.length - 2]]].forEach(([end, prev], e) => {
        const d = [end[0] - prev[0], 0, end[2] - prev[2]], l = Math.hypot(d[0], d[2]);
        const t = [d[0] / l, 0, d[2] / l];
        // 结：一个压扁的疙瘩球，比绳子粗一圈，表面鼓几个包
        const kc = [end[0] + t[0] * 0.012, 0.019, end[2] + t[2] * 0.012];
        const knot = k.lathe({ name: `knot${e}`, mat: 'rope_toy', segs: q(10, 8, 6), profile: profile([[0, -0.019], [0.014, -0.016, sm], [0.021, -0.004, sm], [0.02, 0.009, sm], [0.012, 0.017, sm], [0, 0.02]]) });
        knot.deform(([px, py, pz]) => {
          const a = Math.atan2(pz, px), f = 1 + 0.1 * Math.sin(3 * a + 2 * py * 100) + 0.06 * Math.sin(5 * a);
          return [px * f, py * (1 + 0.06 * Math.sin(2 * a)), pz * f];
        });
        knot.transform(aim(t, [0, 1, 0], kc));
        // 穗子：几股从结里散出来，头上略微分叉、贴着地
        if (k.lod < 2) {
          for (let i = 0; i < q(6, 4); i++) {
            const sp = (i / (q(6, 4) - 1) - 0.5) * 0.9 + 0.12 * (rnd() - 0.5);
            const dir = [t[0] * Math.cos(sp) - t[2] * Math.sin(sp), 0, t[0] * Math.sin(sp) + t[2] * Math.cos(sp)];
            const L = 0.03 + 0.015 * rnd(), y0 = 0.01 + 0.012 * rnd();
            const p0 = [kc[0] + t[0] * 0.012, y0, kc[2] + t[2] * 0.012];
            k.sweep({ name: `tassel${e}_${i}`, mat: 'rope_toy', shape: circle(0.0032, 4), up: [0, 1, 0], caps: [false, true],
              path: [p0, [p0[0] + dir[0] * L * 0.5, (y0 + 0.004) / 2, p0[2] + dir[2] * L * 0.5], [p0[0] + dir[0] * L, 0.0034, p0[2] + dir[2] * L]] });
          }
        }
      });
    }
  },
};
