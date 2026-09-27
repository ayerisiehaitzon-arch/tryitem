// 极简向量 / 变换工具。所有向量都是普通数组，方便序列化与调试。

export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const len = (a) => Math.hypot(a[0], a[1], a[2]);
export const norm = (a) => {
  const l = len(a);
  return l > 1e-12 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 1, 0];
};
export const lerp = (a, b, t) => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
export const madd = (a, b, s) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];

export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

// 3x3 行主序矩阵 + 平移。只支持刚体变换和镜像（det = ±1），
// 这样法线可以直接用同一个矩阵变换。
export class Xform {
  constructor(m = [1, 0, 0, 0, 1, 0, 0, 0, 1], t = [0, 0, 0]) {
    this.m = m;
    this.t = t;
  }
  static rot(rx = 0, ry = 0, rz = 0) {
    const cx = Math.cos(rx), sx = Math.sin(rx);
    const cy = Math.cos(ry), sy = Math.sin(ry);
    const cz = Math.cos(rz), sz = Math.sin(rz);
    // R = Rz * Ry * Rx（先绕 X，再绕 Y，再绕 Z）
    const X = [1, 0, 0, 0, cx, -sx, 0, sx, cx];
    const Y = [cy, 0, sy, 0, 1, 0, -sy, 0, cy];
    const Z = [cz, -sz, 0, sz, cz, 0, 0, 0, 1];
    return new Xform(mul3(Z, mul3(Y, X)));
  }
  static at(p) {
    return new Xform(undefined, [...p]);
  }
  static mirror(axis) {
    const m = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    m[axis * 4] = -1;
    return new Xform(m);
  }
  // this ∘ o：先 o，再 this
  mul(o) {
    return new Xform(mul3(this.m, o.m), this.apply(o.t));
  }
  applyDir(v) {
    const m = this.m;
    return [
      m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
      m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
      m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
    ];
  }
  apply(p) {
    return add(this.applyDir(p), this.t);
  }
  det() {
    const m = this.m;
    return (
      m[0] * (m[4] * m[8] - m[5] * m[7]) -
      m[1] * (m[3] * m[8] - m[5] * m[6]) +
      m[2] * (m[3] * m[7] - m[4] * m[6])
    );
  }
}

function mul3(a, b) {
  const r = new Array(9);
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
      r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
  return r;
}

// 便捷构造：（可选）先在局部空间沿某轴镜像，再旋转（XYZ 欧拉角，弧度），最后平移
export function xf({ pos = [0, 0, 0], rot = [0, 0, 0], mirror = null } = {}) {
  let x = Xform.rot(rot[0], rot[1], rot[2]);
  if (mirror !== null && mirror !== undefined) x = x.mul(Xform.mirror(mirror));
  x.t = [...pos];
  return x;
}

// 确定性伪随机数（mulberry32），保证每次构建结果一致
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
