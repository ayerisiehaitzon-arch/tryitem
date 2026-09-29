import { profile, circle, rect } from '../core/shape.js';
import { xf } from '../core/vec.js';
import { BAND_ATLAS, bandUV } from '../materials/atlas.js';
import { sw, mapUV, tube, pipe, tripod, wingNut, cymbal, drumHead, hoop, lugs, lerp3 } from './parts.js';

// 架子鼓：一套五鼓（22 寸底鼓、12 寸嗵鼓、16 寸落地嗵、14 寸军鼓）加踩镲、吊镲、叮叮镲，一张鼓凳。
//   · 鼓身贴红色闪粉贴皮（金属亮片 + 清漆，单独一个材质）；底鼓是木鼓圈（亮黑，中间嵌一道闪粉），别的鼓是三折边的镀铬鼓圈；
//     每只鼓一圈管状鼓耳，调音螺杆穿过鼓圈的翻边；打击面是白色磨砂涂层皮（中间一片鼓棒印），
//   · 底鼓前皮是黑色的，印着鼓牌；右下开一个出音孔 —— 前皮是一圈从出音孔边放样到鼓皮外沿的环（一圈圈嵌套的圆，不会交叉），
//     孔边一圈加强圈；从孔里看得见鼓腔里面的原木色和打击面的背面；
//   · 镲片是车削的：碗 + 弓面，上下两个面，按俯视平面贴车纹、锤痕和印字；
//   · 架子：三脚架（橡胶脚、撑杆）、镀铬管、黑色的卡箍和翼形螺丝；底鼓踏板、踩镲踏板、军鼓架的托篮、吊镲的斜臂；
//   · 原点在底鼓正下方的地面，观众在 +z（底鼓前皮朝观众），鼓手坐在 -z。
const KICK = { R: 0.2794, D: 0.457 };
const RACK = { R: 0.1524, D: 0.2032 };
const FLOOR = { R: 0.2032, D: 0.4064 };
const SNARE = { R: 0.1778, D: 0.14 };
const KY = KICK.R + 0.018;   // 底鼓中心的高度（木鼓圈着地）
const HH = { c: [0.5, 0, -0.44], y: 0.8, R: 0.1778, bellR: 0.042, bellH: 0.016, drop: 0.01 };
const CRASH = { stand: [0.7, 0, 0.02], c: [0.44, 1.3, -0.1], rot: [-0.32, 0, -0.22], R: 0.2286, bellR: 0.05, bellH: 0.018, drop: 0.018 };
const RIDE = { stand: [-0.8, 0, -0.02], c: [-0.58, 1.12, -0.14], rot: [-0.24, 0, 0.2], R: 0.254, bellR: 0.062, bellH: 0.022, drop: 0.022 };

// 把一只鼓摆好：给出上鼓皮中心的位置和倾斜，推出鼓的局部原点（下鼓皮中心）
function placeDrum(top, D, rot) {
  const r = xf({ rot });
  const up = r.applyDir([0, D, 0]);
  return xf({ pos: [top[0] - up[0], top[1] - up[1], top[2] - up[2]], rot });
}

export default {
  id: 'drum_kit',
  name: '架子鼓',
  nameEn: 'Drum Kit',
  category: 'band',
  aoDensity: 190,
  shadow: { margin: 0.2, maxDist: 0.8, density: 80 },
  view: { el: 20, az: 18 },
  build(k) {
    const q = (...v) => k.q(...v);
    const sm = { smooth: true };
    const segs = q(32, 22, 14);

    // ——————————— 底鼓 ———————————
    {
      const { R, D } = KICK;
      const place = xf({ pos: [0, KY, -D / 2], rot: [Math.PI / 2, 0, 0] });   // 局部 +y → 世界 +z
      k.lathe({ name: 'kickShell', mat: 'sparkle_red', segs, profile: profile([[R, 0.004], [R, D - 0.004]]), xf: place });
      sw(k.lathe({ name: 'kickInner', mat: 'band', segs: q(24, 16, 10), profile: profile([[R - 0.008, D - 0.004], [R - 0.008, 0.004]]), xf: place }), 'shellInner');
      // 打击面（朝鼓手）和它的背面（从出音孔里看得见）
      drumHead(k, 'kickBatter', { R, y: -0.0015, dir: -1, place });
      sw(k.lathe({ name: 'kickBatterIn', mat: 'band', segs: q(24, 16, 10), profile: profile([[R - 0.009, 0.0005], [0, 0.0005]]), xf: place }), 'feltBlack');
      // 前皮：从出音孔的圆放样到鼓皮外沿（一串嵌套的圆），按前皮平面贴鼓牌
      {
        const K = BAND_ATLAS.kick, yh = D + 0.0015, n = q(40, 28, 16), M = q(4, 3, 2);
        const [px, py] = K.port;
        const rings = [];
        for (let i = 0; i <= M; i++) {
          const t = i / M, ring = [];
          for (let j = 0; j < n; j++) {
            const a = (2 * Math.PI * j) / n, ca = Math.cos(a), sa = Math.sin(a);
            const ix = px + K.portR * ca, iy = py + K.portR * sa, ox = (R - 0.003) * ca, oy = (R - 0.003) * sa;
            ring.push([ix + (ox - ix) * t, yh, -(iy + (oy - iy) * t)]);
          }
          rings.push(ring);
        }
        const head = k.loft({ name: 'kickFront', mat: 'band', rings, orient: () => [0, 1, 0] });
        mapUV(head, (v) => bandUV('kickHead', (v[0] + K.w / 2) / K.w, (K.w / 2 + v[2]) / K.w));
        head.transform(place);
        sw(k.lathe({ name: 'kickFrontCollar', mat: 'band', segs, profile: profile([[R + 0.0015, D - 0.008], [R + 0.0015, D + 0.0005, sm], [R - 0.003, yh]]), xf: place }), 'blackGloss');
        // 出音孔的孔壁（加强圈的厚度）
        sw(k.lathe({ name: 'kickPort', mat: 'band', segs: q(20, 14, 10), profile: profile([[K.portR + 0.0005, yh + 0.0025], [K.portR + 0.0005, yh - 0.002]]), xf: place.mul(xf({ pos: [px, 0, -py] })) }), 'blackGloss');
      }
      // 木鼓圈：亮黑，外面嵌一道闪粉
      for (const [nm, y, dir] of [['F', D, 1], ['B', 0, -1]]) {
        let pts = [[R + 0.001, y - 0.004], [R + 0.016, y - 0.004], [R + 0.018, y - 0.001, sm], [R + 0.018, y + 0.022, sm], [R + 0.016, y + 0.025], [R + 0.001, y + 0.025], [R - 0.002, y + 0.021]];
        if (dir < 0) pts = pts.map(([r, yy, o]) => [r, 2 * y - yy, o]).reverse();
        sw(k.lathe({ name: `kickHoop${nm}`, mat: 'band', segs: q(28, 20, 12), profile: profile(pts), xf: place }), 'blackGloss');
        const i0 = y + dir * 0.006, i1 = y + dir * 0.016;
        k.lathe({ name: `kickInlay${nm}`, mat: 'sparkle_red', segs: q(28, 20, 12), profile: profile(dir > 0 ? [[R + 0.0183, i0], [R + 0.0183, i1]] : [[R + 0.0183, i1], [R + 0.0183, i0]]), xf: place });
      }
      lugs(k, 'kickLug', { R, D, n: 10, place, a0: 0.05 });
      // 调音爪：每只鼓耳两头各一个，扣在木鼓圈上
      if (k.lod === 0) {
        for (let i = 0; i < 10; i++) {
          const a = 0.05 + ((i + 0.5) * 2 * Math.PI) / 10, ca = Math.cos(a), sa = Math.sin(a);
          for (const [y, s] of [[D + 0.01, 1], [-0.01, -1]]) {
            sw(k.box({ name: `kickClaw${i}${s > 0 ? 'F' : 'B'}`, mat: 'band', size: [0.012, 0.03, 0.009], segs: 0, omit: ['nx'], xf: place.mul(xf({ pos: [(R + 0.018) * ca, y, -(R + 0.018) * sa], rot: [0, a, 0] })) }), 'chrome');
          }
        }
      }
      // 两条支腿：从鼓身两侧斜着撑到地上
      for (const s of [-1, 1]) {
        const a = [s * (R + 0.012), KY - 0.02, 0.12], b = [s * 0.37, 0.012, 0.2];
        sw(k.box({ name: `kickSpurMount${s > 0 ? 'R' : 'L'}`, mat: 'band', size: [0.02, 0.05, 0.035], r: q(0.003, 0), segs: q(1, 0), xf: xf({ pos: [s * (R + 0.006), KY - 0.02, 0.12] }) }), 'chrome');
        tube(k, `kickSpur${s > 0 ? 'R' : 'L'}`, a, b, 0.0065, 'chrome', { caps: [true, false] });
        if (k.lod < 2) tube(k, `kickSpurTip${s > 0 ? 'R' : 'L'}`, lerp3(a, b, 0.93), b, 0.009, 'rubber');
      }
      // 嗵鼓座：底鼓顶上一块镀铬的座子
      sw(k.box({ name: 'tomMount', mat: 'band', size: [0.05, 0.03, 0.07], r: q(0.004, 0.003, 0), segs: q(1, 1, 0), xf: xf({ pos: [0.03, KY + R + 0.008, 0.06] }) }), 'chrome');
      pedal(k, 'kickPedal', { z0: -D / 2 - 0.03, headY: KY });
    }

    // ——————————— 嗵鼓：斜着架在底鼓上 ———————————
    {
      const { R, D } = RACK;
      const place = placeDrum([0.05, 0.88, -0.2], D, [-0.42, 0, 0.1]);
      k.lathe({ name: 'rackShell', mat: 'sparkle_red', segs: q(28, 20, 12), profile: profile([[R, 0.003], [R, D - 0.003]]), xf: place });
      drumHead(k, 'rackTop', { R, y: D + 0.0015, dir: 1, place });
      drumHead(k, 'rackBottom', { R, y: -0.0015, dir: -1, place });
      hoop(k, 'rackHoopT', { R, y: D, dir: 1, place });
      hoop(k, 'rackHoopB', { R, y: 0, dir: -1, place });
      lugs(k, 'rackLug', { R, D, n: 6, place });
      // 支架：鼓身上一块托架，一根 L 形的臂接到底鼓的嗵鼓座
      const br = place.apply([0, D * 0.45, R + 0.012]);
      sw(k.box({ name: 'rackBracket', mat: 'band', size: [0.035, 0.05, 0.02], r: q(0.003, 0), segs: q(1, 0), xf: place.mul(xf({ pos: [0, D * 0.45, R + 0.006] })) }), 'chrome');
      // 支臂从底鼓顶上的座子竖起来（在嗵鼓下鼓圈的前面），再拐向托架
      pipe(k, 'rackArm', [[0.03, KY + KICK.R + 0.02, 0.06], [0.03, br[1] - 0.04, 0.06], br], 0.0085, 'chrome');
    }

    // ——————————— 落地嗵：三条腿 ———————————
    {
      const { R, D } = FLOOR, c = [-0.52, 0, -0.3];
      const place = xf({ pos: [c[0], 0.6 - D, c[2]] });
      k.lathe({ name: 'floorShell', mat: 'sparkle_red', segs, profile: profile([[R, 0.003], [R, D - 0.003]]), xf: place });
      drumHead(k, 'floorTop', { R, y: D + 0.0015, dir: 1, place });
      drumHead(k, 'floorBottom', { R, y: -0.0015, dir: -1, place });
      hoop(k, 'floorHoopT', { R, y: D, dir: 1, place });
      hoop(k, 'floorHoopB', { R, y: 0, dir: -1, place });
      lugs(k, 'floorLug', { R, D, n: 8, place });
      for (let i = 0; i < 3; i++) {
        const a = Math.PI / 6 + (i * 2 * Math.PI) / 3, ca = Math.cos(a), sa = Math.sin(a);
        const yb = 0.6 - D + D * 0.72;
        sw(k.box({ name: `floorBracket${i}`, mat: 'band', size: [0.024, 0.045, 0.03], r: q(0.003, 0), segs: q(1, 0), xf: xf({ pos: [c[0] + (R + 0.012) * ca, yb, c[2] - (R + 0.012) * sa], rot: [0, a, 0] }) }), 'chrome');
        const top = [c[0] + (R + 0.026) * ca, yb + 0.05, c[2] - (R + 0.026) * sa], foot = [c[0] + (R + 0.075) * ca, 0.014, c[2] - (R + 0.075) * sa];
        tube(k, `floorLeg${i}`, top, foot, 0.0055, 'chrome');
        if (k.lod < 2) tube(k, `floorFoot${i}`, lerp3(top, foot, 0.95), foot, 0.0085, 'rubber');
      }
    }

    // ——————————— 军鼓 + 军鼓架 ———————————
    {
      const { R, D } = SNARE, c = [0.15, 0, -0.5];
      const place = placeDrum([c[0], 0.65, c[2]], D, [-0.12, 0, -0.06]);
      k.lathe({ name: 'snareShell', mat: 'sparkle_red', segs, profile: profile([[R, 0.003], [R, D - 0.003]]), xf: place });
      drumHead(k, 'snareTop', { R, y: D + 0.0015, dir: 1, place });
      drumHead(k, 'snareBottom', { R, y: -0.0015, dir: -1, place });
      hoop(k, 'snareHoopT', { R, y: D, dir: 1, place });
      hoop(k, 'snareHoopB', { R, y: 0, dir: -1, place });
      lugs(k, 'snareLug', { R, D, n: 10, place, a0: 0.12 });
      // 响弦开关：鼓身侧面一个镀铬的小盒子和扳手
      sw(k.box({ name: 'snareStrainer', mat: 'band', size: [0.02, 0.06, 0.028], r: q(0.003, 0), segs: q(1, 0), xf: place.mul(xf({ pos: [R + 0.012, D / 2, 0] })) }), 'chrome');
      if (k.lod < 2) sw(k.box({ name: 'snareLever', mat: 'band', size: [0.006, 0.05, 0.01], r: q(0.002, 0), segs: q(1, 0), xf: place.mul(xf({ pos: [R + 0.025, D / 2 + 0.01, 0], rot: [0, 0, 0.3] })) }), 'chrome');
      // 鼓架：三脚架、中管、托篮的三只爪托着下鼓圈
      tripod(k, 'snareStand', { c, hubY: 0.2, spread: 0.25, a0: 0.4, braceY: 0.08 });
      const basket = place.apply([0, -0.045, 0]);
      tube(k, 'snarePost', [c[0], 0.2, c[2]], [basket[0], basket[1] - 0.02, basket[2]], 0.0105, 'chrome');
      sw(k.lathe({ name: 'snareTilter', mat: 'band', segs: q(10, 8, 6), profile: profile([[0.016, 0], [0.016, 0.03]]), xf: xf({ pos: [basket[0], basket[1] - 0.03, basket[2]] }) }), 'blackHw');
      for (let i = 0; i < 3; i++) {
        const a = 0.4 + (i * 2 * Math.PI) / 3;
        const tip = place.apply([(R - 0.004) * Math.cos(a), -0.012, -(R - 0.004) * Math.sin(a)]);
        const mid = place.apply([(R * 0.55) * Math.cos(a), -0.05, -(R * 0.55) * Math.sin(a)]);
        pipe(k, `snareArm${i}`, [basket, mid, tip], 0.005, 'chrome');
        if (k.lod < 2) tube(k, `snareGrip${i}`, lerp3(mid, tip, 0.8), tip, 0.0075, 'rubber');
      }
      // 一对鼓棒，搭在鼓圈上
      for (const [nm, a, b] of [['A', [-0.2, 0.05], [0.21, -0.07]], ['B', [-0.17, -0.1], [0.23, 0.04]]]) {
        const y = D + 0.0105 + 0.0073 + (nm === 'B' ? 0.0146 : 0);
        const p0 = place.apply([a[0], y, a[1]]), p1 = place.apply([b[0], y, b[1]]);
        stick(k, `stick${nm}`, p0, p1);
      }
    }

    // ——————————— 踩镲 ———————————
    {
      const { c } = HH;
      tripod(k, 'hhStand', { c, hubY: 0.22, spread: 0.24, a0: Math.PI / 2 });
      tube(k, 'hhTube', [c[0], 0.2, c[2]], [c[0], HH.y - 0.012, c[2]], 0.0125, 'chrome', { caps: [false, true] });
      sw(k.lathe({ name: 'hhClamp', mat: 'band', segs: q(10, 8, 6), profile: profile([[0.016, 0.6], [0.016, 0.63]]), xf: xf({ pos: [c[0], 0, c[2]] }) }), 'blackHw');
      // 下片的托杯；下片倒扣（碗朝下），上片正放，夹在离合器里，两片的边之间张开 2cm
      const yb = HH.y + HH.bellH + 0.004, yt = yb + 2 * HH.drop + 0.02;
      tube(k, 'hhRod', [c[0], HH.y - 0.02, c[2]], [c[0], yt + HH.bellH + 0.06, c[2]], 0.0042, 'chrome');
      sw(k.lathe({ name: 'hhCup', mat: 'band', segs: q(12, 8, 6), profile: profile([[0.012, HH.y - 0.012], [0.03, HH.y - 0.002, sm], [0.03, HH.y]]), xf: xf({ pos: [c[0], 0, c[2]] }) }), 'chrome');
      const cy = { R: HH.R, bellR: HH.bellR, bellH: HH.bellH, drop: HH.drop };
      cymbal(k, 'hhBottom', { ...cy, flip: true, place: xf({ pos: [c[0], yb, c[2]] }) });
      cymbal(k, 'hhTop', { ...cy, place: xf({ pos: [c[0], yt, c[2]] }) });
      sw(k.lathe({ name: 'hhClutch', mat: 'band', segs: q(10, 8, 6), profile: profile([[0.011, 0], [0.011, 0.028, sm], [0, 0.03]]), xf: xf({ pos: [c[0], yt + HH.bellH + 0.001, c[2]] }) }), 'blackHw');
      // 踏板：朝鼓手
      pedal(k, 'hhPedal', { x: c[0], z0: c[2] - 0.05, hihat: true });
    }

    // ——————————— 吊镲、叮叮镲：斜臂架 ———————————
    for (const [nm, C, a0] of [['crash', CRASH, 0.3], ['ride', RIDE, 2.4]]) {
      const s = C.stand;
      tripod(k, `${nm}Stand`, { c: s, hubY: 0.26, spread: 0.3, a0, braceY: 0.11 });
      tube(k, `${nm}Tube`, [s[0], 0.24, s[2]], [s[0], 0.74, s[2]], 0.0125, 'chrome', { caps: [false, true] });
      sw(k.lathe({ name: `${nm}Clamp`, mat: 'band', segs: q(10, 8, 6), profile: profile([[0.017, 0.72], [0.017, 0.76, sm], [0.011, 0.77]]), xf: xf({ pos: [s[0], 0, s[2]] }) }), 'blackHw');
      if (k.lod < 2) wingNut(k, `${nm}ClampNut`, xf({ pos: [s[0] + 0.017, 0.74, s[2]], rot: [0, 0, -Math.PI / 2] }));
      const knuckle = [s[0], 1.02, s[2]];
      tube(k, `${nm}Upper`, [s[0], 0.75, s[2]], knuckle, 0.0095, 'chrome', { caps: [false, false] });
      sw(k.box({ name: `${nm}Knuckle`, mat: 'band', size: [0.032, 0.04, 0.032], r: q(0.006, 0.004, 0), segs: q(2, 1, 0), xf: xf({ pos: knuckle }) }), 'blackHw');
      // 镲片的局部坐标：C.c 是碗根的中心，C.rot 让镲片朝鼓手倾斜；斜臂接到镲片底下 5cm 的倾斜器
      const cp = xf({ pos: C.c, rot: C.rot });
      const tilter = cp.apply([0, -0.055, 0]);
      tube(k, `${nm}Boom`, knuckle, tilter, 0.0085, 'chrome');
      sw(k.box({ name: `${nm}Tilter`, mat: 'band', size: [0.024, 0.03, 0.024], r: q(0.005, 0.003, 0), segs: q(2, 1, 0), xf: cp.mul(xf({ pos: [0, -0.05, 0] })) }), 'blackHw');
      tube(k, `${nm}Rod`, tilter, cp.apply([0, 0.045, 0]), 0.0038, 'chrome');
      sw(k.lathe({ name: `${nm}FeltLow`, mat: 'band', segs: q(10, 8, 6), profile: profile([[0.004, -0.006], [0.017, -0.006], [0.017, C.bellH - 0.0048], [0.004, C.bellH - 0.0042]]), xf: cp }), 'feltRed');
      cymbal(k, nm, { R: C.R, bellR: C.bellR, bellH: C.bellH, drop: C.drop, place: cp });
      sw(k.lathe({ name: `${nm}FeltTop`, mat: 'band', segs: q(10, 8, 6), profile: profile([[0.004, C.bellH + 0.001], [0.018, C.bellH + 0.001], [0.018, C.bellH + 0.012], [0.004, C.bellH + 0.012]]), xf: cp }), 'feltRed');
      wingNut(k, `${nm}Nut`, cp.mul(xf({ pos: [0, C.bellH + 0.012, 0] })));
    }

    // ——————————— 鼓凳 ———————————
    {
      const c = [0, 0, -0.9];
      tripod(k, 'throneBase', { c, hubY: 0.17, spread: 0.27, a0: Math.PI / 2, legR: 0.0085, swatch: 'blackHw', braceY: 0.06 });
      tube(k, 'thronePost', [c[0], 0.17, c[2]], [c[0], 0.47, c[2]], 0.0145, 'chrome', { caps: [false, true] });
      sw(k.lathe({ name: 'throneSeat', mat: 'band', segs: q(28, 20, 12), profile: profile([[0, 0.462], [0.155, 0.462, { r: 0.012, segs: 1 }], [0.182, 0.495, sm], [0.18, 0.545, sm], [0.162, 0.568, sm], [0.09, 0.576, sm], [0, 0.578]]), xf: xf({ pos: c }) }), 'throne');
      sw(k.lathe({ name: 'throneTrim', mat: 'band', segs: q(28, 20, 12), profile: profile([[0.158, 0.456], [0.158, 0.466]]), xf: xf({ pos: c }) }), 'chrome');
    }
  },
};

// 鼓棒：山胡桃木，一头粗一头细，头上一颗橄榄形的棒头
function stick(k, name, a, b) {
  const q = (...v) => k.q(...v);
  const sm = { smooth: true };
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], L = Math.hypot(...d);
  const yaw = Math.atan2(d[0], d[2]), pitch = Math.asin(d[1] / L);
  const place = xf({ pos: a, rot: [0, yaw, 0] }).mul(xf({ rot: [Math.PI / 2 - pitch, 0, 0] }));
  sw(k.lathe({
    name, mat: 'band', segs: q(8, 6, 4),
    profile: profile([[0, 0], [0.0068, 0.002, sm], [0.0073, 0.02, sm], [0.0072, L * 0.62, sm], [0.0042, L - 0.022, sm], [0.0036, L - 0.016], [0.0048, L - 0.009, sm], [0.0034, L - 0.002, sm], [0, L]]),
    xf: place,
  }), 'hickory');
}

// 踏板：底板、斜着的脚踏板、脚跟托、两根立柱和横轴；底鼓踏板带一根鼓槌（毡头），踩镲踏板一根拉杆接到踩镲架
//   底鼓：从 z0 往鼓手那边（-z）铺；踩镲：x 给定、同样往 -z 铺
function pedal(k, name, { x = 0, z0, headY = 0, hihat = false }) {
  const q = (...v) => k.q(...v);
  const L = 0.3, w = hihat ? 0.1 : 0.095;
  sw(k.box({ name: `${name}Base`, mat: 'band', size: [w + 0.02, 0.006, L], r: q(0.002, 0), segs: q(1, 0), omit: ['ny'], xf: xf({ pos: [x, 0.003, z0 - L / 2] }) }), 'blackHw');
  // 脚踏板：前端抬起
  const front = 0.13, rise = 0.105, len = 0.24;
  const ang = Math.atan2(rise - 0.03, len);
  sw(k.box({ name: `${name}Board`, mat: 'band', size: [w, 0.008, len], r: q(0.003, 0.002, 0), segs: q(1, 1, 0), xf: xf({ pos: [x, (rise + 0.03) / 2 + 0.006, z0 - 0.045 - (len / 2) * Math.cos(ang)], rot: [-ang, 0, 0] }) }), 'chrome');
  sw(k.box({ name: `${name}Heel`, mat: 'band', size: [w, 0.022, 0.05], r: q(0.003, 0), segs: q(1, 0), xf: xf({ pos: [x, 0.017, z0 - L + 0.025] }) }), 'blackHw');
  if (hihat) {
    // 拉杆：从脚踏板前端到踩镲架的管子里
    tube(k, `${name}Link`, [x, rise + 0.006, z0 - 0.05], [x, 0.2, z0 + 0.05], 0.005, 'chrome');
    return;
  }
  for (const s of [-1, 1]) {
    sw(k.box({ name: `${name}Post${s > 0 ? 'R' : 'L'}`, mat: 'band', size: [0.012, 0.16, 0.022], r: q(0.003, 0), segs: q(1, 0), xf: xf({ pos: [x + s * (w / 2 + 0.006), 0.085, z0 - 0.02] }) }), 'blackHw');
  }
  sw(k.lathe({ name: `${name}Axle`, mat: 'band', segs: q(8, 6, 4), profile: profile([[0.007, -(w / 2 + 0.012)], [0.007, w / 2 + 0.012]]), xf: xf({ pos: [x, 0.16, z0 - 0.02], rot: [0, 0, -Math.PI / 2] }) }), 'chrome');
  if (k.lod < 2) {
    sw(k.lathe({ name: `${name}Cam`, mat: 'band', segs: q(10, 8), profile: profile([[0.018, -0.012], [0.018, 0.012]]), xf: xf({ pos: [x, 0.16, z0 - 0.02], rot: [0, 0, -Math.PI / 2] }) }), 'chrome');
    tube(k, `${name}Spring`, [x + w / 2 + 0.016, 0.03, z0 - 0.02], [x + w / 2 + 0.016, 0.15, z0 - 0.02], 0.0045, 'chrome');
  }
  // 鼓槌：从横轴斜着伸到打击面前面，毡头停在离鼓皮 2cm 的地方
  const beat = [x, headY - 0.02, z0 + 0.012];
  tube(k, `${name}Shaft`, [x, 0.16, z0 - 0.02], beat, 0.0035, 'chrome');
  sw(k.lathe({ name: `${name}Beater`, mat: 'band', segs: q(10, 8, 6), profile: profile([[0, -0.022], [0.019, -0.022, { r: 0.004, segs: 1 }], [0.019, 0.022, { r: 0.004, segs: 1 }], [0, 0.022]]), xf: xf({ pos: beat, rot: [0, 0, Math.PI / 2] }) }), 'feltBlack');
  // 踏板和鼓圈的卡子
  sw(k.box({ name: `${name}Clamp`, mat: 'band', size: [0.05, 0.03, 0.03], r: q(0.003, 0), segs: q(1, 0), xf: xf({ pos: [x, 0.02, z0 + 0.012] }) }), 'blackHw');
}
