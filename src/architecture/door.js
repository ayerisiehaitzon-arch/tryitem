import { profile, circle } from '../core/shape.js';
import { xf } from '../core/vec.js';
import { roundedPath } from '../core/path.js';
import { WALL, wallBox, wallEnds, skirting } from './walls.js';

// 门：一块 2m 墙模块，正中一樘室内门（和白墙、护墙板墙首尾相接）。
//   · 门洞 94 × 213cm；门套板包住墙厚，两面各一圈阶梯形门套线（一次扫掠，两个拐角斜接）；
//   · 门扇是白色烤漆的两格造型门（Shaker）：边梃、冒头、芯板各是一块倒角板，
//     芯板比框薄、前后各凹进 11mm —— 凹槽的阴影全靠烘焙 AO，不花额外的面；
//   · 门朝正面（+z）开：合页的圆筒露在正面，门挡条在门扇背后；两面各一个黄铜执手；
//   · 门扇离地 8mm、四周留 3mm 缝，缝里的暗线同样是 AO。
const RO = { w: 0.94, h: 2.13 }; // 门洞
const JT = 0.02; // 门套板厚
const OPEN = { w: RO.w - 2 * JT, h: RO.h - JT }; // 净洞 90 × 211
const LEAF = { w: OPEN.w - 0.006, h: OPEN.h - 0.011, t: 0.04, y0: 0.008 };
const ZF = WALL.T / 2 - 0.004; // 门扇正面
const CASING = { w: 0.07, reveal: 0.005 };

// 门套线截面（开放轮廓，从外缘走到内缘；x 朝外为正，y 离开墙面）：外缘一个圆角，内缘一道台阶
function casingProfile(k) {
  const q = (...v) => k.q(...v);
  const h = CASING.w / 2;
  return profile([
    [h, 0],
    [h, 0.018, { r: q(0.006, 0.004, 0), segs: q(2, 2, 1) }],
    [-h + 0.009, 0.018, { r: q(0.0015, 0, 0), segs: 1 }],
    [-h + 0.007, 0.013],
    [-h, 0.013, { r: q(0.003, 0, 0), segs: q(2, 1, 1) }],
    [-h, 0],
  ]);
}

// 执手：圆形底座 + 一根弯过来的圆杆（杆头朝合页一侧），side = +1 装在正面、-1 装在背面
function lever(k, { name, x, y, z, side }) {
  const q = (...v) => k.q(...v);
  const rot = side > 0 ? [Math.PI / 2, 0, 0] : [-Math.PI / 2, 0, 0];
  k.lathe({
    name: `${name}Rose`, mat: 'brass', segs: q(12, 8),
    profile: profile([[0.026, 0], [0.026, 0.003, { r: q(0.0025, 0.002), segs: 1 }], [0.012, 0.0095, { smooth: true }], [0, 0.011]]),
    xf: xf({ pos: [x, y, z], rot }),
  });
  const s = side;
  const path = roundedPath([[x, y, z + s * 0.008], [x, y, z + s * 0.056], [x - 0.13, y, z + s * 0.056]], 0.02, q(3, 2));
  k.sweep({
    name: `${name}Lever`, mat: 'brass', shape: circle(0.0085, q(8, 6)), path, up: [0, 1, 0], caps: [false, true],
    // 杆头略收细，像手工锻造的执手
    scale: (t) => 1 - 0.18 * Math.max(0, (t - 0.55) / 0.45),
  });
}

export const wallDoor = {
  id: 'wall_door',
  name: '门',
  nameEn: 'Shaker Door in Wall',
  category: 'architecture',
  aoDensity: 90,
  shadow: { margin: 0.32, maxDist: 0.9, density: 60 },
  view: { el: 12, az: 28 },
  build(k) {
    const q = (...v) => k.q(...v);
    const { L, H, T } = WALL;
    const x0 = RO.w / 2;
    // —— 墙体：门洞两侧和上方（朝门洞的面被门套板盖住，不生成）——
    wallBox(k, { name: 'wallL', x0: -L / 2, x1: -x0, omit: ['ny', 'px'], splitY: [RO.h], ends: ['nx'] });
    wallBox(k, { name: 'wallR', x0: x0, x1: L / 2, omit: ['ny', 'nx'], splitY: [RO.h], ends: ['px'] });
    wallBox(k, { name: 'wallTop', x0: -x0, x1: x0, y0: RO.h, omit: ['ny', 'px', 'nx'] });
    wallEnds(k);
    // —— 踢脚线：到门套线外缘为止 ——
    const cx = OPEN.w / 2 + CASING.reveal + CASING.w; // 门套线外缘
    for (const [sfx, zFace, side] of [['F', T / 2, 1], ['B', -T / 2, -1]]) {
      skirting(k, { name: `skirting${sfx}L`, x0: -L / 2, x1: -cx, zFace, side });
      skirting(k, { name: `skirting${sfx}R`, x0: cx, x1: L / 2, zFace, side });
    }
    // —— 门套板（包住墙厚）+ 门挡条 ——
    const jamb = (name, x, y, w, h, omit) => k.box({
      name, mat: 'paint', size: [w, h, T], segs: 0, omit, density: { pz: 0.3, nz: 0.3 },
      xf: xf({ pos: [x, y, 0] }),
    });
    jamb('jambL', -x0 + JT / 2, OPEN.h / 2, JT, OPEN.h, ['nx', 'ny', 'py']);
    jamb('jambR', x0 - JT / 2, OPEN.h / 2, JT, OPEN.h, ['px', 'ny', 'py']);
    jamb('jambTop', 0, OPEN.h + JT / 2, RO.w, JT, ['py']);
    const stopZ = ZF - LEAF.t - 0.006; // 门挡条中心（门扇背面之后）
    const stop = (name, x, y, w, h, omit) => k.box({
      name, mat: 'paint', size: [w, h, 0.012], segs: 0, omit,
      xf: xf({ pos: [x, y, stopZ] }),
    });
    stop('stopL', -OPEN.w / 2 + 0.006, OPEN.h / 2, 0.012, OPEN.h, ['nx', 'ny', 'py']);
    stop('stopR', OPEN.w / 2 - 0.006, OPEN.h / 2, 0.012, OPEN.h, ['px', 'ny', 'py']);
    stop('stopTop', 0, OPEN.h - 0.006, OPEN.w - 0.024, 0.012, ['py', 'px', 'nx']);
    // —— 门套线：两面各一圈 ——
    const prof = casingProfile(k);
    const cm = OPEN.w / 2 + CASING.reveal + CASING.w / 2, ct = OPEN.h + CASING.reveal + CASING.w / 2;
    // 图块按 2.7m 一片切两片（切口在门头中间），直段上不多插环
    k.sweep({
      name: 'casingF', mat: 'paint', shape: prof, up: [0, 0, 1], caps: [false, false], maxChart: 2.7,
      path: [[-cm, 0, T / 2], [-cm, ct, T / 2], [cm, ct, T / 2], [cm, 0, T / 2]],
    });
    k.sweep({
      name: 'casingB', mat: 'paint', shape: prof, up: [0, 0, -1], caps: [false, false], maxChart: 2.7,
      path: [[cm, 0, -T / 2], [cm, ct, -T / 2], [-cm, ct, -T / 2], [-cm, 0, -T / 2]],
    });
    // —— 门扇：两根边梃、三根冒头（上 / 中 / 下）、两块凹进去的芯板 ——
    const lz = ZF - LEAF.t / 2, lx = 0;
    const st = 0.12, rails = [[LEAF.y0, 0.22], [0.9, 0.2], [LEAF.y0 + LEAF.h - 0.12, 0.12]]; // [下沿, 高]
    const r = q(0.003, 0.0025, 0), segs = q(1, 1, 0);
    for (const s of [-1, 1]) {
      k.box({
        name: `stile${s > 0 ? 'R' : 'L'}`, mat: 'paint', size: [st, LEAF.h, LEAF.t], r, segs, grain: 'y',
        xf: xf({ pos: [lx + s * (LEAF.w / 2 - st / 2), LEAF.y0 + LEAF.h / 2, lz] }),
      });
    }
    const iw = LEAF.w - 2 * st;
    rails.forEach(([y, h], i) => k.box({
      name: `rail${i}`, mat: 'paint', size: [iw, h, LEAF.t], r, segs, omit: ['px', 'nx'], grain: 'x',
      xf: xf({ pos: [lx, y + h / 2, lz] }),
    }));
    for (let i = 0; i < 2; i++) {
      const y0 = rails[i][0] + rails[i][1], y1 = rails[i + 1][0];
      k.box({
        name: `panel${i}`, mat: 'paint', size: [iw, y1 - y0, 0.018], segs: 0,
        omit: ['px', 'nx', 'py', 'ny'], grain: 'y',
        xf: xf({ pos: [lx, (y0 + y1) / 2, lz] }),
      });
    }
    // —— 五金：合页（门扇左侧，露在正面）+ 两面执手（右侧，离地 1m）——
    if (k.lod < 2) {
      for (const [i, y] of [0.25, 1.05, 1.85].entries()) {
        k.lathe({
          name: `hinge${i}`, mat: 'brass', segs: q(7, 6),
          profile: profile([[0, -0.052], [0.0065, -0.047, { r: q(0.003, 0), segs: 1 }], [0.0065, 0.047, { r: q(0.003, 0), segs: 1 }], [0, 0.052]]),
          // 合页圆筒的轴在门扇正面之前 6mm：整根圆筒露在门缝外面
          xf: xf({ pos: [-LEAF.w / 2 - 0.0015, y, ZF + 0.006] }),
        });
      }
      const hx = LEAF.w / 2 - 0.065;
      lever(k, { name: 'handleF', x: hx, y: 1.0, z: ZF, side: 1 });
      lever(k, { name: 'handleB', x: hx, y: 1.0, z: ZF - LEAF.t, side: -1 });
    }
  },
};
