// 原木大板茶桌的桌面：一块 1.62m 长的黑胡桃大板，两条长边是树的自然边（不规则起伏，靠树根那头宽出一截），两头锯平。
// 几何（挤出的轮廓、侧面贴图的弧长）和贴图（白边、年轮、树结、蝴蝶榫）共用这一份。
// 俯视坐标：x 沿板长（-x 是靠树根的一头），z 横跨板宽（+z 是桌子的前沿）
export const SLAB = {
  L: 1.62,
  T: 0.065,       // 板厚
  top: 0.38,      // 桌面高度（地上坐蒲团用的矮茶桌）
  bevel: 0.012,   // 自然边顶上那一圈磨圆
};

const TAU = Math.PI * 2;
// t ∈ [0, 1]：沿板长的位置（0 在树根那头）
export const slabFront = (t) =>
  0.345 + 0.05 * (1 - t) ** 2 + 0.012 * Math.sin(TAU * (1.7 * t + 0.2)) + 0.006 * Math.sin(TAU * (4.3 * t + 0.7))
  + 0.003 * Math.sin(TAU * 9 * t) - 0.02 * Math.exp(-(((t - 0.62) / 0.035) ** 2));
export const slabBack = (t) =>
  -(0.335 + 0.035 * (1 - t) ** 1.5 + 0.014 * Math.sin(TAU * (1.3 * t + 0.6)) + 0.005 * Math.sin(TAU * (5.1 * t + 0.1))
  + 0.0025 * Math.sin(TAU * (11 * t + 0.3)));

// 桌面外轮廓（俯视、闭合，逆时针：前沿从左往右 → 右端 → 后沿从右往左 → 左端）；n 是每条长边的分段数
export function slabOutline(n = 40) {
  const { L } = SLAB;
  const pts = [];
  for (let i = 0; i <= n; i++) { const t = i / n; pts.push([-L / 2 + L * t, slabFront(t)]); }
  for (let i = n; i >= 0; i--) { const t = i / n; pts.push([-L / 2 + L * t, slabBack(t)]); }
  return pts;
}

// 贴图覆盖的范围（俯视包围盒，四周留 1cm）
export const SLAB_BOX = (() => {
  let z0 = Infinity, z1 = -Infinity;
  for (let i = 0; i <= 400; i++) { const t = i / 400; z0 = Math.min(z0, slabBack(t)); z1 = Math.max(z1, slabFront(t)); }
  return { x0: -SLAB.L / 2 - 0.01, x1: SLAB.L / 2 + 0.01, z0: z0 - 0.01, z1: z1 + 0.01 };
})();

// 一条长边的弧长（侧面贴图的 u）：side = 1 前沿，-1 后沿
export function edgeLength(side) {
  const f = side > 0 ? slabFront : slabBack;
  let s = 0, p = [-SLAB.L / 2, f(0)];
  for (let i = 1; i <= 400; i++) {
    const t = i / 400, q = [-SLAB.L / 2 + SLAB.L * t, f(t)];
    s += Math.hypot(q[0] - p[0], q[1] - p[1]);
    p = q;
  }
  return s;
}

// 裂缝和蝴蝶榫：树根那头顺着纹理裂开一道，两枚枫木的蝴蝶榫横跨裂缝（x、z 是中心，a 是榫的方向）
export const CRACK = { x0: -0.81, x1: -0.52, z: 0.06 };
export const KEYS = [{ x: -0.745, z: 0.058, a: 1.52 }, { x: -0.61, z: 0.066, a: 1.63 }];
export const KEY_SIZE = { l: 0.085, w: 0.036, waist: 0.016 };
