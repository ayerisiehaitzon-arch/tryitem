import { shape, profile, rect, circle } from '../core/shape.js';
import { xf } from '../core/vec.js';
import { mechUV } from '../materials/atlas.js';
import { tireProfile, FRONT_TIRE, REAR_TIRE, tireRadius, CHAIN, chainLoop } from './layout.js';
import { sw, put, rod, tube, rotAbout, turned, frame, aim, ccw, catmull } from './parts.js';

// 咖啡骑士摩托车：停在侧撑上，车身往左歪 7°，车把往左打了一点。
//   · 18 寸辐条轮：镀铬轮圈、铝轮毂、每个轮子 36 根切向交叉的辐条；轮胎是一整条车削环带，胎面花纹和胎侧的字在贴图里；
//     前轮右边一片打孔的浮动刹车盘和黑色卡钳，后轮右边鼓刹、左边一片 42 齿的链轮；
//   · 黑色双摇篮钢管车架、方管后摇臂、两根外露弹簧的后减震；
//   · 风冷直列双缸：铝曲轴箱，气缸和缸头一圈圈散热片、往前倾 12°，右边抛光的边盖上一块圆铭牌，左边发电机盖和链轮罩；
//     两个化油器，两根镀铬排气管绕到发动机前面、再从两侧往后接两支豌豆枪消音器；
//   · 大红油箱（奶油色中线条纹、金色勾线、黑色护膝胶垫、两侧椭圆徽章、镀铬油箱盖），干邑色皮座垫，同色的驼峰尾罩和尾灯；
//   · 正立前叉（镀铬内管、铝外管）、上下联板、镀铬圆头灯、上联板上的速度表和转速表、低位的分离把、黑胶把套、
//     刹车 / 离合拉杆、把端的圆后视镜；
//   · 链条一圈 98 节，从链轮罩底下出来绕过后链轮；后座脚踏、侧撑。
// 原点在两个轮子着地点连线的中点，车头朝 +x，右边是 +z。
const RF = tireRadius(FRONT_TIRE), RR = tireRadius(REAR_TIRE);
const FA = [0.72, RF], RA = CHAIN.rear;                                  // 前后轮轴（侧视 x, y）
const RAKE = (27 * Math.PI) / 180, D = [-Math.sin(RAKE), Math.cos(RAKE)];  // 前叉方向（往上、往后）
const NB = [-Math.cos(RAKE), -Math.sin(RAKE)], OFF = 0.042;               // 转向轴在前叉后面 OFF
const fk = (t) => [FA[0] + D[0] * t, FA[1] + D[1] * t];
const ax = (t) => [fk(t)[0] + OFF * NB[0], fk(t)[1] + OFF * NB[1]];
const FZ = 0.095;                                                         // 前叉两根管子的 z
const CZ = -0.1;                                                          // 链条所在的平面
const LEAN = -0.122, STEER = 0.2;
const sm = { smooth: true };
const at3 = (p, z) => [p[0], p[1], z];

// 一个辐条轮：轮圈、轮胎、轮毂、辐条，沿局部 y 车削（轮轴），最后转到轮轴沿 z、放到 (x, y)
function wheel(k, name, { tire, pos, hub }) {
  const q = (...v) => k.q(...v);
  const place = xf({ pos: [pos[0], pos[1], 0], rot: [Math.PI / 2, 0, 0] });
  const parts = [];
  // 轮胎：u 绕一圈、v 沿截面
  const pts = tireProfile(tire, q(16, 12, 8));
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  const rmax = Math.max(...pts.map((p) => p[0]));
  const t = k.lathe({ name: `${name}Tire`, mat: 'mech', grain: 'around', segs: q(40, 28, 14), profile: profile(pts.map(([r, y]) => [r, y, sm])) });
  t.T = t.T.map(([a, s]) => mechUV('tire', a / (2 * Math.PI * rmax), s / L));
  parts.push(t);
  // 轮圈（只做看得见的内侧和两道轮缘，外侧被轮胎盖住）
  parts.push(turned(k, `${name}Rim`, [[0.2365, 0.028], [0.229, 0.033, sm], [0.215, 0.029, sm], [0.209, 0.015, sm], [0.207, 0, sm], [0.209, -0.015, sm], [0.215, -0.029, sm], [0.229, -0.033, sm], [0.2365, -0.028]], 'chrome', { segs: q(40, 28, 12) }));
  // 轮毂
  parts.push(turned(k, `${name}Hub`, hub, 'castAlu', { segs: q(18, 12, 6) }));
  // 辐条：两侧轮毂法兰各 18 根，一根往前切、一根往后切，交叉着连到轮圈中线两边
  const n = 18, fr = 0.047, rr = 0.207;
  for (const side of [-1, 1]) for (let i = 0; i < n; i++) {
    if (k.lod > 1 && i % 3) continue;
    const ah = (2 * Math.PI * (i + (side > 0 ? 0.5 : 0))) / n, ar = ah + (i % 2 ? 0.95 : -0.95);
    parts.push(rod(k, `${name}Spoke${side > 0 ? 'R' : 'L'}${i}`, [fr * Math.cos(ah), side * 0.035, fr * Math.sin(ah)], [rr * Math.cos(ar), side * 0.009, rr * Math.sin(ar)], 0.0019, 'chrome', { segs: q(4, 4, 3), caps: [false, false] }));
  }
  return put(parts, place);
}

// 一根后减震（沿局部 y，从下安装眼到上安装眼，长 len）：镀铬阻尼筒、外露的弹簧、黑色上罩
function shock(k, name, a, b) {
  const q = (...v) => k.q(...v);
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], L = Math.hypot(...d), dir = d.map((v) => v / L);
  const parts = [];
  parts.push(turned(k, `${name}Body`, [[0, -0.012], [0.012, -0.012, sm], [0.014, 0, sm], [0.012, 0.012], [0.016, 0.02], [0.016, L * 0.55, sm], [0.021, L * 0.56], [0, L * 0.56]], 'chrome', { segs: q(12, 8, 6) }));
  parts.push(turned(k, `${name}Top`, [[0, L * 0.6], [0.031, L * 0.6], [0.031, L - 0.03, sm], [0.022, L - 0.012, sm], [0.012, L - 0.01], [0.014, L, sm], [0.012, L + 0.012, sm], [0, L + 0.012]], 'blackGloss', { segs: q(12, 8, 6) }));
  // 弹簧：七圈螺旋
  const turns = 7, m = q(8, 5, 3) * turns, y0 = L * 0.12, y1 = L * 0.6;
  const coil = Array.from({ length: m + 1 }, (_, i) => { const t = i / m, w = t * turns * 2 * Math.PI; return [0.027 * Math.cos(w), y0 + (y1 - y0) * t, 0.027 * Math.sin(w)]; });
  parts.push(sw(k.sweep({ name: `${name}Spring`, mat: 'mech', shape: circle(0.0045, q(5, 4, 3)), path: coil, caps: [false, false], up: [0, 1, 0] }), 'chrome'));
  return put(parts, aim(dir, [1, 0, 0], a));
}

// 一个 loft 截面环：中心 (x, yc)，半宽 w、半高 h，超椭圆指数 p；从正下方开始逆着 x 轴看顺时针走一圈（先到 +z 一侧）
function ring(x, yc, w, h, p, n, flat = 1) {
  return Array.from({ length: n }, (_, j) => {
    const a = -Math.PI / 2 + (2 * Math.PI * j) / n, c = Math.cos(a), s = Math.sin(a);
    const e = 2 / p, y = Math.sign(s) * Math.abs(s) ** e * h * (s < 0 ? flat : 1);
    return [x, yc + y, Math.sign(c) * Math.abs(c) ** e * w];
  });
}
// 一串截面环放样，UV 按顶点序号贴漆面区域：u 沿 x（前 → 后）、v 按环上的弧长比例（0.5 是正上方）
function paintedLoft(k, name, rings, { mat = 'mech', region = 'tank', u0 = 0, u1 = 1 } = {}) {
  const n = rings[0].length, m = rings.length;
  const p = k.loft({ name, mat, rings });
  const V = rings.map((r) => {
    const s = [0];
    for (let j = 1; j <= n; j++) s.push(s[j - 1] + Math.hypot(r[j % n][1] - r[j - 1][1], r[j % n][2] - r[j - 1][2]));
    return s.map((v) => v / s[n]);
  });
  if (region) p.T = p.T.map((_, idx) => { const i = Math.floor(idx / (n + 1)), j = idx % (n + 1); return mechUV(region, u0 + ((u1 - u0) * i) / (m - 1), V[i][j]); });
  return p;
}

export default {
  id: 'motorcycle',
  name: '咖啡骑士摩托车',
  nameEn: 'Café Racer Motorcycle',
  category: 'machine',
  aoDensity: 200,
  shadow: { margin: 0.2, maxDist: 0.9, density: 90 },
  view: { el: 10, az: 30 },
  build(k) {
    const q = (...v) => k.q(...v);
    const nFront0 = k.parts.length;

    // —————————————— 前端（最后绕转向轴转 STEER）——————————————
    // 前轮：小轮毂 + 右边一片刹车盘
    wheel(k, 'front', {
      tire: FRONT_TIRE, pos: FA,
      hub: [[0, -0.078], [0.011, -0.078], [0.011, -0.062], [0.03, -0.06], [0.034, -0.046, sm], [0.049, -0.039], [0.049, -0.031], [0.034, -0.027], [0.037, 0, sm], [0.034, 0.027], [0.049, 0.031], [0.049, 0.039], [0.034, 0.046, sm], [0.03, 0.06], [0.011, 0.062], [0.011, 0.078], [0, 0.078]],
    });
    {
      const disc = k.lathe({ name: 'disc', mat: 'mech', segs: q(36, 24, 14), profile: profile([[0.035, 0.0575], [0.15, 0.0575], [0.15, 0.0625], [0.035, 0.0625]]) });
      disc.T = disc.T.map((t, i) => (Math.abs(disc.N[i][1]) > 0.9 ? mechUV('disc', 0.5 + t[0] / 0.31, 0.5 + t[1] / 0.31) : mechUV('disc', 0.02, 0.5)));
      disc.transform(xf({ pos: [FA[0], FA[1], 0], rot: [Math.PI / 2, 0, 0] }));
      // 卡钳：跨在刹车盘后上方
      const a = (128 * Math.PI) / 180, rad = [Math.cos(a), Math.sin(a), 0], tan = [-Math.sin(a), Math.cos(a), 0];
      sw(k.box({ name: 'caliper', mat: 'mech', size: [0.034, 0.1, 0.048], r: 0.008, segs: q(2, 1, 1), xf: frame(rad, tan, [0, 0, 1], [FA[0] + 0.128 * rad[0], FA[1] + 0.128 * rad[1], 0.06]) }), 'blackGloss');
    }
    // 前叉：铝外管（下）+ 镀铬内管（上），轮轴，上下联板，叉顶盖
    for (const s of [-1, 1]) {
      const z = s * FZ, tag = s > 0 ? 'R' : 'L';
      const base = at3(fk(-0.025), z), dir = [D[0], D[1], 0];
      turned(k, `slider${tag}`, [[0, 0], [0.019, 0, sm], [0.025, 0.02, sm], [0.025, 0.3, sm], [0.021, 0.315], [0.019, 0.315], [0, 0.316]], 'castAlu', { segs: q(12, 8, 6), place: aim(dir, [0, 0, 1], base) });
      turned(k, `stanchion${tag}`, [[0.0185, 0.3], [0.0185, 0.745, sm], [0.016, 0.755], [0, 0.757]], 'chrome', { segs: q(12, 8, 6), place: aim(dir, [0, 0, 1], base) });
    }
    rod(k, 'frontAxle', at3(FA, -0.12), at3(FA, 0.12), 0.0095, 'chrome', { segs: q(8, 6, 4) });
    for (const [name, t, th, mat] of [['yokeLower', 0.5, 0.028, 'castAlu'], ['yokeUpper', 0.68, 0.022, 'alu']]) {
      const c = fk(t), mid = [c[0] + (OFF / 2) * NB[0], c[1] + (OFF / 2) * NB[1], 0];
      sw(k.box({ name, mat: 'mech', size: [OFF + 0.058, th, 2 * FZ + 0.05], r: 0.012, segs: q(2, 1, 1), xf: frame([NB[0], NB[1], 0], [D[0], D[1], 0], [0, 0, 1], mid) }), mat);
    }
    // 前挡泥板：沿车轮的一段圆弧扫出来的浅 U 形截面（抛光铝），两根撑杆到前叉外管
    {
      const r = RF + 0.028, n = q(12, 8, 5), path = [];
      for (let i = 0; i <= n; i++) { const a = (48 + (92 * i) / n) * (Math.PI / 180); path.push([FA[0] + r * Math.cos(a), FA[1] + r * Math.sin(a), 0]); }
      // 截面：x 是离车轮的径向、y 横跨车轮；外弧 + 内弧（壁厚 2.5mm）闭合成一圈
      const arcY = k.lod < 2 ? [-0.058, -0.045, -0.025, 0, 0.025, 0.045, 0.058] : [-0.058, -0.03, 0, 0.03, 0.058], bow = (y) => 0.012 * (1 - (y / 0.058) ** 2);
      const sec = [...arcY.map((y) => [bow(y), y, sm]), ...arcY.slice().reverse().map((y) => [bow(y) - 0.0025, y, sm])];
      sw(k.sweep({ name: 'fender', mat: 'mech', shape: shape(ccw(sec)), path, caps: [true, true], up: [0, 0, 1] }), 'alu');
      for (const s of [-1, 1]) {
        const a = (80 * Math.PI) / 180;
        rod(k, `stay${s > 0 ? 'R' : 'L'}`, [FA[0] + r * Math.cos(a), FA[1] + r * Math.sin(a) - 0.01, s * 0.05], at3(fk(0.18), s * (FZ - 0.02)), 0.004, 'alu', { segs: q(5, 4, 3) });
      }
    }
    // 头灯：镀铬灯碗 + 镀铬灯圈 + 微微鼓起的灯罩，两只“耳朵”架在前叉上
    {
      const c = [fk(0.56)[0] + 0.12, fk(0.56)[1] + 0.02, 0], place = xf({ pos: c, rot: [0, 0, -Math.PI / 2] });
      turned(k, 'headlight', [[0, -0.075], [0.045, -0.07, sm], [0.072, -0.05, sm], [0.086, -0.018, sm], [0.088, 0]], 'chrome', { segs: q(20, 14, 10), place });
      turned(k, 'headlightRim', [[0.088, -0.002], [0.091, 0.004, sm], [0.086, 0.011], [0.08, 0.009]], 'chrome', { segs: q(20, 14, 10), place });
      turned(k, 'headlightLens', [[0.081, 0.008], [0.06, 0.016, sm], [0.03, 0.021, sm], [0, 0.022]], 'lens', { segs: q(20, 14, 10), place });
      for (const s of [-1, 1]) {
        const p0 = at3(fk(0.56), s * (FZ + 0.02)), p1 = [c[0] - 0.01, c[1], s * 0.086];
        rod(k, `ear${s > 0 ? 'R' : 'L'}`, p0, p1, 0.007, 'blackGloss', { segs: q(6, 5, 4) });
      }
    }
    // 仪表：上联板上两个镀铬表壳，表面朝后上方（速度表在左、转速表在右）
    if (k.lod < 2) for (const [i, s] of [[0, -1], [1, 1]]) {
      const top = fk(0.7), nrm = [-Math.sin(0.6), Math.cos(0.6), 0], zx = [0, 0, 1];
      const zz = [zx[1] * nrm[2] - zx[2] * nrm[1], zx[2] * nrm[0] - zx[0] * nrm[2], zx[0] * nrm[1] - zx[1] * nrm[0]];
      const place = frame(zx, nrm, zz, [top[0] - 0.03, top[1] + 0.045, s * 0.056]);
      turned(k, `gaugeCup${i}`, [[0, -0.03], [0.03, -0.028, sm], [0.044, -0.012, sm], [0.047, 0.004], [0.048, 0.008], [0.043, 0.009]], 'chrome', { segs: q(16, 12, 8), place });
      const face = k.lathe({ name: `gaugeFace${i}`, mat: 'mech', segs: q(16, 12, 8), profile: profile([[0.043, 0.006], [0, 0.006]]) });
      face.T = face.T.map(([x, z]) => mechUV('gauges', (0.5 + x / 0.09 + i) / 2, 0.5 + z / 0.09));
      face.transform(place);
      rod(k, `gaugeStem${i}`, [top[0] - 0.02, top[1] + 0.005, s * 0.056], [top[0] - 0.03, top[1] + 0.03, s * 0.056], 0.006, 'blackGloss', { segs: q(6, 5, 4) });
    }
    // 分离把：夹在上联板下面的内管上，往外、往后、往下；黑胶把套、拉杆、把端圆镜
    for (const s of [-1, 1]) {
      const tag = s > 0 ? 'R' : 'L', c = fk(0.635);
      if (k.lod < 2) turned(k, `clamp${tag}`, [[0.026, -0.016], [0.028, -0.012, sm], [0.028, 0.012, sm], [0.026, 0.016]], 'alu', { segs: q(10, 8, 6), place: aim([D[0], D[1], 0], [0, 0, 1], at3(c, s * FZ)) });
      const a = [c[0] - 0.01, c[1] - 0.005, s * (FZ + 0.03)], b = [c[0] - 0.1, c[1] - 0.045, s * 0.3];
      tube(k, `bar${tag}`, [a, [c[0] - 0.03, c[1] - 0.012, s * (FZ + 0.08)], b], 0.011, 'chrome', { bend: 0.05, segs: q(8, 6, 5) });
      const bd = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], bl = Math.hypot(...bd), bdir = bd.map((v) => v / bl);
      const g0 = [b[0] - bdir[0] * 0.12, b[1] - bdir[1] * 0.12, b[2] - bdir[2] * 0.12];
      turned(k, `grip${tag}`, [[0.0125, 0], [0.016, 0.006, sm], [0.0165, 0.06, sm], [0.016, 0.116, sm], [0.012, 0.122], [0, 0.123]], 'rubber', { segs: q(10, 8, 6), place: aim(bdir, [0, 1, 0], g0) });
      // 拉杆：从把座往前伸出去再弯回来贴着把套
      const l0 = [g0[0] + 0.012, g0[1] + 0.004, g0[2] - s * 0.02], l1 = [g0[0] + 0.06, g0[1] - 0.01, g0[2] + s * 0.04], l2 = [g0[0] + 0.045, g0[1] - 0.02, g0[2] + s * 0.11];
      if (k.lod < 2) tube(k, `lever${tag}`, [l0, l1, l2], 0.0045, 'alu', { bend: 0.03, segs: q(6, 5, 4) });
      // 把端圆镜：短杆往后，一面圆镜朝后
      const m0 = [b[0], b[1], b[2] + s * 0.004], m1 = [b[0] - 0.03, b[1] + 0.035, b[2] + s * 0.03];
      if (k.lod < 2) rod(k, `mirrorStem${tag}`, m0, m1, 0.005, 'chrome', { segs: q(6, 5, 4) });
      if (k.lod < 2) turned(k, `mirror${tag}`, [[0, -0.012], [0.03, -0.01, sm], [0.038, 0, sm], [0.036, 0.006], [0, 0.007]], 'chrome', { segs: q(14, 10, 6), place: aim([-1, 0.1, 0], [0, 1, 0], m1) });
      // 刹车油管 / 离合拉线：从把座绕下来顺着前叉
      if (k.lod < 2) {
        const top = [g0[0] + 0.01, g0[1] - 0.01, g0[2] - s * 0.03];
        const low = s > 0 ? [FA[0] + 0.128 * Math.cos(2.2) - 0.01, FA[1] + 0.128 * Math.sin(2.2) + 0.03, 0.08] : at3(ax(0.3), -0.03);
        const path = catmull([top, [top[0] + 0.04, top[1] - 0.08, top[2] - s * 0.05], s > 0 ? at3(fk(0.4), FZ + 0.035) : at3(ax(0.5), -0.08), low], q(4, 3, 2));
        sw(k.sweep({ name: `cable${tag}`, mat: 'mech', shape: circle(0.004, q(5, 4, 3)), path, up: [0, 0, 1] }), 'blackMatte');
      }
    }
    // 转向：前端全部绕转向轴转一点（往左打）
    {
      const a0 = ax(0), steer = rotAbout([D[0], D[1], 0], STEER, [a0[0], a0[1], 0]);
      for (const p of k.parts.slice(nFront0)) p.transform(steer);
    }

    // —————————————— 车架 ——————————————
    const ink = 'blackGloss';
    {
      // 车头管
      const h0 = ax(0.47), h1 = ax(0.69);
      rod(k, 'headTube', at3(h0, 0), at3(h1, 0), 0.027, ink, { segs: q(12, 8, 6) });
      // 大梁：车头管上端 → 座垫前
      rod(k, 'backbone', at3(ax(0.66), 0), [-0.2, 0.775, 0], 0.019, ink, { segs: q(10, 8, 6) });
      // 双摇篮下管：车头管下端 → 发动机前 → 底下 → 后面往上到摆臂轴 → 座垫前
      for (const s of [-1, 1]) {
        const z0 = s * 0.035, z1 = s * 0.075;
        tube(k, `cradle${s > 0 ? 'R' : 'L'}`, [at3(ax(0.5), z0), [0.3, 0.44, z1], [0.25, 0.2, z1], [-0.16, 0.19, z1], [-0.28, 0.27, z1], [-0.28, 0.47, z1], [-0.2, 0.775, s * 0.04]], 0.0145, ink, { bend: 0.07, n: q(3, 2, 1), segs: q(9, 7, 4) });
        // 后副车架斜撑：摆臂轴上方 → 后减震上座
        tube(k, `strut${s > 0 ? 'R' : 'L'}`, [[-0.28, 0.47, z1], [-0.58, 0.785, s * 0.1]], 0.012, ink, { segs: q(8, 6, 5) });
      }
      // 座垫下的两根管子，后面弯成一个环
      tube(k, 'seatLoop', [[-0.2, 0.775, 0.09], [-0.74, 0.8, 0.1], [-0.8, 0.805, 0.05], [-0.8, 0.805, -0.05], [-0.74, 0.8, -0.1], [-0.2, 0.775, -0.09]], 0.012, ink, { bend: 0.05, n: q(5, 3, 2), segs: q(8, 6, 5) });
      // 两块黑色侧盖（座垫下的三角形）
      for (const s of [-1, 1]) {
        const tri = [[-0.23, 0.765], [-0.5, 0.782], [-0.31, 0.5]].map(([x, y]) => [x, y, { r: 0.03, segs: q(3, 2, 1) }]);
        sw(k.extrude({ name: `sidePanel${s > 0 ? 'R' : 'L'}`, mat: 'mech', shape: shape(ccw(tri)), depth: 0.012, bevel: 0.004, bsegs: q(2, 1, 1), xf: xf({ pos: [0, 0, s > 0 ? 0.088 : -0.1] }) }), ink);
      }
    }
    // 后摇臂：方管，从摆臂轴到后轮轴；摆臂轴一根横管
    rod(k, 'pivot', [-0.27, 0.4, -0.13], [-0.27, 0.4, 0.13], 0.013, ink, { segs: q(8, 6, 5) });
    for (const s of [-1, 1]) {
      const z = s * 0.118;
      sw(k.sweep({ name: `swingarm${s > 0 ? 'R' : 'L'}`, mat: 'mech', shape: rect(0.034, 0.022, { r: 0.004, segs: q(2, 1, 1) }), path: [[-0.27, 0.4, z], [RA[0] + 0.02, RA[1], z]], up: [0, 0, 1] }), ink);
      if (k.lod < 2) sw(k.box({ name: `adjuster${s > 0 ? 'R' : 'L'}`, mat: 'mech', size: [0.05, 0.03, 0.012], r: 0.004, segs: q(1, 1, 0), xf: xf({ pos: [RA[0], RA[1], z + s * 0.012] }) }), 'chrome');
    }
    rod(k, 'rearAxle', at3(RA, -0.14), at3(RA, 0.14), 0.01, 'chrome', { segs: q(8, 6, 4) });
    // 后减震：摆臂上 → 后副车架
    for (const s of [-1, 1]) shock(k, `shock${s > 0 ? 'R' : 'L'}`, [-0.655, 0.365, s * 0.125], [-0.58, 0.785, s * 0.125]);

    // —————————————— 后轮、链轮、链条 ——————————————
    wheel(k, 'rear', {
      tire: REAR_TIRE, pos: RA,
      hub: [[0, -0.1], [0.012, -0.1], [0.012, -0.085], [0.045, -0.083], [0.05, -0.07, sm], [0.055, -0.045], [0.055, -0.037], [0.038, -0.033], [0.042, 0, sm], [0.045, 0.028], [0.082, 0.032, sm], [0.086, 0.045, sm], [0.084, 0.07, sm], [0.06, 0.08], [0.02, 0.085], [0.012, 0.1], [0, 0.1]],
    });
    {
      // 42 齿后链轮（齿形一圈平滑顶点，一个图块）
      const n = 42, pts = [];
      for (let i = 0; i < n; i++) {
        const a = (2 * Math.PI * i) / n, da = (2 * Math.PI) / n;
        for (const [f, r] of k.lod < 2 ? [[0.12, 0.097], [0.36, 0.111], [0.64, 0.111], [0.88, 0.097]] : [[0.5, 0.104]]) pts.push([RA[0] + r * Math.cos(a + f * da), RA[1] + r * Math.sin(a + f * da), sm]);
      }
      sw(k.extrude({ name: 'sprocket', mat: 'mech', shape: shape(ccw(pts)), depth: 0.006, xf: xf({ pos: [0, 0, CZ - 0.003] }) }), 'steel');
      // 链条：一圈扁长方形截面沿两个链轮的公切线扫出来，贴图 u = 弧长 / 全长
      const loop = chainLoop(q(16, 10, 6)).map(([x, y]) => [x, y, CZ]);
      let L = 0;
      for (let i = 0; i < loop.length; i++) { const a = loop[i], b = loop[(i + 1) % loop.length]; L += Math.hypot(b[0] - a[0], b[1] - a[1]); }
      const chain = k.sweep({ name: 'chain', mat: 'mech', shape: rect(0.016, 0.008), path: loop, closed: true, caps: [false, false], up: [0, 0, 1] });
      chain.T = chain.T.map(([s, a]) => mechUV('chain', s / L, a / 0.048));
    }

    // —————————————— 发动机 ——————————————
    {
      // 曲轴箱：侧面轮廓挤出，四周倒圆
      const cc = [[-0.25, 0.3, { r: 0.05, segs: q(4, 3, 2) }], [-0.2, 0.235, { r: 0.04, segs: q(4, 3, 2) }], [0.15, 0.235, { r: 0.05, segs: q(4, 3, 2) }], [0.21, 0.35, { r: 0.06, segs: q(5, 3, 2) }], [0.13, 0.47, { r: 0.03, segs: q(3, 2, 1) }], [-0.15, 0.47, { r: 0.04, segs: q(3, 2, 1) }], [-0.26, 0.42, { r: 0.04, segs: q(3, 2, 1) }]];
      sw(k.extrude({ name: 'crankcase', mat: 'mech', shape: shape(ccw(cc)), depth: 0.19, bevel: { w: 0.012, h: 0.012 }, bsegs: q(3, 2, 1), xf: xf({ pos: [0, 0, -0.095] }) }), 'castAlu');
      // 右边盖（抛光）和上面的圆铭牌
      const cover = [[-0.2, 0.3, { r: 0.05, segs: q(4, 3, 2) }], [-0.12, 0.26, { r: 0.04, segs: q(3, 2, 1) }], [0.13, 0.27, { r: 0.07, segs: q(5, 3, 2) }], [0.15, 0.4, { r: 0.05, segs: q(4, 3, 2) }], [0.02, 0.445, { r: 0.04, segs: q(3, 2, 1) }], [-0.19, 0.42, { r: 0.04, segs: q(3, 2, 1) }]];
      sw(k.extrude({ name: 'coverR', mat: 'mech', shape: shape(ccw(cover)), depth: 0.024, bevel: { w: 0.01, h: 0.01 }, bsegs: q(3, 2, 1), xf: xf({ pos: [0, 0, 0.09] }) }), 'alu');
      const logo = k.lathe({ name: 'logo', mat: 'mech', segs: q(24, 16, 10), profile: profile([[0.052, -0.002], [0.052, 0.001, sm], [0.049, 0.004], [0, 0.004]]) });
      logo.T = logo.T.map((t, i) => (logo.N[i][1] > 0.9 ? mechUV('engine', 0.5 + t[0] / 0.13, 0.5 + t[1] / 0.13) : mechUV('engine', 0.5, 0.02)));
      logo.transform(xf({ pos: [0.06, 0.355, 0.114], rot: [Math.PI / 2, 0, 0] }));
      // 左边：发电机盖（抛光圆盖）、链轮罩（黑）
      turned(k, 'alternator', [[0.078, 0], [0.078, 0.012, sm], [0.07, 0.024, sm], [0.04, 0.03, sm], [0, 0.031]], 'alu', { segs: q(22, 14, 10), place: xf({ pos: [0.085, 0.345, -0.092], rot: [-Math.PI / 2, 0, 0] }) });
      const sc = [[-0.26, 0.3, { r: 0.05, segs: q(4, 3, 2) }], [-0.14, 0.28, { r: 0.04, segs: q(3, 2, 1) }], [-0.12, 0.41, { r: 0.04, segs: q(3, 2, 1) }], [-0.25, 0.42, { r: 0.04, segs: q(3, 2, 1) }]];
      sw(k.extrude({ name: 'sprocketCover', mat: 'mech', shape: shape(ccw(sc)), depth: 0.04, bevel: { w: 0.008, h: 0.008 }, bsegs: q(2, 1, 1), xf: xf({ pos: [0, 0, -0.132] }) }), 'blackMatte');
      // 气缸（两缸一体）和缸头：往前倾 12°，一圈圈散热片
      const tilt = (12 * Math.PI) / 180, cax = [Math.sin(tilt), Math.cos(tilt), 0], cx = [Math.cos(tilt), -Math.sin(tilt), 0];
      const base = [0.02, 0.455, 0];
      const alongAxis = (h) => [base[0] + cax[0] * h, base[1] + cax[1] * h, 0];
      const fin = (name, h, w, d, t, r) => sw(k.extrude({ name, mat: 'mech', shape: rect(w, d, { r, segs: q(3, 2, 1) }), depth: t, axis: 'y', xf: frame(cx, cax, [0, 0, 1], alongAxis(h)).mul(xf({ pos: [0, -t / 2, 0] })) }), 'castAlu');
      sw(k.extrude({ name: 'barrel', mat: 'mech', shape: rect(0.11, 0.2, { r: 0.03, segs: q(3, 2, 1) }), depth: 0.2, axis: 'y', caps: [false, false], xf: frame(cx, cax, [0, 0, 1], alongAxis(0)) }), 'castAlu');
      const nf = q(8, 6, 4);
      for (let i = 0; i < nf; i++) fin(`fin${i}`, 0.02 + (0.13 * i) / (nf - 1), 0.15, 0.25, 0.004, 0.03);
      // 缸头：一块厚的，三道散热片，上面两个抛光的气门室盖
      sw(k.extrude({ name: 'head', mat: 'mech', shape: rect(0.13, 0.23, { r: 0.035, segs: q(3, 2, 1) }), depth: 0.06, axis: 'y', bevel: { w: 0.006, h: 0.006 }, bsegs: q(2, 1, 1), xf: frame(cx, cax, [0, 0, 1], alongAxis(0.17)) }), 'castAlu');
      if (k.lod < 2) for (let i = 0; i < 3; i++) fin(`headFin${i}`, 0.18 + 0.02 * i, 0.16, 0.27, 0.0035, 0.035);
      if (k.lod < 2) for (const s of [-1, 1]) sw(k.box({ name: `rocker${s > 0 ? 'R' : 'L'}`, mat: 'mech', size: [0.1, 0.035, 0.085], r: 0.014, segs: q(3, 2, 1), xf: frame(cx, cax, [0, 0, 1], alongAxis(0.245)).mul(xf({ pos: [0, 0, s * 0.05] })) }), 'alu');
      // 两个化油器（在缸头后面，朝后）和黑色的锥形空滤
      if (k.lod < 2) for (const s of [-1, 1]) {
        const p0 = alongAxis(0.2), c0 = [p0[0] - 0.07, p0[1] - 0.005, s * 0.055];
        turned(k, `carb${s > 0 ? 'R' : 'L'}`, [[0.016, 0], [0.024, 0.005, sm], [0.026, 0.02, sm], [0.022, 0.05], [0.02, 0.07], [0, 0.071]], 'castAlu', { segs: q(10, 8, 6), place: aim([-1, -0.12, 0], [0, 1, 0], c0) });
        turned(k, `filter${s > 0 ? 'R' : 'L'}`, [[0.02, 0], [0.034, 0.012, sm], [0.04, 0.05, sm], [0.036, 0.075, sm], [0, 0.08]], 'blackMatte', { segs: q(12, 8, 6), place: aim([-1, -0.12, 0], [0, 1, 0], [c0[0] - 0.068, c0[1] - 0.008, c0[2]]) });
      }
      // 排气：两根镀铬排气管从缸头前面出来，绕到发动机前面往下，再从两侧往后接豌豆枪消音器
      for (const s of [-1, 1]) {
        const tag = s > 0 ? 'R' : 'L', port = alongAxis(0.2);
        const p0 = [port[0] + 0.07, port[1] - 0.01, s * 0.055];
        const path = [p0, [p0[0] + 0.07, p0[1] - 0.04, s * 0.07], [0.3, 0.38, s * 0.115], [0.25, 0.235, s * 0.14], [0.05, 0.225, s * 0.16], [-0.34, 0.25, s * 0.17]];
        tube(k, `header${tag}`, path, 0.019, 'chrome', { bend: 0.07, n: q(4, 3, 1), segs: q(9, 7, 4) });
        const m0 = [-0.33, 0.249, s * 0.17], dir = [-1, 0.13, 0];
        turned(k, `muffler${tag}`, [[0.019, 0], [0.024, 0.04, sm], [0.034, 0.3, sm], [0.044, 0.52, sm], [0.046, 0.535], [0.036, 0.54], [0.03, 0.535], [0, 0.534]], 'chrome', { segs: q(14, 10, 6), place: aim(dir, [0, 1, 0], m0) });
      }
    }

    // —————————————— 油箱、座垫、尾罩 ——————————————
    {
      const n = q(20, 14, 10), yBB = (x) => 0.775 + ((x + 0.2) * 0.105) / 0.6;
      // 截面控制点：x、顶高、半宽
      const key = [[0.36, 0.905, 0.1], [0.3, 0.945, 0.135], [0.2, 0.975, 0.152], [0.08, 0.982, 0.156], [-0.04, 0.962, 0.138], [-0.13, 0.925, 0.122], [-0.19, 0.878, 0.11]];
      const rings = [];
      const tip = (x, top, w, sc, dx) => { const bot = yBB(x) - 0.015, yc = (top + bot) / 2; return ring(x + dx, yc, w * sc, ((top - bot) / 2) * sc, 2.6, n, 0.7); };
      rings.push(tip(key[0][0], key[0][1], key[0][2], 0.25, 0.022), tip(key[0][0], key[0][1], key[0][2], 0.7, 0.014));
      for (const [x, top, w] of key) { const bot = yBB(x) - 0.015; rings.push(ring(x, (top + bot) / 2, w, (top - bot) / 2, 2.6, n, 0.7)); }
      const e = key[key.length - 1];
      rings.push(tip(e[0], e[1], e[2], 0.7, -0.012), tip(e[0], e[1], e[2], 0.25, -0.02));
      paintedLoft(k, 'tank', rings);
      // 两侧徽章
      if (k.lod < 2) for (const s of [-1, 1]) {
        const x = 0.1, top = 0.98, bot = yBB(x) - 0.015, y = (top + bot) / 2 + 0.012;
        const oval = Array.from({ length: q(16, 12, 8) }, (_, i) => { const a = (2 * Math.PI * i) / q(16, 12, 8); return [0.054 * Math.cos(a), 0.024 * Math.sin(a), sm]; });
        const badge = k.extrude({ name: `badge${s > 0 ? 'R' : 'L'}`, mat: 'mech', shape: shape(ccw(oval)), depth: 0.004 });
        badge.T = badge.P.map(([bx, by]) => mechUV('badge', 0.5 + bx / 0.12, 0.5 - by / 0.06));
        badge.transform(frame([s, 0, 0], [0, 1, 0], [0, 0, s], [x, y, s * 0.151]).mul(xf({ rot: [-0.18, 0, 0] })));
      }
      // 镀铬油箱盖
      if (k.lod < 2) turned(k, 'fillerCap', [[0.034, -0.006], [0.036, 0.004, sm], [0.03, 0.012, sm], [0.012, 0.016, sm], [0, 0.017]], 'chrome', { segs: q(16, 12, 8), place: xf({ pos: [0.2, 0.972, 0] }) });
      // 座垫（干邑色皮）
      const seat = [];
      const ns = q(16, 12, 8);
      const skey = [[-0.17, 0.8, 0.08, 0.02], [-0.2, 0.823, 0.118, 0.025], [-0.3, 0.83, 0.126, 0.027], [-0.42, 0.834, 0.128, 0.027], [-0.53, 0.835, 0.126, 0.026], [-0.56, 0.826, 0.1, 0.02]];
      for (const [x, yc, w, h] of skey) seat.push(ring(x, yc, w, h, 3, ns, 1));
      k.loft({ name: 'seat', mat: 'leather', rings: seat });
      // 驼峰尾罩（和油箱同样的漆面、条纹接着往后走），尾灯
      const cowl = [];
      const ckey = [[-0.54, 0.818, 0.06, 0.012], [-0.565, 0.85, 0.12, 0.045], [-0.62, 0.862, 0.128, 0.062], [-0.7, 0.855, 0.118, 0.058], [-0.78, 0.84, 0.095, 0.045], [-0.83, 0.832, 0.06, 0.03], [-0.845, 0.83, 0.02, 0.01]];
      for (const [x, yc, w, h] of ckey) cowl.push(ring(x, yc, w, h, 2.4, n, 0.55));
      paintedLoft(k, 'cowl', cowl, { u0: 0.02, u1: 0.5 });   // 只用漆面前半截（有条纹、没有护膝胶垫）
      turned(k, 'tailLight', [[0, 0], [0.022, 0], [0.024, 0.01, sm], [0.02, 0.018, sm], [0, 0.02]], 'tail', { segs: q(12, 8, 6), place: aim([-1, -0.1, 0], [0, 1, 0], [-0.84, 0.835, 0]) });
    }

    // —————————————— 脚踏、侧撑 ——————————————
    if (k.lod < 2) for (const s of [-1, 1]) {
      const tag = s > 0 ? 'R' : 'L';
      sw(k.box({ name: `pegPlate${tag}`, mat: 'mech', size: [0.1, 0.07, 0.008], r: 0.003, segs: q(1, 1, 0), xf: xf({ pos: [-0.3, 0.4, s * 0.125], rot: [0, 0, 0.3] }) }), 'alu');
      turned(k, `peg${tag}`, [[0, 0], [0.011, 0], [0.012, 0.01, sm], [0.012, 0.07, sm], [0.01, 0.078], [0, 0.079]], 'rubber', { segs: q(8, 6, 4), place: xf({ pos: [-0.32, 0.37, s * 0.125], rot: [s * Math.PI / 2, 0, 0] }) });
    }
    {
      // 侧撑：车身歪了 LEAN 以后，撑脚要正好落在地面上（歪之前在 y = |z|·tan|LEAN| 处）
      const foot = [-0.04, 0.3 * Math.tan(-LEAN), -0.3], pivot = [-0.12, 0.27, -0.095];
      rod(k, 'kickstand', pivot, [foot[0], foot[1] + 0.008, foot[2]], 0.01, ink, { segs: q(8, 6, 4) });
      sw(k.box({ name: 'kickFoot', mat: 'mech', size: [0.05, 0.008, 0.03], r: 0.003, segs: q(1, 1, 0), xf: xf({ pos: [foot[0], foot[1] + 0.004, foot[2]], rot: [LEAN, 0, 0] }) }), ink);
    }

    // —————————————— 整车往左歪 ——————————————
    const lean = xf({ rot: [LEAN, 0, 0] });
    for (const p of k.parts) p.transform(lean);
  },
};
