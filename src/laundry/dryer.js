import { xf } from '../core/vec.js';
import { frontLoader, BODY } from './appliance.js';

// 热泵烘干机：和洗衣机同一套机身；门圈是白色的，玻璃是一块只微微内凹的平玻璃，
// 隔着玻璃是一圈平的毡封、门洞下沿的绒毛过滤网和压出菱格纹的不锈钢内筒
//   · 控制面板：左边冷凝水盒，程序旋钮，显示窗（琥珀色，剩余 0:52），三个按钮；
//   · 底部是通长的冷凝器检修门，一排通风槽；
//   · 机器顶上叠着三条叠好的毛巾（白、鼠尾草绿、白），一条比一条稍微歪一点。
export default {
  id: 'dryer',
  name: '烘干机',
  nameEn: 'Heat-Pump Dryer',
  category: 'laundry',
  planes: ['floor', 'wall'],
  aoDensity: 170,
  shadow: {
    floor: { margin: 0.14, maxDist: 0.35, density: 90 },
    wall: { margin: 0.1, maxDist: 0.3, density: 70, strength: 0.6 },
  },
  view: { el: 12, az: 26 },
  build(k) {
    const q = (...v) => k.q(...v);
    frontLoader(k, {
      panel: 'D', drum: 'drumD', gasket: false, kick: 'grille',
      door: { y: 0.43, ring: 0.245, glass: 0.18, bowl: 0.03, ringColor: 'white' },
    });
    // 叠好的毛巾：鼓鼓的圆角块，折边朝前（前面那条棱圆得多）
    const stack = [['terry', 0.052, 0.02, 0.0], ['terry_sage', 0.048, -0.012, 0.07], ['terry', 0.05, 0.01, -0.05]];
    let y = BODY.H;
    stack.forEach(([mat, h, dx, rot], i) => {
      const size = [0.36, h, 0.26];
      k.box({
        name: `towel${i}`, mat, size, r: q(0.02, 0.018, 0.014), segs: q(2, 1, 1), div: q([2, 1, 2], 1, 1), grain: 'x',
        omit: i === 0 ? ['ny'] : [], puff: q({ top: 0.008, side: 0.006 }, { top: 0.006 }, null),
        xf: xf({ pos: [0.02 + dx, y + h / 2, BODY.ZB + 0.2], rot: [0, rot, 0] }),
      });
      y += h - 0.004;
    });
  },
};
