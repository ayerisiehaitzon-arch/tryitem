// 陶艺室的器型和釉：几何（沿局部 y 车削）和图集里上了釉的那一格共用这一份外形（做法和酒吧的酒瓶一样）。
// 外形是闭合的车削轮廓：从圈足底下的中心往外走 → 圈足 → 外壁往上 → 口沿 → 内壁往下 → 内底中心，
// 贴图按“u 绕一圈（0.5 是正面）× v 沿轮廓的弧长（0 = 圈足底下的中心，1 = 内底中心）”展开，图集里每件一格（256²）。
const sm = { smooth: true };
export const SHAPES = {
  // 饭碗：口径 15cm、高 7cm
  bowl: [[0, 0.005], [0.027, 0.005], [0.029, 0], [0.036, 0], [0.038, 0.007], [0.045, 0.012, sm], [0.06, 0.03, sm], [0.071, 0.052, sm], [0.0755, 0.068, sm], [0.0752, 0.071],
    [0.0735, 0.0718], [0.0715, 0.0705, sm], [0.068, 0.054, sm], [0.057, 0.034, sm], [0.04, 0.019, sm], [0.02, 0.0135, sm], [0, 0.012]],
  // 茶盏：口径 11cm、高 5.6cm
  teaBowl: [[0, 0.006], [0.02, 0.006], [0.022, 0], [0.028, 0], [0.03, 0.008], [0.04, 0.016, sm], [0.051, 0.034, sm], [0.0555, 0.052, sm], [0.0552, 0.056],
    [0.0538, 0.0567], [0.0522, 0.0556, sm], [0.0495, 0.037, sm], [0.038, 0.02, sm], [0.02, 0.0135, sm], [0, 0.0125]],
  // 马克杯（另外扫一个把手）：直径 8.7cm、高 9.5cm
  mug: [[0, 0.003], [0.034, 0.003], [0.036, 0], [0.04, 0], [0.042, 0.004, sm], [0.0435, 0.03, sm], [0.0435, 0.088, sm], [0.0428, 0.0945],
    [0.0412, 0.0952], [0.0398, 0.0942, sm], [0.0395, 0.03, sm], [0.037, 0.011, sm], [0.028, 0.0085, sm], [0, 0.008]],
  // 筒杯（汤吞）：口径 7.4cm、高 9.4cm，往上稍微敞开
  yunomi: [[0, 0.004], [0.024, 0.004], [0.026, 0], [0.031, 0], [0.033, 0.006], [0.034, 0.03, sm], [0.0365, 0.075, sm], [0.0372, 0.093],
    [0.0358, 0.0942], [0.0345, 0.0928, sm], [0.0335, 0.07, sm], [0.031, 0.02, sm], [0.022, 0.0115, sm], [0, 0.011]],
  // 长颈瓶：高 26cm；内壁只往下走到瓶颈里（再往下看不见）
  vase: [[0, 0.005], [0.03, 0.005], [0.032, 0], [0.042, 0], [0.045, 0.008], [0.062, 0.04, sm], [0.07, 0.08, sm], [0.066, 0.12, sm], [0.045, 0.16, sm], [0.024, 0.195, sm],
    [0.019, 0.225, sm], [0.022, 0.25, sm], [0.029, 0.26], [0.027, 0.2615], [0.0245, 0.259, sm], [0.0165, 0.235, sm], [0.0152, 0.21, sm], [0, 0.205]],
  // 罐：高 16cm、腹径 16cm，短颈
  jar: [[0, 0.006], [0.04, 0.006], [0.042, 0], [0.052, 0], [0.055, 0.01], [0.072, 0.04, sm], [0.08, 0.08, sm], [0.074, 0.12, sm], [0.055, 0.145, sm], [0.046, 0.152, sm],
    [0.047, 0.162], [0.0445, 0.1635], [0.0425, 0.1605, sm], [0.042, 0.142, sm], [0, 0.136]],
  // 盘：直径 26cm、高 2.8cm
  plate: [[0, 0.004], [0.05, 0.004], [0.052, 0], [0.06, 0], [0.062, 0.006], [0.1, 0.014, sm], [0.126, 0.024, sm], [0.13, 0.028],
    [0.1275, 0.0292], [0.124, 0.0275, sm], [0.1, 0.018, sm], [0.07, 0.0105, sm], [0.03, 0.009, sm], [0, 0.009]],
};
// 口沿最高点所在的轮廓点（外壁 / 内壁的分界）
export const rimIndex = (pts) => pts.reduce((best, p, i) => (p[1] > pts[best][1] ? i : best), 0);

// 釉：base 釉色、thin 釉薄的地方（口沿、棱）透出来的颜色、pool 积釉的颜色、rough 粗糙度；
// crackle 开片、specks 铁点、streaks 兔毫一样的竖丝
export const GLAZES = {
  celadon: { base: [150, 182, 162], thin: [198, 214, 198], pool: [104, 146, 124], rough: 0.1, crackle: true },
  tenmoku: { base: [40, 27, 21], thin: [156, 86, 38], pool: [24, 18, 14], rough: 0.08, streaks: true },
  cobalt: { base: [34, 58, 136], thin: [156, 176, 214], pool: [18, 32, 92], rough: 0.1 },
  oatmeal: { base: [216, 204, 178], thin: [196, 166, 124], pool: [190, 178, 152], rough: 0.4, specks: true },
  shino: { base: [234, 210, 184], thin: [210, 112, 62], pool: [222, 192, 162], rough: 0.32, specks: true },
  copperRed: { base: [142, 22, 32], thin: [222, 212, 202], pool: [92, 10, 22], rough: 0.08 },
  matteWhite: { base: [234, 230, 220], thin: [206, 190, 168], pool: [226, 222, 212], rough: 0.62 },
  turquoise: { base: [62, 166, 166], thin: [34, 104, 104], pool: [40, 124, 124], rough: 0.12 },
};
// 胎土：炻器的浅黄褐、深色的铁胎、瓷土的白
export const CLAYS = { buff: [198, 172, 142], dark: [140, 102, 78], porcelain: [236, 232, 224] };

// 上了釉的成品：器型 + 釉 + 胎；line 外壁的釉在离地多高处停下（再往下露胎），drips 几道垂下来的釉泪
export const WARES = [
  { id: 'bowlCeladon', shape: 'bowl', glaze: 'celadon', clay: 'buff', line: 0.012, drips: 0 },
  { id: 'bowlTenmoku', shape: 'bowl', glaze: 'tenmoku', clay: 'dark', line: 0.014, drips: 3 },
  { id: 'teaBowlTenmoku', shape: 'teaBowl', glaze: 'tenmoku', clay: 'dark', line: 0.014, drips: 4 },
  { id: 'teaBowlTurquoise', shape: 'teaBowl', glaze: 'turquoise', clay: 'buff', line: 0.012, drips: 2 },
  { id: 'mugCobalt', shape: 'mug', glaze: 'cobalt', clay: 'buff', line: 0.02, drips: 3 },
  { id: 'mugOatmeal', shape: 'mug', glaze: 'oatmeal', clay: 'buff', line: 0.014, drips: 0 },
  { id: 'mugWhite', shape: 'mug', glaze: 'matteWhite', clay: 'dark', line: 0.018, drips: 0 },
  { id: 'yunomiShino', shape: 'yunomi', glaze: 'shino', clay: 'buff', line: 0.024, drips: 2 },
  { id: 'yunomiCeladon', shape: 'yunomi', glaze: 'celadon', clay: 'porcelain', line: 0.012, drips: 0 },
  { id: 'vaseCopper', shape: 'vase', glaze: 'copperRed', clay: 'porcelain', line: 0.03, drips: 5 },
  { id: 'vaseCeladon', shape: 'vase', glaze: 'celadon', clay: 'porcelain', line: 0.02, drips: 0 },
  { id: 'jarTenmoku', shape: 'jar', glaze: 'tenmoku', clay: 'dark', line: 0.03, drips: 4 },
  { id: 'jarOatmeal', shape: 'jar', glaze: 'oatmeal', clay: 'buff', line: 0.02, drips: 0 },
  { id: 'plateCobalt', shape: 'plate', glaze: 'cobalt', clay: 'buff', line: 0.006, drips: 0 },
  { id: 'plateShino', shape: 'plate', glaze: 'shino', clay: 'buff', line: 0.006, drips: 0 },
  { id: 'bowlTurquoise', shape: 'bowl', glaze: 'turquoise', clay: 'buff', line: 0.014, drips: 2 },
];
export const wareIndex = (id) => WARES.findIndex((w) => w.id === id);

// 外形的弧长表：s[i] 是第 i 个点离起点的弧长，L 是全长
export function arcTable(pts) {
  const s = [0];
  for (let i = 1; i < pts.length; i++) s.push(s[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { s, L: s[s.length - 1] };
}
// 弧长 t 处的 (r, y) 和所在的线段序号
export function pointAt(pts, tab, t) {
  for (let i = 1; i < pts.length; i++) {
    if (t <= tab.s[i] || i === pts.length - 1) {
      const f = Math.max(0, Math.min(1, (t - tab.s[i - 1]) / (tab.s[i] - tab.s[i - 1] || 1)));
      return { r: pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f, y: pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f, i };
    }
  }
  const p = pts[pts.length - 1];
  return { r: p[0], y: p[1], i: pts.length - 1 };
}
