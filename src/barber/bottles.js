// 理发店的六种瓶子 / 罐子：几何（沿局部 y 车削）和图集里的瓶身贴图共用这一份外形（做法和酒吧的酒瓶一样）。
// 外形是自下而上的 (r, y) 点（米），从瓶底中心走到瓶盖顶中心，全部是平滑顶点 —— 整只瓶子是一条环带，
// 贴图按“u 绕一圈（0.5 是正面）× v 沿轮廓的弧长”展开，图集里每种一格（512²）。
//   glass 瓶身颜色、liquid 里面的液体（null = 看不出来）、fill 液面高度、cap 从哪个高度往上是瓶盖（capColor，capMetal 是金属盖）、
//   label [下沿高度, 上沿高度, 宽（占一圈的比例）]、paper / ink 标签底色和字色、name / sub / line 三行字；
//   gloss 瓶身的高光强弱（玻璃 1、塑料瓶和铁皮罐小一点）
export { arcTable, pointAt } from '../bar/bottles.js';
export const BARBER_BOTTLES = [
  { id: 'bayRum', pts: [[0, 0], [0.034, 0], [0.036, 0.006], [0.036, 0.16], [0.03, 0.19], [0.016, 0.205], [0.013, 0.228], [0.015, 0.23], [0.015, 0.252], [0, 0.253]],
    glass: [128, 80, 38], liquid: [150, 70, 20], fill: 0.17, cap: 0.229, capColor: [24, 22, 20], gloss: 1,
    label: [0.04, 0.14, 0.42], paper: [236, 222, 190], ink: [40, 30, 24], accent: [170, 36, 30], name: 'BAY RUM', sub: 'TRYITEM', line: 'SINCE 1926' },
  { id: 'tonic', pts: [[0, 0], [0.032, 0], [0.034, 0.006], [0.034, 0.15], [0.024, 0.172], [0.012, 0.182], [0.011, 0.2], [0.0135, 0.202], [0.0135, 0.222], [0, 0.223]],
    glass: [70, 116, 76], liquid: [120, 176, 96], fill: 0.16, cap: 0.201, capColor: [176, 30, 32], gloss: 1,
    label: [0.035, 0.13, 0.5], paper: [196, 44, 40], ink: [244, 232, 206], accent: [244, 232, 206], name: 'HAIR TONIC', sub: 'TRYITEM', line: 'FOR MEN' },
  { id: 'aftershave', pts: [[0, 0], [0.038, 0], [0.041, 0.008], [0.042, 0.07], [0.036, 0.105], [0.016, 0.122], [0.012, 0.134], [0.0145, 0.136], [0.0145, 0.158], [0, 0.159]],
    glass: [214, 226, 232], liquid: [70, 146, 210], fill: 0.1, cap: 0.135, capColor: [22, 22, 24], gloss: 1,
    label: [0.02, 0.075, 0.46], paper: [30, 40, 72], ink: [232, 232, 226], accent: [206, 176, 100], name: 'AFTER SHAVE', sub: 'TRYITEM', line: 'COOL MINT' },
  { id: 'shampoo', pts: [[0, 0], [0.036, 0], [0.037, 0.005], [0.037, 0.17], [0.03, 0.19], [0.014, 0.2], [0.014, 0.215], [0.017, 0.217], [0.017, 0.232], [0, 0.233]],
    glass: [236, 236, 232], liquid: null, fill: 0, cap: 0.2, capColor: [26, 26, 28], gloss: 0.45,
    label: [0.03, 0.15, 0.4], paper: [236, 236, 232], ink: [30, 70, 56], accent: [30, 70, 56], name: 'SHAMPOO', sub: 'TRYITEM', line: 'BARBER USE' },
  { id: 'conditioner', pts: [[0, 0], [0.036, 0], [0.037, 0.005], [0.037, 0.17], [0.03, 0.19], [0.014, 0.2], [0.014, 0.215], [0.017, 0.217], [0.017, 0.232], [0, 0.233]],
    glass: [34, 34, 36], liquid: null, fill: 0, cap: 0.2, capColor: [26, 26, 28], gloss: 0.45,
    label: [0.03, 0.15, 0.4], paper: [34, 34, 36], ink: [222, 196, 140], accent: [222, 196, 140], name: 'CONDITIONER', sub: 'TRYITEM', line: 'ARGAN OIL' },
  { id: 'talc', pts: [[0, 0], [0.031, 0], [0.032, 0.004], [0.032, 0.145], [0.03, 0.15], [0.026, 0.153], [0.026, 0.165], [0.022, 0.168], [0, 0.169]],
    glass: [238, 232, 216], liquid: null, fill: 0, cap: 0.149, capColor: [224, 226, 230], capMetal: true, gloss: 0.5,
    label: [0.014, 0.138, 1], paper: [238, 232, 216], ink: [34, 44, 80], accent: [180, 30, 34], name: 'TALC', sub: 'TRYITEM', line: 'BARBER POWDER' },
];
export const barberBottleIndex = (id) => BARBER_BOTTLES.findIndex((b) => b.id === id);
