// 三角钢琴的平面轮廓和几个关键高度：琴壳、琴盖、音板（几何）和琴弦、铁骨（贴图）共用这一份。
//
// 俯视坐标：x 向右（高音一侧），z 向前（琴键那头，琴键前沿在 z = 0），尾部在 -z。
// 外轮廓从左前角出发：低音侧的直边一路往后 → 尾部一段圆弧 → S 形的弯边（先外凸、再内凹）一路往前 →
// 高音侧最前面一小段直边 → 右前角。前面敞开的一边是键盘。
export const GRAND = {
  W: 1.48,         // 琴壳外宽（88 键 1.224m + 两端的键盘侧挡）
  L: 1.62,         // 琴键前沿到尾部的总长
  zF: -0.17,       // 全高琴壳的前沿：再往前是键盘和两端的侧挡
  t: 0.045,        // 琴壳侧板厚
  Rt: 0.32,        // 尾部圆弧半径
  aTail: 315,      // 尾部圆弧转到多少度接上弯边（0° = +x，90° = +z）
  bend: [0.55, 0.38], // 弯边（三次贝塞尔）两端切线的长度：前一个接尾部圆弧，后一个接高音侧直边
  zTreble: -0.64,  // 高音侧直边的后端（前琴盖折回来盖在主琴盖上，这一段要够长）
};

// 几个高度（米，地面为 0）
export const GY = {
  bottom: 0.655,   // 琴壳底
  rim: 0.985,      // 琴壳顶（琴盖的铰链就在这个高度）
  deck: 0.925,     // 铁骨 / 琴弦所在的平面（比琴壳顶低 6cm）
  keyTop: 0.725,   // 白键上表面
  keyBot: 0.703,   // 白键前脸的下沿
  cheek: 0.8,      // 键盘两端侧挡的顶
  fall: 0.86,      // 键盘后面立着的琴键盖（打开时收起来的样子）的顶
  lid: 0.022,      // 琴盖厚
};

// 键盘：52 个白键（A0 ~ C8），黑键按“一个八度 12 等分”的真实位置排（升 C 偏左、升 D 偏右……）
export const KEYS = {
  w: 0.02354, n: 52, front: 0.008, back: -0.15,
  blackW: 0.0137, blackTop: 0.0098, blackH: 0.0125, blackLen: 0.095,
};
// 一个八度（从 C 的左沿算起，单位米）里五个黑键的中心
export const BLACK_IN_OCTAVE = [1, 3, 6, 8, 10].map((i) => ((i + 0.5) * 7 * KEYS.w) / 12);

// 音板 / 铁骨贴图覆盖的范围（俯视）：x ∈ [x0, x1]，z 从 z0（前，贴图上沿）到 z1（尾部，贴图下沿）
export const HARP = { x0: -0.7, x1: 0.7, z0: -0.19, z1: -1.58 };

const bez = (a, b, c, d, t) => {
  const u = 1 - t;
  return [0, 1].map((i) => u * u * u * a[i] + 3 * u * u * t * b[i] + 3 * u * t * t * c[i] + t * t * t * d[i]);
};

// 外轮廓（开放折线，从左前角 z = zF 到右前角 z = zF）：tail、bent 是尾部圆弧和弯边的分段数
export function grandOutline({ tail = 12, bent = 18, z0 = GRAND.zF } = {}) {
  const { W, L, Rt, aTail, bend, zTreble } = GRAND;
  const xL = -W / 2, xR = W / 2;
  const cx = xL + Rt, cz = -L + Rt;
  const pts = [[xL, z0], [xL, cz]];
  const a0 = Math.PI, a1 = (aTail * Math.PI) / 180;
  for (let i = 1; i <= tail; i++) {
    const a = a0 + ((a1 - a0) * i) / tail;
    pts.push([cx + Rt * Math.cos(a), cz + Rt * Math.sin(a)]);
  }
  const B0 = pts[pts.length - 1];
  const d0 = [-Math.sin(a1), Math.cos(a1)];
  const B3 = [xR, zTreble];
  const B1 = [B0[0] + d0[0] * bend[0], B0[1] + d0[1] * bend[0]];
  const B2 = [B3[0], B3[1] - bend[1]];
  for (let i = 1; i <= bent; i++) pts.push(bez(B0, B1, B2, B3, i / bent));
  pts.push([xR, z0]);
  return pts;
}

// 折线往里偏移 d（轮廓的走向是逆时针绕着琴的内部，左法线 = 朝里）；拐点处按斜接放大
export function offsetLine(pts, d) {
  const n = pts.length;
  const dir = (a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1; return [dx / l, dz / l]; };
  return pts.map((p, i) => {
    const t0 = i > 0 ? dir(pts[i - 1], p) : null, t1 = i < n - 1 ? dir(p, pts[i + 1]) : null;
    const nA = t0 && [-t0[1], t0[0]], nB = t1 && [-t1[1], t1[0]];
    if (!nA || !nB) { const m = nA || nB; return [p[0] + m[0] * d, p[1] + m[1] * d]; }
    const m = [nA[0] + nB[0], nA[1] + nB[1]], l = Math.hypot(m[0], m[1]) || 1;
    const k = 1 / Math.max(0.3, (m[0] / l) * nA[0] + (m[1] / l) * nA[1]);
    return [p[0] + (m[0] / l) * d * k, p[1] + (m[1] / l) * d * k];
  });
}

// —— 琴弦排布（俯视）：88 个键（1 = A0 … 88 = C8）——
//   弦轴在琴的前部，三排错开；弦从弦轴往后拉到挂弦钉（琴壳内沿往里 3.5cm 的那条线）。
//   低音 1~20 号键是缠铜弦（1~8 单根、9~20 两根），斜着往右后方拉，压在中音区的弦上面（交叉弦）；
//   21~28 号两根缠弦，29~88 号三根钢弦，笔直往后。
export const STRINGS = {
  rows: [-0.222, -0.248, -0.274], // 三排弦轴的深度
  capo: [-0.312, -0.33],          // 压弦条（高音区的一道横梁；低音区是一颗颗铜弦枕）
  damper: [-0.345, -0.405],       // 制音器那一排
  dampers: 69,                    // 1~69 号键有制音器，再往上的高音没有
  bassAngle: (18 * Math.PI) / 180,
  hitch: 0.035,                   // 挂弦钉：琴壳内沿往里
};

export function noteStrings(n) {
  if (n <= 20) return { x: -0.655 + (n - 1) * 0.011, count: n <= 8 ? 1 : 2, d: 0.0055 - (n - 1) * 0.00016, kind: 'bass', spread: 0.0026 };
  const x = -0.384 + ((n - 21) * 1.037) / 67;
  if (n <= 28) return { x, count: 2, d: 0.0021, kind: 'wound', spread: 0.0021 };
  return { x, count: 3, d: 0.0011 - ((n - 29) * 0.0003) / 59, kind: 'steel', spread: 0.0032 };
}

// 弦的方向（俯视单位向量 [dx, dz]）：低音斜着往右后方，其余笔直往后
export const stringDir = (n) => (n <= 20 ? [Math.sin(STRINGS.bassAngle), -Math.cos(STRINGS.bassAngle)] : [0, -1]);

// 第 n 个键的弦（中间那排弦轴）拉到深度 z 时的 x：制音器、弦枕按它摆
export function noteXAt(n, z) {
  const s = noteStrings(n), d = stringDir(n);
  return s.x + (d[0] / -d[1]) * (STRINGS.rows[1] - z);
}
