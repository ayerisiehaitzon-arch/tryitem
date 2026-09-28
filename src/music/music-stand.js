import { shape, rect, circle, profile } from '../core/shape.js';
import { xf } from '../core/vec.js';
import { roundedPath } from '../core/path.js';
import { scoreSpread } from './parts.js';

// 乐谱架：胡桃木的三脚谱架，谱板是一把“竖琴”（lyre-back music stand），上面摊着一本小提琴分谱。
//   · 三条腿是同一个侧面轮廓的挤出：沿一条三次贝塞尔的中线，从 4.6cm 厚收到 2.2cm，先往下再往外甩，脚尖贴地；
//     挤出的两面倒圆，绕着立柱每隔 120° 一条；
//   · 腿根一个车削的木墩（底下一个小垂珠），往上是车削的立柱，顶上黄铜的锁紧套和一颗蝶形螺丝，
//     黄铜内杆伸上去接谱板的转轴（转轴一头一个黄铜旋钮，谱板往后仰 19°）；
//   · 谱板：一圈木框（圆角矩形的截面沿闭合路径扫一圈，顶边是一道弧），中间一把竖琴：
//     两根弯出来的琴臂、顶上的横梁、五根黄铜琴弦；两边各一根竖条托着谱；底下一条托谱的横档，前沿一道挡边。
//     谱板比乐谱高出一截：谱摊开靠在竖琴上，竖琴的上半截（卷出来的琴臂头、横梁、琴弦）露在谱的上面。
// 原点在三脚的中心（地面上），谱面朝 +z
const HY = 0.93;       // 谱板转轴的高度
const TILT = 0.34;     // 谱板后仰
const bez = (a, b, c, d, t) => {
  const u = 1 - t;
  return [0, 1].map((i) => u * u * u * a[i] + 3 * u * u * t * b[i] + 3 * u * t * t * c[i] + t * t * t * d[i]);
};
const bezD = (a, b, c, d, t) => {
  const u = 1 - t;
  return [0, 1].map((i) => 3 * u * u * (b[i] - a[i]) + 6 * u * t * (c[i] - b[i]) + 3 * t * t * (d[i] - c[i]));
};

export default {
  id: 'music_stand',
  name: '乐谱架',
  nameEn: 'Walnut Lyre Music Stand',
  category: 'music',
  aoDensity: 260,
  shadow: { margin: 0.15, maxDist: 0.6, density: 100 },
  view: { el: 16, az: 30 },
  build(k) {
    const q = (...v) => k.q(...v);

    // —— 三条腿：侧面轮廓（中线两侧各偏半个厚度）挤出，两面倒圆 ——
    {
      const C = [[0.012, 0.27], [0.075, 0.19], [0.165, 0.03], [0.275, 0.012]];
      const n = q(9, 6, 4);
      const lower = [], upper = [];
      for (let i = 0; i <= n; i++) {
        const t = i / n, p = bez(...C, t), d = bezD(...C, t), l = Math.hypot(d[0], d[1]);
        const nn = [-d[1] / l, d[0] / l], th = (0.046 * (1 - t) + 0.022 * t) / 2;
        lower.push([p[0] - nn[0] * th, p[1] - nn[1] * th]);
        upper.push([p[0] + nn[0] * th, p[1] + nn[1] * th]);
      }
      const pts = [
        ...lower.map((p, i) => (i === lower.length - 1 ? [...p, { r: q(0.006, 0.004, 0), segs: q(2, 1, 1) }] : i === 0 ? p : [...p, { smooth: true }])),
        ...upper.reverse().map((p, i) => (i === 0 ? [...p, { r: q(0.006, 0.004, 0), segs: q(2, 1, 1) }] : i === upper.length - 1 ? p : [...p, { smooth: true }])),
      ];
      const leg = shape(pts);
      for (let i = 0; i < 3; i++) {
        k.extrude({
          name: `leg${i}`, mat: 'walnut', shape: leg, depth: 0.022, axis: 'z', center: true,
          bevel: q(0.005, 0.004, 0.002), bsegs: 1, xf: xf({ rot: [0, Math.PI / 2 + (i * 2 * Math.PI) / 3, 0] }),
        });
      }
    }
    // —— 木墩、立柱（车削），黄铜锁紧套和蝶形螺丝，黄铜内杆 ——
    const s = { smooth: true };
    k.lathe({
      name: 'hub', mat: 'walnut', segs: q(16, 10, 8),
      profile: profile([[0, 0.165], [0.011, 0.176, s], [0.018, 0.196, s], [0.032, 0.215, s], [0.041, 0.245, s], [0.039, 0.29, s], [0.03, 0.318, s], [0.022, 0.33, { r: 0.004, segs: 1 }], [0.021, 0.345]]),
    });
    k.lathe({
      name: 'column', mat: 'walnut', segs: q(14, 10, 6),
      profile: profile([[0.021, 0.345], [0.025, 0.356, s], [0.021, 0.368, s], [0.0185, 0.41, s], [0.0158, 0.77, s], [0.0198, 0.785, s], [0.0158, 0.8]]),
    });
    k.lathe({
      name: 'collar', mat: 'brass', segs: q(14, 10, 6),
      profile: profile([[0.0165, 0.795], [0.021, 0.8, { r: 0.002, segs: 1 }], [0.021, 0.827, { r: 0.002, segs: 1 }], [0.0095, 0.831]]),
    });
    if (k.lod < 2) {
      k.lathe({
        name: 'screw', mat: 'brass', segs: q(10, 6),
        profile: profile([[0.0032, 0], [0.0032, 0.01], [0.0085, 0.012, { r: 0.002, segs: 1 }], [0.0085, 0.02, { r: 0.002, segs: 1 }], [0, 0.021]]),
        xf: xf({ pos: [0.019, 0.8125, 0], rot: [0, 0, -Math.PI / 2] }),
      });
    }
    k.sweep({ name: 'rod', mat: 'brass', shape: circle(0.0085, q(10, 8, 6)), caps: [false, false], up: [1, 0, 0], path: [[0, 0.828, 0], [0, HY - 0.01, 0]] });
    // 转轴：一块黄铜座，横着一根轴，一头一个旋钮
    k.box({ name: 'pivotBlock', mat: 'brass', size: [0.034, 0.03, 0.026], r: q(0.005, 0.003, 0), segs: q(2, 1, 0), xf: xf({ pos: [0, HY, 0.006] }) });
    k.sweep({ name: 'axle', mat: 'brass', shape: circle(0.009, q(10, 8, 6)), caps: [true, true], up: [0, 1, 0], path: [[-0.03, HY, 0.012], [0.03, HY, 0.012]] });
    k.lathe({
      name: 'wingKnob', mat: 'brass', segs: q(12, 8, 6),
      profile: profile([[0.005, 0], [0.005, 0.006], [0.015, 0.009, { r: 0.003, segs: 1 }], [0.015, 0.016, { r: 0.004, segs: 1 }], [0, 0.018]]),
      xf: xf({ pos: [0.03, HY, 0.012], rot: [0, 0, -Math.PI / 2] }),
    });

    // —— 谱板：局部坐标 y 沿谱面往上、z 朝着看谱的人；原点在转轴前面 ——
    const D = xf({ pos: [0, HY, 0.03], rot: [-TILT, 0, 0] });
    const at = (pts) => pts.map(([x, y]) => D.apply([x, y, 0]));
    const up = D.applyDir([0, 0, 1]);
    // 外框：底边、两条竖边、顶上一道弧
    {
      const arch = [];
      const na = q(12, 7, 4);
      for (let i = 1; i < na; i++) {
        const t = i / na, x = 0.26 - 0.52 * t;
        arch.push([x, 0.38 + 0.06 * Math.sin(Math.PI * t)]);
      }
      const pts = [[0, -0.06], [0.26, -0.06], [0.26, 0.38], ...arch, [-0.26, 0.38], [-0.26, -0.06], [0, -0.06]];
      const rad = pts.map((p, i) => (i === 1 || i === pts.length - 2 ? 0.02 : i === 2 || i === pts.length - 3 ? 0.035 : 0));
      k.sweep({
        name: 'frame', mat: 'walnut', shape: rect(0.014, 0.016, { r: q(0.004, 0.003, 0), segs: q(2, 1, 0) }), closed: true, caps: [false, false], up,
        path: at(roundedPath(pts, rad, q(4, 2, 1)).slice(0, -1)),
      });
    }
    // 竖琴：两根琴臂（从底下中间分开、往外鼓、到顶上往外卷），一根横梁，五根黄铜弦
    {
      const n = q(10, 6, 4);
      for (const sx of [-1, 1]) {
        const A = [[0.014, -0.055], [0.14, 0.0], [0.16, 0.24], [0.075, 0.31]];
        const B = [[0.075, 0.31], [0.04, 0.335], [0.065, 0.378], [0.108, 0.362]];
        const pts = [];
        for (let i = 0; i <= n; i++) pts.push(bez(...A, i / n));
        const nb = q(8, 5, 3);
        for (let i = 1; i <= nb; i++) pts.push(bez(...B, i / nb));
        k.sweep({
          name: `lyre${sx > 0 ? 'R' : 'L'}`, mat: 'walnut', shape: rect(0.011, 0.013, { r: q(0.004, 0.003, 0), segs: 1 }), caps: [true, true], up,
          path: at(pts.map(([x, y]) => [sx * x, y])),
        });
      }
      const yoke = at([[-0.085, 0.305], [0.085, 0.305]]);
      k.sweep({ name: 'yoke', mat: 'walnut', shape: rect(0.012, 0.014, { r: q(0.003, 0), segs: q(1, 0) }), caps: [true, true], up, path: yoke });
      const base = at([[-0.045, -0.02], [0.045, -0.02]]);
      k.sweep({ name: 'bridge', mat: 'walnut', shape: rect(0.01, 0.012, { r: q(0.003, 0), segs: q(1, 0) }), caps: [true, true], up, path: base });
      if (k.lod < 2) {
        for (let i = 0; i < 5; i++) {
          const x = -0.028 + i * 0.014;
          k.sweep({ name: `string${i}`, mat: 'brass', shape: circle(0.0013, q(5, 4)), caps: [false, false], up, path: at([[x, -0.016], [x, 0.3]]) });
        }
      }
    }
    // 两根竖条、托谱的横档和挡边
    for (const sx of [-1, 1]) {
      k.box({ name: `slat${sx > 0 ? 'R' : 'L'}`, mat: 'walnut', size: [0.012, 0.455, 0.009], r: q(0.002, 0), segs: q(1, 0), grain: 'y', xf: D.mul(xf({ pos: [sx * 0.19, 0.1725, 0] })) });
    }
    k.box({ name: 'ledge', mat: 'walnut', size: [0.56, 0.012, 0.055], r: q(0.003, 0.002, 0), segs: q(2, 1, 0), grain: 'x', xf: D.mul(xf({ pos: [0, -0.072, 0.02] })) });
    k.box({ name: 'lip', mat: 'walnut', size: [0.56, 0.02, 0.007], r: q(0.0025, 0), segs: q(1, 0), grain: 'x', omit: ['ny'], xf: D.mul(xf({ pos: [0, -0.056, 0.0445] })) });
    // 小提琴分谱：摊开靠在谱板上，底边坐在横档上
    scoreSpread(k, { name: 'music', place: D.mul(xf({ pos: [0, -0.0655, 0.0095] })), pages: [2, 3], bow: 0.012, segs: q(8, 4, 2) });
  },
};
