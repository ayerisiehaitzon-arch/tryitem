import { profile, rect, circle, shape } from '../core/shape.js';
import { xf, smoothstep } from '../core/vec.js';
import { puffDeform } from '../prims/box.js';
import { paint, squash } from './toys.js';
import { toyUV } from '../materials/atlas.js';

// 儿童床：桦木“小房子”床 —— 两片山墙框（立柱 + 45° 的人字屋架）、一根屋脊梁，床头靠墙
//   · 每片山墙框是一条扫掠：方截面（四条棱 6mm 圆角）沿“左柱 → 屋架 → 右柱”走一遍，三个拐角是斜接的；
//     拐角两侧各加一个 2mm 外的路径点，法线过渡压在拐角上（不然整根柱子都被抹圆）；
//   · 屋脊梁转 45° 放（菱形截面）：上面两个面正好和两边屋架的外表面齐平，脊线就是山墙框斜接的尖；
//   · 床尾那片山墙右边的屋架上立着一个小烟囱，两根檐口之间挂一串布做的小旗子；
//   · 床架：一圈底框托着床垫，一圈护栏（床的右侧只挡床头那一半，另一半留给孩子上下床）；
//   · 床上：白色床垫、雾蓝格子被（两侧和床尾垂下来一点）、小枕头，床头坐着一只圈绒兔子。
// 原点在床的正中（地面上），床头朝 -z。
const MW = 0.9, ML = 1.9;            // 床垫
const A = 0.042, AR = 0.006;         // 立柱 / 屋架截面、棱的圆角
const XP = MW / 2 + 0.012 + A / 2;   // 立柱中心
const ZP = ML / 2 + 0.012 + A / 2;
const YE = 1.2, YA = YE + XP;        // 檐口、屋脊（截面中心线）
const BASE = { y0: 0.12, y1: 0.28, t: 0.022 }; // 底框（上沿和床垫面齐平）
const RAIL = { y0: 0.41, y1: 0.49 };            // 护栏
const OPEN = -0.18;                             // 右侧护栏在这里断开（z）

export default {
  id: 'kids_bed',
  name: '儿童床',
  nameEn: 'Birch House Bed',
  category: 'kids',
  aoDensity: 120,
  shadow: { margin: 0.18, maxDist: 0.5, density: 80 },
  view: { el: 14, az: 32 },
  build(k) {
    const q = (...v) => k.q(...v);
    // —— 两片山墙框 ——
    const e = 0.002;
    const corner = (P, a, b) => {
      const da = [P[0] - a[0], P[1] - a[1]], db = [b[0] - P[0], b[1] - P[1]];
      const la = Math.hypot(...da), lb = Math.hypot(...db);
      return [[P[0] - (da[0] / la) * e, P[1] - (da[1] / la) * e], P, [P[0] + (db[0] / lb) * e, P[1] + (db[1] / lb) * e]];
    };
    const key = [[-XP, 0], [-XP, YE], [0, YA], [XP, YE], [XP, 0]];
    const path2 = [key[0]];
    for (let i = 1; i < key.length - 1; i++) path2.push(...corner(key[i], key[i - 1], key[i + 1]));
    path2.push(key[key.length - 1]);
    const sec = rect(A, A, { r: q(AR, AR, 0), segs: 1 });
    for (const s of [-1, 1]) {
      k.sweep({
        name: `gable${s > 0 ? 'Foot' : 'Head'}`, mat: 'birch', shape: sec, caps: [false, false], up: [0, 0, 1],
        path: path2.map(([x, y]) => [x, y, s * ZP]), maxChart: 1.3,
      });
    }
    // 屋脊梁：菱形截面，夹在两片山墙框之间
    k.box({
      name: 'ridge', mat: 'birch', size: [A, A, 2 * ZP - A], r: q(AR, AR, 0), segs: q(1, 1, 0), grain: 'z', omit: ['pz', 'nz'],
      xf: xf({ pos: [0, YA, 0], rot: [0, 0, Math.PI / 4] }),
    });
    // 烟囱：床尾山墙右边屋架上，底面切成 45° 贴着屋架外表面
    const top = (x) => YA + A / Math.SQRT2 - x; // 右屋架上表面
    const cx0 = 0.19, cx1 = 0.26, cyt = top(cx0) + 0.1;
    k.extrude({
      name: 'chimney', mat: 'birch', axis: 'z', center: true, depth: A,
      shape: shape([[cx0, top(cx0) - 0.004], [cx1, top(cx1) - 0.004], [cx1, cyt, { r: 0.004, segs: 1 }], [cx0, cyt, { r: 0.004, segs: 1 }]]),
      caps: [true, true], bevel: q(0.003, 0.002, 0), bsegs: 1, xf: xf({ pos: [0, 0, ZP] }),
    });

    // —— 床架：底框、护栏（板条，棱 4mm 圆角）——
    // inner：底框朝床垫的那一面（被床垫挡住，AO 图块给低密度）
    const board = (name, len, y0, y1, pos, alongX, inner = null) => k.box({
      name, mat: 'birch', size: alongX ? [len, y1 - y0, BASE.t] : [BASE.t, y1 - y0, len], r: q(0.004, 0.003, 0), segs: q(1, 1, 0),
      grain: alongX ? 'x' : 'z', density: inner ? { [inner]: 0.25 } : {}, xf: xf({ pos: [pos[0], (y0 + y1) / 2, pos[1]] }),
    });
    const lx = 2 * XP - A, lz = 2 * ZP - A;
    for (const s of [-1, 1]) {
      board(`baseS${s > 0 ? 'R' : 'L'}`, lz, BASE.y0, BASE.y1, [s * XP, 0], false, s > 0 ? 'nx' : 'px');
      board(`baseE${s > 0 ? 'F' : 'H'}`, lx, BASE.y0, BASE.y1, [0, s * ZP], true, s > 0 ? 'nz' : 'pz');
      board(`railE${s > 0 ? 'F' : 'H'}`, lx, RAIL.y0, RAIL.y1, [0, s * ZP], true);
    }
    board('railL', lz, RAIL.y0, RAIL.y1, [-XP, 0], false);
    // 右侧只挡床头那一半，断开处一根竖挡连到底框
    const zr0 = -ZP + A / 2, zr1 = OPEN;
    board('railR', zr1 - zr0, RAIL.y0, RAIL.y1, [XP, (zr0 + zr1) / 2], false);
    k.box({
      name: 'stile', mat: 'birch', size: [BASE.t, RAIL.y1 - BASE.y1 + 0.01, A], r: q(0.004, 0.003, 0), segs: q(1, 1, 0), grain: 'y',
      xf: xf({ pos: [XP, (RAIL.y1 + BASE.y1 - 0.01) / 2, OPEN + A / 2] }),
    });

    // —— 床垫、被子、枕头 ——
    const mH = 0.12, mTop = BASE.y1 + 0.004;
    k.box({
      name: 'mattress', mat: 'linen_white', size: [MW, mH, ML], r: q(0.03, 0.025, 0.02), segs: q(2, 1, 0),
      omit: ['ny'], density: { py: 0.4, px: 0.25, nx: 0.25, pz: 0.25, nz: 0.25 }, xf: xf({ pos: [0, mTop - mH / 2, 0] }),
    });
    // 被子：比床垫宽 1.2cm，两侧和床尾垂下来（边缘 12cm 内弯下去 5cm）
    const dW = MW + 0.024, dT = 0.05, dL = 1.28, half = dW / 2;
    const drape = (p) => {
      const tx = smoothstep(half - 0.12, half + 0.01, Math.abs(p[0]));
      const tz = smoothstep(dL / 2 - 0.12, dL / 2 + 0.01, p[2]);
      const t = 1 - (1 - tx) * (1 - tz);
      const puff = 0.014 * (1 - (p[0] / half) ** 2) * Math.max(0, 1 - (p[2] / (dL / 2)) ** 2) * (p[1] > 0 ? 1 : 0.3);
      return [p[0] - Math.sign(p[0]) * tx * 0.012, p[1] - t * 0.055 + puff, p[2] - tz * 0.012];
    };
    const edgeNodes = q([-1, -0.9, -0.76, -0.4, 0, 0.4, 0.76, 0.9, 1], [-1, -0.8, 0, 0.8, 1], [-1, -0.76, 0.76, 1]);
    k.box({
      name: 'duvet', mat: 'gingham', size: [dW, dT, dL], r: q(0.022, 0.02, 0.018), segs: q(2, 1, 0),
      div: [edgeNodes, 1, q([-1, -0.5, 0, 0.5, 0.78, 0.9, 1], [-1, 0, 0.8, 1], [-1, 0.72, 1])], omit: ['ny'], deform: drape,
      xf: xf({ pos: [0, mTop + dT / 2 - 0.004, ML / 2 - dL / 2 - 0.01] }),
    });
    // 被头翻过来一截
    const foldZ = ML / 2 - dL - 0.01 + 0.11;
    k.box({
      name: 'fold', mat: 'gingham', size: [dW - 0.1, 0.04, 0.22], r: q(0.018, 0.016, 0.014), segs: q(2, 1, 0),
      div: q([2, 1, 1], [1, 1, 1], [1, 1, 1]), omit: ['ny'], deform: puffDeform([dW / 2, 0.02, 0.11], { top: 0.01 }),
      xf: xf({ pos: [0, mTop + dT + 0.008, foldZ] }),
    });
    // 小枕头
    k.box({
      name: 'pillow', mat: 'linen_white', size: [0.52, 0.085, 0.34], r: q(0.035, 0.03, 0.025), segs: q(3, 2, 0),
      div: q([2, 1, 2], [1, 1, 1], [1, 1, 1]), puff: q({ top: 0.02, bottom: 0.006, side: 0.008 }, { top: 0.015 }, null), omit: ['ny'],
      xf: xf({ pos: [-0.08, mTop + 0.05, -ML / 2 + 0.24], rot: [-0.18, 0.05, 0] }),
    });
    // 床尾横搭一条芥末黄的亚麻毯（叠成三折），两头从被子两侧垂下来
    const tW = MW + 0.03, tT = 0.026, tL = 0.32, th = tW / 2;
    const hang = (p) => {
      const tx = smoothstep(th - 0.1, th + 0.01, Math.abs(p[0]));
      const puff = 0.008 * (1 - (p[0] / th) ** 2) * (1 - (p[2] / (tL / 2)) ** 2) * (p[1] > 0 ? 1 : 0.3);
      return [p[0] - Math.sign(p[0]) * tx * 0.012, p[1] - tx * 0.07 + puff, p[2]];
    };
    k.box({
      name: 'throw', mat: 'linen_mustard', size: [tW, tT, tL], r: q(0.012, 0.01, 0.008), segs: q(2, 1, 0), grain: 'x',
      div: [q([-1, -0.92, -0.8, -0.5, 0, 0.5, 0.8, 0.92, 1], [-1, -0.82, 0, 0.82, 1], [-1, -0.8, 0.8, 1]), 1, q(2, 1, 1)], omit: ['ny'], deform: hang,
      xf: xf({ pos: [0, mTop + dT + tT / 2 - 0.004, ML / 2 - 0.3], rot: [0, 0.03, 0] }),
    });

    bunny(k, xf({ pos: [0.27, mTop, -ML / 2 + 0.36], rot: [0, 0.3, 0] }));
    bunting(k);
  },
};

// 圈绒兔子（坐着，约 26cm 高）：身体、脑袋是车削，耳朵是压扁的圆角块（里面贴一片粉色的布），
// 手脚是小胶囊；眼睛、鼻子是调色板里的深色 / 粉色小圆点。原点在屁股底下，脸朝 +z
function bunny(k, place) {
  const q = (...v) => k.q(...v);
  const s = { smooth: true };
  const at = (pos, rot = [0, 0, 0]) => place.mul(xf({ pos, rot }));
  k.lathe({
    name: 'bunBody', mat: 'boucle', segs: q(12, 8, 6),
    profile: profile([[0, 0], [0.042, 0.008, s], [0.055, 0.045, s], [0.047, 0.09, s], [0.03, 0.12, s], [0, 0.128]], s),
    xf: at([0, 0, 0]),
  });
  k.lathe({
    name: 'bunHead', mat: 'boucle', segs: q(12, 8, 6),
    profile: profile([[0, 0], [0.032, 0.008, s], [0.046, 0.04, s], [0.036, 0.074, s], [0, 0.086]], s),
    xf: at([0, 0.112, 0.004], [0.12, 0, 0]),
  });
  // 耳朵：垂耳，从头顶两侧耷拉下来，贴着脸颊往前一点。每只耳朵是一个车削的纺锤压扁成 35%（边缘是圆的），
  // 里面那片粉色的布是一个小一圈、压得更扁的纺锤，从耳朵正面露出来一点
  for (const sd of [-1, 1]) {
    const ear = at([sd * 0.03, 0.184, -0.002], [0.22, 0, -sd * 2.84]);
    const spindle = (name, mat, r, len, sq, z) => {
      const part = k.lathe({
        name, mat, segs: q(8, 6, 4),
        profile: profile([[0, 0], [r * 0.75, len * 0.12, s], [r, len * 0.55, s], [r * 0.7, len * 0.9, s], [0, len]], s),
      });
      squash(part, sq);
      return part.transform(ear.mul(xf({ pos: [0, 0, z] })));
    };
    spindle(`bunEar${sd > 0 ? 'R' : 'L'}`, 'boucle', 0.019, 0.115, 0.3, 0);
    if (k.lod < 2) paint(spindle(`bunInner${sd > 0 ? 'R' : 'L'}`, 'toys', 0.011, 0.085, 0.2, 0.0028), 'fabricPink');
  }
  // 手、脚
  const limb = (name, len, r, pos, rot) => k.lathe({
    name, mat: 'boucle', segs: q(6, 5, 4),
    profile: profile([[0, 0], [r * 0.8, r * 0.3, s], [r, len * 0.5, s], [r * 0.8, len - r * 0.3, s], [0, len]], s),
    xf: at(pos, rot),
  });
  for (const sd of [-1, 1]) {
    limb(`bunArm${sd > 0 ? 'R' : 'L'}`, 0.07, 0.014, [sd * 0.044, 0.094, 0.012], [0.47, 0, -sd * 2.857]);
    limb(`bunLeg${sd > 0 ? 'R' : 'L'}`, 0.075, 0.018, [sd * 0.03, 0.016, 0.018], [Math.PI / 2 - 0.15, sd * 0.25, 0]);
  }
  // 眼睛、鼻子
  if (k.lod < 2) {
    const dot = (name, r, color, pos, yaw) => paint(k.lathe({
      name, mat: 'toys', segs: q(8, 6), profile: profile([[0, -r * 0.3], [r, 0, s], [0, r * 0.45]], s), xf: at(pos, [Math.PI / 2 - 0.1, yaw, 0]),
    }), color);
    // 位置按脑袋的轮廓算好（头顶往前倾 0.12 弧度），眼睛稍微朝两边
    dot('bunEyeL', 0.0052, 'ink', [-0.019, 0.155, 0.0495], -0.43);
    dot('bunEyeR', 0.0052, 'ink', [0.019, 0.155, 0.0495], 0.43);
    dot('bunNose', 0.0055, 'pink', [0, 0.142, 0.0535], 0);
  }
}

// 小旗子：一根细绳从床尾山墙的左檐下挂到右檐下，中间垂下来；三角旗挂在绳上，每面微微偏一点角度
function bunting(k) {
  const q = (...v) => k.q(...v);
  const x0 = -XP + A / 2, x1 = XP - A / 2, y0 = YE - 0.035, sag = 0.1, z = ZP;
  const curve = (t) => [x0 + (x1 - x0) * t, y0 - sag * 4 * t * (1 - t), z];
  const n = q(14, 8, 5);
  const pts = Array.from({ length: n + 1 }, (_, i) => curve(i / n));
  paint(k.sweep({ name: 'string', mat: 'toys', shape: circle(0.0012, q(4, 3, 3)), caps: [false, false], up: [0, 0, 1], path: pts }), 'cream');
  const colors = ['fabricPink', 'fabricMustard', 'fabricSage', 'fabricBlue', 'cream'];
  const N = 7, w = 0.075, h = 0.085;
  // 七面旗是一个部件、一个图块；每面旗三个顶点的 UV 都指向它自己的颜色格子
  const part = k.part('toys', 'flags');
  const rnd = k.rand('flags');
  const ch = k.chart('flags', x1 - x0, h + sag, { density: 0.6 });
  const uv1 = (p) => [(p[0] - x0) / (x1 - x0), (y0 - p[1]) / (h + sag)];
  for (let i = 0; i < N; i++) {
    const ta = (i + 0.5) / N - w / (x1 - x0) / 2, tb = ta + w / (x1 - x0);
    const a = curve(ta), b = curve(tb), m = curve((ta + tb) / 2);
    const tip = [m[0] + (rnd() - 0.5) * 0.006, m[1] - h, m[2] + (rnd() - 0.5) * 0.05]; // 旗尖前后偏一点（风吹的）
    const uv = toyUV(colors[i % colors.length]);
    const ids = [a, b, tip].map((p) => part.v(p, [0, 0, 1], uv, ch, uv1(p)));
    part.tri(ids[0], ids[1], ids[2]);
  }
}
