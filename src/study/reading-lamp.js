import { profile, circle } from '../core/shape.js';
import { xf } from '../core/vec.js';

// 阅读落地灯：黄铜摇臂 + 钟形灯罩
//   · 配重底座、细灯杆、顶上一个转轴套；横臂从转轴套里穿过去，后端一颗配重球，前端一个球形关节挂着灯罩；
//   · 灯罩往外倾 25°：外面拉丝黄铜，里面白搪瓷（灯泡就在里面，内壁用一点自发光代替受光），口沿一圈卷边；
//   · 地上的光斑是烘焙的：灯泡当作一个 3cm 的球形光源，灯罩不透光 —— 光只从灯罩口出去，
//     地上是灯罩口下面偏外的一片（灯杆和底座也挡出一点影子）。
// 局部坐标：灯杆在原点，横臂朝 +x 伸出。
const STEM = { h: 1.25, r: 0.0095 };
const ARM = { y: 1.285, back: -0.075, reach: 0.52, r: 0.0075 };
const SHADE = { tilt: (25 * Math.PI) / 180, len: 0.165, rim: 0.112 };
// 灯罩局部坐标：y = 0 是罩口，y = len 是罩顶（挂在关节上）；轴线朝上偏向灯杆
const AXIS = [-Math.sin(SHADE.tilt), Math.cos(SHADE.tilt), 0];
const NECK = [ARM.reach, ARM.y - 0.018, 0];
const RIM = NECK.map((c, i) => c - AXIS[i] * SHADE.len);
const place = xf({ pos: RIM, rot: [0, 0, SHADE.tilt] });
export const READING_BULB = place.apply([0, 0.108, 0]);

export default {
  id: 'reading_lamp',
  name: '阅读落地灯',
  nameEn: 'Brass Swing-Arm Reading Lamp',
  category: 'study',
  aoDensity: 220,
  shadow: { margin: 0.14, maxDist: 0.5, density: 110 },
  // 光源半径 3cm；灯罩往外倾，光斑落在灯罩口外侧偏前的地上 —— 中心取在灯罩口外 18cm，半径 0.85m 装得下。
  // 只有底座（离地 10cm 以内）算“正上方挡光”：灯罩在一米多高，它正下方的地面是被罩口照亮的；
  // gamma 大一些：光斑有一个亮芯、往外很快暗下去，不是一整片均匀的白
  glow: { light: READING_BULB, lightRadius: 0.03, radius: 0.85, center: [RIM[0] + 0.18, RIM[2]], density: 70, strength: 0.5, gamma: 1.6, above: 0.1 },
  view: { el: 16, az: 30 },
  build(k) {
    const q = (...v) => k.q(...v);
    // 配重底座：外沿一圈圆角，顶面缓缓隆起到灯杆
    k.lathe({
      name: 'base', mat: 'brass', segs: q(20, 14, 10),
      profile: profile([
        [0.145, 0],
        [0.145, 0.013, { r: q(0.006, 0.005, 0), segs: 1 }],
        [0.05, 0.03, { smooth: true }],
        [0.016, 0.042, { smooth: true }],
        [STEM.r, 0.048],
      ]),
    });
    k.lathe({ name: 'stem', mat: 'brass', segs: q(8, 6, 6), profile: profile([[STEM.r, 0.046], [STEM.r, STEM.h]]) });
    // 转轴套：灯杆顶上的一截粗管，横臂从中间穿过
    k.lathe({
      name: 'collar', mat: 'brass', segs: q(10, 8, 6),
      profile: profile([
        [STEM.r, STEM.h - 0.004], [0.016, STEM.h], [0.016, ARM.y + 0.022, { r: q(0.004, 0), segs: 1 }], [0, ARM.y + 0.026],
      ]),
    });
    // 横臂 + 配重球 + 关节
    k.sweep({
      name: 'arm', mat: 'brass', shape: circle(ARM.r, q(8, 6, 5)), caps: [false, false], up: [0, 1, 0],
      path: [[ARM.back + 0.015, ARM.y, 0], [ARM.reach - 0.008, ARM.y, 0]],
    });
    const ball = (name, r, pos, segs) => k.lathe({
      name, mat: 'brass', segs,
      profile: profile([[0, -r], [r * 0.72, -r * 0.7, { smooth: true }], [r, 0, { smooth: true }], [r * 0.72, r * 0.7, { smooth: true }], [0, r]], { smooth: true }),
      xf: xf({ pos }),
    });
    ball('weight', 0.024, [ARM.back, ARM.y, 0], q(12, 8, 6));
    if (k.lod < 2) ball('joint', 0.012, [ARM.reach, ARM.y - 0.004, 0], q(8, 6));
    // 灯罩外壳（黄铜）：自下而上沿外表面走
    const outer = [
      [SHADE.rim, 0.0], [SHADE.rim - 0.006, 0.03, { smooth: true }], [SHADE.rim - 0.03, 0.085, { smooth: true }],
      [0.052, 0.13, { smooth: true }], [0.026, 0.155, { smooth: true }], [0.012, SHADE.len],
    ];
    k.lathe({ name: 'shade', mat: 'brass', segs: q(20, 14, 10), profile: profile(outer), xf: place });
    // 内壁（白搪瓷）：自上而下沿内表面走（法线朝里），比外壳小 1.5mm
    const inset = 0.0015;
    k.lathe({
      name: 'liner', mat: 'enamel', segs: q(20, 14, 10),
      profile: profile(outer.slice(1).reverse().map(([r, y, o]) => [r - inset, y - inset, o]).concat([[SHADE.rim - inset, 0.001]])),
      xf: place,
    });
    // 罩口卷边
    if (k.lod < 2) {
      k.lathe({
        name: 'lip', mat: 'brass', segs: q(20, 14),
        profile: profile([[SHADE.rim - inset, 0.002], [SHADE.rim + 0.0025, -0.0015, { smooth: true }], [SHADE.rim + 0.001, 0.004]]),
        xf: place,
      });
    }
    // 灯泡（从罩口看进去是亮的）
    k.lathe({
      name: 'bulb', mat: 'bulb', segs: q(10, 8, 6),
      // 自下而上：灯泡头朝下（罩口），灯头在上
      profile: profile([[0, 0.076], [0.028, 0.088, { smooth: true }], [0.03, 0.116, { smooth: true }], [0.012, 0.146]], { smooth: true }),
      xf: place,
    });
  },
};
