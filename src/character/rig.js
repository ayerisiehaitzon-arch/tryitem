// 骨骼和姿势：在控制网格这一层做线性混合蒙皮（每个控制点最多受两三根骨头影响），摆好姿势以后再拟合、细分，
// 关节处自然是光滑的；衣服是从“摆好姿势的身体”上推出来的，跟着一起动；头发、眼睛、眉毛跟着头这根骨头整体走。
//
// 静止姿势就是建模时的姿势：站直，两臂自然下垂。姿势 = 各关节相对静止姿势的旋转（度，绕世界坐标轴：
// x 前后弯、y 拧转、z 侧摆；左边的关节写好以后右边镜像）。

import { subdivide } from './subdiv.js';

export const JOINTS = ['pelvis', 'spine', 'chest', 'neck', 'head', 'shoulderL', 'elbowL', 'wristL', 'shoulderR', 'elbowR', 'wristR', 'hipL', 'kneeL', 'ankleL', 'hipR', 'kneeR', 'ankleR'];
const J = Object.fromEntries(JOINTS.map((n, i) => [n, i]));
const PARENT = [-1, J.pelvis, J.spine, J.chest, J.neck, J.chest, J.shoulderL, J.elbowL, J.chest, J.shoulderR, J.elbowR, J.pelvis, J.hipL, J.kneeL, J.pelvis, J.hipR, J.kneeR];

// 关节在静止姿势下的位置
export function restJoints(L, head) {
  const P = new Array(JOINTS.length);
  const tor = (t) => L.crotch + t * (L.notch - L.crotch);
  P[J.pelvis] = [0, L.crotch + 0.1 * L.k, 0];
  P[J.spine] = [0, tor(0.32), -0.01];
  P[J.chest] = [0, tor(0.68), -0.02];
  P[J.neck] = [0, L.notch + 0.012, -0.024];
  const { O, g } = head;
  P[J.head] = [O[0], O[1] - 0.05 * g, O[2] - 0.03 * g];
  for (const [sd, sh, el, wr, hp, kn, an] of [[1, 'shoulderL', 'elbowL', 'wristL', 'hipL', 'kneeL', 'ankleL'], [-1, 'shoulderR', 'elbowR', 'wristR', 'hipR', 'kneeR', 'ankleR']]) {
    const s = L.side(sd);
    P[J[sh]] = s.Js; P[J[el]] = s.Je; P[J[wr]] = s.Jw;
    P[J[hp]] = s.Jh; P[J[kn]] = s.Jk; P[J[an]] = s.Ja;
  }
  return P;
}

// 每个控制点的骨骼权重（只和拓扑有关，建一次）
export function skinWeights(topo) {
  const n = topo.n;
  const W = Array.from({ length: n }, () => null);
  const set = (v, ...pairs) => { if (v >= 0) W[v] = pairs; };
  const all = (x, ...pairs) => (Array.isArray(x) ? x.forEach((y) => all(y, ...pairs)) : set(x, ...pairs));
  // 躯干一圈圈从骨盆过渡到胸
  const rowW = [
    [[J.pelvis, 1]], [[J.pelvis, 1]], [[J.pelvis, 0.55], [J.spine, 0.45]], [[J.spine, 1]], [[J.spine, 0.5], [J.chest, 0.5]],
    [[J.chest, 1]], [[J.chest, 1]], [[J.chest, 1]], [[J.chest, 1]], [[J.chest, 1]], [[J.chest, 1]], [[J.chest, 0.55], [J.neck, 0.45]],
  ];
  topo.T.forEach((ring, r) => ring.forEach((v) => set(v, ...rowW[r])));
  set(topo.X, [J.pelvis, 1]);
  topo.N[0].forEach((v) => set(v, [J.chest, 0.35], [J.neck, 0.65]));
  topo.N[1].forEach((v) => set(v, [J.neck, 1]));
  topo.N[2].forEach((v) => set(v, [J.neck, 0.45], [J.head, 0.55]));
  all(topo.H, [J.head, 1]); all(topo.cap, [J.head, 1]); all(topo.eyes, [J.head, 1]); all(topo.mouth, [J.head, 1]); all(topo.ears, [J.head, 1]);
  topo.arms.forEach((arm, si) => {
    const [sh, el, wr] = si === 0 ? [J.shoulderL, J.elbowL, J.wristL] : [J.shoulderR, J.elbowR, J.wristR];
    arm.A[0].forEach((v, k) => set(v, [J.chest, k === 6 ? 0.75 : 0.55], [sh, k === 6 ? 0.25 : 0.45]));
    arm.A[1].forEach((v) => set(v, [J.chest, 0.22], [sh, 0.78]));
    for (let i = 2; i <= 4; i++) arm.A[i].forEach((v) => set(v, [sh, 1]));
    arm.A[5].forEach((v) => set(v, [sh, 0.5], [el, 0.5]));
    for (let i = 6; i <= 8; i++) arm.A[i].forEach((v) => set(v, [el, 1]));
    arm.A[9].forEach((v) => set(v, [el, 0.5], [wr, 0.5]));
    all(arm.P, [wr, 1]); all(arm.fingers.map((f) => f.slice(1)), [wr, 1]); all(arm.thumb.slice(1), [wr, 1]);
  });
  // 肩膀上方那几列（T9、T10 靠近胳膊洞的点）带一点上臂，抬胳膊时肩头跟着鼓起来
  topo.arms.forEach((arm, si) => {
    const sh = si === 0 ? J.shoulderL : J.shoulderR;
    const cols = si === 0 ? [3, 7] : [17, 13];
    for (const r of [9, 10]) for (const j of cols) { const v = topo.T[r][j]; if (v >= 0) set(v, [J.chest, 0.82], [sh, 0.18]); }
  });
  topo.legs.forEach((leg, si) => {
    const [hp, kn, an] = si === 0 ? [J.hipL, J.kneeL, J.ankleL] : [J.hipR, J.kneeR, J.ankleR];
    leg.L[1].forEach((v) => set(v, [J.pelvis, 0.35], [hp, 0.65]));
    for (let i = 2; i <= 4; i++) leg.L[i].forEach((v) => set(v, [hp, 1]));
    leg.L[5].forEach((v) => set(v, [hp, 0.5], [kn, 0.5]));
    for (let i = 6; i <= 9; i++) leg.L[i].forEach((v) => set(v, [kn, 1]));
    leg.L[10].forEach((v) => set(v, [kn, 0.5], [an, 0.5]));
    all(leg.F.slice(1), [an, 1]); all(leg.toe, [an, 1]);
  });
  const idx = new Uint8Array(n * 3), w = new Float32Array(n * 3);
  for (let v = 0; v < n; v++) {
    const pairs = W[v] ?? [[J.chest, 1]];
    pairs.forEach(([j, ww], k) => { idx[v * 3 + k] = j; w[v * 3 + k] = ww; });
  }
  return { idx, w };
}

// —— 姿势 ——
// j：躯干、头、腿的关节旋转（度，绕世界坐标轴 x 前后、y 拧、z 侧摆；左边写了、右边没写的自动镜像）
// ik：胳膊用两段式反向运动学 —— 只说手腕放在哪（身体坐标，B 是量体数据）、手肘朝哪边（pole），
//     肩、肘的旋转自己解出来；twist 是手腕绕前臂再拧多少度（打招呼时掌心朝前）
//     dir / palm：手腕再弯一下，手指指向 dir、掌心朝 palm（胸腔坐标，左手；右手镜像）
const flipX = (v) => v && [-v[0], v[1], v[2]];
const mirrorIK = (o) => ({ ...o, hand: (B) => { const h = o.hand(B); return [-h[0], h[1], h[2]]; }, pole: flipX(o.pole), twist: -(o.twist ?? 0), dir: flipX(o.dir), palm: flipX(o.palm) });
const HIPS = { hand: (B) => [B.waistW + 0.035, B.waistY - 0.04, -0.015], pole: [1, 0.1, -0.55], dir: [-0.3, -0.55, 0.78], palm: [-1, 0, 0.1] };
// 插兜：手腕停在裤兜口（胯前外侧的表面上），手往下、往里斜着插进去 —— 手指藏在裤子下面，只露出手腕和手背
const POCKET = { hand: (B) => [B.hipW * 0.81 - 0.011, B.crotch + 0.13, B.hipDF * 0.68 - 0.015], pole: [0.75, -0.1, -1], dir: [-0.35, -1, -0.34], palm: [-0.6, 0, -0.8] };
// （静止姿势都 ground：骨盆一歪、一条腿一弯，最低的那只脚还是踩在地上）
export const POSES = {
  stand: { label: '站立', j: {} },
  relaxed: {
    label: '稍息', sym: false,
    j: { pelvis: [0, 4, -4], spine: [0, -2, 3], chest: [0, -3, 2], head: [0, 6, 4], hipR: [-6, 0, -4], kneeR: [14, 0, 0], ankleR: [-8, 0, 0], shoulderL: [4, 0, 4], elbowL: [-12, 0, 0], shoulderR: [-4, 0, 6], elbowR: [-8, 0, 0] },
  },
  hips: { label: '叉腰', j: { chest: [-3, 0, 0], head: [-3, 0, 0] }, ik: { L: HIPS, R: mirrorIK(HIPS) } },
  pockets: { label: '插兜', j: { chest: [-2, 0, 0], head: [-2, 0, 0] }, ik: { L: POCKET, R: mirrorIK(POCKET) } },
  wave: {
    label: '打招呼', sym: false,
    j: { head: [2, -8, 4], chest: [0, -4, 2], pelvis: [0, 0, 2], shoulderL: [2, 0, 4], elbowL: [-10, 0, 0] },
    ik: { R: { hand: (B) => [-(B.shoulderW + 0.15), B.chin + 0.02, 0.07], pole: [-0.55, -1, -0.1], twist: -80 } },
  },
  think: {
    label: '托腮', sym: false,
    j: { head: [7, -6, -5], chest: [4, 0, 0] },
    ik: {
      R: { hand: (B) => [-0.022, B.chin - 0.012, 0.11], pole: [-0.25, -1, 0.15], twist: 30 },
      L: { hand: (B) => [-0.07, B.chestY - 0.07, 0.17], pole: [0.7, -1, 0.15] },
    },
  },
};

for (const p of Object.values(POSES)) p.ground = true;

const D2R = Math.PI / 180;
function rotXYZ([ax, ay, az]) {
  const x = ax * D2R, y = ay * D2R, z = az * D2R;
  const cx = Math.cos(x), sx = Math.sin(x), cy = Math.cos(y), sy = Math.sin(y), cz = Math.cos(z), sz = Math.sin(z);
  // R = Rz · Ry · Rx
  return [
    cz * cy, cz * sy * sx - sz * cx, cz * sy * cx + sz * sx,
    sz * cy, sz * sy * sx + cz * cx, sz * sy * cx - cz * sx,
    -sy, cy * sx, cy * cx,
  ];
}
const mm = (a, b) => [
  a[0] * b[0] + a[1] * b[3] + a[2] * b[6], a[0] * b[1] + a[1] * b[4] + a[2] * b[7], a[0] * b[2] + a[1] * b[5] + a[2] * b[8],
  a[3] * b[0] + a[4] * b[3] + a[5] * b[6], a[3] * b[1] + a[4] * b[4] + a[5] * b[7], a[3] * b[2] + a[4] * b[5] + a[5] * b[8],
  a[6] * b[0] + a[7] * b[3] + a[8] * b[6], a[6] * b[1] + a[7] * b[4] + a[8] * b[7], a[6] * b[2] + a[7] * b[5] + a[8] * b[8],
];
const mv = (m, v) => [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sc3 = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const nrm3 = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
// 由两组正交标架求旋转：R · [a0 n0 b0] = [a1 n1 b1]
function frameRot(a0, n0, a1, n1) {
  const b0 = cross3(a0, n0), b1 = cross3(a1, n1);
  const F0 = [a0, n0, b0], F1 = [a1, n1, b1];
  const R = new Array(9).fill(0);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) R[i * 3 + j] += F1[k][i] * F0[k][j];
  return R;
}
function axisAngle(axis, deg) {
  const [x, y, z] = nrm3(axis), a = deg * D2R, c = Math.cos(a), s = Math.sin(a), t = 1 - c;
  return [t * x * x + c, t * x * y - s * z, t * x * z + s * y, t * x * y + s * z, t * y * y + c, t * y * z - s * x, t * x * z - s * y, t * y * z + s * x, t * z * z + c];
}

// 两段式反向运动学：a（根，位置 S 不动）→ b → c，Rp 是 a 的父骨头的世界旋转。
// hinge 是中间关节的转轴（父骨头的静止坐标里：膝盖 +x，手肘 −x），弯向 pole 那一边；
// 弯曲平面的法线直接取 pole × 肢体方向，伸直时也不会翻面。返回 a、b 的世界旋转和 b、c 的位置。
function twoBone(rest, Rp, ja, jb, jc, S, target, pole, hinge) {
  const u0 = mv(Rp, sub3(rest[jb], rest[ja])), f0 = mv(Rp, sub3(rest[jc], rest[jb]));
  const a = Math.hypot(...u0), b = Math.hypot(...f0);
  const n0 = nrm3(mv(Rp, hinge));
  const toT = sub3(target, S);
  let d = Math.hypot(...toT);
  d = Math.min(Math.max(d, Math.abs(a - b) + 1e-3), a + b - 1e-4);
  const u = nrm3(toT);
  const v = nrm3(sub3(pole, sc3(u, dot3(pole, u))));
  const alpha = Math.acos(Math.min(1, Math.max(-1, (a * a + d * d - b * b) / (2 * a * d))));
  const E = add3(S, add3(sc3(u, a * Math.cos(alpha)), sc3(v, a * Math.sin(alpha))));
  const W = add3(S, sc3(u, d));
  const u1 = nrm3(sub3(E, S)), f1 = nrm3(sub3(W, E));
  const n1 = nrm3(cross3(v, u));
  const on = (n, a2) => nrm3(sub3(n, sc3(a2, dot3(n, a2))));
  const Ra = frameRot(nrm3(u0), on(n0, nrm3(u0)), u1, on(n1, u1));
  const Rb = frameRot(nrm3(f0), on(n0, nrm3(f0)), f1, on(n1, f1));
  return { Ra: mm(Ra, Rp), Rb: mm(Rb, Rp), E, W, f1 };
}

// 每个关节的世界变换：x' = R·(x − rest) + P。B：量体数据（反向运动学的目标点用）。
// pose：POSES 里的名字，或者一个姿势对象（动画每一帧给的就是这个）：
//   j      各关节相对父骨头的旋转（度）
//   ik     胳膊：手腕放在哪（胸腔坐标）、手肘朝哪、手腕怎么弯
//   feet   腿：踝关节放在哪（世界坐标）、脚掌的朝向（度）—— 脚踩住不动，骨盆怎么动膝盖都自己弯
//   root   整个人挪多少（米）；ground：先把最低的那只脚放回地面（走路、跑步）
// feet（参数）：两只脚着地的点（静止姿势下的世界坐标，跟着踝关节走），ground 要用
export function poseTransforms(rest, poseIn = 'stand', B = null, amount = 1, { feet = null } = {}) {
  const pose = typeof poseIn === 'string' ? (POSES[poseIn] ?? POSES.stand) : (poseIn ?? POSES.stand);
  const local = JOINTS.map(() => [0, 0, 0]);
  for (const [name, a] of Object.entries(pose.j ?? {})) {
    if (J[name] === undefined) continue;
    local[J[name]] = a.map((x) => x * amount);
    if (pose.sym !== false && name.endsWith('L')) {
      const r = J[name.slice(0, -1) + 'R'];
      if (!pose.j[name.slice(0, -1) + 'R']) local[r] = [a[0] * amount, -a[1] * amount, -a[2] * amount];
    }
  }
  const R = new Array(JOINTS.length), P = new Array(JOINTS.length);
  for (let j = 0; j < JOINTS.length; j++) {
    const r = rotXYZ(local[j]);
    const p = PARENT[j];
    if (p < 0) { R[j] = r; P[j] = rest[j].slice(); continue; }
    R[j] = mm(R[p], r);
    P[j] = add3(P[p], mv(R[p], sub3(rest[j], rest[p])));
  }
  // 落地：最低的那只脚（脚跟或脚尖）回到静止姿势时的高度
  const shift = [0, 0, 0];
  if (pose.ground && feet) {
    const low = (jn, pts) => Math.min(...pts.map((q) => mv(R[J[jn]], sub3(q, rest[J[jn]]))[1] + P[J[jn]][1]));
    const was = Math.min(...feet.L.map((q) => q[1]), ...feet.R.map((q) => q[1]));
    shift[1] = was - Math.min(low('ankleL', feet.L), low('ankleR', feet.R));
  }
  if (pose.root) for (let k = 0; k < 3; k++) shift[k] += pose.root[k] * amount;
  if (shift[0] || shift[1] || shift[2]) for (let j = 0; j < JOINTS.length; j++) P[j] = add3(P[j], shift);
  // 腿的反向运动学：踝关节放到给定的位置，膝盖朝前（略朝外），脚掌按给定的朝向
  if (pose.feet) {
    for (const side of ['L', 'R']) {
      const f = pose.feet[side];
      if (!f) continue;
      const [hp, kn, an] = side === 'L' ? [J.hipL, J.kneeL, J.ankleL] : [J.hipR, J.kneeR, J.ankleR];
      const sd = side === 'L' ? 1 : -1;
      const pole = mv(R[J.pelvis], f.pole ?? [0.15 * sd, 0, 1]);
      const sol = twoBone(rest, R[J.pelvis], hp, kn, an, P[hp], f.at, pole, [1, 0, 0]);
      R[hp] = sol.Ra; R[kn] = sol.Rb; P[kn] = sol.E; P[an] = sol.W;
      R[an] = rotXYZ(f.rot ?? [0, 0, 0]);
    }
  }
  // 胳膊的反向运动学
  if (pose.ik && B) {
    for (const [side, spec] of Object.entries(pose.ik)) {
      if (!spec) continue;
      const [sh, el, wr] = side === 'L' ? [J.shoulderL, J.elbowL, J.wristL] : [J.shoulderR, J.elbowR, J.wristR];
      const Rc = R[J.chest], Pc = P[J.chest], rc = rest[J.chest];
      const S = P[sh];
      // 目标点在胸腔的坐标里（躯干弯了，手跟着走）
      const h = spec.hand(B);
      let T = add3(Pc, mv(Rc, sub3(h, rc)));
      T = add3(S, sc3(sub3(T, S), amount)); // amount < 1 时往静止位置插值（近似）
      const sol = twoBone(rest, Rc, sh, el, wr, S, T, mv(Rc, spec.pole), [-1, 0, 0]);
      const f1 = sol.f1;
      R[sh] = sol.Ra; P[sh] = S;
      R[el] = sol.Rb; P[el] = sol.E;
      let Rw = spec.twist ? mm(axisAngle(f1, spec.twist * amount), R[el]) : R[el];
      // 手腕弯：手指转向 dir（胸腔坐标），再绕手的方向拧，让掌心尽量朝 palm
      if (spec.dir) {
        const want = nrm3(mv(Rc, spec.dir));
        const ax = cross3(f1, want), sn = Math.hypot(...ax);
        const ang = Math.min(Math.atan2(sn, dot3(f1, want)) / D2R, spec.maxBend ?? 80) * amount;
        if (sn > 1e-6) Rw = mm(axisAngle(ax, ang), Rw);
        if (spec.palm) {
          const hd = nrm3(mv(Rw, sub3(rest[wr], rest[el])));
          const on2 = (n) => nrm3(sub3(n, sc3(hd, dot3(n, hd))));
          const sdd = side === 'L' ? 1 : -1;
          const p0 = on2(mv(Rw, [-sdd, 0, 0])), p1 = on2(mv(Rc, spec.palm));
          const tw = Math.atan2(dot3(cross3(p0, p1), hd), dot3(p0, p1)) / D2R;
          Rw = mm(axisAngle(hd, tw * amount), Rw);
        }
      }
      R[wr] = Rw; P[wr] = sol.W;
    }
  }
  return { R, P, rest };
}

// —— 显卡蒙皮用的权重 ——
// 控制点的权重（每点最多三根骨头）摊成稠密的 17 列，按同样的细分规则算到细分点上（权重是线性的量，细分出来自然是光滑的），
// 每个点再取最大的四根骨头、归一化 —— 和 three.js / glTF 的 4 骨蒙皮对得上。map 给了就按它挑点（衣服的渲染顶点）
export function denseWeights(W, n, pick = (v) => v) {
  const NJ = JOINTS.length;
  const D = new Float32Array(n * NJ);
  for (let i = 0; i < n; i++) {
    const v = pick(i);
    if (v < 0) continue;
    for (let k = 0; k < 3; k++) { const w = W.w[v * 3 + k]; if (w) D[i * NJ + W.idx[v * 3 + k]] += w; }
  }
  return D;
}
export function top4(D, map = null) {
  const NJ = JOINTS.length;
  const m = map ? map.length : D.length / NJ;
  const skinIndex = new Uint16Array(m * 4), skinWeight = new Float32Array(m * 4);
  const bi = [0, 0, 0, 0], bw = [0, 0, 0, 0];
  for (let i = 0; i < m; i++) {
    const o = (map ? map[i] : i) * NJ;
    bi.fill(0); bw.fill(0);
    for (let j = 0; j < NJ; j++) {
      const w = D[o + j];
      if (w <= bw[3]) continue;
      let k = 3;
      while (k > 0 && w > bw[k - 1]) { bw[k] = bw[k - 1]; bi[k] = bi[k - 1]; k--; }
      bw[k] = w; bi[k] = j;
    }
    const sum = bw[0] + bw[1] + bw[2] + bw[3] || 1;
    for (let k = 0; k < 4; k++) { skinIndex[i * 4 + k] = bi[k]; skinWeight[i * 4 + k] = bw[k] / sum; }
  }
  return { skinIndex, skinWeight };
}
// 身体细分网格每个顶点的四根骨头
export function bodySkin(body) {
  body.weights ??= skinWeights(body.topo);
  return top4(subdivide(body.plan, denseWeights(body.weights, body.topo.n), JOINTS.length));
}
export const PARENTS = PARENT;

// 量体数据里给反向运动学用的几个数
export function bodyMarks(L) {
  const tor = (t) => L.crotch + t * (L.notch - L.crotch);
  return { shoulderW: L.shoulderW, waistW: L.waistW, hipW: L.hipW, hipDF: L.hipDF + 0.3 * (L.belly ?? 0), waistY: tor(0.43), chestY: tor(0.74), crotch: L.crotch, notch: L.notch, chin: L.chin, crown: L.crown };
}

// 线性混合蒙皮（控制点 / 目标点数组，就地改写成摆好姿势的位置）
export function applyPose(pos, W, T) {
  const n = pos.length / 3;
  const { R, P, rest } = T;
  for (let v = 0; v < n; v++) {
    const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
    let ox = 0, oy = 0, oz = 0;
    for (let k = 0; k < 3; k++) {
      const w = W.w[v * 3 + k];
      if (!w) continue;
      const j = W.idx[v * 3 + k];
      const r = R[j], o = rest[j], p = P[j];
      const dx = x - o[0], dy = y - o[1], dz = z - o[2];
      ox += w * (r[0] * dx + r[1] * dy + r[2] * dz + p[0]);
      oy += w * (r[3] * dx + r[4] * dy + r[5] * dz + p[1]);
      oz += w * (r[6] * dx + r[7] * dy + r[8] * dz + p[2]);
    }
    pos[v * 3] = ox; pos[v * 3 + 1] = oy; pos[v * 3 + 2] = oz;
  }
  return pos;
}

// 一个关节的 4×4 列主序矩阵（three.js 的 Matrix4.fromArray 用），把静止姿势下的东西搬到摆好姿势的位置
export function jointMatrix(T, name) {
  const j = J[name];
  const r = T.R[j], o = T.rest[j], p = T.P[j];
  const t = [p[0] - (r[0] * o[0] + r[1] * o[1] + r[2] * o[2]), p[1] - (r[3] * o[0] + r[4] * o[1] + r[5] * o[2]), p[2] - (r[6] * o[0] + r[7] * o[1] + r[8] * o[2])];
  return [r[0], r[3], r[6], 0, r[1], r[4], r[7], 0, r[2], r[5], r[8], 0, t[0], t[1], t[2], 1];
}
