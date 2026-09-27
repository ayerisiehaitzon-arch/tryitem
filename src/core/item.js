import { Part } from './part.js';
import { hashStr, rng } from './vec.js';
import { extrude } from '../prims/extrude.js';
import { lathe } from '../prims/lathe.js';
import { sweep } from '../prims/sweep.js';
import { box } from '../prims/box.js';

// ItemBuilder：一件家具在某个 LOD 下的构建上下文。
//
// 同一个 build(k) 函数会被调用多次（LOD0 / LOD1 / LOD2），
// 通过 k.q(a, b, c) 取不同 LOD 的参数。所有 LOD 共用 LOD0 的 AO 图集：
// 每个图块（chart）有稳定的 id，低 LOD 用同样的 id 找到同一块区域。
export class ItemBuilder {
  constructor({ lod = 0, layout = null, name = 'item' } = {}) {
    this.lod = lod;
    this.layout = layout;
    this.name = name;
    this.parts = [];
    this.charts = [];
    this.chartIndex = new Map();
  }

  // 按 LOD 取值：q(LOD0值, LOD1值, LOD2值)，缺省沿用前一个
  q(...vals) {
    return vals[Math.min(this.lod, vals.length - 1)];
  }

  part(mat, name) {
    if (!mat) throw new Error(`part ${name} 缺少材质`);
    const p = new Part(mat, name);
    this.parts.push(p);
    return p;
  }

  // 注册 / 查找图块。w,h 为米制尺寸（仅 LOD0 用于排布），density 为相对纹素密度。
  chart(id, w, h, { density = 1 } = {}) {
    if (this.chartIndex.has(id)) return this.chartIndex.get(id);
    if (this.layout && !this.layout.rects[id]) {
      throw new Error(`[${this.name}] LOD${this.lod} 使用了 LOD0 中不存在的图块: ${id}`);
    }
    const idx = this.charts.length;
    this.charts.push({ id, w: Math.max(w, 1e-4), h: Math.max(h, 1e-4), density });
    this.chartIndex.set(id, idx);
    return idx;
  }

  // 长条图块切成几段（LOD 间保持一致：低 LOD 直接沿用 LOD0 的段数）
  pieces(prefix, length, maxLen = 0.9) {
    if (this.layout) {
      let n = 0;
      while (this.layout.rects[`${prefix}.${n}`]) n++;
      if (n === 0) throw new Error(`[${this.name}] 找不到图块组 ${prefix}`);
      return n;
    }
    return Math.max(1, Math.ceil(length / maxLen - 0.05));
  }

  // 部件的确定性随机数（与 LOD 无关）
  rand(name) {
    return rng(hashStr(this.name + '/' + name));
  }

  extrude(o) { return extrude(this, o); }
  lathe(o) { return lathe(this, o); }
  sweep(o) { return sweep(this, o); }
  box(o) { return box(this, o); }
}
