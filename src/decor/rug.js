import { rect } from '../core/shape.js';

// 手工羊毛地毯 2.0 × 1.4m：
//   · 地毯本体是一块带圆边的薄板：顶面只有一个多边形，整幅菱格图案一张贴图铺满（uvFit），
//     绒面细节是一小块可平铺的法线贴图（KHR_texture_transform 重复铺）；圆边让地毯边缘软下来，贴图边缘那一圈是锁边；
//   · 两端的流苏是贴地的卡片 + alpha 裁剪：从地毯侧面中间伸出来、斜着落到地上再平铺，
//     每端只有 4 个三角形；它不参与 AO / 阴影烘焙的遮挡（不然地上会压出一条黑带）。
const LEN = 2.0, WID = 1.4, TH = 0.02, FR = 0.085;

function fringe(k, side) {
  const part = k.part('fringe', `fringe${side > 0 ? 1 : 0}`);
  const ch = k.chart(`fringe${side > 0 ? 1 : 0}`, WID, FR, { density: 0.5 });
  // 截面：从地毯侧面半高处出发，1.5cm 后落地，然后平铺
  const prof = [[0, TH * 0.45], [0.015, 0.0015], [FR, 0.0015]];
  const rows = prof.map(([d, y], i) => {
    const x = side * (LEN / 2 + d);
    const n = i === 0 ? [side * 0.3, 1, 0] : [0, 1, 0];
    return [-WID / 2, WID / 2].map((z) => part.v([x, y, z], n, [z + WID / 2, d], ch, [(z + WID / 2) / WID, d / FR]));
  });
  for (let i = 0; i + 1 < rows.length; i++) part.quad(rows[i][0], rows[i][1], rows[i + 1][1], rows[i + 1][0]);
}

export default {
  id: 'rug',
  name: '地毯',
  nameEn: 'Wool Rug',
  category: 'decor',
  aoDensity: 60,
  build(k) {
    const q = (...v) => k.q(...v);
    k.extrude({
      name: 'rug', mat: 'rug', axis: 'y', depth: TH, uvFit: true, caps: [false, true],
      shape: rect(LEN, WID, { r: q(0.03, 0.03, 0.02), segs: q(3, 2, 1) }),
      bevel: q({ w: 0.012, h: 0.011 }, { w: 0.012, h: 0.011 }, 0), bsegs: q(3, 2, 1),
    });
    if (k.lod < 2) for (const side of [1, -1]) fringe(k, side);
  },
};
