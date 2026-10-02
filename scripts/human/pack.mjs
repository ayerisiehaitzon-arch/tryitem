// 给文件数有上限的静态托管打包 viewer/human/（比如 claude.ai 的 Artifact：一个版本最多 511 个文件，二进制文件也不认）：
//   node scripts/human/pack.mjs <输出目录>
// 输出 <输出目录>/human/：
//   human.json、anims.json 原样；human.bin、anims.bin 换成 base64 文本（.bin.txt）；
//   每个代理（一款头发、一件衣服……）的网格（px/*.bin）和只有它用的贴图拼成一个包 packs/<类别>-<名字>.txt（base64）；
//   几个代理共用的贴图（拆开的上衣、下装和原来那一整套共用一张）单独一个包 packs/<第一个用到它的代理>-tex.txt，
//   穿上衣时不用把整套的网格也下载下来；
//   packs.json：每个文件在哪个包、从第几个字节开始、多长；皮肤、虹膜、脸上的遮罩这些不属于代理的贴图原样放在 tex/。
// 网页加上 ?bin=.txt&packs=packs.json 读这种布局（没有清单时照常一个文件一个文件地读）。原来 560 多个文件，打包后两百个左右。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('../../viewer/human', import.meta.url));
if (!process.argv[2]) { console.error('用法：node scripts/human/pack.mjs <输出目录>'); process.exit(1); }
const OUT = path.join(process.argv[2], 'human');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'packs'), { recursive: true });
fs.mkdirSync(path.join(OUT, 'tex'), { recursive: true });

const meta = JSON.parse(fs.readFileSync(path.join(SRC, 'human.json'), 'utf8'));
for (const f of ['human.json', 'anims.json']) fs.copyFileSync(path.join(SRC, f), path.join(OUT, f));
for (const f of ['human.bin', 'anims.bin']) fs.writeFileSync(path.join(OUT, `${f}.txt`), fs.readFileSync(path.join(SRC, f)).toString('base64'));

// 每张贴图被哪些代理用到
const users = new Map();
for (const p of meta.proxies) for (const m of new Set(Object.values(p.maps))) {
  if (!users.has(m)) users.set(m, []);
  users.get(m).push(p);
}
const packs = new Map(); // 包名 → 文件列表
const put = (name, file) => { if (!packs.has(name)) packs.set(name, []); packs.get(name).push(file); };
for (const p of meta.proxies) {
  put(`packs/${p.cat}-${p.name}.txt`, p.file);
  for (const m of new Set(Object.values(p.maps))) {
    const u = users.get(m);
    if (u.length === 1) put(`packs/${p.cat}-${p.name}.txt`, m);
    else if (u[0] === p) put(`packs/${p.cat}-${p.name}-tex.txt`, m);
  }
}
const files = {};
let bytes = 0;
for (const [name, list] of packs) {
  const bufs = list.map((f) => fs.readFileSync(path.join(SRC, f)));
  let off = 0;
  list.forEach((f, i) => { files[f] = [name, off, bufs[i].length]; off += bufs[i].length; });
  const text = Buffer.concat(bufs).toString('base64');
  fs.writeFileSync(path.join(OUT, name), text);
  bytes += text.length;
}
// 剩下的贴图（皮肤、虹膜、遮罩）原样拷过去
const loose = fs.readdirSync(path.join(SRC, 'tex')).map((f) => `tex/${f}`).filter((f) => !files[f]);
for (const f of loose) fs.copyFileSync(path.join(SRC, f), path.join(OUT, f));
fs.writeFileSync(path.join(OUT, 'packs.json'), JSON.stringify({ files }));
const total = fs.readdirSync(OUT, { recursive: true }).filter((f) => fs.statSync(path.join(OUT, f)).isFile()).length;
console.log(`${packs.size} 个包（${(bytes / 1e6).toFixed(1)}MB）+ ${loose.length} 张单独的贴图；一共 ${total} 个文件 → ${OUT}`);
