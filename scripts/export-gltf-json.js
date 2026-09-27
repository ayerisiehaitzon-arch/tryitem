// 把 models/*.glb 转成等价的 JSON glTF：JSON 部分原样保留，二进制块以 base64 data URI 内嵌。
//   node scripts/export-gltf-json.js <输出目录> [扩展名，默认 .gltf]
// 用于只接受文本 / JSON 的托管环境。结果是合法的 glTF 2.0，three.js、Blender 等可直接读取；
// 预览器也会把它还原成 .glb 再解析（不需要对 data: 地址发请求）。
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [outDir, ext = '.gltf'] = process.argv.slice(2);
if (!outDir) throw new Error('用法: node scripts/export-gltf-json.js <输出目录> [扩展名]');
await fs.mkdir(outDir, { recursive: true });
const manifest = JSON.parse(await fs.readFile(path.join(root, 'models', 'manifest.json'), 'utf8'));
for (const { id } of manifest.items) {
  const glb = await fs.readFile(path.join(root, 'models', `${id}.glb`));
  if (glb.readUInt32LE(0) !== 0x46546c67) throw new Error(`${id}.glb 不是 GLB`);
  let off = 12, json = null, bin = null;
  while (off < glb.length) {
    const len = glb.readUInt32LE(off), type = glb.readUInt32LE(off + 4);
    const chunk = glb.subarray(off + 8, off + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(chunk.toString('utf8'));
    else if (type === 0x004e4942) bin = chunk;
    off += 8 + len;
  }
  json.buffers[0].uri = `data:application/octet-stream;base64,${bin.toString('base64')}`;
  const file = path.join(outDir, `${id}${ext}`);
  await fs.writeFile(file, JSON.stringify(json));
  console.log(file, `${((await fs.stat(file)).size / 1024).toFixed(0)} KB`);
}
