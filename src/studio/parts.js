import { profile } from '../core/shape.js';
import { xf } from '../core/vec.js';
import { studioSwatch, labelUV } from '../materials/atlas.js';

// 画室几件东西共用的小工具
// 部件整个指向画室图集里的一个纯色格子
export function sw(part, name) {
  const uv = studioSwatch(name);
  part.T = part.T.map(() => uv);
  return part;
}
// 按顶点位置（和法线）给 UV
export function mapUV(part, f) {
  part.T = part.P.map((p, i) => f(p, part.N[i]));
  return part;
}
export { ccw, catmull, tiltX } from '../gym2/parts.js';

// 一支画笔（车削）：局部 +y 从笔尾到笔尖，笔杆 + 金属箍 + 笔毛，笔尖蘸着颜料；place 把它摆到位
//   L 全长，R 笔杆最粗处的半径，handle / tip 笔杆和笔尖颜料的色块
export function brush(k, name, { L, R, handle, tip, place }) {
  const q = (...v) => k.q(...v);
  const sm = { smooth: true };
  const hL = L - 0.07, segs = q(8, 6, 4);
  sw(k.lathe({ name: `${name}Handle`, mat: 'studio', segs, profile: profile([[0, 0], [R * 0.45, 0.0015, sm], [R * 0.62, 0.02, sm], [R, 0.12, sm], [R * 0.85, hL - 0.02, sm], [R * 0.78, hL]]), xf: place }), handle);
  const fr = R * 0.84;
  sw(k.lathe({ name: `${name}Ferrule`, mat: 'studio', segs, profile: profile([[R * 0.76, hL - 0.004], [fr, hL - 0.003], [fr, hL + 0.03, sm], [fr * 0.82, hL + 0.038]]), xf: place }), 'silver');
  if (k.lod === 2) return;   // 远处看不出笔毛
  sw(k.lathe({ name: `${name}Hair`, mat: 'studio', segs, profile: profile([[fr * 0.8, hL + 0.036], [fr * 0.95, hL + 0.046, sm], [fr * 0.8, hL + 0.056]]), xf: place }), 'bristle');
  sw(k.lathe({ name: `${name}Tip`, mat: 'studio', segs, profile: profile([[fr * 0.8, hL + 0.056], [fr * 0.55, hL + 0.066, sm], [0, hL + 0.072]]), xf: place }), tip);
}

// 一支颜料管：局部 +x 从管肩到封口，管身是一串截面放样（管肩处是圆的，往后一点点压扁，封口处压成一片），
// 标签（STUDIO_ATLAS.tubes 第 i 支）绕管一圈、正面朝上（+y）；管肩、螺口、盖子是车削，封口一条压花的扁片。
//   squeeze：用过的管子从尾巴往前挤扁了多少（0 = 新的）；capOff：盖子拧下来了（露出螺口和一点挤出来的颜料）
export const TUBE = { R: 0.0125, BL: 0.085, AF: 0.0185, BF: 0.0009, CRIMP: 0.009 };
export function tube(k, name, { i, squeeze = 0, capOff = false, blob = null, place }) {
  const q = (...v) => k.q(...v);
  const { R, BL, AF, BF, CRIMP } = TUBE;
  const n = q(12, 8, 6), m = q(8, 5, 4);
  const rings = [];
  for (let r = 0; r < m; r++) {
    const t = r / (m - 1);
    const f = squeeze > 0 ? Math.min(1, (t / (1 - squeeze * 0.6)) ** 1.3) : t ** 1.6;
    const a = R + (AF - R) * f, b = R + (BF - R) * f;
    const ring = [];
    for (let j = 0; j < n; j++) {
      const ph = (2 * Math.PI * j) / n;
      ring.push([t * BL, -b * Math.cos(ph), -a * Math.sin(ph)]);
    }
    rings.push(ring);
  }
  const body = k.loft({ name: `${name}Body`, mat: 'studio', rings });
  // 顶点按环、按列依次生成（每环 n + 1 个，最后一个是接缝的重复点）
  body.T = body.P.map((_, idx) => labelUV(i, Math.floor(idx / (n + 1)) / (m - 1), (idx % (n + 1)) / n));
  body.transform(place);
  const sm = { smooth: true };
  const shoulder = place.mul(xf({ rot: [0, 0, Math.PI / 2] }));   // 车削轴 +y → 局部 -x
  sw(k.lathe({ name: `${name}Shoulder`, mat: 'studio', segs: n, profile: profile([[R, 0], [R * 0.96, 0.0025, sm], [0.0056, 0.0075, sm], [0.0045, 0.0088]]), xf: shoulder }), 'capWhite');
  if (capOff || k.lod < 2) sw(k.lathe({ name: `${name}Neck`, mat: 'studio', segs: q(8, 6, 4), profile: profile([[0.0045, 0.0088], [0.0044, 0.0135], [0.0028, 0.0138], [0, 0.0138]]), xf: shoulder }), 'aluminum');
  if (!capOff) {
    sw(k.lathe({ name: `${name}Cap`, mat: 'studio', segs: q(12, 8, 6), profile: profile([[0.0076, 0.008], [0.0076, 0.0215, { r: q(0.0015, 0.001, 0), segs: 1 }], [0, 0.0218]]), xf: shoulder }), 'capBlack');
  } else if (blob) {
    // 螺口上挤出来的一小截颜料
    sw(k.lathe({ name: `${name}Blob`, mat: 'studio', segs: q(8, 6, 4), profile: profile([[0.0026, 0.0136], [0.0034, 0.017, sm], [0.0022, 0.0205, sm], [0, 0.0215]]), xf: shoulder }), blob);
  }
  const crimp = k.box({ name: `${name}Crimp`, mat: 'studio', size: [CRIMP, 2 * BF, 2 * AF], r: q(0.0006, 0), segs: q(1, 0), xf: place.mul(xf({ pos: [BL + CRIMP / 2 - 0.0005, 0, 0] })) });
  sw(crimp, 'capWhite');
}
// 管子平躺时（管肩那头的管身和封口都着地）要绕局部 z 转的角度，和管轴离地的高度
export const tubeRest = () => {
  const { R, BL, BF, CRIMP } = TUBE;
  const a = Math.atan2(R - BF, BL + CRIMP);
  return { tilt: -a, y: R * Math.cos(a) };
};
// 拧下来的盖子（侧躺）
export function tubeCap(k, name, place) {
  const q = (...v) => k.q(...v);
  sw(k.lathe({ name, mat: 'studio', segs: q(12, 8, 6), profile: profile([[0, 0.008], [0.0076, 0.008], [0.0076, 0.0215, { r: q(0.0015, 0.001, 0), segs: 1 }], [0, 0.0218]]), xf: place }), 'capBlack');
}
