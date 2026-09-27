import { xf, smoothstep } from '../core/vec.js';
import { roundLeg } from './parts.js';

// 床尾凳：墨绿丝绒竖条绗缝坐垫 + 胡桃木托架 + 锥腿（黄铜脚套）
//   · 五道竖条是一个形变：每条中间鼓起、条与条之间的缝线往下拉，缝线翻过前后沿一直往下走一段 ——
//     前沿的轮廓因此是一排圆拱；只在 x 方向加节点（每条 3 段），法线用雅可比矩阵，缝线两侧的明暗是连续的；
//   · 丝绒有 sheen：条子鼓起的地方逆光发亮，缝线里压暗（AO）
const L = 1.3, D = 0.4, H = 0.46;
const N = 5; // 竖条数

export default {
  id: 'bench',
  name: '床尾凳',
  nameEn: 'Channel-Tufted Velvet Bench',
  build(k) {
    const q = (...v) => k.q(...v);
    const frameY = 0.3, frameH = 0.045, cushH = H - frameY - frameH;
    // 坐垫
    const size = [L - 0.01, cushH, D - 0.01];
    const h = size.map((v) => v / 2);
    const rr = q(0.04, 0.035, 0.03);
    // 缝线落在平面区域的节点上：平面区域（去掉两端圆角）等分成 N 条，每条 per 段
    const inner = h[0] - rr, cw = (2 * inner) / N;
    const deform = (p) => {
      const x = p[0], y = p[1], z = p[2];
      const up = smoothstep(-h[1], h[1], y); // 顶面 1，底面 0
      // 每条的截面：中间圆鼓、缝线处收成一道尖谷
      const u = (x + inner) / cw - Math.floor((x + inner) / cw);
      const s = Math.sqrt(Math.sin(Math.PI * u)); // 近似圆管的截面
      // 最外面两道缝线不要：两端的条直接圆到坐垫端头
      const edge = Math.min(1, Math.max(0, (inner - Math.abs(x)) / (cw * 0.25)));
      const crease = (1 - s) * edge;
      // 整体微微拱起
      const dome = 0.012 * (1 - (x / h[0]) ** 2) * (1 - (z / h[2]) ** 2);
      // 缝线：顶面往下拉，前后面往里收（越靠近顶越明显）
      const nz = Math.abs(z) / h[2];
      const oy = up * (dome - 0.024 * crease);
      const oz = -Math.sign(z) * 0.016 * crease * smoothstep(0.55, 1, nz) * smoothstep(-0.2, 1, y / h[1]);
      return [x, y + oy, z + oz];
    };
    const per = q(4, 2);
    const xs = [];
    for (let i = 0; i <= N * per; i++) xs.push(-1 + (2 * i) / (N * per));
    k.box({
      name: 'cushion', mat: 'velvet', size, r: rr, segs: q(2, 2, 1),
      div: q([xs, 1, [-1, 0, 1]], [xs, 1, 1], 1), omit: ['ny'],
      deform: k.lod < 2 ? deform : null,
      xf: xf({ pos: [0, frameY + frameH + h[1], 0] }),
    });
    // 胡桃木托架（顶面保留：坐垫底部圆角和托架之间有一道楔形缝，省了会从缝里看穿）
    k.box({
      name: 'frame', mat: 'walnut', size: [L - 0.05, frameH, D - 0.05], r: q(0.005, 0.004, 0), segs: q(1, 1, 0),
      grain: 'x', density: { ny: 0.4, py: 0.2 },
      xf: xf({ pos: [0, frameY + frameH / 2, 0] }),
    });
    // 腿：外撇 5°
    const tilt = (5 * Math.PI) / 180;
    for (const [i, sx, sz] of [[0, 1, 1], [1, -1, 1], [2, -1, -1], [3, 1, -1]]) {
      roundLeg(k, {
        name: `leg${i}`, mat: 'walnut', r0: 0.011, r1: 0.016, h: frameY / Math.cos(tilt) + 0.01, segs: q(8, 6, 5), sabot: { mat: 'brass', h: 0.028 },
        pos: [sx * (L / 2 - 0.09), 0, sz * (D / 2 - 0.075)],
        rot: [-tilt, Math.atan2(sx, sz), 0],
      });
    }
  },
};
