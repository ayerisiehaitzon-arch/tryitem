// 材质库。所有家具共享这些材质的贴图（木纹、布纹……），贴图按“物理尺寸”平铺：
//   tile = [u 方向米数, v 方向米数]，即一张贴图覆盖多大的真实面积。
// 金属、烤漆这类表面没有可见纹理，只用参数，不占贴图内存。
//
// 颜色为线性空间 RGBA（glTF 约定）。srgb() 方便用熟悉的 sRGB 数值书写。

export const srgb = (r, g, b, a = 1) => [lin(r / 255), lin(g / 255), lin(b / 255), a];
function lin(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

// 共用一张贴图的“染色”变体：tint(目标 sRGB, 贴图平均 sRGB) → 线性空间的 baseColorFactor
// 一张亚麻布纹贴图，靠参数染出燕麦色、米白、灯罩色……贴图内存只占一份。
const LINEN_BASE = [236, 232, 223];
export const tint = (target, base = LINEN_BASE) => {
  const t = srgb(...target), b = srgb(...base);
  return [t[0] / b[0], t[1] / b[1], t[2] / b[2], 1].map((v) => Math.min(1, v));
};

export const MATERIALS = {
  oak: {
    label: '橡木（木蜡油）',
    tex: 'oak', tile: [0.9, 0.9],
    roughness: 1, metallic: 0, normalScale: 0.6,
  },
  walnut: {
    label: '胡桃木（哑光清漆）',
    tex: 'walnut', tile: [0.9, 0.9],
    roughness: 1, metallic: 0, normalScale: 0.5,
    clearcoat: { factor: 0.25, roughness: 0.35 },
  },
  linen: {
    label: '亚麻布（燕麦色）',
    tex: 'linen', tile: [0.12, 0.12], color: tint([204, 192, 172]),
    roughness: 1, metallic: 0, normalScale: 0.9,
    sheen: { color: [0.5, 0.47, 0.42], roughness: 0.55 },
  },
  linen_white: {
    label: '亚麻布（米白）',
    tex: 'linen', tile: [0.12, 0.12], color: tint([236, 233, 226]),
    roughness: 1, metallic: 0, normalScale: 0.8,
    sheen: { color: [0.6, 0.6, 0.58], roughness: 0.55 },
  },
  linen_sage: {
    label: '亚麻布（鼠尾草绿）',
    tex: 'linen', tile: [0.12, 0.12], color: tint([150, 160, 140]),
    roughness: 1, metallic: 0, normalScale: 0.9,
    sheen: { color: [0.38, 0.42, 0.36], roughness: 0.5 },
  },
  linen_charcoal: {
    label: '亚麻布（炭灰）',
    tex: 'linen', tile: [0.12, 0.12], color: tint([76, 78, 82]),
    roughness: 1, metallic: 0, normalScale: 1.0,
    sheen: { color: [0.22, 0.23, 0.25], roughness: 0.5 },
  },
  boucle: {
    label: '圈绒（奶白）',
    tex: 'boucle', tile: [0.16, 0.16],
    roughness: 1, metallic: 0, normalScale: 1.0,
    sheen: { color: [0.62, 0.6, 0.56], roughness: 0.6 },
  },
  velvet: {
    label: '丝绒（墨绿）',
    tex: 'velvet', tile: [0.2, 0.2],
    roughness: 1, metallic: 0, normalScale: 0.5,
    sheen: { color: [0.36, 0.52, 0.44], roughness: 0.35 },
  },
  leather: {
    label: '植鞣皮（干邑色）',
    tex: 'leather', tile: [0.3, 0.3],
    roughness: 1, metallic: 0, normalScale: 0.8,
  },
  marble: {
    label: '白色大理石（哑光）',
    tex: 'marble', tile: [0.8, 0.8],
    roughness: 1, metallic: 0, normalScale: 0.25,
  },
  brass: {
    label: '拉丝黄铜',
    color: srgb(222, 184, 120), metallic: 1, roughness: 0.32,
  },
  aluminum: {
    label: '抛光铝',
    color: srgb(214, 216, 219), metallic: 1, roughness: 0.28,
  },
  plastic_black: {
    label: '黑色哑光塑料',
    color: srgb(30, 30, 32), metallic: 0, roughness: 0.62,
  },
  steel: {
    label: '黑色粉末喷涂钢',
    color: srgb(38, 38, 40), metallic: 0, roughness: 0.55,
  },
  paint: {
    label: '白色哑光烤漆',
    color: srgb(236, 234, 228), metallic: 0, roughness: 0.42,
    clearcoat: { factor: 0.2, roughness: 0.3 },
  },
  ceramic: {
    label: '釉面陶瓷（雾蓝）',
    color: srgb(137, 158, 170), metallic: 0, roughness: 0.25,
    clearcoat: { factor: 0.6, roughness: 0.08 },
  },
  shade: {
    label: '亚麻灯罩（内侧发光）',
    tex: 'linen', tile: [0.12, 0.12], color: tint([232, 222, 200]),
    roughness: 1, metallic: 0, normalScale: 0.6, doubleSided: true,
    emissive: [1.0, 0.78, 0.52], emissiveTex: true, emissiveStrength: 1.6,
  },
  bulb: {
    label: '暖光灯泡',
    color: srgb(255, 236, 205), metallic: 0, roughness: 0.2,
    emissive: [1.0, 0.85, 0.62], emissiveStrength: 6,
  },
};

export const tileOf = (mat) => MATERIALS[mat]?.tile ?? [1, 1];
