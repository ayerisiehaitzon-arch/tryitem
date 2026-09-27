// 图集布局：贴图生成器和几何构建共用同一份坐标，保证 UV 正好落在对应的格子里。
// 这是“调色板贴图”技巧：很多不同颜色 / 图案的小物件共用一张小贴图、一个材质，一次 draw call。

// —— 书：512×512 ——
//   上部：16 个书脊图案（16 列 × 1 行，每格 32×320 —— 书脊细长，竖向要更多像素，横线 / 文字才清楚）
//   中部：16 个封面纯色块（每格 32×32）
//   底部：书页侧边（512×160，横向细纹）
//   所有格子的边界都对齐 16px，JPEG 的色度块不会跨格子串色
export const BOOK_ATLAS = {
  size: 512,
  spine: { cols: 16, w: 32, h: 320, y0: 0 },
  swatch: { w: 32, h: 32, y0: 320 },
  pages: { x0: 0, y0: 352, w: 512, h: 160 },
  // 布面颜色 + 书脊样式（0 烫金双线 + 横排标题，1 深色底带 + 竖排烫金标题，2 纸标签，3 浅色细线 + 竖排标题）
  palette: [
    { base: [40, 52, 82], style: 0 }, { base: [46, 72, 58], style: 1 }, { base: [112, 42, 46], style: 0 }, { base: [192, 148, 62], style: 3 },
    { base: [166, 88, 64], style: 2 }, { base: [86, 106, 128], style: 1 }, { base: [106, 108, 72], style: 3 }, { base: [222, 212, 188], style: 2 },
    { base: [52, 52, 56], style: 0 }, { base: [192, 148, 140], style: 3 }, { base: [44, 94, 98], style: 1 }, { base: [168, 134, 98], style: 0 },
    { base: [138, 60, 48], style: 2 }, { base: [140, 154, 128], style: 1 }, { base: [30, 32, 38], style: 3 }, { base: [184, 122, 52], style: 0 },
  ],
};

const inset = (x0, y0, x1, y1, S, px = 1.5) => [(x0 + px) / S, (y0 + px) / S, (x1 - px) / S, (y1 - px) / S];

// 返回 [u0, v0, u1, v1]；v0 是图上方（书脊顶端 / 叶尖）
export function bookUV(kind, i = 0) {
  const A = BOOK_ATLAS, S = A.size;
  if (kind === 'spine') {
    const c = i % A.spine.cols, r = Math.floor(i / A.spine.cols);
    return inset(c * A.spine.w, A.spine.y0 + r * A.spine.h, (c + 1) * A.spine.w, A.spine.y0 + (r + 1) * A.spine.h, S, 2);
  }
  if (kind === 'swatch') return inset(i * A.swatch.w, A.swatch.y0, (i + 1) * A.swatch.w, A.swatch.y0 + A.swatch.h, S, 6);
  const p = A.pages;
  return inset(p.x0, p.y0, p.x0 + p.w, p.y0 + p.h, S, 3);
}

// —— 植物：1024×1024，四个区域 ——
export const FOLIAGE_ATLAS = {
  size: 1024,
  regions: {
    fig: [0, 0, 512, 512],       // 琴叶榕叶片：u 横跨叶面（叶脉在 0.5），v 从叶尖（上）到叶柄（下）
    snake: [512, 0, 1024, 512],  // 虎尾兰叶片：同上
    bark: [0, 512, 512, 1024],   // 树皮：v 沿树干
    soil: [512, 512, 1024, 1024], // 盆土
  },
};

export function foliageUV(region, u, v) {
  const [x0, y0, x1, y1] = FOLIAGE_ATLAS.regions[region];
  const S = FOLIAGE_ATLAS.size, m = 3;
  return [(x0 + m + u * (x1 - x0 - 2 * m)) / S, (y0 + m + v * (y1 - y0 - 2 * m)) / S];
}

// —— 陶瓷釉面：1024×1024，四个 512² 区域，每种器型一块 ——
//   u 绕器物一圈（0→1，接缝在背面），v 沿轮廓弧长（0 = 底足外沿，1 = 内壁尽头）。
//   贴图按器型的真实曲线来画：哪一行像素是底足、腹部、口沿，生成器都知道（见 decor/profiles.js）。
export const CERAMIC_ATLAS = {
  size: 1024,
  margin: 4, // 边缘 4px 画的是绕回来的内容，接缝处双线性过滤也无缝
  regions: {
    bottle: [0, 0, 512, 512],       // 细颈瓶：白色蘸釉，下部露出烤色的胎
    moon: [512, 0, 1024, 512],      // 圆罐：深青色窑变釉
    bud: [0, 512, 512, 1024],       // 小花瓶：天目（兔毫）釉
    planter: [512, 512, 1024, 1024], // 花盆：石墨色哑光釉
  },
};

export function ceramicUV(region, u, v) {
  const [x0, y0, x1, y1] = CERAMIC_ATLAS.regions[region];
  const S = CERAMIC_ATLAS.size, m = CERAMIC_ATLAS.margin;
  return [(x0 + m + u * (x1 - x0 - 2 * m)) / S, (y0 + m + v * (y1 - y0 - 2 * m)) / S];
}

// —— 阳台：1024×1024 ——
//   上半：鼓凳的青瓷釉、陶土花盆（u 绕一圈，v 沿设计曲线的弧长，见 balcony/profiles.js）
//   下半：橄榄叶正面 / 背面（窄长的格子：叶子细长）、橄榄树皮、盆土（树皮碎屑覆盖）
export const PATIO_ATLAS = {
  size: 1024,
  margin: 4,
  regions: {
    stool: [0, 0, 512, 512],
    pot: [512, 0, 1024, 512],
    leafA: [0, 512, 256, 1024],   // 叶正面：深灰绿，有光泽；u 横跨叶面（主脉在 0.5），v 从叶尖（上）到叶柄（下）
    leafB: [256, 512, 512, 1024], // 叶背面：银灰绿，哑光
    bark: [512, 512, 768, 1024],  // 树皮：v 沿枝干
    soil: [768, 512, 1024, 768],  // 盆土
  },
};

export function patioUV(region, u, v) {
  const [x0, y0, x1, y1] = PATIO_ATLAS.regions[region];
  const S = PATIO_ATLAS.size, m = PATIO_ATLAS.margin;
  return [(x0 + m + u * (x1 - x0 - 2 * m)) / S, (y0 + m + v * (y1 - y0 - 2 * m)) / S];
}
