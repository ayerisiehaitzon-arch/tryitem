import { xf } from '../core/vec.js';
import { vessel } from './profiles.js';
import { revolve } from './revolve.js';
import { ceramicUV } from '../materials/atlas.js';

// 一件车削陶瓷器物：器型（profiles.js）+ 图集里对应的釉面区域，全部共用一个材质。
// segs = [LOD0, LOD1, LOD2] 圆周分段；轮廓按剪影误差自适应取点（1mm / 2.2mm / 6mm）
export function vessel3d(k, { name, shape, segs, scale = 1, pos = [0, 0, 0], rot = 0 }) {
  return revolve(k, {
    name, mat: 'glaze', cv: vessel(shape), scale,
    segs: k.q(...segs), tol: k.q(0.001, 0.0022, 0.006), maxAngle: k.q(0.9, 1.2, 1.6),
    uv: (u, v) => ceramicUV(shape, u, v),
    density: { in: 0.5 },
    xf: xf({ pos, rot: [0, rot, 0] }),
  });
}

// 一组三件：白釉细颈瓶、青釉圆罐、天目釉小花瓶
export default {
  id: 'vases',
  name: '花瓶',
  nameEn: 'Stoneware Vases',
  category: 'decor',
  aoDensity: 220,
  // 放在茶几上：阴影贴花收小，四角不伸出圆桌面
  shadow: { margin: 0.08, maxDist: 0.14, density: 200 },
  build(k) {
    vessel3d(k, { name: 'bottle', shape: 'bottle', segs: [16, 12, 6], pos: [-0.1, 0, -0.03] });
    vessel3d(k, { name: 'moon', shape: 'moon', segs: [22, 14, 8], pos: [0.092, 0, 0], rot: -0.8 });
    vessel3d(k, { name: 'bud', shape: 'bud', segs: [14, 10, 6], pos: [-0.03, 0, 0.125], rot: 2.1 });
  },
};
