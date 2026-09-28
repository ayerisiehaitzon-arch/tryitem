import { gymSwatch, gymUV } from '../materials/atlas.js';

// 健身器材图集（gym 材质）上的两种取色方式：
//   swatch：部件整个指向一个纯色格子（烤漆、塑料、橡胶、铝、镀铬……）；
//   region：部件的 UV 铺满图集里的一块区域（跑步机屏幕、控制台面板），f(T, P, i) → [u, v] ∈ [0, 1]（v 向下）
export function swatch(part, name) {
  const uv = gymSwatch(name);
  part.T = part.T.map(() => uv);
  return part;
}

export function region(part, name, f) {
  part.T = part.T.map((t, i) => {
    const [u, v] = f(t, part.P[i], i);
    return gymUV(name, Math.min(1, Math.max(0, u)), Math.min(1, Math.max(0, v)));
  });
  return part;
}
