import { profile, circle } from '../core/shape.js';
import { rod } from './parts.js';

// 吧台凳：胡桃木圆座 + 黑色钢管腿 + 脚踏圈
//   · 座面顶部微微下凹（只多一个轮廓点），靠平滑法线表现出“坐感”
//   · 脚踏圈是闭合路径扫掠：截面 6 边、路径 14 段就足够圆
export default {
  id: 'bar_stool',
  name: '吧台凳',
  nameEn: 'Perch Counter Stool',
  build(k) {
    const q = (...v) => k.q(...v);
    const H = 0.66, R = 0.18;
    k.lathe({
      name: 'seat', mat: 'walnut', segs: q(24, 18, 14),
      profile: profile([
        [0, H - 0.035],
        [R - 0.012, H - 0.035, { r: q(0.004, 0.004, 0), segs: 1 }],
        [R, H - 0.018, { r: q(0.012, 0.01, 0), segs: q(2, 2, 1) }],
        [R - 0.03, H, { smooth: true }],
        [0, H - 0.006],
      ]),
      density: { 0: 0.3 },
    });
    // 四条外撇钢管腿
    const rb = 0.23, rt = 0.12;
    const legs = [];
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const s = Math.sin(a), c = Math.cos(a);
      legs.push([s, c]);
      rod(k, {
        name: `leg${i}`, mat: 'steel', r: 0.011, segs: q(8, 6, 5), caps: [true, false],
        a: [rb * s, 0, rb * c], b: [rt * s, H - 0.03, rt * c],
      });
    }
    // 脚踏圈
    const ringY = 0.24;
    const rr = rb + (rt - rb) * (ringY / (H - 0.03)) + 0.006;
    const n = q(14, 10, 8);
    const path = Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2;
      return [rr * Math.sin(a), ringY, rr * Math.cos(a)];
    });
    k.sweep({ name: 'ring', mat: 'steel', shape: circle(0.0085, q(6, 5, 4)), path, closed: true, up: [0, 1, 0] });
  },
};
