# 书目

本项目的调研结论见 [`../REPORT.md`](../REPORT.md)，参数标签和出处的对应见 [`docs/sources.md`](../../docs/sources.md)。

每条都标了**读到的程度**：

- **原文**：读过原文，或者原文已存进本目录。
- **转引**：只经别的资料（多是维基百科）读到，没有看原书。
- **书目**：只确认这本书存在，内容没读。

标「待核」的卷期、页码、出版信息是凭转引或记忆写的，引用前要再核一次。

## 一手史料（公有领域）

| 文献 | 内容 | 读到的程度 | 本地 / 链接 |
|---|---|---|---|
| 《宋史》卷 149 志第 102 舆服一（元 脱脱等撰，1343–1345 年修） | 指南车；燕肃（天圣五年，1027）和吴德仁（大观元年，1107）两种造法，有轮径和齿数 | 原文 | [`songshi-149-zhinanche.txt`](songshi-149-zhinanche.txt)；<https://zh.wikisource.org/wiki/宋史/卷149> |
| 《宋书》卷 18 志第 8 礼五（南朝梁 沈约撰） | 周公、张衡、马钧造车的传说与记载；刘裕于义熙十三年（417）得后秦姚兴的车；祖冲之改造 | 原文 | [`early-records.txt`](early-records.txt)；<https://zh.wikisource.org/wiki/宋書/卷18> |
| 《南齐书》卷 52 列传第 33 文学·祖冲之（南朝梁 萧子显撰） | 姚兴的车「每行，使人於內轉之」；祖冲之「改造銅機」 | 原文 | [`early-records.txt`](early-records.txt)；<https://zh.wikisource.org/wiki/南齊書/卷52> |
| 《三国志》卷 29 裴松之注引傅玄序 | 马钧造指南车 | 转引（REPORT.md） | — |
| 崔豹《古今注》 | 黄帝与蚩尤战于涿鹿、造指南车的传说 | 转引 | — |
| 王圻、王思义《三才图会》（明，1609） | 指南车图 | 图（Wikimedia Commons） | `images/lessons/sancai-tuhui.jpg` |

## 近现代研究

| 文献 | 内容 | 读到的程度 |
|---|---|---|
| A. C. Moule, "The Chinese South-Seeking Chariot", *T'oung Pao* 23 (1924)（卷期待核） | 按宋史复原的离合式指南车 | 转引（中文维基） |
| 王振铎《指南車記里鼓車之考證及模製》，《史学集刊》第 3 期（1937）（刊期待核） | 在 Moule 的基础上改良并制成模型 | 转引。模型类型和现藏地未核实 |
| G. Lanchester, 1947 年讲演；约 1950 年模型，藏伦敦科学博物馆 | 差动齿轮式指南车 | 转引（Needham、英文维基、科学博物馆藏品） |
| J. Needham, *Science and Civilisation in China*, Vol. 4: *Physics and Physical Technology*, Pt. 2: *Mechanical Engineering*, Cambridge University Press (1965)，差动说在 p. 296 一带（页码经转引，待核） | 指南车史料汇编；分析宋史两车为离合式；讨论差动说 | 转引（英文维基） |
| Hong-Sen Yan（颜鸿森）, *Reconstruction Designs of Lost Ancient Chinese Machinery*, Springer (2007)（出版信息待核） | 用机构综合方法列举定轴式和差动式的多种构型 | 书目 |

## 网络资料

| 资料 | 用途 | 访问日期 |
|---|---|---|
| 英文维基 *South-pointing chariot* <https://en.wikipedia.org/wiki/South-pointing_chariot> | 转引 Needham、Lanchester；差动式误差的例子（轮距 3 m、两轮径差千分之一，直行 1 km 偏近 20°） | 2026-10-20 |
| 中文维基「指南车」 <https://zh.wikipedia.org/wiki/指南车> | 转引 Moule、王振铎 | 2026-10-20 |
| Wikimedia Commons，三张课件图片的文件页（作者、许可经 API 核实，见 `REUSE.toml`） | 课件插图 | 2026-10-20 |

## 推断（本项目自己做的）

- 燕肃车的指南条件「轮距 = 轮径」，以及「只在内侧车轮停住时准」：自己推导，`tests/sim/chariot.test.js` 做数值验证。和 Needham 的结论一致（转引）。
- 差动式的传动比条件「车轮到侧轮 = 轮径 ÷ 轮距」：自己推导并验证。
