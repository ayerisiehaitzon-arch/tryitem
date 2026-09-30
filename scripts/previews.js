// 生成 README 用的预览图：node scripts/previews.js
//   docs/previews/overview.jpg        全部家具一览
//   docs/previews/furniture-detail.jpg 家具特写：衣柜门板对花、黄铜脚套、书桌信件抽屉、办公椅盾形靠背
//   docs/previews/furniture-new.jpg   新家具：藤编餐边柜、绗缝丝绒床尾凳、C 型边几
//   docs/previews/decor.jpg           全部摆件一览
//   docs/previews/decor-detail.jpg    摆件特写：书脊、釉面、叶片、流苏
//   docs/previews/lighting.jpg        全部灯具一览
//   docs/previews/lighting-detail.jpg 灯具特写：台灯开灯 / 关灯、纸灯笼、壁灯
//   docs/previews/architecture.jpg    墙地门窗一览
//   docs/previews/architecture-detail.jpg 墙地门窗特写：人字拼、门执手与合页、护墙板线条、钢窗与窗台
//   docs/previews/kitchen.jpg         厨房三件：橱柜、吊柜、岛台
//   docs/previews/kitchen-detail.jpg  厨房特写：陶瓷水槽与鹅颈龙头、手工釉面砖和灯带光斑、钟形烟机罩、岛台凸条板
//   docs/previews/kitchen-room.jpg    全屋陈列里的厨房
//   docs/previews/bathroom.jpg        浴室三件：浴室柜、马桶、淋浴间
//   docs/previews/bathroom-detail.jpg 浴室特写：台上盆与入墙龙头、马桶盖、淋浴间的釉面砖和混水阀、六角马赛克
//   docs/previews/bathroom-room.jpg   全屋陈列里的浴室
//   docs/previews/balcony.jpg         阳台三件：户外椅、鼓凳边桌、橄榄树
//   docs/previews/balcony-detail.jpg  阳台特写：编绳靠背、青瓷开片与钱纹、橄榄叶、钢栏杆与柚木扶手
//   docs/previews/balcony-room.jpg    全屋陈列里的阳台
//   docs/previews/study.jpg           书房三件：书架墙、阅读椅、阅读落地灯
//   docs/previews/study-detail.jpg    书房特写：一格一格的书、书梯挂钩与梯轨、竖条绗缝椅背与嵌条、灯罩里的白搪瓷
//   docs/previews/study-room.jpg      全屋陈列里的书房
//   docs/previews/entry.jpg           玄关三件：鞋柜、穿衣镜、衣帽架
//   docs/previews/entry-detail.jpg    玄关特写：翻斗门的半圆拉手与洞石台面、拱形镜框、帽子托特包和围巾、棋盘格大理石
//   docs/previews/entry-room.jpg      全屋陈列里的玄关
//   docs/previews/kids.jpg            儿童房三件：儿童床、玩具柜、小书桌
//   docs/previews/kids-detail.jpg     儿童房特写：山墙上的小旗子、弯曲胶合板的边、画纸上的蜡笔画、圈绒兔子
//   docs/previews/kids-room.jpg       全屋陈列里的儿童房
//   docs/previews/laundry.jpg         洗衣房三件：洗衣机、烘干机、晾衣架
//   docs/previews/laundry-detail.jpg  洗衣房特写：洗衣机的门和内筒、烘干机的控制面板、晾衣架上的毛巾和袜子、水泥花砖
//   docs/previews/laundry-room.jpg    全屋陈列里的洗衣房
//   docs/previews/closet.jpg          衣帽间三件：开放衣柜、梳妆台、首饰岛台
//   docs/previews/closet-detail.jpg   衣帽间特写：衬衫的领子和袖口、长衣区的大衣和吊带裙、香水和化妆镜灯泡、丝绒格子里的首饰
//   docs/previews/closet-room.jpg     全屋陈列里的衣帽间
//   docs/previews/gym.jpg             健身房三件：跑步机、哑铃架、瑜伽垫
//   docs/previews/gym-detail.jpg      健身房特写：跑步机的屏幕和控制台、哑铃端面的重量和滚花握把、瑜伽垫卷起来的一头、橡胶地垫
//   docs/previews/gym-room.jpg        全屋陈列里的健身房
//   docs/previews/music.jpg           书房二三件：三角钢琴、乐谱架、琴凳
//   docs/previews/music-detail.jpg    书房二特写：键盘和金字铭牌、琴肚子里的铁板和琴弦、琴凳的菱形拉扣、竖琴谱板和小提琴分谱
//   docs/previews/music-room.jpg      全屋陈列里的书房二
//   docs/previews/tea.jpg             茶室三件：原木茶桌、蒲团、博古架
//   docs/previews/tea-detail.jpg      茶室特写：茶盘上的紫砂壶和开片杯、大板树根那头的蝴蝶榫和裂缝、蒲草辫盘的蒲团、博古架的月洞和梅瓶
//   docs/previews/tea-room.jpg        全屋陈列里的茶室
//   docs/previews/theater.jpg         影音室三件：投影幕（连影音柜和投影仪）、影音沙发、落地音箱
//   docs/previews/theater-detail.jpg  影音室特写：幕布上的电影画面、功放和超短焦投影仪、扶手箱的杯架和灯圈、音箱的单元
//   docs/previews/theater-room.jpg    全屋陈列里的影音室
//   docs/previews/gym2.jpg            健身房二三件：动感单车、划船机、龙门架
//   docs/previews/gym2-detail.jpg     健身房二特写：单车的骑行课程屏、飞轮和磁控刹车、划船机的水箱和桨叶、配重片和滑车
//   docs/previews/gym2-room.jpg       全屋陈列里的健身房二
//   docs/previews/game.jpg            游戏室四件：台球桌、街机、桌上足球、霓虹灯牌
//   docs/previews/game-detail.jpg     游戏室特写：摆好的一架台球、街机的屏幕和控制台、桌上足球的小人、霓虹灯管和墙上的光晕
//   docs/previews/game-room.jpg       全屋陈列里的游戏室
//   docs/previews/studio.jpg          画室三件：画架、颜料推车、石膏静物台
//   docs/previews/studio-detail.jpg   画室特写：画到一半的油画和托盘上的笔、调色板和笔筒、颜料管、石膏几何体和衬布
//   docs/previews/studio-room.jpg     全屋陈列里的画室
//   docs/previews/band.jpg            排练室四件：架子鼓、电吉他、吉他音箱、麦克风架
//   docs/previews/band-detail.jpg     排练室特写：底鼓的鼓牌和出音孔、从鼓手位置看的镲和军鼓、吉他的琴身、音箱面板
//   docs/previews/band-room.jpg       全屋陈列里的排练室
//   docs/previews/workshop.jpg        木工房四件：木工桌、洞洞板工具墙、滚轮工具柜、锯木架
//   docs/previews/workshop-detail.jpg 木工房特写：洞洞板上的工具和空着的轮廓、正在刨板的刨子、卡在锯口里的手锯、拉开的抽屉和电钻
//   docs/previews/workshop-room.jpg   全屋陈列里的木工房
//   docs/previews/pets.jpg            宠物房四件：猫爬架、水草鱼缸、狗窝、宠物餐桌
//   docs/previews/pets-detail.jpg     宠物房特写：圆窝里蜷着睡觉的橘猫、鱼缸里的水草和鱼、狗窝里的玩具、两只不锈钢碗
//   docs/previews/pets-room.jpg       全屋陈列里的宠物房
//   docs/previews/sewing.jpg          缝纫间四件：缝纫机桌、人台、线轴架、裁剪台
//   docs/previews/sewing-detail.jpg   缝纫间特写：缝纫机正面和压脚下的布、人台上的半身裙和软尺、四十轴线、裁剪台上的纸样
//   docs/previews/sewing-room.jpg     全屋陈列里的缝纫间
//   docs/previews/bar.jpg             酒吧四件：吧台、背吧柜、酒水推车、酒架
//   docs/previews/bar-detail.jpg      酒吧特写：吧台上的两杯酒和调酒工具、背吧柜的一格酒、推车上的冰桶和醒酒瓶、酒架里的瓶口
//   docs/previews/bar-room.jpg        全屋陈列里的酒吧
//   docs/previews/machine.jpg         机械车间四件：摩托车、车床、立式钻床、砂轮机
//   docs/previews/machine-detail.jpg  机械车间特写：摩托车的发动机和排气管、仪表和油箱、车床的卡盘和刀尖上卷出来的车屑、砂轮机
//   docs/previews/machine-room.jpg    全屋陈列里的机械车间
//   docs/previews/barber.jpg          理发店四件：理发椅、理发工作台、洗头台、灯柱
//   docs/previews/barber-detail.jpg   理发店特写：理发椅的车线皮面和脚踏板、台面上的消毒液罐和推子、发蜡和剃须杯、灯柱
//   docs/previews/barber-room.jpg     全屋陈列里的理发店
//   docs/previews/room.jpg           全屋陈列（墙地门窗拼出来的“剖开的公寓”）
//   docs/previews/living.jpg          客厅
//   docs/previews/bedroom.jpg         卧室：护墙板墙上的一对壁灯
//   docs/previews/dining.jpg          书房与餐厅
//   docs/previews/normals.jpg         同一个沙发：平滑法线 / 平直着色 / 线框
//   docs/previews/ao.jpg              扶手椅：有 / 无烘焙 AO
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { shoot } from './shots.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'docs', 'previews');
const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'tryitem-'));
await fs.mkdir(out, { recursive: true });
const manifest = JSON.parse(await fs.readFile(path.join(root, 'models', 'manifest.json'), 'utf8'));
const byCat = (c) => manifest.items.filter((i) => (i.category ?? 'furniture') === c).map((i) => i.id);
const ids = byCat('furniture'), decorIds = byCat('decor'), lampIds = byCat('lighting'), archIds = byCat('architecture'), kitchenIds = byCat('kitchen'), bathIds = byCat('bathroom'), balconyIds = byCat('balcony'), studyIds = byCat('study'), entryIds = byCat('entry'), kidsIds = byCat('kids'), laundryIds = byCat('laundry'), closetIds = byCat('closet'), gymIds = byCat('gym'), musicIds = byCat('music'), teaIds = byCat('tea'), theaterIds = byCat('theater'), gym2Ids = byCat('gym2'), gameIds = byCat('game'), studioIds = byCat('studio'), bandIds = byCat('band'), workshopIds = byCat('workshop'), petIds = byCat('pets'), sewIds = byCat('sewing'), barIds = byCat('bar'), machineIds = byCat('machine'), barberIds = byCat('barber');

async function grid(files, cols, cell, dest) {
  const rows = Math.ceil(files.length / cols);
  const comp = await Promise.all(files.map(async (f, i) => ({
    input: await sharp(f).resize(cell[0], cell[1]).toBuffer(),
    left: (i % cols) * cell[0], top: Math.floor(i / cols) * cell[1],
  })));
  await sharp({ create: { width: cols * cell[0], height: rows * cell[1], channels: 3, background: '#e3e2dd' } })
    .composite(comp).jpeg({ quality: 84, mozjpeg: true }).toFile(dest);
  console.log('→', path.relative(root, dest));
}

const heroes = await shoot({ items: ids, views: ['hero'], size: [800, 600], outDir: tmp });
await grid(heroes, 5, [400, 300], path.join(out, 'overview.jpg'));

// 家具特写：衣柜门板对花 + 抽屉木纹连贯、床头柜黄铜脚套、书桌信件抽屉、办公椅盾形靠背与外壳
const fd = [];
fd.push(...await shoot({ items: ['wardrobe'], views: ['&dist=0.5&el=6&az=20'], size: [800, 600], outDir: tmp, name: () => 'f0.png' }));
fd.push(...await shoot({ items: ['nightstand'], views: ['&target=0.12:0.16:0.1&dist=0.45&el=8&az=30'], size: [800, 600], outDir: tmp, name: () => 'f1.png' }));
fd.push(...await shoot({ items: ['desk'], views: ['&target=-0.3:0.72:-0.05&dist=0.4&el=18&az=25'], size: [800, 600], outDir: tmp, name: () => 'f2.png' }));
fd.push(...await shoot({ items: ['office_chair'], views: ['&target=0:0.8:-0.15&dist=0.4&el=30&az=50'], size: [800, 600], outDir: tmp, name: () => 'f3.png' }));
await grid(fd, 2, [600, 450], path.join(out, 'furniture-detail.jpg'));

const nf = [];
nf.push(...await shoot({ items: ['sideboard'], views: ['close'], size: [800, 600], outDir: tmp, name: () => 'n0.png' }));
nf.push(...await shoot({ items: ['bench'], views: ['close'], size: [800, 600], outDir: tmp, name: () => 'n1.png' }));
nf.push(...await shoot({ items: ['side_table'], views: ['hero'], size: [800, 600], outDir: tmp, name: () => 'n2.png' }));
await grid(nf, 3, [480, 360], path.join(out, 'furniture-new.jpg'));

const decor = await shoot({ items: decorIds, views: ['hero'], size: [800, 600], outDir: tmp, name: (id) => `d_${id}.png` });
await grid(decor, 3, [480, 360], path.join(out, 'decor.jpg'));

// 特写：书脊的烫金与书名、手工釉面、琴叶榕叶脉、地毯流苏
const detail = await shoot({
  items: ['books'], views: ['close'], size: [800, 600], outDir: tmp, name: () => 'x0.png',
});
detail.push(...await shoot({ items: ['vases'], views: ['close'], size: [800, 600], outDir: tmp, name: () => 'x1.png' }));
detail.push(...await shoot({ items: ['fiddle_fig'], views: ['&target=0.05:1.05:0&dist=0.3&el=20&az=30'], size: [800, 600], outDir: tmp, name: () => 'x2.png' }));
detail.push(...await shoot({ items: ['rug'], views: ['&target=0.95:0:0.3&dist=0.18&el=35&az=70'], size: [800, 600], outDir: tmp, name: () => 'x3.png' }));
await grid(detail, 2, [600, 450], path.join(out, 'decor-detail.jpg'));

const lamps = await shoot({ items: lampIds, views: ['hero'], size: [800, 600], outDir: tmp, name: (id) => `l_${id}.png` });
await grid(lamps, 4, [360, 270], path.join(out, 'lighting.jpg'));

// 灯具特写：台灯开灯 / 关灯（光斑、百褶），纸灯笼，墙上的壁灯
const lit = [];
lit.push(...await shoot({ items: ['table_lamp'], views: ['&dist=0.62&el=20'], size: [800, 600], outDir: tmp, name: () => 'y0.png' }));
lit.push(...await shoot({ items: ['table_lamp'], views: ['&dist=0.62&el=20&lights=0'], size: [800, 600], outDir: tmp, name: () => 'y1.png' }));
lit.push(...await shoot({ items: ['pendant_lantern'], views: ['&target=0:1.75:0&dist=0.5&el=12&az=30'], size: [800, 600], outDir: tmp, name: () => 'y2.png' }));
lit.push(...await shoot({ items: ['wall_lamp'], views: ['&dist=0.75&el=12&az=28'], size: [800, 600], outDir: tmp, name: () => 'y3.png' }));
await grid(lit, 2, [600, 450], path.join(out, 'lighting-detail.jpg'));

const arch = await shoot({ items: archIds, views: ['hero'], size: [800, 600], outDir: tmp, name: (id) => `a_${id}.png` });
await grid(arch, 4, [360, 270], path.join(out, 'architecture.jpg'));

// 墙地门窗特写：人字拼的板缝与木纹、门执手和合页、护墙板线条和腰线、钢窗与大理石窗台
const ad = [];
ad.push(...await shoot({ items: ['floor_herringbone'], views: ['&target=0:0:0.3&dist=0.35&el=24&az=20'], size: [800, 600], outDir: tmp, name: () => 'b0.png' }));
ad.push(...await shoot({ items: ['wall_door'], views: ['&target=0.22:1:0.06&dist=0.2&el=10&az=30'], size: [800, 600], outDir: tmp, name: () => 'b1.png' }));
ad.push(...await shoot({ items: ['wall_wainscot'], views: ['&target=-0.5:0.9:0.06&dist=0.28&el=10&az=30'], size: [800, 600], outDir: tmp, name: () => 'b2.png' }));
ad.push(...await shoot({ items: ['wall_window'], views: ['&target=0.1:1.2:0.05&dist=0.3&el=14&az=30'], size: [800, 600], outDir: tmp, name: () => 'b3.png' }));
await grid(ad, 2, [600, 450], path.join(out, 'architecture-detail.jpg'));

const kitchen = await shoot({ items: kitchenIds, views: ['hero'], size: [800, 600], outDir: tmp, name: (id) => `k_${id}.png` });
await grid(kitchen, 3, [480, 360], path.join(out, 'kitchen.jpg'));

// 厨房特写：水槽与龙头、墙砖与灯带光斑（在全屋里拍：吊柜装在台面上方）、烟机罩、岛台凸条板
const kd = [];
kd.push(...await shoot({ items: ['kitchen_base'], views: ['&target=-0.15:0.95:0&dist=0.26&el=26&az=24'], size: [800, 600], outDir: tmp, name: () => 'c0.png' }));
kd.push(...await shoot({ items: ['room'], views: ['&target=-9.2:1.25:-1.95&d=4.2&el=4&az=16'], size: [800, 600], outDir: tmp, name: () => 'c1.png' }));
kd.push(...await shoot({ items: ['kitchen_wall'], views: ['&target=0.62:1.74:0.2&dist=0.46&el=10&az=-28'], size: [800, 600], outDir: tmp, name: () => 'c2.png' }));
kd.push(...await shoot({ items: ['kitchen_island'], views: ['&target=0.45:0.62:0.3&dist=0.42&el=16&az=38'], size: [800, 600], outDir: tmp, name: () => 'c3.png' }));
await grid(kd, 2, [600, 450], path.join(out, 'kitchen-detail.jpg'));

const kroom = await shoot({ items: ['room'], views: ['&target=-8.3:0.9:-0.7&d=9.6&el=22&az=24'], size: [1600, 900], outDir: tmp, name: () => 'kitchen-room.png' });
await sharp(kroom[0]).jpeg({ quality: 84, mozjpeg: true }).toFile(path.join(out, 'kitchen-room.jpg'));
console.log('→ docs/previews/kitchen-room.jpg');

const bath = await shoot({ items: bathIds, views: ['hero'], size: [800, 600], outDir: tmp, name: (id) => `w_${id}.png` });
await grid(bath, 3, [480, 360], path.join(out, 'bathroom.jpg'));

// 浴室特写：台上盆与入墙龙头、马桶盖和合页、淋浴间的釉面砖和恒温混水阀、六角马赛克
const bd = [];
bd.push(...await shoot({ items: ['vanity'], views: ['&target=0:0.95:0.25&dist=0.42&el=24&az=26'], size: [800, 600], outDir: tmp, name: () => 'e0.png' }));
bd.push(...await shoot({ items: ['toilet'], views: ['&target=0:0.45:0.3&dist=0.55&el=22&az=40'], size: [800, 600], outDir: tmp, name: () => 'e1.png' }));
bd.push(...await shoot({ items: ['shower'], views: ['&target=0:1.25:0.2&dist=0.36&el=8&az=24'], size: [800, 600], outDir: tmp, name: () => 'e2.png' }));
bd.push(...await shoot({ items: ['floor_hex'], views: ['&target=0:0:0.3&dist=0.3&el=30&az=20'], size: [800, 600], outDir: tmp, name: () => 'e3.png' }));
await grid(bd, 2, [600, 450], path.join(out, 'bathroom-detail.jpg'));

const broom = await shoot({ items: ['room'], views: ['&target=12.1:0.95:-0.9&d=9.6&el=18&az=20'], size: [1600, 900], outDir: tmp, name: () => 'bathroom-room.png' });
await sharp(broom[0]).jpeg({ quality: 84, mozjpeg: true }).toFile(path.join(out, 'bathroom-room.jpg'));
console.log('→ docs/previews/bathroom-room.jpg');

const bal = await shoot({ items: balconyIds, views: ['hero'], size: [800, 600], outDir: tmp, name: (id) => `p_${id}.png` });
await grid(bal, 3, [480, 360], path.join(out, 'balcony.jpg'));

// 阳台特写：编绳靠背与腰枕、青瓷开片与钱纹镂空、橄榄叶（银绿两面）、钢栏杆与柚木扶手
const pd = [];
pd.push(...await shoot({ items: ['lounge_chair'], views: ['&target=0:0.55:-0.05&dist=0.5&el=26&az=36'], size: [800, 600], outDir: tmp, name: () => 'g0.png' }));
pd.push(...await shoot({ items: ['garden_stool'], views: ['&target=0:0.25:0&dist=0.8&el=16&az=24'], size: [800, 600], outDir: tmp, name: () => 'g1.png' }));
pd.push(...await shoot({ items: ['olive_tree'], views: ['&target=0.05:1.18:0&dist=0.36&el=8&az=30'], size: [800, 600], outDir: tmp, name: () => 'g2.png' }));
pd.push(...await shoot({ items: ['railing'], views: ['&target=0.3:0.9:0&dist=0.3&el=22&az=32'], size: [800, 600], outDir: tmp, name: () => 'g3.png' }));
await grid(pd, 2, [600, 450], path.join(out, 'balcony-detail.jpg'));

const proom = await shoot({ items: ['room'], views: ['&target=0:0.7:2.9&d=6&el=24&az=18'], size: [1600, 900], outDir: tmp, name: () => 'balcony-room.png' });
await sharp(proom[0]).jpeg({ quality: 84, mozjpeg: true }).toFile(path.join(out, 'balcony-room.jpg'));
console.log('→ docs/previews/balcony-room.jpg');

const st = await shoot({ items: studyIds, views: ['hero'], size: [800, 600], outDir: tmp, name: (id) => `s_${id}.png` });
await grid(st, 3, [480, 360], path.join(out, 'study.jpg'));

// 书房特写：书（书脊弧、书页顶面、平放的一摞、陶罐）、书梯顶上的黄铜挂钩、椅背绗缝和坐垫嵌条、从下往上看灯罩里面
const sd = [];
sd.push(...await shoot({ items: ['library_wall'], views: ['&target=0.1:1.3:0.26&dist=0.33&el=10&az=22'], size: [800, 600], outDir: tmp, name: () => 'h0.png' }));
sd.push(...await shoot({ items: ['library_wall'], views: ['&target=-0.4:2.26:0.43&d=0.42&el=8&az=70'], size: [800, 600], outDir: tmp, name: () => 'h1.png' }));
sd.push(...await shoot({ items: ['reading_chair'], views: ['&target=-0.12:0.7:-0.05&dist=0.45&el=12&az=20'], size: [800, 600], outDir: tmp, name: () => 'h2.png' }));
sd.push(...await shoot({ items: ['reading_lamp'], views: ['&target=0.56:1.14:0&dist=0.2&el=-12&az=20'], size: [800, 600], outDir: tmp, name: () => 'h3.png' }));
await grid(sd, 2, [600, 450], path.join(out, 'study-detail.jpg'));

const sroom = await shoot({ items: ['room'], views: ['&target=4:0.9:-1&d=7.5&el=20&az=18'], size: [1600, 900], outDir: tmp, name: () => 'study-room.png' });
await sharp(sroom[0]).jpeg({ quality: 84, mozjpeg: true }).toFile(path.join(out, 'study-room.jpg'));
console.log('→ docs/previews/study-room.jpg');

const en = await shoot({ items: entryIds, views: ['hero'], size: [800, 600], outDir: tmp, name: (id) => `n_${id}.png` });
await grid(en, 3, [480, 360], path.join(out, 'entry.jpg'));

// 玄关特写：鞋柜（半圆拉手、对花的木纹、洞石台面、干罂粟果）、拱形镜框的顶、衣帽架上的帽子 / 托特包 / 围巾、棋盘格大理石
const ed = [];
ed.push(...await shoot({ items: ['shoe_cabinet'], views: ['&target=0:0.8:0.2&dist=0.4&el=22&az=25'], size: [800, 600], outDir: tmp, name: () => 'n0.png' }));
ed.push(...await shoot({ items: ['floor_mirror'], views: ['&target=0:1.62:0.05&dist=0.3&el=6&az=24'], size: [800, 600], outDir: tmp, name: () => 'n1.png' }));
ed.push(...await shoot({ items: ['coat_stand'], views: ['&target=0:1.35:0&dist=0.42&el=8&az=-20'], size: [800, 600], outDir: tmp, name: () => 'n2.png' }));
ed.push(...await shoot({ items: ['floor_checker'], views: ['&target=0:0:0.3&dist=0.3&el=30&az=20'], size: [800, 600], outDir: tmp, name: () => 'n3.png' }));
await grid(ed, 2, [600, 450], path.join(out, 'entry-detail.jpg'));

const nroom = await shoot({ items: ['room'], views: ['&target=-12:0.9:-1&d=7.5&el=20&az=18'], size: [1600, 900], outDir: tmp, name: () => 'entry-room.png' });
await sharp(nroom[0]).jpeg({ quality: 84, mozjpeg: true }).toFile(path.join(out, 'entry-room.jpg'));
console.log('→ docs/previews/entry-room.jpg');

const kidsHero = await shoot({ items: kidsIds, views: ['hero'], size: [800, 600], outDir: tmp, name: (id) => `k_${id}.png` });
await grid(kidsHero, 3, [480, 360], path.join(out, 'kids.jpg'));

// 儿童房特写：床尾山墙（小旗子、烟囱、屋脊梁）、玩具柜弯过去的胶合板边、画纸上的蜡笔画和笔筒、床头的圈绒兔子
const kidsDetail = [];
kidsDetail.push(...await shoot({ items: ['kids_bed'], views: ['&target=0.05:1.28:0.95&d=1.75&el=6&az=14'], size: [800, 600], outDir: tmp, name: () => 'kid0.png' }));
kidsDetail.push(...await shoot({ items: ['toy_cabinet'], views: ['&target=-0.5:0.56:0.39&d=0.42&el=16&az=32'], size: [800, 600], outDir: tmp, name: () => 'kid1.png' }));
kidsDetail.push(...await shoot({ items: ['kids_desk'], views: ['&target=0.02:0.58:-0.02&d=0.85&el=42&az=10'], size: [800, 600], outDir: tmp, name: () => 'kid2.png' }));
kidsDetail.push(...await shoot({ items: ['kids_bed'], views: ['&target=0.26:0.4:-0.58&d=0.55&el=16&az=22'], size: [800, 600], outDir: tmp, name: () => 'kid3.png' }));
await grid(kidsDetail, 2, [600, 450], path.join(out, 'kids-detail.jpg'));

const kidsRoom = await shoot({ items: ['room'], views: ['&target=16.1:0.9:-0.75&d=7.4&el=20&az=18'], size: [1600, 900], outDir: tmp, name: () => 'kids-room.png' });
await sharp(kidsRoom[0]).jpeg({ quality: 84, mozjpeg: true }).toFile(path.join(out, 'kids-room.jpg'));
console.log('→ docs/previews/kids-room.jpg');

const laundryHero = await shoot({ items: laundryIds, views: ['hero'], size: [800, 600], outDir: tmp, name: (id) => `u_${id}.png` });
await grid(laundryHero, 3, [480, 360], path.join(out, 'laundry.jpg'));

// 洗衣房特写：洗衣机门（镀铬门圈、隔着烟灰玻璃的门封和冲孔内筒）、烘干机的控制面板（琥珀色的数码管）、
// 晾衣架（毛巾的褶、夹着木夹子的袜子、布带铰链）、水泥花砖
const laundryDetail = [];
laundryDetail.push(...await shoot({ items: ['washer'], views: ['&target=0:0.43:0.6&d=0.75&el=8&az=15'], size: [800, 600], outDir: tmp, name: () => 'lau0.png' }));
laundryDetail.push(...await shoot({ items: ['dryer'], views: ['&target=0.08:0.8:0.6&d=0.52&el=14&az=10'], size: [800, 600], outDir: tmp, name: () => 'lau1.png' }));
laundryDetail.push(...await shoot({ items: ['drying_rack'], views: ['&target=0.35:1.05:0.1&d=0.8&el=4&az=40'], size: [800, 600], outDir: tmp, name: () => 'lau2.png' }));
laundryDetail.push(...await shoot({ items: ['floor_cement'], views: ['&target=0:0:0.3&dist=0.3&el=30&az=20'], size: [800, 600], outDir: tmp, name: () => 'lau3.png' }));
await grid(laundryDetail, 2, [600, 450], path.join(out, 'laundry-detail.jpg'));

const laundryRoom = await shoot({ items: ['room'], views: ['&target=20.1:0.9:-0.75&d=7.4&el=20&az=18'], size: [1600, 900], outDir: tmp, name: () => 'laundry-room.png' });
await sharp(laundryRoom[0]).jpeg({ quality: 84, mozjpeg: true }).toFile(path.join(out, 'laundry-room.jpg'));
console.log('→ docs/previews/laundry-room.jpg');

const closetHero = await shoot({ items: closetIds, views: ['hero'], size: [800, 600], outDir: tmp, name: (id) => `c_${id}.png` });
await grid(closetHero, 3, [480, 360], path.join(out, 'closet.jpg'));

// 衣帽间特写：一排衬衫（领子、袖口、条纹和格子的尺度）、长衣区（大衣的领子和袖口、真丝吊带裙的褶）、
// 梳妆台（托盘上的香水、化妆镜的球泡和墙上的光晕）、首饰岛台的丝绒格子（戒指卷、表枕、珍珠项链）
const closetDetail = [];
closetDetail.push(...await shoot({ items: ['open_wardrobe'], views: ['&target=0.6:1.6:0.3&d=1.35&el=8&az=-20'], size: [800, 600], outDir: tmp, name: () => 'clo0.png' }));
closetDetail.push(...await shoot({ items: ['open_wardrobe'], views: ['&target=-0.72:1.42:0.35&d=1.75&el=6&az=22'], size: [800, 600], outDir: tmp, name: () => 'clo1.png' }));
closetDetail.push(...await shoot({ items: ['dressing_table'], views: ['&target=-0.16:0.93:0.28&d=0.75&el=16&az=14'], size: [800, 600], outDir: tmp, name: () => 'clo2.png' }));
closetDetail.push(...await shoot({ items: ['jewelry_island'], views: ['&target=-0.1:0.86:0.05&d=0.85&el=52&az=8'], size: [800, 600], outDir: tmp, name: () => 'clo3.png' }));
await grid(closetDetail, 2, [600, 450], path.join(out, 'closet-detail.jpg'));

const closetRoom = await shoot({ items: ['room'], views: ['&target=24.1:0.9:-0.75&d=7.4&el=20&az=18'], size: [1600, 900], outDir: tmp, name: () => 'closet-room.png' });
await sharp(closetRoom[0]).jpeg({ quality: 84, mozjpeg: true }).toFile(path.join(out, 'closet-room.jpg'));
console.log('→ docs/previews/closet-room.jpg');

const gymHero = await shoot({ items: gymIds, views: ['hero'], size: [800, 600], outDir: tmp, name: (id) => `g_${id}.png` });
await grid(gymHero, 3, [480, 360], path.join(out, 'gym.jpg'));

// 健身房特写：跑步机的屏幕（晨跑的风景和运动数据）和控制台、哑铃端面的重量和滚花握把、瑜伽垫卷起来的那一头（一圈圈双色的螺旋）、橡胶地垫
const gymDetail = [];
gymDetail.push(...await shoot({ items: ['treadmill'], views: ['&target=0:1.27:-0.66&d=0.95&el=12&az=8'], size: [800, 600], outDir: tmp, name: () => 'gym0.png' }));
gymDetail.push(...await shoot({ items: ['dumbbell_rack'], views: ['&target=-0.2:0.4:0.18&d=0.75&el=16&az=18'], size: [800, 600], outDir: tmp, name: () => 'gym1.png' }));
gymDetail.push(...await shoot({ items: ['yoga_mat'], views: ['&target=0.69:0.05:0.3&d=0.38&el=12&az=12'], size: [800, 600], outDir: tmp, name: () => 'gym2.png' }));
gymDetail.push(...await shoot({ items: ['floor_rubber'], views: ['&target=0.5:0:0.5&dist=0.3&el=30&az=20'], size: [800, 600], outDir: tmp, name: () => 'gym3.png' }));
await grid(gymDetail, 2, [600, 450], path.join(out, 'gym-detail.jpg'));

const gymRoom = await shoot({ items: ['room'], views: ['&target=28.1:0.9:-0.75&d=7.4&el=20&az=18'], size: [1600, 900], outDir: tmp, name: () => 'gym-room.png' });
await sharp(gymRoom[0]).jpeg({ quality: 84, mozjpeg: true }).toFile(path.join(out, 'gym-room.jpg'));
console.log('→ docs/previews/gym-room.jpg');

const musicHero = await shoot({ items: musicIds, views: ['hero'], size: [800, 600], outDir: tmp, name: (id) => `m_${id}.png` });
await grid(musicHero, 3, [480, 360], path.join(out, 'music.jpg'));

// 书房二特写：键盘和金字铭牌、琴肚子里（金色铁板、交叉的缠铜低音弦、弦轴、制音器、铸字）、
// 琴凳的菱形拉扣和滚边、乐谱架的竖琴谱板和小提琴分谱
const musicDetail = [];
musicDetail.push(...await shoot({ items: ['grand_piano'], views: ['&target=-0.1:0.78:0.62&d=0.95&el=24&az=16'], size: [800, 600], outDir: tmp, name: () => 'mus0.png' }));
musicDetail.push(...await shoot({ items: ['grand_piano'], views: ['&target=0.05:0.93:-0.1&d=1.25&el=44&az=58'], size: [800, 600], outDir: tmp, name: () => 'mus1.png' }));
musicDetail.push(...await shoot({ items: ['piano_bench'], views: ['&target=0:0.46:0&d=0.9&el=34&az=24'], size: [800, 600], outDir: tmp, name: () => 'mus2.png' }));
musicDetail.push(...await shoot({ items: ['music_stand'], views: ['&target=0:1.08:0.06&d=0.95&el=10&az=12'], size: [800, 600], outDir: tmp, name: () => 'mus3.png' }));
await grid(musicDetail, 2, [600, 450], path.join(out, 'music-detail.jpg'));

const musicRoom = await shoot({ items: ['room'], views: ['&target=32.1:0.9:-0.6&d=7.4&el=20&az=18'], size: [1600, 900], outDir: tmp, name: () => 'music-room.png' });
await sharp(musicRoom[0]).jpeg({ quality: 84, mozjpeg: true }).toFile(path.join(out, 'music-room.jpg'));
console.log('→ docs/previews/music-room.jpg');

const teaHero = await shoot({ items: teaIds, views: ['hero'], size: [800, 600], outDir: tmp, name: (id) => `t_${id}.png` });
await grid(teaHero, 3, [480, 360], path.join(out, 'tea.jpg'));

// 茶室特写：茶盘上的紫砂壶、公道杯和四只开片杯（旁边电陶炉上的铁壶）、大板树根那头的裂缝和两枚枫木蝴蝶榫、
// 蒲草辫盘出来的蒲团、博古架的月洞和里面的哥窑梅瓶
const teaDetail = [];
teaDetail.push(...await shoot({ items: ['tea_table'], views: ['&target=-0.18:0.45:-0.08&d=0.8&el=32&az=14'], size: [800, 600], outDir: tmp, name: () => 'tea0.png' }));
teaDetail.push(...await shoot({ items: ['tea_table'], views: ['&target=-0.62:0.36:0.12&d=0.62&el=40&az=-28'], size: [800, 600], outDir: tmp, name: () => 'tea1.png' }));
teaDetail.push(...await shoot({ items: ['tea_cushion'], views: ['&target=0:0.08:0&d=0.85&el=34&az=20'], size: [800, 600], outDir: tmp, name: () => 'tea2.png' }));
teaDetail.push(...await shoot({ items: ['curio_shelf'], views: ['&target=0.05:1.3:0.2&d=1.35&el=4&az=12'], size: [800, 600], outDir: tmp, name: () => 'tea3.png' }));
await grid(teaDetail, 2, [600, 450], path.join(out, 'tea-detail.jpg'));

const teaRoom = await shoot({ items: ['room'], views: ['&target=36.0:0.7:-0.6&d=7.0&el=24&az=16'], size: [1600, 900], outDir: tmp, name: () => 'tea-room.png' });
await sharp(teaRoom[0]).jpeg({ quality: 84, mozjpeg: true }).toFile(path.join(out, 'tea-room.jpg'));
console.log('→ docs/previews/tea-room.jpg');

const theaterHero = await shoot({ items: theaterIds, views: ['hero'], size: [800, 600], outDir: tmp, name: (id) => `h_${id}.png` });
await grid(theaterHero, 3, [480, 360], path.join(out, 'theater.jpg'));

// 影音室特写：幕布上的电影画面（黄昏的山湖、桥上两个人的背影）和底下的投影仪、功放的拉丝铝面板和亮着的音量、
// 扶手箱的杯架和蓝色灯圈（旁边那一座躺下了）、落地音箱的高音波导、编织中音和纸盆低音
const theaterDetail = [];
theaterDetail.push(...await shoot({ items: ['projector_screen'], views: ['&target=0:1.12:0.3&d=2.6&el=6&az=14'], size: [800, 600], outDir: tmp, name: () => 'th0.png' }));
theaterDetail.push(...await shoot({ items: ['projector_screen'], views: ['&target=0.02:0.44:0.42&d=0.72&el=16&az=16'], size: [800, 600], outDir: tmp, name: () => 'th1.png' }));
theaterDetail.push(...await shoot({ items: ['theater_sofa'], views: ['&target=0.45:0.5:0.2&d=1.5&el=36&az=30'], size: [800, 600], outDir: tmp, name: () => 'th2.png' }));
theaterDetail.push(...await shoot({ items: ['tower_speaker'], views: ['&target=0:0.78:0.18&d=0.9&el=10&az=30'], size: [800, 600], outDir: tmp, name: () => 'th3.png' }));
await grid(theaterDetail, 2, [600, 450], path.join(out, 'theater-detail.jpg'));

const theaterRoom = await shoot({ items: ['room'], views: ['&target=40.0:0.9:-0.5&d=7.2&el=22&az=16'], size: [1600, 900], outDir: tmp, name: () => 'theater-room.png' });
await sharp(theaterRoom[0]).jpeg({ quality: 84, mozjpeg: true }).toFile(path.join(out, 'theater-room.jpg'));
console.log('→ docs/previews/theater-room.jpg');

const gym2Hero = await shoot({ items: gym2Ids, views: ['hero'], size: [800, 600], outDir: tmp, name: (id) => `h_${id}.png` });
await grid(gym2Hero, 3, [480, 360], path.join(out, 'gym2.jpg'));

// 健身房二特写：单车把手上方的骑行课程屏（爬坡剖面、踏频 / 功率 / 阻力 / 心率）、左边看镀铬飞轮和红色磁控刹车、
// 划船机从前面看水箱（水里的桨叶、透过水的底板木纹）和脚踏板、龙门架右塔的配重片（40 kg 插着销）和第 14 档的滑车
const gym2Detail = [];
gym2Detail.push(...await shoot({ items: ['spin_bike'], views: ['&target=0:1.18:-0.2&d=0.95&el=12&az=22'], size: [800, 600], outDir: tmp, name: () => 'gy0.png' }));
gym2Detail.push(...await shoot({ items: ['spin_bike'], views: ['&target=-0.02:0.42:-0.3&d=1.05&el=10&az=-72'], size: [800, 600], outDir: tmp, name: () => 'gy1.png' }));
gym2Detail.push(...await shoot({ items: ['rowing_machine'], views: ['&target=0:0.36:-0.7&d=1.45&el=24&az=142'], size: [800, 600], outDir: tmp, name: () => 'gy2.png' }));
gym2Detail.push(...await shoot({ items: ['cable_crossover'], views: ['&target=1.02:0.95:-0.1&d=1.7&el=6&az=-24'], size: [800, 600], outDir: tmp, name: () => 'gy3.png' }));
await grid(gym2Detail, 2, [600, 450], path.join(out, 'gym2-detail.jpg'));

const gym2Room = await shoot({ items: ['room'], views: ['&target=44.0:0.9:-0.4&d=7.4&el=20&az=14'], size: [1600, 900], outDir: tmp, name: () => 'gym2-room.png' });
await sharp(gym2Room[0]).jpeg({ quality: 84, mozjpeg: true }).toFile(path.join(out, 'gym2-room.jpg'));
console.log('→ docs/previews/gym2-room.jpg');

const gameHero = await shoot({ items: gameIds, views: ['hero'], size: [800, 600], outDir: tmp, name: (id) => `h_${id}.png` });
await grid(gameHero, 4, [360, 270], path.join(out, 'game.jpg'));

// 游戏室特写：三角框里摆好的一架球（号码转向不同的方向）、街机的屏幕和控制台（摇杆、开火键、印着的圈）、
// 桌上足球的红蓝两队和中圈、霓虹灯管和墙上烘焙的粉红光晕
const gameDetail = [];
gameDetail.push(...await shoot({ items: ['pool_table'], views: ['&target=0.55:0.78:0&d=0.9&el=40&az=30'], size: [800, 600], outDir: tmp, name: () => 'gm0.png' }));
gameDetail.push(...await shoot({ items: ['arcade_cabinet'], views: ['&target=0:1.12:0.2&d=1.05&el=8&az=22'], size: [800, 600], outDir: tmp, name: () => 'gm1.png' }));
gameDetail.push(...await shoot({ items: ['foosball_table'], views: ['&target=0:0.8:0&d=1.0&el=45&az=20'], size: [800, 600], outDir: tmp, name: () => 'gm2.png' }));
gameDetail.push(...await shoot({ items: ['neon_sign'], views: ['&az=40&el=20'], size: [800, 600], outDir: tmp, name: () => 'gm3.png' }));
await grid(gameDetail, 2, [600, 450], path.join(out, 'game-detail.jpg'));

const gameRoom = await shoot({ items: ['room'], views: ['&target=48.0:0.9:-0.4&d=7.4&el=22&az=14'], size: [1600, 900], outDir: tmp, name: () => 'game-room.png' });
await sharp(gameRoom[0]).jpeg({ quality: 84, mozjpeg: true }).toFile(path.join(out, 'game-room.jpg'));
console.log('→ docs/previews/game-room.jpg');

// —— 画室 ——
const studioHero = await shoot({ items: studioIds, views: ['hero'], size: [800, 600], outDir: tmp, name: (id) => `h_${id}.png` });
await grid(studioHero, 3, [480, 360], path.join(out, 'studio.jpg'));

// 画室特写：画面右下角还没画完的地方（稀薄的底色、铅笔起稿线）和托盘上的笔、推车顶层的调色板和插满笔的铁皮罐、
// 中层的颜料管（拧开盖子的那支挤出一截群青）、石膏几何体和垂下来的衬布
const studioDetail = [];
studioDetail.push(...await shoot({ items: ['easel'], views: ['&target=0.1:1.02:0.07&d=0.8&el=10&az=16'], size: [800, 600], outDir: tmp, name: () => 'st0.png' }));
studioDetail.push(...await shoot({ items: ['art_cart'], views: ['&target=0.04:0.8:0&d=0.8&el=36&az=24'], size: [800, 600], outDir: tmp, name: () => 'st1.png' }));
studioDetail.push(...await shoot({ items: ['art_cart'], views: ['&target=-0.05:0.5:0&d=0.72&el=42&az=5'], size: [800, 600], outDir: tmp, name: () => 'st2.png' }));
studioDetail.push(...await shoot({ items: ['still_life'], views: ['&target=0:0.72:0.05&d=1.35&el=18&az=24'], size: [800, 600], outDir: tmp, name: () => 'st3.png' }));
await grid(studioDetail, 2, [600, 450], path.join(out, 'studio-detail.jpg'));

const studioRoom = await shoot({ items: ['room'], views: ['&target=52.0:0.9:-0.4&d=7.4&el=22&az=14'], size: [1600, 900], outDir: tmp, name: () => 'studio-room.png' });
await sharp(studioRoom[0]).jpeg({ quality: 84, mozjpeg: true }).toFile(path.join(out, 'studio-room.jpg'));
console.log('→ docs/previews/studio-room.jpg');

// —— 排练室 ——
const bandHero = await shoot({ items: bandIds, views: ['hero'], size: [800, 600], outDir: tmp, name: (id) => `h_${id}.png` });
await grid(bandHero, 4, [360, 270], path.join(out, 'band.jpg'));

// 排练室特写：底鼓前皮的鼓牌和出音孔、嗵鼓；从鼓手的位置看过去的踩镲、军鼓和鼓棒；吉他的琴身（日落色、护板、拾音器、琴弦）；
// 音箱的黑面板（旋钮、刻度、红宝石指示灯）
const bandDetail = [];
bandDetail.push(...await shoot({ items: ['drum_kit'], views: ['&target=0:0.72:0.1&d=1.55&el=12&az=10'], size: [800, 600], outDir: tmp, name: () => 'bd0.png' }));
bandDetail.push(...await shoot({ items: ['drum_kit'], views: ['&target=0.25:0.8:-0.45&d=1.2&el=32&az=205'], size: [800, 600], outDir: tmp, name: () => 'bd1.png' }));
bandDetail.push(...await shoot({ items: ['electric_guitar'], views: ['&target=0:0.45:0.02&d=0.85&el=8&az=10'], size: [800, 600], outDir: tmp, name: () => 'bd2.png' }));
bandDetail.push(...await shoot({ items: ['guitar_amp'], views: ['&target=0:0.38:0.1&d=0.72&el=12&az=16'], size: [800, 600], outDir: tmp, name: () => 'bd3.png' }));
await grid(bandDetail, 2, [600, 450], path.join(out, 'band-detail.jpg'));

const bandRoom = await shoot({ items: ['room'], views: ['&target=56.0:0.9:-0.4&d=7.4&el=22&az=14'], size: [1600, 900], outDir: tmp, name: () => 'band-room.png' });
await sharp(bandRoom[0]).jpeg({ quality: 84, mozjpeg: true }).toFile(path.join(out, 'band-room.jpg'));
console.log('→ docs/previews/band-room.jpg');

// —— 木工房 ——
const workshopHero = await shoot({ items: workshopIds, views: ['hero'], size: [800, 600], outDir: tmp, name: (id) => `h_${id}.png` });
await grid(workshopHero, 4, [360, 270], path.join(out, 'workshop.jpg'));

// 木工房特写：洞洞板（白漆画的轮廓，锯子和角尺那两块空着）；平刨正刨在松木板上、刨口冒出来一卷刨花；
// 手锯卡在锯了一半的锯口里（铅笔线、1620、废料那边的叉）；工具柜拉开的抽屉里一排套筒，顶上的电钻
const workshopDetail = [];
workshopDetail.push(...await shoot({ items: ['pegboard'], views: ['&target=0:1.45:0.05&d=1.75&el=4&az=10'], size: [800, 600], outDir: tmp, name: () => 'wd0.png' }));
workshopDetail.push(...await shoot({ items: ['workbench'], views: ['&target=0.06:0.95:0.2&d=0.55&el=32&az=38'], size: [800, 600], outDir: tmp, name: () => 'wd1.png' }));
workshopDetail.push(...await shoot({ items: ['sawhorses'], views: ['&target=0.52:0.72:0.0&d=0.8&el=25&az=-40'], size: [800, 600], outDir: tmp, name: () => 'wd2.png' }));
workshopDetail.push(...await shoot({ items: ['tool_chest'], views: ['&target=0.05:1.04:0.1&d=1.12&el=26&az=22'], size: [800, 600], outDir: tmp, name: () => 'wd3.png' }));
await grid(workshopDetail, 2, [600, 450], path.join(out, 'workshop-detail.jpg'));

const workshopRoom = await shoot({ items: ['room'], views: ['&target=60.0:0.9:-0.4&d=7.4&el=22&az=14'], size: [1600, 900], outDir: tmp, name: () => 'workshop-room.png' });
await sharp(workshopRoom[0]).jpeg({ quality: 84, mozjpeg: true }).toFile(path.join(out, 'workshop-room.jpg'));
console.log('→ docs/previews/workshop-room.jpg');

// —— 宠物房 ——
const petHero = await shoot({ items: petIds, views: ['hero'], size: [800, 600], outDir: tmp, name: (id) => `h_${id}.png` });
await grid(petHero, 4, [360, 270], path.join(out, 'pets.jpg'));

// 宠物房特写：猫爬架顶上圆窝里蜷着睡觉的橘猫（尾巴绕到鼻子前面）；鱼缸里的苦草、沉木上的铁皇冠、红绿灯鱼群和神仙鱼；
// 狗窝里的磨牙骨头和网球；餐桌上一碗狗粮、一碗水
const petDetail = [];
petDetail.push(...await shoot({ items: ['cat_tree'], views: ['&target=0.06:1.27:0.0&d=0.62&el=34&az=22'], size: [800, 600], outDir: tmp, name: () => 'pd0.png' }));
petDetail.push(...await shoot({ items: ['aquarium'], views: ['&target=-0.02:0.98:0.05&d=1.05&el=5&az=6'], size: [800, 600], outDir: tmp, name: () => 'pd1.png' }));
petDetail.push(...await shoot({ items: ['dog_bed'], views: ['&target=0.02:0.1:-0.06&d=0.95&el=40&az=12'], size: [800, 600], outDir: tmp, name: () => 'pd2.png' }));
petDetail.push(...await shoot({ items: ['pet_feeder'], views: ['&target=0:0.14:-0.03&d=0.75&el=30&az=15'], size: [800, 600], outDir: tmp, name: () => 'pd3.png' }));
await grid(petDetail, 2, [600, 450], path.join(out, 'pets-detail.jpg'));

const petRoom = await shoot({ items: ['room'], views: ['&target=64.0:0.9:-0.4&d=7.4&el=22&az=14'], size: [1600, 900], outDir: tmp, name: () => 'pets-room.png' });
await sharp(petRoom[0]).jpeg({ quality: 84, mozjpeg: true }).toFile(path.join(out, 'pets-room.jpg'));
console.log('→ docs/previews/pets-room.jpg');

// —— 缝纫间 ——
const sewHero = await shoot({ items: sewIds, views: ['hero'], size: [800, 600], outDir: tmp, name: (id) => `h_${id}.png` });
await grid(sewHero, 4, [360, 270], path.join(out, 'sewing.jpg'));

// 缝纫间特写：缝纫机正面（机头面板上的穿线槽、针迹表、发光的液晶屏和旋钮，碎花布从压脚底下穿过）；
// 人台上别着大头针的半身裙、挂在脖子上的软尺；线轴架上的四十轴线；裁剪台上的纸样、压铁、切割垫和木尺
const sewDetail = [];
sewDetail.push(...await shoot({ items: ['sewing_table'], views: ['&target=-0.2:0.88:0&d=0.75&el=12&az=8'], size: [800, 600], outDir: tmp, name: () => 'sd0.png' }));
sewDetail.push(...await shoot({ items: ['dress_form'], views: ['&target=0:1.32:0.05&d=1.05&el=8&az=-20'], size: [800, 600], outDir: tmp, name: () => 'sd1.png' }));
sewDetail.push(...await shoot({ items: ['thread_rack'], views: ['&target=0.03:1.45:0.05&d=0.62&el=5&az=25'], size: [800, 600], outDir: tmp, name: () => 'sd2.png' }));
sewDetail.push(...await shoot({ items: ['cutting_table'], views: ['&target=-0.05:0.9:0.0&d=1.0&el=40&az=10'], size: [800, 600], outDir: tmp, name: () => 'sd3.png' }));
await grid(sewDetail, 2, [600, 450], path.join(out, 'sewing-detail.jpg'));

const sewRoom = await shoot({ items: ['room'], views: ['&target=68.0:0.9:-0.4&d=7.4&el=22&az=14'], size: [1600, 900], outDir: tmp, name: () => 'sewing-room.png' });
await sharp(sewRoom[0]).jpeg({ quality: 84, mozjpeg: true }).toFile(path.join(out, 'sewing-room.jpg'));
console.log('→ docs/previews/sewing-room.jpg');

// —— 酒吧 ——
const barHero = await shoot({ items: barIds, views: ['hero'], size: [800, 600], outDir: tmp, name: (id) => `h_${id}.png` });
await grid(barHero, 4, [360, 270], path.join(out, 'bar.jpg'));

// 酒吧特写：吧台上的 Negroni、马天尼、搅拌杯、雪克壶和砧板；背吧柜左边一格的酒、黄铜挡杆和灯带；
// 推车上层的冰桶（插着香槟）、醒酒瓶和两杯加冰威士忌；酒架格子里露出来的瓶口和锡封
const barDetail = [];
barDetail.push(...await shoot({ items: ['bar_counter'], views: ['&target=0:0.95:0.1&d=1.3&el=22&az=10'], size: [800, 600], outDir: tmp, name: () => 'bd0.png' }));
barDetail.push(...await shoot({ items: ['back_bar'], views: ['&target=-0.6:1.5:0.1&d=1.3&el=8&az=20'], size: [800, 600], outDir: tmp, name: () => 'bd1.png' }));
barDetail.push(...await shoot({ items: ['bar_cart'], views: ['&target=0:0.9:0&d=0.9&el=25&az=20'], size: [800, 600], outDir: tmp, name: () => 'bd2.png' }));
barDetail.push(...await shoot({ items: ['wine_rack'], views: ['&target=0:0.8:0.2&d=0.9&el=10&az=25'], size: [800, 600], outDir: tmp, name: () => 'bd3.png' }));
await grid(barDetail, 2, [600, 450], path.join(out, 'bar-detail.jpg'));

const barRoom = await shoot({ items: ['room'], views: ['&target=72.0:0.9:-0.4&d=7.4&el=22&az=14'], size: [1600, 900], outDir: tmp, name: () => 'bar-room.png' });
await sharp(barRoom[0]).jpeg({ quality: 84, mozjpeg: true }).toFile(path.join(out, 'bar-room.jpg'));
console.log('→ docs/previews/bar-room.jpg');

// —— 机械车间 ——
const machineHero = await shoot({ items: machineIds, views: ['hero'], size: [800, 600], outDir: tmp, name: (id) => `h_${id}.png` });
await grid(machineHero, 4, [360, 270], path.join(out, 'machine.jpg'));

// 机械车间特写：摩托车右边的发动机（散热片、边盖上的圆铭牌、绕到前面的排气管）；上联板上的两块表和油箱的条纹；
// 车床的三爪卡盘、四方刀架和刀尖上卷出来的回火色车屑；砂轮机的两片砂轮、托刀板和护目挡板
const machineDetail = [];
machineDetail.push(...await shoot({ items: ['motorcycle'], views: ['&target=0.05:0.45:0.1&d=1.0&el=12&az=10'], size: [800, 600], outDir: tmp, name: () => 'md0.png' }));
machineDetail.push(...await shoot({ items: ['motorcycle'], views: ['&target=0.45:0.9:0&d=0.6&el=40&az=-100'], size: [800, 600], outDir: tmp, name: () => 'md1.png' }));
machineDetail.push(...await shoot({ items: ['metal_lathe'], views: ['&target=-0.1:1.1:0.35&d=0.9&el=18&az=12'], size: [800, 600], outDir: tmp, name: () => 'md2.png' }));
machineDetail.push(...await shoot({ items: ['bench_grinder'], views: ['&target=0:0.93:0.05&d=0.6&el=15&az=25'], size: [800, 600], outDir: tmp, name: () => 'md3.png' }));
await grid(machineDetail, 2, [600, 450], path.join(out, 'machine-detail.jpg'));

const machineRoom = await shoot({ items: ['room'], views: ['&target=76.0:0.9:-0.4&d=7.4&el=22&az=14'], size: [1600, 900], outDir: tmp, name: () => 'machine-room.png' });
await sharp(machineRoom[0]).jpeg({ quality: 84, mozjpeg: true }).toFile(path.join(out, 'machine-room.jpg'));
console.log('→ docs/previews/machine-room.jpg');

// —— 理发店 ——
const barberHero = await shoot({ items: barberIds, views: ['hero'], size: [800, 600], outDir: tmp, name: (id) => `h_${id}.png` });
await grid(barberHero, 4, [360, 270], path.join(out, 'barber.jpg'));

// 理发店特写：理发椅的车线皮面、搪瓷扶手和铸造脚踏板；台面左边的毛巾、泡着梳子的消毒液罐、推子和一排瓶子；
// 右边的两盒发蜡、剃须杯、剃刀、梳子和喷水壶；灯柱的条纹转筒和乳白球灯
const barberDetail = [];
barberDetail.push(...await shoot({ items: ['barber_chair'], views: ['&target=0:0.5:0.1&d=1.3&el=35&az=60'], size: [800, 600], outDir: tmp, name: () => 'bd0.png' }));
barberDetail.push(...await shoot({ items: ['barber_station'], views: ['&target=-0.2:0.95:0.25&d=0.9&el=35&az=10'], size: [800, 600], outDir: tmp, name: () => 'bd1.png' }));
barberDetail.push(...await shoot({ items: ['barber_station'], views: ['&target=0.35:0.95:0.25&d=0.8&el=40&az=-15'], size: [800, 600], outDir: tmp, name: () => 'bd2.png' }));
barberDetail.push(...await shoot({ items: ['barber_pole'], views: ['&target=0:1.84:0.13&d=1.55&el=6&az=24'], size: [800, 600], outDir: tmp, name: () => 'bd3.png' }));
await grid(barberDetail, 2, [600, 450], path.join(out, 'barber-detail.jpg'));

const barberRoom = await shoot({ items: ['room'], views: ['&target=80.0:0.9:-0.4&d=7.4&el=22&az=14'], size: [1600, 900], outDir: tmp, name: () => 'barber-room.png' });
await sharp(barberRoom[0]).jpeg({ quality: 84, mozjpeg: true }).toFile(path.join(out, 'barber-room.jpg'));
console.log('→ docs/previews/barber-room.jpg');

// 全屋里的近景都用绝对距离 d（米）：全屋再加区域，这些图的取景不变。
// 客厅、餐厅的相机在阳台上空 / 侧上方，往下看 —— 阳台不挡在画面下沿
const room = await shoot({ items: ['room'], views: ['&el=32&az=24&dist=0.9'], size: [1600, 900], outDir: tmp, name: () => 'room.png' });
await sharp(room[0]).jpeg({ quality: 84, mozjpeg: true }).toFile(path.join(out, 'room.jpg'));
console.log('→ docs/previews/room.jpg');

const living = await shoot({ items: ['room'], views: ['&target=0.4:0.8:-1.2&d=6.4&el=26&az=16'], size: [1600, 900], outDir: tmp, name: () => 'living.png' });
await sharp(living[0]).jpeg({ quality: 84, mozjpeg: true }).toFile(path.join(out, 'living.jpg'));
console.log('→ docs/previews/living.jpg');

const bedroom = await shoot({ items: ['room'], views: ['&target=7.6:0.95:-1.0&d=8.6&el=14&az=8'], size: [1600, 900], outDir: tmp, name: () => 'bedroom.png' });
await sharp(bedroom[0]).jpeg({ quality: 84, mozjpeg: true }).toFile(path.join(out, 'bedroom.jpg'));
console.log('→ docs/previews/bedroom.jpg');

const dining = await shoot({ items: ['room'], views: ['&target=-4.3:1.0:-0.8&d=9.2&el=30&az=29'], size: [1600, 900], outDir: tmp, name: () => 'dining.png' });
await sharp(dining[0]).jpeg({ quality: 84, mozjpeg: true }).toFile(path.join(out, 'dining.jpg'));
console.log('→ docs/previews/dining.jpg');

let n = 0;
const seq = (prefix) => () => `${prefix}_${n++}.png`;
const normals = await shoot({ items: ['sofa'], views: ['close', '&dist=0.55&el=24&flat=1', '&dist=0.55&el=24&wire=1'], size: [800, 600], outDir: tmp, name: seq('n') });
await grid(normals, 3, [600, 450], path.join(out, 'normals.jpg'));

const ao = await shoot({ items: ['armchair'], views: ['close', '&dist=0.55&el=24&ao=0'], size: [800, 600], outDir: tmp, name: seq('a') });
await grid(ao, 2, [600, 450], path.join(out, 'ao.jpg'));

await fs.rm(tmp, { recursive: true, force: true });
