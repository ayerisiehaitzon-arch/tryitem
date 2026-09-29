// 缝纫间几件东西里，几何和贴图共用的尺寸：缝纫机机身的外形（正面的贴图按同一套坐标画）、裙片纸样的轮廓。
// 缝纫机局部坐标：原点在底座正下方的中点，x 向右、y 向上，正面朝 +z；机头（针）在左边、立柱（手轮）在右边。
export const MACHINE = {
  // 底座：一整条圆角的长方块
  bed: { x0: -0.21, x1: 0.21, h: 0.07, z0: -0.09, z1: 0.09 },
  // 上半身（立柱 + 横臂 + 机头）一起挤出，比底座薄、往后缩一点
  body: { z0: -0.075, z1: 0.055 },
  head: { x0: -0.21, x1: -0.12, y0: 0.13 },     // 机头：底面离底座 6cm，压脚和针在这个空档里
  arm: { y0: 0.2, y1: 0.3 },                     // 横臂的下沿、顶面
  pillar: { x0: 0.1, x1: 0.21 },
  needle: { x: -0.165, z: 0.022 },               // 针在机头正下方靠前
  dial: { x: 0.155, y: 0.128, r: 0.03 },         // 立柱正面的花样选择旋钮
  lcd: { x: 0.155, y: 0.228, w: 0.07, h: 0.03 }, // 立柱正面的小液晶屏
};

// 上半身的外形（逆时针）：[x, y, 圆角半径]。机头底下、立柱里侧、横臂下沿围出中间的空档（缝的布从这里过）
export function bodyOutline() {
  const { head, arm, pillar } = MACHINE;
  return [
    [head.x0, head.y0, 0.012], [head.x1, head.y0, 0.012], [head.x1, arm.y0, 0.02], [pillar.x0, arm.y0, 0.025],
    [pillar.x0, 0.06, 0], [pillar.x1, 0.06, 0], [pillar.x1, arm.y1, 0.045], [head.x0, arm.y1, 0.03],
  ];
}

// 裙片纸样（裙子前片）：纸样区域里的坐标（米，左上角原点、y 向下）。腰线微微下弯，侧缝往下摆张开，下摆也是一道弧
export const SKIRT_PIECE = (() => {
  const pts = [];
  const top = 0.03, bot = 0.42, cx = 0.225, wt = 0.1, wb = 0.19, n = 10;
  for (let i = 0; i <= n; i++) { const t = i / n, x = cx - wt + 2 * wt * t; pts.push([x, top + 0.012 * Math.sin(Math.PI * t)]); }
  for (let i = 1; i <= n; i++) { const t = i / n; pts.push([cx + wt + (wb - wt) * t ** 1.15, top + (bot - top) * t]); }
  for (let i = 1; i <= n; i++) { const t = i / n, x = cx + wb - 2 * wb * t; pts.push([x, bot + 0.015 * Math.sin(Math.PI * t)]); }
  for (let i = 1; i < n; i++) { const t = 1 - i / n; pts.push([cx - wt - (wb - wt) * t ** 1.15, top + (bot - top) * t]); }
  return pts;
})();
