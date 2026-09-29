import { profile } from '../core/shape.js';
import { xf } from '../core/vec.js';
import { catmull } from '../gym2/parts.js';
import { sw, tube, pipe, tripod } from './parts.js';

// 麦克风架：黑色的三脚架、两节伸缩管（中间一个锁紧套），顶上一个关节接一根斜臂，臂尾一个配重；
// 臂头的夹子夹着一支动圈麦克风（黑色的手柄、银色的网罩球头、中间一道银圈），尾巴插着黑色的线：
// 线沿着斜臂垂下来，顺着立管落到地上，在地上绕一个松松的弯。原点在三脚架中心的地面，麦克风朝 -z（唱歌的人站在那边）。
const TOP = 1.18;
const BOOM = { el: 0.55, back: 0.2, fwd: 0.44 };   // 斜臂朝 -z 仰起的角度、关节往后、往前伸出的长度
const TILT = 0.2;                                   // 麦克风轴线朝 -z、略往上仰

export default {
  id: 'mic_stand',
  name: '麦克风架',
  nameEn: 'Boom Mic Stand with Dynamic Mic',
  category: 'band',
  aoDensity: 300,
  shadow: { margin: 0.12, maxDist: 0.5, density: 120 },
  view: { el: 10, az: 60 },
  build(k) {
    const q = (...v) => k.q(...v);
    const sm = { smooth: true };
    const c = [0, 0, 0];
    tripod(k, 'base', { c, hubY: 0.13, spread: 0.3, a0: Math.PI / 2, legR: 0.0075, swatch: 'blackHw' });
    tube(k, 'lower', [0, 0.12, 0], [0, 0.82, 0], 0.011, 'blackHw', { caps: [false, true] });
    sw(k.lathe({ name: 'clutch', mat: 'band', segs: q(12, 8, 6), profile: profile([[0.0115, 0.795], [0.017, 0.8, sm], [0.017, 0.84, sm], [0.0085, 0.846]]) }), 'blackHw');
    tube(k, 'upper', [0, 0.84, 0], [0, TOP - 0.02, 0], 0.0082, 'blackHw', { caps: [false, true] });
    // 关节和斜臂：臂绕 x 转 BOOM.a（朝 -z 仰起来）
    const joint = [0, TOP, 0];
    sw(k.box({ name: 'joint', mat: 'band', size: [0.034, 0.042, 0.034], r: q(0.007, 0.005, 0), segs: q(2, 1, 0), xf: xf({ pos: joint }) }), 'blackHw');
    const dir = [0, Math.sin(BOOM.el), -Math.cos(BOOM.el)];
    const tail = [joint[0], joint[1] - dir[1] * BOOM.back, joint[2] - dir[2] * BOOM.back];
    const head = [joint[0], joint[1] + dir[1] * BOOM.fwd, joint[2] + dir[2] * BOOM.fwd];
    tube(k, 'boom', tail, head, 0.0078, 'blackHw');
    sw(k.lathe({ name: 'weight', mat: 'band', segs: q(12, 8, 6), profile: profile([[0, -0.03], [0.016, -0.03, { r: 0.004, segs: 1 }], [0.016, 0.03, { r: 0.004, segs: 1 }], [0, 0.03]]), xf: xf({ pos: tail, rot: [BOOM.el - Math.PI / 2, 0, 0] }) }), 'blackHw');
    if (k.lod < 2) {
      sw(k.lathe({ name: 'jointKnob', mat: 'band', segs: q(10, 8), profile: profile([[0.004, 0], [0.012, 0.004, sm], [0.012, 0.014, sm], [0, 0.016]]), xf: xf({ pos: [joint[0] + 0.017, joint[1], joint[2]], rot: [0, 0, -Math.PI / 2] }) }), 'blackHw');
    }
    // 麦克风夹和麦克风：夹子在臂头，麦克风略往下垂，球头朝 -z
    const clip = [head[0], head[1] + 0.012, head[2] - 0.01];
    sw(k.box({ name: 'clip', mat: 'band', size: [0.03, 0.03, 0.04], r: q(0.006, 0.004, 0), segs: q(2, 1, 0), xf: xf({ pos: clip }) }), 'blackHw');
    const mdir = [0, Math.sin(TILT), -Math.cos(TILT)];
    const m0 = [clip[0], clip[1] + 0.022 - mdir[1] * 0.075, clip[2] - mdir[2] * 0.075];   // 麦克风尾巴（夹子夹在手柄中段）
    const mic = xf({ pos: m0, rot: [TILT - Math.PI / 2, 0, 0] });   // 局部 +y → mdir
    sw(k.lathe({ name: 'micBody', mat: 'band', segs: q(16, 10, 8), profile: profile([[0, 0], [0.0105, 0.001, sm], [0.0112, 0.012, sm], [0.0135, 0.085, sm], [0.0165, 0.118, sm], [0.0168, 0.124]]), xf: mic }), 'micBody');
    sw(k.lathe({ name: 'micBand', mat: 'band', segs: q(16, 10, 8), profile: profile([[0.0168, 0.124], [0.0175, 0.126, sm], [0.0175, 0.131, sm], [0.0168, 0.133]]), xf: mic }), 'chrome');
    {
      const n = q(8, 6, 4), R = 0.0255, cy = 0.133 + 0.022;
      const pts = [[0.0168, 0.133]];
      for (let i = 1; i <= n; i++) {
        const a = -Math.PI / 2 + 0.72 + ((Math.PI / 2 - 0.72 + Math.PI / 2) * i) / n;
        pts.push([R * Math.cos(a), cy + R * Math.sin(a), i < n ? sm : {}]);
      }
      pts[pts.length - 1] = [0, cy + R];
      sw(k.lathe({ name: 'micGrille', mat: 'band', segs: q(16, 10, 8), profile: profile(pts), xf: mic }), 'mesh');
    }
    // 线：从麦克风尾巴出来，搭着斜臂垂下去，顺着立管到地上，在地上绕一个弯
    if (k.lod < 2) {
      const ctl = [m0, [m0[0] + 0.01, m0[1] - 0.12, m0[2] + 0.06], [0.02, TOP - 0.25, 0.03], [0.018, 0.7, 0.02], [0.02, 0.3, 0.02], [0.05, 0.03, 0.05], [0.22, 0.008, 0.2], [0.42, 0.008, 0.12], [0.55, 0.008, 0.28]];
      pipe(k, 'cable', catmull(ctl, q(5, 3)), 0.0032, 'cable', { segs: q(6, 4), caps: [true, true], up: [1, 0, 0] });
      sw(k.lathe({ name: 'xlr', mat: 'band', segs: q(10, 6), profile: profile([[0, -0.03], [0.0085, -0.028, sm], [0.0095, -0.004, sm], [0.0095, 0]]), xf: mic }), 'blackHw');
    }
  },
};
