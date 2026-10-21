# 参数出处标签

`params/chariot.json` 里每个数值都带 `conf` 和 `src`：

- `conf`：`doc` 文献明文；`commentary` 汉唐注疏按原文推算出的数（鄭玄、賈公彥）；`measured` 出土物或现存实物的发表测量值，按轮径折算；`recon` 近现代学者的复原或推定；`est` 本项目推断；`eyeballed` 从照片或画上估读；`design` 本项目自定。
- `src`：下表的标签。完整书目见 [`research/sources/bibliography.md`](../research/sources/bibliography.md)。

新加标签时，要同时在这里加一行。`tests/lessons.test.js` 会检查 params 里的每个标签都在本表里。

| 标签 | 出处 | 用在哪些参数 | 说明 |
|---|---|---|---|
| `songshi149` | 《宋史》卷一百四十九 志第一百二 舆服一·指南车（元 脱脱等撰，1345）。原文：[`research/sources/songshi-149-zhinanche.txt`](../research/sources/songshi-149-zhinanche.txt)，录自维基文库 | `song.wheelDiameter`、`footGearTeeth`、`footGearDiameter`、`smallFlatTeeth`、`smallFlatDiameter`、`bigFlatTeeth`、`bigFlatDiameter`、`poleRollerDiameter`、`centralShaftHeight`、`centralShaftDiameter`（燕肃 1027 年造法）；`body.poleLength`（借用吴德仁 1107 年造法的「車轅一丈五寸」） | 一手史料，数字已和原文逐条核对。原文**没有**轮距 |
| `needham-via-enwiki` | J. Needham, *Science and Civilisation in China*, Vol. 4 Pt. 2 (1965) 对燕肃车的分析：齿数比只有在轮距等于轮径时才对。经英文维基 *South-pointing chariot* 条转引，原书未读 | `song.track` | 这是推理得到的条件，不是记载，所以 `conf` 是 `design` |
| `lanchester-condition` | 差动式指南车的指南条件：车轮到差速器两侧的传动比 = 轮径 ÷ 轮距。差动方案由 G. Lanchester（1947）提出；这个条件是本项目自己推导的，并由 `tests/sim/chariot.test.js` 做数值验证（推导见 `research/REPORT.md` §2） | `differential.inputRatio` | 本项目取轮径 = 轮距，所以传动比是 1 |
| `song-chi` | 宋尺的长度。常见的估计在 30.7–31.6 cm 之间（据宋代尺实物的测量，经中文维基「尺」等条转引，一手文献未核对） | `units.chiInMeters` | 取 0.31 m，只用于界面上把「尺」换算成「米」，不影响机构 |
| `this-project` | 本项目自定，没有文献依据 | `differential.wheelDiameter`、`differential.track`、`sideGearTeeth`、`pinionTeeth`；`body.length`、`body.widthBetweenWheels` | 差动式取和燕肃车相同的车轮与轮距，便于对比；车身尺寸只为好看、好读 |
| `kaogongji` | 《周禮·冬官考工記》轮人、舆人、辀人、车人，附鄭玄注、賈公彥疏（《周禮註疏》卷三十九、四十）；北宋聶崇義《三禮圖集注》卷九照录同一套数。原文与注疏取自维基文库（公有领域），要点整理在 [`research/cad-level/REPORT.md`](../research/cad-level/REPORT.md) §1A | `wheel.spokes`、`felloeTreadWidth`、`spokeStockWidth`、`spokeStockWidthOuter`、`spokeStockFraction`、`dish`、`hubDiameterMax`、`boreInner`、`boreOuter`、`axleDiameter`、`sillSize`；`body.poleDiameterRear`、`poleDiameterNeck`、`crossbarLength`、`crossbarDiameter` | 周制。经文只给比例，寸数是鄭玄按 6.6 尺之轮算的；本项目按轮径折算到 6 尺。宋代礼仪车在理论上以它为准（政和礼制局改辂引《考工记》），但宋代文献对辐数、毂、牙一字未提 |
| `qin-bronze-chariot` | 袁仲一、程学华《秦陵二号铜车马》清理报告（1983）全文，1:2 铜车逐件实测；秦俑坑木车（袁仲一）作对照 | `wheel.felloeHeight`、`felloeInnerWidth`、`felloeMidWidth`、`spokeStockThick`、`hubDiameterInner`、`hubDiameterOuter`、`hubRidges`、`capLength`、`capDiameterBig`、`capDiameterSmall`、`linchpinLength/Width/Thick`、`futuLength/Height/Width`；`body.poleRise` | 秦制，比宋早 1200 年；用它是因为宋代没有任何车辆实物。数值按轮径比例折算（×D），见 REPORT §1B |
| `yingzao-fashi` | 李诫《營造法式》卷十一 转轮经藏（1103） | `gear.shaftPointLength`、`gear.shaftCollar` | 宋代官式小木作：立轴「上用鐵鐧釧，下用鐵鵝台桶子」；外辋 0.07 D 也作牙高的旁证 |
| `hommel1937` | R. P. Hommel, *China at Work* (1937) pp. 48–53, figs. 75–78：浙江一件 7 英尺硬木齿轮和卧轴的实测与照片 | `gear.toothRootWidth`、`toothTenon`、`bigSpokes`、`shaftSquare` | 中国大型木齿轮的实物记录：径向方截面块齿、齿榫穿透轮辋、4 根通辐、轴削方套轮。照片版权未核，图不入库，只有文字 |
| `lubu-scroll` | 《大驾卤簿图书》（元曾巽申摹北宋本，国家博物馆藏；Wikimedia Commons 公有领域全卷图）里的指南车 | `wheel.colour`、`body.boxBottom`、`body.boxTop` | 唯一的宋代指南车图像：红色高箱罩住车轮上半圈、重台、勾阑、仙人、四角香囊。图只有约 900 px 高，比例只能粗估 |
| `cad-report` | 本项目的整车考据报告 [`research/cad-level/REPORT.md`](../research/cad-level/REPORT.md)（2026-10-21）及其分项笔记：综合考工记、出土实测、宋代辂车制度、木齿轮工艺和现代复原品后给出的推荐值 | `gear.toothThick`、`toothThickSmall`、`toothAddendum`、`rimWidthBig`、`rimWidthFoot`、`discThickSmall`、`footSpokes`；`wheel.felloeSegments`、`spokeShankDiameter`、`hubLength` | 凡标这个标签的都是在几条证据之间取的折中值，报告 §6 写了取法，§7 写了仍是空白的地方 |
| `physics-check` | 本项目的离线刚体物理验证 [`research/physics/REPORT.md`](../research/physics/REPORT.md)（2026-10-21）：两种机构的齿轮在 MuJoCo 里做成实体方块齿，沿网页的路线驱动，扫摩擦、齿隙、倒角、屋脊齿和压紧方式 | `gear.toothRoofAngle`、`toothTipChamfer` | 不是文献，是在本项目这套几何上试出来的改法（REPORT §5.4、§7）；只试过这一套齿形，木材变形和磨损没有建模 |
