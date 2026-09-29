import { catmull } from '../gym2/parts.js';

// 电吉他的平面设计：琴身、护板、琴头的轮廓，品丝位置 —— 几何（挤出）和贴图（日落色渐变、指板、琴头标）共用这一份数据。
// 吉他坐标：x 横过琴身（x < 0 是低音弦那一侧），y 沿琴颈往上（琴身底边 y = 0），z 朝琴的正面。单位米。

// 琴身：一条开放的 Catmull-Rom 曲线，从琴颈槽左角出发，绕过低音侧的长琴角、琴身下半圆、高音侧的短琴角，
// 回到琴颈槽右角；琴颈槽是一条直边（两个角是尖的）。控制点按毫米写
const BODY_MM = [
  [-29, 362], [-40, 356], [-56, 360], [-72, 378], [-88, 404], [-102, 428], [-118, 446], [-136, 451], [-150, 441], [-156, 418],
  [-152, 380], [-140, 336], [-128, 290], [-124, 250], [-131, 210], [-148, 170], [-160, 120], [-157, 70], [-128, 28], [-72, 6],
  [0, 0], [70, 6], [125, 28], [155, 68], [161, 115], [152, 165], [132, 205], [122, 240], [126, 280], [138, 318],
  [143, 352], [137, 382], [122, 400], [104, 402], [88, 390], [70, 368], [52, 352], [38, 352], [29, 362],
];
export const BODY = { T: 0.045, R: 0.011 };   // 厚度、四周倒圆
export function bodyOutline(n) {
  return catmull(BODY_MM.map(([x, y]) => [x / 1000, y / 1000]), n);
}

// 护板：盖住琴身正面的一大片（三个拾音器、两个音色旋钮都在上面），同样一条闭合的平滑曲线（毫米）
const GUARD_MM = [
  [-26, 356], [-44, 350], [-60, 356], [-76, 364], [-90, 362], [-100, 344], [-104, 314], [-98, 270], [-88, 230],
  [-78, 194], [-64, 160], [-40, 134], [-12, 128], [26, 128], [44, 108], [58, 78], [88, 62], [112, 66], [120, 92],
  [112, 136], [96, 176], [90, 214], [94, 250], [100, 288], [98, 316], [84, 336], [58, 338], [40, 336], [26, 356],
];
export function guardOutline(n) {
  return closedCatmull(GUARD_MM.slice(0, -1).map(([x, y]) => [x / 1000, y / 1000]), n);
}
// 闭合的均匀 Catmull-Rom：每段 n 份，不重复首点
export function closedCatmull(P, n) {
  const N = P.length, out = [];
  for (let i = 0; i < N; i++) {
    const p0 = P[(i - 1 + N) % N], p1 = P[i], p2 = P[(i + 1) % N], p3 = P[(i + 2) % N];
    for (let s = 0; s < n; s++) {
      const t = s / n, t2 = t * t, t3 = t2 * t;
      out.push(p1.map((_, j) => 0.5 * (2 * p1[j] + (p2[j] - p0[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (3 * p1[j] - p0[j] - 3 * p2[j] + p3[j]) * t3)));
    }
  }
  return out;
}

// 琴颈与品：25.5 英寸弦长；琴桥弦鞍在 y = BRIDGE，上弦枕在 y = NUT；21 品，指板尾端过最后一品 12mm
export const SCALE = 0.648, BRIDGE = 0.105, NUT = BRIDGE + SCALE;
export const FRETS = 21;
export const fretY = (n) => NUT - SCALE * (1 - 2 ** (-n / 12));
export const BOARD = { end: fretY(FRETS) - 0.012, wNut: 0.042, wEnd: 0.057, t: 0.006 };
export const boardHalf = (y) => (BOARD.wNut + ((BOARD.wEnd - BOARD.wNut) * (NUT - y)) / (NUT - BOARD.end)) / 2;
// 琴颈面（指板底下）的高度，指板面，琴身正面
export const Z = { body: BODY.T / 2, neck: 0.03, board: 0.03 + BOARD.t };

// 琴头：一侧鼓出去的大头（六个弦钮排在低音侧），毫米，y 从上弦枕算起
const HEAD_MM = [
  [-21, 0], [-25, 14], [-31, 34], [-38, 58], [-46, 86], [-52, 114], [-55, 140], [-52, 166], [-42, 184], [-26, 192],
  [-10, 188], [4, 176], [12, 158], [16, 134], [20, 108], [25, 80], [26, 50], [23, 22], [21, 0],
];
export function headOutline(n) {
  return catmull(HEAD_MM.map(([x, y]) => [x / 1000, NUT + y / 1000]), n);
}
// 六个弦轴在琴头上的位置（低音 E 在最下面）
export const TUNERS = Array.from({ length: 6 }, (_, i) => [-0.021 - 0.0035 * i, NUT + 0.034 + i * 0.0245]);
// 六根弦在弦鞍 / 上弦枕处的横向位置（低音 E 在 x < 0 一侧）
export const stringX = (i, y) => {
  const t = (NUT - y) / SCALE;               // 0 在上弦枕，1 在弦鞍
  const half = 0.0175 + (0.0265 - 0.0175) * t;
  return -half + (2 * half * i) / 5;
};

// 点到折线（闭合）的有符号距离：内部为正
export function signedDist(poly, x, y) {
  let d = Infinity, inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, ay] = poly[j], [bx, by] = poly[i];
    const ex = bx - ax, ey = by - ay, wx = x - ax, wy = y - ay;
    const t = Math.max(0, Math.min(1, (wx * ex + wy * ey) / (ex * ex + ey * ey || 1)));
    d = Math.min(d, Math.hypot(wx - ex * t, wy - ey * t));
    if ((ay > y) !== (by > y) && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) inside = !inside;
  }
  return inside ? d : -d;
}
