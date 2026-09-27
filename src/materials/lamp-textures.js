// 灯具用的程序化贴图：纸灯笼。
// 整张图就是整只灯笼：u 绕一圈（首尾相接），v 沿轮廓弧长（0 = 下口，1 = 上口），
// 生成器沿同一条设计曲线（lighting/shapes.js）知道每一行像素的半径和弧长，所以
//   · 竹骨是一条真正的螺旋线：s = s0 + 螺距 × u，绕一圈正好接上下一圈，接缝处无缝；
//   · 纸片重叠的接缝、上下口包边、楮树皮纤维，都按物理尺寸画（到了上下口也不会被压扁）。
// 两张图：颜色图是白天看到的纸（竹骨只是一道浅浅的棱），自发光图是点亮后透出来的样子 ——
// 竹骨挡光成了深色的螺旋线，重叠的接缝和上下包边更暗，纸的云状厚薄、纤维都透出来，
// 离灯泡近、正对灯泡的地方更亮。
import { perlin, mulberry } from './noise.js';
import { curveAt } from '../decor/profiles.js';
import { LANTERN, LANTERN_RIB_PITCH, LANTERN_GORES } from '../lighting/shapes.js';

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const rgb = (c) => [c[0] / 255, c[1] / 255, c[2] / 255];
const fract = (x) => x - Math.floor(x);

export function paper(S) {
  const out = {
    color: new Float32Array(S * S * 3), emit: new Float32Array(S * S * 3),
    height: new Float32Array(S * S), rough: new Float32Array(S * S),
  };
  const cv = LANTERN, L = cv.length, P = LANTERN_RIB_PITCH;
  const rows = Array.from({ length: S }, (_, y) => curveAt(cv, (y + 0.5) / S));
  const n1 = perlin(301), n2 = perlin(302), n3 = perlin(303);

  // 楮树皮纤维：一根根细长的弯线（按物理长度撒），画成比纸略暗的细丝
  const fib = new Float32Array(S * S);
  const r = mulberry(305);
  const area = rows.reduce((a, row) => a + 2 * Math.PI * row.r * (L / S), 0);
  const N = Math.round(area * 9000);
  for (let i = 0; i < N; i++) {
    let v = r(), u = r();
    const len = 0.008 + 0.03 * r() ** 2, ang = r() * Math.PI, bend = (r() - 0.5) * 3;
    const steps = Math.ceil(len / 0.0006);
    const k = 0.35 + 0.65 * r();
    for (let j = 0; j < steps; j++) {
      const row = rows[Math.min(S - 1, Math.max(0, Math.floor(v * S)))];
      const a = ang + bend * (j / steps);
      u += (Math.cos(a) * 0.0006) / (2 * Math.PI * Math.max(row.r, 0.02));
      v += (Math.sin(a) * 0.0006) / L;
      if (v < 0 || v >= 1) break;
      const px = ((Math.floor(fract(u) * S) % S) + S) % S, py = Math.floor(v * S);
      fib[py * S + px] = Math.max(fib[py * S + px], k);
    }
  }

  // 纸面受到的光：灯泡在灯笼中间偏上，按 cosθ / d² 算每一行的亮度，归一化
  const bulb = [0, 0.25];
  const lit = rows.map((row) => {
    const dx = bulb[0] - row.r, dy = bulb[1] - row.y, d = Math.hypot(dx, dy);
    const cos = Math.abs(-row.n[0] * dx - row.n[1] * dy) / d; // 内表面法线 = -n
    return cos / (d * d);
  });
  const litMax = Math.max(...lit);
  const paperCol = rgb([244, 238, 223]), warm = rgb([255, 244, 226]);
  for (let y = 0; y < S; y++) {
    const row = rows[y], s = row.s;
    const circ = 2 * Math.PI * Math.max(row.r, 0.02);
    const glow = 0.55 + 0.45 * (lit[y] / litMax);
    for (let x = 0; x < S; x++) {
      const u = (x + 0.5) / S, i = y * S + x;
      // 纸的厚薄：云状（点亮时透出来）
      const cloud = n1(u * 16, s * 30, 16, 4096) * 0.5 + n2(u * 40, s * 75, 40, 4096) * 0.3;
      // 竹骨螺旋：到最近一圈竹骨的距离（米）
      const f = (s - P * u) / P;
      const dr = Math.abs(fract(f + 0.5) - 0.5) * P;
      const rib = 1 - sstep(0.0012, 0.0019, dr);
      const ribShade = (1 - sstep(0.0019, 0.006, dr)) * 0.25; // 竹骨两侧纸贴得紧、略暗
      // 纸片重叠的接缝（双层纸，点亮时更暗）
      const g = u * LANTERN_GORES + 0.12 * n3(u * 7, s * 5, 7, 4096);
      const dg = Math.abs(fract(g + 0.5) - 0.5) * (circ / LANTERN_GORES);
      const seam = 1 - sstep(0.0022, 0.0034, dg);
      // 上下口包边
      const edge = 1 - sstep(0.005, 0.008, Math.min(s, L - s));
      // 白天：干净的纸，竹骨只是浅浅一道
      // 竹骨处略带竹色（点亮后竹骨是暗线，这里如果还是纯白，环境光一照会发青）
      const col = paperCol.map((c, ch) => c * (1 + cloud * 0.03) * (1 - 0.025 * fib[i] - 0.03 * seam - 0.07 * edge - ribShade * 0.1)
        * (1 - rib * [0.1, 0.14, 0.22][ch]));
      // 点亮：透光的纸
      const em = warm.map((c) => c * glow * (1 + cloud * 0.16) * (1 - 0.14 * fib[i] - 0.3 * seam - 0.45 * edge - 0.5 * rib - ribShade * 0.7));
      // 竹骨之间的纸微微鼓起
      const between = fract(f);
      const h = 0.35 * Math.sin(Math.PI * between) + rib * 0.8 + seam * 0.25 + fib[i] * 0.08 + cloud * 0.1;
      const i3 = i * 3;
      out.color[i3] = col[0]; out.color[i3 + 1] = col[1]; out.color[i3 + 2] = col[2];
      out.emit[i3] = em[0]; out.emit[i3 + 1] = em[1]; out.emit[i3 + 2] = em[2];
      out.height[i] = h;
      out.rough[i] = 0.9 - rib * 0.2;
    }
  }
  return out;
}
