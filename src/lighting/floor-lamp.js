import { profile, circle } from '../core/shape.js';
import { xf } from '../core/vec.js';
import { rod } from '../furniture/parts.js';

// 落地灯：黄铜底座 + 细灯杆 + 亚麻灯罩（双面材质，内侧自发光），地上带一圈烘焙的光斑
//   · 灯罩就是一圈没有厚度的车削面 + doubleSided，从下往上看也不会穿帮
//   · 灯罩上下两道黄铜细边只在 LOD0 出现
export default {
  id: 'floor_lamp',
  name: '落地灯',
  nameEn: 'Halo Floor Lamp',
  category: 'lighting',
  // 地上的光斑：灯罩下口当作 8cm 的光源，底座挡出中间一小块影子，灯罩按 30% 透光
  glow: { light: [0, 1.29, 0], lightRadius: 0.08, radius: 0.8, transmit: { shade: 0.3 }, density: 90, strength: 0.6 },
  build(k) {
    const q = (...v) => k.q(...v);
    const shadeB = 1.18, shadeT = 1.5, rB = 0.22, rT = 0.2;
    // 底座
    // 底座：贴地的底面省略，只留外侧一圈 + 顶面斜坡
    k.lathe({
      name: 'base', mat: 'brass', segs: q(22, 16, 12),
      profile: profile([
        [0.15, 0],
        [0.15, 0.014, { r: q(0.006, 0.005, 0), segs: q(2, 1, 1) }],
        [0.035, 0.028, { r: q(0.012, 0.01, 0), segs: 1 }],
        [0.011, 0.045],
      ]),
    });
    // 灯杆
    k.lathe({
      name: 'stem', mat: 'brass', segs: q(8, 6, 6),
      profile: profile([[0.0095, 0.04], [0.0095, shadeT - 0.05]]),
    });
    // 灯罩（开口的锥台面）
    k.lathe({
      name: 'shade', mat: 'shade', segs: q(36, 24, 14),
      profile: profile([[rB, shadeB], [rT, shadeT]]),
    });
    if (k.lod === 0) {
      for (const [nm, r, y] of [['rimB', rB, shadeB], ['rimT', rT, shadeT]]) {
        k.lathe({
          name: nm, mat: 'brass', segs: 32,
          profile: profile([[r + 0.003, y - 0.005], [r + 0.003, y + 0.005]]),
        });
      }
    }
    // 灯泡
    k.lathe({
      name: 'bulb', mat: 'bulb', segs: q(10, 8, 6),
      profile: profile([[0, shadeB + 0.06], [0.032, shadeB + 0.1, { smooth: true }], [0.03, shadeB + 0.14, { smooth: true }], [0, shadeB + 0.17]], { smooth: true }),
    });
    // 灯罩支架：三根辐条连到灯杆顶
    if (k.lod < 2) {
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + 0.4;
        rod(k, {
          name: `spoke${i}`, mat: 'brass', r: 0.0028, segs: q(5, 4),
          a: [0, shadeT - 0.055, 0], b: [Math.sin(a) * (rT - 0.004), shadeT - 0.01, Math.cos(a) * (rT - 0.004)],
        });
      }
    }
  },
};
