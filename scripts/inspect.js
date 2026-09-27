// 检查一个 .glb：列出节点/网格/材质/贴图，并可把贴图导出到目录
//   node scripts/inspect.js models/dining_table.glb [导出目录]
import fs from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

const [file, outDir] = process.argv.slice(2);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(file);
const root = doc.getRoot();
for (const node of root.listNodes()) {
  const mesh = node.getMesh();
  if (!mesh) { console.log(`节点 ${node.getName()}`); continue; }
  let tris = 0, verts = 0;
  for (const p of mesh.listPrimitives()) {
    tris += (p.getIndices()?.getCount() ?? 0) / 3;
    verts += p.getAttribute('POSITION').getCount();
  }
  console.log(`节点 ${node.getName().padEnd(24)} ${mesh.listPrimitives().length} 图元  ${tris} 三角形  ${verts} 顶点`);
}
for (const m of root.listMaterials()) console.log(`材质 ${m.getName()}  ext: ${m.listExtensions().map((e) => e.extensionName).join(',')}`);
for (const t of root.listTextures()) {
  console.log(`贴图 ${t.getName().padEnd(22)} ${t.getSize()?.join('×')}  ${(t.getImage().length / 1024).toFixed(1)} KB`);
  if (outDir) {
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(`${outDir}/${t.getName()}.${t.getMimeType() === 'image/png' ? 'png' : 'jpg'}`, t.getImage());
  }
}
