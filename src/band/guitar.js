import { shape, profile, circle } from '../core/shape.js';
import { xf } from '../core/vec.js';
import { BAND_ATLAS, bandUV, bandSwatch } from '../materials/atlas.js';
import { sw, mapUV, tube, pipe, lerp3 } from './parts.js';
import { ccw } from '../gym2/parts.js';
import {
  bodyOutline, guardOutline, headOutline, BODY, NUT, BRIDGE, FRETS, fretY, BOARD, boardHalf, Z, TUNERS, stringX,
} from './outline.js';

// 电吉他 + 琴架：一把三色日落渐变的单线圈电吉他，靠在一只黑色的三脚琴架上。
//   · 琴身：共用轮廓（outline.js）挤出 4.5cm，四周倒 9mm 的圆；整块按正面平面贴日落色（边上深褐 → 红 → 中间琥珀，
//     底下透出赤杨木的直纹），侧面和背面自然取到轮廓边上的深色；
//   · 白色护板、三个单线圈拾音器（每个六颗磁柱）、琴桥（钢板 + 六个弦鞍）和摇把、三个钟形旋钮、输出口、背带扣；
//   · 琴颈是一串 D 形截面的放样（从琴颈槽一直到琴头下面，越往上越薄越窄），上面一块玫瑰木指板（贴图里有品位缝和贝母圆点），
//     21 根品丝、骨头的上弦枕；琴头是轮廓挤出，按平面贴枫木和标；六个弦轴排在低音侧，弦钮从琴头边上伸出去；
//   · 六根弦：从琴桥后面穿出来，搭过弦鞍、上弦枕，拐到各自的弦轴上；
//   · 吉他往后靠 15°：琴身底边坐在琴架的托臂上，琴颈架在顶上的 U 形叉里。原点在琴架中心的地面，琴的正面朝 +z。
const LEAN = 0.26;
const G = xf({ pos: [0, 0.2, 0.07], rot: [-LEAN, 0, 0] });

export default {
  id: 'electric_guitar',
  name: '电吉他',
  nameEn: 'Sunburst Electric Guitar on Stand',
  category: 'band',
  aoDensity: 320,
  shadow: { margin: 0.12, maxDist: 0.6, density: 110 },
  view: { el: 10, az: 24 },
  build(k) {
    const q = (...v) => k.q(...v);
    const sm = { smooth: true };
    const put = (p) => p.transform(G);

    // —— 琴身 ——
    {
      const pts = bodyOutline(q(3, 2, 1));
      const sh = shape(ccw(pts.map(([x, y], i) => [x, y, i === 0 || i === pts.length - 1 ? {} : sm])));
      const b = k.extrude({ name: 'body', mat: 'band', shape: sh, depth: BODY.T, axis: 'z', center: true, bevel: { w: 0.009, h: 0.009 }, bsegs: q(2, 2, 1) });
      const B = BAND_ATLAS.body;
      mapUV(b, (v) => bandUV('body', (v[0] - B.x0) / (B.x1 - B.x0), (B.y1 - v[1]) / (B.y1 - B.y0)));
      put(b);
    }
    // —— 护板 ——
    put(sw(k.extrude({ name: 'guard', mat: 'band', shape: shape(ccw(guardOutline(q(3, 2, 1)).map(([x, y]) => [x, y, sm]))), depth: 0.0025, axis: 'z', xf: xf({ pos: [0, 0, Z.body] }) }), 'guardWhite'));

    // —— 琴颈：D 形截面放样 ——
    {
      const ys = [BOARD.end, 0.33, 0.45, 0.6, NUT, NUT + 0.022];
      const n = q(14, 10, 8);
      const rings = ys.map((y, idx) => {
        const last = idx === ys.length - 1;
        const w = last ? boardHalf(NUT) * 0.98 : boardHalf(Math.min(NUT, y));
        const d = last ? 0.0145 : 0.021 + (0.003 * (NUT - Math.min(NUT, y))) / (NUT - BOARD.end);
        const ring = [];
        const nt = 3;
        for (let j = 0; j < nt; j++) ring.push([w - (2 * w * j) / nt, y, Z.neck]);
        for (let j = 0; j < n - nt; j++) {
          const a = Math.PI + (Math.PI * j) / (n - nt);
          ring.push([w * Math.cos(a), y, Z.neck + d * Math.sin(a)]);
        }
        return ring;
      });
      put(sw(k.loft({ name: 'neck', mat: 'band', rings, caps: [true, false] }), 'maple'));
    }
    // —— 指板（玫瑰木）、品丝、上弦枕 ——
    {
      const hE = boardHalf(BOARD.end), hN = boardHalf(NUT);
      const fb = k.extrude({ name: 'board', mat: 'band', shape: shape(ccw([[-hE, BOARD.end], [hE, BOARD.end], [hN, NUT], [-hN, NUT]])), depth: BOARD.t, axis: 'z', xf: xf({ pos: [0, 0, Z.neck] }) });
      mapUV(fb, (v) => bandUV('board', (NUT - v[1]) / (NUT - BOARD.end), Math.min(1, Math.max(0, (v[0] + BAND_ATLAS.board.w / 2) / BAND_ATLAS.board.w))));
      put(fb);
      if (k.lod < 2) {
        for (let i = 1; i <= FRETS; i++) {
          const y = fretY(i);
          put(sw(k.box({ name: `fret${i}`, mat: 'band', size: [2 * boardHalf(y), 0.0024, 0.0013], segs: 0, omit: ['nz'], xf: xf({ pos: [0, y, Z.board + 0.00065] }) }), 'nickel'));
        }
      }
      put(sw(k.box({ name: 'nut', mat: 'band', size: [2 * hN + 0.001, 0.0045, 0.0085], r: q(0.001, 0), segs: q(1, 0), xf: xf({ pos: [0, NUT - 0.0022, Z.neck + 0.0042] }) }), 'bone'));
    }
    // —— 琴头 ——
    {
      const pts = headOutline(q(3, 2, 1));
      const sh = shape(ccw(pts.map(([x, y], i) => [x, y, i === 0 || i === pts.length - 1 ? {} : sm])));
      const hd = k.extrude({ name: 'head', mat: 'band', shape: sh, depth: 0.014, axis: 'z', bevel: q(0.0018, 0.0015, 0), bsegs: 1, xf: xf({ pos: [0, 0, Z.neck - 0.014] }) });
      const H = BAND_ATLAS.head;
      // 背面没有标：取琴头贴图里低音侧边上那一条（只有木纹）
      mapUV(hd, (v, nn) => bandUV('head', Math.min(1, Math.max(0, (v[1] - NUT) / H.len)), nn[2] < -0.5 ? 0.03 : Math.min(1, Math.max(0, (v[0] - H.x0) / (H.x1 - H.x0)))));
      put(hd);
      // 弦轴：琴头正面一根镀铬的柱子，背面一个齿轮盒，弦钮从低音侧伸出去
      TUNERS.forEach(([x, y], i) => {
        const up = xf({ pos: [x, y, Z.neck], rot: [Math.PI / 2, 0, 0] });
        put(sw(k.lathe({ name: `post${i}`, mat: 'band', segs: q(8, 6, 4), profile: profile([[0.0056, 0], [0.0056, 0.0016], [0.0036, 0.002], [0.0036, 0.0105, sm], [0, 0.011]]), xf: up }), 'chrome'));
        if (k.lod < 2) put(sw(k.box({ name: `gear${i}`, mat: 'band', size: [0.016, 0.013, 0.009], segs: 0, omit: ['pz'], xf: xf({ pos: [x - 0.003, y, Z.neck - 0.014 - 0.0045] }) }), 'chrome'));
        const kx = x - 0.028;
        put(sw(k.lathe({ name: `shaft${i}`, mat: 'band', segs: q(6, 4), profile: profile([[0.002, 0], [0.002, 0.018]]), xf: xf({ pos: [x - 0.008, y, Z.neck - 0.0185], rot: [0, 0, Math.PI / 2] }) }), 'chrome'));
        put(sw(k.box({ name: `key${i}`, mat: 'band', size: [0.016, 0.013, 0.0045], r: q(0.002, 0.0015, 0), segs: q(1, 1, 0), xf: xf({ pos: [kx, y, Z.neck - 0.0185] }) }), 'chrome'));
      });
    }

    // —— 拾音器、琴桥、摇把、旋钮 ——
    const zg = Z.body + 0.0025;   // 护板面
    for (const [nm, y, rot] of [['pickupN', 0.268, 0], ['pickupM', 0.213, -0.02], ['pickupB', 0.152, 0.12]]) {
      const pl = xf({ pos: [0, y, zg + 0.0055], rot: [0, 0, rot] });
      put(sw(k.box({ name: nm, mat: 'band', size: [0.071, 0.0178, 0.011], r: q(0.0035, 0.0025, 0), segs: q(2, 1, 0), omit: ['nz'], xf: pl }), 'pickupWhite'));
      if (k.lod === 0) {
        for (let i = 0; i < 6; i++) {
          put(sw(k.lathe({ name: `${nm}Pole${i}`, mat: 'band', segs: 6, profile: profile([[0.0024, 0], [0.0024, 0.0008], [0, 0.0009]]), xf: pl.mul(xf({ pos: [stringX(i, y) * 1.0, 0, 0.0055], rot: [Math.PI / 2, 0, 0] })) }), 'nickel'));
        }
      }
    }
    const zs = { nut: Z.board + 0.002, bridge: 0.0405 };
    // 琴桥：直接坐在琴身上（护板在这里开了个缺口）
    const zb = Z.body;
    put(sw(k.box({ name: 'bridgePlate', mat: 'band', size: [0.068, 0.046, 0.003], r: q(0.001, 0), segs: q(1, 0), omit: ['nz'], xf: xf({ pos: [0, BRIDGE - 0.006, zb + 0.0015] }) }), 'chrome'));
    for (let i = 0; i < 6; i++) {
      const hgt = zs.bridge - 0.0005 - (zb + 0.003);
      put(sw(k.box({ name: `saddle${i}`, mat: 'band', size: [0.0095, 0.013, hgt], segs: 0, omit: ['nz'], xf: xf({ pos: [stringX(i, BRIDGE), BRIDGE - 0.002, zb + 0.003 + hgt / 2] }) }), 'chrome'));
    }
    if (k.lod < 2) {
      put(pipe(k, 'tremArm', [[0.03, BRIDGE - 0.02, Z.body + 0.004], [0.036, BRIDGE - 0.026, Z.body + 0.02], [0.07, BRIDGE - 0.06, Z.body + 0.028], [0.12, BRIDGE - 0.1, Z.body + 0.03]], 0.0018, 'chrome', { segs: q(6, 4) }));
      put(sw(k.lathe({ name: 'tremTip', mat: 'band', segs: q(8, 6), profile: profile([[0, 0], [0.0035, 0.002, sm], [0.0035, 0.018, sm], [0, 0.02]]), xf: xf({ pos: [0.12, BRIDGE - 0.1, Z.body + 0.03], rot: [0, 0, -2.25] }) }), 'knobWhite'));
    }
    [[0.058, 0.128], [0.078, 0.103], [0.098, 0.078]].forEach(([x, y], i) => {
      put(sw(k.lathe({ name: `knob${i}`, mat: 'band', segs: q(12, 8, 6), profile: profile([[0.0115, 0], [0.0112, 0.012, sm], [0.0095, 0.0168, sm], [0, 0.0182]]), xf: xf({ pos: [x, y, zg], rot: [Math.PI / 2, 0, 0] }) }), 'knobWhite'));
    });
    if (k.lod < 2) {
      put(sw(k.box({ name: 'switchTip', mat: 'band', size: [0.006, 0.013, 0.011], r: 0.0025, segs: q(2, 1), xf: xf({ pos: [0.071, 0.168, zg + 0.0055], rot: [0, 0, 0.35] }) }), 'knobWhite'));
      put(sw(k.lathe({ name: 'jack', mat: 'band', segs: q(10, 8), profile: profile([[0.0115, 0], [0.0105, 0.002, sm], [0.006, 0.0026], [0.006, -0.004]]), xf: xf({ pos: [0.128, 0.056, Z.body], rot: [Math.PI / 2, 0, 0] }) }), 'chrome'));
      // 背带扣：琴身底边一个、低音侧琴角尖上一个
      put(sw(k.lathe({ name: 'strapB', mat: 'band', segs: q(8, 6), profile: profile([[0.004, 0], [0.004, 0.004], [0.007, 0.007, sm], [0, 0.0085]]), xf: xf({ pos: [0, 0.001, 0], rot: [Math.PI, 0, 0] }) }), 'chrome'));
      put(sw(k.lathe({ name: 'strapT', mat: 'band', segs: q(8, 6), profile: profile([[0.004, 0], [0.004, 0.004], [0.007, 0.007, sm], [0, 0.0085]]), xf: xf({ pos: [-0.136, 0.449, 0], rot: [0, 0, 0.35] }) }), 'chrome'));
    }

    // —— 六根弦：琴桥后面穿出来 → 弦鞍 → 上弦枕 → 弦轴 ——
    if (k.lod < 2) {
      for (let i = 0; i < 6; i++) {
        const r = 0.00055 - i * 0.00005;
        const xb = stringX(i, BRIDGE), xn = stringX(i, NUT), [tx, ty] = TUNERS[i];
        const path = [[xb, BRIDGE - 0.022, zb + 0.003], [xb, BRIDGE, zs.bridge], [xn, NUT, zs.nut], [tx + 0.0038, ty, Z.neck + 0.007]];
        put(pipe(k, `string${i}`, path, r, 'steel', { segs: 3, caps: [false, false], up: [0, 0, 1] }));
      }
    }

    // —— 琴架：黑色的三脚架，两只带橡胶套的托臂托住琴身底边，一根立杆顶上一个 U 形叉架住琴颈 ——
    stand(k, G);
  },
};

function stand(k, G) {
  const q = (...v) => k.q(...v);
  const hub = [0, 0.25, -0.07];
  // 三条腿：两条往前外八，一条往后
  const feet = [[-0.2, 0.015, 0.16], [0.2, 0.015, 0.16], [0, 0.015, -0.3]];
  feet.forEach((f, i) => {
    tube(k, `standLeg${i}`, hub, f, 0.0075, 'blackHw', { caps: [true, false] });
    if (k.lod < 2) tube(k, `standFoot${i}`, lerp3(hub, f, 0.92), f, 0.011, 'rubber');
  });
  sw(k.box({ name: 'standHub', mat: 'band', size: [0.05, 0.05, 0.05], r: q(0.008, 0.006, 0), segs: q(2, 1, 0), xf: xf({ pos: hub }) }), 'blackHw');
  // 托臂：从中间往前伸，末端往上翘，套着橡胶；琴身底边（吉他 y = 0）坐在上面
  for (const s of [-1, 1]) {
    const tip = G.apply([s * 0.085, -0.004, 0.0]);
    const lip = G.apply([s * 0.085, 0.012, BODY.T / 2 + 0.01]);
    pipe(k, `standArm${s > 0 ? 'R' : 'L'}`, [hub, [s * 0.06, tip[1] - 0.02, tip[2] - 0.04], [tip[0], tip[1] - 0.012, tip[2] - 0.01], [lip[0], tip[1] - 0.004, lip[2] + 0.004], lip], 0.007, 'blackHw');
    if (k.lod < 2) pipe(k, `standPad${s > 0 ? 'R' : 'L'}`, [[tip[0], tip[1] - 0.009, tip[2] - 0.012], [lip[0], tip[1] - 0.001, lip[2] + 0.004], [lip[0], lip[1], lip[2]]], 0.0095, 'rubber');
  }
  // 立杆和 U 形叉：叉底托着琴颈的背面（吉他 y = 0.66）
  const neckBack = G.apply([0, 0.66, Z.neck - 0.024]);
  const top = [0, neckBack[1] - 0.05, neckBack[2] - 0.035];
  tube(k, 'standPost', hub, top, 0.0095, 'blackHw');
  for (const s of [-1, 1]) {
    const a = G.apply([s * 0.034, 0.66, Z.neck - 0.028]), b = G.apply([s * 0.036, 0.66, Z.neck + 0.012]);
    pipe(k, `standFork${s > 0 ? 'R' : 'L'}`, [top, [s * 0.03, top[1] + 0.012, top[2] + 0.01], a, b], 0.0055, 'blackHw');
    if (k.lod < 2) tube(k, `standForkPad${s > 0 ? 'R' : 'L'}`, a, b, 0.008, 'rubber');
  }
  if (k.lod < 2) tube(k, 'standCradle', G.apply([-0.034, 0.66, Z.neck - 0.03]), G.apply([0.034, 0.66, Z.neck - 0.03]), 0.0075, 'rubber');
}
