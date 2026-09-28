import { shape } from '../core/shape.js';
import { xf } from '../core/vec.js';
import { SLAB, SLAB_BOX, slabFront, slabBack } from './slab.js';
import { slabUV } from '../materials/atlas.js';
import { teapot, cup, pitcher, kettle, tray, jar, toolHolder } from './teaware.js';

// 原木大板茶桌：一块 1.62m 的黑胡桃大板，架在两片板足上，桌上一整套茶席。
//   · 桌面是 tea/slab.js 的轮廓（两条自然边 + 两头锯平）往上挤出 6.5cm，顶上一圈 12mm 的圆边；
//     贴图是整块桌面一张：每个三角形按朝向分到俯视的桌面、前后两条自然边（u 沿边的弧长）、两头端面（年轮的弧）上，
//     白边、树结、裂缝和两枚枫木蝴蝶榫都画在它们的确切位置上；
//   · 两片板足：底下挖出一道弧形的壸门，脚往外微微张开；一根穿带横穿两片板足，出头的榫上各插一枚楔子；
//   · 茶席（主人坐在 -z 一侧，客人在 +z）：乌金石茶盘上一把西施紫砂壶、一只玻璃公道杯、四只哥窑品茗杯；
//     主人右手边（-x）是电陶炉上的一把平丸铁壶，左手边是青花茶叶罐、湘妃竹茶道筒和一块叠好的茶巾。
// 原点在桌子的中心（地面上）
const { L, T, top: TOP } = SLAB;
const Y0 = TOP - T;
const clamp01 = (v) => Math.min(1, Math.max(0, v));

// 自然边上某个 x 处的弧长占比（侧面贴图的 u）
function arcTable(f) {
  const n = 400, S = [0];
  let p = [-L / 2, f(0)];
  for (let i = 1; i <= n; i++) {
    const t = i / n, q = [-L / 2 + L * t, f(t)];
    S.push(S[i - 1] + Math.hypot(q[0] - p[0], q[1] - p[1]));
    p = q;
  }
  return (x) => {
    const t = clamp01((x + L / 2) / L) * n, i = Math.min(n - 1, Math.floor(t));
    return (S[i] + (S[i + 1] - S[i]) * (t - i)) / S[n];
  };
}

// 按三角形重新给 UV：每个三角形各用自己的三个顶点（同一张贴图的不同区域之间不会拉出一条斜带），
// 贴图区域由三角形的平均法线和中心决定；完全相同的顶点在导出前会重新焊上
function retex(part, uvOf) {
  const P = [], N = [], TT = [], C = [], U = [], I = [];
  for (let i = 0; i < part.I.length; i += 3) {
    const ids = [part.I[i], part.I[i + 1], part.I[i + 2]];
    const n = [0, 0, 0], c = [0, 0, 0];
    for (const j of ids) for (let a = 0; a < 3; a++) { n[a] += part.N[j][a]; c[a] += part.P[j][a] / 3; }
    const l = Math.hypot(...n) || 1;
    const f = uvOf(c, n.map((v) => v / l));
    for (const j of ids) {
      P.push(part.P[j]); N.push(part.N[j]); TT.push(f(part.P[j])); C.push(part.C[j]); U.push(part.U[j]);
      I.push(P.length - 1);
    }
  }
  Object.assign(part, { P, N, T: TT, C, U, I });
}

export default {
  id: 'tea_table',
  name: '原木茶桌',
  nameEn: 'Live-Edge Walnut Tea Table',
  category: 'tea',
  aoDensity: 150,
  shadow: { margin: 0.2, maxDist: 0.45, density: 80 },
  view: { el: 26, az: 24, dist: 0.9 },
  build(k) {
    const q = (...v) => k.q(...v);

    // —— 桌面：轮廓往上挤出，顶上一圈圆边 ——
    {
      // 沿板长取点：均匀取点，前沿那道凹口（t ≈ 0.62）附近再加密几个
      const n = q(48, 26, 14);
      const ts = Array.from({ length: n + 1 }, (_, i) => i / n);
      const tf = k.lod < 2 ? [...ts, 0.598, 0.608, 0.62, 0.632, 0.642].sort((a, b) => a - b) : ts;
      const sm = { smooth: true }, corner = { r: q(0.004, 0.003, 0), segs: 1 };
      const pts = [
        ...tf.map((t, i) => [-L / 2 + L * t, -slabFront(t), i === 0 || i === tf.length - 1 ? corner : sm]),
        ...[...ts].reverse().map((t, i) => [-L / 2 + L * t, -slabBack(t), i === 0 || i === ts.length - 1 ? corner : sm]),
      ];
      const part = k.extrude({
        name: 'slab', mat: 'slab', shape: shape(pts), depth: T, axis: 'y',
        bevel: [0, { w: q(0.012, 0.01, 0.008), h: q(0.012, 0.01, 0.008) }], bsegs: q(3, 2, 1),
        density: { cap0: 0.3 }, xf: xf({ pos: [0, Y0, 0] }),
      });
      const B = SLAB_BOX;
      const topUV = (p) => slabUV('top', (p[0] - B.x0) / (B.x1 - B.x0), (p[2] - B.z0) / (B.z1 - B.z0));
      const sF = arcTable(slabFront), sB = arcTable(slabBack);
      retex(part, (c, nn) => {
        if (Math.abs(nn[1]) > 0.55) return topUV;
        const d = (p) => clamp01((TOP - p[1]) / T);
        if (Math.abs(nn[0]) > 0.7 && Math.abs(c[0]) > L / 2 - 0.03) {
          const t = c[0] < 0 ? 0 : 1, zb = slabBack(t), zf = slabFront(t);
          return (p) => slabUV(t ? 'endR' : 'endL', clamp01((p[2] - zb) / (zf - zb)), d(p));
        }
        return c[2] > 0 ? (p) => slabUV('edgeF', sF(p[0]), d(p)) : (p) => slabUV('edgeB', sB(p[0]), d(p));
      });
    }

    // —— 两片板足：底下一道弧形的壸门，脚往外张开一点；顶上顶着桌面 ——
    {
      const H = Y0, wt = 0.22, wb = 0.25, ax = 0.165, ah = 0.05;
      const na = q(10, 6, 3);
      const arch = [];
      for (let i = 0; i <= na; i++) {
        const a = Math.PI * (1 - i / na);
        const o = i === 0 || i === na ? { r: q(0.006, 0.004, 0), segs: q(2, 1, 1) } : { smooth: true };
        arch.push([ax * Math.cos(a), ah * Math.sin(a), o]);
      }
      const foot = { r: q(0.008, 0.005, 0), segs: q(2, 1, 1) }, head = { r: q(0.01, 0.006, 0), segs: q(2, 1, 1) };
      const leg = shape([[-wb, 0, foot], ...arch, [wb, 0, foot], [wt, H, head], [-wt, H, head]]);
      for (const s of [-1, 1]) {
        k.extrude({
          name: `leg${s > 0 ? 'R' : 'L'}`, mat: 'walnut', shape: leg, depth: 0.06, axis: 'x', center: true,
          bevel: q(0.006, 0.004, 0.002), bsegs: q(2, 1, 1), grain: 'across', capAngle: Math.PI / 2,
          xf: xf({ pos: [s * 0.52, 0, 0] }),
        });
      }
      // 穿带：横穿两片板足，两头出头，各插一枚楔子
      const yb = 0.105;
      k.box({ name: 'stretcher', mat: 'walnut', size: [1.16, 0.05, 0.034], r: q(0.004, 0.003, 0), segs: q(2, 1, 0), grain: 'x', xf: xf({ pos: [0, yb, 0] }) });
      for (const s of [-1, 1]) {
        k.box({ name: `wedge${s > 0 ? 'R' : 'L'}`, mat: 'rosewood', size: [0.009, 0.072, 0.022], r: q(0.002, 0), segs: q(1, 0), grain: 'y', xf: xf({ pos: [s * 0.566, yb + 0.004, 0] }) });
      }
    }

    // —— 茶席 ——
    const XT = -0.04, ZT = -0.07;
    tray(k, 'tray', xf({ pos: [XT, TOP, ZT] }));
    const YT = TOP + 0.028;
    teapot(k, 'teapot', xf({ pos: [XT - 0.15, YT, ZT - 0.045] }));
    pitcher(k, 'pitcher', xf({ pos: [XT + 0.02, YT, ZT - 0.05], rot: [0, -Math.PI / 2, 0] }));
    for (let i = 0; i < 4; i++) cup(k, `cup${i}`, xf({ pos: [XT - 0.12 + i * 0.08, YT, ZT + 0.072] }));
    kettle(k, 'kettle', xf({ pos: [-0.55, TOP, -0.12], rot: [0, 0.12, 0] }));
    jar(k, 'caddy', xf({ pos: [0.37, TOP, -0.2] }), 0.85);
    toolHolder(k, 'tools', xf({ pos: [0.53, TOP, -0.11] }));
    // 茶巾：叠成长方的亚麻布，折边圆鼓鼓的，面上压出一道道软褶
    k.box({
      name: 'towel', mat: 'linen_sage', size: [0.13, 0.011, 0.085], r: q(0.0055, 0.004, 0), segs: q(2, 1, 0), div: q([4, 1, 3], [2, 1, 1], 1), omit: ['ny'],
      deform: (p) => {
        const top = p[1] > 0 ? 1 : 0;
        return [p[0], p[1] + top * (0.0012 * Math.sin(p[0] * 70 + 1) * Math.cos(p[2] * 40) - 0.0008 * (p[0] / 0.065) ** 2), p[2] + 0.0015 * Math.sin(p[0] * 30)];
      },
      xf: xf({ pos: [0.37, TOP + 0.0055, -0.03], rot: [0, 0.18, 0] }),
    });
  },
};
