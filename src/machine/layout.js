// 机械车间几件东西里几何和贴图共用的尺寸：摩托车的轮胎截面、链条的走向。

// 轮胎截面（绕轮轴车削：r 是半径，y 沿轮轴）：一段椭圆从一侧的胎唇绕过胎面到另一侧的胎唇，全是平滑顶点 ——
// 车出来是一整条环带，贴图 u 绕轮胎一圈、v 沿截面从一侧胎唇走到另一侧：中间一段是胎面花纹，两边胎侧上印着字。
// 前后轮都是 18 寸轮圈，胎宽 / 胎高按同一个比例放大，截面形状相似 → 胎面在 v 上占的那一段前后轮一样
export const TIRE = { rim: 0.2286, bead: 2.31, tread: 1.0 };
const ellipse = (h, w) => ({ rc: TIRE.rim + 0.45 * h, ar: 0.55 * h, ay: w / 2 });
export function tireProfile({ h, w }, n) {
  const { rc, ar, ay } = ellipse(h, w), b = TIRE.bead;
  return Array.from({ length: n + 1 }, (_, i) => { const t = -b + (2 * b * i) / n; return [rc + ar * Math.cos(t), ay * Math.sin(t)]; });
}
// 胎面在 v 上的范围（椭圆上 ±tread 弧度那两点的弧长比例）
export const TREAD_V = (() => {
  const { ar, ay } = ellipse(0.09, 0.1), b = TIRE.bead, N = 2000;
  const s = [0];
  for (let i = 1; i <= N; i++) {
    const t0 = -b + (2 * b * (i - 1)) / N, t1 = -b + (2 * b * i) / N;
    s.push(s[i - 1] + Math.hypot(ar * (Math.cos(t1) - Math.cos(t0)), ay * (Math.sin(t1) - Math.sin(t0))));
  }
  const at = (t) => s[Math.round(((t + b) / (2 * b)) * N)] / s[N];
  return [at(-TIRE.tread), at(TIRE.tread)];
})();
// 前轮 100/90、后轮 110/90
export const FRONT_TIRE = { h: 0.09, w: 0.1 }, REAR_TIRE = { h: 0.099, w: 0.11 };
export const tireRadius = (t) => TIRE.rim + t.h;

// 链条：发动机输出轴上的小链轮 → 后轮上的大链轮，一圈 98 节（节距约 16mm）。点在车身的侧视平面里 (x, y)
export const CHAIN = { front: [-0.19, 0.345], r1: 0.046, rear: [-0.725, tireRadius(REAR_TIRE)], r2: 0.104, links: 98 };
export function chainLoop(nArc) {
  const { front: A, rear: B, r1, r2 } = CHAIN;
  const dx = A[0] - B[0], dy = A[1] - B[1], d = Math.hypot(dx, dy);
  // 外公切线：切点处的半径方向和中心连线的夹角是 π/2 - φ，sinφ = (r2 - r1) / d
  const phi = Math.asin((r2 - r1) / d), base = Math.atan2(dy, dx);
  const top = base + Math.PI / 2 - phi, bot = base - Math.PI / 2 + phi;
  const pts = [];
  const arc = (C, r, a0, a1, n) => { for (let i = 0; i <= n; i++) { const a = a0 + ((a1 - a0) * i) / n; pts.push([C[0] + r * Math.cos(a), C[1] + r * Math.sin(a)]); } };
  // 小链轮从上切点经过前面绕到下切点，下面一段直线到大链轮，大链轮经过后面绕回上切点，上面一段直线闭合
  arc(A, r1, top, bot, Math.max(2, Math.round(nArc * 0.6)));
  arc(B, r2, bot, top - 2 * Math.PI, nArc);
  return pts;
}
export function chainLength() {
  const p = chainLoop(400);
  let L = 0;
  for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; L += Math.hypot(b[0] - a[0], b[1] - a[1]); }
  return L;
}
