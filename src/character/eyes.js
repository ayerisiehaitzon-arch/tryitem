// 眼球：一个球（半径 R）前面鼓出一块角膜。几何是单位尺寸、朝 +z 看的，放到眼眶里时再缩放、旋转。
// UV：以正前方（瞳孔）为中心的方位投影 —— u, v ∈ [0, 1]，(0.5, 0.5) 是瞳孔，离中心的距离和“偏离正前方的角度”成正比，
// 所以虹膜、瞳孔是贴图上的同心圆，换瞳色只需要重画这张小图。

const IRIS = 0.5;      // 虹膜的角半径（弧度）
const CORNEA = 0.07;   // 角膜鼓出的高度（相对半径）

export function eyeballGeometry(seg = 28, rings = 18) {
  const P = [], N = [], T = [], I = [];
  for (let i = 0; i <= rings; i++) {
    const a = (i / rings) * Math.PI; // 偏离正前方的角度
    for (let j = 0; j <= seg; j++) {
      const b = (j / seg) * Math.PI * 2;
      const sa = Math.sin(a), ca = Math.cos(a);
      let r = 1;
      // 角膜：虹膜范围内往前鼓一点（光滑过渡）
      if (a < IRIS * 1.15) {
        const t = a / (IRIS * 1.15);
        r += CORNEA * (1 - t * t) ** 2;
      }
      const d = [sa * Math.cos(b), sa * Math.sin(b), ca];
      P.push(d[0] * r, d[1] * r, d[2] * r);
      // 法线近似：球面法线朝角膜中心偏一点
      N.push(d[0], d[1], d[2]);
      const k = Math.min(a / Math.PI, 1) * 0.5;
      T.push(0.5 + k * Math.cos(b), 0.5 + k * Math.sin(b));
    }
  }
  for (let i = 0; i < rings; i++) for (let j = 0; j < seg; j++) {
    const a = i * (seg + 1) + j, b = a + seg + 1;
    I.push(a, b, a + 1, a + 1, b, b + 1);
  }
  // 法线重新按面平均（角膜鼓包的边上更准）
  const n = P.length / 3;
  const NN = new Float32Array(n * 3);
  for (let t = 0; t < I.length; t += 3) {
    const [a, b, c] = [I[t], I[t + 1], I[t + 2]];
    const ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2];
    const vx = P[c * 3] - P[a * 3], vy = P[c * 3 + 1] - P[a * 3 + 1], vz = P[c * 3 + 2] - P[a * 3 + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const v of [a, b, c]) { NN[v * 3] += nx; NN[v * 3 + 1] += ny; NN[v * 3 + 2] += nz; }
  }
  for (let i = 0; i < n; i++) {
    const l = Math.hypot(NN[i * 3], NN[i * 3 + 1], NN[i * 3 + 2]);
    if (l > 1e-12) { NN[i * 3] /= l; NN[i * 3 + 1] /= l; NN[i * 3 + 2] /= l; }
    else { NN[i * 3] = N[i * 3]; NN[i * 3 + 1] = N[i * 3 + 1]; NN[i * 3 + 2] = N[i * 3 + 2]; }
  }
  return { position: new Float32Array(P), normal: NN, uv: new Float32Array(T), index: new Uint16Array(I) };
}

const hex = (c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
const mix = (a, b, t) => a.map((x, i) => x + (b[i] - x) * t);
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

function hash(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

// 眼睛贴图（RGBA，size²）：眼白带一点血丝和暗角，虹膜有放射状的纹理、外圈深色的角膜缘、瞳孔周围一圈亮一点
export function eyeTexture(irisHex = '#5a3d27', size = 256, { pupil = 0.36 } = {}) {
  const data = new Uint8ClampedArray(size * size * 4);
  const iris = hex(irisHex);
  const dark = iris.map((c) => c * 0.45);
  const light = mix(iris, [235, 220, 190], 0.25);
  const white = [236, 232, 226], pink = [214, 178, 170];
  const rIris = (IRIS / Math.PI) * 0.5; // 贴图上虹膜的半径
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = (x + 0.5) / size - 0.5, v = (y + 0.5) / size - 0.5;
    const r = Math.hypot(u, v), a = Math.atan2(v, u);
    let col;
    if (r > rIris * 1.04) {
      // 眼白：越往后越粉、越暗
      const t = sstep(rIris * 1.1, 0.5, r);
      col = mix(white, pink, t * 0.55);
      const vein = Math.max(0, vnoise(a * 9, r * 40) - 0.72) * 2.4 * sstep(0.12, 0.35, r);
      col = mix(col, [190, 90, 90], vein * 0.6);
      // 角膜缘外面一圈淡淡的阴影
      col = mix(col, [190, 182, 176], (1 - sstep(rIris * 1.04, rIris * 1.35, r)) * 0.35);
    } else {
      const t = r / rIris;
      // 放射纹
      const fib = vnoise(a * 26 / Math.PI, t * 5) * 0.6 + vnoise(a * 60 / Math.PI, t * 11) * 0.4;
      col = mix(iris, light, sstep(0.45, 0.62, t) * (1 - sstep(0.7, 0.95, t)) * 0.65);
      col = mix(col, dark, (fib - 0.5) * 0.9 + 0.2);
      col = mix(col, mix(iris, [255, 230, 170], 0.35), (1 - sstep(pupil, pupil + 0.18, t)) * 0.45); // 瞳孔周围的亮环
      col = mix(col, dark.map((c) => c * 0.5), sstep(0.82, 1.0, t)); // 角膜缘
      col = mix(col, [8, 8, 10], 1 - sstep(pupil - 0.02, pupil + 0.02, t)); // 瞳孔
    }
    const o = (y * size + x) * 4;
    data[o] = col[0]; data[o + 1] = col[1]; data[o + 2] = col[2]; data[o + 3] = 255;
  }
  return { data, width: size, height: size };
}

// 眼球在世界坐标里的位置、半径、朝向（看向 gaze：[水平, 竖直]，弧度）
export function eyePlacement(F, L, O, g, side, gaze = [0, 0]) {
  const E = F.eye;
  const c = [O[0] + side * E.x * g, O[1] + E.y * g, O[2] + E.z * g];
  const yaw = side * 0.035 + gaze[0], pitch = -gaze[1];
  return { center: c, radius: E.R * g, yaw, pitch };
}
