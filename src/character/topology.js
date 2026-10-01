import { orientFaces } from './subdiv.js';

// 人体控制网格的拓扑（只有“谁和谁相连”，位置由 body.js / head.js 按参数算）。
//
// 躯干、脖子、头都是每圈 NC = 20 个点的环，第 j 列在角度 θ = j·18° 附近：
// j = 0 正前方，j = 5 角色的左侧（+x），j = 10 正后方，j = 15 右侧（−x）。
//   躯干 T0 … T11：T0 是两腿分叉的一圈，T11 是脖子根；T7 … T10 的左右两侧各挖掉 2 × 3 个面，留出胳膊的洞（10 个点一圈）
//   脖子 N0 … N2
//   头   H0 … H14：H0 下巴底下 / 后颈，H1 下巴底，H2 下巴前，H3 … H5 嘴（中间挖 4 × 2 个面），H6 鼻底，H7 鼻尖，
//        H8 … H10 眼睛（每只挖 2 × 2 个面），H11 眉，H12 额头，H13 发际线，H14 头顶一圈，最上面盖一块 6 × 4 的网格
//   眼睛：洞口一圈 8 个点往里三圈（眼睑外侧、睑缘、睑内侧），最里面一圈是开口，眼球在后面
//   嘴：洞口一圈 12 个点往里三圈（唇外缘、唇峰、唇内缘），唇内缘上下两排点重合，闭成一条缝
//   耳朵：头侧 1 × 3 个面的洞（H7 … H10）往外三圈（耳根、耳轮、对耳轮），最外面盖 1 × 3 的网格（耳甲）
// 胳膊每圈 10 个点：A0 是躯干上的洞口，A9 是手腕；手掌 P0 … P2，指根一圈正好是 4 个四边形，各长出一根手指（每圈 4 个点）；
//   大拇指从 P0 和 P1 之间朝前的那个面长出来
// 腿每圈 12 个点：L0 = 分叉圈的半边（前中、躯干 T0 的 9 个点、后中）再加上裆部一个点；L10 是脚踝，
//   然后五圈弯过来变成脚（脚背、脚掌），脚尖盖 3 × 3 的网格
export const NC = 20, NT = 12, NN = 3, NH = 15;
export const NA = 10, ARM_RINGS = 10, PALM_RINGS = 3, FINGER_RINGS = 4, THUMB_RINGS = 3;
export const NL = 12, LEG_RINGS = 11, FOOT_RINGS = 5;
export const EYE_RINGS = 3, MOUTH_RINGS = 3, EAR_RINGS = 3;
export const CAP = { a: 6, b: 4, start: 2 };

const SIDES = [1, -1]; // 左（+x）、右（−x）
// 左侧的列 → 右侧镜像的列
export const mirrorCol = (j) => (NC - j) % NC;

class Cage {
  constructor() {
    this.n = 0;
    this.faces = [];
    this.ftag = [];
  }
  vert() { return this.n++; }
  ring(k) { return Array.from({ length: k }, () => this.vert()); }
  face(vs, tag) { this.faces.push(vs); this.ftag.push(tag); }
  // 两圈之间连一圈四边形（skip(k) 为真的跳过）
  band(a, b, tag, skip = null) {
    const k = a.length;
    for (let i = 0; i < k; i++) {
      if (skip && skip(i)) continue;
      this.face([a[i], a[(i + 1) % k], b[(i + 1) % k], b[i]], { ...tag, j: i, n: k });
    }
  }
  // 在一圈 2(a+b) 个点上盖一块 a × b 的网格，返回 G[i][j]（i 沿第一条边、j 沿第二条边）
  cap(ring, a, b, start, tag) {
    const n = ring.length;
    if (n !== 2 * (a + b)) throw new Error('cap: 点数不对');
    const at = (k) => ring[(start + k) % n];
    const G = Array.from({ length: a + 1 }, () => new Array(b + 1).fill(-1));
    for (let i = 0; i <= a; i++) G[i][0] = at(i);
    for (let j = 0; j <= b; j++) G[a][j] = at(a + j);
    for (let i = 0; i <= a; i++) G[a - i][b] = at(a + b + i);
    for (let j = 0; j <= b; j++) G[0][b - j] = at(2 * a + b + j);
    for (let i = 1; i < a; i++) for (let j = 1; j < b; j++) G[i][j] = this.vert();
    for (let i = 0; i < a; i++) for (let j = 0; j < b; j++) this.face([G[i][j], G[i + 1][j], G[i + 1][j + 1], G[i][j + 1]], { ...tag, gi: i, gj: j });
    return G;
  }
}

export function buildTopology() {
  const c = new Cage();
  const T = Array.from({ length: NT }, () => c.ring(NC));
  const N = Array.from({ length: NN }, () => c.ring(NC));
  const H = Array.from({ length: NH }, () => c.ring(NC));
  const torsoTag = (r) => ({ part: 'torso', r });

  // —— 躯干：左右各挖一个胳膊洞（T7…T10 × 列 4…6 / 14…16）——
  const armHole = (r, j) => r >= 7 && r <= 9 && (j === 4 || j === 5 || j === 14 || j === 15);
  for (let r = 0; r < NT - 1; r++) c.band(T[r], T[r + 1], torsoTag(r), (j) => armHole(r, j));
  c.band(T[NT - 1], N[0], { part: 'neck', r: -1 });
  for (let r = 0; r < NN - 1; r++) c.band(N[r], N[r + 1], { part: 'neck', r });
  c.band(N[NN - 1], H[0], { part: 'neck', r: NN - 1 });

  // —— 头：嘴（H3…H5 × 列 18…2）、眼睛（H8…H10 × 列 1…3 / 17…19）、耳朵（H7…H10 × 列 6…7 / 13…14）——
  const mouthHole = (r, j) => (r === 3 || r === 4) && (j === 18 || j === 19 || j === 0 || j === 1);
  const eyeHole = (r, j) => (r === 8 || r === 9) && (j === 1 || j === 2 || j === 17 || j === 18);
  const earHole = (r, j) => r >= 7 && r <= 9 && (j === 6 || j === 13);
  for (let r = 0; r < NH - 1; r++) {
    c.band(H[r], H[r + 1], { part: 'head', r }, (j) => mouthHole(r, j) || eyeHole(r, j) || earHole(r, j));
  }
  const capG = c.cap(H[NH - 1], CAP.a, CAP.b, CAP.start, { part: 'head', r: NH - 1, cap: true });

  // —— 眼睛 ——
  const eyes = SIDES.map((s) => {
    const col = (j) => (s > 0 ? j : mirrorCol(j));
    const loop = [[1, 9], [1, 10], [2, 10], [3, 10], [3, 9], [3, 8], [2, 8], [1, 8]].map(([j, r]) => H[r][col(j)]);
    const rings = [loop];
    for (let i = 0; i < EYE_RINGS; i++) {
      const next = c.ring(8);
      c.band(rings[i], next, { part: 'eye', side: s, r: i });
      rings.push(next);
    }
    return rings;
  });

  // —— 嘴 ——
  const mouthLoop = [[18, 3], [19, 3], [0, 3], [1, 3], [2, 3], [2, 4], [2, 5], [1, 5], [0, 5], [19, 5], [18, 5], [18, 4]].map(([j, r]) => H[r][j]);
  const mouth = [mouthLoop];
  for (let i = 0; i < MOUTH_RINGS; i++) {
    const next = c.ring(12);
    c.band(mouth[i], next, { part: 'mouth', r: i });
    mouth.push(next);
  }

  // —— 耳朵 ——
  const ears = SIDES.map((s) => {
    const col = (j) => (s > 0 ? j : mirrorCol(j));
    const loop = [[6, 7], [7, 7], [7, 8], [7, 9], [7, 10], [6, 10], [6, 9], [6, 8]].map(([j, r]) => H[r][col(j)]);
    const rings = [loop];
    for (let i = 0; i < EAR_RINGS; i++) {
      const next = c.ring(8);
      c.band(rings[i], next, { part: 'ear', side: s, r: i });
      rings.push(next);
    }
    c.cap(rings[EAR_RINGS], 1, 3, 0, { part: 'ear', side: s, r: EAR_RINGS });
    return rings;
  });

  // —— 胳膊和手 ——
  const arms = SIDES.map((s) => {
    const col = (j) => (s > 0 ? j : mirrorCol(j));
    const hole = [[4, 10], [5, 10], [6, 10], [6, 9], [6, 8], [6, 7], [5, 7], [4, 7], [4, 8], [4, 9]].map(([j, r]) => T[r][col(j)]);
    const A = [hole];
    for (let i = 1; i < ARM_RINGS; i++) {
      A.push(c.ring(NA));
      c.band(A[i - 1], A[i], { part: 'arm', side: s, r: i - 1 });
    }
    const P = [];
    for (let i = 0; i < PALM_RINGS; i++) {
      P.push(c.ring(NA));
      // 大拇指从 P0–P1 之间、k8–k9 这个面长出来
      c.band(i ? P[i - 1] : A[ARM_RINGS - 1], P[i], { part: i ? 'hand' : 'arm', side: s, r: i ? 100 + i - 1 : ARM_RINGS - 1 }, i === 1 ? (k) => k === 8 : null);
    }
    // 指根：手背 k9 k0 k1 k2 k3、手心 k8 k7 k6 k5 k4 —— 食指 … 小指
    const D = [9, 0, 1, 2, 3], Pm = [8, 7, 6, 5, 4];
    const last = P[PALM_RINGS - 1];
    const fingers = [0, 1, 2, 3].map((f) => {
      const base = [last[D[f]], last[D[f + 1]], last[Pm[f + 1]], last[Pm[f]]];
      const R = [base];
      for (let i = 0; i < FINGER_RINGS; i++) {
        R.push(c.ring(4));
        c.band(R[i], R[i + 1], { part: 'finger', side: s, f, r: i });
      }
      c.face([...R[FINGER_RINGS]], { part: 'finger', side: s, f, r: FINGER_RINGS });
      return R;
    });
    const tBase = [P[0][9], P[1][9], P[1][8], P[0][8]];
    const thumb = [tBase];
    for (let i = 0; i < THUMB_RINGS; i++) {
      thumb.push(c.ring(4));
      c.band(thumb[i], thumb[i + 1], { part: 'thumb', side: s, r: i });
    }
    c.face([...thumb[THUMB_RINGS]], { part: 'thumb', side: s, r: THUMB_RINGS });
    return { A, P, fingers, thumb };
  });

  // —— 腿和脚 ——
  const X = c.vert(); // 裆部
  const legs = SIDES.map((s) => {
    const half = s > 0 ? [1, 2, 3, 4, 5, 6, 7, 8, 9] : [19, 18, 17, 16, 15, 14, 13, 12, 11];
    const L0 = [T[0][0], ...half.map((j) => T[0][j]), T[0][10], X];
    const L = [L0];
    for (let i = 1; i < LEG_RINGS; i++) {
      L.push(c.ring(NL));
      c.band(L[i - 1], L[i], { part: 'leg', side: s, r: i - 1 });
    }
    const Fr = [L[LEG_RINGS - 1]];
    for (let i = 0; i < FOOT_RINGS; i++) {
      Fr.push(c.ring(NL));
      c.band(Fr[i], Fr[i + 1], { part: 'foot', side: s, r: i });
    }
    const toe = c.cap(Fr[FOOT_RINGS], 3, 3, 1, { part: 'foot', side: s, r: FOOT_RINGS });
    return { L, F: Fr, toe };
  });

  // —— 去掉没用上的点（洞里的点），重新编号 ——
  const used = new Uint8Array(c.n);
  for (const f of c.faces) for (const v of f) used[v] = 1;
  const remap = new Int32Array(c.n).fill(-1);
  let n = 0;
  for (let v = 0; v < c.n; v++) if (used[v]) remap[v] = n++;
  const R = (v) => remap[v];
  const deep = (x) => (Array.isArray(x) ? x.map(deep) : typeof x === 'number' ? R(x) : x);
  const faces = c.faces.map((f) => f.map(R));
  orientFaces(faces, n);
  const topo = {
    n,
    faces,
    ftag: c.ftag,
    T: deep(T), N: deep(N), H: deep(H), cap: deep(capG),
    eyes: deep(eyes), mouth: deep(mouth), ears: deep(ears),
    arms: arms.map((a) => ({ A: deep(a.A), P: deep(a.P), fingers: deep(a.fingers), thumb: deep(a.thumb) })),
    legs: legs.map((l) => ({ L: deep(l.L), F: deep(l.F), toe: deep(l.toe) })),
    X: R(X),
  };
  // 嘴缝两端：唇内缘那一圈的两个嘴角（保持尖角，上下唇才合得拢）
  const inner = topo.mouth[MOUTH_RINGS];
  topo.corners = [inner[5], inner[11]];
  topo.fitMask = fitMask(topo);
  return topo;
}

// 反求控制点时每个点“拟合到什么程度”：五官、手指这些小形体完全拟合（不被细分磨平），
// 其余地方只拟合低频（整体不缩水，但不去追每个点的细小起伏，免得出现波纹）
function fitMask(topo) {
  // 身体只轻轻拟合（躯干、四肢的目标点本身就够圆了），头部拟合得多一些
  const m = new Float32Array(topo.n).fill(0.12);
  const put = (v, w) => { if (v >= 0) m[v] = Math.max(m[v], w); };
  const all = (x, w) => (Array.isArray(x) ? x.forEach((y) => all(y, w)) : put(x, w));
  all(topo.H, 0.3);
  all(topo.cap, 0.3);
  all(topo.eyes, 1);
  all(topo.mouth, 1);
  all(topo.ears, 1);
  const H = topo.H;
  for (let r = 6; r <= 10; r++) put(H[r][0], 1);
  for (const j of [1, 19]) { put(H[6][j], 1); put(H[7][j], 1); put(H[8][j], 0.8); }
  for (let r = 1; r <= 3; r++) for (const j of [0, 1, 19, 2, 18]) put(H[r][j], 0.85);
  for (const j of [0, 1, 2, 3, 17, 18, 19]) put(H[11][j], 0.6);
  for (const a of topo.arms) { all(a.fingers, 1); all(a.thumb, 1); all(a.P, 0.7); }
  for (const l of topo.legs) { all(l.F, 0.6); all(l.toe, 0.6); }
  // 嘴角：三圈唇线在这里收拢成一个点，完全拟合会在嘴角外面挤出一道折痕
  for (let i = 1; i <= MOUTH_RINGS; i++) for (const k of [5, 11]) m[topo.mouth[i][k]] = 0.45;
  for (const k of [5, 11]) m[topo.mouth[0][k]] = 0.4;
  // 渐变：特征点周围一圈圈地降下来（1 → 0.7 → 0.5 → …），不让相邻两个点的拟合程度差太多
  const nb = Array.from({ length: topo.n }, () => new Set());
  for (const f of topo.faces) for (let j = 0; j < f.length; j++) { nb[f[j]].add(f[(j + 1) % f.length]); nb[f[(j + 1) % f.length]].add(f[j]); }
  for (let pass = 0; pass < 3; pass++) {
    const prev = Float32Array.from(m);
    for (let v = 0; v < topo.n; v++) for (const u of nb[v]) m[v] = Math.max(m[v], prev[u] * 0.7);
  }
  return m;
}
