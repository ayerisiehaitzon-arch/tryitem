import { rect, circle, profile } from '../core/shape.js';
import { xf } from '../core/vec.js';
import { roundedPath } from '../core/path.js';
import { GYM2_ATLAS, gym2UV, gym2Swatch, plateUV } from '../materials/atlas.js';
import { sw, mapUV } from './parts.js';

// 龙门架（双塔拉力器）：两座配重塔，顶上一根横梁连起来，横梁前面挂一根多握位引体向上杆。
//   · 每座塔：后面两根方管立柱夹着一摞配重片（20 片，从上往下 5 ~ 100 kg，正面印着重量和 KG，中间一个插销孔），
//     两根镀铬导杆穿过配重片，最上面一块钢压板，底下两只橡胶缓冲垫；选重插销（红色拉手）插在 40 kg 那一片；
//   · 塔的前面一根调节立柱，正面贴着 1 ~ 20 档的高度刻度；立柱上套着滑车（红色拔销），滑车前面一个转向滑轮座，
//     下面吊着钢丝绳头的限位球和 D 形把手。右塔的滑车在第 14 档，左塔在第 7 档；
//   · 钢丝绳：从配重压板往上，绕过配重上方的滑轮，沿顶梁往前，再绕过立柱顶上的滑轮往下，钻进滑车；
//   · 顶上：后横管、中间一根纵梁接到立柱顶，两座塔的立柱顶再由一根长横梁连起来，横梁正面印着 TRYITEM；
//   · 引体向上杆：两块钢板吊在横梁前面，中间一段直杆，两头往前下方折出宽握，套泡棉握把。
// 原点在占地中心（地面上），正面朝 +z；只用健身房二的图集一个材质
const TX = 1.05, TOP = 2.2, T = 0.075;
const Z = { rear: -0.32, front: 0.3 };
const PL = { n: 20, w: 0.3, h: 0.045, pitch: 0.05, d: 0.12, y0: 0.11, pin: 7 };
const SC = { y0: 0.25 };
const notch = (n) => SC.y0 + GYM2_ATLAS.scale.y0 + (n - 1) * GYM2_ATLAS.scale.pitch;   // 刻度第 n 档的高度
const PUL = { r: 0.045, w: 0.022 };

export default {
  id: 'cable_crossover',
  name: '龙门架',
  nameEn: 'Cable Crossover Station',
  category: 'gym2',
  aoDensity: 110,
  shadow: { margin: 0.25, maxDist: 0.6, density: 50 },
  view: { el: 12, az: 24 },
  build(k) {
    const q = (...v) => k.q(...v);
    const sm = { smooth: true };
    const bar = (name, pos, size, swatch = 'frame', o = {}) => sw(k.box({ name, mat: 'gym2', size, r: q(0.006, 0.004, 0), segs: q(1, 1, 0), xf: xf({ pos }), ...o }), swatch);
    const onX = (pos) => xf({ pos, rot: [0, 0, -Math.PI / 2] });
    // 滑轮：车削轴沿 x，外缘一道绳槽
    const pulley = (name, c) => {
      const { r, w } = PUL, g = 0.006;
      const pos = [c[0] - w / 2, c[1], c[2]];
      const rim = k.lod < 2 ? [[0.012, 0], [r, 0, { r: q(0.002, 0), segs: 1 }], [r - g, w / 2, sm], [r, w, { r: q(0.002, 0), segs: 1 }], [0.012, w]] : [[0.012, 0], [r, 0], [r, w], [0.012, w]];
      sw(k.lathe({ name, mat: 'gym2', segs: q(14, 10, 6), xf: onX(pos), profile: profile(rim) }), 'nylon');
      if (k.lod < 2) sw(k.lathe({ name: `${name}Hub`, mat: 'gym2', segs: q(8, 6), xf: onX([c[0] - w / 2 - 0.004, c[1], c[2]]), profile: profile([[0.014, 0], [0.014, w + 0.008], [0, w + 0.008]]) }), 'aluminum');
    };

    for (const s of [-1, 1]) {
      const tx = s * TX, n = s > 0 ? 'R' : 'L';
      // —— 底座：后横管、中间纵管、前横管 ——
      bar(`baseRear${n}`, [tx, 0.025, Z.rear], [0.52, 0.05, 0.08], 'frame', { omit: ['ny'] });
      bar(`baseSpine${n}`, [tx, 0.025, 0.01], [0.08, 0.05, 0.74], 'frame', { omit: ['ny'] });
      bar(`baseFront${n}`, [tx, 0.025, 0.34], [0.4, 0.05, 0.08], 'frame', { omit: ['ny'] });
      // —— 两根后立柱、调节立柱、顶上的后横管和纵梁 ——
      for (const d of [-1, 1]) bar(`post${n}${d > 0 ? 'O' : 'I'}`, [tx + d * 0.2, (0.05 + TOP) / 2, Z.rear], [T, TOP - 0.05, T], 'frame', { omit: ['ny'] });
      bar(`column${n}`, [tx, (0.05 + TOP) / 2, Z.front], [T, TOP - 0.05, T], 'frame', { omit: ['ny'] });
      bar(`topRear${n}`, [tx, TOP - T / 2, Z.rear], [0.4 + T, T, T]);
      bar(`topSpine${n}`, [tx, TOP - T / 2, (Z.rear + Z.front) / 2], [T, T, Z.front - Z.rear]);

      // —— 配重片：正面映射到图集里的第 i 格（0 = 最上面的 5 kg），其余面是纯黑 ——
      const plateSw = gym2Swatch('plate');
      const zf = Z.rear + PL.d / 2;
      const yOf = (i) => PL.y0 + (PL.n - 1 - i) * PL.pitch;
      for (let i = 0; i < PL.n; i++) {
        const y0 = yOf(i);
        // 远景不要背面（贴着立柱之间，看不见）
        const p = k.box({ name: `plate${n}${i}`, mat: 'gym2', size: [PL.w, PL.h, PL.d], segs: 0, omit: k.lod < 2 ? ['ny'] : ['ny', 'nz'], xf: xf({ pos: [tx, y0 + PL.h / 2, Z.rear] }) });
        mapUV(p, (v, nn) => (nn[2] > 0.7 ? plateUV(i, (v[0] - tx + PL.w / 2) / PL.w, (y0 + PL.h - v[1]) / PL.h) : plateSw));
      }
      const yTop = yOf(0) + PL.h;
      bar(`headPlate${n}`, [tx, yTop + 0.025, Z.rear], [0.34, 0.04, 0.13], 'steel');
      sw(k.lathe({ name: `stem${n}`, mat: 'gym2', segs: q(8, 6, 4), profile: profile([[0.011, 0], [0.011, 0.07, { r: 0.004, segs: 1 }], [0, 0.075]]), xf: xf({ pos: [tx, yTop + 0.045, Z.rear] }) }), 'chrome');
      for (const d of [-1, 1]) {
        sw(k.lathe({ name: `rod${n}${d > 0 ? 'O' : 'I'}`, mat: 'gym2', segs: q(8, 6, 4), profile: profile([[0.0125, 0], [0.0125, TOP - T - 0.05]]), xf: xf({ pos: [tx + d * 0.12, 0.05, Z.rear] }) }), 'chrome');
        sw(k.lathe({ name: `bumper${n}${d > 0 ? 'O' : 'I'}`, mat: 'gym2', segs: q(10, 6, 4), profile: profile([[0.03, 0], [0.03, PL.y0 - 0.055, { r: 0.004, segs: 1 }], [0.0125, PL.y0 - 0.05]]), xf: xf({ pos: [tx + d * 0.08, 0.05, Z.rear] }) }), 'rubber');
      }
      // 选重插销：插在 40 kg 那一片中间的孔里
      {
        const P = xf({ pos: [tx, yOf(PL.pin) + PL.h / 2, zf - 0.02], rot: [Math.PI / 2, 0, 0] });
        sw(k.lathe({ name: `pin${n}`, mat: 'gym2', segs: q(8, 6, 4), profile: profile([[0.006, 0], [0.006, 0.045]]), xf: P }), 'chrome');
        sw(k.lathe({ name: `pinKnob${n}`, mat: 'gym2', segs: q(10, 8, 6), profile: profile([[0.012, 0.045], [0.016, 0.055, sm], [0.016, 0.075, { r: 0.005, segs: q(2, 1, 1) }], [0, 0.078]]), xf: P }), 'red');
      }

      // —— 滑轮、钢丝绳 ——
      const zc = Z.rear + PUL.r, yc = 2.02, zfp = Z.front + T / 2 + 0.05, zDown = zfp + PUL.r;
      pulley(`pulleyRear${n}`, [tx, yc, zc]);
      pulley(`pulleyFront${n}`, [tx, yc, zfp]);
      for (const d of [-1, 1]) {
        bar(`bracketR${n}${d > 0 ? 'O' : 'I'}`, [tx + d * 0.019, (yc + TOP - T) / 2 - 0.01, zc], [0.006, TOP - T - yc + 0.06, 0.07], 'steel', { r: 0, segs: 0 });
        bar(`bracketF${n}${d > 0 ? 'O' : 'I'}`, [tx + d * 0.019, yc + 0.02, (Z.front + T / 2 + zfp + 0.035) / 2], [0.006, 0.1, zfp + 0.035 - Z.front - T / 2], 'steel', { r: 0, segs: 0 });
      }
      const carY = notch(s > 0 ? 14 : 7);
      {
        const arc = (cz, cy, a0, a1) => {
          const out = [], na = q(5, 3, 2);
          for (let j = 0; j <= na; j++) {
            const a = a0 + ((a1 - a0) * j) / na;
            out.push([tx, cy + (PUL.r + 0.003) * Math.sin(a), cz + (PUL.r + 0.003) * Math.cos(a)]);
          }
          return out;
        };
        const path = [[tx, yTop + 0.1, Z.rear - 0.003], ...arc(zc, yc, Math.PI, Math.PI / 2), ...arc(zfp, yc, Math.PI / 2, 0), [tx, carY + 0.05, zDown + 0.003]];
        sw(k.sweep({ name: `cable${n}`, mat: 'gym2', shape: circle(0.0035, 5), path, caps: [false, false] }), 'cable');
      }

      // —— 调节立柱的刻度、滑车、转向滑轮座、限位球和 D 形把手 ——
      {
        const { w: SW, h: SH } = GYM2_ATLAS.scale, zS = Z.front + T / 2 + 0.0003;
        const tape = k.box({ name: `scale${n}`, mat: 'gym2', size: [SW, SH, 0.0006], segs: 0, omit: ['px', 'nx', 'py', 'ny', 'nz'], xf: xf({ pos: [tx, SC.y0 + SH / 2, zS] }) });
        mapUV(tape, (v) => gym2UV('scale', (v[0] - tx + SW / 2) / SW, (SC.y0 + SH - v[1]) / SH));
      }
      bar(`carriage${n}`, [tx, carY, Z.front], [0.11, 0.18, 0.11], 'frame', { r: q(0.01, 0.008, 0), segs: q(2, 1, 0) });
      {
        const P = xf({ pos: [tx - s * 0.055, carY, Z.front], rot: [0, 0, s * Math.PI / 2] });   // 车削轴朝塔的内侧（朝中间）
        sw(k.lathe({ name: `carPinStem${n}`, mat: 'gym2', segs: q(8, 6, 4), profile: profile([[0.008, -0.004], [0.008, 0.02]]), xf: P }), 'satin');
        sw(k.lathe({ name: `carPin${n}`, mat: 'gym2', segs: q(10, 8, 6), profile: profile([[0.017, 0.02], [0.018, 0.034, { r: 0.004, segs: q(2, 1, 1) }], [0, 0.038]]), xf: P }), 'red');
      }
      for (const d of [-1, 1]) bar(`swivel${n}${d > 0 ? 'O' : 'I'}`, [tx + d * 0.019, carY - 0.025, (Z.front + 0.055 + zDown + 0.022) / 2], [0.006, 0.1, zDown + 0.022 - Z.front - 0.055], 'satin', { r: q(0.003, 0), segs: q(1, 0) });
      pulley(`pulleyCar${n}`, [tx, carY - 0.03, zDown - PUL.r]);
      {
        const yb = carY - 0.105;
        sw(k.sweep({ name: `stub${n}`, mat: 'gym2', shape: circle(0.0035, 5), path: [[tx, carY - 0.075, zDown], [tx, yb, zDown]], caps: [false, false] }), 'cable');
        sw(k.lathe({ name: `ball${n}`, mat: 'gym2', segs: q(8, 6, 4), profile: profile([[0, -0.013], [0.009, -0.01, sm], [0.013, 0, sm], [0.009, 0.01, sm], [0, 0.013]]), xf: xf({ pos: [tx, yb, zDown] }) }), 'rubber');
        // 卡扣 + D 形把手（在 x-y 平面里，正面看得见整个“D”）
        const e = [tx, yb - 0.026, zDown];
        const hook = [];
        const nh = q(8, 6, 0);
        for (let j = 0; j < nh; j++) {
          const a = (2 * Math.PI * j) / nh;
          hook.push([e[0] + 0.009 * Math.sin(a), e[1] + 0.013 * Math.cos(a), e[2]]);
        }
        if (nh) sw(k.sweep({ name: `hook${n}`, mat: 'gym2', shape: circle(0.0025, 4), path: hook, closed: true, up: [0, 0, 1], caps: [false, false] }), 'steel');
        const top = [e[0], e[1] - 0.016, e[2]];
        const D = roundedPath([top, [top[0] - 0.075, top[1] - 0.13, top[2]], [top[0] + 0.075, top[1] - 0.13, top[2]], top], [0, 0.03, 0.03, 0], q(3, 2, 1));
        sw(k.sweep({ name: `stirrup${n}`, mat: 'gym2', shape: circle(0.0055, q(6, 5, 4)), path: D.slice(0, -1), closed: true, up: [0, 0, 1], caps: [false, false] }), 'steel');
        sw(k.lathe({ name: `dGrip${n}`, mat: 'gym2', segs: q(10, 8, 6), profile: profile([[0.014, 0], [0.016, 0.008, sm], [0.016, 0.1, sm], [0.014, 0.108]]), xf: onX([top[0] - 0.054, top[1] - 0.13, top[2]]) }), 'rubber');
      }
    }

    // —— 连接两座塔的长横梁（正面贴 TRYITEM）——
    bar('crossbar', [0, TOP - T / 2, Z.front], [2 * TX - T, T, T]);
    {
      const { w: W0, h: H0 } = GYM2_ATLAS.decal, DW = 0.26, DH = DW * (H0 / W0);
      const zD = Z.front + T / 2 + 0.0003;
      const decal = k.box({ name: 'crossDecal', mat: 'gym2', size: [DW, DH, 0.0006], segs: 0, omit: ['px', 'nx', 'py', 'ny', 'nz'], xf: xf({ pos: [0, TOP - T / 2, zD] }) });
      mapUV(decal, (v) => gym2UV('decal', (v[0] + DW / 2) / DW, (TOP - T / 2 + DH / 2 - v[1]) / DH));
    }
    // —— 引体向上杆：两块吊板 + 中间直杆 + 两头往前下方折出的宽握 ——
    {
      const yb = TOP - 0.115, zb = 0.465;
      for (const s of [-1, 1]) bar(`hanger${s > 0 ? 'R' : 'L'}`, [s * 0.32, TOP - 0.075, (Z.front + T / 2 + zb + 0.02) / 2], [0.012, 0.11, zb + 0.02 - Z.front - T / 2], 'frame', { r: q(0.003, 0), segs: q(1, 0) });
      const path = roundedPath([[-0.76, yb - 0.08, zb + 0.07], [-0.55, yb, zb], [0.55, yb, zb], [0.76, yb - 0.08, zb + 0.07]], [0, 0.06, 0.06, 0], q(4, 3, 2));
      sw(k.sweep({ name: 'pullupBar', mat: 'gym2', shape: circle(0.016, q(10, 8, 6)), path, caps: [true, true] }), 'steel');
      for (const s of [-1, 1]) {
        const a = [s * 0.745, yb - 0.075, zb + 0.066], b = [s * 0.6, yb - 0.02, zb + 0.018];
        sw(k.sweep({ name: `pullGrip${s > 0 ? 'R' : 'L'}`, mat: 'gym2', shape: circle(0.0195, q(10, 8, 6)), path: s > 0 ? [b, a] : [a, b], caps: [true, true] }), 'foam');
      }
    }
  },
};
