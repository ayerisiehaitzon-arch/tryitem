import { profile, shape, triangulate } from '../core/shape.js';
import { xf } from '../core/vec.js';
import { APPLIANCE_ATLAS, APPLIANCE_PANELS, applianceUV, applianceSwatch } from '../materials/atlas.js';

// 滚筒洗衣机 / 烘干机共用的机身（60 × 85 × 57cm，贴墙落地，原点在墙根、宽度中点）。
// 整台机器除了门玻璃，全部是一个材质（家电图集）：
//   · 白色机身、镀铬门圈、黑色内框、橡胶门封、不锈钢内筒……每个部件的 UV 指向图集里的一个纯色格子；
//   · 控制面板正面的 UV 铺满图集里的面板印字（程序刻度、显示窗、按钮图标），显示窗里的数字是自发光；
//   · 内筒内壁的 UV 铺满图集里的内筒展开图（洗衣机冲孔、烘干机菱格压纹），u 绕一圈、v 沿筒深。
export const BODY = { W: 0.598, D: 0.565, H: 0.85, ZB: 0.03, foot: 0.014 };
const { W, D, H, ZB } = BODY;
export const ZF = ZB + D;           // 机身正面
const YP1 = 0.83, YP0 = YP1 - APPLIANCE_ATLAS.panel.h; // 控制面板上下沿
const R = 0.008;                    // 机身棱的圆角

// 部件整个指向一个纯色格子
export function swatch(part, name) {
  const uv = applianceSwatch(name);
  part.T = part.T.map(() => uv);
  return part;
}
const zAxis = (pos, extra = null) => (extra ? xf({ pos, rot: [Math.PI / 2, 0, 0] }).mul(extra) : xf({ pos, rot: [Math.PI / 2, 0, 0] }));

// 平面多边形（XY 平面、朝 +z），用于带圆洞的正面板
function flat(k, name, poly, z, ch, box) {
  const part = k.part('appliance', name);
  const ids = poly.map(([x, y]) => part.v([x, y, z], [0, 0, 1], [0, 0], ch, [(x - box[0]) / (box[2] - box[0]), (y - box[1]) / (box[3] - box[1])]));
  for (const [a, b, c] of triangulate(poly)) part.tri(ids[a], ids[b], ids[c]);
  return swatch(part, 'white');
}

/**
 * spec:
 *   panel      'W' | 'D'：控制面板布局（APPLIANCE_PANELS）和图集里的面板区域
 *   drum       'drumW' | 'drumD'：内筒区域
 *   door       { y: 门中心高, ring: 门圈外径, glass: 玻璃半径, bowl: 玻璃往里凹多深, ringColor: 门圈外圈颜色 }
 *   gasket     洗衣机的波纹橡胶门封（烘干机是一圈平的毡封 + 底下的绒毛过滤网）
 *   kick       'hatch'（右下角的排水过滤器小门）| 'grille'（烘干机：通长的冷凝器检修门，一排通风槽）
 */
export function frontLoader(k, spec) {
  const q = (...v) => k.q(...v);
  const P = APPLIANCE_PANELS[spec.panel];
  const region = spec.panel === 'W' ? 'panelW' : 'panelD';
  const dy = spec.door.y, hole = spec.door.ring - 0.04;

  // —— 机身：侧面、棱（正面、顶面、底面、背面另外做或看不见）——
  swatch(k.box({
    name: 'cabinet', mat: 'appliance', size: [W, YP1 - BODY.foot, D], r: q(R, R, 0.004), segs: q(2, 1, 1),
    omit: ['pz', 'py', 'ny', 'nz'], grain: 'y', xf: xf({ pos: [0, (YP1 + BODY.foot) / 2, ZB + D / 2] }),
  }), 'white');
  // 正面板：一块带圆洞的平板（门圈后面露出洞里的门封和内筒），左右两半各是一个简单多边形
  {
    const x0 = -W / 2 + R, y0 = BODY.foot + 0.002, y1 = YP0;
    const n = q(24, 16, 12);
    const half = [[x0, y0], [0, y0], [0, dy - hole]];
    for (let i = 1; i < n; i++) {
      const t = -Math.PI / 2 - (Math.PI * i) / n;
      half.push([hole * Math.cos(t), dy + hole * Math.sin(t)]);
    }
    half.push([0, dy + hole], [0, y1], [x0, y1]);
    const chL = k.chart('frontL', -x0, y1 - y0), chR = k.chart('frontR', -x0, y1 - y0);
    flat(k, 'frontL', half, ZF, chL, [x0, y0, 0, y1]);
    flat(k, 'frontR', half.map(([x, y]) => [-x, y]).reverse(), ZF, chR, [0, y0, -x0, y1]);
  }
  // 顶板：比机身四周各探出一点，正面一道小圆角
  swatch(k.box({
    name: 'top', mat: 'appliance', size: [W + 0.002, H - YP1, D + 0.004], r: q(0.004, 0.003, 0), segs: q(1, 1, 0),
    omit: ['ny', 'nz'], density: { py: 0.6 }, xf: xf({ pos: [0, (H + YP1) / 2, ZB + D / 2 + 0.002] }),
  }), 'white');

  // —— 控制面板：比正面板凸出 3mm，正面的 UV 铺满图集里的面板印字 ——
  {
    const part = k.box({
      name: 'panel', mat: 'appliance', size: [W - 2 * R, YP1 - YP0, 0.008], r: q(0.003, 0.002, 0), segs: q(1, 1, 0),
      omit: ['nz', 'py'], density: { pz: 1.6 }, xf: xf({ pos: [0, (YP0 + YP1) / 2, ZF - 0.001] }),
    });
    const pw = APPLIANCE_ATLAS.panel.w, ph = APPLIANCE_ATLAS.panel.h;
    const white = applianceSwatch('white');
    part.T = part.P.map((p, i) => (part.N[i][2] > 0.9 ? applianceUV(region, (p[0] + pw / 2) / pw, (YP1 - p[1]) / ph) : white));
  }
  const px = (x) => x - APPLIANCE_ATLAS.panel.w / 2; // 面板坐标 → 机身 x
  const py = (y) => YP1 - y;
  // 洗衣液抽屉 / 冷凝水盒：面板左边一块单独的抽屉面，下沿一道拉手槽
  {
    const x0 = px(0.012), x1 = px(P.drawer), yA = py(0.012), yB = py(0.098);
    swatch(k.box({
      name: 'drawer', mat: 'appliance', size: [x1 - x0, yA - yB, 0.012], r: q(0.004, 0.003, 0), segs: q(1, 1, 0),
      omit: ['nz'], xf: xf({ pos: [(x0 + x1) / 2, (yA + yB) / 2, ZF + 0.002] }),
    }), 'white');
    swatch(k.box({
      name: 'grip', mat: 'appliance', size: [0.07, 0.004, 0.004], r: q(0.0015, 0), segs: q(1, 0),
      omit: ['nz'], xf: xf({ pos: [(x0 + x1) / 2, yB + 0.009, ZF + 0.0065] }),
    }), 'black');
  }
  // 程序旋钮：镀铬底圈 + 白色旋钮（正面微凹），一道指示线
  {
    const kx = px(P.knob.cx), ky = py(P.knob.cy);
    const s = { smooth: true };
    swatch(k.lathe({
      name: 'knobRing', mat: 'appliance', segs: q(20, 14, 10),
      profile: profile([[0.0372, 0], [0.0372, 0.003], [0.034, 0.004]]),
      xf: zAxis([kx, ky, ZF + 0.003]),
    }), 'chrome');
    swatch(k.lathe({
      name: 'knob', mat: 'appliance', segs: q(20, 14, 10),
      profile: profile([[0.033, 0.003], [0.033, 0.02, { r: q(0.004, 0.003, 0), segs: 1 }], [0, 0.0212]]),
      xf: zAxis([kx, ky, ZF + 0.003]),
    }), 'white');
    if (k.lod < 2) {
      swatch(k.box({
        name: 'knobMark', mat: 'appliance', size: [0.0025, 0.012, 0.002], r: 0.0008, segs: 1, omit: ['nz'],
        xf: xf({ pos: [kx, ky + 0.017, ZF + 0.0245] }),
      }), 'graphite');
    }
    // 按钮：三个小圆钮（开始键是镀铬的）
    P.buttons.forEach(([bx, by], i) => {
      swatch(k.lathe({
        name: `button${i}`, mat: 'appliance', segs: q(10, 8, 6),
        profile: profile([[0.0086, 0], [0.0086, 0.0022], [0, 0.0032]]),
        xf: zAxis([px(bx), py(by), ZF + 0.003]),
      }), i === P.buttons.length - 1 ? 'chrome' : 'white');
    });
  }

  // —— 门 ——
  door(k, spec, dy, hole);

  // —— 底部：排水过滤器小门 / 冷凝器检修门 ——
  if (spec.kick === 'hatch') {
    swatch(k.box({
      name: 'hatch', mat: 'appliance', size: [0.13, 0.05, 0.006], r: q(0.004, 0.003, 0), segs: q(2, 1, 0), omit: ['nz'],
      xf: xf({ pos: [W / 2 - 0.1, 0.06, ZF - 0.002] }),
    }), 'white');
    if (k.lod < 2) swatch(k.box({ name: 'hatchSlot', mat: 'appliance', size: [0.03, 0.004, 0.003], segs: 0, omit: ['nz'], xf: xf({ pos: [W / 2 - 0.1, 0.075, ZF + 0.0015] }) }), 'black');
  } else {
    swatch(k.box({
      name: 'kick', mat: 'appliance', size: [W - 0.05, 0.09, 0.006], r: q(0.004, 0.003, 0), segs: q(2, 1, 0), omit: ['nz'],
      xf: xf({ pos: [0, 0.07, ZF - 0.002] }),
    }), 'white');
    // 一排通风槽
    if (k.lod < 2) {
      for (let i = 0; i < 9; i++) {
        swatch(k.box({
          name: `vent${i}`, mat: 'appliance', size: [0.004, 0.036, 0.003], r: 0.0015, segs: q(1, 0), omit: ['nz'],
          xf: xf({ pos: [W / 2 - 0.07 - i * 0.012, 0.07, ZF + 0.0015] }),
        }), 'black');
      }
    }
  }
  // 可调节的脚
  for (const [i, sx, z] of [[0, -1, ZF - 0.05], [1, 1, ZF - 0.05], [2, 1, ZB + 0.05], [3, -1, ZB + 0.05]]) {
    swatch(k.lathe({
      name: `foot${i}`, mat: 'appliance', segs: q(8, 6, 4),
      profile: profile([[0.017, 0], [0.017, BODY.foot + 0.002]]),
      xf: xf({ pos: [sx * (W / 2 - 0.05), 0, z] }),
    }), 'rubber');
  }
}

// 门：外圈（镀铬 / 白色）+ 黑色内框 + 玻璃；门后是门封和内筒（隔着玻璃看得见）
function door(k, spec, dy, hole) {
  const q = (...v) => k.q(...v);
  const d = spec.door, s = { smooth: true };
  const segs = q(32, 22, 14);
  const at = zAxis([0, dy, ZF]);
  const Ro = d.ring, Rg = d.glass;
  // 外圈：从贴着正面板的后沿翻过来，正面一圈平台，内沿往里收
  swatch(k.lathe({
    name: 'ring', mat: 'appliance', segs,
    profile: profile([[Ro - 0.002, 0], [Ro, 0.014, { r: q(0.006, 0.005, 0.003), segs: q(2, 1, 1) }], [Ro - 0.016, 0.046, s],
      [Ro - 0.03, 0.05, s], [Rg + 0.03, 0.05, { r: q(0.003, 0.002, 0), segs: 1 }], [Rg + 0.026, 0.047]]),
    xf: at,
  }), d.ringColor);
  // 黑色内框：往里收到玻璃边
  swatch(k.lathe({
    name: 'frame', mat: 'appliance', segs,
    profile: profile([[Rg + 0.026, 0.047], [Rg + 0.014, 0.04, s], [Rg + 0.002, 0.022, s], [Rg, 0.012]]),
    xf: at,
  }), 'black');
  // 玻璃：往机器里凹进去的碗（烘干机是一块平玻璃，只微微往里凹）
  const b = d.bowl;
  k.lathe({
    name: 'glass', mat: 'glass_smoke', segs,
    profile: profile([[Rg + 0.001, 0.014], [Rg * 0.9, 0.014 - b * 0.42, s], [Rg * 0.52, 0.014 - b * 0.9, s], [0, 0.014 - b]], s),
    xf: at,
  });
  // 左侧的门铰链
  swatch(k.box({
    name: 'hinge', mat: 'appliance', size: [0.034, 0.11, 0.03], r: q(0.006, 0.004, 0), segs: q(2, 1, 0), omit: ['nz'],
    xf: xf({ pos: [-Ro + 0.006, dy, ZF + 0.015] }),
  }), 'graphite');

  // —— 门后：门封、内筒 ——
  const drumR = APPLIANCE_ATLAS[spec.drum].r, depth = APPLIANCE_ATLAS[spec.drum].depth;
  const z0 = 0.09; // 筒口在正面板后面多深
  // 筒口比玻璃小一圈：隔着玻璃，四周看得见一圈门封（真的洗衣机就是这样）
  const mouth = Rg - (spec.gasket ? 0.02 : 0.015);
  if (spec.gasket) {
    // 波纹橡胶门封：从正面板的圆洞往里卷到筒口，中间一道褶；法线朝着轴心（从门外看进去的是它的内面）
    swatch(k.lathe({
      name: 'gasket', mat: 'appliance', segs: q(20, 14, 10),
      profile: profile([[hole + 0.01, 0.0005], [hole, -0.004, s], [Rg + 0.014, -0.02, s], [Rg + 0.024, -0.04, s], [Rg + 0.002, -0.06, s], [mouth + 0.002, -0.08, s], [mouth, -z0]], s),
      xf: at,
    }), 'rubber');
  } else {
    // 烘干机：一圈平的毡封，底下露出绒毛过滤网的上沿
    swatch(k.lathe({
      name: 'seal', mat: 'appliance', segs: q(20, 14, 10),
      profile: profile([[hole + 0.01, 0.0005], [hole - 0.004, -0.01, s], [Rg + 0.004, -0.045, s], [mouth + 0.003, -0.075, s], [mouth, -z0]], s),
      xf: at,
    }), 'graphite');
    if (k.lod < 2) {
      // 过滤网：门洞下沿一块弯的灰色塑料
      const n = q(8, 6);
      const pts = [];
      for (let i = 0; i <= n; i++) {
        const a = -Math.PI / 2 - 0.9 + (1.8 * i) / n;
        pts.push([Math.cos(a) * (Rg - 0.004), dy + Math.sin(a) * (Rg - 0.004)]);
      }
      const part = k.extrude({
        name: 'lint', mat: 'appliance', axis: 'z', depth: 0.04,
        shape: shape([...pts.map(([x, y]) => [x, y, { smooth: true }]), ...pts.slice().reverse().map(([x, y]) => [x * 0.88, dy + (y - dy) * 0.88, { smooth: true }])]),
        caps: [false, true], xf: xf({ pos: [0, 0, ZF - 0.06] }),
      });
      swatch(part, 'grey');
    }
  }
  // 内筒：筒口一圈（朝前）→ 筒壁（法线朝轴心，UV 铺满图集里的内筒展开图）→ 筒底
  const wall = k.lathe({
    name: 'drum', mat: 'appliance', segs: q(24, 16, 10), grain: 'around',
    profile: profile([[drumR, -z0 - 0.012 - depth], [drumR, -z0 - 0.012]].reverse()),
    xf: at,
  });
  wall.T = wall.P.map((p, i) => applianceUV(spec.drum, wall.T[i][0] / (2 * Math.PI * drumR), (ZF - z0 - 0.012 - p[2]) / depth));
  swatch(k.lathe({
    name: 'drumLip', mat: 'appliance', segs: q(24, 16, 10),
    profile: profile([[drumR, -z0 - 0.012], [mouth, -z0]]),
    xf: at,
  }), 'steel');
  swatch(k.lathe({
    name: 'drumBack', mat: 'appliance', segs: q(24, 16, 10),
    profile: profile([[drumR, -z0 - 0.012 - depth], [0.05, -z0 - 0.012 - depth], [0, -z0 - 0.02 - depth]]),
    xf: at,
  }), 'steel');
  // 三根提升筋（沿筒深的一道棱）
  if (k.lod < 2) {
    for (let i = 0; i < 3; i++) {
      const a = Math.PI / 2 + (i * 2 * Math.PI) / 3;
      const part = k.extrude({
        name: `lifter${i}`, mat: 'appliance', axis: 'z', depth: depth - 0.02,
        shape: shape([[-0.022, 0], [0.022, 0], [0.006, 0.034, { r: 0.006, segs: 2 }], [-0.006, 0.034, { r: 0.006, segs: 2 }]]),
        caps: [false, true], bevel: [0, q(0.003, 0)], bsegs: 1,
        xf: xf({ pos: [Math.cos(a) * drumR, dy + Math.sin(a) * drumR, ZF - z0 - 0.012 - depth + 0.01], rot: [0, 0, a + Math.PI / 2] }),
      });
      swatch(part, 'steel');
    }
  }
}
