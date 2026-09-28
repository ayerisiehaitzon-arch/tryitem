import { rect, circle, profile } from '../core/shape.js';
import { xf } from '../core/vec.js';
import { roundedPath } from '../core/path.js';
import { YOGA } from '../materials/atlas.js';

// 瑜伽垫：一张 183 × 61cm、5mm 厚的天然橡胶垫，大半张平铺在地上，一头还卷着没摊开；
// 垫子上一块平放、一块立着的软木瑜伽砖，一条本色棉的拉伸带卷成一卷立着（最外面一头挂着 D 形环），垫子旁边一只不锈钢水壶。
//   · 垫子是一条扫掠：路径沿地面铺开，到头以后顺着一条阿基米德螺线往里卷（每卷一圈半径小一个垫子厚度加一点缝），
//     截面是一个 61cm × 5mm 的矩形 —— 正面、背面、两条切边各是一次单独的扫掠（各用贴图里自己的一块：
//     正面印对位线、背面深一号带防滑波纹、切边上半正面色下半背面色），所以卷起来的那头，侧面看得见一圈圈双色的螺旋；
//   · 贴图 u 沿垫子的长：路径的弧长正好是整张垫子的长，平铺的正面上看得见完整的中线、梯子和垫头的小圆标。
// 原点在垫子平铺那一段的中心（地面上），垫子沿 x，卷着的那头在 +x
const { L, W, T } = YOGA;
const ROLL = { R: 0.045, turns: 1.8, gap: 0.0015, per: 16 };

export default {
  id: 'yoga_mat',
  name: '瑜伽垫',
  nameEn: 'Yoga Mat with Cork Blocks & Strap',
  category: 'gym',
  aoDensity: 200,
  shadow: { margin: 0.12, maxDist: 0.3, density: 90 },
  view: { el: 34, az: 20 },
  build(k) {
    const q = (...v) => k.q(...v);

    // —— 垫子的路径：平铺的一段 + 卷起来的一段（螺线），总弧长 = 垫子长 ——
    const R = ROLL, dr = (T + R.gap) / (2 * Math.PI);
    const phiMax = 2 * Math.PI * R.turns;
    const rollLen = R.R * phiMax - (dr * phiMax * phiMax) / 2;
    const flat = L - rollLen;
    const x0 = -L / 2, x1 = x0 + flat; // 平铺段的起点、卷起来的地方
    const yc = T / 2;
    const path = [[x0, yc, 0], [x0 + flat * 0.5, yc, 0], [x1, yc, 0]];
    const nr = Math.round(R.turns * q(R.per, 10, 6));
    for (let i = 1; i <= nr; i++) {
      const phi = (phiMax * i) / nr, r = R.R - dr * phi;
      path.push([x1 + r * Math.sin(phi), yc + R.R - r * Math.cos(phi), 0]);
    }
    // 路径的累计弧长（贴图 u）
    const S = [0];
    for (let i = 1; i < path.length; i++) S.push(S[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]));
    const total = S[S.length - 1];
    // 平铺段的中心放在原点
    const cx = (x0 + x1) / 2;
    const place = xf({ pos: [-cx, 0, 0] });
    // 四个面：正面、背面、两条切边（截面坐标：x 横跨垫子宽，y 是厚度方向；开放轮廓的外法线在行进方向右侧）
    const faces = [
      { name: 'matTop', pts: [[W / 2, T / 2], [-W / 2, T / 2]], v: (sa) => YOGA.top[0] + (YOGA.top[1] - YOGA.top[0]) * (sa / W) },
      { name: 'matBack', pts: [[-W / 2, -T / 2], [W / 2, -T / 2]], v: (sa) => YOGA.bottom[0] + (YOGA.bottom[1] - YOGA.bottom[0]) * (sa / W) },
      { name: 'matEdgeR', pts: [[W / 2, -T / 2], [W / 2, T / 2]], v: (sa) => YOGA.edge[0] + (1 - YOGA.edge[0]) * (1 - sa / T) },
      { name: 'matEdgeL', pts: [[-W / 2, T / 2], [-W / 2, -T / 2]], v: (sa) => YOGA.edge[0] + (1 - YOGA.edge[0]) * (sa / T) },
    ];
    for (const f of faces) {
      const part = k.sweep({ name: f.name, mat: 'yoga', shape: profile(f.pts), caps: [false, false], up: [0, 1, 0], path, maxChart: 2 });
      // 扫掠给的 T = [路径弧长, 截面弧长]（米）→ 整张贴图的 [u, v]
      part.T = part.T.map(([s, sa]) => [Math.min(1, s / total), f.v(sa)]);
      part.transform(place);
    }

    // —— 两块软木瑜伽砖（23 × 15 × 7.5cm）：一块平放在垫子上，一块立着 ——
    const block = (name, size, pos, rot) => k.box({
      name, mat: 'cork', size, r: q(0.008, 0.006, 0.003), segs: q(2, 1, 1), grain: 'x',
      omit: ['ny'], xf: xf({ pos, rot }),
    });
    block('blockA', [0.23, 0.075, 0.15], [-0.62, T + 0.0375, -0.13], [0, 0.35, 0]);
    block('blockB', [0.23, 0.15, 0.075], [-0.62, T + 0.075, 0.12], [0, -0.2, 0]);

    // —— 拉伸带：收起来卷成一卷，侧立在垫子上（带子一圈圈往外绕的一条螺线），最外面一头挂着两只不锈钢 D 形环 ——
    {
      const c = [-0.3, 0, -0.12], bw = 0.038, th = 0.002, pitch = 0.0034, r0 = 0.012;
      const turns = q(4, 3, 2), per = q(10, 8, 6);
      const pts = [];
      for (let i = 0; i <= turns * per; i++) {
        const a = (2 * Math.PI * i) / per, r = r0 + (pitch * i) / per;
        pts.push([c[0] + r * Math.cos(a), T + bw / 2, c[2] + r * Math.sin(a)]);
      }
      k.sweep({ name: 'strap', mat: 'linen', shape: rect(th, bw), caps: [true, true], up: [0, 1, 0], path: pts });
      if (k.lod < 2) {
        // D 形环：立在带子的这一头，直边沿带宽（竖着），半圆沿带子往外伸
        const e = pts[pts.length - 1], p = pts[pts.length - 2];
        const tl = Math.hypot(e[0] - p[0], e[2] - p[2]), t = [(e[0] - p[0]) / tl, 0, (e[2] - p[2]) / tl];
        for (let i = 0; i < 2; i++) {
          const o = 0.004 + i * 0.005;
          const m = q(7, 5), d = [];
          for (let j = 0; j <= m; j++) {
            const a = -Math.PI / 2 + (Math.PI * j) / m, s = o + 0.013 * Math.cos(a), y = e[1] + 0.021 * Math.sin(a);
            d.push([e[0] + t[0] * s, y, e[2] + t[2] * s]);
          }
          k.sweep({
            name: `ring${i}`, mat: 'stainless', shape: circle(0.0022, q(5, 4)), closed: true, caps: [false, false], up: [-t[2], 0, t[0]], path: d,
          });
        }
      }
    }

    // —— 不锈钢保温水壶：拉丝钢瓶身，黑色瓶盖带一个提环 ——
    {
      const place = xf({ pos: [-0.34, 0, 0.42], rot: [0, 0.6, 0] });
      const s = { smooth: true };
      k.lathe({
        name: 'bottle', mat: 'stainless', segs: q(16, 10, 8),
        profile: profile([[0.03, 0], [0.036, 0.004, { r: 0.003, segs: 1 }], [0.036, 0.2, s], [0.03, 0.225, s], [0.022, 0.235], [0.022, 0.24]]),
        xf: place,
      });
      k.lathe({
        name: 'bottleCap', mat: 'plastic_black', segs: q(14, 10, 8),
        profile: profile([[0.0235, 0], [0.0235, 0.03, { r: 0.004, segs: 1 }], [0, 0.032]]),
        xf: place.mul(xf({ pos: [0, 0.236, 0] })),
      });
      if (k.lod < 2) {
        k.sweep({
          name: 'bottleLoop', mat: 'plastic_black', shape: rect(0.006, 0.01), caps: [false, false], up: [1, 0, 0],
          path: roundedPath([[0, 0.262, -0.012], [0, 0.29, -0.012], [0, 0.29, 0.012], [0, 0.262, 0.012]], 0.01, 2).map((p) => place.apply(p)),
        });
      }
    }
  },
};
