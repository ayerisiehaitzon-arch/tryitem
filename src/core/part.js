import { cross, sub, dot, norm, add } from './vec.js';

// Part：一个部件的局部网格（单一材质）。
// 顶点属性：
//   P  位置（米）
//   N  法线
//   T  UV0（米，最终除以材质贴图的物理尺寸）——材质贴图坐标，木纹方向沿 u
//   C  图块（chart）索引 —— 用于第二套 UV（烘焙 AO 用的唯一展开）
//   U  图块内归一化坐标 [0,1]²
export class Part {
  constructor(mat, name) {
    this.mat = mat;
    this.name = name;
    this.P = [];
    this.N = [];
    this.T = [];
    this.C = [];
    this.U = [];
    this.I = [];
  }

  v(p, n, t, chart, u) {
    this.P.push(p);
    this.N.push(norm(n));
    this.T.push(t);
    this.C.push(chart);
    this.U.push(u);
    return this.P.length - 1;
  }

  // 三角形：自动根据顶点法线修正绕序（外侧为正面）；退化三角形直接丢弃
  tri(a, b, c) {
    const P = this.P;
    const g = cross(sub(P[b], P[a]), sub(P[c], P[a]));
    const area2 = Math.hypot(g[0], g[1], g[2]);
    if (area2 < 1e-12) return;
    const nsum = add(add(this.N[a], this.N[b]), this.N[c]);
    if (dot(g, nsum) >= 0) this.I.push(a, b, c);
    else this.I.push(a, c, b);
  }

  // 四边形：沿较短对角线切分，得到更饱满的三角形
  quad(a, b, c, d) {
    const P = this.P;
    const d1 = dist2(P[a], P[c]);
    const d2 = dist2(P[b], P[d]);
    if (d1 <= d2) {
      this.tri(a, b, c);
      this.tri(a, c, d);
    } else {
      this.tri(a, b, d);
      this.tri(b, c, d);
    }
  }

  transform(x) {
    this.P = this.P.map((p) => x.apply(p));
    this.N = this.N.map((n) => norm(x.applyDir(n)));
    if (x.det() < 0) {
      for (let i = 0; i < this.I.length; i += 3) {
        const t = this.I[i + 1];
        this.I[i + 1] = this.I[i + 2];
        this.I[i + 2] = t;
      }
    }
    return this;
  }

  // 任意光滑形变 f: R³→R³。法线用雅可比矩阵的逆转置变换（数值差分）。
  // 这让“鼓起来的软垫”之类的造型在很少的顶点下依然有正确、柔和的明暗。
  deform(f, h = 1e-4) {
    const P2 = [];
    const N2 = [];
    for (let i = 0; i < this.P.length; i++) {
      const p = this.P[i];
      const J = [];
      for (let k = 0; k < 3; k++) {
        const pa = [...p], pb = [...p];
        pa[k] += h;
        pb[k] -= h;
        const fa = f(pa), fb = f(pb);
        J.push([(fa[0] - fb[0]) / (2 * h), (fa[1] - fb[1]) / (2 * h), (fa[2] - fb[2]) / (2 * h)]);
      }
      // J 的列为 ∂f/∂x_k；逆转置作用于法线 = cof(J) · n
      const c0 = J[0], c1 = J[1], c2 = J[2];
      const r0 = cross(c1, c2), r1 = cross(c2, c0), r2 = cross(c0, c1);
      const n = this.N[i];
      const nn = [
        r0[0] * n[0] + r1[0] * n[1] + r2[0] * n[2],
        r0[1] * n[0] + r1[1] * n[1] + r2[1] * n[2],
        r0[2] * n[0] + r1[2] * n[1] + r2[2] * n[2],
      ];
      P2.push(f(p));
      N2.push(norm(nn));
    }
    this.P = P2;
    this.N = N2;
    return this;
  }
}

function dist2(a, b) {
  return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
}
