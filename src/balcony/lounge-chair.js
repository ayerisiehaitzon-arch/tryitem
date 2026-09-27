import { circle } from '../core/shape.js';
import { xf } from '../core/vec.js';

// 柚木户外扶手椅：柚木框架 + 靠背一排竖向编绳 + 燕麦色帆布坐垫 + 鼠尾草绿腰枕
//   · 框架全是倒角方料（加权法线的圆角高光）：四条腿、两根宽扶手、座框、侧撑；
//   · 靠背是一个后倾 14° 的小框，框里 18 根三股绳竖着缠过上下横档：
//     每根绳一次扫掠（圆截面），贴图的 u 是一个捻距、v 正好绕绳一圈 —— 斜纹一直连到绳的另一头；
//   · 坐垫、腰枕是圆角盒 + 鼓胀，腰枕跟着靠背一起后倾、下沿落在坐垫后缘。
const W = 0.72, LEG = 0.045;
const ARM = { w: 0.075, t: 0.026, y: 0.56 };
const LX = W / 2 - ARM.w / 2, LZ = 0.3; // 腿的中心
const RAIL = { y: 0.25, h: 0.06, t: 0.024 };
const BACK = { tilt: (14 * Math.PI) / 180, h: 0.44, w: 0.6, t: 0.028, z: -0.29 };
const ROPES = 18;

export default {
  id: 'lounge_chair',
  name: '户外椅',
  nameEn: 'Teak & Rope Lounge Chair',
  category: 'balcony',
  aoDensity: 150,
  view: { el: 16, az: 32 },
  build(k) {
    const q = (...v) => k.q(...v);
    const r = q(0.004, 0, 0), segs = q(1, 0, 0); // 细料在 LOD1 就不倒角了
    const legH = ARM.y - ARM.t;
    // —— 腿 ——
    for (const [i, sx, sz] of [[0, 1, 1], [1, -1, 1], [2, -1, -1], [3, 1, -1]]) {
      k.box({
        name: `leg${i}`, mat: 'teak', size: [LEG, legH, LEG], r, segs, grain: 'y', omit: ['ny', 'py'],
        xf: xf({ pos: [sx * LX, legH / 2, sz * LZ] }),
      });
    }
    // —— 扶手：宽而平，前端探出，四边圆角 ——
    for (const s of [-1, 1]) {
      k.box({
        name: `arm${s > 0 ? 'R' : 'L'}`, mat: 'teak', size: [ARM.w, ARM.t, 0.76], r: q(0.009, 0.007, 0), segs: q(2, 1, 0), grain: 'z',
        density: { ny: 0.5 },
        xf: xf({ pos: [s * LX, legH + ARM.t / 2, 0.02] }),
      });
      // 侧撑（前后腿之间，贴近地面）
      k.box({
        name: `stretch${s > 0 ? 'R' : 'L'}`, mat: 'teak', size: [0.022, 0.035, 2 * LZ - LEG], r, segs, grain: 'z', omit: ['pz', 'nz'],
        xf: xf({ pos: [s * LX, 0.12, 0] }),
      });
    }
    // —— 座框：前后横档 + 两侧横档（坐垫压在上面）——
    const ry = RAIL.y + RAIL.h / 2;
    for (const s of [-1, 1]) {
      k.box({
        name: `rail${s > 0 ? 'F' : 'B'}`, mat: 'teak', size: [2 * LX - LEG, RAIL.h, RAIL.t], r, segs, grain: 'x', omit: ['px', 'nx'],
        xf: xf({ pos: [0, ry, s * LZ] }),
      });
      k.box({
        name: `side${s > 0 ? 'R' : 'L'}`, mat: 'teak', size: [RAIL.t, RAIL.h, 2 * LZ - LEG], r, segs, grain: 'z', omit: ['pz', 'nz'],
        xf: xf({ pos: [s * LX, ry, 0] }),
      });
    }
    const seatTop = RAIL.y + RAIL.h;
    // —— 坐垫 ——
    const cush = { w: 2 * LX - LEG - 0.01, h: 0.13, d: 0.64 };
    k.box({
      name: 'cushion', mat: 'canvas', size: [cush.w, cush.h, cush.d], r: q(0.035, 0.03, 0.025), segs: q(2, 2, 1),
      div: q([2, 1, 2], [1, 1, 1], [1, 1, 1]), puff: q({ top: 0.018, side: 0.007 }, { top: 0.014 }, null), omit: ['ny'],
      xf: xf({ pos: [0, seatTop + cush.h / 2, 0.012] }),
    });
    // —— 靠背：后倾的小框，框里一排竖向编绳 ——
    const place = xf({ pos: [0, seatTop, BACK.z], rot: [-BACK.tilt, 0, 0] });
    const at = (x, y, z) => place.apply([x, y, z]);
    const sx = BACK.w / 2 - 0.0175;
    for (const s of [-1, 1]) {
      k.box({
        name: `stile${s > 0 ? 'R' : 'L'}`, mat: 'teak', size: [0.035, BACK.h, BACK.t], r, segs, grain: 'y',
        xf: place.mul(xf({ pos: [s * sx, BACK.h / 2, 0] })),
      });
    }
    const railT = { lo: [0.02, 0.04], hi: [BACK.h - 0.028, 0.056] }; // [中心高度, 高]
    for (const [name, [y, h]] of [['backLo', railT.lo], ['backHi', railT.hi]]) {
      k.box({
        name, mat: 'teak', size: [2 * sx - 0.035, h, BACK.t], r: name === 'backHi' ? q(0.008, 0.006, 0) : r, segs: q(name === 'backHi' ? 2 : 1, 1, 0),
        grain: 'x', omit: ['px', 'nx'],
        xf: place.mul(xf({ pos: [0, y, 0] })),
      });
    }
    // 编绳：贴着横档前面，从下横档缠到上横档
    const rz = BACK.t / 2 + 0.005, x0 = -sx + 0.035, x1 = sx - 0.035;
    for (let i = 0; i < ROPES; i++) {
      if (k.lod === 2 && i % 2) continue;
      const x = x0 + ((x1 - x0) * (i + 0.5)) / ROPES;
      k.sweep({
        name: `rope${i}`, mat: 'rope', shape: circle(0.006, q(6, 4, 4)), caps: [false, false], up: [0, 0, 1],
        path: [at(x, railT.lo[0] - 0.012, rz), at(x, railT.hi[0] + 0.02, rz)],
        density: { side: 0.5 },
      });
    }
    // —— 腰枕：跟靠背一起后倾，靠在编绳前面，下沿落在坐垫后缘 ——
    if (k.lod < 2) {
      k.box({
        name: 'pillow', mat: 'linen_sage', size: [0.36, 0.23, 0.1], r: q(0.038, 0.032, 0.028), segs: q(2, 2, 1),
        div: q([2, 2, 1], [1, 1, 1], [1, 1, 1]), puff: q({ sideZ: 0.022, top: 0.006 }, { sideZ: 0.016 }, null),
        xf: place.mul(xf({ pos: [0, 0.255, rz + 0.058] })),
      });
    }
  },
};
