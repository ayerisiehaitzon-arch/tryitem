import { shape, profile, rect, circle } from '../core/shape.js';
import { xf } from '../core/vec.js';
import { barUV } from '../materials/atlas.js';
import {
  sw, mapUV, ccw, frame, put, ellipsePts, rod, bottle, rocksGlass, coupe, citrus, citrusHalf, citrusWheel,
  shaker, jigger, barSpoon, coaster, iceCube, peel,
} from './parts.js';

// 吧台：一整条竖着的胡桃木凸棱（柜身正面、两端都是，前面两个角是大圆角，凸棱跟着绕过去），
// 黑色的踢脚往里缩一点；上面一块白色大理石台面，客人那边探出去 24cm 放腿，两个前角是顺着柜身走的椭圆角；
// 离地 20cm 一根黄铜脚踏杆，顺着柜身绕过两个圆角，两头弯回来插进两端，正面三个黄铜托架。
// 调酒师那一面是三扇胡桃木柜门和黄铜小圆钮。
// 台面上正在调一杯 Negroni 和一杯马天尼：
//   · 客人面前两块软木杯垫：一杯 Negroni（古典杯、一块大方冰、一片拧过的橙皮），一杯马天尼（香槟碟、金色签子穿着两颗橄榄）；
//   · 后面：金酒、红味美思、苦味利口酒三瓶，一小瓶橙味苦精；一只搅拌杯（下一杯 Negroni、两块冰，吧勺斜靠在杯口），
//     一只三段式雪克壶、一只双头量酒器；
//   · 右边一块拼木小砧板（半个青柠切面朝上、一片青柠、一把小刀），一只白瓷碗里堆着三个柠檬两个青柠。
// 原点在台子正下方的地面，客人那面朝 +z。
const BODY = { xe: 0.86, zf: 0.2, zb: -0.3, R: 0.2, y0: 0.1, y1: 0.88, reed: 0.04, h: 0.012 };
const TOP = { x: 0.91, zf: 0.44, zb: -0.33, y: 0.92, t: 0.04 };
const RAIL = { y: 0.2, r: 0.025, off: 0.18, zEnd: -0.04 };
const sm = { smooth: true };

// 柜身的基准线（凸棱的根）：从左后角起，沿左端往前、绕左前圆角、沿正面、绕右前圆角、沿右端回到右后角。
// 返回弧长 s 处的点 (x, z) 和朝外的法线 (nx, nz)
const L1 = BODY.zf - BODY.R - BODY.zb, LA = (Math.PI / 2) * BODY.R, L2 = 2 * (BODY.xe - BODY.R);
const BASE_LEN = 2 * L1 + 2 * LA + L2;
function basePt(s) {
  const { xe, zf, zb, R } = BODY;
  if (s <= L1) return [-xe, zb + s, -1, 0];
  s -= L1;
  if (s <= LA) { const t = Math.PI - s / R; return [-xe + R + R * Math.cos(t), zf - R + R * Math.sin(t), Math.cos(t), Math.sin(t)]; }
  s -= LA;
  if (s <= L2) return [-xe + R + s, zf, 0, 1];
  s -= L2;
  if (s <= LA) { const t = Math.PI / 2 - s / R; return [xe - R + R * Math.cos(t), zf - R + R * Math.sin(t), Math.cos(t), Math.sin(t)]; }
  s -= LA;
  return [xe, zf - R - s, 1, 0];
}

// 柜身的俯视轮廓（截面坐标 (x, -z)）：沿基准线一根根凸棱 —— 每根是一段圆弧（弦长 = 棱宽、拱高 h），
// 棱与棱之间的凹缝是硬边，棱上是平滑顶点；最后从右后角直接连回左后角（调酒师那面是平的）。
// 棱的根数和 LOD 无关（每根棱一个图块），LOD 只改每根棱上的点数
function reedLoop(k) {
  const { h } = BODY;
  const N = Math.round(BASE_LEN / BODY.reed), P = BASE_LEN / N;
  const RR = (P * P / 4 + h * h) / (2 * h), phi = Math.asin(P / (2 * RR));
  const m = k.q(4, 3, 1);
  const pts = [];
  for (let i = 0; i < N; i++) for (let j = 0; j < m; j++) {
    const c = RR * Math.sin(phi * ((2 * j) / m - 1));
    const off = Math.sqrt(RR * RR - c * c) - (RR - h);
    const [x, z, nx, nz] = basePt((i + 0.5) * P + c);
    pts.push([x + nx * off, -(z + nz * off), j === 0 ? {} : sm]);
  }
  // 背面：右后角 → 中点 → 左后角。背面长 1.7m，AO 图块要切两片；只有一条边时它的中点正好落在两片的分界上，
  // 各级 LOD 的浮点误差会把它分到不同的片里，所以在中间加一个共线点
  pts.push([BODY.xe, -BODY.zb, {}], [0, -BODY.zb, sm]);
  return pts;
}

// 台面的俯视轮廓：两个前角是椭圆（圆心和柜身的圆角同一个），后面两个角是小圆角
function topLoop(k) {
  const { x: X, zf: ZF, zb: ZB } = TOP;
  const cx = BODY.xe - BODY.R, cz = BODY.zf - BODY.R, ax = X - cx, az = ZF - cz, n = k.q(12, 8, 4);
  const back = { r: 0.012, segs: k.q(2, 1, 1) };
  const pts = [[-X, ZB, back]];
  for (let i = 0; i <= n; i++) { const t = Math.PI - (Math.PI / 2) * (i / n); pts.push([-cx + ax * Math.cos(t), cz + az * Math.sin(t), sm]); }
  for (let i = 1; i <= n; i++) { const t = Math.PI / 2 - (Math.PI / 2) * (i / n); pts.push([cx + ax * Math.cos(t), cz + az * Math.sin(t), sm]); }
  pts.push([X, ZB, back]);
  return pts.map(([x, z, o]) => [x, -z, o]);
}

// 脚踏杆的路径：离凸棱的根 off，从左端的柜侧弯出来、往前、绕左前角、沿正面、绕右前角、往后、弯回右端的柜侧
function railPath(k) {
  const { xe, zf, R } = BODY, d = RAIL.off, ze = RAIL.zEnd, y = RAIL.y;
  const nR = k.q(6, 4, 2), nA = k.q(10, 6, 3);
  const pts = [];
  for (let i = 0; i <= nR; i++) { const t = -Math.PI / 2 - (Math.PI / 2) * (i / nR); pts.push([-xe + d * Math.cos(t), ze + d * Math.sin(t)]); }
  for (let i = 0; i <= nA; i++) { const t = Math.PI - (Math.PI / 2) * (i / nA); pts.push([-xe + R + (R + d) * Math.cos(t), zf - R + (R + d) * Math.sin(t)]); }
  for (let i = 0; i <= nA; i++) { const t = Math.PI / 2 - (Math.PI / 2) * (i / nA); pts.push([xe - R + (R + d) * Math.cos(t), zf - R + (R + d) * Math.sin(t)]); }
  for (let i = 0; i <= nR; i++) { const t = -(Math.PI / 2) * (i / nR); pts.push([xe + d * Math.cos(t), ze + d * Math.sin(t)]); }
  return pts.map(([x, z]) => [x, y, z]);
}

// 一颗橄榄：沿局部 y 的小椭球，原点在中心；顶上塞着一点红椒
function olive(k, name, place) {
  const o = sw(k.lathe({ name, mat: 'bar', segs: k.q(10, 7, 5), profile: profile(ellipsePts(0.0082, 0.011, 0, 0, Math.PI, k.q(6, 4, 3)).map(([x, y], i, a) => [x, y, i === 0 || i === a.length - 1 ? {} : sm])) }), 'olive');
  if (k.lod > 1) return put(o, place);
  const p = sw(k.lathe({ name: `${name}Pimento`, mat: 'bar', segs: k.q(8, 6, 4), profile: profile([[0, 0.0085], [0.0036, 0.0098, sm], [0.003, 0.0118, sm], [0, 0.0122]]) }), 'cherry');
  return put([o, p], place);
}

export default {
  id: 'bar_counter',
  name: '吧台',
  nameEn: 'Reeded Walnut Bar Counter with Cocktails',
  category: 'bar',
  aoDensity: 200,
  shadow: { margin: 0.2, maxDist: 0.9, density: 90 },
  view: { el: 16, az: 24 },
  build(k) {
    const q = (...v) => k.q(...v);
    const { xe, zf, zb, R, y0, y1, h } = BODY;
    const Y = TOP.y;

    // —— 柜身：凸棱一圈挤出（底面封上，蹲下来也看不进去）——
    k.extrude({ name: 'body', mat: 'walnut', shape: shape(ccw(reedLoop(k))), depth: y1 - y0, axis: 'y', caps: [true, false], grain: 'len', density: { side: 0.6, cap0: 0.2 }, xf: xf({ pos: [0, y0, 0] }) });
    // 踢脚：往里缩 4cm（调酒师那面缩 3cm），黑色
    {
      const zF = zf - 0.04, zB = zb + 0.03, w = 2 * (xe - 0.04), c = R - 0.04;
      sw(k.extrude({ name: 'plinth', mat: 'bar', shape: rect(w, zF - zB, { corners: [c, c, 0, 0], segs: q(6, 4, 2) }), depth: y0, axis: 'y', caps: [false, false], xf: xf({ pos: [0, 0, (zF + zB) / 2] }) }), 'plinth');
    }
    // 台面：4cm 厚的大理石，上下两圈圆边
    k.extrude({ name: 'top', mat: 'marble_slab', shape: shape(ccw(topLoop(k))), depth: TOP.t, axis: 'y', bevel: { w: 0.008, h: 0.008 }, bsegs: q(3, 2, 1), density: { cap0: 0.4 }, xf: xf({ pos: [0, y1, 0] }) });

    // —— 调酒师那面：三扇柜门 + 黄铜小圆钮 ——
    {
      const dw = 0.505, dh = 0.72, yc = 0.49;
      [-1, 0, 1].forEach((c, i) => {
        const x = c * (dw + 0.012);
        k.box({ name: `door${i}`, mat: 'walnut', size: [dw, dh, 0.018], r: 0.003, segs: q(1, 1, 0), omit: ['pz'], grain: 'y', xf: xf({ pos: [x, yc, zb - 0.009] }) });
        if (k.lod < 2) sw(k.lathe({ name: `knob${i}`, mat: 'bar', segs: q(10, 8, 6), profile: profile([[0.005, 0], [0.006, 0.006, sm], [0.011, 0.013, sm], [0.009, 0.02, sm], [0, 0.021]]), xf: xf({ pos: [x, yc + dh / 2 - 0.06, zb - 0.018], rot: [-Math.PI / 2, 0, 0] }) }), 'brass');
      });
    }

    // —— 黄铜脚踏杆：一根管子扫掠，正面三个托架（墙上一片圆法兰、一根短臂、管子上一圈箍），两头插进柜侧的法兰 ——
    {
      const { y, r, off, zEnd } = RAIL;
      sw(k.sweep({ name: 'rail', mat: 'bar', shape: circle(r, q(12, 8, 6)), path: railPath(k), caps: [false, false], up: [0, 1, 0] }), 'brass');
      const flange = (name, place) => sw(k.lathe({ name, mat: 'bar', segs: q(14, 10, 6), profile: profile([[0, 0], [0.032, 0], [0.0335, 0.003, sm], [0.029, 0.007, sm], [0.016, 0.01], [0, 0.011]]), xf: place }), 'brass');
      [-0.45, 0, 0.45].forEach((x, i) => {
        flange(`flange${i}`, xf({ pos: [x, y, zf + h], rot: [Math.PI / 2, 0, 0] }));
        rod(k, `arm${i}`, [x, y, zf + h + 0.008], [x, y, zf + off], 0.012, 'brass', { segs: q(10, 8, 6), caps: [false, false] });
        sw(k.lathe({ name: `collar${i}`, mat: 'bar', segs: q(14, 10, 6), profile: profile([[r + 0.002, -0.018], [r + 0.005, -0.014, sm], [r + 0.005, 0.014, sm], [r + 0.002, 0.018]]), xf: xf({ pos: [x, y, zf + off], rot: [0, 0, -Math.PI / 2] }) }), 'brass');
      });
      flange('flangeL', xf({ pos: [-xe - h, y, zEnd - off], rot: [0, 0, Math.PI / 2] }));
      flange('flangeR', xf({ pos: [xe + h, y, zEnd - off], rot: [0, 0, -Math.PI / 2] }));
    }

    // —— 客人面前：Negroni 和马天尼 ——
    {
      const [nx, nz] = [-0.45, 0.28];
      coaster(k, 'coasterA', { place: xf({ pos: [nx, Y, nz] }) });
      const g = xf({ pos: [nx, Y + 0.004, nz] });
      rocksGlass(k, 'rocks', { place: g, fill: 0.063, liquid: 'negroni' });
      iceCube(k, 'rocksIce', { s: 0.046, place: g.mul(xf({ pos: [0, 0.045, 0], rot: [0.06, 0.5, 0.04] })) });
      peel(k, 'rocksPeel', { place: g.mul(xf({ pos: [0.003, 0.067, 0.004], rot: [0, 0.9, 0.05] })) });
    }
    {
      const [mx, mz] = [0.3, 0.3];
      coaster(k, 'coasterB', { place: xf({ pos: [mx, Y, mz] }) });
      const g = xf({ pos: [mx, Y + 0.004, mz] });
      coupe(k, 'coupe', { place: g, fill: 0.118, liquid: 'martini' });
      // 金色签子从酒里斜伸出杯口，穿着两颗橄榄
      const a = [0.012, 0.096, 0.006], b = [-0.036, 0.152, -0.03];
      const d = b.map((v, i) => v - a[i]), at = (t) => a.map((v, i) => v + d[i] * t);
      put(rod(k, 'pick', a, b, 0.0011, 'pick', { segs: q(5, 4, 3) }), g);
      if (k.lod < 2) put(sw(k.lathe({ name: 'pickBall', mat: 'bar', segs: q(8, 6, 4), profile: profile([[0, -0.0032], [0.0032, 0, sm], [0, 0.0032]]), xf: xf({ pos: b }) }), 'pick'), g);
      const dl = Math.hypot(...d), dir = d.map((v) => v / dl);
      const orient = (p) => {
        // 局部 y 沿签子
        const up = [0, 0, 1], zx = [up[1] * dir[2] - up[2] * dir[1], up[2] * dir[0] - up[0] * dir[2], up[0] * dir[1] - up[1] * dir[0]];
        const zl = Math.hypot(...zx), z = zx.map((v) => v / zl), x = [dir[1] * z[2] - dir[2] * z[1], dir[2] * z[0] - dir[0] * z[2], dir[0] * z[1] - dir[1] * z[0]];
        return g.mul(frame(x, dir, z, p));
      };
      olive(k, 'olive0', orient(at(0.16)));
      olive(k, 'olive1', orient(at(0.42)));
    }

    // —— 后面：三瓶 Negroni 的酒、一小瓶苦精、搅拌杯和吧勺、雪克壶、量酒器 ——
    bottle(k, 'gin', 'gin', { place: xf({ pos: [-0.78, Y, -0.12], rot: [0, 0.25, 0] }) });
    bottle(k, 'vermouth', 'vermouth', { place: xf({ pos: [-0.66, Y, -0.21], rot: [0, -0.15, 0] }) });
    bottle(k, 'bitter', 'bitter', { place: xf({ pos: [-0.56, Y, -0.09], rot: [0, 0.1, 0] }) });
    bottle(k, 'bitters', 'orange', { s: 0.55, place: xf({ pos: [-0.44, Y, -0.22], rot: [0, 0.3, 0] }) });
    {
      const g = xf({ pos: [-0.3, Y, -0.1] });
      put(k.lathe({ name: 'mixingGlass', mat: 'bar_glass', segs: q(20, 14, 8), profile: profile([
        [0, 0], [0.04, 0], [0.043, 0.004, sm], [0.044, 0.126, sm], [0.0435, 0.13, sm], [0.04, 0.129, sm], [0.0395, 0.022, sm], [0.034, 0.018, sm], [0, 0.018],
      ]) }), g);
      put(sw(k.lathe({ name: 'mixingLiquid', mat: 'bar', segs: q(20, 14, 8), profile: profile([[0, 0.0185], [0.034, 0.0185, sm], [0.039, 0.0222, sm], [0.0392, 0.07], [0, 0.07]]) }), 'negroni'), g);
      if (k.lod < 2) {
        iceCube(k, 'mixIce0', { s: 0.026, place: g.mul(xf({ pos: [0.002, 0.066, 0.021], rot: [0.1, 0.3, 0.05] })) });
        iceCube(k, 'mixIce1', { s: 0.026, place: g.mul(xf({ pos: [-0.004, 0.064, -0.021], rot: [-0.05, 0.9, 0.1] })) });
      }
      // 吧勺：勺头在杯底靠右，杆靠在左边的杯口上
      const base = [0.018, 0.021, 0], rest = [-0.042, 0.13, 0], d = rest.map((v, i) => v - base[i]), dl = Math.hypot(...d);
      put(barSpoon(k, 'spoon', { base, dir: d.map((v) => v / dl), up: [0, 0, 1] }), g);
    }
    shaker(k, 'shaker', { place: xf({ pos: [-0.08, Y, -0.2] }) });
    jigger(k, 'jigger', { place: xf({ pos: [0.03, Y, -0.16] }) });

    // —— 右边：小砧板（半个青柠、一片青柠、一把小刀）和一碗柠檬 / 青柠 ——
    {
      const bd = xf({ pos: [0.27, Y, -0.1], rot: [0, -0.12, 0] });
      const board = k.box({ name: 'board', mat: 'bar', size: [0.3, 0.02, 0.2], r: 0.002, segs: q(1, 1, 0), omit: ['ny'], xf: xf({ pos: [0, 0.01, 0] }) });
      mapUV(board, (p) => barUV('board', (p[0] + 0.15) / 0.3, (p[2] + 0.1) / 0.2));
      put(board, bd);
      citrusHalf(k, 'limeHalf', 'lime', { place: bd.mul(xf({ pos: [0.075, 0.0185, 0.035], rot: [0, 0.6, 0] })) });
      citrusWheel(k, 'limeWheel', 'lime', { place: bd.mul(xf({ pos: [0.005, 0.02, 0.055], rot: [0, 1.1, 0] })) });
      // 小刀：刀身平躺，刀柄厚一点
      const kf = bd.mul(xf({ pos: [-0.015, 0.02, -0.045], rot: [0, 0.25, 0] }));
      const blade = [[0, 0.008], [0, -0.009], [0.065, -0.0085, sm], [0.094, -0.002, sm], [0.107, 0.008]].map(([x, z, o]) => [x, -z, o]);
      put(sw(k.extrude({ name: 'knifeBlade', mat: 'bar', shape: shape(ccw(blade)), depth: 0.0014, axis: 'y', xf: xf({ pos: [0, 0.0004, 0] }) }), 'steel'), kf);
      put(sw(k.box({ name: 'knifeHandle', mat: 'bar', size: [0.09, 0.016, 0.02], r: 0.006, segs: q(2, 1, 1), xf: xf({ pos: [-0.047, 0.008, 0] }) }), 'handleBlack'), kf);
      // 白瓷碗：圈足、外壁、圆口、内壁
      const bw = xf({ pos: [0.66, Y, -0.07] });
      const t0 = Math.asin(0.052 / 0.11), n = q(8, 5, 2);
      put(sw(k.lathe({ name: 'bowl', mat: 'bar', segs: q(28, 18, 8), profile: profile([
        [0, 0.004], [0.044, 0.004], [0.046, 0], [0.05, 0], [0.052, 0.005, sm],
        ...ellipsePts(0.11, 0.06, 0.068, t0, Math.PI / 2, n), [0.1075, 0.0697, sm], ...ellipsePts(0.105, 0.057, 0.068, Math.PI / 2, 0, n),
      ]) }), 'bowlWhite'), bw);
      // 四个果子一圈（长轴朝外、往上翘一点），顶上再放一个横躺的
      const rnd = k.rand('fruit');
      const kinds = ['lemon', 'lime', 'lemon', 'lime'];
      kinds.forEach((kind, i) => {
        const a = Math.PI / 4 + (Math.PI / 2) * i + 0.15 * (rnd() - 0.5), tilt = 0.35 + 0.1 * rnd();
        const out = [Math.cos(a), 0, Math.sin(a)], dir = [out[0] * Math.cos(tilt), Math.sin(tilt), out[2] * Math.cos(tilt)];
        const spin = rnd() * 2 * Math.PI, c = [0.048 * out[0], 0.047, 0.048 * out[2]];
        const z0 = [-out[2], 0, out[0]], x0 = [dir[1] * z0[2] - dir[2] * z0[1], dir[2] * z0[0] - dir[0] * z0[2], dir[0] * z0[1] - dir[1] * z0[0]];
        const cs = Math.cos(spin), sn = Math.sin(spin), x = x0.map((v, j) => v * cs + z0[j] * sn), z = z0.map((v, j) => v * cs - x0[j] * sn);
        citrus(k, `fruit${i}`, kind, { place: bw.mul(frame(x, dir, z, c)) });
      });
      citrus(k, 'fruit4', 'lemon', { place: bw.mul(xf({ pos: [0.004, 0.083, -0.002], rot: [0.1, 0.4, Math.PI / 2 + 0.08] })) });
    }
  },
};
