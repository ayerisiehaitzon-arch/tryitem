import { revolve } from '../decor/revolve.js';
import { patioUV } from '../materials/atlas.js';
import { patioCurve } from './profiles.js';

// 鼓凳边桌：青瓷釉的陶瓷鼓凳（中式园林里的“绣墩”），当边桌用
//   · 一次车削：沿设计曲线自适应取点（balcony/profiles.js），上下两道凸棱、腰部最鼓、顶面微拱；
//   · 釉面全在贴图里，贴图生成器沿同一条曲线画：上下两排鼓钉（法线里的半球）、
//     腰上四个镂空的钱纹（孔直接画成凳子里面的暗色）、满身的开片、底足一圈露胎；
//     凸棱上釉薄发白，凹处积釉更绿 —— 都按曲线的曲率来；
//   · 顶面 47cm 高，放一杯咖啡、一本书正好。
export default {
  id: 'garden_stool',
  name: '鼓凳边桌',
  nameEn: 'Celadon Garden Stool',
  category: 'balcony',
  aoDensity: 200,
  shadow: { margin: 0.12, maxDist: 0.4, density: 120 },
  view: { el: 22, az: 30 },
  build(k) {
    const q = (...v) => k.q(...v);
    revolve(k, {
      name: 'stool', mat: 'patio', cv: patioCurve('stool'),
      segs: q(28, 18, 12), tol: q(0.0012, 0.0025, 0.006), maxAngle: q(0.5, 0.8, 1.2),
      uv: (u, v) => patioUV('stool', u, v),
    });
  },
};
