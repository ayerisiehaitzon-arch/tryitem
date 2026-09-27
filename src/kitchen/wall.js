import { profile, shape } from '../core/shape.js';
import { xf } from '../core/vec.js';
import { knob } from '../furniture/parts.js';
import { srgb } from '../materials/library.js';
import { GAP, faceFrame, shakerFront, ccwShape } from './cabinetry.js';

// 吊柜：和地柜同宽 2.4m、上下对齐。左边一扇单门 + 两扇对开门（墨绿 Shaker，和地柜一套），右边是烟机罩。
//   · 壁挂：原点在墙面上、柜底的宽度中点（z = 0 是墙，柜子朝 +z 伸出 35cm，y = 0 是柜底）；
//     和地柜配套时装在台面上方 55cm（地面以上 1.45m）；
//   · 面框的底档往下多伸 2cm，挡住柜底的 LED 灯带；灯带在墙砖上照出的光斑是烘焙贴花（线光源），
//     贴花抬到离墙 12mm —— 墙前面还贴着 1cm 厚的瓷砖；
//   · 烟机罩是一次挤出：侧面轮廓下面一段竖直的裙边（比柜门凸出 7cm），往上一段钟形凹弧收到柜门的平面；
//     和柜子同色的烤漆（弧面上的高光把钟形勾出来），裙边上一圈黄铜腰线；底面是不锈钢面板、黑色滤网和两盏灯；
//   · 顶上一块通长的压顶板，把吊柜和烟机罩压成一体。
const X0 = -1.2, X1 = 1.2, H = 0.72;
const Z = { carcass: 0.325, face: 0.35, hood: 0.42 };
const ST = 0.045;
const DIV = -0.6, HOOD = 0.3; // 单门 | 双门 分界；烟机罩从这根竖梃开始
const Y0 = -0.02; // 面框（和烟机罩）底边：比柜底低 2cm
const RAIL = { bottom: [Y0, 0.04], top: [0.68, H] };
const LED = { y: -0.008, z: 0.3 };

export default {
  id: 'kitchen_wall',
  name: '吊柜',
  nameEn: 'Shaker Wall Cabinets & Hood',
  category: 'kitchen',
  mount: 'wall',
  aoDensity: 120,
  // 墙上的接触阴影只看 30cm 以内的遮挡：柜子 35cm 深，再远就会在柜顶上方的墙上压出一大片灰
  shadow: { margin: 0.16, maxDist: 0.3, density: 60, strength: 0.75 },
  // 灯带：柜底一整条（线光源）+ 烟机罩下两盏灯；光斑铺在柜子下面的墙上（台面到柜底这一段）
  glow: {
    lights: [
      { a: [X0 + 0.03, LED.y - 0.0005, LED.z], b: [HOOD - ST / 2 - 0.01, LED.y - 0.0005, LED.z], power: 0.74 },
      { a: [0.52, Y0 - 0.006, 0.28], b: [0.52, Y0 - 0.006, 0.28], power: 0.13 },
      { a: [1.0, Y0 - 0.006, 0.28], b: [1.0, Y0 - 0.006, 0.28], power: 0.13 },
    ],
    rect: { u0: X0, u1: X1, v0: -0.6, v1: 0.02 },
    fade: [0.1, 0.1, 0.05, 0],
    density: 110, samples: 120, strength: 0.26, gamma: 1.25, lift: 0.012, color: srgb(255, 224, 186),
  },
  view: { el: 8, az: 26 },
  build(k) {
    const q = (...v) => k.q(...v);
    const xc = HOOD + ST / 2; // 柜体右端（烟机罩左侧面）
    // —— 柜体：背面贴墙，右端被烟机罩盖住，顶面被压顶板盖住 ——
    const cy = H / 2;
    k.box({
      name: 'carcass', mat: 'paint_green', size: [xc - X0, H, Z.carcass], segs: 0,
      omit: ['nz', 'px', 'py'], density: { pz: 0.3 },
      div: [1, [-1, (RAIL.bottom[1] - cy) / cy, (RAIL.top[0] - cy) / cy, 1], 1],
      xf: xf({ pos: [(X0 + xc) / 2, cy, Z.carcass / 2] }),
    });
    // —— 面框 ——
    const A = [X0 + ST, DIV - ST / 2], B = [DIV + ST / 2, HOOD - ST / 2];
    const rails = (x) => [
      { x0: x[0], x1: x[1], y0: RAIL.bottom[0], y1: RAIL.bottom[1] },
      { x0: x[0], x1: x[1], y0: RAIL.top[0], y1: RAIL.top[1], omit: ['py'] },
    ];
    faceFrame(k, {
      name: 'frame', mat: 'paint_green', z0: Z.carcass, z1: Z.face, y0: Y0, y1: H,
      stiles: [[X0, X0 + ST], [DIV - ST / 2, DIV + ST / 2], [HOOD - ST / 2, xc]],
      rails: [...rails(A), ...rails(B)],
      extraYs: [0], // 柜底：竖梃端面和柜体端面在这里对上
    });
    // —— 门：左边单门（合页在左，钮在右下角），中间对开（钮在相对的下角）——
    const zDoor = Z.face - 0.02, fw = 0.055;
    const y0 = RAIL.bottom[1] + GAP, y1 = RAIL.top[0] - GAP;
    shakerFront(k, { name: 'doorA', mat: 'paint_green', x0: A[0] + GAP, x1: A[1] - GAP, y0, y1, z: zDoor, fw });
    const mid = (B[0] + B[1]) / 2;
    shakerFront(k, { name: 'doorBL', mat: 'paint_green', x0: B[0] + GAP, x1: mid - GAP / 2, y0, y1, z: zDoor, fw });
    shakerFront(k, { name: 'doorBR', mat: 'paint_green', x0: mid + GAP / 2, x1: B[1] - GAP, y0, y1, z: zDoor, fw });
    if (k.lod < 2) {
      const kn = (name, x) => knob(k, { name, mat: 'brass', d: 0.026, h: 0.024, segs: q(8, 6), pos: [x, y0 + 0.075, Z.face], rot: [Math.PI / 2, 0, 0] });
      kn('knobA', A[1] - GAP - fw / 2);
      kn('knobBL', mid - GAP / 2 - fw / 2);
      kn('knobBR', mid + GAP / 2 + fw / 2);
    }
    // —— 灯带：贴在柜底、面框底档后面 ——
    k.box({
      name: 'led', mat: 'led', size: [HOOD - ST / 2 - 0.01 - (X0 + ST), -LED.y, 0.016], segs: 0, omit: ['py'],
      xf: xf({ pos: [(HOOD - ST / 2 - 0.01 + X0 + ST) / 2, LED.y / 2, LED.z] }),
    });
    // —— 烟机罩 ——
    const hx0 = xc, hx1 = X1, hw = hx1 - hx0, hcx = (hx0 + hx1) / 2;
    // 侧面轮廓（截面 x = -z）：底下 12cm 竖直的“裙边”，往上一段钟形的凹弧收到柜门平面，再竖直到顶
    const flare = [];
    const nf = q(6, 4, 2), fy0 = 0.1, fy1 = 0.44;
    for (let i = 0; i <= nf; i++) {
      const t = i / nf;
      flare.push([-(Z.face + (Z.hood - Z.face) * (1 - t) ** 2), fy0 + (fy1 - fy0) * t, i === 0 ? { r: q(0.006, 0.004, 0), segs: 1 } : { smooth: true }]);
    }
    const side = ccwShape([
      [0, Y0], [-Z.hood, Y0, { r: q(0.004, 0.003, 0), segs: 1 }], ...flare, [-Z.face, H], [0, H],
    ]);
    k.extrude({
      name: 'hood', mat: 'paint_green', shape: side, depth: hw, axis: 'x', density: { cap0: 0.5 },
      xf: xf({ pos: [hx0, 0, 0] }),
    });
    // 黄铜腰线：沿罩子左前角 → 正面 → 右侧回到墙（截面 3mm × 2cm，贴在罩子外面）
    const by = 0.083;
    // 截面在路径外侧（标架的 R 朝罩子里面，截面 x 取负）
    k.sweep({
      name: 'hoodBand', mat: 'brass', shape: shape([[-0.003, -0.01], [0, -0.01], [0, 0.01], [-0.003, 0.01]]),
      caps: [false, false], up: [0, 1, 0], maxChart: 1.5,
      path: [[hx0, by, Z.face], [hx0, by, Z.hood], [hx1, by, Z.hood], [hx1, by, 0]],
    });
    // 底面：不锈钢面板（四周离边 1.5cm）+ 黑色滤网 + 两盏灯
    const py = Y0 - 0.003;
    k.box({
      name: 'hoodPlate', mat: 'stainless', size: [hw - 0.03, 0.003, Z.hood - 0.03], segs: 0, omit: ['py'], density: { ny: 0.6 },
      xf: xf({ pos: [hcx, Y0 - 0.0015, Z.hood / 2] }),
    });
    k.box({
      name: 'hoodFilter', mat: 'steel', size: [0.5, 0.001, 0.2], segs: 0, omit: ['py', 'px', 'nx', 'pz', 'nz'],
      xf: xf({ pos: [hcx, py - 0.0003, 0.13] }),
    });
    if (k.lod < 2) {
      for (const [i, x] of [0.52, 1.0].entries()) {
        k.lathe({
          name: `spot${i}`, mat: 'led', segs: q(12, 8),
          profile: profile([[0.022, -0.0006], [0, -0.0006]]),
          xf: xf({ pos: [x, py, 0.28] }),
        });
      }
    }
    // —— 压顶板：一块通长的板，两头探出 1.5cm、前面探出 2cm ——
    k.box({
      name: 'cornice', mat: 'paint_green', size: [X1 - X0 + 0.03, 0.025, Z.face + 0.02], r: q(0.003, 0.002, 0), segs: q(1, 1, 0),
      omit: ['nz'], density: { ny: 0.4 },
      xf: xf({ pos: [0, H + 0.0125, (Z.face + 0.02) / 2] }),
    });
  },
};
