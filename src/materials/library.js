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
  shade: {
    label: '亚麻灯罩（内侧发光）',
    tex: 'linen', tile: [0.12, 0.12], color: tint([232, 222, 200]),
    roughness: 1, metallic: 0, normalScale: 0.6, doubleSided: true,
    emissive: [1.0, 0.78, 0.52], emissiveTex: true, emissiveStrength: 1.6,
  },
  oxblood: {
    label: '牛血红釉陶瓷（高光）',
    color: srgb(122, 28, 30), metallic: 0, roughness: 0.16,
    clearcoat: { factor: 1, roughness: 0.04 },
  },
  shade_pleat: {
    label: '百褶亚麻灯罩（透光）',
    // 自发光比落地灯的直筒灯罩弱一些：褶子的明暗要留在灯光下也看得见
    tex: 'linen', tile: [0.12, 0.12], color: tint([236, 226, 206]),
    roughness: 1, metallic: 0, normalScale: 0.7, doubleSided: true,
    emissive: [1.0, 0.8, 0.56], emissiveTex: true, emissiveStrength: 0.8,
  },
  paper: {
    label: '楮皮纸（竹骨纸灯笼，透光）',
    // 整只灯笼一张贴图（竹骨螺旋、纸片接缝都画在曲线上的准确位置），点亮时自发光也用这张图
    tex: 'paper', tile: [1, 1], noOffset: true, doubleSided: true,
    roughness: 1, metallic: 0, normalScale: 0.6,
    emissive: [1.0, 0.8, 0.56], emissiveTex: true, emissiveStrength: 0.8,
  },
  opal: {
    label: '乳白玻璃（缎面，内置光源）',
    // 缎面（酸蚀）玻璃：高光柔和，低面数的球也看不出棱
    color: srgb(246, 244, 238), metallic: 0, roughness: 0.24,
    emissive: [1.0, 0.87, 0.7], emissiveStrength: 1.1,
  },
  bulb: {
    label: '暖光灯泡',
    color: srgb(255, 236, 205), metallic: 0, roughness: 0.2,
    emissive: [1.0, 0.85, 0.62], emissiveStrength: 6,
  },

  // —— 摆件 ——
  // 图集材质（noOffset）：UV 直接指向图集里的格子，不能加随机偏移，tile = [1, 1] 表示 UV 已经是 0~1 的贴图坐标
  books: {
    label: '布面精装书（调色板图集）',
    tex: 'books', tile: [1, 1], noOffset: true,
    // 粗糙度 / 金属度都由贴图给：布面粗糙、烫金是金属
    roughness: 1, metallic: 1, normalScale: 0.6,
  },
  glaze: {
    label: '手工釉面炻器（图集）',
    // 釉色、露胎、流釉、铁点全画在图集里；粗糙度也由贴图给：釉面 0.1~0.3 有清晰的反光，露胎 0.84 哑光
    tex: 'ceramics', tile: [1, 1], noOffset: true,
    roughness: 1, metallic: 0, normalScale: 0.8,
  },
  foliage: {
    label: '植物（叶 / 树皮 / 盆土图集）',
    // 叶片是单层几何，双面显示；背面的法线由渲染器自动翻转
    tex: 'foliage', tile: [1, 1], noOffset: true, doubleSided: true,
    roughness: 1, metallic: 0, normalScale: 0.7,
  },
  rug: {
    label: '手工羊毛地毯（Beni Ourain 菱格）',
    // 整幅图案一张贴图铺满（uvFit），羊毛绒面有 sheen
    tex: 'rug', tile: [1, 1], noOffset: true,
    roughness: 1, metallic: 0, normalScale: 1,
    normalRepeat: [8, 5.6], // 绒面细节法线：0.25m 一块，重复铺满 2m × 1.4m
    sheen: { color: [0.55, 0.52, 0.47], roughness: 0.7 },
  },
  fringe: {
    label: '羊毛流苏（透明裁剪）',
    // 一张平铺的卡片 + alpha 裁剪画出一束束流苏；不参与 AO / 阴影烘焙的遮挡
    tex: 'fringe', tile: [0.2, 0.085], noOffset: true, doubleSided: true,
    // 阈值取低一点：远处 mip 把细线的 alpha 平均掉以后，流苏也不会整片消失
    alphaMode: 'MASK', alphaCutoff: 0.35,
    roughness: 1, metallic: 0, normalScale: 0.6,
    sheen: { color: [0.5, 0.48, 0.44], roughness: 0.7 },
  },
};

// —— 建筑构件 ——
// 地板、墙面是“可拼接模块”：贴图按模块对齐（noOffset，不加随机偏移），周期整除 2m 模块，相邻模块无缝接上
const PLASTER_BASE = [242, 240, 236];
Object.assign(MATERIALS, {
  floor_oak: {
    label: '人字拼橡木（哑光清漆）',
    tex: 'herringbone', tile: [1, 1], noOffset: true,
    roughness: 1, metallic: 0, normalScale: 0.7,
    clearcoat: { factor: 0.3, roughness: 0.4 },
  },
  floor_smoked: {
    label: '烟熏橡木宽板（木蜡油）',
    tex: 'planks', tile: [2, 2], noOffset: true,
    roughness: 1, metallic: 0, normalScale: 0.7,
    clearcoat: { factor: 0.15, roughness: 0.5 },
  },
  terrazzo: {
    label: '水磨石（磨光，黄铜分隔条）',
    // 金属度贴图只在铜条上是 1
    tex: 'terrazzo', tile: [1, 1], noOffset: true,
    roughness: 1, metallic: 1, normalScale: 0.5,
    clearcoat: { factor: 0.35, roughness: 0.12 },
  },
  plaster: {
    label: '乳胶漆（暖白）',
    tex: 'plaster', tile: [0.5, 0.5], noOffset: true, color: tint([238, 234, 226], PLASTER_BASE),
    roughness: 1, metallic: 0, normalScale: 0.45,
  },
  plaster_sage: {
    label: '乳胶漆（鼠尾草绿）',
    tex: 'plaster', tile: [0.5, 0.5], noOffset: true, color: tint([140, 152, 134], PLASTER_BASE),
    roughness: 1, metallic: 0, normalScale: 0.45,
  },
  paint_sage: {
    label: '护墙板线条（鼠尾草绿缎面漆）',
    color: srgb(140, 152, 134), metallic: 0, roughness: 0.5,
    clearcoat: { factor: 0.12, roughness: 0.4 },
  },
  glass: {
    label: '透明玻璃',
    // 半透明混合；不参与 AO 遮挡，自己也不压 AO（玻璃边上不该有一圈黑）
    color: srgb(226, 236, 234, 0.16), metallic: 0, roughness: 0.04,
    alphaMode: 'BLEND', aoStrength: 0,
  },
  cane: {
    label: '藤编（维也纳藤编）',
    tex: 'cane', tile: [0.1, 0.1],
    roughness: 1, metallic: 0, normalScale: 0.8,
  },
});

// —— 厨房 ——
Object.assign(MATERIALS, {
  paint_green: {
    label: '墨绿色缎面烤漆（橱柜）',
    color: srgb(50, 72, 60), metallic: 0, roughness: 0.38,
    clearcoat: { factor: 0.12, roughness: 0.35 },
  },
  marble_slab: {
    label: '白色大理石台面（抛光）',
    // 和“哑光大理石”共用一张贴图：台面长 2.4m，平铺尺寸放大到 1.3m，纹理不那么密；抛光靠清漆层
    tex: 'marble', tile: [1.3, 1.3],
    roughness: 1, metallic: 0, normalScale: 0.2,
    clearcoat: { factor: 0.55, roughness: 0.06 },
  },
  zellige: {
    label: '手工釉面砖（Zellige，自然白）',
    // 贴图 50cm = 5 × 5 块砖，按台面对齐（noOffset）：最下面一排是整砖
    tex: 'zellige', tile: [0.5, 0.5], noOffset: true,
    roughness: 1, metallic: 0, normalScale: 1,
  },
  ceramic: {
    label: '白色耐火黏土（釉面，水槽）',
    color: srgb(244, 243, 239), metallic: 0, roughness: 0.14,
    clearcoat: { factor: 0.8, roughness: 0.05 },
  },
  glass_black: {
    label: '黑色微晶玻璃（电磁炉面板）',
    color: srgb(13, 13, 15), metallic: 0, roughness: 0.1,
    clearcoat: { factor: 1, roughness: 0.03 },
  },
  glass_print: {
    label: '面板丝印（灰色）',
    color: srgb(118, 118, 120), metallic: 0, roughness: 0.45,
  },
  stainless: {
    label: '拉丝不锈钢',
    color: srgb(204, 205, 206), metallic: 1, roughness: 0.34,
  },
  led: {
    label: 'LED 灯带（乳白扩散罩）',
    color: srgb(250, 246, 238), metallic: 0, roughness: 0.3,
    emissive: [1.0, 0.88, 0.72], emissiveStrength: 3,
  },
});

// —— 浴室 ——
const ZELLIGE_BASE = [238, 236, 230]; // 釉面砖贴图的平均色：绿色的砖用同一张图染出来，贴图只占一份
Object.assign(MATERIALS, {
  zellige_green: {
    label: '手工釉面砖（Zellige，苔绿）',
    tex: 'zellige', tile: [0.5, 0.5], noOffset: true, color: tint([54, 84, 70], ZELLIGE_BASE),
    roughness: 1, metallic: 0, normalScale: 1,
  },
  floor_hex: {
    label: '六角马赛克（白色大理石，深绿点缀）',
    tex: 'hexmosaic', tile: [1, 1], noOffset: true,
    roughness: 1, metallic: 0, normalScale: 1,
    clearcoat: { factor: 0.2, roughness: 0.25 },
  },
  mirror: {
    label: '银镜',
    // 金属度 1、粗糙度极低：直接映出环境贴图；AO 只压一点（镜面贴着框的那一圈）
    color: srgb(236, 238, 238), metallic: 1, roughness: 0.03, aoStrength: 0.35,
  },
});

// —— 阳台 ——
Object.assign(MATERIALS, {
  teak: {
    label: '柚木（户外油）',
    tex: 'teak', tile: [0.9, 0.9],
    roughness: 1, metallic: 0, normalScale: 0.6,
  },
  rope: {
    label: '户外编绳（三股拧绳）',
    // 贴图 u 是一个捻距（3.5cm），v 正好绕绳子一圈（绳径 12mm → 周长 3.77cm）
    tex: 'rope', tile: [0.035, 0.0377], noOffset: true,
    roughness: 1, metallic: 0, normalScale: 1,
    sheen: { color: [0.36, 0.34, 0.3], roughness: 0.6 },
  },
  canvas: {
    label: '户外帆布（燕麦色）',
    tex: 'linen', tile: [0.12, 0.12], color: tint([214, 204, 186]),
    roughness: 1, metallic: 0, normalScale: 0.8,
    sheen: { color: [0.5, 0.48, 0.44], roughness: 0.6 },
  },
  deck: {
    label: '柚木色户外地板（留缝铺）',
    tex: 'decking', tile: [2, 2], noOffset: true,
    roughness: 1, metallic: 0, normalScale: 0.8,
  },
  patio: {
    label: '阳台陶器（青瓷鼓凳 / 陶土花盆 / 橄榄树皮与盆土）',
    // 图集：u 绕器物一圈，v 沿设计曲线（见 balcony/profiles.js）；粗糙度由贴图给（釉 0.14、陶 0.86）
    tex: 'patio', tile: [1, 1], noOffset: true,
    roughness: 1, metallic: 0, normalScale: 0.8,
  },
  patio_leaf: {
    label: '橄榄叶（正面深绿 / 背面银灰）',
    tex: 'patio', tile: [1, 1], noOffset: true, doubleSided: true,
    roughness: 1, metallic: 0, normalScale: 0.6,
  },
});

// —— 书房 ——
Object.assign(MATERIALS, {
  paint_navy: {
    label: '墨蓝色缎面漆（书架墙）',
    color: srgb(40, 52, 70), metallic: 0, roughness: 0.4,
    clearcoat: { factor: 0.12, roughness: 0.35 },
  },
  velvet_rust: {
    label: '丝绒（铁锈红）',
    // 和墨绿丝绒同一个生成器、另一个颜色（染色做不出来：绿色贴图乘不出红色）
    tex: 'velvet_rust', tile: [0.2, 0.2],
    roughness: 1, metallic: 0, normalScale: 0.5,
    sheen: { color: [0.5, 0.25, 0.17], roughness: 0.35 },
  },
  enamel: {
    label: '白色搪瓷（灯罩内侧，受光）',
    // 灯泡就在里面：内壁一直是亮的，用一点自发光代替实时光照
    color: srgb(244, 240, 232), metallic: 0, roughness: 0.3,
    emissive: [1.0, 0.86, 0.66], emissiveStrength: 0.9,
  },
});

// —— 玄关 ——
Object.assign(MATERIALS, {
  floor_checker: {
    label: '黑白棋盘格大理石（抛光）',
    tex: 'checker', tile: [2, 2], noOffset: true,
    roughness: 1, metallic: 0, normalScale: 1,
    clearcoat: { factor: 0.35, roughness: 0.12 },
  },
  travertine: {
    label: '洞石（顺纹切，哑光）',
    tex: 'travertine', tile: [0.6, 0.6],
    roughness: 1, metallic: 0, normalScale: 0.8,
  },
  felt: {
    label: '羊毛毡（驼色）',
    tex: 'felt', tile: [0.08, 0.08],
    roughness: 1, metallic: 0, normalScale: 0.6,
    sheen: { color: [0.42, 0.33, 0.24], roughness: 0.7 },
  },
  linen_mustard: {
    label: '亚麻布（芥末黄，围巾）',
    // 和托特包的帆布同一张亚麻贴图，染成芥末黄 —— 衣帽架上不多带一套贴图
    tex: 'linen', tile: [0.1, 0.1], color: tint([200, 150, 58]), doubleSided: true,
    roughness: 1, metallic: 0, normalScale: 0.8,
    sheen: { color: [0.5, 0.4, 0.18], roughness: 0.6 },
  },
});

// —— 儿童房 ——
// 胶合板：一块板拆成两种材质 —— 面是桦木贴皮（birch），边是一层层的单板（ply）。
// ply 的贴图 v 方向正好是一块板的厚度（18mm），边带的 v 按板厚方向的坐标给（不是弧长），所以不能加随机偏移
export const PLY_T = 0.018;
Object.assign(MATERIALS, {
  birch: {
    label: '桦木（旋切贴皮，水性哑光清漆）',
    tex: 'birch', tile: [0.6, 0.6],
    roughness: 1, metallic: 0, normalScale: 0.5,
  },
  ply: {
    label: '桦木胶合板的边（13 层）',
    tex: 'ply', tile: [0.25, PLY_T], noOffset: true,
    roughness: 1, metallic: 0, normalScale: 0.6,
  },
  toys: {
    label: '木玩具的水性漆 / 布（调色板）',
    // 调色板：部件的 UV 指向格子正中，颜色、粗糙度都由贴图给；布做的小旗子是单层的，材质双面显示
    tex: 'toys', tile: [1, 1], noOffset: true, doubleSided: true,
    roughness: 1, metallic: 0, normalScale: 0,
  },
  gingham: {
    label: '色织格子布（雾蓝，被套）',
    tex: 'gingham', tile: [0.14, 0.14],
    roughness: 1, metallic: 0, normalScale: 0.8,
    sheen: { color: [0.5, 0.52, 0.56], roughness: 0.55 },
  },
  drawing: {
    label: '画纸（蜡笔画）',
    // 整张纸一张贴图（从纸卷那头到卷起来的那头）；纸是单层的，卷起来的那头看得见背面
    tex: 'drawing', tile: [1, 1], noOffset: true, doubleSided: true,
    roughness: 1, metallic: 0, normalScale: 0.5,
  },
  linen_blush: {
    label: '亚麻布（藕粉，收纳筐）',
    tex: 'linen', tile: [0.12, 0.12], color: tint([214, 170, 160]),
    roughness: 1, metallic: 0, normalScale: 0.9,
    sheen: { color: [0.5, 0.4, 0.38], roughness: 0.55 },
  },
});

// —— 洗衣房 ——
const TERRY_BASE = [244, 242, 236];
export const TORCHON_W = 0.46; // 茶巾的宽：贴图的 v 正好一幅
Object.assign(MATERIALS, {
  appliance: {
    label: '家电（白色烤漆机身 / 镀铬 / 橡胶 / 不锈钢内筒 / 面板印字，图集）',
    // 图集：颜色、粗糙度、金属度都在贴图里（镀铬、内筒是金属）；显示窗里的数字是自发光
    tex: 'appliance', tile: [1, 1], noOffset: true,
    roughness: 1, metallic: 1, normalScale: 0.6,
    emissive: [1, 1, 1], emissiveStrength: 2.5,
  },
  glass_smoke: {
    label: '烟灰色玻璃（洗衣机门）',
    // 和透明玻璃一样半透明混合、不参与 AO；颜色深一些，筒里的东西隐约看得见
    color: srgb(44, 48, 54, 0.46), metallic: 0, roughness: 0.04,
    alphaMode: 'BLEND', aoStrength: 0,
  },
  terry: {
    label: '毛巾布（白色毛圈）',
    // 晾衣架上搭着的毛巾是单层的（双面显示）
    tex: 'terry', tile: [0.05, 0.05], doubleSided: true,
    roughness: 1, metallic: 0, normalScale: 1,
    sheen: { color: [0.62, 0.62, 0.6], roughness: 0.6 },
  },
  terry_sage: {
    label: '毛巾布（鼠尾草绿）',
    tex: 'terry', tile: [0.05, 0.05], color: tint([150, 170, 142], TERRY_BASE), doubleSided: true,
    roughness: 1, metallic: 0, normalScale: 1,
    sheen: { color: [0.4, 0.46, 0.38], roughness: 0.6 },
  },
  floor_cement: {
    label: '水泥花砖（哑光，深蓝 / 灰蓝 / 陶土红）',
    tex: 'cement', tile: [2, 2], noOffset: true,
    roughness: 1, metallic: 0, normalScale: 1,
  },
  torchon: {
    label: '亚麻茶巾（本色，两边红条）',
    // v 正好一条茶巾的宽（条纹贴着长边），所以不能加随机偏移
    tex: 'torchon', tile: [0.6, TORCHON_W], noOffset: true, doubleSided: true,
    roughness: 1, metallic: 0, normalScale: 0.8,
    sheen: { color: [0.5, 0.48, 0.44], roughness: 0.6 },
  },
});

// —— 衣帽间 ——
Object.assign(MATERIALS, {
  clothes: {
    label: '衣物（衬衫 / 大衣 / 裙子 / 裤子 / 毛衣 / 皮鞋 / 手袋 / 收纳盒，面料图集）',
    // 图集：每件衣服按真实尺寸铺在自己那种面料的格子里，颜色、粗糙度都由贴图给；
    // 细节法线是一小块平纹，在整张图集上重复 128 次。搭在衣架上的裤子是单层的布：双面显示
    tex: 'clothes', tile: [1, 1], noOffset: true, doubleSided: true,
    roughness: 1, metallic: 0, normalScale: 0.7, normalRepeat: [128, 128],
    sheen: { color: [0.3, 0.3, 0.3], roughness: 0.55 },
  },
  trinkets: {
    label: '首饰与小摆件（金 / 银 / 珍珠 / 宝石 / 香水 / 口红，调色板）',
    // 调色板：颜色、粗糙度、金属度都在贴图里（金属部分金属度 1，珍珠、宝石、香水是非金属）
    tex: 'trinkets', tile: [1, 1], noOffset: true,
    roughness: 1, metallic: 1, normalScale: 0,
  },
});

// —— 健身房 ——
Object.assign(MATERIALS, {
  gym: {
    label: '健身器材（烤漆 / 塑料 / 橡胶 / 铝 / 镀铬 / 屏幕，图集）',
    // 图集：颜色、粗糙度、金属度都在贴图里；跑步机的屏幕整块自发光（风景画面和数据），其余格子不发光
    tex: 'gym', tile: [1, 1], noOffset: true,
    roughness: 1, metallic: 1, normalScale: 0.6,
    emissive: [1, 1, 1], emissiveStrength: 1.35,
  },
  belt: {
    label: '橡胶跑带（菱格防滑纹）',
    tex: 'belt', tile: [0.04, 0.04],
    roughness: 1, metallic: 0, normalScale: 1,
  },
  knurl: {
    label: '滚花镀铬（哑铃握把）',
    tex: 'knurl', tile: [0.008, 0.008],
    roughness: 1, metallic: 1, normalScale: 1,
  },
  cork: {
    label: '软木（瑜伽砖）',
    tex: 'cork', tile: [0.12, 0.12],
    roughness: 1, metallic: 0, normalScale: 0.8,
  },
  yoga: {
    label: '天然橡胶瑜伽垫（鼠尾草绿，印对位线，正反两色）',
    // 整张垫子一张贴图（正面、背面、切边三块）：UV 由几何直接给出，不能加随机偏移；卷起来的一截看得见背面
    tex: 'yoga', tile: [1, 1], noOffset: true, doubleSided: true,
    roughness: 1, metallic: 0, normalScale: 0.6,
  },
  floor_rubber: {
    label: '橡胶地垫（黑色，灰色 EPDM 彩点）',
    tex: 'rubberFloor', tile: [2, 2], noOffset: true,
    roughness: 1, metallic: 0, normalScale: 0.8,
  },
});

// —— 书房二（琴房）——
const LEATHER_BASE = [122, 72, 46]; // 植鞣皮贴图的颜色：黑色的琴凳皮面用同一张图染出来
Object.assign(MATERIALS, {
  lacquer: {
    label: '钢琴烤漆（黑色镜面）',
    // 几乎纯黑、粗糙度很低，再罩一层清漆：看得见的全是环境的倒影
    color: srgb(10, 10, 12), metallic: 0, roughness: 0.08,
    clearcoat: { factor: 1, roughness: 0.02 },
  },
  piano: {
    label: '钢琴（琴键 / 铸铁板 / 琴弦 / 音板 / 黄铜，图集）',
    // 图集：颜色、粗糙度、金属度都在贴图里（铁板的金漆、琴弦、弦轴、黄铜是金属，琴键、音板、呢子不是）
    tex: 'piano', tile: [1, 1], noOffset: true,
    roughness: 1, metallic: 1, normalScale: 0.6,
  },
  score: {
    label: '乐谱纸（钢琴谱 / 小提琴分谱）',
    tex: 'score', tile: [1, 1], noOffset: true,
    roughness: 1, metallic: 0, normalScale: 0.4,
  },
  leather_black: {
    label: '黑色皮革（拉扣）',
    // 和干邑色植鞣皮同一张贴图：铺得密一倍（细纹的牛皮），法线压浅一点
    tex: 'leather', tile: [0.14, 0.14], color: tint([28, 28, 30], LEATHER_BASE),
    roughness: 1, metallic: 0, normalScale: 0.6,
  },
});

// —— 茶室 ——
Object.assign(MATERIALS, {
  slab: {
    label: '黑胡桃原木大板（木蜡油）',
    // 整块桌面一张贴图：UV 由几何直接按位置给出，不能加随机偏移；罩一层很薄的清漆，只有一点柔和的光泽
    tex: 'slab', tile: [1, 1], noOffset: true,
    roughness: 1, metallic: 0, normalScale: 0.5,
    clearcoat: { factor: 0.25, roughness: 0.35 },
  },
  straw: {
    label: '蒲草（编辫盘绕）',
    tex: 'straw', tile: [1, 1], noOffset: true,
    roughness: 1, metallic: 0, normalScale: 1,
    sheen: { color: [0.36, 0.3, 0.2], roughness: 0.6 },
  },
  tea: {
    label: '茶具与摆件（铁壶 / 紫砂 / 青花 / 开片 / 乌金石 / 湘妃竹 / 线装书 / 茶饼，图集）',
    // 图集：颜色、粗糙度、金属度都在贴图里（铁壶、铜炉、黄铜带一点金属度）
    tex: 'tea', tile: [1, 1], noOffset: true,
    roughness: 1, metallic: 1, normalScale: 0.6,
  },
  floor_brick: {
    label: '方砖（青灰金砖，擦蜡）',
    tex: 'fangzhuan', tile: [2, 2], noOffset: true,
    roughness: 1, metallic: 0, normalScale: 0.8,
  },
  rosewood: {
    label: '红木（深红褐，擦漆）',
    tex: 'rosewood', tile: [0.6, 0.6],
    roughness: 1, metallic: 0, normalScale: 0.5,
    clearcoat: { factor: 0.35, roughness: 0.3 },
  },
});

// —— 影音室 ——
Object.assign(MATERIALS, {
  theater: {
    label: '影音器材（幕布画面 / 功放 / 喇叭 / 投影仪 / 金属 / 橡胶 / LED，图集）',
    // 图集：颜色、粗糙度、金属度都在贴图里；幕布上的画面、功放的显示屏、LED 灯圈自发光，其余格子不发光
    tex: 'theater', tile: [1, 1], noOffset: true,
    roughness: 1, metallic: 1, normalScale: 0.5,
    emissive: [1, 1, 1], emissiveStrength: 1.25,
  },
  velvet_ink: {
    label: '丝绒（午夜蓝）',
    tex: 'velvet_ink', tile: [0.2, 0.2],
    roughness: 1, metallic: 0, normalScale: 0.5,
    sheen: { color: [0.24, 0.3, 0.48], roughness: 0.35 },
  },
  felt_black: {
    label: '黑色吸音毡',
    tex: 'felt_black', tile: [0.08, 0.08],
    roughness: 1, metallic: 0, normalScale: 0.6,
    sheen: { color: [0.16, 0.16, 0.18], roughness: 0.7 },
  },
});

// —— 健身房二 ——
Object.assign(MATERIALS, {
  gym2: {
    label: '健身器材二（单车屏幕 / 液晶表 / 配重片 / 刻度 / 贴标 / 金属 / 橡胶，图集）',
    // 图集：颜色、粗糙度、金属度都在贴图里；单车的触摸屏、液晶表的背光、指示灯自发光
    tex: 'gym2', tile: [1, 1], noOffset: true,
    roughness: 1, metallic: 1, normalScale: 0.5,
    emissive: [1, 1, 1], emissiveStrength: 1.3,
  },
  water: {
    label: '水（划船机水箱）',
    // 和玻璃一样半透明混合、不参与 AO；比玻璃浓一点、带一点蓝绿
    color: srgb(70, 150, 185, 0.42), metallic: 0, roughness: 0.04,
    alphaMode: 'BLEND', aoStrength: 0,
  },
});

export const tileOf = (mat) => MATERIALS[mat]?.tile ?? [1, 1];
export const noOffsetOf = (mat) => !!MATERIALS[mat]?.noOffset;
