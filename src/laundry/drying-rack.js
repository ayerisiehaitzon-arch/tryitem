import { circle, rect, profile } from '../core/shape.js';
import { xf, smoothstep } from '../core/vec.js';
import { paint } from '../kids/toys.js';

// 晾衣架：老式的三折木头晾衣屏风（桦木），三扇之间用布带做铰链，摆成“之”字形自己站住
//   · 每扇：两根方立柱（棱 5mm 圆角）、三根圆横杆，顶上一根粗一点的；
//   · 铰链：两根挨着的立柱外面绕一圈帆布带（上下各一道），是一条沿“跑道形”路径的扫掠；
//   · 晾着的东西都是“搭在杆上的布”：截面是一条沿横杆方向的直线，沿“前面垂下来 → 翻过杆顶 → 后面垂下来”的路径扫掠；
//     再做一次光滑形变：离杆越远、布上竖向的褶越深（杆顶那一段是平的），褶的相位每条布不一样；
//     布的两头一长一短，下摆稍微往外飘一点；
//   · 左边一扇搭一条白色浴巾，中间一扇顶上一条鼠尾草绿的毛巾、下面一条红条纹的亚麻茶巾，
//     右边一扇顶上两只袜子（用木夹子夹着），下面一条小方巾。
// 原点在整个架子占地的中心（地面上）。
const A = 0.028, H = 1.22, LP = 0.56, GAP = 0.004;
const RAILS = [{ y: 0.32, r: 0.011 }, { y: 0.64, r: 0.011 }, { y: 0.95, r: 0.011 }, { y: 1.17, r: 0.014 }];
const PHI = 0.45; // 每扇和 x 轴的夹角（左右交替）

// 三扇的位置：一扇接一扇，方向交替
function panels() {
  const L = LP + A + GAP;
  const out = [];
  let x = 0, z = 0;
  for (let i = 0; i < 3; i++) {
    const phi = i % 2 ? -PHI : PHI;
    const d = [Math.cos(phi), Math.sin(phi)];
    out.push({ i, phi, d, c: [x + (d[0] * L) / 2, z + (d[1] * L) / 2] });
    x += d[0] * L; z += d[1] * L;
  }
  // 整体挪到占地中心
  const cx = x / 2, cz = z / 2;
  for (const p of out) { p.c[0] -= cx; p.c[1] -= cz; p.n = [-p.d[1], p.d[0]]; p.place = xf({ pos: [p.c[0], 0, p.c[1]], rot: [0, -p.phi, 0] }); }
  return out;
}

export default {
  id: 'drying_rack',
  name: '晾衣架',
  nameEn: 'Folding Wooden Clothes Horse',
  category: 'laundry',
  aoDensity: 150,
  shadow: { margin: 0.2, maxDist: 0.6, density: 80 },
  view: { el: 12, az: 18 },
  build(k) {
    const q = (...v) => k.q(...v);
    const P = panels();
    // —— 框架 ——
    for (const p of P) {
      for (const s of [-1, 1]) {
        k.box({
          name: `stile${p.i}${s > 0 ? 'R' : 'L'}`, mat: 'birch', size: [A, H, A], r: q(0.005, 0.004, 0), segs: q(1, 1, 0), grain: 'y',
          omit: ['ny'], xf: p.place.mul(xf({ pos: [(s * LP) / 2, H / 2, 0] })),
        });
      }
      RAILS.forEach((R, j) => {
        const x = LP / 2 - A / 2 + 0.004;
        k.sweep({
          name: `rail${p.i}${j}`, mat: 'birch', shape: circle(R.r, q(8, 6, 5)), caps: [false, false], up: [0, 1, 0],
          path: [[-x, R.y, 0], [x, R.y, 0]].map((v) => p.place.apply(v)),
        });
      });
    }
    // —— 布带铰链：两根挨着的立柱外面绕一圈 ——
    if (k.lod < 2) {
      for (let i = 0; i < 2; i++) {
        const a = P[i].place.apply([LP / 2, 0, 0]), b = P[i + 1].place.apply([-LP / 2, 0, 0]);
        const c1 = [a[0], a[2]], c2 = [b[0], b[2]];
        const ux = c2[0] - c1[0], uz = c2[1] - c1[1], l = Math.hypot(ux, uz);
        const t = [ux / l, uz / l], nn = [-t[1], t[0]];
        const rt = 0.0188, ns = q(6, 4);
        const loop = [];
        for (let j = 0; j <= ns; j++) { const w = Math.PI / 2 + (Math.PI * j) / ns; loop.push([c1[0] + (t[0] * Math.cos(w) + nn[0] * Math.sin(w)) * rt, c1[1] + (t[1] * Math.cos(w) + nn[1] * Math.sin(w)) * rt]); }
        for (let j = 0; j <= ns; j++) { const w = -Math.PI / 2 + (Math.PI * j) / ns; loop.push([c2[0] + (t[0] * Math.cos(w) + nn[0] * Math.sin(w)) * rt, c2[1] + (t[1] * Math.cos(w) + nn[1] * Math.sin(w)) * rt]); }
        for (const [hj, yh] of [[0, 0.22], [1, 1.02]]) {
          paint(k.sweep({
            name: `tape${i}${hj}`, mat: 'toys', shape: rect(0.0012, 0.024), closed: true, caps: [false, false], up: [0, 1, 0],
            path: loop.map(([x, z]) => [x, yh, z]),
          }), 'cream');
        }
      }
    }

    // —— 晾着的东西 ——
    const rail = (p, j) => ({ p, y: RAILS[j].y, r: RAILS[j].r });
    drape(k, { name: 'bathTowel', mat: 'terry', on: rail(P[0], 3), w: 0.5, front: 0.64, back: 0.52, folds: 3, amp: 0.022, seed: 1, t: 0.005 });
    drape(k, { name: 'handTowel', mat: 'terry_sage', on: rail(P[1], 3), w: 0.38, front: 0.3, back: 0.34, folds: 2, amp: 0.014, seed: 2, t: 0.005 });
    drape(k, { name: 'teaTowel', mat: 'torchon', on: rail(P[1], 1), w: 0.46, front: 0.32, back: 0.28, folds: 3, amp: 0.012, seed: 3, t: 0.002, off: 0.01 });
    drape(k, { name: 'faceCloth', mat: 'terry', on: rail(P[2], 1), w: 0.3, front: 0.26, back: 0.3, folds: 2, amp: 0.01, seed: 4, t: 0.005, off: -0.06 });
    if (k.lod < 2) {
      drape(k, { name: 'sockA', mat: 'toys', color: 'fabricMustard', on: rail(P[2], 3), w: 0.085, front: 0.14, back: 0.17, folds: 1, amp: 0.004, seed: 5, t: 0.004, off: -0.12, pegs: true, foot: 0.1 });
      drape(k, { name: 'sockB', mat: 'toys', color: 'fabricBlue', on: rail(P[2], 3), w: 0.085, front: 0.16, back: 0.15, folds: 1, amp: 0.004, seed: 6, t: 0.004, off: 0.02, pegs: true, foot: 0.1 });
    }
  },
};

// 一块搭在横杆上的布。on：{ p: 哪一扇, y: 杆中心高, r: 杆半径 }；w 布宽（沿杆）；front / back 两边垂下来的长度；
// off：布中心沿杆偏离杆中点多少；folds / amp：竖向褶的个数和最大深度；pegs：杆顶夹一个木夹子
function drape(k, { name, mat, color = null, on, w, front, back, folds, amp, seed, t, off = 0, pegs = false, foot = 0 }) {
  const q = (...v) => k.q(...v);
  const { p, y: yc, r } = on;
  const u = [p.d[0], 0, p.d[1]], n = [p.n[0], 0, p.n[1]];
  const rc = r + t / 2;
  const rnd = k.rand(name);
  const c = [p.c[0] + u[0] * off, 0, p.c[1] + u[2] * off];
  // 截面所在的竖直平面里的路径（a：沿 n 的偏移，y：高度），从前面的下摆翻过杆顶到后面的下摆
  const fl = 0.02 + rnd() * 0.02, bl = 0.02 + rnd() * 0.02;
  const pts2 = [[rc + fl, yc - front], [rc + 0.004, yc - front * 0.5], [rc, yc - 0.015]];
  const na = q(5, 3, 2);
  for (let i = 1; i < na; i++) { const a = (Math.PI * i) / na; pts2.push([rc * Math.cos(a), yc + rc * Math.sin(a)]); }
  pts2.push([-rc, yc - 0.015], [-rc - 0.004, yc - back * 0.5], [-rc - bl, yc - back]);
  // 袜子：后面那一截到了脚跟往外折出去一段脚掌
  if (foot > 0) pts2.push([-rc - bl - foot * 0.22, yc - back - foot * 0.36], [-rc - bl - foot * 0.62, yc - back - foot * 0.9]);
  const path = pts2.map(([a, y]) => [c[0] + n[0] * a, y, c[2] + n[2] * a]);
  const nw = q(folds * 4 + 2, folds * 2 + 2, 2);
  const sec = profile(Array.from({ length: nw + 1 }, (_, i) => [0, -w / 2 + (w * i) / nw, { smooth: true }]));
  const part = k.sweep({ name, mat, shape: sec, caps: [false, false], up: u, path, maxChart: 1.2 });
  // 竖向的褶：离杆顶越远越深；沿布宽是几个正弦波（相位随机）。褶只往外鼓（前面那片往前、后面那片往后）：
  // 往里凹的话，垂下来的布会被同一扇下面的横杆顶穿
  if (k.lod < 2) {
    const ph = rnd() * Math.PI * 2, ph2 = rnd() * Math.PI * 2;
    part.deform((pp) => {
      const d = yc - pp[1];
      const s = (pp[0] - c[0]) * u[0] + (pp[2] - c[2]) * u[2];
      const side = (pp[0] - c[0]) * n[0] + (pp[2] - c[2]) * n[2] >= 0 ? 1 : -1;
      const A = amp * smoothstep(0.03, 0.4, d);
      const wv = Math.sin((Math.PI * 2 * folds * (s + w / 2)) / w + ph) + 0.35 * Math.sin((Math.PI * 2 * (folds + 1) * (s + w / 2)) / w + ph2);
      const m = side * A * (0.5 + 0.37 * wv);
      return [pp[0] + n[0] * m, pp[1], pp[2] + n[2] * m];
    });
  }
  if (color) paint(part, color);
  if (pegs) {
    // 木夹子：两片夹脚跨在杆上（上端并拢一点）
    for (const sd of [-1, 1]) {
      const at = [c[0] + n[0] * sd * (rc + 0.0042), yc + 0.008, c[2] + n[2] * sd * (rc + 0.0042)];
      paint(k.box({
        name: `${name}Peg${sd > 0 ? 'F' : 'B'}`, mat: 'toys', size: [0.011, 0.072, 0.0065], r: 0.0015, segs: 1,
        xf: xf({ pos: at, rot: [0, -p.phi, 0] }).mul(xf({ rot: [-sd * 0.1, 0, 0] })),
      }), 'beech');
    }
  }
  return part;
}
