// 木工房的共用数据：洞洞板上每件工具的位置和尺寸（贴图按它画工具的轮廓，几何按它把工具挂上去），
// 还有手锯（挂板上画着它的轮廓，实物卡在锯木架上的锯口里）和角尺（轮廓在挂板上，实物躺在木工桌上）的外形。
// 洞洞板坐标：x 向右、y 向上，原点在板的左下角，单位米；z 朝外（板面 z = 0）。

export const PEG = { w: 1.2, h: 0.9, pitch: 0.0254, holeR: 0.0032, t: 0.005, stand: 0.022 };

// 手锯：局部坐标 x 从锯尖（0）到锯根，y 从齿线（0）往上；锯身是一个梯形，把手是一圈（外轮廓 + 握孔）
export const SAW = {
  len: 0.44, heelH: 0.115, toeH: 0.07, t: 0.0009,
  handle: [[0.395, -0.004], [0.43, -0.012], [0.47, -0.022], [0.515, -0.038], [0.548, -0.036], [0.556, -0.012], [0.546, 0.03],
    [0.538, 0.07], [0.548, 0.105], [0.535, 0.135], [0.505, 0.146], [0.468, 0.142], [0.43, 0.13], [0.395, 0.124]],
  grip: { c: [0.49, 0.062], rx: 0.024, ry: 0.04 },
  handleT: 0.022,
};
export const sawBlade = () => [[0, 0], [SAW.len, 0], [SAW.len, SAW.heelH], [0, SAW.toeH]];
// 角尺：尺座（红木）和尺身（钢）
export const SQUARE = { stock: [0.15, 0.024, 0.018], blade: [0.25, 0.03, 0.002] };

// 洞洞板的孔：第 i 列 / 第 i 排孔心（板边进来半格）。挂钩都插在孔里，水平伸出来，末端往上翘；
// 工具搁在挂钩上时，底边比孔心高 HOOK.lift（钢丝半径 + 一点余量）
export const hole = (i) => PEG.pitch * (i + 0.5);
export const HOOK = { r: 0.0022, lift: 0.0025 };
const rest = (row) => hole(row) + HOOK.lift;

// 挂板上的工具（board 坐标；挂钩写成 [列, 排]）。missing: 这件工具不在板上（只画了轮廓，挂钩空着）
const WR = { cols: [22, 24, 26, 28, 30], row: 23, lens: [0.14, 0.155, 0.17, 0.185, 0.2], sizes: [0.0115, 0.0127, 0.014, 0.0154, 0.017] };
export const BOARD = {
  saw: { at: [0.05, rest(27)], missing: true, hooks: [[7, 27], [13, 27]] },
  level: { x0: 0.68, x1: 1.13, y0: rest(30), h: 0.045, d: 0.026, hooks: [[29, 30], [41, 30]] },
  // 锤子：锤头搁在锤柄两边的两个挂钩上，锤柄垂下来
  hammer: { x: 0.1, yEnd: 0.34, yHead: rest(24) + 0.014, head: [0.05, 0.168], headH: 0.028, hooks: [[2, 24], [5, 24]] },
  // 螺丝刀：插在一条木架子的孔里，架子两头搁在挂钩上
  drivers: { rack: [0.18, 0.41, rest(20), 0.025, 0.05], hooks: [[7, 20], [15, 20]], xs: [0.225, 0.27, 0.315, 0.36], handle: 0.1, shafts: [0.13, 0.1, 0.15, 0.08], colors: ['yellow', 'redPlastic', 'yellow', 'bluePlastic'] },
  // 钳子：钳嘴朝下，挂钩卡在两根钳柄分叉的地方（轴的正上方）
  pliers: [{ x: hole(17), y0: hole(19) - 0.02 - 0.3 * 0.19, len: 0.19, grip: 'redPlastic', hook: [17, 19] }, { x: hole(20), y0: hole(19) - 0.02 - 0.3 * 0.17, len: 0.17, grip: 'bluePlastic', hook: [20, 19] }],
  // 梅花开口扳手：梅花那头的圈套在挂钩上（圈的内沿搁在钢丝上）
  wrenches: { ...WR, xs: WR.cols.map(hole), tops: WR.sizes.map((sz) => hole(WR.row) + HOOK.r + 0.45 * sz) },
  // 活扳手：挂钩穿过钳口
  adjust: { x: hole(33) + 0.003, top: hole(24) + HOOK.r + 0.022, len: 0.2, hook: [33, 24] },
  tape: { c: [hole(37), rest(20) + 0.033], w: 0.07, h: 0.066, d: 0.036, hook: [37, 20] },
  // 角尺：尺座搁在两个挂钩上，尺身垂下来
  square: { at: [1.0, rest(24) - (SQUARE.blade[0] - SQUARE.stock[1])], missing: true, hooks: [[41, 24], [44, 24]] },
  // F 夹：固定钳口搁在挂钩上
  clamps: { xs: [hole(3) - 0.03, hole(7) - 0.03, hole(11) - 0.03], y0: rest(10) - 0.23, len: 0.26, reach: 0.065, hooks: [[3, 10], [7, 10], [11, 10]] },
  shelf: { x0: 0.36, x1: 0.8, y: 0.08, d: 0.1, t: 0.015, jars: [0.42, 0.5, 0.58], can: 0.755, brackets: [15, 30] },
  cord: { hook: [22, 16], r: 0.095 },   // 一卷橙色的延长线挂在钩子上（不是工具，没画轮廓）
  chisels: { rack: [0.87, 1.14, rest(9), 0.025, 0.05], hooks: [[34, 9], [44, 9]], xs: [0.9, 0.96, 1.025, 1.095], widths: [0.006, 0.012, 0.019, 0.025], handle: 0.11, blade: 0.1 },
  spare: [[19, 26], [36, 17], [11, 14], [46, 5]],   // 几个空挂钩
};

// 钳柄的中心线（board 坐标）：从轴上方分开，很快张到 ±16mm，再几乎平行地伸到头
export function pliersHandle(p, sd) {
  const piv = p.y0 + p.len * 0.3;
  return [[p.x + sd * 0.006, piv + 0.004], [p.x + sd * 0.016, piv + 0.045], [p.x + sd * 0.0175, p.y0 + p.len - 0.006]];
}

// 画在挂板上的轮廓（剪影）：一串基本形状，贴图按 SDF 取并集。每件工具的剪影比实物外扩 3mm
export function silhouettes() {
  const P = BOARD, S = [];
  const rr = (x0, y0, x1, y1, r = 0.004) => S.push({ t: 'rr', x0, y0, x1, y1, r });
  const c = (x, y, r) => S.push({ t: 'c', x, y, r });
  const poly = (pts) => S.push({ t: 'poly', pts });
  const seg = (a, b, w) => S.push({ t: 'seg', a, b, w });
  // 手锯
  {
    const [ox, oy] = P.saw.at;
    poly(sawBlade().map(([x, y]) => [ox + x, oy + y]));
    poly(SAW.handle.map(([x, y]) => [ox + x, oy + y]));
  }
  // 水平尺
  rr(P.level.x0, P.level.y0, P.level.x1, P.level.y0 + P.level.h, 0.004);
  // 锤子：柄 + 头
  {
    const h = P.hammer;
    rr(h.x - 0.014, h.yEnd, h.x + 0.014, h.yHead, 0.012);
    rr(h.head[0], h.yHead - h.headH / 2, h.head[1], h.yHead + h.headH / 2, 0.006);
  }
  // 螺丝刀
  P.drivers.xs.forEach((x, i) => {
    const top = P.drivers.rack[2] + P.drivers.rack[3];
    rr(x - 0.016, top, x + 0.016, top + P.drivers.handle, 0.012);
    seg([x, top], [x, P.drivers.rack[2] - P.drivers.shafts[i]], 0.0055);
  });
  // 钳子：钳嘴、轴、两根钳柄
  for (const p of P.pliers) {
    const piv = p.y0 + p.len * 0.3;
    poly([[p.x - 0.003, p.y0], [p.x + 0.003, p.y0], [p.x + 0.011, piv - 0.01], [p.x - 0.011, piv - 0.01]]);
    c(p.x, piv, 0.012);
    for (const sd of [-1, 1]) {
      const [a, b, e] = pliersHandle(p, sd);
      seg(a, b, 0.012);
      seg(b, e, 0.012);
    }
  }
  // 梅花开口扳手
  P.wrenches.xs.forEach((x, i) => {
    const L = P.wrenches.lens[i], s = P.wrenches.sizes[i], top = P.wrenches.tops[i];
    c(x, top - s, s + 0.003);
    rr(x - s * 0.45, top - L + s, x + s * 0.45, top - s, s * 0.4);
    c(x, top - L + s * 1.1, s * 1.15 + 0.003);
  });
  // 活扳手
  {
    const a = P.adjust;
    rr(a.x - 0.011, a.top - a.len, a.x + 0.011, a.top - 0.04, 0.009);
    rr(a.x - 0.026, a.top - 0.05, a.x + 0.02, a.top, 0.008);
  }
  // 卷尺
  rr(P.tape.c[0] - P.tape.w / 2, P.tape.c[1] - P.tape.h / 2, P.tape.c[0] + P.tape.w / 2, P.tape.c[1] + P.tape.h / 2, 0.014);
  // 角尺：尺座横在上面，尺身竖着往下
  {
    const [x, y] = P.square.at, [sl, sw] = SQUARE.stock, [bl, bw] = SQUARE.blade;
    rr(x, y + bl - sw, x + sl, y + bl, 0.003);
    rr(x + 0.004, y, x + 0.004 + bw, y + bl - sw, 0.002);
  }
  // F 夹：竖着的钢条、上下两只夹口、丝杆和把手
  for (const x of P.clamps.xs) {
    const { y0, len, reach } = P.clamps;
    rr(x - 0.009, y0, x + 0.009, y0 + len, 0.003);
    rr(x - 0.009, y0 + len - 0.03, x + reach, y0 + len, 0.004);
    rr(x - 0.009, y0 + len * 0.52, x + reach, y0 + len * 0.52 + 0.028, 0.004);
    seg([x + reach - 0.012, y0 + len * 0.52], [x + reach - 0.012, y0 + 0.07], 0.0045);
    rr(x + reach - 0.024, y0, x + reach, y0 + 0.07, 0.01);
  }
  // 凿子
  P.chisels.xs.forEach((x, i) => {
    const w = P.chisels.widths[i], top = P.chisels.rack[2] + P.chisels.rack[3];
    rr(x - 0.015, top, x + 0.015, top + P.chisels.handle, 0.012);
    rr(x - w / 2 - 0.002, P.chisels.rack[2] - P.chisels.blade, x + w / 2 + 0.002, top, 0.002);
  });
  return S;
}

// 电钻（侧视）：x 朝钻头、y 向上；机身 + 握把是一条轮廓（挤出 5.5cm 厚），电池是底下一块圆角盒子，钻夹头在机身前面。
// 贴图（电钻侧面）按同一套坐标画：黄色的壳、黑色的包胶握把、后盖、散热槽、牌子、电池
export const DRILL = {
  body: [[0.035, 0.058], [0.1, 0.058], [0.108, 0.1], [0.116, 0.13], [0.128, 0.14], [0.155, 0.142], [0.16, 0.152], [0.16, 0.208],
    [0.15, 0.218], [0.025, 0.218], [0.004, 0.207], [-0.006, 0.18], [0.004, 0.153], [0.025, 0.142], [0.05, 0.138], [0.045, 0.1]],
  smooth: [false, false, true, true, true, false, true, true, true, true, true, true, true, true, true, true],
  depth: 0.055, axisY: 0.18,
  battery: { x0: -0.008, x1: 0.128, y1: 0.058, d: 0.075 },
  grip: [[0.038, 0.062], [0.098, 0.062], [0.106, 0.1], [0.112, 0.128], [0.052, 0.134], [0.046, 0.1]],
  frame: { x0: -0.02, y0: -0.01, size: 0.24 },
};
