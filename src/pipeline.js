import { ItemBuilder } from './core/item.js';
import { packCharts } from './core/pack.js';
import { finalizeItem } from './core/finalize.js';
import { MATERIALS, tileOf, noOffsetOf } from './materials/library.js';
import { createDoc, createMaterial, addMesh, addDecal } from './export/gltf.js';
import { srgb } from './materials/library.js';

export const LODS = [0, 1, 2];

// 构建一件家具的全部 LOD（纯几何，不含烘焙）
export function buildGeometry(def) {
  const k0 = new ItemBuilder({ lod: 0, name: def.id });
  def.build(k0);
  const layout = packCharts(k0.charts, { targetDensity: def.aoDensity ?? 90 });
  const lods = LODS.map((lod) => {
    const k = new ItemBuilder({ lod, layout, name: def.id });
    def.build(k);
    return finalizeItem(k, { layout, tileOf, noOffset: noOffsetOf });
  });
  return { layout, lods };
}

// 组装 glTF 文档
export function assembleDoc(def, { lods, layout }, { textures = null, ao = null, shadow = null, glow = null } = {}) {
  const ctx = createDoc();
  const { doc } = ctx;
  const scene = doc.createScene('Scene');
  const root = doc.createNode(def.id);
  scene.addChild(root);

  const matNames = [...new Set(lods.flatMap((l) => l.prims.map((p) => p.mat)))];
  const materials = new Map();
  for (const m of matNames) {
    const md = MATERIALS[m];
    if (!md) throw new Error(`未知材质 ${m}`);
    const tex = md.tex && textures ? textures[md.tex] : null;
    materials.set(m, createMaterial(ctx, `${def.id}_${m}`, { ...md, key: md.tex ?? m }, tex, ao ? { key: `${def.id}_ao`, img: ao } : null));
  }
  lods.forEach((lod, i) => {
    const node = doc.createNode(`${def.id}_LOD${i}`).setMesh(addMesh(ctx, `${def.id}_LOD${i}`, lod, materials));
    root.addChild(node);
  });
  if (shadow) {
    root.addChild(doc.createNode(`${def.id}_Shadow`).setMesh(addDecal(ctx, `${def.id}_Shadow`, shadow)));
  }
  if (glow) {
    const color = def.glow?.color ?? srgb(255, 214, 162);
    root.addChild(doc.createNode(`${def.id}_Glow`).setMesh(addDecal(ctx, `${def.id}_Glow`, glow, { color, lift: 0.002 })));
  }
  const b = lods[0].bounds;
  const stats = {
    id: def.id,
    name: def.name,
    nameEn: def.nameEn,
    category: def.category ?? 'furniture',
    mount: def.mount ?? 'floor',
    size: [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]].map((v) => Math.round(v * 1000)),
    lods: lods.map((l) => ({ tris: l.tris, verts: l.verts, drawCalls: l.prims.length })),
    materials: matNames.map((m) => MATERIALS[m].label),
    aoAtlas: def.ao === false ? 0 : layout.size,
    aoDensity: def.ao === false ? 0 : Math.round(layout.density),
    lodDistances: def.lodDistances ?? null,
    // 预览器的默认取景（地板这种扁平的构件要从上往下看）
    ...(def.view ? { view: def.view } : {}),
  };
  root.setExtras({ stats });
  return { doc, stats };
}
