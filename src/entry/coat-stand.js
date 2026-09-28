import { profile, rect } from '../core/shape.js';
import { xf, smoothstep } from '../core/vec.js';
import { roundedPath } from '../core/path.js';
import { roundLeg } from '../furniture/parts.js';
import { puffDeform } from '../prims/box.js';

// 衣帽架：橡木车木立柱 + 三条外撇的腿 + 两层斜向上的挂钩；
// 顶上扣着一顶驼色毡帽，一根钩上挂着帆布托特包，立柱上还围着一条芥末黄的亚麻围巾。
//   · 挂钩是往上斜的：挂上去的东西会顺着钩滑到根部 —— 包的两条提手搭在钩的根部，包身贴着立柱垂下来；
//   · 托特包是一个圆角盒子的形变：上口被提手收窄、下面鼓起来、底比口宽一点；两条皮提手从包口两侧拱上去绕过挂钩；
//   · 围巾像围在脖子上一样绕立柱一圈，两头从右前方垂下来、一长一短 —— 一条扫掠：旋转最小化标架
//     自己会把“垂下来时横着展开”的围巾，在绕柱子的那一段转成竖着的一圈（和真的围巾一样）；
//   · 毡帽是一次车削（帽檐外沿微微上翘、帽顶圆鼓），加一圈皮帽带；帽子里面用一片深色的圆片封住。
const POLE = { r: 0.019, top: 1.78 };
const JOINT = 0.46; // 腿插进立柱的高度
const LEG = { reach: 0.3, r0: 0.011, r1: 0.016 };
const TIERS = [{ y: 1.58, az0: 0 }, { y: 1.44, az0: 60 }];
const PEG = { len: 0.12, elev: (40 * Math.PI) / 180 };
const deg = (d) => (d * Math.PI) / 180;
// 让局部 y 轴指向（方位角 az，从 +z 转向 +x；仰角 elev，从水平往上）
const toward = (az, elev) => [Math.PI / 2 - elev, az, 0];
const radial = (az) => [Math.sin(az), 0, Math.cos(az)];
const tangent = (az) => [Math.cos(az), 0, -Math.sin(az)];
const at = (az, r, y, t = 0) => [Math.sin(az) * r + Math.cos(az) * t, y, Math.cos(az) * r - Math.sin(az) * t];

export default {
  id: 'coat_stand',
  name: '衣帽架',
  nameEn: 'Oak Coat Stand',
  category: 'entry',
  aoDensity: 180,
  shadow: { margin: 0.2, maxDist: 0.6, density: 80 },
  view: { el: 12, az: -20 }, // 从左前方看：托特包的正面、围巾都在画面里
  build(k) {
    const q = (...v) => k.q(...v);
    // —— 立柱：底下一个车木的垂珠，腿的接头处一圈箍，顶上一颗球 ——
    const s = { smooth: true };
    k.lathe({
      name: 'pole', mat: 'oak', segs: q(9, 7, 6),
      profile: profile([
        [0, 0.26], [0.013, 0.27, s], [0.022, 0.31, s], [0.026, 0.36, s], [0.022, 0.41, s],
        [0.027, JOINT - 0.03, { r: q(0.004, 0), segs: 1 }], [0.027, JOINT + 0.05, { r: q(0.004, 0), segs: 1 }],
        [POLE.r, JOINT + 0.07], [POLE.r, POLE.top - 0.03], [0.024, POLE.top - 0.012, s], [0.03, POLE.top + 0.012, s],
        [0.022, POLE.top + 0.036, s], [0, POLE.top + 0.042],
      ]),
    });
    // —— 三条腿：从地面斜插进立柱的箍 ——
    const len = Math.hypot(LEG.reach, JOINT), elev = Math.atan2(JOINT, LEG.reach);
    for (let i = 0; i < 3; i++) {
      const az = deg(30 + i * 120);
      roundLeg(k, {
        name: `leg${i}`, mat: 'oak', r0: LEG.r0, r1: LEG.r1, h: len + 0.01, segs: q(8, 6, 5),
        pos: at(az, LEG.reach, 0), rot: toward(az + Math.PI, elev),
      });
    }
    // —— 挂钩：两层各三根，上下错开 60° ——
    const pegs = [];
    TIERS.forEach((tier, ti) => {
      for (let i = 0; i < 3; i++) {
        const az = deg(tier.az0 + i * 120);
        pegs.push({ az, y: tier.y });
        if (k.lod >= 2 && ti > 0) continue;
        k.lathe({
          name: `peg${ti}${i}`, mat: 'oak', segs: q(7, 5, 4),
          profile: profile([[0.008, 0], [0.008, PEG.len - 0.018], [0.013, PEG.len - 0.007, s], [0, PEG.len + 0.004]]),
          xf: xf({ pos: [0, tier.y, 0], rot: toward(az, PEG.elev) }),
        });
      }
    });

    // —— 毡帽：扣在顶上的球上，微微歪一点 ——
    const hatPlace = xf({ pos: [0.004, POLE.top - 0.058, 0.006], rot: [0.05, 0.6, -0.08] });
    k.lathe({
      name: 'hat', mat: 'felt', segs: q(16, 12, 8),
      profile: profile([
        [0.086, -0.004], [0.155, -0.003, s], [0.162, 0.003, { r: q(0.003, 0), segs: 1 }], [0.14, 0.009, s], [0.1, 0.009, s],
        [0.087, 0.013, s], [0.085, 0.07, s], [0.075, 0.104, s], [0.04, 0.116, s], [0, 0.118],
      ]),
      xf: hatPlace,
    });
    k.lathe({ name: 'hatBand', mat: 'leather', segs: q(16, 12, 8), profile: profile([[0.0872, 0.013], [0.0868, 0.034]]), xf: hatPlace });
    if (k.lod < 2) k.lathe({ name: 'hatLining', mat: 'leather', segs: q(12, 8), profile: profile([[0.086, -0.004], [0, -0.004]]), xf: hatPlace });

    // —— 托特包：挂在第二层朝左前方的那根钩上 ——
    {
      const az = pegs[5].az, y = pegs[5].y;
      const bs = [0.34, 0.37, 0.09], bh = bs.map((v) => v / 2);
      const top = y - 0.26; // 包口
      const center = at(az, POLE.r + 0.05, top - bh[1]);
      // 上口被提手收窄、下面鼓起来、底比口宽一点
      const bulge = puffDeform(bh, { sideZ: 0.014, side: 0.004 });
      const bag = (p) => {
        const d = bulge(p);
        const down = (bh[1] - p[1]) / (2 * bh[1]); // 0 在包口，1 在包底
        return [d[0] * (0.93 + 0.07 * down), d[1], d[2] * (0.38 + 0.62 * smoothstep(0, 0.6, down))];
      };
      k.box({
        name: 'tote', mat: 'canvas', size: bs, r: q(0.018, 0.014, 0.01), segs: q(2, 1, 1), div: q([2, 3, 1], [1, 2, 1], 1),
        deform: bag, omit: ['py'],
        xf: xf({ pos: center, rot: [0, az, 0] }),
      });
      // 提手：包口两侧拱上去、绕过挂钩根部
      if (k.lod < 2) {
        const root = at(az, POLE.r + 0.012, y + 0.036); // 搭在钩的根部上面
        for (const side of [-1, 1]) {
          const off = side * 0.022; // 前后两条提手
          const ends = [-0.075, 0.075].map((t) => {
            const p = at(az, POLE.r + 0.05 + off, top - 0.01, t);
            return p;
          });
          const peak = [root[0] + radial(az)[0] * off * 0.3, root[1], root[2] + radial(az)[2] * off * 0.3];
          k.sweep({
            name: `handle${side > 0 ? 'F' : 'B'}`, mat: 'leather', shape: rect(0.022, 0.004), caps: [true, true], up: radial(az),
            path: roundedPath([ends[0], peak, ends[1]], 0.03, q(4, 2)),
          });
        }
      }
    }

    // —— 围巾：绕立柱一圈（从正面经过背后绕回来），两头垂在右前方 ——
    //    截面是一条带两道褶的波浪线（单层、双面材质）：垂下来的两头有垂坠的褶，不是一块平板
    {
      const az = deg(40), y = 1.3, R = POLE.r + 0.0075;
      const polar = (a, r, yy) => [Math.sin(a) * r, yy, Math.cos(a) * r];
      const n = q(8, 5, 3);
      const wrap = [];
      for (let i = 0; i <= n; i++) {
        const a = az - deg(40) - (deg(280) * i) / n;
        wrap.push(polar(a, R, y + 0.012 * (i / n)));
      }
      // 两头往两边分开垂下来，中段各自往外飘一点
      const pts = [
        polar(az - deg(30), 0.07, 0.86), polar(az - deg(33), 0.052, 1.05), polar(az - deg(32), 0.04, 1.22), ...wrap,
        polar(az + deg(32), 0.042, 1.24), polar(az + deg(38), 0.056, 1.12), polar(az + deg(42), 0.07, 1.0),
      ];
      const rad = pts.map((_, i) => (i === 2 || i === pts.length - 3 ? 0.04 : 0));
      const nw = q(8, 5, 3), wave = [];
      for (let i = 0; i <= nw; i++) {
        const t = i / nw;
        wave.push([0.008 * Math.sin(t * Math.PI * 4) * (k.lod < 2 ? 1 : 0), -0.065 + 0.13 * t, i && i < nw ? { smooth: true } : {}]);
      }
      k.sweep({
        name: 'scarf', mat: 'linen_mustard', shape: profile(wave), caps: [false, false],
        up: tangent(az - deg(30)), path: roundedPath(pts, rad, q(2, 1, 1)), maxChart: 1.2,
      });
    }
  },
};
