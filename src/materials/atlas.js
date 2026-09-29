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

// —— 玩具调色板：128×128，4 × 4 个 32px 的纯色格子 ——
//   部件的 UV 全部指向格子正中（toyUV）：整个部件一种颜色。所有 UV 相同 → 屏幕上的 UV 导数为 0，
//   GPU 总是取最清晰的一级 mipmap，远看也不会混进隔壁格子的颜色。
//   漆面（木玩具上的水性漆）粗糙度 0.42 左右，布（小旗子、兔子耳朵里面）0.92。
export const TOY_ATLAS = {
  size: 128,
  cols: 4,
  swatches: [
    { name: 'red', c: [192, 86, 68], rough: 0.42 },
    { name: 'orange', c: [222, 140, 80], rough: 0.42 },
    { name: 'yellow', c: [230, 186, 88], rough: 0.42 },
    { name: 'green', c: [130, 160, 112], rough: 0.42 },
    { name: 'teal', c: [78, 138, 136], rough: 0.42 },
    { name: 'blue', c: [108, 140, 182], rough: 0.42 },
    { name: 'lilac', c: [162, 140, 186], rough: 0.42 },
    { name: 'pink', c: [228, 164, 156], rough: 0.42 },
    { name: 'cream', c: [240, 232, 216], rough: 0.4 },
    { name: 'beech', c: [218, 184, 140], rough: 0.55 },
    { name: 'walnut', c: [104, 72, 50], rough: 0.5 },
    { name: 'ink', c: [52, 52, 58], rough: 0.5 },
    { name: 'fabricPink', c: [226, 170, 164], rough: 0.92 },
    { name: 'fabricMustard', c: [214, 168, 78], rough: 0.92 },
    { name: 'fabricSage', c: [150, 168, 138], rough: 0.92 },
    { name: 'fabricBlue', c: [140, 164, 192], rough: 0.92 },
  ],
};

export function toyUV(name) {
  const A = TOY_ATLAS;
  const i = A.swatches.findIndex((s) => s.name === name);
  if (i < 0) throw new Error(`调色板里没有 ${name}`);
  return [((i % A.cols) + 0.5) / A.cols, (Math.floor(i / A.cols) + 0.5) / A.cols];
}

// —— 画纸：书桌上从纸卷拉出来的一整张纸（u 横跨纸宽，v 沿纸长：0 在纸卷那头）——
//   w、h 是纸的物理尺寸（米）；画只在 area = [v0, v1] 这一段（平铺在桌面上的部分），
//   纸卷本身的 UV 指向 blank（白纸的一点）
export const DRAWING = { w: 0.6, h: 0.43, area: [0.2, 0.84], blank: [0.5, 0.05] };

// —— 家电图集：1024×1024（洗衣机、烘干机共用一个材质）——
//   上半：两台机器的内筒（u 绕内筒一圈，v 沿筒深：0 在筒口）——洗衣机是冲孔的不锈钢，烘干机是压出菱格的不锈钢；
//   中间：两台机器的控制面板（面板上的印字、程序刻度、显示窗；显示窗里的数字画在自发光图里）；
//   最下一行：纯色格子（白色机身、镀铬、橡胶、黑色塑料……），部件的 UV 指向格子正中（同玩具调色板）。
//   机身绝大部分是白色格子里的同一点：一台洗衣机的白色机身、镀铬门圈、橡胶门封、内筒、面板，只有一个材质。
export const APPLIANCE_ATLAS = {
  size: 1024,
  regions: {
    drumW: [0, 0, 1024, 256],
    drumD: [0, 256, 1024, 512],
    panelW: [0, 512, 1024, 704],
    panelD: [0, 704, 1024, 896],
  },
  // 控制面板的物理尺寸（米）：一张面板贴图就是整条面板
  panel: { w: 0.6, h: 0.11 },
  // 内筒展开的物理尺寸（周长 × 深）：贴图按这个尺寸画孔、压纹
  drumW: { r: 0.235, depth: 0.38 },
  drumD: { r: 0.24, depth: 0.44 },
  swatchY: 896,
  swatches: [
    { name: 'white', c: [243, 243, 241], rough: 0.2 },
    { name: 'chrome', c: [226, 228, 232], rough: 0.07, metal: 1 },
    { name: 'rubber', c: [88, 90, 94], rough: 0.78 },
    { name: 'black', c: [28, 29, 31], rough: 0.42 },
    { name: 'graphite', c: [66, 68, 72], rough: 0.32 },
    { name: 'steel', c: [196, 198, 201], rough: 0.3, metal: 1 },
    { name: 'grey', c: [176, 178, 180], rough: 0.5 },
    { name: 'glassDark', c: [20, 22, 26], rough: 0.06 },
  ],
};

// 两块控制面板的布局（米，面板左上角为原点，y 向下）：几何体（抽屉、旋钮、显示窗边框、按钮）和面板贴图共用这一份。
//   drawer：抽屉面板的右边缘；knob：程序旋钮中心；display：显示窗；time：显示的剩余时间；digit：数码管颜色
export const APPLIANCE_PANELS = {
  W: {
    drawer: 0.19, knob: { cx: 0.3, cy: 0.056 },
    display: { x0: 0.395, y0: 0.03, x1: 0.478, y1: 0.078 }, time: '1:25', digit: [170, 222, 255],
    buttons: [[0.51, 0.07], [0.538, 0.07], [0.566, 0.07]],
  },
  D: {
    drawer: 0.21, knob: { cx: 0.32, cy: 0.056 },
    display: { x0: 0.41, y0: 0.03, x1: 0.493, y1: 0.078 }, time: '0:52', digit: [255, 178, 84],
    buttons: [[0.524, 0.07], [0.552, 0.07], [0.58, 0.07]],
  },
};

export function applianceUV(region, u, v) {
  const [x0, y0, x1, y1] = APPLIANCE_ATLAS.regions[region];
  const S = APPLIANCE_ATLAS.size, m = 2;
  return [(x0 + m + u * (x1 - x0 - 2 * m)) / S, (y0 + m + v * (y1 - y0 - 2 * m)) / S];
}

export function applianceSwatch(name) {
  const A = APPLIANCE_ATLAS;
  const i = A.swatches.findIndex((s) => s.name === name);
  if (i < 0) throw new Error(`家电图集里没有 ${name}`);
  const w = A.size / A.swatches.length;
  return [(i + 0.5) * w / A.size, (A.swatchY + (A.size - A.swatchY) / 2) / A.size];
}

// —— 衣物图集：1024×1024，4 × 4 格，每格 256px 是一种面料（衣帽间里所有的衣服、鞋、包、收纳盒共用一个材质）——
//   和调色板不同，面料格子里有图案（条纹、格子、罗纹、麻花、皮面的包浆）：一件衣服按它的真实尺寸（米）铺在格子里，
//   格子中心 = 这片布的中心，一格代表 P 米见方的一块布 —— 所以一格只装得下不超过 P 米的一片布：
//   衬衫 0.85m，长大衣、长裙、搭在衣架上的裤子 1.28m，叠好的毛衣、收纳盒、皮具 0.45m（小东西分到的像素多）。
//   u（贴图横向）是布的经向 = 衣服挂着时的竖直方向，v 是纬向。织物的细节（经纬纱）不在这张图里：
//   材质另有一小块可平铺的织纹法线，按 normalRepeat 重复铺满（同地毯）。
export const CLOTHES_ATLAS = {
  size: 1024,
  cols: 4,
  margin: 3,
  cells: [
    { name: 'oxford', P: 0.85 }, { name: 'oxfordBlue', P: 0.85 }, { name: 'stripe', P: 0.85 }, { name: 'plaid', P: 0.85 },
    { name: 'camel', P: 1.28 }, { name: 'charcoal', P: 1.28 }, { name: 'crepe', P: 1.28 }, { name: 'silk', P: 1.28 },
    { name: 'denim', P: 1.28 }, { name: 'olive', P: 1.28 }, { name: 'knitRib', P: 0.45 }, { name: 'knitGrey', P: 0.45 },
    { name: 'knitCable', P: 0.45 }, { name: 'linen', P: 0.45 }, { name: 'leather', P: 0.45 }, { name: 'leatherBlack', P: 0.45 },
  ],
};

// 格子里的一点：u, v 是相对格子中心的米数 → 图集 UV。超出格子（这片布比格子大）直接报错
export function clothesUV(name, u, v) {
  const A = CLOTHES_ATLAS;
  const i = A.cells.findIndex((c) => c.name === name);
  if (i < 0) throw new Error(`衣物图集里没有 ${name}`);
  const { P } = A.cells[i];
  const fu = 0.5 + u / P, fv = 0.5 + v / P;
  if (fu < -1e-6 || fu > 1 + 1e-6 || fv < -1e-6 || fv > 1 + 1e-6) throw new Error(`${name}：${(Math.abs(u) * 2).toFixed(2)} × ${(Math.abs(v) * 2).toFixed(2)}m 的布放不进 ${P}m 的格子`);
  const cell = A.size / A.cols, m = A.margin;
  const x0 = (i % A.cols) * cell, y0 = Math.floor(i / A.cols) * cell;
  return [(x0 + m + fu * (cell - 2 * m)) / A.size, (y0 + m + fv * (cell - 2 * m)) / A.size];
}

// —— 首饰调色板：128×128，8 × 8 个 16px 的格子（用了前三行）——
//   同玩具调色板：部件的 UV 指向格子正中，整个部件一种颜色；多了金属度 —— 金、玫瑰金、银、钢是金属，
//   珍珠、宝石、表盘、口红、香水是非金属。首饰、香水瓶盖、口红、瓷瓶和花共用一个材质、一次 draw call
export const TRINKET_ATLAS = {
  size: 128,
  cols: 8,
  swatches: [
    { name: 'gold', c: [244, 206, 132], rough: 0.16, metal: 1 },
    { name: 'brass', c: [220, 182, 118], rough: 0.3, metal: 1 },
    { name: 'roseGold', c: [236, 176, 152], rough: 0.18, metal: 1 },
    { name: 'silver', c: [236, 236, 238], rough: 0.1, metal: 1 },
    { name: 'steel', c: [204, 206, 210], rough: 0.24, metal: 1 },
    { name: 'pearl', c: [240, 232, 222], rough: 0.2 },
    { name: 'emerald', c: [20, 116, 76], rough: 0.04 },
    { name: 'ruby', c: [164, 18, 42], rough: 0.04 },
    { name: 'sapphire', c: [28, 54, 154], rough: 0.04 },
    { name: 'diamond', c: [242, 246, 250], rough: 0.02 },
    { name: 'onyx', c: [18, 18, 20], rough: 0.08 },
    { name: 'dial', c: [242, 236, 222], rough: 0.3 },
    { name: 'dialNavy', c: [30, 42, 78], rough: 0.22 },
    { name: 'strap', c: [128, 74, 44], rough: 0.5 },
    { name: 'strapBlack', c: [30, 28, 28], rough: 0.45 },
    { name: 'lipstick', c: [162, 30, 48], rough: 0.32 },
    { name: 'amber', c: [210, 132, 50], rough: 0.08 },
    { name: 'rose', c: [234, 162, 170], rough: 0.08 },
    { name: 'porcelain', c: [243, 242, 237], rough: 0.12 },
    { name: 'petal', c: [236, 170, 176], rough: 0.6 },
    { name: 'leaf', c: [88, 118, 74], rough: 0.55 },
    { name: 'black', c: [24, 24, 26], rough: 0.35 },
    { name: 'cream', c: [238, 230, 214], rough: 0.5 },
    { name: 'powder', c: [224, 178, 158], rough: 0.9 },
  ],
};

export function trinketUV(name) {
  const A = TRINKET_ATLAS;
  const i = A.swatches.findIndex((s) => s.name === name);
  if (i < 0) throw new Error(`首饰调色板里没有 ${name}`);
  return [((i % A.cols) + 0.5) / A.cols, (Math.floor(i / A.cols) + 0.5) / A.cols];
}

// —— 健身器材图集：1024×1024（跑步机、哑铃共用一个材质）——
//   上面：跑步机的屏幕（22 寸 16:9，一帧“晨跑”的风景画面 + 运动数据，整块画在自发光图里）；
//   中间：控制台面板的印字（速度 / 坡度按键）、八个哑铃头端面（黑色橡胶上印着重量）；
//   最下面两行：纯色格子（烤漆、塑料、橡胶、铝、镀铬……），部件的 UV 指向格子正中（同家电图集）。
export const GYM_ATLAS = {
  size: 1024,
  regions: {
    screen: [0, 0, 1024, 576],
    console: [0, 576, 1024, 704],
    hex: [0, 704, 1024, 832],
    swatch: [0, 832, 1024, 1024],
  },
  // 屏幕、控制台面板的物理尺寸（米）：一块区域就是一整块面板
  screen: { w: 0.496, h: 0.279 },
  console: { w: 0.62, h: 0.0775 },
  // 哑铃头端面上印的重量（kg），一格一个
  weights: ['2.5', '5', '7.5', '10', '12.5', '15', '17.5', '20'],
  cols: 8,
  swatches: [
    { name: 'graphite', c: [60, 62, 66], rough: 0.42 },
    { name: 'black', c: [22, 23, 25], rough: 0.32 },
    { name: 'matte', c: [32, 33, 35], rough: 0.72 },
    { name: 'rubber', c: [38, 39, 41], rough: 0.88 },
    { name: 'aluminum', c: [198, 201, 206], rough: 0.3, metal: 1 },
    { name: 'chrome', c: [232, 234, 237], rough: 0.07, metal: 1 },
    { name: 'gunmetal', c: [78, 80, 85], rough: 0.34, metal: 1 },
    { name: 'copper', c: [218, 148, 104], rough: 0.3, metal: 1 },
    { name: 'red', c: [200, 38, 42], rough: 0.36 },
    { name: 'green', c: [64, 172, 96], rough: 0.36 },
    { name: 'white', c: [238, 238, 236], rough: 0.34 },
    { name: 'grey', c: [124, 126, 130], rough: 0.5 },
    { name: 'glass', c: [10, 11, 13], rough: 0.05 },
    { name: 'orange', c: [240, 128, 56], rough: 0.4 },
    { name: 'iron', c: [40, 40, 42], rough: 0.62 },
    { name: 'cream', c: [232, 224, 208], rough: 0.5 },
  ],
};

// 区域里的一点：u, v ∈ [0, 1]（v 向下）→ 图集 UV
export function gymUV(region, u, v) {
  const [x0, y0, x1, y1] = GYM_ATLAS.regions[region];
  const S = GYM_ATLAS.size, m = 2;
  return [(x0 + m + u * (x1 - x0 - 2 * m)) / S, (y0 + m + v * (y1 - y0 - 2 * m)) / S];
}

export function gymSwatch(name) {
  const A = GYM_ATLAS;
  const i = A.swatches.findIndex((s) => s.name === name);
  if (i < 0) throw new Error(`健身器材图集里没有 ${name}`);
  const [x0, y0, x1, y1] = A.regions.swatch;
  const w = (x1 - x0) / A.cols, h = (y1 - y0) / Math.ceil(A.swatches.length / A.cols);
  return [(x0 + ((i % A.cols) + 0.5) * w) / A.size, (y0 + (Math.floor(i / A.cols) + 0.5) * h) / A.size];
}

// 哑铃头端面：第 i 格（重量），x, y 是端面上的位置除以六边形外接圆半径（[-1, 1]）→ 图集 UV。
// 六边形外接圆占格子宽的 0.9
export function gymHexUV(i, x, y) {
  const [x0, y0, x1] = GYM_ATLAS.regions.hex;
  const c = (x1 - x0) / GYM_ATLAS.weights.length;
  return [(x0 + (i + 0.5) * c + x * 0.45 * c) / GYM_ATLAS.size, (y0 + 0.5 * c + y * 0.45 * c) / GYM_ATLAS.size];
}

// —— 瑜伽垫：183 × 61cm、5mm 厚；贴图 1024²，u 沿垫子的长 ——
//   top：正面（印对位线）占 v 的 [0, 0.47]，bottom：背面（深一号的颜色、防滑波纹）占 [0.5, 0.97]，
//   edge：最下面一窄条画垫子的切边（上半是正面的颜色、下半是背面的颜色），垫子卷起来时侧面一圈圈的双色就是它
export const YOGA = { L: 1.83, W: 0.61, T: 0.005, top: [0, 0.47], bottom: [0.5, 0.97], edge: [0.98, 1] };

// —— 钢琴图集：2048²（三角钢琴里面除了烤漆的琴壳，都在这一张图上）——
//   harp：俯视的音板、铸铁板、琴弦、弦轴、制音器（x 横跨琴宽、z 从前往后，范围见 music/outline.js 的 HARP），
//         琴肚子里的平面、制音器的顶面都按位置直接投影进来；
//   octave：一个八度的白键顶面（七个白键 + 画上去的五个黑键：LOD2 没有黑键的几何，就用画的）。v = 0 是琴键前沿，在区域的下沿；
//   keyfront：同一个八度的白键前脸，紧贴在 octave 下面 —— 键顶前沿的小圆角从一块过渡到另一块，中间不串色；
//   swatch：纯色格子（象牙白、乌木黑、琴键呢、黄铜、金漆、钢……），部件的 UV 指向格子正中。
export const PIANO_ATLAS = {
  size: 2048,
  regions: {
    harp: [0, 0, 2048, 1792],
    octave: [0, 1792, 512, 2016],
    keyfront: [0, 2016, 512, 2048],
    swatch: [512, 1792, 2048, 2048],
  },
  cols: 12,
  swatches: [
    { name: 'ivory', c: [238, 234, 224], rough: 0.24 },
    { name: 'ebony', c: [20, 19, 19], rough: 0.34 },
    { name: 'felt', c: [112, 30, 40], rough: 0.95 },
    { name: 'brass', c: [232, 194, 126], rough: 0.2, metal: 1 },
    { name: 'gold', c: [208, 170, 100], rough: 0.4, metal: 1 },
    { name: 'steel', c: [206, 208, 212], rough: 0.24, metal: 1 },
    { name: 'damper', c: [30, 27, 26], rough: 0.4 },
    { name: 'black', c: [14, 14, 16], rough: 0.12 },
    { name: 'rubber', c: [34, 34, 36], rough: 0.85 },
    { name: 'spruce', c: [222, 188, 134], rough: 0.45 },
    { name: 'feltBlack', c: [28, 28, 30], rough: 0.95 },
    { name: 'chrome', c: [236, 238, 240], rough: 0.06, metal: 1 },
  ],
};

export function pianoUV(region, u, v) {
  const [x0, y0, x1, y1] = PIANO_ATLAS.regions[region];
  const S = PIANO_ATLAS.size, m = 2;
  const X = x0 + m + u * (x1 - x0 - 2 * m);
  // octave / keyfront 共用的那条边（琴键前沿）不留边距：两块在那里严丝合缝
  const Y = region === 'octave' ? y1 - v * (y1 - y0 - m) : region === 'keyfront' ? y0 + v * (y1 - y0 - m) : y0 + m + v * (y1 - y0 - 2 * m);
  return [X / S, Y / S];
}

export function pianoSwatch(name) {
  const A = PIANO_ATLAS;
  const i = A.swatches.findIndex((s) => s.name === name);
  if (i < 0) throw new Error(`钢琴图集里没有 ${name}`);
  const [x0, y0, x1, y1] = A.regions.swatch;
  const w = (x1 - x0) / A.cols, h = (y1 - y0) / Math.ceil(A.swatches.length / A.cols);
  return [(x0 + ((i % A.cols) + 0.5) * w) / A.size, (y0 + (Math.floor(i / A.cols) + 0.5) * h) / A.size];
}

// —— 乐谱：1024²，四页（2 × 2 格，每页 512²）——
//   0、1：钢琴谱（大谱表：高音谱表 + 低音谱表，花括号连起来），摊开放在钢琴的谱架上；
//   2、3：小提琴分谱（单行谱表），放在乐谱架上。
//   一页 23 × 30.5cm，u 横跨页宽，v 从页顶往下；纸的背面指向页边空白里的一点（blank）
export const SCORE = { size: 1024, W: 0.23, H: 0.305, blank: [0.02, 0.012] };

export function scoreUV(page, u, v) {
  const S = SCORE.size, c = S / 2, m = 2;
  const x0 = (page % 2) * c, y0 = Math.floor(page / 2) * c;
  return [(x0 + m + u * (c - 2 * m)) / S, (y0 + m + v * (c - 2 * m)) / S];
}

// —— 原木大板：2048²（茶桌的桌面一整块）——
//   top：俯视的桌面（x 沿板长、z 横跨板宽，范围见 tea/slab.js 的 SLAB_BOX）：年轮、白边、树结、裂缝和蝴蝶榫画在确切的位置上；
//   edgeF / edgeB：前、后两条自然边的侧面（u 沿边的弧长，v 从桌面往下）；
//   endL / endR：两头锯开的端面（u 从后沿到前沿，v 从桌面往下），看得见年轮的弧
export const SLAB_ATLAS = {
  size: 2048,
  regions: {
    top: [0, 0, 2048, 1536],
    edgeF: [0, 1536, 2048, 1728],
    edgeB: [0, 1728, 2048, 1920],
    endL: [0, 1920, 1024, 2048],
    endR: [1024, 1920, 2048, 2048],
  },
};
export function slabUV(region, u, v) {
  const [x0, y0, x1, y1] = SLAB_ATLAS.regions[region];
  const S = SLAB_ATLAS.size, m = 2;
  return [(x0 + m + u * (x1 - x0 - 2 * m)) / S, (y0 + m + v * (y1 - y0 - 2 * m)) / S];
}

// —— 茶具图集：1024²（茶桌上的茶具、博古架上的摆件共用一个材质）——
//   iron：铁壶壶身的霰点（u 绕一圈，v 沿 tea/profiles.js 里壶身曲线的弧长）；tray：乌金石茶盘的盘面（俯视，一道道出水槽）；
//   qinghua：青花将军罐 / 茶叶罐（u 绕一圈，v 沿曲线）；cake：普洱茶饼正面的棉纸（俯视）；book：线装书的封面；
//   zisha：紫砂壶身（u 绕一圈，v 沿曲线）；celadon：哥窑开片（杯子、梅瓶）；bamboo：湘妃竹（u 沿竹竿，v 绕一圈）；
//   swatch：纯色格子，部件的 UV 指向格子正中
export const TEA_ATLAS = {
  size: 1024,
  regions: {
    iron: [0, 0, 512, 256], tray: [512, 0, 1024, 256],
    qinghua: [0, 256, 512, 512], cake: [512, 256, 768, 512], book: [768, 256, 1024, 512],
    zisha: [0, 512, 512, 768], celadon: [512, 512, 1024, 768],
    bamboo: [0, 768, 1024, 896], swatch: [0, 896, 1024, 1024],
  },
  tray: { w: 0.5, h: 0.24 },    // 茶盘盘面的物理尺寸（米）
  cake: { r: 0.1 },             // 茶饼半径
  book: { w: 0.165, h: 0.245 }, // 书的封面
  bamboo: { len: 0.25 },        // 竹竿贴图代表的长度
  cols: 16,
  swatches: [
    { name: 'zisha', c: [122, 70, 55], rough: 0.5 },
    { name: 'celadon', c: [160, 168, 150], rough: 0.2 },
    { name: 'porcelain', c: [238, 238, 232], rough: 0.12 },
    { name: 'slate', c: [30, 31, 33], rough: 0.36 },
    { name: 'iron', c: [46, 43, 41], rough: 0.55, metal: 0.3 },
    { name: 'bronze', c: [96, 84, 58], rough: 0.42, metal: 0.85 },
    { name: 'brass', c: [214, 176, 112], rough: 0.28, metal: 1 },
    { name: 'bamboo', c: [192, 160, 102], rough: 0.5 },
    { name: 'black', c: [26, 26, 28], rough: 0.55 },
    { name: 'glassBlack', c: [12, 12, 14], rough: 0.06 },
    { name: 'rock', c: [42, 42, 44], rough: 0.32 },
    { name: 'paper', c: [234, 228, 212], rough: 0.85 },
    { name: 'indigo', c: [40, 52, 86], rough: 0.8 },
    { name: 'red', c: [170, 42, 38], rough: 0.55 },
    { name: 'ash', c: [198, 194, 186], rough: 0.92 },
    { name: 'verdigris', c: [92, 126, 108], rough: 0.6 },
    { name: 'tea', c: [112, 64, 28], rough: 0.05 },
    { name: 'stand', c: [62, 34, 26], rough: 0.35 },
    { name: 'gold', c: [232, 194, 124], rough: 0.2, metal: 1 },
    { name: 'white', c: [244, 242, 236], rough: 0.5 },
  ],
};
export function teaUV(region, u, v) {
  const [x0, y0, x1, y1] = TEA_ATLAS.regions[region];
  const S = TEA_ATLAS.size, m = 2;
  return [(x0 + m + u * (x1 - x0 - 2 * m)) / S, (y0 + m + v * (y1 - y0 - 2 * m)) / S];
}
export function teaSwatch(name) {
  const A = TEA_ATLAS;
  const i = A.swatches.findIndex((s) => s.name === name);
  if (i < 0) throw new Error(`茶具图集里没有 ${name}`);
  const [x0, y0, x1, y1] = A.regions.swatch;
  const w = (x1 - x0) / A.cols, h = (y1 - y0) / Math.ceil(A.swatches.length / A.cols);
  return [(x0 + ((i % A.cols) + 0.5) * w) / A.size, (y0 + (Math.floor(i / A.cols) + 0.5) * h) / A.size];
}

// —— 蒲团：1024² ——
//   top：俯视的顶面（一圈圈往外盘的蒲草辫，直径 0.47m 画满这一块）；side：侧面一排排横着的草辫（u 绕一圈，v 从顶边往下）
export const STRAW = { size: 1024, regions: { top: [0, 0, 1024, 768], side: [0, 768, 1024, 1024] }, R: 0.235, pitch: 0.0165, braid: 0.012 };
export function strawUV(region, u, v) {
  const [x0, y0, x1, y1] = STRAW.regions[region];
  const S = STRAW.size, m = 2;
  return [(x0 + m + u * (x1 - x0 - 2 * m)) / S, (y0 + m + v * (y1 - y0 - 2 * m)) / S];
}

// —— 影音室图集：2048²（投影幕的画面、功放面板、喇叭的振膜、投影仪的网布、铭牌、纯色格子共用一个材质）——
//   film：幕布上的画面（16:9，里面是 2.39:1 的宽银幕电影，上下两道黑边），颜色和自发光各画一份；
//   receiver：功放的拉丝铝面板（0.43 × 0.134m）：中间一块黑玻璃的显示屏（自发光的字）、两个旋钮的位置、一排小按钮；
//   cone：低音振膜（u 绕一圈，v 从外沿到防尘帽）；weave：中音的编织振膜（同样的展开）；
//   fabric：投影仪正面的针织网布（0.55 × 0.09m）；badge：音箱的铝铭牌（上半）、投影仪顶上的字（下半）；
//   control：沙发扶手侧面的按键（躺下 / 坐起两个箭头、USB 口）；swatch：纯色格子（LED 的格子带自发光）
export const THEATER_ATLAS = {
  size: 2048,
  regions: {
    film: [0, 0, 2048, 1152],
    receiver: [0, 1152, 1024, 1472],
    cone: [1024, 1152, 1536, 1280], weave: [1536, 1152, 2048, 1280],
    fabric: [1024, 1280, 1536, 1408], badge: [1536, 1280, 2048, 1344], badgeW: [1536, 1344, 2048, 1408],
    control: [1024, 1408, 1280, 1472],
    swatch: [0, 1472, 2048, 1600],
  },
  film: { aspect: 2.39 },                 // 画面里电影本身的宽高比（上下是黑边）
  receiver: { w: 0.43, h: 0.134 },
  fabric: { w: 0.55, h: 0.09 },
  badge: { w: 0.07, h: 0.0088 }, badgeW: { w: 0.12, h: 0.015 },
  control: { w: 0.08, h: 0.02 },
  cols: 16,
  swatches: [
    { name: 'velvetBlack', c: [14, 14, 16], rough: 0.95 },
    { name: 'screen', c: [214, 214, 210], rough: 0.9 },
    { name: 'satinBlack', c: [24, 24, 26], rough: 0.42 },
    { name: 'aluminum', c: [180, 182, 186], rough: 0.3, metal: 1 },
    { name: 'darkMetal', c: [58, 60, 64], rough: 0.35, metal: 1 },
    { name: 'chrome', c: [222, 224, 228], rough: 0.12, metal: 1 },
    { name: 'gold', c: [226, 186, 112], rough: 0.24, metal: 1 },
    { name: 'rubber', c: [22, 22, 23], rough: 0.7 },
    { name: 'silk', c: [46, 46, 48], rough: 0.62 },
    { name: 'felt', c: [16, 16, 17], rough: 0.95 },
    { name: 'glassBlack', c: [8, 8, 10], rough: 0.05 },
    { name: 'projWhite', c: [228, 228, 224], rough: 0.32 },
    { name: 'projGray', c: [120, 122, 126], rough: 0.4 },
    { name: 'plastic', c: [30, 30, 32], rough: 0.5 },
    { name: 'steel', c: [196, 198, 202], rough: 0.22, metal: 1 },
    { name: 'ledBlue', c: [70, 150, 255], rough: 0.3, emit: [80, 170, 255] },
    { name: 'ledWhite', c: [240, 236, 226], rough: 0.3, emit: [255, 244, 222] },
    { name: 'disc', c: [36, 60, 150], rough: 0.3 },
    { name: 'lens', c: [20, 24, 34], rough: 0.04 },
  ],
};
export function theaterUV(region, u, v) {
  const [x0, y0, x1, y1] = THEATER_ATLAS.regions[region];
  const S = THEATER_ATLAS.size, m = 2;
  return [(x0 + m + u * (x1 - x0 - 2 * m)) / S, (y0 + m + v * (y1 - y0 - 2 * m)) / S];
}
export function theaterSwatch(name) {
  const A = THEATER_ATLAS;
  const i = A.swatches.findIndex((s) => s.name === name);
  if (i < 0) throw new Error(`影音室图集里没有 ${name}`);
  const [x0, y0, x1, y1] = A.regions.swatch;
  const w = (x1 - x0) / A.cols, h = (y1 - y0) / Math.ceil(A.swatches.length / A.cols);
  return [(x0 + ((i % A.cols) + 0.5) * w) / A.size, (y0 + (Math.floor(i / A.cols) + 0.5) * h) / A.size];
}

// —— 健身房二图集：2048²（动感单车、划船机、龙门架共用一个材质）——
//   bikeScreen：单车触摸屏上的骑行画面（0.48 × 0.3m，整块自发光）：课程、爬坡剖面、四块数据、功率区间；
//   rowerScreen：划船机的液晶表（0.2 × 0.125m）：灰绿底、黑色的段码数字，带一点背光；
//   plates：配重片正面，两列 × 十行，一格一片（0.3 × 0.05m）：5 ~ 100kg 的白字、插销孔；
//   scale：龙门架滑轮立柱正面的刻度条（0.05 × 1.5m）：1 ~ 20 档的数字和刻线；
//   decal / decal2：车架、护罩上的贴标（0.3 × 0.075m）；swatch：纯色格子（带自发光的是指示灯）
export const GYM2_ATLAS = {
  size: 2048,
  regions: {
    bikeScreen: [0, 0, 1024, 640],
    rowerScreen: [1024, 0, 1536, 320],
    decal: [1024, 320, 1536, 448], decal2: [1024, 448, 1536, 576],
    scale: [1536, 0, 1600, 1024],
    plates: [0, 640, 1024, 1490],
    swatch: [0, 1920, 2048, 2048],
  },
  bikeScreen: { w: 0.48, h: 0.3 },
  rowerScreen: { w: 0.2, h: 0.125 },
  decal: { w: 0.3, h: 0.075 },
  plate: { w: 0.3, h: 0.05, n: 20, step: 5, cols: 2 },
  scale: { w: 0.05, h: 1.5, n: 20, pitch: 0.07, y0: 0.08 },
  cols: 16,
  swatches: [
    { name: 'frame', c: [26, 27, 29], rough: 0.62 },
    { name: 'satin', c: [20, 20, 22], rough: 0.4 },
    { name: 'red', c: [206, 34, 40], rough: 0.38 },
    { name: 'chrome', c: [232, 234, 237], rough: 0.07, metal: 1 },
    { name: 'aluminum', c: [192, 195, 200], rough: 0.3, metal: 1 },
    { name: 'steel', c: [150, 152, 156], rough: 0.3, metal: 1 },
    { name: 'rubber', c: [30, 30, 32], rough: 0.85 },
    { name: 'foam', c: [34, 34, 36], rough: 0.95 },
    { name: 'plastic', c: [40, 41, 44], rough: 0.5 },
    { name: 'nylon', c: [48, 49, 52], rough: 0.45 },
    { name: 'cable', c: [18, 18, 20], rough: 0.35 },
    { name: 'plate', c: [28, 28, 30], rough: 0.42 },
    { name: 'glass', c: [8, 9, 11], rough: 0.05 },
    { name: 'white', c: [236, 236, 234], rough: 0.4 },
    { name: 'strap', c: [36, 36, 40], rough: 0.8 },
    { name: 'paddle', c: [60, 64, 70], rough: 0.4 },
    { name: 'ledRed', c: [255, 60, 60], rough: 0.3, emit: [255, 70, 64] },
    { name: 'ledGreen', c: [80, 230, 120], rough: 0.3, emit: [90, 255, 130] },
    { name: 'bottle', c: [210, 40, 44], rough: 0.25 },
    { name: 'cap', c: [240, 240, 238], rough: 0.4 },
  ],
};
export function gym2UV(region, u, v) {
  const [x0, y0, x1, y1] = GYM2_ATLAS.regions[region];
  const S = GYM2_ATLAS.size, m = 2;
  return [(x0 + m + u * (x1 - x0 - 2 * m)) / S, (y0 + m + v * (y1 - y0 - 2 * m)) / S];
}
export function gym2Swatch(name) {
  const A = GYM2_ATLAS;
  const i = A.swatches.findIndex((s) => s.name === name);
  if (i < 0) throw new Error(`健身房二图集里没有 ${name}`);
  const [x0, y0, x1, y1] = A.regions.swatch;
  const w = (x1 - x0) / A.cols, h = (y1 - y0) / Math.ceil(A.swatches.length / A.cols);
  return [(x0 + ((i % A.cols) + 0.5) * w) / A.size, (y0 + (Math.floor(i / A.cols) + 0.5) * h) / A.size];
}
// 第 i 片配重片（0 是最上面那片 5kg）正面在图集里的一格 → UV
export function plateUV(i, u, v) {
  const [x0, y0, x1, y1] = GYM2_ATLAS.regions.plates;
  const P = GYM2_ATLAS.plate, rows = Math.ceil(P.n / P.cols);
  const cw = (x1 - x0) / P.cols, ch = (y1 - y0) / rows, m = 2;
  const cx = x0 + (i % P.cols) * cw, cy = y0 + Math.floor(i / P.cols) * ch;
  return [(cx + m + u * (cw - 2 * m)) / GYM2_ATLAS.size, (cy + m + v * (ch - 2 * m)) / GYM2_ATLAS.size];
}

// —— 游戏室图集（game 材质）：街机的屏幕（像素风太空射击）、顶灯箱、侧板画、控制面板、投币门，
// 桌上足球的场地，16 颗台球的展开图，底下一排纯色格子（部分自发光）——
export const GAME_ATLAS = {
  size: 2048,
  regions: {
    screen: [0, 0, 768, 1024], marquee: [768, 0, 1792, 256], cpanel: [768, 256, 1408, 512], coin: [1408, 256, 1664, 598],
    field: [768, 598, 1792, 1180], side: [0, 1024, 420, 1920], balls: [420, 1180, 1444, 1692], swatch: [0, 1920, 2048, 2048],
  },
  screen: { w: 0.36, h: 0.48, gw: 216, gh: 288 },
  marquee: { w: 0.62, h: 0.155 },
  cpanel: { w: 0.64, h: 0.256 },
  coin: { w: 0.27, h: 0.36 },
  field: { w: 1.2, h: 0.682 },
  side: { w: 0.82, h: 1.76 },
  balls: { cols: 4, rows: 4 },
  cols: 16,
  swatches: [
    { name: 'black', c: [16, 16, 18], rough: 0.35 },
    { name: 'tmold', c: [236, 72, 44], rough: 0.4 },
    { name: 'chrome', c: [232, 234, 237], rough: 0.07, metal: 1 },
    { name: 'steel', c: [150, 152, 156], rough: 0.3, metal: 1 },
    { name: 'rubber', c: [30, 30, 32], rough: 0.85 },
    { name: 'glass', c: [8, 9, 11], rough: 0.32 },
    { name: 'btnRed', c: [220, 30, 36], rough: 0.3 },
    { name: 'btnYellow', c: [245, 196, 40], rough: 0.3 },
    { name: 'btnBlue', c: [40, 90, 220], rough: 0.3 },
    { name: 'btnGreen', c: [40, 170, 80], rough: 0.3 },
    { name: 'white', c: [238, 238, 234], rough: 0.35 },
    { name: 'pearl', c: [236, 232, 220], rough: 0.25 },
    { name: 'brass', c: [205, 164, 84], rough: 0.28, metal: 1 },
    { name: 'redTeam', c: [196, 28, 34], rough: 0.32 },
    { name: 'blueTeam', c: [28, 76, 186], rough: 0.32 },
    { name: 'plastic', c: [40, 41, 44], rough: 0.5 },
    { name: 'ivory', c: [240, 232, 210], rough: 0.3 },
    { name: 'chalk', c: [60, 110, 200], rough: 0.9 },
    { name: 'maple', c: [214, 178, 128], rough: 0.4 },
    { name: 'ebony', c: [24, 20, 18], rough: 0.3 },
    { name: 'ledRed', c: [255, 70, 60], rough: 0.3, emit: [255, 70, 60] },
    { name: 'neonPink', c: [255, 90, 190], rough: 0.3, emit: [255, 60, 170] },
    { name: 'neonCyan', c: [90, 235, 255], rough: 0.3, emit: [60, 230, 255] },
    { name: 'grille', c: [22, 22, 24], rough: 0.7 },
  ],
};
export function gameUV(region, u, v) {
  const [x0, y0, x1, y1] = GAME_ATLAS.regions[region];
  const S = GAME_ATLAS.size, m = 2;
  return [(x0 + m + u * (x1 - x0 - 2 * m)) / S, (y0 + m + v * (y1 - y0 - 2 * m)) / S];
}
export function gameSwatch(name) {
  const A = GAME_ATLAS;
  const i = A.swatches.findIndex((s) => s.name === name);
  if (i < 0) throw new Error(`游戏室图集里没有 ${name}`);
  const [x0, y0, x1, y1] = A.regions.swatch;
  const w = (x1 - x0) / A.cols, h = (y1 - y0) / Math.ceil(A.swatches.length / A.cols);
  return [(x0 + ((i % A.cols) + 0.5) * w) / A.size, (y0 + (Math.floor(i / A.cols) + 0.5) * h) / A.size];
}
// 第 n 颗台球（0 是白球，1 ~ 15 是编号球）的展开图：u 绕一圈、v 从上极点到下极点
export function ballUV(n, u, v) {
  const [x0, y0, x1, y1] = GAME_ATLAS.regions.balls;
  const { cols, rows } = GAME_ATLAS.balls, S = GAME_ATLAS.size, m = 1;
  const cw = (x1 - x0) / cols, ch = (y1 - y0) / rows;
  const cx = x0 + (n % cols) * cw, cy = y0 + Math.floor(n / cols) * ch;
  return [(cx + m + u * (cw - 2 * m)) / S, (cy + m + v * (ch - 2 * m)) / S];
}

// —— 画室图集（studio 材质）：画架上的油画、调色板、颜料管的标签、沾了颜料的抹布、纯色格子 ——
export const STUDIO_ATLAS = {
  size: 2048,
  regions: {
    painting: [0, 0, 768, 1024], palette: [768, 0, 1280, 384], labels: [768, 384, 1280, 672], rag: [1280, 0, 1536, 256],
    back: [1280, 256, 1664, 768], swatch: [0, 1920, 2048, 2048],
  },
  painting: { w: 0.6, h: 0.8 },
  palette: { w: 0.4, h: 0.3 },
  rag: { w: 0.3, h: 0.3 },
  labels: { cols: 4, rows: 3 },
  // 颜料管：颜色（sRGB）和标签上的名字
  tubes: [
    { name: 'TITANIUM WHITE', c: [244, 242, 236] }, { name: 'CADMIUM YELLOW', c: [248, 196, 30] }, { name: 'YELLOW OCHRE', c: [200, 146, 60] },
    { name: 'CADMIUM RED', c: [210, 40, 36] }, { name: 'ALIZARIN', c: [150, 24, 48] }, { name: 'ULTRAMARINE', c: [36, 56, 160] },
    { name: 'SAP GREEN', c: [64, 110, 40] }, { name: 'IVORY BLACK', c: [26, 26, 28] },
  ],
  cols: 16,
  swatches: [
    { name: 'canvas', c: [238, 232, 216], rough: 0.8 },
    { name: 'aluminum', c: [200, 202, 206], rough: 0.3, metal: 1 },
    { name: 'capWhite', c: [240, 240, 236], rough: 0.4 },
    { name: 'capBlack', c: [30, 30, 32], rough: 0.4 },
    { name: 'bristle', c: [214, 190, 150], rough: 0.8 },
    { name: 'synth', c: [112, 66, 40], rough: 0.6 },
    { name: 'brass', c: [205, 168, 92], rough: 0.25, metal: 1 },
    { name: 'silver', c: [205, 207, 211], rough: 0.22, metal: 1 },
    { name: 'handleRed', c: [150, 30, 28], rough: 0.22 },
    { name: 'handleBlack', c: [26, 26, 28], rough: 0.22 },
    { name: 'handleWood', c: [196, 160, 110], rough: 0.35 },
    { name: 'mint', c: [150, 200, 184], rough: 0.42 },
    { name: 'caster', c: [44, 44, 48], rough: 0.6 },
    { name: 'paper', c: [244, 242, 236], rough: 0.85 },
    { name: 'cover', c: [28, 28, 30], rough: 0.7 },
    { name: 'elastic', c: [176, 40, 40], rough: 0.6 },
    { name: 'graphite', c: [70, 72, 76], rough: 0.5 },
    { name: 'blade', c: [196, 198, 202], rough: 0.18, metal: 1 },
    { name: 'cork', c: [170, 128, 88], rough: 0.8 },
    { name: 'lilac', c: [150, 120, 190], rough: 0.4 },
    { name: 'pine', c: [214, 186, 140], rough: 0.7 },
    { name: 'pencilGreen', c: [36, 92, 64], rough: 0.35 },
    { name: 'paintBlue', c: [52, 72, 168], rough: 0.3 },
    { name: 'paintYellow', c: [232, 188, 64], rough: 0.3 },
    { name: 'paintGreen', c: [74, 112, 58], rough: 0.3 },
    { name: 'murky', c: [104, 100, 128], rough: 0.08 },
    { name: 'amber', c: [118, 62, 20], rough: 0.12 },
    { name: 'paintRed', c: [196, 44, 38], rough: 0.3 },
  ],
};
export function studioUV(region, u, v) {
  const [x0, y0, x1, y1] = STUDIO_ATLAS.regions[region];
  const S = STUDIO_ATLAS.size, m = 2;
  return [(x0 + m + u * (x1 - x0 - 2 * m)) / S, (y0 + m + v * (y1 - y0 - 2 * m)) / S];
}
export function studioSwatch(name) {
  const A = STUDIO_ATLAS;
  const i = A.swatches.findIndex((s) => s.name === name);
  if (i < 0) throw new Error(`画室图集里没有 ${name}`);
  const [x0, y0, x1, y1] = A.regions.swatch;
  const w = (x1 - x0) / A.cols, h = (y1 - y0) / Math.ceil(A.swatches.length / A.cols);
  return [(x0 + ((i % A.cols) + 0.5) * w) / A.size, (y0 + (Math.floor(i / A.cols) + 0.5) * h) / A.size];
}
// 第 i 支颜料管的标签（u 绕一圈、v 从管肩到管尾）
export function labelUV(i, u, v) {
  const [x0, y0, x1, y1] = STUDIO_ATLAS.regions.labels;
  const { cols, rows } = STUDIO_ATLAS.labels, S = STUDIO_ATLAS.size, m = 2;
  const cw = (x1 - x0) / cols, ch = (y1 - y0) / rows;
  const cx = x0 + (i % cols) * cw, cy = y0 + Math.floor(i / cols) * ch;
  return [(cx + m + u * (cw - 2 * m)) / S, (cy + m + v * (ch - 2 * m)) / S];
}
