// AO 图集排布：所有图块等纹素密度（texel density），天际线（skyline）装箱，可旋转 90°。
// 二分搜索能装下的最大密度；自动在 128/256/512/1024 中选最小够用的图集尺寸。

export function packCharts(charts, { pad = 3, minPx = 2, targetDensity = 120, sizes = [128, 256, 512, 1024] } = {}) {
  let best = null;
  for (const size of sizes) {
    // 图块很多的时候（书架墙上百本书），小图集连最低密度都装不下：换下一档
    let res = null;
    try { res = packAtSize(charts, size, pad, minPx); } catch (e) { if (size === sizes[sizes.length - 1]) throw e; continue; }
    best = res;
    if (res && res.density >= targetDensity) break;
  }
  return best;
}

function packAtSize(charts, size, pad, minPx) {
  let lo = 1, hi = 8192, ok = null;
  for (let it = 0; it < 26; it++) {
    const mid = Math.sqrt(lo * hi);
    const r = tryPack(charts, size, pad, minPx, mid);
    if (r) { ok = r; lo = mid; } else hi = mid;
    if (hi / lo < 1.01) break;
  }
  if (!ok) throw new Error('图块太多，无法装箱');
  return ok;
}

function tryPack(charts, size, pad, minPx, D) {
  const items = charts.map((c) => {
    const cw = Math.max(minPx, Math.ceil(c.w * D * c.density));
    const ch = Math.max(minPx, Math.ceil(c.h * D * c.density));
    return { id: c.id, cw, ch, w: cw + 2 * pad, h: ch + 2 * pad };
  });
  items.sort((a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h) || b.w * b.h - a.w * a.h);
  let sky = [{ x: 0, y: 0, w: size }];
  const rects = {};
  for (const it of items) {
    let bestPos = null;
    for (const rot of [false, true]) {
      const w = rot ? it.h : it.w, h = rot ? it.w : it.h;
      if (w > size || h > size) continue;
      for (let i = 0; i < sky.length; i++) {
        const x = sky[i].x;
        if (x + w > size) break;
        // 这段天际线开始，宽 w 的范围内的最高点
        let y = 0, span = 0, j = i;
        while (span < w && j < sky.length) {
          y = Math.max(y, sky[j].y);
          span += sky[j].w;
          j++;
        }
        if (span < w || y + h > size) continue;
        const score = y * size + x;
        if (!bestPos || y + h < bestPos.y + bestPos.h || (y + h === bestPos.y + bestPos.h && score < bestPos.score)) {
          bestPos = { x, y, w, h, rot, score };
        }
      }
    }
    if (!bestPos) return null;
    rects[it.id] = {
      x: bestPos.x, y: bestPos.y, w: bestPos.w, h: bestPos.h, rot: bestPos.rot,
      // 内容区（去掉 padding）
      cx: bestPos.x + pad, cy: bestPos.y + pad,
      cw: bestPos.rot ? it.ch : it.cw, ch: bestPos.rot ? it.cw : it.ch,
    };
    // 更新天际线
    const nx = bestPos.x, nw = bestPos.w, ny = bestPos.y + bestPos.h;
    const next = [];
    for (const s of sky) {
      const s0 = s.x, s1 = s.x + s.w;
      if (s1 <= nx || s0 >= nx + nw) { next.push(s); continue; }
      if (s0 < nx) next.push({ x: s0, y: s.y, w: nx - s0 });
      if (s1 > nx + nw) next.push({ x: nx + nw, y: s.y, w: s1 - (nx + nw) });
    }
    next.push({ x: nx, y: ny, w: nw });
    next.sort((a, b) => a.x - b.x);
    // 合并相邻同高段
    sky = [];
    for (const s of next) {
      const last = sky[sky.length - 1];
      if (last && last.y === s.y && last.x + last.w === s.x) last.w += s.w;
      else sky.push({ ...s });
    }
  }
  return { size, pad, density: D, rects };
}

// 图块内归一化坐标 → 图集 UV（像素坐标 / size）
export function atlasUV(rect, u, v, size) {
  const uu = Math.min(1, Math.max(0, u)), vv = Math.min(1, Math.max(0, v));
  const [a, b] = rect.rot ? [vv, uu] : [uu, vv];
  return [(rect.cx + a * rect.cw) / size, (rect.cy + b * rect.ch) / size];
}
