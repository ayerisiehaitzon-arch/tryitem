import { NH, NC, CAP, EYE_RINGS, MOUTH_RINGS, EAR_RINGS, mirrorCol } from './topology.js';

// 头：在“头部局部坐标”里造型（原点在两眼中点，y 朝上，z 朝前，单位米，按 1.72m 身高的平均头长 0.226m 设计），
// 再整体缩放、平移到脖子上。
//
// 形状由一个有符号距离场（SDF）描述：颅骨、脸、下颌、下巴、颧骨、脸颊、眉弓、鼻子、口鼻部、脖子几块光滑并起来，
// 眼窝再光滑地挖掉一块。控制网格的格点从外面打射线落到这个曲面上：
//   正面五列（j = 0、±1 … ±4）按 (x, y) 从正前方往后投（像一张高度图），五官的列和行跟着参数对齐 ——
//     眼睛的洞框住眼睛、嘴的洞框住嘴、鼻尖正好落在 j = 0 的 H6 上；
//   侧面、后面的列从头的竖轴水平往外打；下巴底下那一行（H0）从下往上打。
// 眼睑、嘴唇、耳朵这几圈不在曲面上，按五官参数直接摆：眼睑三圈贴着眼球的球面，嘴唇三圈画出唇形，耳朵三圈画出耳廓。

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

function smin(a, b, k) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}
const smax = (a, b, k) => -smin(-a, -b, k);

function ell(x, y, z, rx, ry, rz) {
  const ux = x / rx, uy = y / ry, uz = z / rz, vx = ux / rx, vy = uy / ry, vz = uz / rz;
  const k0 = Math.sqrt(ux * ux + uy * uy + uz * uz);
  const k1 = Math.sqrt(vx * vx + vy * vy + vz * vz);
  return k1 < 1e-9 ? -Math.min(rx, ry, rz) : (k0 * (k0 - 1)) / k1;
}
// “方圆”的形体：横截面（x–z）和竖直方向都用 2 范数和 4 范数的加权和代替超椭圆（w = 1 是椭圆，w 越小越方；
// w = 0.45 ≈ 指数 2.7，0.52 ≈ 2.6，0.65 ≈ 2.4 —— 在坐标轴上和对角线上都一样）。只用乘法和开方，比 Math.pow 快得多。
// 距离取一阶近似 f/|∇f|
function sell(x, y, z, rx, ry, rz, wn, wm) {
  const ax = Math.abs(x) / rx, az = Math.abs(z) / rz, ay = Math.abs(y) / ry;
  const ax2 = ax * ax, az2 = az * az;
  const l2 = Math.sqrt(ax2 + az2), l4 = Math.sqrt(Math.sqrt(ax2 * ax2 + az2 * az2));
  const g = wn * l2 + (1 - wn) * l4;
  const g2 = g * g, ay2 = ay * ay;
  const m2 = Math.sqrt(g2 + ay2), m4 = Math.sqrt(Math.sqrt(g2 * g2 + ay2 * ay2));
  const f = wm * m2 + (1 - wm) * m4;
  if (l2 < 1e-9 || m2 < 1e-9) return (f - 1) * Math.min(rx, ry, rz);
  const kg = (1 - wn) / (l4 * l4 * l4), kf = (1 - wm) / (m4 * m4 * m4);
  const fg = wm * g / m2 + kf * g2 * g, fy = wm * ay / m2 + kf * ay2 * ay;
  const dx = fg * (wn * ax / l2 + kg * ax2 * ax) / rx, dz = fg * (wn * az / l2 + kg * az2 * az) / rz, dy = fy / ry;
  return (f - 1) / Math.sqrt(dx * dx + dy * dy + dz * dz);
}
// 两端半径不同的胶囊
function cone(px, py, pz, a, b, ra, rb) {
  const bx = b[0] - a[0], by = b[1] - a[1], bz = b[2] - a[2];
  const qx = px - a[0], qy = py - a[1], qz = pz - a[2];
  const h = clamp((qx * bx + qy * by + qz * bz) / (bx * bx + by * by + bz * bz), 0, 1);
  const dx = qx - bx * h, dy = qy - by * h, dz = qz - bz * h;
  return Math.sqrt(dx * dx + dy * dy + dz * dz) - lerp(ra, rb, h);
}

// —— 由参数得到五官的位置、尺寸（头部局部坐标，未缩放）——
export function headFeatures(p) {
  const s = p.sex, fat = p.weight;
  const fw = 1 + 0.07 * p.faceWidth - 0.035 * s + 0.045 * fat;           // 脸宽
  const fl = 1 + 0.06 * p.faceLength;                                   // 脸长（眼睛以下）
  const F = { s, fw, fl };
  // 眼睛
  const R = 0.0121 * (1 + 0.05 * p.eyeSize);
  F.eye = {
    x: 0.0318 * (1 + 0.085 * p.eyeSpacing) * Math.sqrt(fw),
    y: 0.0015 + 0.0065 * p.eyeHeight,
    z: 0.0695 - 0.002 * p.eyeSpacing,
    R,
    // 睑裂的半宽（方位角，弧度）、上下睑的高度（仰角）、外眼角上挑
    w: 1.22 + 0.1 * p.eyeSize + 0.05 * s,
    hu: 0.47 + 0.07 * p.eyeSize + 0.1 * p.eyeOpen + 0.05 * s,
    hl: 0.46 + 0.05 * p.eyeSize + 0.06 * p.eyeOpen + 0.02 * s,
    tilt: 0.09 * p.eyeTilt + 0.03 * s,
    lid: p.lid,
  };
  // 鼻子
  const nl = 1 + 0.12 * p.noseLength;
  F.nose = {
    bridgeY: 0.013,
    tipY: -0.031 * nl * fl,
    baseY: -0.043 * nl * fl,
    rootH: 0.003 + 0.004 * p.noseBridge,                          // 鼻根（两眼之间）的高度
    tipH: (0.0145 + 0.0035 * p.noseBridge + 0.002 * p.noseSize) * (1 - 0.14 * s), // 鼻尖处鼻梁的高度
    ball: 0.0047 * (1 + 0.35 * p.noseSize),                        // 鼻头
    tipR: 0.0068 * (1 + 0.14 * p.noseSize) * (1 - 0.06 * s),
    alaX: 0.0108 * (1 + 0.18 * p.noseWidth) * (1 - 0.1 * s),
    alaH: 0.0062 * (1 + 0.12 * p.noseWidth),
    up: 0.003 * p.noseTip,
  };
  // 嘴
  const chinY = -0.11 * fl * (1 + 0.06 * p.chin) * (1 - 0.035 * s);
  F.mouth = {
    // 嘴在鼻底和下巴之间按比例放（鼻子、下巴怎么变，嘴都不会跑到它们外面去）
    y: lerp(F.nose.baseY, chinY, 0.36 - 0.04 * p.mouthHeight),
    w: 0.0242 * (1 + 0.13 * p.mouthWidth) * (1 - 0.03 * s),
    up: 0.0092 * (1 + 0.28 * p.lips + 0.12 * s) * (1 + 0.22 * p.upperLip),
    lo: 0.0108 * (1 + 0.3 * p.lips + 0.12 * s) * (1 - 0.18 * p.upperLip),
    full: 0.0046 * (1 + 0.45 * p.lips + 0.25 * s),
    corner: 0.0025 * p.mouthCorner,
  };
  // 下巴、下颌
  F.chin = {
    y: chinY,
    z: 0.082 + 0.009 * p.chinForward,
    w: 0.019 * (1 + 0.22 * p.chinWidth) * (1 - 0.24 * s + 0.1 * fat),
  };
  F.jaw = { x: 0.0545 * fw * (1 + 0.1 * p.jaw - 0.11 * s + 0.06 * fat), y: -0.076 * fl, z: -0.014 };
  F.jawK = 1 + 0.8 * p.jaw - 0.5 * s;
  F.cheekbone = 1 + 0.5 * p.cheekbones;
  F.cheek = 1 + 0.45 * p.cheeks + 0.5 * Math.max(0, fat) - 0.25 * Math.max(0, -fat) + 0.18 * s;
  F.forehead = 1 + 0.06 * p.forehead;
  F.brow = { ridge: 1 - 0.45 * s };
  F.ear = {
    size: 1 + 0.12 * p.earSize,
    out: 0.3 + 0.2 * p.earOut,
    point: p.earPoint,
  };
  return F;
}

// —— 头的 SDF ——
// 底子是三个光滑并起来的椭球（颅骨、中脸、下脸），五官全是叠在上面的高斯鼓包 / 凹陷（沿法线方向推出去）：
// 高斯和高斯之间天然光滑过渡，不会像椭球求并那样在交界处挤出折痕。
export function headSDF(F, neckR) {
  const { fw, fl } = F;
  const E = F.eye, N = F.nose, M = F.mouth, C = F.chin, J = F.jaw;
  const B = [];
  // c 中心、s 三个方向的标准差、a 高度（米，正的往外鼓）、m 左右对称（按 |x| 算）
  const bump = (c, s, a, m = true) => { if (a) B.push({ c, k: s.map((v) => 1 / (2 * v * v)), a, m }); };
  const ridge = F.brow.ridge;
  bump([0.029, 0.025, 0.08], [0.019, 0.0075, 0.03], 0.0034 * ridge);              // 眉弓
  bump([0, 0.02, 0.085], [0.012, 0.008, 0.03], 0.003 * ridge, false);             // 眉间
  bump([E.x, E.y + 0.001, 0.085], [0.0155, 0.0115, 0.03], -0.0095);               // 眼窝
  bump([E.x + 0.01, E.y - 0.014, 0.08], [0.014, 0.006, 0.03], 0.0016);            // 下眼眶
  bump([0.05 * fw, -0.014, 0.06], [0.015, 0.011, 0.03], 0.0046 * F.cheekbone);    // 颧骨
  bump([0.033, -0.03, 0.075], [0.014, 0.014, 0.03], 0.003 * F.cheek);              // 苹果肌
  bump([0.052 * fw, -0.052, 0.05], [0.012, 0.014, 0.03], -0.0034 * (1.6 - F.cheek)); // 颧下的凹
  bump([0.069, 0.03, 0.03], [0.01, 0.02, 0.025], -0.0026);                         // 太阳穴
  bump([0, M.y + 0.013, 0.08], [0.026, 0.017, 0.03], 0.0045, false);               // 口鼻部（牙弓）：鼻翼下面那块往前，朝前受光
  bump([0, C.y + 0.017, 0.078], [0.013 * (C.w / 0.019), 0.011, 0.03], 0.012 + 0.006 * (C.z - 0.082) / 0.009, false);  // 下巴
  bump([0, 0.058, 0.075], [0.04, 0.024, 0.03], 0.0035 * F.forehead, false);       // 额头
  bump([0, 0.008, 0.09], [0.011, 0.008, 0.03], -0.005, false);                     // 鼻根的凹（眉间和鼻梁之间）
  bump([0, M.y - M.lo - 0.007, 0.085], [0.014, 0.0055, 0.03], -0.0034, false);    // 颏唇沟
  bump([J.x, J.y + 0.004, J.z + 0.02], [0.008, 0.012, 0.025], 0.0032 * F.jawK);   // 下颌角
  bump([0, -0.006, -0.1], [0.04, 0.03, 0.025], 0.0055, false);                     // 后脑勺
  // 鼻子：鼻梁（越往下越高、越宽）+ 鼻头 + 两侧鼻翼
  const nose = (ax, x, y, z) => {
    if (z < 0.05 || y > N.bridgeY + 0.02 || y < N.baseY - 0.012) return 0;
    const t = clamp((N.bridgeY - y) / (N.bridgeY - N.tipY), 0, 1);
    const win = sstep(N.bridgeY + 0.012, N.bridgeY - 0.002, y) * sstep(N.baseY - 0.003, N.tipY - 0.004, y);
    const w = lerp(0.005, 0.0066, t);
    let h = lerp(N.rootH, N.tipH, t ** 1.15) * Math.exp(-(x * x) / (2 * w * w)) * win;
    const dy = y - N.tipY - N.up;
    h += N.ball * Math.exp(-(x * x) / (2 * N.tipR ** 2) - (dy * dy) / (2 * (N.tipR * 0.9) ** 2));
    const ay = y - N.baseY - 0.0045, ax2 = ax - N.alaX;
    // 鼻翼：上面缓、下面陡（鼻底是窄窄一条阴影，而不是一大片朝下的斜面）
    const sy = ay > 0 ? 0.0058 : 0.0034;
    h += N.alaH * Math.exp(-(ax2 * ax2) / (2 * 0.0046 ** 2) - (ay * ay) / (2 * sy * sy));
    return h;
  };
  return (x, y, z) => {
    const ax = Math.abs(x);
    // 颅骨：竖直方向略“方”的超椭圆 —— 头顶比椭球宽，额头更直
    let d = sell(x, y - 0.021, z + 0.014, 0.0768 * Math.sqrt(fw), 0.095 * F.forehead, 0.1, 1, 0.65);
    d = smin(d, ell(x, y + 0.018, z - 0.013, 0.067 * fw, 0.066, 0.075), 0.03);
    // 下脸：从下颌角往下巴收窄（宽度按高度插值），下巴才是尖的 / 方的，而不是一个圆盘
    // 截面是超椭圆：下巴前面一整片是平的，两腮沿下颌往后收，而不是一个往前伸的尖嘴
    {
      const t = sstep(J.y + 0.03, C.y - 0.004, y); // 光滑的过渡（夹断的线性插值会在下颌那一圈留下一道棱）
      const rx = lerp(J.x + 0.008, C.w * 1.1 + 0.009, t);
      const bot = C.y - 0.014, cy = (bot - 0.025) / 2, ry = (-0.025 - bot) / 2;
      d = smin(d, sell(x, y - cy, z - 0.014, rx, ry, 0.07, 0.45, 0.52), 0.04);
    }
    d = smin(d, cone(x, y, z, [0, -0.04, -0.03], [0, -0.26, -0.02], neckR, neckR * 1.04), 0.03);
    let h = nose(ax, x, y, z);
    for (const b of B) {
      const dx = (b.m ? ax : x) - b.c[0], dy = y - b.c[1], dz = z - b.c[2];
      const e = dx * dx * b.k[0] + dy * dy * b.k[1] + dz * dz * b.k[2];
      if (e < 12) h += b.a * Math.exp(-e);
    }
    return d - h;
  };
}

// 沿射线找曲面：从外面（t = t0）往里走，第一次进到里面就二分
function march(sdf, o, dir, t0, t1 = 0) {
  let t = t0;
  let prev = t0;
  const at = (t) => sdf(o[0] + dir[0] * t, o[1] + dir[1] * t, o[2] + dir[2] * t);
  let d = at(t);
  if (d <= 0) return t0;
  while (t > t1) {
    const step = Math.min(Math.max(Math.abs(d) * 0.6, 0.0004), 0.003);
    prev = t;
    t = Math.max(t - step, t1);
    d = at(t);
    if (d <= 0) break;
    if (t === t1) return t1;
  }
  let a = t, b = prev; // a 在里面，b 在外面
  for (let i = 0; i < 18; i++) {
    const m = (a + b) / 2;
    if (at(m) <= 0) a = m; else b = m;
  }
  return (a + b) / 2;
}

// 正面投影：从 z = +0.25 往 −z 方向找第一个表面（march 的 t 从 t0 往 t1 递减：起点放在后面，t 大的一端在前面）
function projFront(sdf, x, y) {
  const o = [x, y, -0.3], dir = [0, 0, 1];
  const t = march(sdf, o, dir, 0.55, 0.0);
  return [x, y, -0.3 + t];
}
// 侧面投影：从竖轴 (0, y, zc) 沿水平方向 θ 往外找表面
function projSide(sdf, y, th, zc = -0.01) {
  const dir = [Math.sin(th), 0, Math.cos(th)];
  const o = [0, y, zc];
  const t = march(sdf, o, dir, 0.2, 0.0);
  return [dir[0] * t, y, zc + dir[2] * t];
}
// 从下往上投（下巴底下）
function projUp(sdf, x, z) {
  const o = [x, 0.0, z], dir = [0, -1, 0];
  const t = march(sdf, o, dir, 0.26, 0.0);
  return [x, -t, z];
}
// 最近点：沿梯度把一个点推到曲面上（下巴底下那一圈：从哪个方向打射线都可能落到脖子很低的地方）
function projNearest(sdf, p) {
  let [x, y, z] = p;
  const h = 1e-4;
  for (let i = 0; i < 8; i++) {
    const d = sdf(x, y, z);
    const gx = (sdf(x + h, y, z) - sdf(x - h, y, z)) / (2 * h);
    const gy = (sdf(x, y + h, z) - sdf(x, y - h, z)) / (2 * h);
    const gz = (sdf(x, y, z + h) - sdf(x, y, z - h)) / (2 * h);
    const g2 = gx * gx + gy * gy + gz * gz || 1;
    x -= (d * gx) / g2; y -= (d * gy) / g2; z -= (d * gz) / g2;
    if (Math.abs(d) < 1e-6) break;
  }
  return [x, y, z];
}
// 从某点沿任意方向往回找（头顶网格）
function projRay(sdf, o, dir) {
  const t = march(sdf, o, dir, 0.22, 0.0);
  return [o[0] + dir[0] * t, o[1] + dir[1] * t, o[2] + dir[2] * t];
}

// 侧面、后面各列的水平角度（左侧；右侧取负）
const SIDE_TH = { 4: 53, 5: 73, 6: 93, 7: 113, 8: 135, 9: 158, 10: 180 };
// 后脑勺每一行的高度
const BACK_Y = [-0.05, -0.037, -0.025, -0.014, -0.003, 0.008, 0.019, 0.03, 0.041, 0.052, 0.062, 0.071, 0.08, 0.089, 0.097];

// 正面各行：[y0, [x1, y1], [x2, y2], [x3, y3], [x4, y4]]（左侧，头部局部坐标；第 4 列只用 y，从侧面投）。
// H0、H1 不在这里：下巴底下和下颌下缘用最近点投影单独摆
function frontRows(F) {
  const E = F.eye, N = F.nose, M = F.mouth, C = F.chin, J = F.jaw, fw = F.fw;
  const ew = E.R * Math.sin(E.w) + 0.0016; // 睑裂半宽（米）
  const eh = E.R * Math.sin(E.hu);
  const exIn = E.x - ew * 1.02 - 0.0045, exOut = E.x + ew * 1.05 + 0.006;
  const rows = [];
  // 下唇下面那一行（嘴洞的下沿）和下巴最前面那一行：始终按比例夹在嘴和下巴底之间
  const y3 = Math.max(M.y - M.lo - 0.0072, C.y + 0.017), y2 = Math.max(lerp(C.y, y3, 0.42), C.y + 0.0095);
  const y2s = Math.max(J.y - 0.002, Math.min(J.y - 0.0005, M.y - 0.012));
  // 第 3 列在下颌的侧面：H2 取 H3 和下颌下缘（H1，约在下巴和下颌角连线上）中间，两行不会挤到同一高度
  const y3c3 = Math.max(M.y - 0.012, y3 + 0.001);
  rows[2] = [y2, [0.0135, y2 + 0.0015], [0.028, lerp(y2, y3, 0.3) + 0.002], [0.042 * fw, Math.min(y3c3 - 0.0068, lerp(C.y, J.y, 0.5) + 0.009)], [0, y2s]];
  rows[3] = [y3, [0.011, y3 + 0.0004], [M.w + 0.005, Math.max(M.y - M.lo * 0.75 - 0.005, y3 + 0.002)], [0.046 * fw, y3c3], [0, Math.max(M.y - 0.006, y2s + 0.004)]];
  rows[4] = [null, [null, null], [M.w + 0.0065, M.y + M.corner], [0.048 * fw, M.y], [0, M.y + 0.005]];
  // 上唇上面那一行（嘴洞的上沿）不能高过鼻底
  const y5 = Math.min(M.y + M.up + 0.0072, N.baseY - 0.003);
  rows[5] = [y5, [0.011, Math.min(M.y + M.up + 0.0075, N.baseY - 0.0005)], [M.w + 0.0045, Math.min(M.y + M.up * 0.7 + 0.0062, N.baseY + 0.001)], [0.047 * fw, N.baseY - 0.005], [0, N.baseY + 0.002]];
  rows[6] = [N.baseY, [N.alaX * 1.08, N.baseY + 0.0035], [0.031, N.baseY + 0.005], [0.049 * fw, N.baseY + 0.007], [0, N.baseY + 0.012]];
  rows[7] = [N.tipY, [N.alaX * 0.8, N.tipY + 0.004], [0.03, lerp(N.tipY, E.y - eh, 0.45)], [0.05 * fw, lerp(N.tipY, E.y - eh, 0.5)], [0, -0.012]];
  rows[8] = [E.y - 0.011, [exIn + 0.002, E.y - eh * 0.95 - 0.0045], [E.x, E.y - eh * 1.15 - 0.006], [exOut - 0.001, E.y - eh * 0.75 - 0.004], [0, E.y - 0.006]];
  rows[9] = [E.y + 0.0015, [exIn, E.y - 0.0005], [null, null], [exOut, E.y + E.tilt * 0.012], [0, E.y + 0.003]];
  rows[10] = [E.y + 0.011, [exIn + 0.0015, E.y + eh * 1.25 + 0.0055], [E.x, E.y + eh * 1.55 + 0.0068], [exOut - 0.001, E.y + eh * 1.05 + 0.0058], [0, E.y + 0.013]];
  rows[11] = [0.029, [0.017, 0.029], [E.x, 0.031], [E.x + 0.021, 0.029], [0, 0.027]];
  rows[12] = [0.052, [0.018, 0.052], [0.035, 0.051], [0.05, 0.049], [0, 0.046]];
  rows[13] = [0.076, [0.017, 0.076], [0.033, 0.075], [0.047, 0.072], [0, 0.069]];
  rows[14] = [0.096, [0.014, 0.096], [0.027, 0.094], [0.039, 0.091], [0, 0.088]];
  return rows;
}

// —— 头的全部控制点（头部局部坐标）。返回 { put(index, p) 之后由 body.js 变换到世界坐标 } ——
export function placeHead(topo, F, sdf, set) {
  const { H } = topo;
  const rows = frontRows(F);
  const E = F.eye;
  const sideTH = (j) => (j <= 10 ? SIDE_TH[j] : -SIDE_TH[NC - j]) * Math.PI / 180;
  const half = (j) => (j <= 10 ? j : NC - j);
  const sgn = (j) => (j > 10 ? -1 : 1);
  // 侧面均匀的行高：H1（下颌角）到 H13
  const y2 = rows[2][4][1], y14 = rows[14][4][1];
  const sideRow = (r) => lerp(y2, y14, (r - 2) / 12);
  for (let r = 0; r < NH; r++) {
    const row = rows[r];
    for (let j = 0; j < NC; j++) {
      const v = H[r][j];
      if (v < 0) continue;
      const h = half(j), sg = sgn(j);
      if (r <= 1) {
        // H0 下巴底下、H1 下颌下缘：正面四列在“下巴 → 下颌角”这条线的前 60% 上取点，推到最近的曲面上；
        // 下颌角本身和后面交给侧面投影（否则下颌角那一列会跑到后一列的后面，网格折起来）
        const C = F.chin, J = F.jaw;
        if (h <= 3) {
          const u = 0.62 * h / 3;
          if (r === 0) {
            const q = [sg * J.x * 0.9 * u ** 0.85, lerp(C.y - 0.007, J.y - 0.02, u ** 1.2), lerp(C.z - 0.03, J.z + 0.004, u ** 1.1)];
            set(v, projNearest(sdf, q));
          } else {
            // 下颌下缘：从下巴里面一点沿“斜向下、向前 / 向外”的方向打出去，落在下巴底的转角上
            const o = [sg * (J.x - 0.012) * u ** 0.8, lerp(C.y + 0.022, J.y + 0.012, u ** 1.3), lerp(C.z - 0.022, J.z - 0.006, u ** 1.4)];
            const dir = [sg * 0.75 * u / 0.62, -0.72, 0.69 * (1 - u)];
            const l = Math.hypot(...dir);
            set(v, projRay(sdf, o, dir.map((x) => x / l)));
          }
        } else {
          const t = sstep(53, 180, Math.abs(sideTH(j)) * 180 / Math.PI);
          const y0 = r === 0 ? J.y - 0.021 : J.y - 0.005;
          set(v, projSide(sdf, lerp(y0, BACK_Y[r], t), sideTH(j), -0.02));
        }
        continue;
      }
      if (h <= 3) {
        const x = h === 0 ? 0 : row[h][0], y = h === 0 ? row[0] : row[h][1];
        if (x === null || y === null) continue;
        set(v, projFront(sdf, sg * x, y));
      } else {
        // 侧面的行高：一半跟着正面五官走，一半在下颌和头顶之间均匀分布（行距不均会在拟合后变成波纹）
        const y4 = lerp(rows[r][4][1], sideRow(r), 0.55);
        const t = sstep(53, 180, Math.abs(sideTH(j)) * 180 / Math.PI);
        set(v, projSide(sdf, lerp(y4, BACK_Y[r], t), sideTH(j)));
      }
    }
  }
  // 眼睛周围的皮肤不能陷进眼球里：离眼球中心太近的格点沿径向推出去
  for (let r = 6; r <= 12; r++) for (let j = 0; j < NC; j++) {
    const v = H[r][j];
    if (v < 0) continue;
    const h = half(j);
    if (h > 4) continue;
    const q = set.get(v);
    const side = j > 10 ? -1 : 1;
    const c = [side * E.x, E.y, E.z];
    const d = [q[0] - c[0], q[1] - c[1], q[2] - c[2]];
    const l = Math.hypot(...d), m = E.R + 0.0052;
    if (l < m) set(v, [c[0] + (d[0] / l) * m, c[1] + (d[1] / l) * m, c[2] + (d[2] / l) * m]);
  }
  // —— 头顶：Coons 曲面插值出内部点，再从头的中心往外投到曲面上 ——
  {
    const G = topo.cap, a = G.length - 1, b = G[0].length - 1;
    const P = (v) => set.get(v);
    for (let i = 1; i < a; i++) for (let j = 1; j < b; j++) {
      const u = i / a, w = j / b;
      const p = [0, 0, 0];
      for (let k = 0; k < 3; k++) {
        p[k] = (1 - w) * P(G[i][0])[k] + w * P(G[i][b])[k] + (1 - u) * P(G[0][j])[k] + u * P(G[a][j])[k]
          - ((1 - u) * (1 - w) * P(G[0][0])[k] + u * (1 - w) * P(G[a][0])[k] + (1 - u) * w * P(G[0][b])[k] + u * w * P(G[a][b])[k]);
      }
      const o = [0, 0.0, -0.012];
      const d = [p[0] - o[0], p[1] - o[1] + 0.06, p[2] - o[2]];
      const l = Math.hypot(...d);
      set(G[i][j], projRay(sdf, o, [d[0] / l, d[1] / l, d[2] / l]));
    }
  }
  placeEars(topo, F, sdf, set);
}

// 眼睑、嘴唇：表情（眨眼、微笑）只动这两处，不用重新投整个头
export function placeFeatures(topo, F, sdf, set) {
  placeEyes(topo, F, set);
  placeMouth(topo, F, sdf, set);
}

// —— 眼睑：三圈都在以眼球中心为圆心的球面上 ——
// 睑裂的 8 个点：内眼角、上睑内 / 中 / 外、外眼角、下睑外 / 中 / 内（方位角 a，仰角 e）
export function lidOutline(F, side, blink = 0) {
  const E = F.eye;
  const w = E.w, hu = E.hu, hl = E.hl, tilt = E.tilt;
  const closeY = -hl * 0.55 + tilt * 0.1; // 闭眼时上睑落到的位置
  const up = (t, h) => lerp(h, closeY, blink * (0.85 + 0.15 * Math.abs(t)));
  return [
    [-w * 0.98, -0.02 - tilt * 0.35],
    [-w * 0.62, up(-0.62, hu * 0.86)],
    [-w * 0.02, up(0, hu * 1.02)],
    [w * 0.6, up(0.6, hu * 0.8 + tilt * 0.4)],
    [w * 1.02, tilt * 0.75],
    [w * 0.58, -hl * 0.72 + tilt * 0.2],
    [w * 0.0, -hl * 1.0],
    [-w * 0.6, -hl * 0.78 - tilt * 0.1],
  ];
}

function onEye(F, side, a, e, r) {
  const E = F.eye;
  // 眼球朝前略微向外（4°）
  const ca = Math.cos(a + 0.07), sa = Math.sin(a + 0.07), ce = Math.cos(e), se = Math.sin(e);
  return [side * (E.x + r * sa * ce), E.y + r * se, E.z + r * ca * ce];
}

function placeEyes(topo, F, set, blinkL = F.blinkL ?? 0, blinkR = F.blinkR ?? 0) {
  const E = F.eye;
  topo.eyes.forEach((rings, si) => {
    const side = si === 0 ? 1 : -1;
    const blink = si === 0 ? blinkL : blinkR;
    const lid = lidOutline(F, side, blink);
    // 1：眼睑外侧（双眼皮褶的位置），2：睑缘，3：睑内侧（贴着眼球）
    const fold = 1.32 + 0.12 * E.lid;
    const specs = [
      { k: fold, r: E.R + 0.0044 + 0.0006 * E.lid, ku: 1.22 + 0.18 * Math.max(0, E.lid) },
      { k: 1.0, r: E.R + 0.0027, ku: 1.0 },
      { k: 0.93, r: E.R + 0.0016, ku: 0.93 },
    ];
    specs.forEach((sp, i) => {
      const ring = rings[i + 1];
      lid.forEach(([a, e], k) => {
        const upper = k >= 1 && k <= 3;
        const ke = upper ? sp.ku : sp.k;
        set(ring[k], onEye(F, side, a * sp.k, e * ke, sp.r));
      });
    });
  });
}

// —— 嘴唇：唇外缘（唇线）、唇峰（最饱满的一圈）、唇内缘（上下合成一条缝）——
function placeMouth(topo, F, sdf, set) {
  const M = F.mouth;
  const zAt = (x, y) => projFront(sdf, x, y)[2];
  // 12 个点的横坐标（以嘴宽为单位）和上下：k0 … k4 下唇（从右到左），k5 左嘴角，k6 … k10 上唇（从左到右），k11 右嘴角
  const X = [-0.78, -0.4, 0, 0.4, 0.78, 1, 0.78, 0.36, 0, -0.36, -0.78, -1];
  const smile = F.smile ?? 0;
  const cornerUp = M.corner + smile * 0.004 - (F.frown ?? 0) * 0.003;
  const cornerOut = smile * 0.0035;
  const jaw = F.jawOpen ?? 0;
  // 上唇：唇峰在 ±0.36 处高一点，人中下面凹一点（丘比特弓）
  const upY = [0.62, 1.0, 0.86, 1.0, 0.62];
  const loY = [0.6, 0.92, 1.0, 0.92, 0.6];
  const rings = topo.mouth;
  const specs = [
    { yk: 1.0, zk: 0.0012, xk: 1.0 },        // 唇线
    { yk: 0.52, zk: M.full, xk: 0.96 },      // 唇峰
    { yk: 0.0, zk: M.full * 0.55, xk: 0.9 }, // 唇内缘：上下唇在前面合上（不往嘴里卷，侧面看不会像张着嘴）
  ];
  specs.forEach((sp, i) => {
    const ring = rings[i + 1];
    for (let k = 0; k < 12; k++) {
      let x = X[k] * M.w * sp.xk, y = M.y, z;
      const corner = k === 5 || k === 11;
      const sx = Math.sign(X[k]);
      if (corner) {
        x = sx * (M.w * (1 - 0.06 * i) + cornerOut);
        y = M.y + cornerUp;
        z = zAt(x, y) + 0.0004 - 0.0016 * i;
      } else if (k <= 4) {
        const h = M.lo * loY[k] * sp.yk;
        y = M.y - h - jaw * 0.004 * (i === 2 ? 1 : 0.5) + cornerUp * Math.abs(X[k]) * 0.6;
        z = zAt(x, M.y - M.lo * 0.5) + sp.zk * (1 - 0.35 * Math.abs(X[k]) ** 2) - 0.0008;
      } else {
        const h = M.up * upY[k - 6] * sp.yk;
        y = M.y + h + cornerUp * Math.abs(X[k]) * 0.6;
        z = zAt(x, M.y + M.up * 0.5) + sp.zk * (1 - 0.35 * Math.abs(X[k]) ** 2);
      }
      set(ring[k], [x, y, z]);
    }
  });
}

// —— 耳朵：耳根一圈从头皮往外推，耳轮一圈画出耳廓的外形，对耳轮一圈缩进去，耳甲盖在最里面 ——
function placeEars(topo, F, sdf, set) {
  const A = F.ear;
  topo.ears.forEach((rings, si) => {
    const side = si === 0 ? 1 : -1;
    const root = rings[0].map((v) => set.get(v));
    const c = root.reduce((a, p) => [a[0] + p[0] / 8, a[1] + p[1] / 8, a[2] + p[2] / 8], [0, 0, 0]);
    // 耳朵的局部坐标：out 朝外（略向后），up 朝上（略向后倾），back 朝后
    const ang = A.out;
    const out = [side * Math.cos(ang), 0, -Math.sin(ang)];
    const up = [0, Math.cos(0.18), -Math.sin(0.18)];
    const back = [out[1] * up[2] - out[2] * up[1], out[2] * up[0] - out[0] * up[2], out[0] * up[1] - out[1] * up[0]];
    if (back[2] > 0) { back[0] = -back[0]; back[1] = -back[1]; back[2] = -back[2]; }
    const S = A.size;
    const P = (u, b, o) => [c[0] + (up[0] * u + back[0] * b + out[0] * o) * S, c[1] + (up[1] * u + back[1] * b + out[1] * o) * S, c[2] + (up[2] * u + back[2] * b + out[2] * o) * S];
    // 耳轮外形（up, back）：k0 耳垂前、k1 耳垂后、k2 后下、k3 后上、k4 顶后、k5 顶前、k6 前上（耳轮脚）、k7 前下（耳屏）
    const pt = A.point;
    const rim = [[-0.03, 0.002], [-0.031, 0.013], [-0.011, 0.024], [0.013, 0.025 + 0.004 * pt], [0.03 + 0.014 * pt, 0.015 + 0.012 * pt], [0.031, 0.0], [0.013, -0.004], [-0.012, -0.005]];
    const ridge = rim.map(([u, b]) => [u * 0.62, b * 0.62 + 0.004]);
    // 1：耳根往外 4mm
    rings[1].forEach((v, k) => {
      const p = root[k];
      set(v, [p[0] + out[0] * 0.004 + (p[0] - c[0]) * 0.15, p[1] + (p[1] - c[1]) * 0.25, p[2] + out[2] * 0.004 + (p[2] - c[2]) * 0.15]);
    });
    // 耳朵前缘贴着头，越往后越翘出来（招风耳翘得更多）
    const flare = (b) => lerp(0.005, 0.019 + 0.01 * (A.out - 0.3) / 0.2, clamp(b / 0.024, 0, 1));
    rings[2].forEach((v, k) => set(v, P(rim[k][0], rim[k][1], flare(rim[k][1]))));
    rings[3].forEach((v, k) => set(v, P(ridge[k][0], ridge[k][1], flare(ridge[k][1]) * 0.55 + 0.002)));
  });
}
