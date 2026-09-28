import { rect, triangulate } from '../core/shape.js';
import { xf } from '../core/vec.js';

// 穿衣镜：1.8m 高的拱形落地镜，黄铜细框，斜靠在墙上
//   · 框是一条闭合扫掠：截面 2.6cm 见方、正面两条棱圆过去（D 形），路径沿拱形走一圈；
//     拱和两边的直线是相切的，只有底下两个直角 —— 拐角两侧各加一个 2mm 外的路径点，把法线过渡压在拐角上；
//   · 镜片是一张按拱形轮廓三角化的平面，比框面凹进 1.5cm、四边塞进框底下 6mm；背面一块胡桃木背板；
//   · 整面镜子绕底边往墙上靠 5.5°，顶端贴墙 —— 镜子贴着墙和地面两个面（各一张接触阴影）。
// 原点在墙根、宽度中点（z = 0 是墙面，y = 0 是地面）。
const H = 1.8, W = 0.7, FW = 0.026, FD = 0.026;
const LEAN = (5.5 * Math.PI) / 180;

// 拱形轮廓（逆时针）：半宽 a，直边从 y0 到拱心 yc，拱半径 = a
function archOutline(a, y0, yc, n) {
  const pts = [[a, y0], [a, yc]];
  for (let i = 1; i < n; i++) {
    const t = (Math.PI * i) / n;
    pts.push([a * Math.cos(t), yc + a * Math.sin(t)]);
  }
  pts.push([-a, yc], [-a, y0]);
  return pts;
}

export default {
  id: 'floor_mirror',
  name: '穿衣镜',
  nameEn: 'Arched Brass Floor Mirror',
  category: 'entry',
  planes: ['floor', 'wall'],
  aoDensity: 160,
  shadow: {
    floor: { margin: 0.14, maxDist: 0.4, density: 90, strength: 0.8 },
    wall: { margin: 0.12, maxDist: 0.3, density: 60, strength: 0.6 },
  },
  view: { el: 10, az: 28 },
  build(k) {
    const q = (...v) => k.q(...v);
    // 局部原点在镜子底边、背面；绕它往墙上倒 LEAN，顶端背面正好离墙 4mm
    const place = xf({ pos: [0, 0, H * Math.sin(LEAN) + 0.004], rot: [-LEAN, 0, 0] });
    const yc = H - W / 2; // 拱心高度
    const nArc = q(24, 14, 8); // 拱的半径有 35cm：近看 16 段能看出折角
    // —— 框：沿中线扫掠 ——
    const a = W / 2 - FW / 2, e = 0.002, yb = FW / 2;
    const arc = archOutline(a, yb, yc, nArc).slice(1, -1); // 拱（含两端的直边端点）
    const path = [
      [0, yb, 0], [a - e, yb, 0], [a, yb, 0], [a, yb + e, 0],
      ...arc.map(([x, y]) => [x, y, 0]),
      [-a, yb + e, 0], [-a, yb, 0], [-a + e, yb, 0],
    ].map(([x, y]) => [x, y, FD / 2]);
    const r = q(0.009, 0.008, 0.006);
    const frame = k.sweep({
      name: 'frame', mat: 'brass', shape: rect(FW, FD, { corners: [q(0.001, 0), q(0.001, 0), r, r], segs: q(2, 2, 1) }),
      closed: true, caps: [false, false], up: [0, 0, 1], maxChart: 1.2, path,
    });
    frame.transform(place);
    // —— 镜片、背板：拱形平面（背板朝后）——
    const flat = (name, mat, half, y0, z, nz, density) => {
      const part = k.part(mat, name);
      const poly = archOutline(half, y0, yc, nArc);
      const ch = k.chart(name, 2 * half, H, { density });
      const ids = poly.map(([x, y]) => part.v([x, y, z], [0, 0, nz], [x + half, y], ch, [(x + half) / (2 * half), y / H]));
      for (const [i0, i1, i2] of triangulate(poly)) part.tri(ids[i0], ids[i1], ids[i2]);
      part.transform(place);
      return part;
    };
    const g = a - FW / 2 + 0.006;
    flat('glass', 'mirror', g, FW - 0.006, FD - 0.015, 1, 0.8);
    flat('backing', 'walnut', a + FW / 2 - 0.004, 0.004, 0.001, -1, 0.2);
  },
};
