import { profile, circle } from '../core/shape.js';
import { xf } from '../core/vec.js';
import { roundedPath } from '../core/path.js';
import { curve } from '../decor/profiles.js';
import { revolve } from '../decor/revolve.js';

// 壁灯：黄铜底盘 + 天鹅颈灯臂 + 小托杯 + 乳白玻璃球
//   · 壁挂：原点在墙面上（z = 0 是墙，灯朝 +z 伸出，y = 0 是底盘中心的安装高度）；
//   · AO 烘焙把墙面也算作遮挡面，底盘贴墙的一圈、灯臂靠墙的一段自然变暗；
//   · 墙上的接触阴影和光斑都是烘焙的贴花：玻璃球当作一个 7cm 半径的球形光源，
//     黄铜底盘和灯臂在墙上挡出软影子；
//   · 玻璃球用设计曲线车削，法线取球面的真实法线，22 段就很圆；缎面玻璃的柔和高光也不暴露棱线。
const R = 0.075; // 玻璃球半径
const ARM = { out: 0.13, up: 0.08, r: 0.0058 };
export const SCONCE_GLOBE = [0, ARM.up + 0.02 + R - 0.012, ARM.out];

// 球面（留出底部的瓶口，坐进托杯里）
const GLOBE = (() => {
  const pts = [];
  const a0 = -Math.acos(0.3); // 瓶口半径 = 0.3R 处
  const n = 10;
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((Math.PI / 2 - a0) * i) / n;
    pts.push([R * Math.cos(a), R * Math.sin(a), i === 0 ? { c: 1 } : undefined].filter((v) => v !== undefined));
  }
  pts[pts.length - 1][0] = 0;
  return curve(pts);
})();

export default {
  id: 'wall_lamp',
  name: '壁灯',
  nameEn: 'Opal Globe Sconce',
  category: 'lighting',
  mount: 'wall',
  aoDensity: 260,
  // 玻璃球离墙 13cm，影子铺得开：贴花留宽一点、边缘淡出区加宽，墙上看不出方框
  shadow: { margin: 0.26, maxDist: 0.3, density: 160, fade: 0.3 },
  glow: { light: SCONCE_GLOBE, lightRadius: 0.07, radius: 0.5, center: [0, SCONCE_GLOBE[1]], density: 140, strength: 0.75 },
  build(k) {
    const q = (...v) => k.q(...v);
    const toWall = [Math.PI / 2, 0, 0]; // 车削轴 → +z（垂直于墙）
    // 底盘：背面贴墙不生成，前面是略鼓的圆盘 + 圆角边
    k.lathe({
      name: 'plate', mat: 'brass', segs: q(20, 12, 8),
      profile: profile([[0.055, 0], [0.055, 0.009, { r: q(0.004, 0.003, 0), segs: q(2, 1, 1) }], [0.02, 0.0135, { smooth: true }], [0, 0.0145]]),
      xf: xf({ rot: toWall }),
    });
    // 灯臂：从底盘中心伸出，一个 6cm 半径的弯向上
    const path = roundedPath([[0, 0, 0.01], [0, 0, ARM.out], [0, ARM.up, ARM.out]], 0.06, q(5, 3, 2));
    k.sweep({ name: 'arm', mat: 'brass', shape: circle(ARM.r, q(8, 6, 5)), path, caps: [false, false], up: [1, 0, 0] });
    // 托杯
    const cy = ARM.up;
    k.lathe({
      name: 'cup', mat: 'brass', segs: q(12, 10, 8),
      profile: profile([
        [ARM.r, cy - 0.004], [0.012, cy + 0.006, { smooth: true }], [0.026, cy + 0.02, { smooth: true }],
        [0.03, cy + 0.024], [0.024, cy + 0.024],
      ]),
      xf: xf({ pos: [0, 0, ARM.out] }),
    });
    // 乳白玻璃球
    revolve(k, {
      name: 'globe', mat: 'opal', cv: GLOBE, segs: q(22, 14, 8), tol: q(0.0008, 0.002, 0.005), maxAngle: q(0.45, 0.8, 1.3),
      uv: (u, v) => [u, v], xf: xf({ pos: [SCONCE_GLOBE[0], SCONCE_GLOBE[1], SCONCE_GLOBE[2]] }),
    });
  },
};
