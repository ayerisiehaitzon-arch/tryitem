import { shape, profile, rect } from '../core/shape.js';
import { xf } from '../core/vec.js';
import { WORKSHOP_ATLAS, workshopUV, workshopSwatch } from '../materials/atlas.js';
import { SAW, sawBlade } from './layout.js';
import { sw, mapUV, pencil, loopHandle, ccw } from './parts.js';

// 锯木架：两只松木锯木架（2×4 的横梁立着放，四条腿往两边撇开，两头各一块三角形的撑板），
// 上面架着一块 2.44m 长的松木板：离左头 1.62m 画着铅笔线（保留那边写着 1620，废料那边打了叉），
// 一把手锯卡在锯了一半的锯口里 —— 锯把朝前上方、斜 45°，锯口从木板背边锯进来 13cm；
// 锯口底下的地上一小堆锯末，旁边地上一块早先锯下来的短料，木板上搁着一支铅笔。
// 原点在两只锯木架中间的地面上，木板沿 x，正面朝 +z。
const HORSE = { xs: [-0.45, 0.45], top: 0.66, beam: [0.045, 0.09, 0.8], leg: [0.038, 0.064], legZ: [0.3, 0.37], legX: 0.23 };
const PK = WORKSHOP_ATLAS.plank;
const X0 = -1.1;                          // 木板左端
const YT = HORSE.top + PK.t;              // 木板顶面
const XK = X0 + PK.cut + 0.0014;          // 锯口（铅笔线右边一点）

export default {
  id: 'sawhorses',
  name: '锯木架',
  nameEn: 'Sawhorses with Plank and Handsaw',
  category: 'workshop',
  aoDensity: 260,
  shadow: { margin: 0.15, maxDist: 0.8, density: 180 },
  view: { el: 22, az: 38 },
  build(k) {
    const q = (...v) => k.q(...v);
    const sm = { smooth: true };

    // —— 两只锯木架 ——
    HORSE.xs.forEach((hx, h) => horse(k, `horse${h}`, hx));

    // —— 木板：四个面按 WORKSHOP_ATLAS.plank 的四条贴，两头是端面的颜色 ——
    {
      const pl = k.box({ name: 'plank', mat: 'workshop', size: [PK.len, PK.t, PK.w], segs: 0 });
      const H = 2 * (PK.w + PK.t), end = workshopSwatch('pineEnd');
      mapUV(pl, (p, n) => {
        const u = (p[0] + PK.len / 2) / PK.len, zz = p[2] + PK.w / 2, dy = PK.t / 2 - p[1];
        if (n[1] > 0.7) return workshopUV('plank', u, zz / H);
        if (n[1] < -0.7) return workshopUV('plank', u, (PK.w + 2 * PK.t + zz) / H);
        if (n[2] > 0.7) return workshopUV('plank', u, (PK.w + dy) / H);
        if (n[2] < -0.7) return workshopUV('plank', u, (PK.w + PK.t + dy) / H);
        return end;
      });
      pl.transform(xf({ pos: [X0 + PK.len / 2, HORSE.top + PK.t / 2, 0] }));
    }

    // —— 手锯：锯身在 x = XK 的竖直平面里，齿线斜 45°（锯尖朝后下方）。齿线和木板顶面交在离背边 13cm 处 ——
    {
      const s = Math.SQRT1_2, zT = -PK.w / 2 + PK.kerf, toe = 0.09;
      // 锯的局部坐标：x 从锯尖到锯根、y 从齿线往上、z 是厚度；先沿 z 镜像（贴图正面朝 +x，对着镜头），再转到斜 45°
      const place = xf({ pos: [XK, YT - toe * s, zT - toe * s], rot: [-Math.PI / 4, 0, 0] }).mul(xf({ rot: [0, -Math.PI / 2, 0], mirror: 2 }));
      const blade = k.extrude({ name: 'sawBlade', mat: 'workshop', shape: shape(sawBlade()), depth: SAW.t, center: true, bevel: 0 });
      const R = WORKSHOP_ATLAS.saw, steel = workshopSwatch('steel');
      mapUV(blade, (p, n) => (Math.abs(n[2]) > 0.7 ? workshopUV('saw', p[0] / R.w, (R.h - p[1]) / R.h) : steel));
      blade.transform(place);
      sw(loopHandle(k, 'sawHandle', { mat: 'workshop', outer: SAW.handle, hole: SAW.grip, t: SAW.handleT, r: 0.0065, n: q(30, 20, 12), place }), 'rosewood');
      // 三颗黄铜锯钉（两面）
      if (k.lod < 2) {
        for (const [i, [nx, ny]] of [[0.414, 0.022], [0.418, 0.092], [0.47, 0.121]].entries()) {
          for (const sz of [-1, 1]) {
            sw(k.lathe({ name: `sawNut${i}${sz > 0 ? 'A' : 'B'}`, mat: 'workshop', segs: q(10, 6), profile: profile([[0.0068, 0], [0.0068, 0.001, sm], [0, 0.0016]]), xf: place.mul(xf({ pos: [nx, ny, sz * SAW.handleT / 2], rot: [sz * Math.PI / 2, 0, 0] })) }), 'brass');
          }
        }
      }
    }

    // —— 锯口底下的一堆锯末（压扁的一个小丘，边上不规则）——
    {
      const pile = k.lathe({ name: 'sawdust', mat: 'sawdust', grain: 'planar', segs: q(20, 14, 8), profile: profile([[0.105, 0], [0.1, 0.005, sm], [0.08, 0.013, sm], [0.05, 0.024, sm], [0.024, 0.032, sm], [0, 0.035]]) });
      pile.deform(([x, y, z]) => {
        const a = Math.atan2(z, x), f = 1 + 0.16 * Math.sin(3 * a + 0.5) + 0.08 * Math.sin(5 * a + 2);
        return [x * f * 1.3, y * (1 + 0.18 * Math.cos(2 * a + 1)), z * f * 0.85];
      });
      pile.transform(xf({ pos: [XK + 0.01, 0, -0.035] }));
      if (k.lod < 2) {
        const bits = [[0.19, 0.06], [-0.2, 0.1], [0.12, -0.16], [-0.16, -0.12], [0.26, -0.04]];
        bits.forEach(([dx, dz], i) => {
          const bit = k.lathe({ name: `sawdustBit${i}`, mat: 'sawdust', grain: 'planar', segs: q(9, 6), profile: profile([[0.017, 0], [0.0155, 0.0035, sm], [0.009, 0.0055, sm], [0, 0.006]]) });
          bit.deform(([x, y, z]) => { const a = Math.atan2(z, x), f = 1 + 0.28 * Math.sin(2 * a + i * 1.7) + 0.12 * Math.sin(3 * a + i); return [x * f, y, z * f * 0.8]; });
          bit.transform(xf({ pos: [XK + dx, 0, -0.035 + dz], rot: [0, i * 0.9, 0] }));
        });
      }
    }

    // —— 地上的短料、木板上的铅笔 ——
    k.box({ name: 'offcut', mat: 'pine', size: [0.52, PK.t, 0.14], r: 0.0015, segs: q(1, 1, 0), grain: 'x', xf: xf({ pos: [0.98, PK.t / 2, 0.42], rot: [0, 0.55, 0] }) });
    pencil(k, 'pencil', { place: xf({ pos: [XK - 0.2, YT + 0.0037 * Math.cos(Math.PI / 6), 0.06], rot: [0, 1.25, 0] }).mul(xf({ rot: [0, 0, Math.PI / 2] })).mul(xf({ rot: [0, Math.PI / 6, 0] })) });
  },
};

// 一只锯木架：横梁（立着），四条腿从横梁两侧往外、往两头撇开，两头各一块梯形撑板贴在腿外面
function horse(k, name, hx) {
  const q = (...v) => k.q(...v);
  const { top, beam, leg, legZ, legX } = HORSE;
  k.box({ name: `${name}Beam`, mat: 'pine', size: beam, r: 0.002, segs: q(1, 1, 0), grain: 'z', xf: xf({ pos: [hx, top - beam[1] / 2, 0] }) });
  const ya = top - 0.012, yb = 0.009, xa = beam[0] / 2 + leg[0] / 2;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const a = [hx + sx * xa, ya, sz * legZ[0]], b = [hx + sx * legX, yb, sz * legZ[1]];
    k.sweep({ name: `${name}Leg${sx > 0 ? 'R' : 'L'}${sz > 0 ? 'F' : 'B'}`, mat: 'pine', shape: rect(leg[0], leg[1]), path: [a, b], up: [0, 0, 1] });
  }
  // 撑板：跟着腿往外斜一点
  const tilt = Math.atan2(legZ[1] - legZ[0], ya - yb), yc = 0.465;
  const legXAt = (y) => xa + (legX - xa) * (ya - y) / (ya - yb) + leg[0] / 2;
  const pts = [[-legXAt(0.33), 0.33 - yc], [legXAt(0.33), 0.33 - yc], [legXAt(0.6), 0.6 - yc], [-legXAt(0.6), 0.6 - yc]];
  for (const sz of [-1, 1]) {
    const z = sz * (legZ[0] + (legZ[1] - legZ[0]) * (ya - yc) / (ya - yb) + leg[1] / 2 + 0.006);
    k.extrude({ name: `${name}Gusset${sz > 0 ? 'F' : 'B'}`, mat: 'pine', shape: shape(ccw(pts)), depth: 0.012, center: true, bevel: 0.0015, grain: 'across', xf: xf({ pos: [hx, yc, z], rot: [-sz * tilt, 0, 0] }) });
  }
}
