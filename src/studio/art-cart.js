import { shape, rect, circle, profile } from '../core/shape.js';
import { xf } from '../core/vec.js';
import { roundedPath } from '../core/path.js';
import { studioUV, studioSwatch } from '../materials/atlas.js';
import { sw, mapUV, ccw, brush, tube, tubeRest, tubeCap } from './parts.js';

// 颜料推车：一辆薄荷绿的三层金属小推车，上面是画画的家当。
//   · 车：三层冲压的圆角托盘（薄底板 + 一圈矮墙 + 卷边），两侧各一副倒 U 形的圆管架，底下四个万向轮（轮子各朝各的方向）；
//     顶层托盘的边很矮，是个台面：
//   · 顶层：一块腰果形的调色板（木头上一圈颜料堆、中间调过色的抹痕，贴图里的；侧边有个穿大拇指的孔和豁口），
//     上面搁一把弯柄的调色刀；一个铁皮罐子插满画笔；一个玻璃罐的洗笔水（已经浑了），里面泡着一支笔；
//   · 中层：五支颜料管（标签印着颜色名，有的挤扁了，有一支拧开了盖子、螺口上挤出一截群青），一团擦过颜料的抹布；
//   · 底层：两本黑面速写本（红色松紧带），一瓶亚麻仁油（棕色玻璃瓶）。
// 原点在四个轮子中心的地面上，推车长边沿 x。
const CART = { w: 0.62, d: 0.42, r: 0.035 };
const TIERS = [{ name: 'low', y: 0.15, h: 0.075 }, { name: 'mid', y: 0.46, h: 0.075 }, { name: 'top', y: 0.77, h: 0.028 }];
const PLATE = 0.0015;
const FRAME = { r: 0.011, z: 0.16, top: 0.88, bend: 0.06 };
const WHEEL = { r: 0.03, w: 0.02, top: 0.08 };
const floorOf = (t) => TIERS[t].y + PLATE;

export default {
  id: 'art_cart',
  name: '颜料推车',
  nameEn: 'Art Supply Cart',
  category: 'studio',
  aoDensity: 300,
  shadow: { margin: 0.12, maxDist: 0.5, density: 110 },
  view: { el: 24, az: 28 },
  build(k) {
    const q = (...v) => k.q(...v);
    const sm = { smooth: true };
    const { w: W, d: D, r: RC } = CART;

    // —— 三层托盘 ——
    const loop = (Y) => roundedPath([[0, Y, -D / 2], [W / 2, Y, -D / 2], [W / 2, Y, D / 2], [-W / 2, Y, D / 2], [-W / 2, Y, -D / 2], [0, Y, -D / 2]], [0, RC, RC, RC, RC, 0], q(4, 3, 2)).slice(0, -1);
    for (const t of TIERS) {
      sw(k.extrude({ name: `${t.name}Plate`, mat: 'studio', shape: rect(W - 0.001, D - 0.001, { r: RC, segs: q(4, 3, 2) }), depth: PLATE, axis: 'y', xf: xf({ pos: [0, t.y, 0] }) }), 'mint');
      sw(k.sweep({ name: `${t.name}Wall`, mat: 'studio', shape: rect(0.0016, t.h), path: loop(t.y + t.h / 2), closed: true, caps: [false, false], up: [0, 1, 0] }), 'mint');
      if (k.lod < 2) sw(k.sweep({ name: `${t.name}Rim`, mat: 'studio', shape: circle(0.0032, q(6, 4, 3)), path: loop(t.y + t.h), closed: true, caps: [false, false], up: [0, 1, 0] }), 'mint');
    }

    // —— 两侧的倒 U 形圆管架，托盘在每根立管上用一个卡箍固定 ——
    const xs = W / 2 + FRAME.r;
    for (const s of [-1, 1]) {
      const path = roundedPath([[s * xs, WHEEL.top, -FRAME.z], [s * xs, FRAME.top, -FRAME.z], [s * xs, FRAME.top, FRAME.z], [s * xs, WHEEL.top, FRAME.z]], [0, FRAME.bend, FRAME.bend, 0], q(6, 4, 2));
      sw(k.sweep({ name: `frame${s > 0 ? 'R' : 'L'}`, mat: 'studio', shape: circle(FRAME.r, q(10, 7, 5)), path, caps: [false, false], up: [s, 0, 0] }), 'mint');
      for (const z of [-FRAME.z, FRAME.z]) {
        if (k.lod < 2) {
          for (const t of TIERS) {
            sw(k.lathe({ name: `clip${s > 0 ? 'R' : 'L'}${z > 0 ? 'F' : 'B'}${t.name}`, mat: 'studio', segs: q(10, 8), profile: profile([[0.0138, t.y + t.h - 0.02], [0.0138, t.y + t.h + 0.002]]), xf: xf({ pos: [s * xs, 0, z] }) }), 'mint');
          }
        }
        caster(k, `caster${s > 0 ? 'R' : 'L'}${z > 0 ? 'F' : 'B'}`, xf({ pos: [s * xs, 0, z], rot: [0, (s * 0.7 + z * 4.1) % Math.PI, 0] }));
      }
    }

    // ——————————— 顶层 ———————————
    const yTop = floorOf(2);
    palette(k, xf({ pos: [-0.09, yTop, 0.0], rot: [0, 0.1, 0] }));
    paletteKnife(k, xf({ pos: [-0.02, yTop + 0.006, 0.075], rot: [0, 0.55, 0] }));
    // 铁皮罐子插画笔
    {
      const c = [0.225, yTop, -0.1];
      sw(k.lathe({
        name: 'can', mat: 'studio', segs: q(16, 11, 6),
        profile: profile([[0, 0.0005], [0.0395, 0.0005, { r: 0.003, segs: 1 }], [0.041, 0.004], [0.041, 0.03, sm], [0.0418, 0.033, sm], [0.041, 0.036, sm], [0.041, 0.08, sm], [0.0418, 0.083, sm], [0.041, 0.086, sm], [0.041, 0.114], [0.0426, 0.1155, sm], [0.041, 0.117], [0.0402, 0.1155], [0.0402, 0.006], [0, 0.006]]),
        xf: xf({ pos: c }),
      }), 'aluminum');
      const B = [
        [0.3, 0.0045, 'handleRed', 'lilac'], [0.26, 0.0038, 'handleWood', 'paintBlue'], [0.33, 0.005, 'handleBlack', 'paintYellow'], [0.24, 0.0034, 'handleRed', 'paintGreen'],
        [0.285, 0.004, 'handleWood', 'paintRed'], [0.31, 0.0046, 'handleBlack', 'bristle'], [0.22, 0.0032, 'handleWood', 'lilac'],
      ];
      const tau = Math.atan2(0.047, 0.109);
      B.forEach(([L, R, handle, tip], i) => {
        const th = (i * 2 * Math.PI) / B.length + 0.3 + 0.2 * Math.sin(i * 7.1);
        const base = [c[0] - 0.013 * Math.cos(th), c[1] + 0.0065, c[2] - 0.013 * Math.sin(th)];
        brush(k, `canBrush${i}`, { L, R, handle, tip, place: xf({ pos: base, rot: [0, Math.PI / 2 - th, 0] }).mul(xf({ rot: [tau * (0.85 + 0.15 * Math.cos(i * 3.3)), 0, 0] })) });
      });
    }
    // 洗笔水：玻璃罐（外壁上去、口沿翻过来、内壁下来），浑水，泡着一支笔
    {
      const c = [0.22, yTop, 0.1];
      k.lathe({
        name: 'jar', mat: 'glass', segs: q(16, 11, 6),
        profile: profile([[0, 0], [0.035, 0, { r: 0.004, segs: 1 }], [0.036, 0.075, sm], [0.031, 0.088, sm], [0.029, 0.092], [0.029, 0.104], [0.0275, 0.106, sm], [0.027, 0.104], [0.027, 0.093], [0.0335, 0.083, sm], [0.0335, 0.004], [0, 0.004]]),
        xf: xf({ pos: c }),
      });
      sw(k.lathe({ name: 'water', mat: 'studio', segs: q(16, 12, 8), profile: profile([[0, 0.0045], [0.0332, 0.0045], [0.0332, 0.066], [0, 0.066]]), xf: xf({ pos: c }) }), 'murky');
      // 笔头朝下泡在水里：笔尖在罐底靠 th 一侧，笔杆斜着从罐口另一侧伸出来
      const th = 0.9, tau = Math.atan2(0.046, 0.1), L = 0.28;
      const dir = [Math.sin(tau) * Math.cos(th), -Math.cos(tau), Math.sin(tau) * Math.sin(th)];
      const tipP = [c[0] + 0.022 * Math.cos(th), c[1] + 0.006, c[2] + 0.022 * Math.sin(th)];
      brush(k, 'jarBrush', { L, R: 0.0042, handle: 'handleBlack', tip: 'lilac', place: xf({ pos: tipP.map((v, i) => v - L * dir[i]), rot: [0, Math.PI / 2 - th, 0] }).mul(xf({ rot: [Math.PI - tau, 0, 0] })) });
    }

    // ——————————— 中层：颜料管和抹布 ———————————
    const yMid = floorOf(1);
    const rest = tubeRest();
    const lie = (x, z, yaw) => xf({ pos: [x, yMid + rest.y, z], rot: [0, yaw, 0] }).mul(xf({ rot: [0, 0, rest.tilt] }));
    tube(k, 'tube0', { i: 5, capOff: true, blob: 'paintBlue', place: lie(-0.23, 0.07, 0.35) });
    tubeCap(k, 'tube0Cap', xf({ pos: [-0.25, yMid + 0.0076, 0.15], rot: [0, 0.8, Math.PI / 2] }));
    tube(k, 'tube1', { i: 3, squeeze: 0.6, place: lie(-0.13, -0.1, -0.6) });
    tube(k, 'tube2', { i: 2, place: lie(0.0, 0.1, 2.7) });
    tube(k, 'tube3', { i: 0, squeeze: 0.8, place: lie(0.05, -0.08, 1.3) });
    tube(k, 'tube4', { i: 6, place: lie(-0.11, 0.0, 0.12) });
    rag(k, xf({ pos: [0.2, yMid, 0.06], rot: [0, 0.4, 0] }));

    // ——————————— 底层：速写本和亚麻仁油 ———————————
    const yLow = floorOf(0);
    sketchbook(k, 'bookA', { w: 0.3, t: 0.02, d: 0.21, place: xf({ pos: [-0.12, yLow, 0.0], rot: [0, 0.04, 0] }) });
    sketchbook(k, 'bookB', { w: 0.21, t: 0.016, d: 0.148, place: xf({ pos: [-0.14, yLow + 0.02, 0.01], rot: [0, -0.18, 0] }) });
    {
      const c = [0.19, yLow, -0.05];
      sw(k.lathe({ name: 'bottle', mat: 'studio', segs: q(14, 10, 6), profile: profile([[0, 0], [0.027, 0, { r: 0.004, segs: 1 }], [0.0285, 0.108, sm], [0.022, 0.128, sm], [0.0125, 0.14, sm], [0.011, 0.15]]), xf: xf({ pos: c }) }), 'amber');
      sw(k.lathe({ name: 'bottleLabel', mat: 'studio', segs: q(14, 10, 6), profile: profile([[0.0293, 0.03], [0.0293, 0.08]]), xf: xf({ pos: c }) }), 'paper');
      sw(k.lathe({ name: 'bottleCap', mat: 'studio', segs: q(12, 8, 6), profile: profile([[0.0124, 0.15], [0.0124, 0.169, { r: 0.0015, segs: 1 }], [0, 0.17]]), xf: xf({ pos: c }) }), 'capBlack');
    }
  },
};

// 万向轮：黑色的轮子（轴沿局部 z），两片叉板夹着，往后错开一点；上面一个转盘接立管
function caster(k, name, place) {
  const q = (...v) => k.q(...v);
  const sm = { smooth: true };
  const { r, w, top } = WHEEL, off = 0.016, yh = 0.06;
  sw(k.lathe({ name: `${name}Swivel`, mat: 'studio', segs: q(12, 8, 6), profile: profile([[0, yh - 0.003], [0.018, yh - 0.003, { r: 0.002, segs: 1 }], [0.018, yh + 0.006], [0.0115, yh + 0.009], [0.0115, top + 0.004]]), xf: place }), 'aluminum');
  for (const s of [-1, 1]) {
    sw(k.box({ name: `${name}Fork${s > 0 ? 'R' : 'L'}`, mat: 'studio', size: [0.03, yh - r + 0.008, 0.003], r: q(0.001, 0), segs: q(1, 0), xf: place.mul(xf({ pos: [off / 2, (yh + r) / 2, s * (w / 2 + 0.0025)] })) }), 'aluminum');
  }
  const axle = place.mul(xf({ pos: [off, r, 0], rot: [Math.PI / 2, 0, 0] }));
  sw(k.lathe({ name: `${name}Wheel`, mat: 'studio', segs: q(14, 10, 6), profile: profile([[0.008, -w / 2], [r - 0.005, -w / 2, sm], [r, -w / 2 + 0.005, sm], [r, w / 2 - 0.005, sm], [r - 0.005, w / 2, sm], [0.008, w / 2]]), xf: axle }), 'caster');
  sw(k.lathe({ name: `${name}Hub`, mat: 'studio', segs: q(8, 6, 4), profile: profile([[0.0085, -w / 2 - 0.004], [0.0085, w / 2 + 0.004]]), xf: axle }), 'aluminum');
}

// 调色板：腰果形的一块薄木板，左边一个穿大拇指的孔，孔和板边之间开一道豁口；正面是贴图里的颜料和抹痕
function palette(k, place) {
  const q = (...v) => k.q(...v);
  const { w: PW, h: PH } = { w: 0.4, h: 0.3 };
  const sm = { smooth: true };
  const hc = [-0.128, -0.035], hr = 0.018, slot = 0.006, ts = Math.PI + 0.32;
  const a = PW / 2, b = PH / 2;
  const outer = (th) => [a * Math.cos(th) * (1 - 0.04 * Math.sin(th)), b * Math.sin(th) + 0.012 * Math.cos(2 * th)];
  // 豁口：从拇指孔中心朝板边 outer(ts) 开出去，两条边离中线各 slot；先解出两条边和板边的交点
  const o = outer(ts), ul = Math.hypot(o[0] - hc[0], o[1] - hc[1]);
  const us = [(o[0] - hc[0]) / ul, (o[1] - hc[1]) / ul], nv = [-us[1], us[0]];
  const sd = (t) => { const p = outer(t); return (p[0] - hc[0]) * nv[0] + (p[1] - hc[1]) * nv[1]; };
  const g = Math.sign(sd(ts + 0.01) - sd(ts - 0.01));
  const solve = (t0, t1, target) => {
    for (let i = 0; i < 50; i++) { const tm = (t0 + t1) / 2; if ((sd(tm) - target) * (sd(t0) - target) <= 0) t1 = tm; else t0 = tm; }
    return (t0 + t1) / 2;
  };
  const tLo = solve(ts - 0.4, ts, -slot * g), tHi = solve(ts, ts + 0.4, slot * g);
  const pts = [];
  const no = q(40, 28, 18);
  for (let i = 0; i <= no; i++) pts.push([...outer(tHi + ((tLo + 2 * Math.PI - tHi) * i) / no), i === 0 || i === no ? {} : sm]);
  // 豁口的一条边 → 拇指孔（绕开豁口，走远的那一圈）→ 豁口的另一条边（回到起点）
  const hx = Math.sqrt(hr * hr - slot * slot), as = Math.atan2(us[1], us[0]);
  const sLo = -slot * g, sHi = slot * g;
  const aLo = as + Math.atan2(sLo, hx);
  let aHi = as + Math.atan2(sHi, hx);
  if (sLo < 0) aHi -= 2 * Math.PI; else aHi += 2 * Math.PI;
  const nh = q(14, 10, 6);
  for (let i = 0; i <= nh; i++) {
    const t = aLo + ((aHi - aLo) * i) / nh;
    pts.push([hc[0] + hr * Math.cos(t), hc[1] + hr * Math.sin(t), i === 0 || i === nh ? {} : sm]);
  }
  // 不倒角：顶面（贴图）和侧面（纯色木头）的顶点分开，三角形不会跨着两块贴图插值
  const p = k.extrude({ name: 'palette', mat: 'studio', shape: shape(ccw(pts)), depth: 0.006, axis: 'y' });
  const wood = studioSwatch('handleWood');
  mapUV(p, (v, n) => (n[1] > 0.9 ? studioUV('palette', Math.min(1, Math.max(0, (v[0] + a) / PW)), Math.min(1, Math.max(0, (b + v[2]) / PH))) : wood));
  p.transform(place);
}

// 调色刀：钢片的刀头平贴在调色板上，弯起来的细柄把木把手抬起来，把手尾巴搭在板上
function paletteKnife(k, place) {
  const q = (...v) => k.q(...v);
  const sm = { smooth: true };
  const blade = shape(ccw([[0, 0], [0.03, 0.009, sm], [0.055, 0.012, sm], [0.07, 0.008, sm], [0.075, 0.002], [0.075, -0.002], [0.07, -0.008, sm], [0.055, -0.012, sm], [0.03, -0.009, sm]]));
  sw(k.extrude({ name: 'knifeBlade', mat: 'studio', shape: blade, depth: 0.0006, axis: 'y', xf: place }), 'blade');
  sw(k.sweep({ name: 'knifeShank', mat: 'studio', shape: circle(0.0013, q(6, 4, 3)), path: [[0.074, 0.0006, 0], [0.086, 0.0008, 0], [0.098, 0.012, 0], [0.112, 0.0165, 0]].map((v) => place.apply(v)), caps: [false, true], up: place.applyDir([0, 1, 0]) }), 'blade');
  const dir = [0.1, -0.0095], L = Math.hypot(...dir);
  const hand = place.mul(xf({ pos: [0.11, 0.0165, 0], rot: [0, 0, -Math.PI / 2 + Math.atan2(dir[1], dir[0])] }));
  sw(k.lathe({ name: 'knifeFerrule', mat: 'studio', segs: q(8, 6, 4), profile: profile([[0.0014, 0], [0.004, 0.003, sm], [0.0042, 0.012]]), xf: hand }), 'brass');
  sw(k.lathe({ name: 'knifeHandle', mat: 'studio', segs: q(8, 6, 4), profile: profile([[0.0042, 0.012], [0.0055, 0.03, sm], [0.0068, L - 0.02, sm], [0.0055, L - 0.004, sm], [0, L]]), xf: hand }), 'handleWood');
}

// 一团抹布：压扁的圆角块，揉出几道褶；贴图是擦过颜料的棉布
function rag(k, place) {
  const q = (...v) => k.q(...v);
  const p = k.box({ name: 'rag', mat: 'studio', size: [0.15, 0.04, 0.11], r: 0.018, segs: q(2, 1, 1), div: q([7, 2, 6], [3, 1, 3], [1, 1, 1]), omit: ['ny'] });
  p.deform(([x, y, z]) => {
    const h = y + 0.02, top = h / 0.04;
    const bump = 0.22 * Math.sin(x * 47 + 1.3) * Math.cos(z * 53 + 0.4) + 0.16 * Math.sin(x * 90 - z * 70 + 2) + 0.1 * Math.sin(x * 150 + z * 120);
    return [x + 0.007 * Math.sin(z * 70), h + h * bump * top, z + 0.007 * Math.sin(x * 65 + 1)];
  });
  mapUV(p, (v) => studioUV('rag', (v[0] + 0.15) / 0.3, (v[2] + 0.15) / 0.3));
  p.transform(place);
}

// 速写本：上下两片黑色的硬壳、书脊，中间一沓纸（三面露白），靠书口一侧一根红色松紧带竖着箍一圈；原点在书底面中心
function sketchbook(k, name, { w, t, d, place }) {
  const q = (...v) => k.q(...v);
  const bt = 0.002;
  const box = (n, size, pos, sws, omit = []) => sw(k.box({ name: `${name}${n}`, mat: 'studio', size, r: q(0.001, 0), segs: q(1, 0), omit, xf: place.mul(xf({ pos })) }), sws);
  box('Bottom', [w, bt, d], [0, bt / 2, 0], 'cover', ['ny']);
  box('Top', [w, bt, d], [0, t - bt / 2, 0], 'cover');
  box('Spine', [0.003, t, d], [-w / 2 + 0.0015, t / 2, 0], 'cover', ['px']);
  box('Pages', [w - 0.006, t - 2 * bt, d - 0.004], [0.001, t / 2, 0], 'paper', ['nx', 'py', 'ny']);
  const x = w / 2 - 0.028, e = 0.0007;
  const path = roundedPath([[x, t / 2, -d / 2 - e], [x, t + e, -d / 2 - e], [x, t + e, d / 2 + e], [x, -e + 0.0004, d / 2 + e], [x, -e + 0.0004, -d / 2 - e], [x, t / 2, -d / 2 - e]], [0, 0.0015, 0.0015, 0.0015, 0.0015, 0], 1).slice(0, -1).map((v) => place.apply(v));
  if (k.lod < 2) sw(k.sweep({ name: `${name}Band`, mat: 'studio', shape: rect(0.0009, 0.006), path, closed: true, caps: [false, false], up: place.applyDir([1, 0, 0]) }), 'elastic');
}
