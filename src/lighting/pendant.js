import { profile } from '../core/shape.js';
import { xf } from '../core/vec.js';
import { revolve } from '../decor/revolve.js';
import { LANTERN } from './shapes.js';

// 吊灯：竹骨纸灯笼（Akari 式）
//   · 吊装：原点在天花板上，灯挂在 -y 一侧（吸顶盘 → 电线 → 灯笼），导入引擎直接挂到天花板即可；
//   · 灯笼是一条设计曲线车削出来的一层纸（双面材质）：26 段 × 十来圈，剪影误差约 1.5mm；
//   · 竹骨螺旋、纸片接缝、上下包边全在贴图里，而且有两张：白天看到的纸，和点亮后透光的纸 ——
//     竹骨挡光变成深色螺旋线，纸的云状厚薄透出来，离灯泡近的地方更亮；
//   · 从下口看进去有灯头和灯泡。
const CANOPY_H = 0.025, CORD = 0.45;
const TOP = -(CANOPY_H + CORD); // 灯笼上口
const Y0 = TOP - LANTERN.height; // 灯笼下口

export default {
  id: 'pendant_lantern',
  name: '吊灯',
  nameEn: 'Paper Lantern Pendant',
  category: 'lighting',
  mount: 'ceiling',
  shadow: false,
  build(k) {
    const q = (...v) => k.q(...v);
    // 吸顶盘（白色烤漆）：上沿贴着天花板
    k.lathe({
      name: 'canopy', mat: 'paint', segs: q(14, 10, 8),
      profile: profile([[0.004, -CANOPY_H], [0.052, -CANOPY_H, { r: q(0.005, 0.004, 0), segs: 1 }], [0.055, 0]]),
    });
    // 电线：一直伸进灯笼里接灯头
    k.lathe({ name: 'cord', mat: 'plastic_black', segs: q(6, 5, 4), profile: profile([[0.0028, TOP - 0.12], [0.0028, -CANOPY_H]]) });
    // 上口的黑色小盖
    k.lathe({
      name: 'cap', mat: 'plastic_black', segs: q(16, 10, 8),
      profile: profile([[0.049, TOP - 0.004], [0.054, TOP + 0.002, { smooth: true }], [0.036, TOP + 0.008, { smooth: true }], [0.004, TOP + 0.01]], { smooth: true }),
    });
    // 灯笼
    revolve(k, {
      name: 'lantern', mat: 'paper', cv: LANTERN, segs: q(26, 16, 10), tol: q(0.0015, 0.0035, 0.009), maxAngle: q(0.8, 1.2, 1.6),
      uv: (u, v) => [u, v], xf: xf({ pos: [0, Y0, 0] }),
    });
    // 灯头 + 球泡（从下口看得见）
    k.lathe({
      name: 'socket', mat: 'plastic_black', segs: q(10, 6, 5),
      profile: profile([[0.011, TOP - 0.153], [0.015, TOP - 0.15], [0.016, TOP - 0.104, { r: q(0.003, 0.002, 0), segs: 1 }], [0.0028, TOP - 0.1]]),
    });
    k.lathe({
      name: 'bulb', mat: 'bulb', segs: q(12, 8, 6),
      profile: profile([[0, TOP - 0.23], [0.03, TOP - 0.222, { smooth: true }], [0.038, TOP - 0.19, { smooth: true }], [0.011, TOP - 0.152]], { smooth: true }),
    });
  },
};
