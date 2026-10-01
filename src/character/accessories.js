// 配饰：眼镜（圆框 / 方框 / 墨镜）。在头部局部坐标里按眼睛的位置、头的宽度生成，跟着头这根骨头走。
// 镜框是沿镜片轮廓扫出来的一根细管，鼻梁一道弧，两条镜腿沿头侧伸到耳朵上方；镜片是一片微微外凸的薄片。

export const GLASSES = {
  none: { label: '无' },
  round: { label: '圆框', shape: 'round', rx: 0.0205, ry: 0.0195, tube: 0.0013, lens: 'clear' },
  square: { label: '方框', shape: 'square', rx: 0.025, ry: 0.0175, tube: 0.0019, lens: 'clear' },
  shades: { label: '墨镜', shape: 'square', rx: 0.0265, ry: 0.0205, tube: 0.0022, lens: 'dark' },
};

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

// 镜片轮廓（局部 x 向外、y 向上）：圆，或者四角圆过的方
function outline(g, n = 28) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const c = Math.cos(a), s = Math.sin(a);
    if (g.shape === 'round') pts.push([c * g.rx, s * g.ry]);
    else {
      const e = 5; // 超椭圆：越大越方
      pts.push([Math.sign(c) * Math.abs(c) ** (2 / e) * g.rx, Math.sign(s) * Math.abs(s) ** (2 / e) * g.ry * (s < 0 ? 0.92 : 1)]);
    }
  }
  return pts;
}

// 沿一条折线扫一根圆管（6 边形截面），闭合或不闭合
function tube(path, r, closed, out) {
  const n = path.length, base = out.P.length, K = 6;
  for (let i = 0; i < n; i++) {
    const a = path[closed ? (i - 1 + n) % n : Math.max(0, i - 1)], b = path[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
    const T = norm(sub(b, a));
    const N = norm(cross(T, Math.abs(T[1]) < 0.95 ? [0, 1, 0] : [1, 0, 0]));
    const B = cross(T, N);
    for (let k = 0; k < K; k++) {
      const t = (k / K) * Math.PI * 2;
      out.P.push(add(path[i], add(mul(N, Math.cos(t) * r), mul(B, Math.sin(t) * r))));
    }
  }
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) for (let k = 0; k < K; k++) {
    const i2 = (i + 1) % n;
    out.Q.push(base + i * K + k, base + i * K + ((k + 1) % K), base + i2 * K + ((k + 1) % K), base + i2 * K + k);
  }
}

// F：五官参数；sdf：头部 SDF（找头侧的宽度，镜腿贴着走）
export function glassesMesh(F, sdf, id) {
  const g = GLASSES[id];
  if (!g || !g.shape) return null;
  const E = F.eye;
  const z = E.z + E.R + 0.0105 + 0.002 * (E.R / 0.0121 - 1);
  const frame = { P: [], Q: [] }, lens = { P: [], Q: [] };
  const cy = E.y + 0.0015;
  for (const side of [1, -1]) {
    const cx = side * (E.x + 0.0012);
    const ol = outline(g).map(([u, v]) => {
      // 镜片略微包向脸的两侧：越往外越往后
      const x = cx + side * u;
      const back = 0.004 * Math.max(0, u / g.rx) ** 2;
      return [x, cy + v, z - back];
    });
    tube(ol, g.tube, true, frame);
    // 镜片：从中心到轮廓几圈，往前鼓一点
    const rings = 4, base = lens.P.length, n = ol.length;
    for (let r = 0; r <= rings; r++) {
      const t = r / rings;
      for (let i = 0; i < n; i++) {
        const p = ol[i];
        lens.P.push([cx + (p[0] - cx) * Math.max(t, 0.02), cy + (p[1] - cy) * Math.max(t, 0.02), p[2] + 0.0018 * (1 - t * t)]);
      }
    }
    for (let r = 0; r < rings; r++) for (let i = 0; i < n; i++) {
      const a = base + r * n + i, b = base + r * n + ((i + 1) % n);
      lens.Q.push(a, b, b + n, a + n);
    }
    // 镜腿：从镜框外侧上沿往后，贴着头侧（找头在这个高度的宽度）到耳朵上方，再往下弯一点
    const hinge = [cx + side * (g.rx + 0.0005), cy + g.ry * 0.55, z - 0.006];
    let half = 0.07;
    for (let x = 0.12; x > 0; x -= 0.0015) { if (sdf(side * x, cy + 0.006, -0.005) < 0) { half = x; break; } }
    const arm = [];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      const zz = hinge[2] + (-0.035 - hinge[2]) * t;
      const xx = side * (Math.abs(hinge[0]) + (half + 0.0035 - Math.abs(hinge[0])) * Math.min(1, t * 1.6));
      const yy = hinge[1] + (cy + 0.006 - hinge[1]) * t - (t > 0.85 ? (t - 0.85) * 0.05 : 0);
      arm.push([xx, yy, zz]);
    }
    tube(arm, g.tube * 0.9, false, frame);
  }
  // 鼻梁：两片镜框内侧上沿之间一道略向上拱的弧
  const bridge = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    const x = -E.x - 0.0012 + g.rx + (2 * (E.x + 0.0012) - 2 * g.rx) * t;
    bridge.push([x, cy + g.ry * 0.35 + 0.003 * Math.sin(Math.PI * t), z + 0.001]);
  }
  tube(bridge, g.tube, false, frame);
  return { frame, lens, dark: g.lens === 'dark' };
}
