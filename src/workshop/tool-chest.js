import { shape, profile, rect, circle } from '../core/shape.js';
import { xf } from '../core/vec.js';
import { roundedPath } from '../core/path.js';
import { WORKSHOP_ATLAS, workshopUV, workshopSwatch } from '../materials/atlas.js';
import { DRILL } from './layout.js';
import { sw, mapUV, rod, caster, ccw } from './parts.js';

// 滚轮工具柜：红色烤漆的两截柜 —— 下面一个五抽的滚轮柜，上面一个三抽带翻盖的工具箱，
//   · 每个抽屉一条通长的铝拉手，抽屉缝里是黑的；工具箱中间那个抽屉拉开着：黑色的防滑垫上一排镀铬套筒和一把棘轮扳手；
//   · 翻盖前面一块拉丝银铭牌（贴图）、一个锁芯；两侧镀铬的把手；四个万向轮；
//   · 工具箱顶上立着一把黄色的充电电钻（机身侧面是贴图：黑色包胶的握把、散热槽、牌子，电池上写着 18V），夹着一根钻头。
// 原点在柜子正下方的地面，正面朝 +z。
const CAB = { w: 0.68, d: 0.46, y0: 0.105, y1: 0.725, drawers: [0.075, 0.075, 0.1, 0.14, 0.17] };
const TOP = { w: 0.66, d: 0.4, y1: 0.95, lid: 0.075, drawers: [0.055, 0.055, 0.08], open: 1, pull: 0.11 };
const GAP = 0.006, RED = 'toolRed';

export default {
  id: 'tool_chest',
  name: '滚轮工具柜',
  nameEn: 'Rolling Tool Chest',
  category: 'workshop',
  aoDensity: 280,
  shadow: { margin: 0.12, maxDist: 0.6, density: 120 },
  view: { el: 16, az: 28 },
  build(k) {
    const q = (...v) => k.q(...v);
    const sm = { smooth: true };

    // —— 下柜 ——
    const zf = CAB.d / 2;
    carcass(k, 'cab', { w: CAB.w, d: CAB.d, y0: CAB.y0, y1: CAB.y1, z: 0 });
    drawerStack(k, 'cab', { w: CAB.w, zf, top: CAB.y1 - 0.016, heights: CAB.drawers });
    // 右侧的管子把手
    {
      const x = CAB.w / 2, y = CAB.y1 - 0.09, o = 0.055;
      const path = roundedPath([[x - 0.01, y, -0.16], [x + o, y, -0.16], [x + o, y, 0.16], [x - 0.01, y, 0.16]], [0, 0.03, 0.03, 0], q(4, 3, 2));
      sw(k.sweep({ name: 'sideHandle', mat: 'workshop', shape: circle(0.011, q(10, 8, 6)), path, up: [0, 1, 0] }), 'chrome');
      for (const z of [-0.16, 0.16]) sw(k.box({ name: `sideBracket${z > 0 ? 'F' : 'B'}`, mat: 'workshop', size: [0.006, 0.05, 0.04], r: q(0.002, 0), segs: q(1, 0), xf: xf({ pos: [x + 0.003, y, z] }) }), 'blackPlastic');
    }
    // 四个万向轮
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      caster(k, `caster${sx > 0 ? 'R' : 'L'}${sz > 0 ? 'F' : 'B'}`, { top: CAB.y0, place: xf({ pos: [sx * (CAB.w / 2 - 0.06), 0, sz * (CAB.d / 2 - 0.06)], rot: [0, (sx * 0.9 + sz * 2.3) % Math.PI, 0] }) });
    }

    // —— 上面的工具箱（靠后放，前面让出一截台面）——
    const tz = -zf + TOP.d / 2 + 0.005, tzf = tz + TOP.d / 2, ty0 = CAB.y1;
    carcass(k, 'chest', { w: TOP.w, d: TOP.d, y0: ty0, y1: TOP.y1, z: tz });
    drawerStack(k, 'chest', { w: TOP.w, zf: tzf, top: TOP.y1 - 0.008, heights: TOP.drawers, open: TOP.open, pull: TOP.pull, depth: TOP.d - 0.04 });
    // 翻盖：盖住顶上一截，前脸上铭牌和锁
    const ly0 = TOP.y1, ly1 = TOP.y1 + TOP.lid;
    sw(k.box({ name: 'lid', mat: 'workshop', size: [TOP.w + 0.006, TOP.lid, TOP.d + 0.006], r: 0.008, segs: q(2, 1, 1), xf: xf({ pos: [0, (ly0 + ly1) / 2, tz] }) }), RED);
    sw(k.box({ name: 'lidMat', mat: 'workshop', size: [TOP.w - 0.03, 0.002, TOP.d - 0.03], segs: 0, omit: ['ny'], xf: xf({ pos: [0, ly1 + 0.001, tz] }) }), 'rubber');
    {
      const B = WORKSHOP_ATLAS.badge, bw = 0.2, bh = 0.05;
      const b = k.box({ name: 'badge', mat: 'workshop', size: [bw, bh, 0.003], r: q(0.002, 0), segs: q(1, 0), omit: ['nz'] });
      const edge = workshopSwatch('chrome');
      mapUV(b, (p, n) => (n[2] > 0.7 ? workshopUV('badge', (p[0] + bw / 2) / bw, (bh / 2 - p[1]) / bh) : edge));
      b.transform(xf({ pos: [-0.08, (ly0 + ly1) / 2, tzf + 0.003 + 0.0015] }));
      sw(k.lathe({ name: 'lock', mat: 'workshop', segs: q(12, 8, 6), profile: profile([[0.011, 0], [0.011, 0.004, sm], [0.008, 0.006], [0, 0.006]]), xf: xf({ pos: [0.2, (ly0 + ly1) / 2, tzf + 0.003], rot: [Math.PI / 2, 0, 0] }) }), 'chrome');
      if (k.lod < 2) sw(k.box({ name: 'lockSlot', mat: 'workshop', size: [0.0016, 0.009, 0.001], segs: 0, xf: xf({ pos: [0.2, (ly0 + ly1) / 2, tzf + 0.0095] }) }), 'holeDark');
    }
    // 两侧的折叠把手
    for (const s of [-1, 1]) {
      const x = s * (TOP.w / 2 + 0.003), y = TOP.y1 - 0.06;
      const path = roundedPath([[x, y, tz - 0.07], [x + s * 0.03, y - 0.004, tz - 0.07], [x + s * 0.03, y - 0.004, tz + 0.07], [x, y, tz + 0.07]], [0, 0.01, 0.01, 0], q(3, 2, 1));
      sw(k.sweep({ name: `chestHandle${s > 0 ? 'R' : 'L'}`, mat: 'workshop', shape: circle(0.005, q(8, 6, 4)), path, up: [0, 1, 0] }), 'chrome');
    }

    // —— 顶上的电钻 ——
    drill(k, xf({ pos: [0.12, ly1 + 0.002, tz + 0.02], rot: [0, 0.5, 0] }).mul(xf({ pos: [-(DRILL.battery.x0 + DRILL.battery.x1) / 2, 0, 0] })));
  },
};

// 柜体：红色的外壳（前面敞着），里面一块黑板（抽屉缝里看进去是黑的）
function carcass(k, name, { w, d, y0, y1, z }) {
  const q = (...v) => k.q(...v);
  sw(k.box({ name: `${name}Body`, mat: 'workshop', size: [w, y1 - y0, d], r: 0.008, segs: q(2, 1, 1), omit: ['pz'], xf: xf({ pos: [0, (y0 + y1) / 2, z] }) }), RED);
  sw(k.box({ name: `${name}Inside`, mat: 'workshop', size: [w - 0.02, y1 - y0 - 0.02, 0.004], segs: 0, omit: ['nz'], xf: xf({ pos: [0, (y0 + y1) / 2, z + d / 2 - 0.012] }) }), 'holeDark');
}

// 一列抽屉：从 top 往下排；每个抽屉一块红色面板 + 一条通长铝拉手。open 指定的那个拉出来 pull（露出抽屉盒和里面的东西）
function drawerStack(k, name, { w, zf, top, heights, open = -1, pull = 0, depth = 0.3 }) {
  const q = (...v) => k.q(...v);
  let y = top;
  heights.forEach((h, i) => {
    const yc = y - h / 2, isOpen = i === open, dz = isOpen ? pull : 0;
    const fw = w - 0.03;
    sw(k.box({ name: `${name}Drawer${i}`, mat: 'workshop', size: [fw, h, 0.014], r: 0.003, segs: q(1, 1, 0), xf: xf({ pos: [0, yc, zf + 0.007 + dz] }) }), RED);
    // 铝拉手：抽屉顶边一条，前面一道唇边（手指勾的地方）
    const pz = zf + 0.014 + dz;
    const lip = [[0, 0.002], [0, -0.014], [0.021, -0.014], [0.021, -0.004], [0.017, -0.004], [0.017, -0.011], [0.004, -0.011], [0.004, 0.002]];
    sw(k.extrude({ name: `${name}Pull${i}`, mat: 'workshop', shape: shape(ccw(lip.map(([a, b]) => [-a, b]))), depth: fw - 0.02, axis: 'x', center: true, bevel: 0, xf: xf({ pos: [0, y - 0.004, pz] }) }), 'aluminum');
    if (isOpen) openDrawer(k, `${name}Open`, { w: fw - 0.02, h, y0: y - h, zf: zf + dz, depth });
    y -= h + GAP;
  });
}

// 拉开的抽屉：镀锌的抽屉盒（两侧、后板、底），底上黑色防滑垫，一排套筒和一把棘轮扳手
function openDrawer(k, name, { w, h, y0, zf, depth }) {
  const q = (...v) => k.q(...v);
  const sm = { smooth: true };
  const hh = h - 0.012, zb = zf - depth;
  for (const s of [-1, 1]) sw(k.box({ name: `${name}Side${s > 0 ? 'R' : 'L'}`, mat: 'workshop', size: [0.002, hh, depth], segs: 0, xf: xf({ pos: [s * (w / 2 - 0.001), y0 + 0.004 + hh / 2, zf - depth / 2] }) }), 'zinc');
  sw(k.box({ name: `${name}Back`, mat: 'workshop', size: [w, hh, 0.002], segs: 0, xf: xf({ pos: [0, y0 + 0.004 + hh / 2, zb + 0.001] }) }), 'zinc');
  sw(k.box({ name: `${name}Floor`, mat: 'workshop', size: [w, 0.002, depth], segs: 0, xf: xf({ pos: [0, y0 + 0.005, zf - depth / 2] }) }), 'zinc');
  const yl = y0 + 0.009;
  sw(k.box({ name: `${name}Liner`, mat: 'workshop', size: [w - 0.006, 0.003, depth - 0.006], segs: 0, omit: ['ny'], xf: xf({ pos: [0, yl - 0.0015, zf - depth / 2] }) }), 'rubber');
  // 套筒：由小到大一排，站着
  const zr = zf - 0.03;
  for (let i = 0; i < 9; i++) {
    if (k.lod === 2 && i % 2) continue;
    const r = 0.0085 + i * 0.0011, hgt = 0.028 + i * 0.0012, x = -w / 2 + 0.05 + i * 0.033;
    sw(k.lathe({ name: `${name}Socket${i}`, mat: 'workshop', segs: q(12, 8, 6), profile: profile([[r * 0.95, 0], [r, 0.003, sm], [r, hgt - 0.002, sm], [r * 0.9, hgt], [r * 0.62, hgt]]), xf: xf({ pos: [x, yl, zr] }) }), 'chrome');
    if (k.lod < 2) sw(k.lathe({ name: `${name}SocketHole${i}`, mat: 'workshop', segs: 6, profile: profile([[r * 0.62, 0], [0, 0]]), xf: xf({ pos: [x, yl + hgt - 0.001, zr] }) }), 'holeDark');
  }
  // 棘轮扳手：平躺，一个圆头 + 一根柄
  const rz = zf - 0.078, rx = 0.06;
  sw(k.lathe({ name: `${name}RatchetHead`, mat: 'workshop', segs: q(14, 10, 6), profile: profile([[0.02, 0], [0.02, 0.008, sm], [0.016, 0.012], [0, 0.012]]), xf: xf({ pos: [rx, yl, rz] }) }), 'chrome');
  sw(k.box({ name: `${name}RatchetBar`, mat: 'workshop', size: [0.2, 0.009, 0.017], r: q(0.003, 0.002, 0), segs: q(1, 1, 0), xf: xf({ pos: [rx + 0.115, yl + 0.0045, rz + 0.004], rot: [0, 0.04, 0] }) }), 'chrome');
  sw(k.box({ name: `${name}RatchetGrip`, mat: 'workshop', size: [0.09, 0.013, 0.022], r: q(0.005, 0.004, 0), segs: q(2, 1, 0), xf: xf({ pos: [rx + 0.17, yl + 0.0065, rz + 0.006], rot: [0, 0.04, 0] }) }), 'blackPlastic');
}

// ——————————————————————— 电钻 ———————————————————————
// DRILL 坐标（x 朝钻头、y 向上、电池底在 y = 0）：机身 + 握把挤出（两个侧面贴图），电池、钻夹头、钻头、扳机
function drill(k, place) {
  const q = (...v) => k.q(...v);
  const sm = { smooth: true };
  const F = DRILL.frame;
  const uvOf = (p) => workshopUV('drill', (p[0] - F.x0) / F.size, 1 - (p[1] - F.y0) / F.size);
  const pts = DRILL.body.map(([x, y], i) => [x, y, DRILL.smooth[i] ? sm : {}]);
  const body = k.extrude({ name: 'drillBody', mat: 'workshop', shape: shape(pts), depth: DRILL.depth, center: true, bevel: { w: 0.009, h: 0.009 }, bsegs: q(2, 1, 1) });
  mapUV(body, uvOf);
  body.transform(place);
  const B = DRILL.battery;
  const bat = k.box({ name: 'drillBattery', mat: 'workshop', size: [B.x1 - B.x0, B.y1, B.d], r: 0.006, segs: q(2, 1, 1) });
  mapUV(bat, (p) => uvOf([p[0] + (B.x0 + B.x1) / 2, p[1] + B.y1 / 2]));
  bat.transform(place.mul(xf({ pos: [(B.x0 + B.x1) / 2, B.y1 / 2, 0] })));
  // 钻夹头（车削，轴朝 +x）、钻头
  const ax = place.mul(xf({ pos: [0.155, DRILL.axisY, 0], rot: [0, 0, -Math.PI / 2] }));
  sw(k.lathe({ name: 'drillChuck', mat: 'workshop', segs: q(14, 10, 6), profile: profile([[0.02, 0], [0.021, 0.006, sm], [0.021, 0.014, sm], [0.0185, 0.036, sm], [0.0135, 0.046], [0.009, 0.049]]), xf: ax }), 'blackPlastic');
  sw(k.lathe({ name: 'drillJaws', mat: 'workshop', segs: q(10, 8, 6), profile: profile([[0.009, 0.049], [0.0068, 0.056], [0.0035, 0.058], [0.0028, 0.058]]), xf: ax }), 'steelDark');
  rod(k, 'drillBit', [0.21, DRILL.axisY, 0], [0.272, DRILL.axisY, 0], 0.003, 'steel', { segs: q(8, 6, 4) }).transform(place);
  if (k.lod < 2) sw(k.lathe({ name: 'drillBitTip', mat: 'workshop', segs: q(8, 6), profile: profile([[0, 0], [0.003, 0.006]]), xf: place.mul(xf({ pos: [0.278, DRILL.axisY, 0], rot: [0, 0, Math.PI / 2] })) }), 'steel');
  // 扳机、正反转按钮
  sw(k.box({ name: 'drillTrigger', mat: 'workshop', size: [0.012, 0.026, 0.016], r: q(0.003, 0.002, 0), segs: q(1, 1, 0), xf: place.mul(xf({ pos: [0.109, 0.118, 0], rot: [0, 0, -0.2] })) }), 'blackPlastic');
  if (k.lod < 2) sw(k.box({ name: 'drillSwitch', mat: 'workshop', size: [0.012, 0.008, DRILL.depth + 0.008], r: 0.002, segs: 1, xf: place.mul(xf({ pos: [0.103, 0.146, 0] })) }), 'blackPlastic');
}
