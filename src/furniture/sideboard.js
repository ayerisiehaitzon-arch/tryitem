import { profile } from '../core/shape.js';
import { xf } from '../core/vec.js';
import { roundLeg, knob } from './parts.js';

// 餐边柜：橡木柜体 + 三扇维也纳藤编门 + 黄铜小圆钮 + 外撇锥腿（和床头柜、书桌一套的黄铜脚套）
//   · 门框是一圈闭合扫掠（截面带圆角，四个角斜接）：一扇门的框只要 48 个三角形，比四根倒角板省七成；
//   · 藤编是一张贴图：八角孔直接画成柜子里的暗色（孔只有几毫米，视差可以忽略），
//     不用透明裁剪，没有过度绘制；藤编面比门框退进 12mm，框的内侧在 AO 里投下一圈阴影；
//   · 柜体背面贴墙看不见，AO 密度给低
const W = 1.5, D = 0.42, H = 0.78, LEG = 0.18;

// 门框截面（开放轮廓，从框内缘的背面走到外缘的背面；x 朝门中心为正，y 离开柜面）
function frameProfile(k, fw, ft) {
  const q = (...v) => k.q(...v);
  return profile([
    [fw / 2, 0],
    [fw / 2, ft, { r: q(0.002, 0.0015, 0), segs: 1 }],
    [-fw / 2, ft, { r: q(0.004, 0.003, 0), segs: q(2, 1, 1) }],
    [-fw / 2, 0],
  ]);
}

export default {
  id: 'sideboard',
  name: '餐边柜',
  nameEn: 'Cane Sideboard',
  aoDensity: 120,
  build(k) {
    const q = (...v) => k.q(...v);
    const bodyH = H - LEG;
    k.box({
      name: 'body', mat: 'oak', size: [W, bodyH, D], r: q(0.008, 0.006, 0), segs: q(2, 1, 0), grain: 'x',
      density: { nz: 0.25, ny: 0.4 },
      xf: xf({ pos: [0, LEG + bodyH / 2, 0] }),
    });
    // 三扇门：门框 + 藤编面 + 小圆钮（左门钮在右、另两扇钮在左，都靠近对开的一侧）
    const m = 0.02, gap = 0.004, fw = 0.05, ft = 0.02;
    const dw = (W - 2 * m - 2 * gap) / 3, dh = bodyH - 2 * m;
    const prof = frameProfile(k, fw, ft);
    const zf = D / 2, y0 = LEG + m;
    for (let i = 0; i < 3; i++) {
      const x0 = -W / 2 + m + i * (dw + gap), x1 = x0 + dw;
      const c = fw / 2;
      k.sweep({
        name: `door${i}`, mat: 'oak', shape: prof, closed: true, caps: [false, false], up: [0, 0, 1], grain: 'len',
        path: [[x0 + c, y0 + c, zf], [x1 - c, y0 + c, zf], [x1 - c, y0 + dh - c, zf], [x0 + c, y0 + dh - c, zf]],
      });
      k.box({
        name: `cane${i}`, mat: 'cane', size: [dw - 2 * fw + 0.01, dh - 2 * fw + 0.01, 0.002], segs: 0,
        omit: ['nz', 'px', 'nx', 'py', 'ny'],
        xf: xf({ pos: [(x0 + x1) / 2, y0 + dh / 2, zf + ft - 0.012] }),
      });
      if (k.lod < 2) {
        const kx = i === 0 ? x1 - fw / 2 : x0 + fw / 2;
        knob(k, { name: `knob${i}`, mat: 'brass', d: 0.024, h: 0.022, segs: q(10, 6), pos: [kx, y0 + dh * 0.62, zf + ft], rot: [Math.PI / 2, 0, 0] });
      }
    }
    // 腿：外撇 6°，黄铜脚套
    const tilt = (6 * Math.PI) / 180;
    for (const [i, sx, sz] of [[0, 1, 1], [1, -1, 1], [2, -1, -1], [3, 1, -1]]) {
      roundLeg(k, {
        name: `leg${i}`, mat: 'oak', r0: 0.012, r1: 0.019, h: LEG / Math.cos(tilt) + 0.01, segs: q(8, 6, 5), sabot: { mat: 'brass', h: 0.03 },
        pos: [sx * (W / 2 - 0.1), 0, sz * (D / 2 - 0.07)],
        rot: [-tilt, Math.atan2(sx, sz), 0],
      });
    }
  },
};
