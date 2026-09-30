import { profile, circle, rect } from '../core/shape.js';
import { xf } from '../core/vec.js';
import { barberUV, barberSwatch } from '../materials/atlas.js';
import { sw, put, rod, tube, turned, bottle, mapUV, aim, catmull, tuft, seamNodes } from './parts.js';

// 后仰洗头台：靠墙一个黑色的柜子，上面一只白瓷洗头盆（椭圆、往前倾，前沿压下去一道放脖子的 U 形口，口上垫着黑色的软胶枕），
// 盆后面一个镀铬的鹅颈龙头和一个插在座里的手持花洒（黑色软管），两个角上各一瓶洗发水和护发素；
// 前面连着一把酒红皮面的洗头椅：靠背往后仰 35°，客人躺下去脖子正好搁在盆口上；黑色的底座、镀铬扶手、皮扶手垫。
// 墙上（盆的正上方）挂着一块搪瓷价目牌。
// 原点在墙根（z = 0 是墙面）、柜子宽度的中点，椅子朝 +z。
const sm = { smooth: true };
const CAB = { w: 0.62, d: 0.42, h: 0.78 };
const BASIN = { rx: 0.28, rz: 0.23, zc: 0.3, tilt: 0.14, dip: 0.055, notch: 0.42 };
const CHAIR = { pivot: [0, 0.5, 0.92], tilt: (35 * Math.PI) / 180, back: 0.52, seat: [0.5, 0.1, 0.46] };
const SIGN = { w: 0.6, h: 0.3, y: 1.62 };
const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// 洗头盆的形变（车削出来的圆盆 → 椭圆，前沿压下去一道 U 形口）
function basinShape(p) {
  const phi = Math.atan2(p[0], p[2]), w = Math.exp(-((phi / BASIN.notch) ** 2));
  return [p[0], p[1] - BASIN.dip * w * sstep(0.09, 0.18, p[1]), p[2] * (BASIN.rz / BASIN.rx)];
}
const BASIN_XF = xf({ pos: [0, CAB.h, BASIN.zc], rot: [BASIN.tilt, 0, 0] });

export default {
  id: 'shampoo_station',
  name: '洗头台',
  nameEn: 'Backwash Shampoo Unit',
  category: 'barber',
  planes: ['floor', 'wall'],
  aoDensity: 170,
  shadow: {
    floor: { margin: 0.16, maxDist: 0.5, density: 80 },
    wall: { margin: 0.12, maxDist: 0.3, density: 60, strength: 0.6 },
  },
  view: { el: 16, az: 32 },
  build(k) {
    const q = (...v) => k.q(...v);
    // —— 柜子和地上的连接底板 ——
    sw(k.box({ name: 'cabinet', mat: 'barber', size: [CAB.w, CAB.h, CAB.d], r: 0.012, segs: q(2, 1, 1), omit: ['ny', 'nz'], xf: xf({ pos: [0, CAB.h / 2, CAB.d / 2] }) }), 'black');
    sw(k.box({ name: 'floorPlate', mat: 'barber', size: [0.4, 0.04, CHAIR.pivot[2] - CAB.d + 0.1], r: 0.01, segs: q(1, 1, 0), omit: ['ny'], xf: xf({ pos: [0, 0.02, (CAB.d + CHAIR.pivot[2] + 0.1) / 2] }) }), 'black');

    // —— 洗头盆 ——
    {
      const basin = k.lathe({ name: 'basin', mat: 'ceramic', segs: q(40, 26, 16), profile: profile([
        [0, 0], [0.16, 0, sm], [0.25, 0.1, sm], [0.275, 0.16, sm], [0.28, 0.175, sm], [0.272, 0.182, sm], [0.258, 0.176, sm],
        [0.238, 0.12, sm], [0.16, 0.045, sm], [0.04, 0.022, sm], [0, 0.02],
      ]) });
      basin.deform(basinShape);
      basin.transform(BASIN_XF);
      turned(k, 'drain', [[0, 0], [0.028, 0], [0.03, 0.002, sm], [0.022, 0.004], [0, 0.0045]], 'chrome', { segs: q(12, 8, 6), place: BASIN_XF.mul(xf({ pos: [0, 0.019, 0] })) });
      // 颈枕：沿 U 形口的底走一道圆截面的软胶
      const n = q(8, 6, 4), path = [];
      for (let i = 0; i <= n; i++) {
        const phi = -0.34 + (0.68 * i) / n;
        path.push(BASIN_XF.apply(basinShape([0.266 * Math.sin(phi), 0.194, 0.266 * Math.cos(phi)])));
      }
      // 扁的截面：沿盆沿方向宽、上下薄
      sw(k.sweep({ name: 'neckRest', mat: 'barber', shape: circle(0.02, q(10, 8, 6), { rx: 0.024, ry: 0.013 }), path: catmull(path, 2), caps: [true, true], up: [0, 1, 0] }), 'neckPad');
    }

    // —— 龙头、手持花洒、两瓶洗护 ——
    {
      const y = CAB.h, z = 0.04;
      turned(k, 'tapBase', [[0, 0], [0.028, 0], [0.028, 0.012, sm], [0.016, 0.02], [0, 0.021]], 'chrome', { segs: q(14, 10, 6), place: xf({ pos: [0, y, z] }) });
      tube(k, 'spout', [[0, y + 0.01, z], [0, y + 0.24, z], [0, y + 0.24, z + 0.16], [0, y + 0.19, z + 0.17]], 0.011, 'chrome', { bend: 0.06, n: q(6, 4, 2), segs: q(10, 8, 6) });
      for (const s of [-1, 1]) {
        turned(k, `tapValve${s > 0 ? 'R' : 'L'}`, [[0, 0], [0.018, 0], [0.018, 0.03, sm], [0.012, 0.04], [0, 0.041]], 'chrome', { segs: q(12, 8, 6), place: xf({ pos: [s * 0.08, y, z] }) });
        if (k.lod < 2) rod(k, `tapLever${s > 0 ? 'R' : 'L'}`, [s * 0.08, y + 0.04, z], [s * 0.13, y + 0.06, z + 0.03], 0.005, 'chrome', { segs: q(6, 5, 4) });
      }
      // 手持花洒：插在座里，软管从柜面上的孔出来，绕一小弯
      const hc = [0.175, y, 0.035];
      turned(k, 'showerCup', [[0, 0], [0.024, 0], [0.024, 0.028, sm], [0.02, 0.03], [0.02, 0.012]], 'chrome', { segs: q(12, 8, 6), place: xf({ pos: hc }) });
      turned(k, 'shower', [[0, 0], [0.012, 0], [0.014, 0.1, sm], [0.028, 0.14, sm], [0.03, 0.155, sm], [0.022, 0.162], [0, 0.163]], 'chrome', { segs: q(14, 10, 6), place: xf({ pos: [hc[0], y + 0.012, hc[2]], rot: [-0.12, 0, 0] }) });
      const hose = catmull([[0.11, y, 0.03], [0.11, y + 0.04, 0.03], [0.14, y + 0.06, 0.06], [0.175, y + 0.02, 0.05], [0.175, y + 0.008, 0.036]], q(4, 3, 2));
      sw(k.sweep({ name: 'hose', mat: 'barber', shape: circle(0.006, q(6, 5, 4)), path: hose, caps: [false, false], up: [0, 1, 0] }), 'hose');
      for (const [id, x, zz] of [['shampoo', -0.262, 0.065], ['conditioner', 0.268, 0.075]]) {
        bottle(k, id, id, { place: xf({ pos: [x, y, zz], rot: [0, x < 0 ? 0.4 : -0.4, 0] }) });
        // 泵头：一截镀铬的泵杆、黑色的按压头和出液嘴（朝外）
        const top = y + 0.233;
        rod(k, `${id}Stem`, [x, top - 0.004, zz], [x, top + 0.022, zz], 0.004, 'chrome', { segs: q(6, 5, 4), caps: [false, true] });
        sw(k.box({ name: `${id}Pump`, mat: 'barber', size: [0.03, 0.016, 0.03], r: 0.006, segs: q(2, 1, 1), xf: xf({ pos: [x, top + 0.03, zz] }) }), 'black');
        if (k.lod < 2) rod(k, `${id}Nozzle`, [x, top + 0.032, zz], [x - Math.sign(x) * 0.045, top + 0.028, zz + 0.012], 0.0045, 'black', { segs: q(6, 5, 4) });
      }
    }

    // —— 洗头椅：黑色底座、皮座垫、后仰的皮靠背和黑色背壳、镀铬扶手和皮扶手垫 ——
    {
      const [sw0, st, sd] = CHAIR.seat, zs = CHAIR.pivot[2] + sd / 2;
      sw(k.box({ name: 'chairBase', mat: 'barber', size: [0.42, 0.4, 0.44], r: 0.02, segs: q(2, 1, 1), omit: ['ny'], xf: xf({ pos: [0, 0.2, zs + 0.01] }) }), 'black');
      sw(k.box({ name: 'chairKick', mat: 'barber', size: [0.43, 0.02, 0.45], r: 0.006, segs: q(1, 1, 0), omit: ['ny'], xf: xf({ pos: [0, 0.05, zs + 0.01] }) }), 'chrome');
      const seams = [-0.15, -0.05, 0.05, 0.15];
      k.box({
        name: 'seat', mat: 'leather_oxblood', size: [sw0, st, sd], r: 0.04, segs: q(3, 2, 1), omit: ['ny'],
        div: [k.lod < 2 ? seamNodes(sw0 / 2 - 0.04, seams, q(10, 6), 0.009, k.lod > 0) : 1, 1, q(6, 4, 1)],
        deform: tuft([sw0 / 2, st / 2, sd / 2], { n: 1, across: 0, seams, depth: 0.011, w: 0.009, puff: 0.018 }),
        xf: xf({ pos: [0, 0.4 + st / 2, zs] }),
      });
      const place = xf({ pos: CHAIR.pivot, rot: [-CHAIR.tilt, 0, 0] }), parts = [];
      const bw = 0.48, bt = 0.09, bseams = [-0.144, -0.048, 0.048, 0.144];
      parts.push(k.box({
        name: 'back', mat: 'leather_oxblood', size: [bw, CHAIR.back, bt], r: 0.04, segs: q(3, 2, 1), omit: ['nz'],
        div: [k.lod < 2 ? seamNodes(bw / 2 - 0.04, bseams, q(10, 6), 0.009, k.lod > 0) : 1, q(6, 4, 1), 1],
        deform: tuft([bw / 2, CHAIR.back / 2, bt / 2], { n: 2, across: 0, seams: bseams, depth: 0.011, w: 0.009, puff: 0.018 }),
        xf: xf({ pos: [0, CHAIR.back / 2, -bt / 2] }),
      }));
      parts.push(sw(k.box({ name: 'backShell', mat: 'barber', size: [bw + 0.03, CHAIR.back + 0.02, 0.04], r: 0.016, segs: q(2, 1, 1), xf: xf({ pos: [0, CHAIR.back / 2, -bt - 0.018] }) }), 'black'));
      put(parts, place);
      // 靠背和座垫之间的铰链座（黑色），扶手
      sw(k.box({ name: 'hinge', mat: 'barber', size: [0.44, 0.08, 0.1], r: 0.02, segs: q(2, 1, 1), xf: xf({ pos: [0, 0.44, CHAIR.pivot[2] - 0.03] }) }), 'black');
      for (const s of [-1, 1]) {
        const x = s * (sw0 / 2 + 0.03), tag = s > 0 ? 'R' : 'L';
        tube(k, `arm${tag}`, [[x, 0.42, zs + sd / 2 - 0.04], [x, 0.66, zs + sd / 2 - 0.03], [x, 0.66, CHAIR.pivot[2] + 0.02], [x, 0.46, CHAIR.pivot[2] - 0.02]], 0.011, 'chrome', { bend: 0.05, n: q(4, 3, 1), segs: q(9, 7, 5) });
        k.box({ name: `armPad${tag}`, mat: 'leather_oxblood', size: [0.065, 0.035, 0.34], r: 0.016, segs: q(2, 1, 1), xf: xf({ pos: [x, 0.684, zs + 0.03] }) });
      }
    }

    // —— 墙上的价目牌（搪瓷）——
    {
      const b = k.box({ name: 'sign', mat: 'barber', size: [SIGN.w, SIGN.h, 0.01], r: 0.003, segs: q(1, 1, 0), omit: ['nz'], xf: xf({ pos: [0, SIGN.y, 0.006] }) });
      const edge = barberSwatch('red');
      mapUV(b, (p, n) => (n[2] > 0.7 ? barberUV('sign', (p[0] + SIGN.w / 2) / SIGN.w, 1 - (p[1] - (SIGN.y - SIGN.h / 2)) / SIGN.h) : edge));
    }
  },
};
