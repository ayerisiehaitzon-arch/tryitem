import { norm } from '../core/vec.js';

const AX = ['x', 'y', 'z'];
const FACES = [
  { id: 'px', f: 0, s: 1 }, { id: 'nx', f: 0, s: -1 },
  { id: 'py', f: 1, s: 1 }, { id: 'ny', f: 1, s: -1 },
  { id: 'pz', f: 2, s: 1 }, { id: 'nz', f: 2, s: -1 },
];
// 面内两个轴（u, v）
const inPlane = (f) => (f === 0 ? [1, 2] : f === 1 ? [0, 2] : [0, 1]);

/**
 * 圆角 / 倒角盒子 + 可选“鼓胀”形变 —— 坐垫、靠垫、床垫、枕头，以及普通倒角方块。
 *
 * 拓扑 = 6 个平面 + 12 条圆角带 + 8 个球面角片：
 *   · segs = 1 时就是经典的 44 三角形倒角盒（顶点法线取主面法线 = 加权法线）；
 *   · segs = 2~3 时是圆角盒，角片是测地细分的球面三角形，没有极点，着色均匀；
 *   · div = [dx, dy, dz] 给平面区域加细分，只有需要“鼓起来”的方向才加。
 *
 *   size    [sx, sy, sz] 外包尺寸（中心在原点，再经 xf 摆放）
 *   r       圆角半径
 *   segs    圆角分段（0 = 硬边，1 = 倒角）
 *   div     平面区域细分：每轴一个整数（均分），或 [-1..1] 的节点数组（在需要弯折处加密）
 *   puff    { top, bottom, side } 鼓胀量（米），或自定义 deform 函数
 *   omit    不生成的面，如 ['ny']（贴地 / 被遮挡的面）
 *   grain   材质纹理 u 方向优先对齐的轴 'x' | 'y' | 'z'（默认最长轴）
 *   density { px: 0.5, ... } AO 纹素密度倍率
 */
export function box(k, o) {
  const {
    name, mat, size, r: r0 = 0, segs = 1, div = [1, 1, 1], puff = null, deform = null,
    omit = [], grain = null, density = {}, xf = null,
  } = o;
  const part = k.part(mat, name);
  const h = size.map((s) => s / 2);
  const r = segs > 0 ? Math.min(r0, ...h) : 0;
  const n = r > 0 ? segs : 0;
  const inner = h.map((v) => Math.max(0, v - r));
  const gAxis = grain ? AX.indexOf(grain) : size.indexOf(Math.max(...size));
  // 平面区域节点：整数 = 均分；数组 = 显式给出 [-1, 1] 内的相对位置（形变集中处加密）
  const nodes = inner.map((iv, a) => {
    if (Array.isArray(div[a])) return div[a].map((f) => f * iv);
    const d = Math.max(1, div[a]);
    return Array.from({ length: d + 1 }, (_, i) => -iv + (2 * iv * i) / d);
  });
  const faceOn = FACES.map((F) => !omit.includes(F.id));
  const area = (F) => { const [u, v] = inPlane(F.f); return size[u] * size[v]; };
  // 面内 (u, v) 轴：若 grain 轴在面内，把它放到 u 上
  const uvAxes = (F) => {
    const [a, b] = inPlane(F.f);
    return b === gAxis ? [b, a] : [a, b];
  };

  const charts = FACES.map((F) => {
    if (!faceOn[FACES.indexOf(F)]) return -1;
    const [u, v] = uvAxes(F);
    return k.chart(`${name}:${F.id}`, size[u], size[v], { density: density[F.id] ?? 1 });
  });

  // 选择“拥有者”面：候选面中面积最大的（跳过被省略的面；y 轴优先）
  const pickOwner = (cands) => {
    let best = -1, bestA = -1;
    for (const fi of cands) {
      if (!faceOn[fi]) continue;
      const a = area(FACES[fi]) * (FACES[fi].f === 1 ? 1.0001 : 1);
      if (a > bestA) { bestA = a; best = fi; }
    }
    return best;
  };
  const faceIndex = (axis, sign) => axis * 2 + (sign > 0 ? 0 : 1);

  // 在拥有者面 fi 的坐标系下给出 UV0（米，弧长展开）和 UV1（图块内归一化）
  const mapUV = (fi, c, d) => {
    const F = FACES[fi];
    const [u, v] = uvAxes(F);
    const df = Math.max(-1, Math.min(1, d[F.f] * F.s));
    const theta = Math.acos(df);
    let cu = 1, cv = 0;
    const ll = Math.hypot(d[u], d[v]);
    if (ll > 1e-9) { cu = d[u] / ll; cv = d[v] / ll; }
    const U0 = c[u] + r * theta * cu, V0 = c[v] + r * theta * cv;
    const k1 = (2 / Math.PI) * theta * r;
    const U1 = c[u] + k1 * cu, V1 = c[v] + k1 * cv;
    const t0 = [U0, V0];
    const t1 = [(U1 + h[u]) / (2 * h[u]), (V1 + h[v]) / (2 * h[v])];
    return { t0, t1, chart: charts[fi] };
  };

  const vert = (fi, c, d) => {
    const p = [c[0] + r * d[0], c[1] + r * d[1], c[2] + r * d[2]];
    const m = mapUV(fi, c, d);
    return part.v(p, d, m.t0, m.chart, m.t1);
  };

  // —— 6 个平面 ——
  FACES.forEach((F, fi) => {
    if (!faceOn[fi]) return;
    const [u, v] = inPlane(F.f);
    const grid = [];
    for (let i = 0; i < nodes[u].length; i++) {
      grid.push([]);
      for (let j = 0; j < nodes[v].length; j++) {
        const c = [0, 0, 0];
        c[F.f] = F.s * inner[F.f];
        c[u] = nodes[u][i];
        c[v] = nodes[v][j];
        const d = [0, 0, 0];
        d[F.f] = F.s;
        grid[i].push(vert(fi, c, d));
      }
    }
    for (let i = 0; i < nodes[u].length - 1; i++)
      for (let j = 0; j < nodes[v].length - 1; j++)
        part.quad(grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]);
  });

  if (n > 0) {
    // —— 12 条圆角带 ——
    for (let a = 0; a < 3; a++) for (let b = a + 1; b < 3; b++) {
      const c = 3 - a - b; // 沿此轴延伸
      for (const sa of [1, -1]) for (const sb of [1, -1]) {
        const fa = faceIndex(a, sa), fb = faceIndex(b, sb);
        const owner = pickOwner([fa, fb]);
        if (owner < 0) continue;
        const rows = [];
        for (let m = 0; m <= n; m++) {
          const row = [];
          const d0 = [0, 0, 0];
          d0[a] = (n - m) * sa;
          d0[b] = m * sb;
          const d = norm(d0);
          for (const t of nodes[c]) {
            const cc = [0, 0, 0];
            cc[a] = sa * inner[a];
            cc[b] = sb * inner[b];
            cc[c] = t;
            row.push(vert(owner, cc, d));
          }
          rows.push(row);
        }
        for (let m = 0; m < n; m++)
          for (let t = 0; t < nodes[c].length - 1; t++)
            part.quad(rows[m][t], rows[m + 1][t], rows[m + 1][t + 1], rows[m][t + 1]);
      }
    }
    // —— 8 个角片（测地细分的球面三角形）——
    for (const sx of [1, -1]) for (const sy of [1, -1]) for (const sz of [1, -1]) {
      const owner = pickOwner([faceIndex(0, sx), faceIndex(1, sy), faceIndex(2, sz)]);
      if (owner < 0) continue;
      const cc = [sx * inner[0], sy * inner[1], sz * inner[2]];
      const V = [];
      for (let i = 0; i <= n; i++) {
        V.push([]);
        for (let j = 0; j <= n - i; j++) {
          const kk = n - i - j;
          V[i].push(vert(owner, cc, norm([i * sx, j * sy, kk * sz])));
        }
      }
      for (let i = 0; i < n; i++)
        for (let j = 0; j < n - i; j++) {
          part.tri(V[i][j], V[i + 1][j], V[i][j + 1]);
          if (i + j <= n - 2) part.tri(V[i + 1][j], V[i + 1][j + 1], V[i][j + 1]);
        }
    }
  }

  // —— 鼓胀形变 ——
  if (puff || deform) {
    const fn = deform || puffDeform(h, puff);
    part.deform(fn);
  }
  if (xf) part.transform(xf);
  return part;
}

// 软垫的鼓胀：顶/底面中央拱起，侧面中部外凸，棱边保持不动。
// 多项式形变处处光滑，法线经雅可比变换后依然连续柔和。
export function puffDeform(h, { top = 0, bottom = 0, side = 0, sideX = null, sideZ = null } = {}) {
  const sx = sideX ?? side, sz = sideZ ?? side;
  return (p) => {
    const x = p[0] / h[0], y = p[1] / h[1], z = p[2] / h[2];
    const wx = Math.max(0, 1 - x * x), wy = Math.max(0, 1 - y * y), wz = Math.max(0, 1 - z * z);
    const by = (top + bottom) / 2 + ((top - bottom) / 2) * y;
    return [
      p[0] + sx * x * wy * wz,
      p[1] + by * y * wx * wz,
      p[2] + sz * z * wx * wy,
    ];
  };
}
