import { profile } from '../core/shape.js';
import { xf } from '../core/vec.js';
import { puffDeform } from '../prims/box.js';
import { frontLoader, BODY } from './appliance.js';
import { paint } from '../kids/toys.js';

// 滚筒洗衣机：白色机身、镀铬门圈、往里凹的烟灰色玻璃门；隔着玻璃看得见波纹橡胶门封和冲孔的不锈钢内筒（三根提升筋）
//   · 控制面板：左边洗衣液抽屉，中间程序旋钮（镀铬底圈），右边显示窗（剩余 1:25）和三个按钮；
//   · 右下角一个排水过滤器小门；四只可调节的脚；
//   · 机器顶上放一瓶洗衣液（圆角方瓶、蓝盖、蓝标签）。
export default {
  id: 'washer',
  name: '洗衣机',
  nameEn: 'Front-Loading Washer',
  category: 'laundry',
  planes: ['floor', 'wall'],
  aoDensity: 200,
  shadow: {
    floor: { margin: 0.14, maxDist: 0.35, density: 90 },
    wall: { margin: 0.1, maxDist: 0.3, density: 70, strength: 0.6 },
  },
  view: { el: 12, az: 26 },
  build(k) {
    const q = (...v) => k.q(...v);
    frontLoader(k, {
      panel: 'W', drum: 'drumW', gasket: true, kick: 'hatch',
      door: { y: 0.43, ring: 0.24, glass: 0.168, bowl: 0.1, ringColor: 'chrome' },
    });
    // 洗衣液：圆角方瓶（瓶身微微鼓起），蓝色瓶盖，正面一张标签
    const bx = -0.17, bz = BODY.ZB + 0.16, y0 = BODY.H;
    const bs = [0.11, 0.2, 0.068], bh = bs.map((v) => v / 2);
    const place = xf({ pos: [bx, y0, bz], rot: [0, 0.35, 0] });
    paint(k.box({
      name: 'bottle', mat: 'toys', size: bs, r: q(0.02, 0.016, 0.012), segs: q(2, 1, 1), div: q([1, 2, 1], 1, 1),
      omit: ['ny'], deform: q(puffDeform(bh, { sideZ: 0.004 }), null, null), xf: place.mul(xf({ pos: [0, bh[1], 0] })),
    }), 'cream');
    const s = { smooth: true };
    paint(k.lathe({
      name: 'neck', mat: 'toys', segs: q(12, 8, 6),
      profile: profile([[0.03, 0], [0.018, 0.012, s], [0.016, 0.02]]),
      xf: place.mul(xf({ pos: [0, bs[1] - 0.002, 0] })),
    }), 'cream');
    paint(k.lathe({
      name: 'cap', mat: 'toys', segs: q(12, 8, 6),
      profile: profile([[0.022, 0], [0.022, 0.028, { r: 0.003, segs: 1 }], [0, 0.03]]),
      xf: place.mul(xf({ pos: [0, bs[1] + 0.016, 0] })),
    }), 'blue');
    if (k.lod < 2) {
      paint(k.box({
        name: 'label', mat: 'toys', size: [0.078, 0.09, 0.002], segs: 0, omit: ['nz'],
        xf: place.mul(xf({ pos: [0, 0.085, bh[2] + 0.0035] })),
      }), 'blue');
    }
  },
};
