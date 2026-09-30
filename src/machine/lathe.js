import { shape, profile, rect, circle } from '../core/shape.js';
import { xf } from '../core/vec.js';
import { mechUV } from '../materials/atlas.js';
import { sw, put, rod, tube, turned, ballKnob, handwheel, collar, mapUV, frame, ccw, catmull } from './parts.js';

// 车床：一台 10 寸的普通车床立在钢柜底座上，靠墙摆。
//   · 底座是两个灰绿色锤纹漆的柜子（左边一扇门、右边三个抽屉），上面一个接铁屑的盘子，背后一块挡屑板；
//   · 床身：铸铁床身，上面前面一道 V 形导轨、后面一道平导轨（磨光的钢）；床身前面一根丝杠、一根光杠；
//   · 主轴箱（左）：正面一块机床铭牌、调速旋钮和刻度盘、开关面板（绿色开、红色停）、两根变速手柄；
//     下面是进给箱，正面贴着螺纹 / 进给表；三爪卡盘夹着一根钢棒；
//   · 溜板箱和大拖板（手轮、开合螺母手柄），中拖板、小刀架（手轮和刻度环），四方刀架上夹着车刀 ——
//     刀尖正在车钢棒的台阶，一卷回火色的车屑从刀尖卷出来，铁屑盘里还躺着几卷；
//   · 尾座（右）：套筒顶着一个回转顶尖，顶住钢棒的另一头，右边一个手轮；
//   · 挡屑板上一盏鹅颈工作灯照着刀尖（灯泡自发光），一张黄色警示贴；铁屑盘里一把卡盘扳手。
// 原点在墙根（z = 0 是墙面）、车床长度的中点，操作的一面朝 +z。
const ZC = 0.3;                     // 车床中心线离墙的距离（最后整体往前挪）
const Y = { tray: 0.76, bed: 0.8, bedTop: 0.98, axis: 1.1, head: 1.24 };
const SP = [0, Y.axis, 0];          // 主轴中心线上的一点（x 另给）
const sm = { smooth: true };

export default {
  id: 'metal_lathe',
  name: '车床',
  nameEn: 'Metal Lathe on Cabinet Stand',
  category: 'machine',
  planes: ['floor', 'wall'],
  aoDensity: 220,
  shadow: {
    floor: { margin: 0.16, maxDist: 0.5, density: 90 },
    wall: { margin: 0.12, maxDist: 0.35, density: 70, strength: 0.7 },
  },
  view: { el: 16, az: 20 },
  build(k) {
    const q = (...v) => k.q(...v);
    const HT = 'hammertone';
    const cast = (name, size, pos, { r = 0.012, omit = [] } = {}) => k.box({ name, mat: HT, size, r, segs: q(2, 1, 1), omit, xf: xf({ pos }) });

    // —— 底座：两个柜子、踢脚、柜门 / 抽屉 ——
    for (const [tag, x0, x1] of [['L', -0.72, -0.3], ['R', 0.3, 0.72]]) {
      const xc = (x0 + x1) / 2, w = x1 - x0;
      sw(k.box({ name: `plinth${tag}`, mat: 'mech', size: [w - 0.03, 0.05, 0.44], segs: 0, omit: ['ny', 'py'], xf: xf({ pos: [xc, 0.025, 0] }) }), 'blackMatte');
      cast(`cabinet${tag}`, [w, Y.tray - 0.05, 0.48], [xc, 0.05 + (Y.tray - 0.05) / 2, 0], { r: 0.006, omit: ['ny'] });
      if (tag === 'L') {
        cast('door', [w - 0.05, 0.6, 0.012], [xc, 0.4, 0.246], { r: 0.004, omit: ['nz'] });
        sw(k.box({ name: 'doorHandle', mat: 'mech', size: [0.012, 0.12, 0.018], r: 0.004, segs: q(1, 1, 0), xf: xf({ pos: [x1 - 0.06, 0.45, 0.26] }) }), 'chrome');
      } else {
        [0.62, 0.43, 0.2].forEach((y, i) => {
          const h = i === 2 ? 0.26 : 0.16;
          cast(`drawer${i}`, [w - 0.05, h, 0.012], [xc, y, 0.246], { r: 0.004, omit: ['nz'] });
          sw(k.box({ name: `drawerPull${i}`, mat: 'mech', size: [0.1, 0.012, 0.016], r: 0.004, segs: q(1, 1, 0), xf: xf({ pos: [xc, y + h / 2 - 0.035, 0.259] }) }), 'chrome');
        });
      }
    }
    // 铁屑盘：底 + 四圈卷边
    sw(k.box({ name: 'tray', mat: 'mech', size: [1.52, 0.012, 0.56], r: 0.004, segs: q(1, 1, 0), xf: xf({ pos: [0, Y.tray + 0.006, 0] }) }), 'machine');
    const lip = (name, size, pos) => sw(k.box({ name, mat: 'mech', size, r: 0.004, segs: q(1, 1, 0), xf: xf({ pos }) }), 'machine');
    lip('trayF', [1.52, 0.05, 0.01], [0, Y.tray + 0.025, 0.275]);
    lip('trayL', [0.01, 0.05, 0.56], [-0.755, Y.tray + 0.025, 0]);
    lip('trayR', [0.01, 0.05, 0.56], [0.755, Y.tray + 0.025, 0]);
    // 挡屑板（背后一整块，顶上卷一道边）
    cast('splash', [1.52, 0.62, 0.012], [0, Y.tray + 0.31, -0.274], { r: 0.004 });
    rod(k, 'splashRoll', [-0.76, Y.tray + 0.62, -0.274], [0.76, Y.tray + 0.62, -0.274], 0.009, 'machine', { segs: q(8, 6, 4) });

    // —— 床身：截面挤出（前面一道 V 形导轨、后面一道平导轨是磨光的钢），两头两块床脚 ——
    {
      const bed = [[-0.13, 0], [0.13, 0], [0.13, 0.13], [0.105, 0.15], [0.105, 0.17], [-0.105, 0.17], [-0.105, 0.15], [-0.13, 0.13]].map(([z, y]) => [z, y, { r: 0.004, segs: q(2, 1, 1) }]);
      // 挤出方向 x：截面 X → -Z，所以截面的 x 取 -z
      k.extrude({ name: 'bed', mat: HT, shape: shape(ccw(bed.map(([z, y, o]) => [-z, y, o]))), depth: 1.32, axis: 'x', bevel: 0.004, xf: xf({ pos: [-0.66, Y.bed, 0] }) });
      const vway = [[0.085, 0], [0.115, 0], [0.1, 0.014]].map(([z, y]) => [-z, y, {}]);
      sw(k.extrude({ name: 'wayV', mat: 'mech', shape: shape(ccw(vway)), depth: 1.32, axis: 'x', xf: xf({ pos: [-0.66, Y.bed + 0.17, 0] }) }), 'bright');
      sw(k.box({ name: 'wayFlat', mat: 'mech', size: [1.32, 0.008, 0.035], segs: 0, omit: ['ny'], xf: xf({ pos: [0, Y.bed + 0.174, -0.085] }) }), 'bright');
    }
    // 丝杠和光杠（床身前面），右端一个轴承座
    rod(k, 'leadscrew', [-0.66, 0.905, 0.155], [0.68, 0.905, 0.155], 0.011, 'steel', { segs: q(10, 8, 5) });
    rod(k, 'feedrod', [-0.66, 0.862, 0.155], [0.68, 0.862, 0.155], 0.0085, 'bright', { segs: q(8, 6, 4) });
    cast('bearingR', [0.05, 0.1, 0.06], [0.68, 0.885, 0.15], { r: 0.008 });

    // —— 主轴箱（左）、进给箱、左端的挂轮罩 ——
    {
      cast('headstock', [0.32, Y.head - Y.bedTop + 0.02, 0.3], [-0.5, (Y.head + Y.bedTop - 0.02) / 2, 0], { r: 0.02 });
      cast('gearCover', [0.07, Y.head - Y.bed + 0.02, 0.3], [-0.695, (Y.head + Y.bed) / 2, 0], { r: 0.015 });
      cast('gearbox', [0.26, 0.17, 0.07], [-0.53, 0.89, 0.165], { r: 0.012 });
      // 进给箱正面的螺纹 / 进给表
      const plate = k.box({ name: 'threadPlate', mat: 'mech', size: [0.2, 0.1, 0.002], segs: 0, omit: ['nz', 'px', 'nx', 'py', 'ny'], xf: xf({ pos: [-0.53, 0.895, 0.2] }) });
      mapUV(plate, (p) => mechUV('lathePlate', (p[0] + 0.53) / 0.2 + 0.5, 0.5 - (p[1] - 0.895) / 0.1));
      // 主轴箱正面：铭牌、调速旋钮（刻度盘 + 旋钮）、开关面板和两个按钮、急停、两根变速手柄
      const front = 0.15;
      const face = (name, region, w, h, cx, cy) => {
        const b = k.box({ name, mat: 'mech', size: [w, h, 0.002], segs: 0, omit: ['nz', 'px', 'nx', 'py', 'ny'], xf: xf({ pos: [cx, cy, front + 0.001] }) });
        return mapUV(b, (p) => mechUV(region, (p[0] - cx) / w + 0.5, 0.5 - (p[1] - cy) / h));
      };
      face('makerPlate', 'maker', 0.1, 0.05, -0.575, 1.195);
      face('speedPlate', 'speedDial', 0.08, 0.08, -0.43, 1.085);
      turned(k, 'speedKnob', [[0, 0], [0.022, 0], [0.024, 0.006, sm], [0.022, 0.024, sm], [0.016, 0.03, sm], [0, 0.031]], 'bakelite', { segs: q(14, 10, 6), place: xf({ pos: [-0.43, 1.085, front + 0.002], rot: [Math.PI / 2, 0, 0] }) });
      rod(k, 'speedPointer', [-0.43, 1.085 + 0.012, front + 0.033], [-0.43 - 0.012, 1.085 + 0.018, front + 0.033], 0.0018, 'bright', { segs: 4 });
      face('switchPlate', 'switches', 0.08, 0.04, -0.43, 1.195);
      for (const [i, dx, c] of [[0, -0.02, 'green'], [1, 0.02, 'knobRed']]) {
        turned(k, `button${i}`, [[0, 0], [0.008, 0], [0.008, 0.008, sm], [0.006, 0.011, sm], [0, 0.012]], c, { segs: q(10, 8, 6), place: xf({ pos: [-0.43 + dx, 1.19, front + 0.002], rot: [Math.PI / 2, 0, 0] }) });
      }
      turned(k, 'estop', [[0, 0], [0.012, 0], [0.012, 0.012], [0.022, 0.014, sm], [0.022, 0.022, sm], [0.016, 0.028, sm], [0, 0.029]], 'knobRed', { segs: q(12, 8, 6), place: xf({ pos: [-0.46, Y.head, 0.11] }) });
      for (const [i, x, y, tilt] of [[0, -0.61, 1.06, 0.35], [1, -0.61, 1.13, -0.25]]) {
        turned(k, `leverBoss${i}`, [[0, 0], [0.016, 0], [0.016, 0.012, sm], [0.01, 0.018], [0, 0.019]], 'bright', { segs: q(10, 8, 6), place: xf({ pos: [x, y, front], rot: [Math.PI / 2, 0, 0] }) });
        ballKnob(k, `lever${i}`, { r: 0.012, stem: 0.07, place: xf({ pos: [x, y, front + 0.015], rot: [Math.PI / 2, 0, tilt] }) });
      }
      // 卡盘：本体 + 三个爪（120° 一个，阶梯形），夹着一根钢棒
      const cx0 = -0.34;
      turned(k, 'spindleNose', [[0, 0], [0.05, 0], [0.05, 0.02], [0, 0.021]], 'steel', { segs: q(18, 12, 8), place: xf({ pos: [cx0, Y.axis, 0], rot: [0, 0, -Math.PI / 2] }) });
      turned(k, 'chuck', [[0, 0.02], [0.078, 0.02], [0.082, 0.026, sm], [0.082, 0.082, sm], [0.078, 0.088], [0.02, 0.09], [0, 0.09]], 'steel', { segs: q(24, 16, 10), place: xf({ pos: [cx0, Y.axis, 0], rot: [0, 0, -Math.PI / 2] }) });
      for (let i = 0; i < 3; i++) {
        const a = Math.PI / 2 + (2 * Math.PI * i) / 3, dir = [0, Math.cos(a), Math.sin(a)];
        const pl = frame([1, 0, 0], dir, [0, -Math.sin(a), Math.cos(a)], [cx0 + 0.09, Y.axis, 0]);
        sw(k.box({ name: `jaw${i}`, mat: 'mech', size: [0.03, 0.035, 0.022], r: 0.002, segs: q(1, 1, 0), xf: pl.mul(xf({ pos: [0.012, 0.0375, 0] })) }), 'bright');
        sw(k.box({ name: `jawStep${i}`, mat: 'mech', size: [0.016, 0.02, 0.022], r: 0.002, segs: q(1, 1, 0), xf: pl.mul(xf({ pos: [0.035, 0.03, 0] })) }), 'bright');
      }
    }

    // —— 工件：黑皮钢棒，右边一段已经车光（小一圈），刀尖停在台阶上 ——
    const cut = -0.06, endX = 0.14, R0 = 0.02, R1 = 0.0165;
    turned(k, 'stock', [[0, -0.02], [R0, -0.02], [R0, cut + 0.3, sm]], 'millScale', { segs: q(16, 12, 8), place: xf({ pos: [-0.3, Y.axis, 0], rot: [0, 0, -Math.PI / 2] }) });
    turned(k, 'turned', [[R0 - 0.0005, 0], [R1, 0.0025], [R1, endX - cut - 0.002, sm], [R1 - 0.002, endX - cut], [0, endX - cut + 0.0005]], 'bright', { segs: q(16, 12, 8), place: xf({ pos: [cut, Y.axis, 0], rot: [0, 0, -Math.PI / 2] }) });

    // —— 大拖板、溜板箱、中拖板、小刀架、四方刀架和车刀 ——
    {
      const x0 = -0.17, x1 = 0.05, xc = (x0 + x1) / 2;
      cast('saddle', [x1 - x0, 0.03, 0.34], [xc, Y.bedTop + 0.015, 0.01], { r: 0.008 });
      cast('apron', [x1 - x0, 0.17, 0.05], [xc, 0.915, 0.155], { r: 0.012 });
      handwheel(k, 'carriageWheel', { r: 0.068, place: xf({ pos: [xc - 0.03, 0.9, 0.18], rot: [Math.PI / 2, 0, 0] }) });
      ballKnob(k, 'halfNut', { r: 0.011, stem: 0.06, place: xf({ pos: [x1 - 0.03, 0.95, 0.18], rot: [Math.PI / 2, 0, -0.5] }) });
      // 中拖板 + 手轮和刻度环
      const cy = Y.bedTop + 0.045;
      cast('crossSlide', [0.16, 0.03, 0.3], [-0.06, cy, 0.03], { r: 0.006 });
      collar(k, 'crossCollar', { r: 0.024, w: 0.012, place: xf({ pos: [-0.06, cy, 0.18], rot: [Math.PI / 2, 0, 0] }) });
      handwheel(k, 'crossWheel', { r: 0.048, place: xf({ pos: [-0.06, cy, 0.192], rot: [Math.PI / 2, 0, 0] }) });
      // 小刀架：斜 30°，后面一个小手轮
      const comp = xf({ pos: [-0.05, cy + 0.03, 0.02], rot: [0, 0.52, 0] });
      k.box({ name: 'compound', mat: HT, size: [0.07, 0.03, 0.2], r: 0.005, segs: q(2, 1, 1), xf: comp });
      collar(k, 'compCollar', { r: 0.017, w: 0.01, place: comp.mul(xf({ pos: [0, 0, 0.1], rot: [Math.PI / 2, 0, 0] })) });
      handwheel(k, 'compWheel', { r: 0.032, place: comp.mul(xf({ pos: [0, 0, 0.11], rot: [Math.PI / 2, 0, 0] })) });
      // 四方刀架：一块钢块，顶上一根锁紧手柄；车刀伸出来，刀尖顶在钢棒的台阶上
      const tp = [cut + 0.02, cy + 0.045, 0.06];
      sw(k.box({ name: 'toolPost', mat: 'mech', size: [0.06, 0.05, 0.06], r: 0.004, segs: q(1, 1, 0), xf: xf({ pos: [tp[0], tp[1] + 0.012, tp[2]] }) }), 'steel');
      ballKnob(k, 'postHandle', { r: 0.011, stem: 0.07, place: xf({ pos: [tp[0], tp[1] + 0.037, tp[2]], rot: [0, 0.5, -1.35] }) });
      const tool = [[0.006, 0], [0.006, -0.066], [0.001, -0.074], [-0.006, -0.068], [-0.006, 0]].map(([x, z]) => [x, -z, {}]);
      sw(k.extrude({ name: 'tool', mat: 'mech', shape: shape(ccw(tool)), depth: 0.012, axis: 'y', xf: xf({ pos: [cut - 0.001, Y.axis - 0.006, tp[2] + 0.03] }) }), 'bright');
      // 从刀尖卷出来的一卷车屑（回火色）：扁带沿一段螺旋扫出来，轴线朝前上方
      const turns = 5, n = q(10, 6, 4) * turns, tipP = [cut, Y.axis + 0.004, R1 + 0.002];
      const helix = Array.from({ length: n + 1 }, (_, i) => {
        const t = i / n, w = t * turns * 2 * Math.PI, rr = 0.011 + 0.01 * t;
        return [tipP[0] + 0.012 * t + rr * Math.sin(w) * 0.35, tipP[1] + 0.075 * t + rr * (1 - Math.cos(w)), tipP[2] + 0.055 * t + rr * Math.sin(w)];
      });
      const chip = k.sweep({ name: 'chip', mat: 'mech', shape: rect(0.0065, 0.0005), path: helix, caps: [false, false], up: [1, 0, 0] });
      let L = 0;
      for (let i = 1; i < helix.length; i++) L += Math.hypot(...helix[i].map((v, j) => v - helix[i - 1][j]));
      chip.T = chip.T.map(([s, a]) => mechUV('chip', s / L, a / 0.014));
    }

    // —— 尾座：本体、套筒、回转顶尖、手轮、锁紧手柄 ——
    {
      const x0 = 0.33;
      cast('tailBase', [0.2, 0.03, 0.26], [x0 + 0.1, Y.bedTop + 0.015, 0], { r: 0.008 });
      cast('tailstock', [0.18, 0.13, 0.16], [x0 + 0.1, Y.bedTop + 0.095, 0], { r: 0.03 });
      turned(k, 'quill', [[0, 0], [0.024, 0], [0.024, 0.125, sm], [0.022, 0.13], [0, 0.131]], 'bright', { segs: q(14, 10, 6), place: xf({ pos: [x0 + 0.01, Y.axis, 0], rot: [0, 0, Math.PI / 2] }) });
      turned(k, 'liveCenter', [[0, 0], [0.02, 0], [0.02, 0.03, sm], [0.012, 0.035], [0.01, 0.045], [0.001, 0.07], [0, 0.071]], 'steel', { segs: q(14, 10, 6), place: xf({ pos: [endX + 0.068, Y.axis, 0], rot: [0, 0, Math.PI / 2] }) });
      handwheel(k, 'tailWheel', { r: 0.06, place: xf({ pos: [x0 + 0.19, Y.axis, 0], rot: [0, 0, -Math.PI / 2] }) });
      ballKnob(k, 'quillLock', { r: 0.01, stem: 0.06, place: xf({ pos: [x0 + 0.05, Y.bedTop + 0.16, 0.03], rot: [0.6, 0, 0.2] }) });
    }

    // —— 工作灯：从挡屑板顶上弯过来的鹅颈管，锥形灯罩照着刀尖 ——
    {
      const base = [0.5, Y.tray + 0.62, -0.268];
      sw(k.box({ name: 'lampClamp', mat: 'mech', size: [0.05, 0.04, 0.03], r: 0.005, segs: q(1, 1, 0), xf: xf({ pos: [base[0], base[1] - 0.005, base[2] + 0.02] }) }), 'blackMatte');
      const path = catmull([[base[0], base[1] + 0.02, base[2] + 0.02], [0.45, 1.55, -0.2], [0.25, 1.62, -0.05], [0.08, 1.5, 0.04]], q(6, 4, 2));
      sw(k.sweep({ name: 'gooseneck', mat: 'mech', shape: circle(0.008, q(8, 6, 4)), path, up: [0, 0, 1] }), 'blackMatte');
      const head = path[path.length - 1];
      const lp = xf({ pos: [head[0], head[1] - 0.02, head[2]], rot: [0, 0, -0.25] });
      turned(k, 'lampShade', [[0.01, 0.026], [0.041, -0.028, sm], [0.044, -0.031], [0.047, -0.029], [0.022, 0.022, sm], [0.012, 0.03]], 'machine', { segs: q(16, 12, 8), place: lp });
      turned(k, 'bulb', [[0, -0.034], [0.022, -0.03, sm], [0.032, -0.024]], 'lamp', { segs: q(12, 8, 6), place: lp });
      const warn = k.box({ name: 'warning', mat: 'mech', size: [0.1, 0.05, 0.002], segs: 0, omit: ['nz', 'px', 'nx', 'py', 'ny'], xf: xf({ pos: [0.2, 1.3, -0.267] }) });
      mapUV(warn, (p) => mechUV('warning', (p[0] - 0.2) / 0.1 + 0.5, 0.5 - (p[1] - 1.3) / 0.05));
    }

    // —— 铁屑盘里：一把卡盘扳手、几卷车屑 ——
    if (k.lod < 2) {
      const ky = Y.tray + 0.012;
      rod(k, 'chuckKey', [-0.2, ky + 0.008, 0.2], [-0.2 + 0.1, ky + 0.008, 0.2 + 0.02], 0.006, 'bright', { segs: q(6, 5, 4) });
      rod(k, 'chuckKeyT', [-0.2 - 0.004, ky + 0.008, 0.2 - 0.05], [-0.2 + 0.016, ky + 0.008, 0.2 + 0.055], 0.005, 'bright', { segs: q(6, 5, 4) });
      [[0.18, 0.2, 0.3], [0.24, 0.15, 1.7], [-0.02, 0.22, 2.6]].forEach(([x, z, r], i) => {
        const n = q(20, 12, 6), pts = Array.from({ length: n + 1 }, (_, j) => { const w = (j / n) * 3 * 2 * Math.PI; return [x + 0.012 * Math.cos(w + r), ky + 0.012 + 0.009 * Math.sin(w + r), z + 0.022 * (j / n)]; });
        const c = k.sweep({ name: `looseChip${i}`, mat: 'mech', shape: rect(0.004, 0.0005), path: pts, caps: [false, false], up: [0, 1, 0] });
        let L = 0;
        for (let j = 1; j < pts.length; j++) L += Math.hypot(...pts[j].map((v, m) => v - pts[j - 1][m]));
        c.T = c.T.map(([s, a]) => mechUV('chip', 0.2 + (0.6 * s) / L, a / 0.009));
      });
    }

    // 整体往前挪，背后贴墙
    const shift = xf({ pos: [0, 0, ZC] });
    for (const p of k.parts) p.transform(shift);
  },
};
