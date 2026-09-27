import { Document, NodeIO } from '@gltf-transform/core';
import { KHRMaterialsSheen, KHRMaterialsClearcoat, KHRMaterialsUnlit, KHRMaterialsEmissiveStrength, KHRTextureTransform } from '@gltf-transform/extensions';

// 用 glTF-Transform 组装 .glb：
//   <item>            根节点（extras 里带预算信息）
//   ├─ <item>_LOD0    每个 LOD 一个网格，每种材质一个图元（= 一次 draw call）
//   ├─ <item>_LOD1
//   ├─ <item>_LOD2
//   └─ <item>_Shadow  2 个三角形的烘焙接触阴影贴花（unlit + alpha blend）
//
// 材质贴图（木纹、布纹……）按“物理尺寸”平铺在 TEXCOORD_0；
// 每件家具独有的 AO 在 TEXCOORD_1。同一件家具的所有材质共享这一张 AO 图。

export function createDoc() {
  const doc = new Document();
  doc.createBuffer();
  // 扩展按需创建：只有真正用到的扩展才写进 extensionsUsed
  const ext = {};
  const kinds = {
    sheen: KHRMaterialsSheen, clearcoat: KHRMaterialsClearcoat, unlit: KHRMaterialsUnlit,
    emissive: KHRMaterialsEmissiveStrength, transform: KHRTextureTransform,
  };
  for (const [key, Cls] of Object.entries(kinds)) {
    let e = null;
    Object.defineProperty(ext, key, { get: () => (e ??= doc.createExtension(Cls)) });
  }
  return { doc, ext, textures: new Map() };
}

function texture(ctx, key, img) {
  if (ctx.textures.has(key)) return ctx.textures.get(key);
  const t = ctx.doc.createTexture(key).setImage(img.data).setMimeType(img.mime).setURI(`${key}.${img.mime === 'image/png' ? 'png' : 'jpg'}`);
  ctx.textures.set(key, t);
  return t;
}

// def: 材质库条目；tex: { color, normal, orm }（可选）；ao: AO 图（可选）
export function createMaterial(ctx, name, def, tex, ao) {
  const { doc, ext } = ctx;
  const m = doc.createMaterial(name)
    .setBaseColorFactor(def.color ?? [1, 1, 1, 1])
    .setMetallicFactor(def.metallic ?? 0)
    .setRoughnessFactor(def.roughness ?? 0.5)
    .setDoubleSided(!!def.doubleSided);
  if (def.alphaMode === 'MASK') m.setAlphaMode('MASK').setAlphaCutoff(def.alphaCutoff ?? 0.5);
  if (tex?.color) m.setBaseColorTexture(texture(ctx, `${def.key}_color`, tex.color));
  if (tex?.normal) {
    m.setNormalTexture(texture(ctx, `${def.key}_normal`, tex.normal));
    m.setNormalScale(def.normalScale ?? 1);
    // 细节法线：一小块可平铺的法线图按 normalRepeat 重复（颜色图仍然整幅铺满）
    if (def.normalRepeat) {
      m.getNormalTextureInfo().setExtension('KHR_texture_transform', ext.transform.createTransform().setScale(def.normalRepeat));
    }
  }
  if (tex?.rough) m.setMetallicRoughnessTexture(texture(ctx, `${def.key}_rough`, tex.rough));
  if (ao) {
    m.setOcclusionTexture(texture(ctx, ao.key, ao.img));
    m.getOcclusionTextureInfo().setTexCoord(1);
    m.setOcclusionStrength(def.aoStrength ?? 1);
  }
  if (def.emissive) {
    m.setEmissiveFactor(def.emissive);
    if (tex?.color && def.emissiveTex) m.setEmissiveTexture(texture(ctx, `${def.key}_color`, tex.color));
    if (def.emissiveStrength && def.emissiveStrength !== 1) {
      m.setExtension('KHR_materials_emissive_strength', ext.emissive.createEmissiveStrength().setEmissiveStrength(def.emissiveStrength));
    }
  }
  if (def.sheen) {
    const s = ext.sheen.createSheen()
      .setSheenColorFactor(def.sheen.color)
      .setSheenRoughnessFactor(def.sheen.roughness ?? 0.5);
    m.setExtension('KHR_materials_sheen', s);
  }
  if (def.clearcoat) {
    const c = ext.clearcoat.createClearcoat()
      .setClearcoatFactor(def.clearcoat.factor ?? 1)
      .setClearcoatRoughnessFactor(def.clearcoat.roughness ?? 0.1);
    m.setExtension('KHR_materials_clearcoat', c);
  }
  return m;
}

export function addMesh(ctx, name, lod, materials) {
  const { doc } = ctx;
  const buf = doc.getRoot().listBuffers()[0];
  const mesh = doc.createMesh(name);
  for (const pr of lod.prims) {
    const acc = (arr, type) => doc.createAccessor().setArray(arr).setType(type).setBuffer(buf);
    const prim = doc.createPrimitive()
      .setAttribute('POSITION', acc(pr.position, 'VEC3'))
      .setAttribute('NORMAL', acc(pr.normal, 'VEC3'))
      .setAttribute('TEXCOORD_0', acc(pr.uv0, 'VEC2'))
      .setAttribute('TEXCOORD_1', acc(pr.uv1, 'VEC2'))
      .setIndices(acc(pr.index, 'SCALAR'))
      .setMaterial(materials.get(pr.mat));
    mesh.addPrimitive(prim);
  }
  return mesh;
}

// 接触阴影贴花：一个贴地四边形
export function addShadowDecal(ctx, name, shadow) {
  const { doc, ext } = ctx;
  const buf = doc.getRoot().listBuffers()[0];
  const { x0, z0, x1, z1, y = 0.0015 } = shadow.rect;
  const pos = new Float32Array([x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z1]);
  const nrm = new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]);
  const uv = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]);
  const idx = new Uint16Array([0, 2, 1, 0, 3, 2]);
  const acc = (arr, type) => doc.createAccessor().setArray(arr).setType(type).setBuffer(buf);
  const mat = doc.createMaterial(`${name}_mat`)
    .setBaseColorFactor([0, 0, 0, 1])
    .setBaseColorTexture(texture(ctx, `${name}_tex`, shadow.img))
    .setAlphaMode('BLEND')
    .setMetallicFactor(0)
    .setRoughnessFactor(1);
  mat.getBaseColorTextureInfo().setWrapS(33071).setWrapT(33071); // CLAMP_TO_EDGE
  mat.setExtension('KHR_materials_unlit', ext.unlit.createUnlit());
  const prim = doc.createPrimitive()
    .setAttribute('POSITION', acc(pos, 'VEC3'))
    .setAttribute('NORMAL', acc(nrm, 'VEC3'))
    .setAttribute('TEXCOORD_0', acc(uv, 'VEC2'))
    .setIndices(acc(idx, 'SCALAR'))
    .setMaterial(mat);
  return doc.createMesh(name).addPrimitive(prim);
}

export async function writeGLB(doc, path) {
  const io = new NodeIO().registerExtensions([KHRMaterialsSheen, KHRMaterialsClearcoat, KHRMaterialsUnlit, KHRMaterialsEmissiveStrength, KHRTextureTransform]);
  await io.write(path, doc);
}
