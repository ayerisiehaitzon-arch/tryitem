import { profile } from '../core/shape.js';
import { xf } from '../core/vec.js';
import { roundLeg } from './parts.js';

// 圆形茶几：Ø800 白色大理石台面 + 三条外撇的胡桃木锥腿
//   · 台面是车削体：只有外缘需要分段，上下两个大圆面各只是一圈扇形
//   · 下沿 1 段倒角（很少被看到），上沿 2 段圆角（高光主要在这里）
export default {
  id: 'coffee_table',
  name: '圆茶几',
  nameEn: 'Lune Coffee Table',
  build(k) {
    const q = (...v) => k.q(...v);
    const R = 0.4, y0 = 0.4, y1 = 0.42;
    k.lathe({
      name: 'top', mat: 'marble', segs: q(40, 28, 18),
      profile: profile([
        [0, y0],
        [R, y0, { r: q(0.004, 0.004, 0), segs: 1 }],
        [R, y1, { r: q(0.006, 0.006, 0), segs: q(2, 1, 1) }],
        [0, y1],
      ]),
      density: { 0: 0.4 },
    });

    // 三条腿：底部落在半径 0.33 的圆上，顶部收到 0.24，向内倾
    const rb = 0.33, rt = 0.24, h = y0 + 0.005;
    const tilt = Math.atan2(rb - rt, h);
    const L = h / Math.cos(tilt);
    for (let i = 0; i < 3; i++) {
      const th = (i / 3) * Math.PI * 2 + Math.PI / 6;
      roundLeg(k, {
        name: `leg${i}`, mat: 'walnut', r0: 0.012, r1: 0.019, h: L, segs: q(8, 7, 5),
        pos: [rb * Math.sin(th), 0, rb * Math.cos(th)], rot: [-tilt, th, 0],
      });
    }
  },
};
