# 参数出处标签

`params/chariot.json` 里每个数值都带 `conf` 和 `src`：

- `conf`：`doc` 表示有文献，`est` 表示估计，`design` 表示本项目自定。
- `src`：下表的标签。完整书目见 [`research/sources/bibliography.md`](../research/sources/bibliography.md)。

新加标签时，要同时在这里加一行。`tests/lessons.test.js` 会检查 params 里的每个标签都在本表里。

| 标签 | 出处 | 用在哪些参数 | 说明 |
|---|---|---|---|
| `songshi149` | 《宋史》卷一百四十九 志第一百二 舆服一·指南车（元 脱脱等撰，1345）。原文：[`research/sources/songshi-149-zhinanche.txt`](../research/sources/songshi-149-zhinanche.txt)，录自维基文库 | `song.wheelDiameter`、`footGearTeeth`、`footGearDiameter`、`smallFlatTeeth`、`smallFlatDiameter`、`bigFlatTeeth`、`bigFlatDiameter`、`poleRollerDiameter`、`centralShaftHeight`、`centralShaftDiameter`（燕肃 1027 年造法）；`body.poleLength`（借用吴德仁 1107 年造法的「車轅一丈五寸」） | 一手史料，数字已和原文逐条核对。原文**没有**轮距 |
| `needham-via-enwiki` | J. Needham, *Science and Civilisation in China*, Vol. 4 Pt. 2 (1965) 对燕肃车的分析：齿数比只有在轮距等于轮径时才对。经英文维基 *South-pointing chariot* 条转引，原书未读 | `song.track` | 这是推理得到的条件，不是记载，所以 `conf` 是 `design` |
| `lanchester-condition` | 差动式指南车的指南条件：车轮到差速器两侧的传动比 = 轮径 ÷ 轮距。差动方案由 G. Lanchester（1947）提出；这个条件是本项目自己推导的，并由 `tests/sim/chariot.test.js` 做数值验证（推导见 `research/REPORT.md` §2） | `differential.inputRatio` | 本项目取轮径 = 轮距，所以传动比是 1 |
| `song-chi` | 宋尺的长度。常见的估计在 30.7–31.6 cm 之间（据宋代尺实物的测量，经中文维基「尺」等条转引，一手文献未核对） | `units.chiInMeters` | 取 0.31 m，只用于界面上把「尺」换算成「米」，不影响机构 |
| `this-project` | 本项目自定，没有文献依据 | `differential.wheelDiameter`、`differential.track`、`sideGearTeeth`、`pinionTeeth`；`body.length`、`body.widthBetweenWheels` | 差动式取和燕肃车相同的车轮与轮距，便于对比；车身尺寸只为好看、好读 |
