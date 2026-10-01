import { NC, NT, NN, NA, ARM_RINGS, PALM_RINGS, FINGER_RINGS, THUMB_RINGS, NL, LEG_RINGS, FOOT_RINGS } from './topology.js';
import { headFeatures, headSDF, placeHead, placeFeatures } from './head.js';

// 身体控制点的位置（静止姿势：站直，两臂自然下垂、掌心朝向大腿）。
// 先由参数算出一组“量体数据”（身高、头长、肩宽、腰宽、臀宽、四肢长短粗细、关节位置），
// 躯干每一圈是一个超椭圆截面（前后深度不同），再叠上胸、腹、臀、肩胛这些鼓包；
// 四肢每一圈绕着骨骼的轴线，前后内外四个半径各不相同（股四头肌、小腿肚、膝盖、肘尖）。

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, t) => a + (b - a) * t;
const pos = (x) => Math.max(x, 0), neg = (x) => Math.min(x, 0);
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const madd = (a, b, s) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
const D2R = Math.PI / 180;
// 超椭圆：|cos|^(2/n)
const se = (c, n) => Math.sign(c) * Math.abs(c) ** (2 / n);

export function landmarks(p) {
  const H = p.height / 100;
  const s = p.sex, fat = p.weight, mus = p.muscle;
  const k = H / 1.72, kw = k ** 0.85;
  const L = { H, k, kw, s, fat, mus };
  L.headH = 0.226 * k ** 0.4 * (1 + 0.075 * p.head) * (1 - 0.035 * s);
  L.g = L.headH / 0.226;
  L.crown = H;
  L.chin = H - L.headH;
  L.notch = L.chin - (0.078 + 0.02 * p.neck) * k * (1 - 0.08 * pos(fat));
  L.crotch = H * (0.468 + 0.017 * p.legs);
  // 男性（s = 0）到女性（s = 1）之间插值的基础尺寸（半宽、半深，米，按 1.72m 身高）
  const sx = (m, f) => lerp(m, f, s);
  L.shoulderW = kw * sx(0.2, 0.177) * (1 + 0.07 * p.shoulders + 0.06 * mus + 0.03 * fat);
  L.chestW = kw * sx(0.162, 0.145) * (1 + 0.035 * p.chest + 0.1 * pos(fat) + 0.05 * neg(fat) + 0.05 * mus);
  L.waistW = kw * sx(0.142, 0.122) * (1 + 0.09 * p.waist + 0.2 * pos(fat) + 0.08 * neg(fat) - 0.02 * mus);
  L.hipW = kw * sx(0.163, 0.183) * (1 + 0.07 * p.hips + 0.12 * pos(fat) + 0.06 * neg(fat) + 0.01 * mus);
  L.chestD = kw * sx(0.118, 0.104) * (1 + 0.08 * pos(fat) + 0.05 * neg(fat) + 0.07 * mus);
  L.backD = kw * sx(0.106, 0.097) * (1 + 0.08 * pos(fat) + 0.04 * neg(fat) + 0.05 * mus);
  L.waistDF = kw * sx(0.098, 0.088) * (1 + 0.06 * p.waist);
  L.waistDB = kw * sx(0.084, 0.078);
  L.hipDF = kw * sx(0.09, 0.088);
  L.hipDB = kw * sx(0.108, 0.114) * (1 + 0.05 * p.hips);
  L.belly = kw * (0.034 * pos(fat) + 0.008 * neg(fat));
  L.bust = s * kw * (0.021 + 0.016 * p.chest) * (1 + 0.35 * pos(fat));
  L.pecs = (1 - s) * kw * (0.003 + 0.011 * mus + 0.004 * pos(fat) + 0.003 * p.chest);
  L.glute = kw * (0.01 + 0.01 * s + 0.006 * p.hips + 0.008 * pos(fat) + 0.004 * mus);
  L.neckR = kw * sx(0.0565, 0.0475) * (1 + 0.12 * pos(fat) + 0.04 * neg(fat) + 0.1 * mus) * (1 - 0.04 * p.neck);
  // 胳膊
  L.armLen = H * (0.186 + 0.006 * p.arms);
  L.foreLen = H * (0.147 + 0.005 * p.arms);
  L.handLen = H * 0.107 * (1 - 0.04 * s);
  L.armR = kw * (0.0475 - 0.0065 * s) * (1 + 0.17 * pos(fat) + 0.05 * neg(fat) + 0.18 * mus);
  L.foreR = kw * (0.04 - 0.005 * s) * (1 + 0.1 * pos(fat) + 0.03 * neg(fat) + 0.13 * mus);
  L.handW = kw * (0.044 - 0.004 * s);
  // 腿
  L.hipJx = kw * (0.082 + 0.01 * s) * (1 + 0.04 * p.hips + 0.04 * pos(fat));
  L.kneeY = L.crotch * 0.6;
  L.ankleY = 0.072 * k;
  L.thighR = kw * (0.09 + 0.006 * s) * (1 + 0.15 * pos(fat) + 0.05 * neg(fat) + 0.08 * mus);
  L.calfR = kw * 0.061 * (1 + 0.1 * pos(fat) + 0.03 * neg(fat) + 0.1 * mus) * (1 - 0.04 * s);
  L.footLen = H * 0.152 * (1 - 0.05 * s);
  // 关节
  const abd = (7 + 5 * pos(fat) + 3 * mus + 2 * p.shoulders) * D2R;
  L.side = (sd) => {
    const Js = [sd * (L.shoulderW - 0.043 * kw), L.notch - 0.05 * k, -0.01];
    const du = norm([sd * Math.sin(abd), -Math.cos(abd), -0.035]);
    const Je = madd(Js, du, L.armLen);
    const df = norm([sd * Math.sin(abd * 0.55), -1, 0.16]);
    const Jw = madd(Je, df, L.foreLen);
    const Jh = [sd * L.hipJx, L.crotch + 0.075 * k, 0.004];
    const Jk = [sd * (L.hipJx + 0.006), L.kneeY, 0.012];
    const Ja = [sd * (L.hipJx + 0.012), L.ankleY, -0.026 * k];
    return { Js, du, Je, df, Jw, Jh, Jk, Ja };
  };
  return L;
}

// —— 躯干每一圈的截面：[前 t, 侧 t, 后 t]（0 = 裆，1 = 胸骨上窝）、半宽、前深、后深、中心 z、超椭圆指数 ——
function torsoStations(L) {
  const { hipW, waistW, chestW, chestD, backD, shoulderW, neckR, waistDF, waistDB, hipDF, hipDB } = L;
  return [
    { t: [0.035, 0.125, 0.055], w: hipW * 0.9, df: hipDF * 0.86, db: hipDB * 0.88, zc: 0.0, n: 2.3 },
    { t: [0.15, 0.2, 0.165], w: hipW, df: hipDF, db: hipDB, zc: 0.0, n: 2.4 },
    { t: [0.29, 0.31, 0.3], w: lerp(hipW, waistW, 0.5), df: lerp(hipDF, waistDF, 0.5) + L.belly * 0.6, db: lerp(hipDB, waistDB, 0.55), zc: 0.002, n: 2.3 },
    { t: [0.42, 0.43, 0.43], w: waistW, df: waistDF + L.belly, db: waistDB, zc: 0.005, n: 2.2 },
    { t: [0.53, 0.54, 0.54], w: lerp(waistW, chestW, 0.55), df: lerp(waistDF, chestD, 0.4) + L.belly * 0.55, db: lerp(waistDB, backD, 0.5), zc: 0.004, n: 2.2 },
    { t: [0.635, 0.635, 0.635], w: chestW * 0.975, df: chestD * 0.95, db: backD * 0.95, zc: 0.0, n: 2.2 },
    { t: [0.74, 0.74, 0.74], w: chestW, df: chestD, db: backD, zc: -0.002, n: 2.3 },
    { t: [0.83, 0.82, 0.82], w: chestW * 1.0, df: chestD * 0.97, db: backD * 1.02, zc: -0.004, n: 2.4 },
    { t: [0.895, 0.885, 0.885], w: chestW * 1.02, df: chestD * 0.92, db: backD * 1.02, zc: -0.006, n: 2.4 },
    { t: [0.945, 0.95, 0.94], w: chestW * 1.0, df: chestD * 0.84, db: backD * 0.98, zc: -0.008, n: 2.4 },
    { t: [0.985, 1.04, 1.04], w: shoulderW * 0.8, df: chestD * 0.62, db: backD * 0.86, zc: -0.012, n: 2.6 },
    { t: [1.01, 1.09, 1.11], w: neckR * 1.14, df: neckR * 0.98, db: neckR * 1.08, zc: -0.02, n: 2.0 },
  ];
}

const colTheta = (j) => (j * 2 * Math.PI) / NC;

export function placeBody(topo, p, L, out) {
  const set = (v, q) => { if (v >= 0) { out[v * 3] = q[0]; out[v * 3 + 1] = q[1]; out[v * 3 + 2] = q[2]; } };
  const get = (v) => [out[v * 3], out[v * 3 + 1], out[v * 3 + 2]];
  set.get = get; // 手指、脚尖要读回已经摆好的点
  const st = torsoStations(L);
  const tY = (t) => L.crotch + t * (L.notch - L.crotch);
  const sides = [L.side(1), L.side(-1)];

  // —— 躯干 ——
  for (let r = 0; r < NT; r++) {
    const S = st[r];
    for (let j = 0; j < NC; j++) {
      const th = colTheta(j);
      const c = Math.cos(th), sn = Math.sin(th);
      const yF = tY(S.t[0]), yS = tY(S.t[1]), yB = tY(S.t[2]);
      let y = yS + (yF - yS) * pos(c) ** 2 + (yB - yS) * pos(-c) ** 2;
      let x = S.w * se(sn, S.n);
      let z = S.zc + (c >= 0 ? S.df : S.db) * se(c, S.n);
      // 胸（女性）/ 胸肌（男性）：前面两个鼓包
      const bustRow = [0, 0, 0, 0, 0.18, 0.62, 1.0, 0.55, 0.12, 0, 0, 0][r];
      if (bustRow && c > 0) {
        const a = Math.abs(th > Math.PI ? th - 2 * Math.PI : th);
        const g = Math.exp(-(((a - 0.52) / 0.42) ** 2));
        z += (L.bust * g + L.pecs * Math.exp(-(((a - 0.45) / 0.6) ** 2))) * bustRow;
        if (r === 5) y -= L.bust * g * 0.35;
      }
      // 臀：后面两块
      const gluteRow = [0.7, 1.0, 0.35, 0, 0, 0, 0, 0, 0, 0, 0, 0][r];
      if (gluteRow && c < 0) {
        const a = Math.abs(Math.abs(th > Math.PI ? th - 2 * Math.PI : th) - Math.PI);
        z -= L.glute * gluteRow * Math.exp(-(((a - 0.5) / 0.45) ** 2));
        if (a < 0.2) z += 0.006 * gluteRow * (1 - a / 0.2); // 臀沟
      }
      // 脊柱沟、肩胛骨
      if (c < -0.9 && r >= 2 && r <= 9) z += 0.004 * L.kw;
      if ((r === 8 || r === 9) && c < 0) {
        const a = Math.abs(Math.abs(th > Math.PI ? th - 2 * Math.PI : th) - Math.PI);
        z -= 0.006 * L.kw * Math.exp(-(((a - 0.6) / 0.3) ** 2));
      }
      set(topo.T[r][j], [x, y, z]);
    }
  }

  // —— 胳膊的洞口（腋窝那一圈）：T7 … T10 × 列 4 … 6 —— 一个竖着的椭圆，顶上在肩峰、底下在腋窝
  topo.arms.forEach((arm, si) => {
    const sd = si === 0 ? 1 : -1;
    const J = sides[si];
    const yTop = L.notch - 0.004 * L.k, yBot = tY(0.8);
    const cy = (yTop + yBot) / 2, ry = (yTop - yBot) / 2;
    const xTop = L.shoulderW - 0.008 * L.kw, xBot = L.chestW * 0.95;
    arm.A[0].forEach((v, kk) => {
      const a = (90 + (kk - 1) * 36) * D2R;
      const sa = Math.sin(a), ca = Math.cos(a);
      const y = cy + ry * sa * (sa < 0 ? 1.0 : 0.94);
      const z = -0.006 + (ca > 0 ? 0.058 : 0.062) * L.kw * ca;
      const x = lerp(xBot, xTop, (sa + 1) / 2) + 0.004 * Math.abs(ca);
      set(v, [sd * x, y, z]);
    });
    placeArm(arm, sd, J, L, set, get);
  });

  // —— 腿和脚 ——
  set(topo.X, [0, L.crotch, -0.008]);
  topo.legs.forEach((leg, si) => placeLeg(leg, si === 0 ? 1 : -1, sides[si], L, set));

  // —— 脖子、头（返回五官参数和头部局部坐标的原点、缩放，眼球、眉毛、头发都要用）——
  return placeNeckAndHead(topo, p, L, set, get);
}

// 一圈：中心 C，轴向 n（指向远端），前方 F；β = 90° + (k − 1)·36°（k = 1 外侧，k = 6 内侧，k ≈ 8.5 前面）
// rad(β) → [前后方向的半径, 内外方向的半径]
function ringAround(C, n, sd, rad, nk = NA, ex = 2.2) {
  let F = [0, 0, 1];
  F = norm(madd(F, n, -dot(F, n)));
  const U = mul(cross(F, n), sd);
  const pts = [];
  for (let k = 0; k < nk; k++) {
    const b = (90 + (k - 1) * 36) * D2R;
    const cb = Math.cos(b), sb = Math.sin(b);
    const [rf, ru] = rad(cb, sb);
    pts.push(add(add(C, mul(F, rf * se(cb, ex))), mul(U, ru * se(sb, ex))));
  }
  return { pts, F, U };
}
// 四个方向各一个半径：前、后、外、内
const quad4 = (f, b, l, m) => (cb, sb) => [cb >= 0 ? f : b, sb >= 0 ? l : m];

function placeArm(arm, sd, J, L, set) {
  const { Js, du, Je, df, Jw } = J;
  const R = L.armR / 0.0435, Rf = L.foreR / 0.0365;
  const k = L.kw;
  // A1：三角肌（截面斜 45°）
  // 三角肌：截面斜 50°，圆心比肩关节更靠外、略低，盖住肩头
  const n1 = norm([sd * 0.64, -0.77, -0.02]);
  const rings = [
    { C: add(Js, [sd * 0.03 * k, -0.012, -0.004]), n: n1, r: quad4(0.05 * R * k, 0.052 * R * k, 0.047 * R * k, 0.042 * R * k) },
    { C: madd(add(Js, [sd * 0.012 * k, 0, 0]), du, 0.075 * L.k), n: du, r: quad4(0.047 * R * k, 0.049 * R * k, 0.049 * R * k, 0.041 * R * k) },
    { C: madd(Js, du, L.armLen * 0.45), n: du, r: quad4(0.044 * R * k, 0.045 * R * k, 0.04 * R * k, 0.038 * R * k) },
    { C: madd(Js, du, L.armLen * 0.76), n: du, r: quad4(0.038 * R * k, 0.039 * R * k, 0.035 * R * k, 0.035 * R * k) },
    { C: Je, n: norm(add(du, df)), r: quad4(0.033 * Rf * k, 0.037 * Rf * k, 0.034 * Rf * k, 0.035 * Rf * k) },
    { C: madd(Je, df, L.foreLen * 0.2), n: df, r: quad4(0.036 * Rf * k, 0.034 * Rf * k, 0.039 * Rf * k, 0.036 * Rf * k) },
    { C: madd(Je, df, L.foreLen * 0.48), n: df, r: quad4(0.031 * Rf * k, 0.029 * Rf * k, 0.031 * Rf * k, 0.029 * Rf * k) },
    { C: madd(Je, df, L.foreLen * 0.76), n: df, r: quad4(0.027 * k, 0.025 * k, 0.024 * k, 0.022 * k) },
    { C: Jw, n: df, r: quad4(0.0275 * k, 0.026 * k, 0.019 * k, 0.018 * k) },
  ];
  rings.forEach((rg, i) => {
    const { pts } = ringAround(rg.C, rg.n, sd, rg.r);
    arm.A[i + 1].forEach((v, kk) => set(v, pts[kk]));
  });
  // —— 手：掌心朝内（−U），大拇指朝前（+F）——
  const dh = norm(add(df, [0, 0, 0.02]));
  const hl = L.handLen, hw = L.handW;
  const palm = [
    { d: 0.018, rf: hw * 0.82, ru: 0.0165 * k },
    { d: 0.046, rf: hw * 0.95, ru: 0.016 * k },
    { d: 0.088, rf: hw * 0.98, ru: 0.0135 * k },
  ];
  let frame = null;
  palm.forEach((pp, i) => {
    const r = ringAround(madd(Jw, dh, pp.d * hl / 0.185), dh, sd, () => [pp.rf, pp.ru], NA, 4);
    frame = r;
    arm.P[i].forEach((v, kk) => set(v, r.pts[kk]));
  });
  const { F, U } = frame;
  // 手指：食指 … 小指，长度、粗细；每个关节往掌心弯一点
  const spec = [
    { len: 0.074, w: 0.0175, spread: 0.1 },
    { len: 0.083, w: 0.018, spread: 0.02 },
    { len: 0.078, w: 0.017, spread: -0.06 },
    { len: 0.061, w: 0.0152, spread: -0.14 },
  ];
  const sc = hl / 0.185;
  placeFingers(arm, sd, dh, F, U, spec, sc, set);
  placeThumb(arm, sd, dh, F, U, sc, set);
}

function placeFingers(arm, sd, dh, F, U, spec, sc, set) {
  const get = set.get;
  arm.fingers.forEach((R4, f) => {
    const sp = spec[f];
    const b = R4[0].map(get);
    const c0 = [0, 1, 2, 3].reduce((a, i) => add(a, mul(b[i], 0.25)), [0, 0, 0]);
    // 方向：沿手掌方向，向前（食指）或向后（小指）张开一点
    let dir = norm(madd(dh, F, sp.spread));
    const len = sp.len * sc, w = sp.w * sc, t = sp.w * 0.86 * sc;
    const curl = [0.16, 0.3, 0.26, 0.12];
    const along = [0.3, 0.52, 0.76, 0.95];
    let p = c0, prev = 0;
    for (let i = 0; i < FINGER_RINGS; i++) {
      const seg = (along[i] - prev) * len;
      prev = along[i];
      // 往掌心（−U）弯
      dir = norm(madd(dir, U, -Math.tan(curl[i]) ));
      p = madd(p, dir, seg);
      const Fi = norm(madd(F, dir, -dot(F, dir)));
      const Ui = mul(cross(Fi, dir), sd);
      const taper = 1 - 0.22 * (i / (FINGER_RINGS - 1));
      const ww = w * 0.5 * taper, tt = t * 0.5 * taper;
      const corners = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
      R4[i + 1].forEach((v, kk) => {
        const [cf, cu] = corners[kk];
        set(v, add(add(p, mul(Fi, cf * ww)), mul(Ui, cu * tt)));
      });
    }
  });
}

function placeThumb(arm, sd, dh, F, U, sc, set) {
  const get = set.get;
  const b = arm.thumb[0].map(get);
  const c0 = [0, 1, 2, 3].reduce((a, i) => add(a, mul(b[i], 0.25)), [0, 0, 0]);
  let dir = norm(add(add(mul(F, 0.72), mul(dh, 0.6)), mul(U, -0.3)));
  const segs = [0.026, 0.024, 0.022].map((x) => x * sc);
  const w = 0.021 * sc;
  let p = c0;
  for (let i = 0; i < THUMB_RINGS; i++) {
    dir = norm(add(dir, mul(dh, 0.12)));
    p = madd(p, dir, segs[i]);
    const A = norm(madd(dh, dir, -dot(dh, dir)));
    const B = mul(norm(cross(dir, A)), 1);
    // B 指向手背一侧（+U）
    const Bs = dot(B, U) >= 0 ? B : mul(B, -1);
    const taper = 1 - 0.18 * i / (THUMB_RINGS - 1);
    const ww = w * 0.5 * taper, tt = w * 0.45 * taper;
    const corners = [[-1, 1], [1, 1], [1, -1], [-1, -1]];
    arm.thumb[i + 1].forEach((v, kk) => {
      const [ca, cb] = corners[kk];
      set(v, add(add(p, mul(A, ca * ww)), mul(Bs, cb * tt)));
    });
  }
}

// —— 腿：每圈的角度 φ（0 前、90 外侧、180 后、270 内侧）——
const LEG_PHI = [315, 340, 5, 30, 60, 90, 120, 150, 175, 200, 225, 270].map((d) => d * D2R);

function placeLeg(leg, sd, J, L, set) {
  const { Jh, Jk, Ja } = J;
  const k = L.kw, T = L.thighR / 0.086, C = L.calfR / 0.058;
  const along = (y) => {
    // 骨骼折线上高度为 y 的点
    if (y >= Jk[1]) { const t = (Jh[1] - y) / (Jh[1] - Jk[1]); return [lerp(Jh[0], Jk[0], t), y, lerp(Jh[2], Jk[2], t)]; }
    const t = (Jk[1] - y) / (Jk[1] - Ja[1]);
    return [lerp(Jk[0], Ja[0], t), y, lerp(Jk[2], Ja[2], t)];
  };
  const cr = L.crotch, kn = L.kneeY, an = L.ankleY;
  // [y, 前, 后, 外, 内, 中心的横向偏移]
  const st = [
    [cr - 0.04 * L.k, 0.074 * T, 0.083 * T, 0.081 * T, 0.072 * T, -0.004],
    [cr - 0.125 * L.k, 0.071 * T, 0.072 * T, 0.074 * T, 0.064 * T, -0.002],
    [lerp(cr, kn, 0.56), 0.063 * T, 0.06 * T, 0.062 * T, 0.056 * T, 0],
    [kn + 0.068 * L.k, 0.055 * T, 0.052 * T, 0.052 * T, 0.053 * T, 0.0],
    [kn + 0.012 * L.k, 0.053, 0.048, 0.048, 0.05, 0.0],
    [kn - 0.045 * L.k, 0.047 * C, 0.054 * C, 0.048 * C, 0.048 * C, 0],
    [kn - 0.12 * L.k, 0.044 * C, 0.063 * C, 0.05 * C, 0.053 * C, 0],
    [lerp(kn, an, 0.56), 0.039 * C, 0.046 * C, 0.041 * C, 0.042 * C, 0],
    [an + 0.07 * L.k, 0.031 * k, 0.034 * k, 0.033 * k, 0.032 * k, 0],
    [an + 0.026 * L.k, 0.03 * k, 0.033 * k, 0.036 * k, 0.035 * k, 0],
  ];
  st.forEach(([y, rf, rb, rl, rm, dx], i) => {
    const c = along(y);
    leg.L[i + 1].forEach((v, m) => {
      const ph = LEG_PHI[m];
      const cp = Math.cos(ph), sp = Math.sin(ph);
      const x = (sp >= 0 ? rl : rm) * se(sp, 2.2) * (i === 0 && sp < 0 ? 0.92 : 1);
      const z = (cp >= 0 ? rf : rb) * se(cp, 2.2);
      set(v, [c[0] + sd * (x + dx), c[1] + (i === 0 ? -0.012 * Math.max(0, -cp) : 0), c[2] + z]);
    });
  });
  // —— 脚：五圈从水平（脚踝）转到竖直（脚掌），截面的“前”转成朝上 ——
  const fl = L.footLen / 0.26;
  const toe = 0.09; // 脚尖略向外撇（弧度）
  const fwd = [sd * Math.sin(toe), 0, Math.cos(toe)];
  const lat = [sd * Math.cos(toe), 0, -Math.sin(toe)];
  const fst = [
    // [γ, 往前, 中心高, 前(脚背), 后(脚底/脚跟), 外, 内]
    [28, -0.006, 0.042, 0.034, 0.05, 0.034, 0.034],
    [62, 0.03, 0.04, 0.033, 0.034, 0.04, 0.039],
    [84, 0.078, 0.033, 0.03, 0.033, 0.043, 0.042],
    [90, 0.142, 0.024, 0.022, 0.024, 0.048, 0.047],
    [92, 0.188, 0.017, 0.015, 0.017, 0.043, 0.045],
  ];
  fst.forEach(([gd, f, h, rf, rb, rl, rm], i) => {
    const g = gd * D2R;
    const C0 = [Ja[0] + fwd[0] * f * fl, h * L.k, Ja[2] + fwd[2] * f * fl];
    const Fv = [fwd[0] * Math.cos(g), Math.sin(g), fwd[2] * Math.cos(g)];
    leg.F[i + 1].forEach((v, m) => {
      const ph = LEG_PHI[m];
      const cp = Math.cos(ph), sp = Math.sin(ph);
      const a = (sp >= 0 ? rl : rm) * se(sp, 2.4) * fl;
      const b = (cp >= 0 ? rf : rb) * se(cp, 2.4) * fl;
      let q = add(add(C0, mul(lat, a)), mul(Fv, b));
      q[1] = Math.max(q[1], 0.0015);
      set(v, q);
    });
  });
  // 脚尖：3 × 3 网格的 4 个内部点，往前推出圆头
  const G = leg.toe, get = set.get;
  for (let i = 1; i < 3; i++) for (let j = 1; j < 3; j++) {
    const P = (a, b) => get(G[a][b]);
    const u = i / 3, w = j / 3;
    const q = [0, 0, 0];
    for (let c = 0; c < 3; c++) {
      q[c] = (1 - w) * P(i, 0)[c] + w * P(i, 3)[c] + (1 - u) * P(0, j)[c] + u * P(3, j)[c]
        - ((1 - u) * (1 - w) * P(0, 0)[c] + u * (1 - w) * P(3, 0)[c] + (1 - u) * w * P(0, 3)[c] + u * w * P(3, 3)[c]);
    }
    set(G[i][j], madd(q, fwd, 0.022 * fl));
  }
}

const HEAD_CACHE = new Map();

function placeNeckAndHead(topo, p, L, set, get) {
  const F = headFeatures(p);
  const g = L.g;
  // 头部局部坐标 → 世界：原点（两眼中点）在头顶往下 0.113·g，略靠前
  const O = [0, L.crown - 0.113 * g, 0.006 * g];
  // 头的格点只和脸型参数、脖子粗细有关：拖身高、胖瘦以外的滑杆时直接用上一次的结果（投射线是整个求值里最慢的一步）
  const nr = (L.neckR / g) * 0.98;
  const key = JSON.stringify([F, Math.round(nr * 1e5)]);
  let hit = HEAD_CACHE.get(key);
  if (!hit) {
    const local = new Map();
    const hset = (v, q) => { if (v >= 0) local.set(v, q); };
    hset.get = (v) => local.get(v);
    const sdf = headSDF(F, nr);
    placeHead(topo, F, sdf, hset);
    hit = { local, sdf };
    HEAD_CACHE.set(key, hit);
    if (HEAD_CACHE.size > 24) HEAD_CACHE.delete(HEAD_CACHE.keys().next().value);
  }
  const local = new Map(hit.local);
  const hset = (v, q) => { if (v >= 0) local.set(v, q); };
  hset.get = (v) => local.get(v);
  const sdf = hit.sdf;
  Object.assign(F, { smile: p.smile, frown: p.frown, jawOpen: p.jawOpen, blinkL: Math.max(p.blink, p.blinkL), blinkR: Math.max(p.blink, p.blinkR) });
  placeFeatures(topo, F, sdf, hset);
  for (const [v, q] of local) set(v, [O[0] + q[0] * g, O[1] + q[1] * g, O[2] + q[2] * g]);
  // 脖子：在 T11（脖子根）和 H0（下巴底下 / 后颈）之间插三圈，推到脖子的半径上
  const base = topo.T[NT - 1].map(get), top = topo.H[0].map(get);
  const cBase = [0, base.reduce((a, q) => a + q[1], 0) / NC, base.reduce((a, q) => a + q[2], 0) / NC];
  const cTop = [0, top.reduce((a, q) => a + q[1], 0) / NC, top.reduce((a, q) => a + q[2], 0) / NC];
  for (let i = 0; i < NN; i++) {
    const t = (i + 1) / (NN + 1);
    const c = [0, lerp(cBase[1], cTop[1], t), lerp(cBase[2], cTop[2], t)];
    for (let j = 0; j < NC; j++) {
      const q = [lerp(base[j][0], top[j][0], t), lerp(base[j][1], top[j][1], t), lerp(base[j][2], top[j][2], t)];
      const th = colTheta(j);
      const front = Math.cos(th);
      // 理想的脖子截面：略扁的椭圆（前后稍长），喉结（男性）在正前方
      const rx = L.neckR, rz = L.neckR * 1.04;
      const ideal = [rx * Math.sin(th), q[1], c[2] + rz * front + (1 - L.s) * 0.006 * L.kw * Math.exp(-(((th > Math.PI ? th - 2 * Math.PI : th) / 0.25) ** 2)) * (i === 1 ? 1 : 0.4)];
      const w = Math.sin(Math.PI * t) * 0.9;
      set(topo.N[i][j], [lerp(q[0], ideal[0], w), q[1], lerp(q[2], ideal[2], w)]);
    }
  }
  return { F, O, g, sdf };
}

export { placeNeckAndHead };
