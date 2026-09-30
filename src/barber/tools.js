import { shape, profile, circle, rect } from '../core/shape.js';
import { xf } from '../core/vec.js';
import { barberUV, barberSwatch } from '../materials/atlas.js';
import { sw, put, rod, turned, mapUV, aim, ccw, catmull } from './parts.js';

// 理发台上的小工具：梳子、推子、剪刀、剃刀、剃须杯和剃须刷、发蜡、喷水壶、扫碎发的毛刷、叠好的毛巾、泡梳子的消毒液罐
const sm = { smooth: true };
const q3 = (k, ...v) => k.q(...v);

// —— 梳子：扁平的轮廓挤出（上面一条梳背、下面一排梳齿），沿局部 x 长 L、梳齿朝 -y，厚 t（z 方向居中）。
//    原点在梳子的中心。轮廓全是平滑顶点：整圈侧面一个图块（梳齿只有 1 ~ 2mm，法线平均一下看不出来）
export function comb(k, name, { L = 0.17, H = 0.028, t = 0.004, spine = 0.011, pitch = 0.0075, place = null, swatch = 'comb' } = {}) {
  const p = k.lod === 0 ? pitch : k.lod === 1 ? pitch * 2 : 0;
  const x0 = -L / 2, x1 = L / 2, yb = -H / 2, ys = H / 2 - spine, m = 0.008;
  const pts = [[x0, yb + 0.004], [x0 + m * 0.6, yb]];
  if (p > 0) {
    const n = Math.floor((L - 2 * m) / p), tw = p * 0.55, xs = x0 + (L - n * p) / 2;
    for (let i = 0; i < n; i++) {
      const a = xs + i * p;
      if (i > 0) pts.push([a - (p - tw) + 0.0002, ys], [a - 0.0002, ys]);
      pts.push([a + 0.0003, yb], [a + tw - 0.0003, yb]);
    }
  }
  pts.push([x1 - m * 0.6, yb], [x1, yb + 0.004], [x1, H / 2 - 0.003], [x1 - 0.004, H / 2], [x0 + 0.004, H / 2], [x0, H / 2 - 0.003]);
  const part = k.extrude({ name, mat: 'barber', shape: shape(ccw(pts.map(([x, y]) => [x, y, sm]))), depth: t, center: true, bevel: 0 });
  return put(sw(part, swatch), place);
}

// —— 推子：机身是一串圆角方截面沿局部 +x 放样（尾巴粗、往刀头收窄变扁），刀头是上下两片钢刀，侧面一根镀铬的调节杆，
//    尾巴一截黑色护线套。原点在机身底面的中心，平躺（机身背面朝下）；返回电线出口的位置（局部坐标）
export function clippers(k, name, { place = null } = {}) {
  const n = q3(k, 16, 10, 6), parts = [];
  // [x, 宽（z）, 高（y）]
  const secs = [[-0.078, 0.036, 0.028], [-0.07, 0.046, 0.036], [-0.045, 0.052, 0.04], [0, 0.054, 0.041], [0.035, 0.05, 0.037], [0.058, 0.046, 0.03], [0.068, 0.044, 0.024]];
  const rings = secs.map(([x, w, h]) => Array.from({ length: n }, (_, j) => {
    const a = (2 * Math.PI * j) / n + Math.PI, c = Math.cos(a), s = Math.sin(a);
    const f = (v) => Math.sign(v) * Math.abs(v) ** 0.5;   // 方一点的圆（超椭圆）
    return [x, h / 2 + (h / 2) * f(s), (w / 2) * f(c)];
  }));
  parts.push(sw(k.loft({ name: `${name}Body`, mat: 'barber', rings, caps: [true, true] }), 'clipperBlack'));
  // 刀头：下面一片宽的定刀（带齿的一边朝前）、上面一片窄的动刀
  parts.push(sw(k.box({ name: `${name}BladeA`, mat: 'barber', size: [0.02, 0.004, 0.046], r: 0.001, segs: q3(k, 1, 1, 0), xf: xf({ pos: [0.077, 0.007, 0] }) }), 'blade'));
  parts.push(sw(k.box({ name: `${name}BladeB`, mat: 'barber', size: [0.014, 0.004, 0.04], r: 0.001, segs: q3(k, 1, 1, 0), xf: xf({ pos: [0.074, 0.011, 0] }) }), 'steel'));
  if (k.lod < 2) {
    parts.push(sw(k.box({ name: `${name}Lever`, mat: 'barber', size: [0.03, 0.006, 0.006], r: 0.002, segs: 1, xf: xf({ pos: [0.03, 0.016, 0.027], rot: [0, 0.25, 0] }) }), 'chrome'));
    parts.push(sw(k.box({ name: `${name}Switch`, mat: 'barber', size: [0.016, 0.004, 0.012], r: 0.0015, segs: 1, xf: xf({ pos: [-0.03, 0.041, 0] }) }), 'chrome'));
  }
  parts.push(turned(k, `${name}Boot`, [[0.012, 0], [0.011, 0.012, sm], [0.007, 0.024, sm], [0.0055, 0.03], [0, 0.03]], 'cord', { segs: q3(k, 10, 8, 6), place: aim([-1, 0, 0], [0, 1, 0], [-0.075, 0.014, 0]) }));
  put(parts, place);
  return [-0.105, 0.014, 0];
}

// —— 剪刀（理发剪）：两片刀身 + 刀柄是扁平轮廓挤出（平躺，厚度沿 y），指环是圆截面绕一圈，一片带小尾钩；
//    open 是张开的角度（弧度）。原点在轴钉，刀尖朝局部 +x
export function shears(k, name, { open = 0.12, place = null } = {}) {
  const parts = [], t = 0.0022;
  // 一片：刀身（刀尖朝 +x）+ 刀柄（往后斜出到指环），y 轴向上翻折（side = ±1）
  const half = (side, tag) => {
    const S = side;
    const blade = [[-0.008, 0.004 * S], [0.02, 0.0045 * S, sm], [0.06, 0.0035 * S, sm], [0.094, 0.0008 * S], [0.096, 0], [0.06, -0.0012 * S, sm], [0.02, -0.0022 * S, sm], [0, -0.0035 * S],
      [-0.03, -0.0065 * S, sm], [-0.052, -0.0105 * S], [-0.056, -0.0065 * S], [-0.032, -0.0015 * S, sm]];
    const sh = shape(ccw(blade.map(([x, y, o]) => (o ? [x, -y, o] : [x, -y]))));
    const p = sw(k.extrude({ name: `${name}Blade${tag}`, mat: 'barber', shape: sh, depth: t, axis: 'y', xf: xf({ pos: [0, S > 0 ? t : 0, 0] }) }), 'chrome');
    const ringC = [-0.066, 0, -0.0135 * S], rr = S > 0 ? 0.0105 : 0.0092;
    const ring = Array.from({ length: q3(k, 14, 10, 8) }, (_, i) => { const a = (2 * Math.PI * i) / q3(k, 14, 10, 8); return [ringC[0] + rr * Math.cos(a), t, ringC[2] + rr * Math.sin(a)]; });
    const rg = sw(k.sweep({ name: `${name}Ring${tag}`, mat: 'barber', shape: circle(0.0023, q3(k, 6, 5, 4)), path: ring, closed: true, caps: [false, false], up: [0, 1, 0] }), 'chrome');
    const g = [p, rg];
    if (S > 0 && k.lod < 2) {
      // 指环后面的小尾钩（小指托）
      const hook = catmull([[-0.074, t, -0.022], [-0.082, t, -0.03], [-0.084, t, -0.04], [-0.078, t, -0.046]], 3);
      g.push(sw(k.sweep({ name: `${name}Tang`, mat: 'barber', shape: circle(0.0018, 5), path: hook, caps: [true, true], up: [0, 1, 0] }), 'chrome'));
    }
    return put(g, xf({ rot: [0, (S * open) / 2, 0] }));
  };
  parts.push(...half(1, 'A'), ...half(-1, 'B'));
  parts.push(turned(k, `${name}Pivot`, [[0, -0.0005], [0.0032, -0.0005], [0.0034, 2 * t + 0.0006, sm], [0.002, 2 * t + 0.0012], [0, 2 * t + 0.0013]], 'steel', { segs: q3(k, 10, 8, 6) }));
  return put(parts, place);
}

// —— 折叠剃刀（打开的）：钢刀片（刀背直、刃口弧形、后面的刀尾）+ 两片象牙色的柄（中间夹着一道缝），两颗铜钉。
//    平躺，原点在刀轴，刀片朝局部 +x、柄朝 -x（稍微折一点角）
export function razor(k, name, { place = null } = {}) {
  const parts = [], t = 0.0018;
  const blade = [[-0.012, 0.004], [0, 0.005], [0.06, 0.0055, sm], [0.068, 0.004, sm], [0.07, -0.004, sm], [0.066, -0.013, sm], [0.04, -0.0165, sm], [0.008, -0.014, sm], [0, -0.006], [-0.012, -0.002]];
  parts.push(sw(k.extrude({ name: `${name}Blade`, mat: 'barber', shape: shape(ccw(blade.map(([x, y, o]) => (o ? [x, -y, o] : [x, -y])))), depth: t, axis: 'y', xf: xf({ pos: [0, 0.0035, 0] }) }), 'steel'));
  // 柄：两头圆的长条，往后稍微折 10°
  const handle = [[0.006, 0.006, sm], [-0.03, 0.0075, sm], [-0.1, 0.0065, sm], [-0.114, 0.002, sm], [-0.114, -0.004, sm], [-0.1, -0.0085, sm], [-0.03, -0.009, sm], [0.006, -0.006, sm], [0.011, 0, sm]];
  const hs = shape(ccw(handle.map(([x, y, o]) => [x, -y, o])));
  for (const [i, y0] of [[0, 0], [1, 0.0055]]) {
    parts.push(sw(k.extrude({ name: `${name}Scale${i}`, mat: 'barber', shape: hs, depth: 0.0033, axis: 'y', bevel: { w: 0.0008, h: 0.0008 }, xf: xf({ pos: [0, y0, 0], rot: [0, -0.17, 0] }) }), 'ivory'));
  }
  for (const [i, x] of [[0, 0], [1, -0.106]]) {
    const c = xf({ rot: [0, -0.17, 0] }).apply([x, 0, 0]);
    parts.push(turned(k, `${name}Pin${i}`, [[0, -0.0002], [0.0022, -0.0002], [0.0022, 0.009], [0, 0.0091]], 'brass', { segs: q3(k, 8, 6, 4), place: xf({ pos: c }) }));
  }
  return put(parts, place);
}

// —— 剃须杯（白瓷，带把手）和立在杯里的獾毛剃须刷（黑柄、深色的毛根、白色的毛尖），杯里一层泡沫。原点在杯底中心
export function shavingMug(k, name, { place = null } = {}) {
  const parts = [], R = 0.042, H = 0.082, w = 0.004;
  parts.push(turned(k, `${name}Mug`, [[0, 0], [R - 0.003, 0], [R, 0.004, sm], [R + 0.001, H - 0.004, sm], [R - w / 2, H, sm], [R - w, H - 0.004, sm], [R - w, 0.012, sm], [R - w - 0.004, 0.008, sm], [0, 0.008]], 'mug', { segs: q3(k, 20, 14, 10) }));
  const hp = catmull([[R - 0.004, H - 0.018, 0], [R + 0.022, H - 0.02, 0], [R + 0.027, H * 0.5, 0], [R + 0.018, 0.022, 0], [R - 0.004, 0.02, 0]], q3(k, 4, 3, 2));
  parts.push(sw(k.sweep({ name: `${name}Handle`, mat: 'barber', shape: rect(0.012, 0.006, { r: 0.0028, segs: 1 }), path: hp, caps: [false, false], up: [0, 0, 1] }), 'mug'));
  parts.push(turned(k, `${name}Lather`, [[0, H - 0.018], [R - w - 0.001, H - 0.018], [R - w - 0.002, H - 0.012, sm], [R * 0.5, H - 0.006, sm], [0, H - 0.004]], 'lather', { segs: q3(k, 16, 10, 8) }));
  // 剃须刷：柄底坐在泡沫里，毛头露出杯口
  const B = H - 0.03;
  parts.push(turned(k, `${name}BrushHandle`, [[0, B], [0.014, B, sm], [0.017, B + 0.018, sm], [0.013, B + 0.04, sm], [0.016, B + 0.05, sm], [0.0135, B + 0.056], [0, B + 0.0565]], 'black', { segs: q3(k, 14, 10, 8) }));
  parts.push(turned(k, `${name}Knot`, [[0, B + 0.056], [0.0125, B + 0.056], [0.017, B + 0.07, sm], [0.021, B + 0.084]], 'badger', { segs: q3(k, 14, 10, 8) }));
  parts.push(turned(k, `${name}KnotTip`, [[0.021, B + 0.084], [0.024, B + 0.1, sm], [0.019, B + 0.114, sm], [0.009, B + 0.12, sm], [0, B + 0.122]], 'badgerTip', { segs: q3(k, 14, 10, 8) }));
  return put(parts, place);
}

// —— 一盒发蜡：圆铁盒，盖子侧面一圈和盖顶的颜色，盖顶贴图集里的印刷（which = 'pomadeA' | 'pomadeB'）。原点在盒底中心
export function pomade(k, name, which, { place = null } = {}) {
  const R = 0.0425, lidColor = which === 'pomadeA' ? 'red' : 'black';
  const p = k.lathe({ name, mat: 'barber', segs: q3(k, 20, 14, 10), profile: profile([[0, 0], [R - 0.0015, 0], [R, 0.0015, sm], [R, 0.024], [R + 0.001, 0.0245], [R + 0.001, 0.034, sm], [R - 0.001, 0.036], [0, 0.036]]) });
  // 盖顶贴印刷的那一格，盖子侧面一圈用格子角上的底色，盒身是镀锡的铁皮
  const tin = barberSwatch('steel');
  mapUV(p, (pos, n) => (n[1] > 0.9 && pos[1] > 0.035 ? barberUV(which, 0.5 + pos[0] / 0.085, 0.5 + pos[2] / 0.085) : pos[1] > 0.0242 ? barberUV(which, 0.02, 0.02) : tin));
  return put(p, place);
}

// —— 喷水壶：塑料瓶身（车削），黑色扳机喷头（侧面轮廓挤出）+ 扳机 + 喷嘴。原点在瓶底中心，喷嘴朝局部 +x
export function sprayBottle(k, name, { place = null } = {}) {
  const parts = [];
  parts.push(turned(k, `${name}Body`, [[0, 0], [0.03, 0], [0.032, 0.005, sm], [0.032, 0.13, sm], [0.026, 0.148, sm], [0.014, 0.156, sm], [0.014, 0.166]], 'sprayBlue', { segs: q3(k, 16, 12, 8) }));
  const head = [[-0.02, 0.164], [0.014, 0.164], [0.03, 0.172, sm], [0.048, 0.182], [0.048, 0.196], [0.02, 0.206, sm], [-0.012, 0.205, sm], [-0.024, 0.195, sm], [-0.022, 0.176, sm]];
  parts.push(sw(k.extrude({ name: `${name}Head`, mat: 'barber', shape: shape(ccw(head.map(([x, y, o]) => (o ? [x, y, o] : [x, y])))), depth: 0.024, center: true, bevel: { w: 0.003, h: 0.003 }, bsegs: q3(k, 2, 1, 1) }), 'black'));
  const trig = [[0.018, 0.17], [0.026, 0.168], [0.034, 0.15, sm], [0.036, 0.132], [0.03, 0.132], [0.026, 0.152, sm]];
  parts.push(sw(k.extrude({ name: `${name}Trigger`, mat: 'barber', shape: shape(ccw(trig.map(([x, y, o]) => (o ? [x, y, o] : [x, y])))), depth: 0.012, center: true }), 'black'));
  parts.push(turned(k, `${name}Nozzle`, [[0, 0], [0.006, 0], [0.006, 0.01], [0.0045, 0.012], [0, 0.012]], 'white', { segs: q3(k, 8, 6, 4), place: aim([1, 0, 0], [0, 1, 0], [0.047, 0.189, 0]) }));
  return put(parts, place);
}

// —— 扫碎发的毛刷：木柄（车削）+ 一大团软毛（车削成圆鼓的一团），平躺。原点在柄尾，刷头朝局部 +x
export function neckDuster(k, name, { place = null } = {}) {
  const parts = [];
  parts.push(turned(k, `${name}Handle`, [[0, 0], [0.008, 0], [0.011, 0.02, sm], [0.009, 0.06, sm], [0.013, 0.1, sm], [0.016, 0.12], [0.02, 0.122], [0.02, 0.13]], 'wood', { segs: q3(k, 12, 8, 6), place: xf({ rot: [0, 0, -Math.PI / 2] }) }));
  parts.push(turned(k, `${name}Head`, [[0.02, 0.13], [0.03, 0.135, sm], [0.038, 0.155, sm], [0.036, 0.175, sm], [0.024, 0.188, sm], [0, 0.192]], 'bristle', { segs: q3(k, 14, 10, 8), place: xf({ rot: [0, 0, -Math.PI / 2] }) }));
  return put(parts, place);
}

// —— 叠好的毛巾：一个扁的软盒子，毛圈贴图；彩条落在前沿、顺着折边拐到前面。原点在底面中心
export function towel(k, name, { w = 0.26, d = 0.19, h = 0.034, place = null } = {}) {
  const p = k.box({ name, mat: 'barber', size: [w, h, d], r: 0.012, segs: q3(k, 2, 1, 1), div: [q3(k, 4, 2, 1), 1, q3(k, 3, 2, 1)], puff: { top: 0.004, side: 0.002 }, xf: xf({ pos: [0, h / 2, 0] }) });
  // 毛巾区域 0.3 × 0.3m：彩条在 y ≈ 0.24 ~ 0.276；顶面 y = 0.25 - (前沿到这一点的距离)，前面 y = 0.25 + (离顶面的距离)
  mapUV(p, (pos, n) => {
    const u = (pos[0] + w / 2) / 0.3 + 0.05;
    if (n[2] > 0.6) return barberUV('towel', u, (0.25 + (h - pos[1])) / 0.3);
    return barberUV('towel', u, (0.25 - (d / 2 - pos[2])) / 0.3);
  });
  return put(p, place);
}

// —— 消毒液罐：透明玻璃圆筒（有壁厚）、蓝色的消毒液、泡在里面的几把梳子，正面一段标签（盖子摘下来放在旁边，由理发台摆）。
//    原点在罐底中心
export const JAR = { r: 0.055, h: 0.2, wall: 0.003, floor: 0.012, fill: 0.16 };
export function disinfectantJar(k, name, { place = null } = {}) {
  const { r, h, wall, floor, fill } = JAR, ri = r - wall, parts = [];
  parts.push(k.lathe({ name, mat: 'bar_glass', segs: q3(k, 24, 16, 10), profile: profile([
    [0, 0], [r - 0.003, 0], [r, 0.003, sm], [r, h - 0.001, sm], [r - wall / 2, h, sm], [ri, h - 0.001, sm], [ri, floor + 0.003, sm], [ri - 0.003, floor, sm], [0, floor],
  ]) }));
  const e = 0.0006;
  parts.push(k.lathe({ name: `${name}Liquid`, mat: 'disinfectant', segs: q3(k, 24, 16, 10), profile: profile([[0, floor + e], [ri - 0.003, floor + e, sm], [ri - e, floor + 0.003, sm], [ri - e, fill], [0, fill]]) }));
  // 标签：正面三分之一圈（一段圆弧沿高度挤出），u 沿弧长、v 沿高度
  {
    const n = q3(k, 8, 6, 4), a0 = Math.PI / 2 - 0.62, a1 = Math.PI / 2 + 0.62, rl = r + 0.0004;
    const arc = Array.from({ length: n + 1 }, (_, i) => { const a = a0 + ((a1 - a0) * i) / n; return [rl * Math.cos(a), -rl * Math.sin(a), sm]; }).reverse();
    const y0 = 0.06, lh = 0.032;
    const lab = k.extrude({ name: `${name}Label`, mat: 'barber', shape: shape(arc, { closed: false }), depth: lh, axis: 'y', caps: [false, false], xf: xf({ pos: [0, y0, 0] }) });
    mapUV(lab, (p) => barberUV('jarLabel', 0.5 + Math.atan2(p[0], p[2]) / 1.24, 1 - (p[1] - y0) / lh));
    parts.push(lab);
  }
  // 泡着的梳子：几把竖着插在罐里，稍微歪一点，梳齿朝下
  const combs = [[-0.02, 0.012, 0.12, 0.1], [0.018, -0.01, -0.1, -0.08], [0.004, 0.022, 0.05, 0.2], [-0.006, -0.02, -0.02, -0.18]];
  combs.forEach(([x, z, tilt, yaw], i) => {
    const L = 0.17;
    parts.push(comb(k, `${name}Comb${i}`, { L, H: 0.026, place: xf({ pos: [x, floor + 0.03 + L / 2, z], rot: [0, yaw, Math.PI / 2 + tilt] }) }));
  });
  return put(parts, place);
}
