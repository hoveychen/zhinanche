# 指南车知名现代复原品：车轮、车身、齿轮做法考据笔记

调研日期：2026-10-21。用途：给燕肃 1027 离合式与 Lanchester 差动式两种模式的 CAD 级建模提供造型参考。

类型标记：
- 【文献明文】原始文献，或复原者本人、收藏机构写下的文字
- 【实物实测】博物馆登记的实测数据，或我从照片上数出、看出的东西（注明“照片目测”）
- 【学者复原推定】学者的方案或推算
- 【我的推断】我的判断，未经证实

置信度分高、中、低三档。照片目测的辐数一律写成区间，因为展柜反光、透视和虚焦都会影响计数。

---

## 0. 总览：给建模直接用的结论

| 复原品 | 机构 | 车轮（照片目测） | 车身 | 齿轮做法 | 尺寸 |
|---|---|---|---|---|---|
| 王振铎方案：国博藏，柏林 1954 年件同款，同济藏件同款 | 离合式（定轴轮系） | 约 18–20 根细直辐；轮辋宽，分 5–6 段拼接；短圆柱毂，轴头外露并插辖 | 无盖方箱；独辀前段上弯，辀首兽头，辀前端下有支架；箱中央立一根高柱，柱顶莲座上立木仙人 | 箱内看不到。柏林件从轮辐间隙能看到一圈浅色圆木销齿【推断：这是附足立子轮的销齿】 | 只有柏林件有实测：长 61.5 × 宽 29.5 × 高 52 cm |
| Lanchester（伦敦科学博物馆 1952-275） | 差动式 | 6 根宽扁辐；轮辋 6 段，钉接；毂上有横销 | 木框架；外罩赛璐珞透明罩，罩顶四坡；单根直辕，辕下有铁丝支脚 | 木盘周缘一圈插销齿，中间夹金属小件 | 200 × 255 × 150 mm，0.12 kg（馆方登记） |
| 台中科博馆大木车 | 齿轮组照片显示为差动式 | 约 16–18 根辐；轮辋极宽（径向约为轮径的 1/6），约 6 段；毂为长圆锥 | 格栅栏杆方箱；独辀很长、大弯，辀首龙（凤）头；中央高柱 | 现代金属件：彩漆锥齿差动，细齿直齿轮，另有大三角齿轮 | 查不到 |
| 军博「刘海涛 燕肃指南车」 | 标牌疑似写“差速轮系”，字迹模糊 | 约 18–20 根辐；毂车成多道环棱 | 圆平台；金色人偶；辀端有鸟饰 | 车下可见笼形（灯笼式）销齿轮 | 查不到 |
| 军博「北宋燕肃指南车」（另一件） | 标牌只写“据《宋史》复原” | 约 10–12 根粗辐；宽轮辋；毂端有金属帽 | 无盖方箱；独辀上弯；中央高柱上立童子 | 看不到 | 查不到 |

建模共性【我的推断】：

- **中国大陆和台湾的复原件共用一套外观**：宽轮辋、多辐（约 16–20 根）、独辀、无盖方箱、中央高立柱、木仙人立在莲座上。这套外观源头是王振铎方案。
- **西方 Lanchester 件是示意式外观**：辐少（6 根），外加罩壳。

所有复原者都没有发表过“车轮辐数”或“车厢尺寸”的考据：

- 唯一的史料尺寸是《宋史》的“足轮高六尺”。吴德仁车另有“身一丈一尺一寸五分，阔九尺五寸，深一丈九寸，车轮直径五尺七寸，车辕一丈五寸”。
- Moule 把燕肃车的轮距推为 6 尺，与轮径相等，是从齿数比反推出来的。见第 2 节。

---

## 1. 王振铎（1937 模型，以及为中国历史博物馆即今国博做的复原）

| 结论 | 证据 | 类型 | 置信度 |
|---|---|---|---|
| 1937 年发表《指南车记里鼓车之考证及模制》，在 Moule 方案上改良，并做成模型 | zh.wikipedia「指南车」：“1937年王振鐸曾發表《指南車記里鼓車之考證及模制》，他改良穆爾的設計，並成功的製作出指南車模型”。董焱章等 2022《力学与实践》44 卷 908 页：“1937 年…王振铎…实施了英国人摩尔（Moule AC）的想法，成功复原定轴式指南车” | 文献明文（二手） | 高 |
| 发表刊物为《史学集刊》第 3 期 | 题目给出的线索；李约瑟书目有 "Shih Hsüeh Chi Khan" 条，但我没有亲眼核对到卷期 | 未核实 | 中 |
| 后来为原中国历史博物馆陈列修正方案、重做模型；属**定轴轮系（离合式）**；“中国很多博物馆都采用了王振铎的定轴轮系指南车方案” | 人民日报海外版 2026-04-30，中国科技馆戴逸华原话：https://paper.people.com.cn/rmrbhwb/pc/content/202604/30/content_30154225.html | 文献明文 | 高 |
| 模型现藏中国国家博物馆 | 新浪 2006“古代的记里鼓车和指南车”（“现收藏于中国国家博物馆”）；万百五 2015《系统与控制纵横》：“王振铎…复原而制成了模型…存放在中国历史博物馆”，并称该馆展出过一台电池驱动、在环形轨道上绕圈的指南车演示模型（图 12） | 文献明文 | 高 |
| 李约瑟认为 Moule 与王振铎复原的其实是吴德仁车；评语为 "theoretically feasible, it is mechanically very inelegant… hardly workable"。SCC 4.2 的 Fig.528–530 和 Pl.CCI 是 Moule–王振铎复原图与王振铎模型照片 | archive.org 上 SCC 4.2 文本（子调研转述） | 文献明文 | 中高 |
| 国博展出件外观：无盖木方箱；独辀从箱底伸出后上弯，辀首为兽（鸟）头，辀前端下有方座支架；箱中央立一根细长立柱，柱顶莲花座上立木仙人，伸右臂；两轮 | Commons「Three Kingdoms South-pointing Cart Model (9833363116).jpg」，Gary Todd 摄于 2011，CC0，拍摄地 National Museum: China through the Ages，展区标为三国马钧 | 实物（照片） | 高 |
| 国博件的车轮：约 18–20 根细直辐，靠轮辋一端有台阶状收细【推断：模仿《考工记》辐的“股、骹”之分，或是榫肩】；轮辋很宽（径向约为轮径的 1/6），可见拼缝，【推断：5–6 段】；外缘有一道细线【推断：表示铁箍或轮辋边】；毂为短圆柱，轴头伸出，竖插一根辖 | 同上照片，局部放大目测 | 实物实测（照片目测） | 辐数中，其余中高 |
| 国博件看不到齿轮，箱体封住了机构 | 同上 | 实物（照片） | 高 |
| 王振铎 1971 年复制马钧“黄帝指南车” | 只有 zh.wikipedia 一句，没有出处 | 文献明文（无来源） | 低 |
| **柏林民族学博物馆 I D 46909**：1954 年按“汉代来源”复原，1955 年由中华人民共和国文化部转来；木制；长 61.5 × 宽 29.5 × 高 52 cm。外观与国博件几乎一模一样（同样的方箱、兽首弯辀加支架、莲座高柱木仙人），**可以当作王振铎方案的、有实测尺寸的同款件** | https://id.smb.museum/object/138867 （“Datierung 1954 (Rekonstruktion nach Quellen der Han-Zeit)… Ministerium für Kultur der Volksrepublik China (1955)… Holz… 61,5 x 29,5 x 52 cm”）。照片 CC BY-NC-SA 4.0，Martin Franken 摄 | 实物实测（馆方）；“即王振铎方案”是【我的推断】 | 尺寸高，归属中 |
| 柏林件车轮：辐很细，约 22–28 根，比国博件更密（照片小，计数不可靠）；轮辋宽，约 5–6 段拼接；毂为短圆柱，轴头外露并插辖。从轮辐间隙能看到车身内侧一圈径向的浅色圆木销 | smb-berlin_ID46909_1954.jpg 局部放大 | 实物实测（照片目测） | 低到中 |
| 由此推出整车比例：柏林件高 52 cm 是到木仙人顶；车轮直径约为车箱高的 1.3 倍，轮径约为全长的 1/3【我的推断，照片比例估算，约 ±15%】 | 同上 | 我的推断 | 低 |
| 同济大学博物馆的“汉代指南车”与王振铎方案同款：方箱，这件有盖；兽首弯辀；中央高柱；约 12–16 根辐 | https://museum.tongji.edu.cn/35374/list.htm ；img/museum_tongji_handai_zhinanche.png（许可不明） | 实物（照片） | 中 |
| 王振铎的车舆研究另有专书《东汉车制复原研究》（科学出版社 1997），可能是他指南车车轮、车舆形制的来源 | 国博旧网页王振铎简介（web.archive.org 2017 年快照） | 文献明文；“与指南车有关”是【推断】 | 中 |
| 王振铎复原记里鼓车外观时，依据的是山东孝堂山汉画像石上的鼓吹车；指南车的“汉式”外观【推断】也走同一路数 | 人民日报 2025-07-02，戴逸华 | 文献明文；推断部分为低 | 中 |

---

## 2. A. C. Moule 1924（T'oung Pao 23: 83–98）

| 结论 | 证据 | 类型 | 置信度 |
|---|---|---|---|
| 书目：Moule, "The Chinese South-Pointing Carriage", T'oung Pao 23(1):83–98, 1924，DOI 10.1163/156853224x00103。archive.org 有开放扫描：https://archive.org/details/toungpao2324unse | Crossref；archive.org | 文献明文 | 高 |
| 机构为离合式：小平轮 D “weighted with iron, to drop into gear with (B) and the central wheel (C)”，由辕尾竹索升降；作者自认 "purely conjectural" | 原文 | 学者复原推定 | 高 |
| **尺寸推定**：燕肃车车轮 “6 feet in diameter and 6 feet apart”，即轮径 = 轮距 = 6 尺。这是由 24:12:48 的齿数比加上转弯时一轮不动这一条件反推出来的 | 原文 | 学者复原推定 | 高 |
| 吴德仁车：推得轴长 89 英寸，作者自己怀疑原文是否撑得住这个结论；另附一张齿距校正表 | 原文 | 学者复原推定 | 中高 |
| 图只有俯视示意（Diagram I 在 p.91，燕肃；Diagram II 在 p.93，吴德仁）。车轮 A 只画成一条边线，**没有画辐，也没有车厢**。大平轮 C 和小平轮 D 是**方形或梯形的方齿**，不是尖齿。附在车轮内侧的立子轮 B 画成一排黑色方块，像插在轮面上的销齿或方齿。比例尺标 5/10/20，没写单位，【推断：单位是尺】 | img/moule1924_p91_diagramI_yensu.jpg，我亲自看过 | 实物（图像） | 高 |
| 版权：1924 年出版，美国已进入公有领域；Moule 卒于 1957 年，英国和欧盟要到 2028 年才进入公有领域 | 子调研判断 | 我的推断 | 中高 |
| 张荫麟：《宋燕肃吴德仁指南车造法考》是 Moule 文章的译述，刊于《清华学报》1925 年第 2 卷第 1 期；另一篇《宋卢道隆吴德仁记里鼓车之造法》，SCC 书目记为 1926 年第 2 卷第 2 期 | SCC 书目（子调研） | 文献明文（二手） | 中高 |

---

## 3. George Lanchester 差动式模型（伦敦科学博物馆）

| 结论 | 证据 | 类型 | 置信度 |
|---|---|---|---|
| 馆藏号 **1952-275**，在线号 co55656。分件：/1 为车本体（co8461180），/2 为赛璐珞罩（co8461181） | https://collection.sciencemuseumgroup.org.uk/objects/co55656 ；/objects/co8461180 ；/objects/co8461181 | 文献明文 | 高 |
| 制作者 George H. Lanchester；年代 1945–1952；英国制；捐赠人 Mr G W Lanchester | 同上 | 文献明文 | 高 |
| 材料：“Cellulose & cellulose products, wood (unidentified), metal (unknown)” | 同上 | 文献明文 | 高 |
| 尺寸 **200 mm × 255 mm × 150 mm，0.12 kg**。三条记录给的数字完全一样【推断：都是整件的数】，哪一维对应长、宽、高，馆方没有标注 | 同上 | 实物实测（馆方） | 尺寸高，轴向未知 |
| 描述："A conjectural model of a 'South pointing chariot' operated by differential gearing… showing mechanical device and pointing figure with cellulose cover" | 同上 | 文献明文 | 高 |
| 车轮：**6 根**宽扁木辐；轮辋 6 段，接缝处钉钉；毂较厚，带横销；没有铁箍 | Commons「South-pointing chariot (Science Museum model).jpg」，Andy Dingley 2008 摄，CC BY 3.0。轮辋上用白漆写着馆藏号 “1952-275”，可证就是这一件。SMG 官方图 smg00063710，CC BY-NC-SA 4.0 | 实物实测（照片目测） | 高 |
| 车身：木方框，罩一个透明赛璐珞罩，罩顶为四坡、近似攒尖；单根直辕伸出；木雕人偶立在中轴顶的圆台上。拿掉罩后（SMG 图）可以看到辕下有一根 V 形铁丝支脚 | 同上两张图 | 实物（照片） | 高 |
| 齿轮：木圆盘周缘插一圈短销作齿（插销齿）；两车轮内侧各有一个带销齿的冠轮；中间夹着深色金属小件，【推断：差动器的小齿轮或笼形小轮】 | SMG 图局部放大 | 实物实测（照片目测） | 中 |
| Lanchester 1947 年的讲演单行本 *The Yellow Emperor's South-Pointing Chariot*（China Society，1947-02-03，附 Moule 的按语）。Plate II 的机构图：车轮画成**实心圆盘，无辐**；齿轮是现代细密直齿；车轮内侧有冠轮 A 和 A1；差动器由 C、C1 两个冠轮和装在 E 上的 D、D1 小轮组成，E 固定在立柱 F 上 | https://archive.org/details/TheYellowEmperorsSouth-pointingChariot ；img/lanchester1947_plateII_diff-gear.jpg（archive.org 标为 PD Mark；Lanchester 卒于 1970 年，英国版权未到期，许可存疑） | 学者复原推定 | 高 |
| 李约瑟对 Lanchester 方案的评价是 “simpler as well as more practical and elegant”。Pl.CCII 是这件模型的照片，图注写 “Only one idling wheel was fitted” | SCC 4.2 p.296–299（子调研） | 文献明文 | 中高 |
| 董焱章 2022 年的论文说 Lanchester 件“大英博物馆陈列”，这是**错的**，实际在科学博物馆 | 对照 SMG 藏品页 | 我的判断 | 高 |
| 剑桥李约瑟研究所档案里另有一件 “Model reconstruction of a 'South Pointing Chariot', c.1950s–1970s”：木和塑料，27 × 12 × 30 cm，制作者不明。同档另有一个模型盒，是 1993 年北京 Liu Haizhou 赠送的 | archivesearch.lib.cam.ac.uk 503123、503124 的搜索摘要；页面本身 403，没有打开 | 文献明文（摘要） | 中 |

---

## 4. 台湾国立自然科学博物馆（台中，中国科学厅）

| 结论 | 证据 | 类型 | 置信度 |
|---|---|---|---|
| 大型木制展件，说明牌题为「指南車 Southern-Pointed Cart」，正文看不清 | Commons「South-pointing chariot in the National Museum of Natural Science 20241024.jpg」，阿道摄，CC BY-SA 4.0 | 实物（照片） | 高 |
| 外观：方箱四周为格栅栏杆，不封顶；独辀很长，从箱底水平伸出后大幅上弯，辀首为龙（凤）头，前端用立柱支住；箱中央一根很高的圆柱，柱顶球座上立木仙人。【推断：这是按《宋史》“一辕，凤首”做的】 | 同上 | 实物（照片） | 高 |
| 车轮：约 16–18 根直辐；轮辋极宽，径向约为轮径的 1/6，可见约 6 段拼缝；毂为长圆锥形，轴头伸出 | 同上，局部放大 | 实物实测（照片目测） | 辐数中，其余中高 |
| 齿轮组照片显示为**差动式**，全是现代金属件：一对相向的冠形或锥形齿轮，齿上漆成红、绿、白三角，中间夹一个行星小齿轮；上下各有细齿直齿轮；底部还有一个大三角齿（近似尖齿）的金属齿轮 | Commons「Gears of South-pointing chariot Model in National Museum of Natural Science, Taiwan.JPG」，SSR2000 摄于 2014，CC BY-SA 3.0，图说“國立自然科學博物館復原的指南車齒輪組” | 实物实测（照片目测） | 中高 |
| 这组金属齿轮是否装在那辆大木车里面，查不到。有搜索摘要称科博馆馆刊说大木车是“依宋代燕肃结构”复原，但原文网站连不上，和照片里的差动齿轮对不上 | libknowledge.nmns.edu.tw（TLS 握手失败） | 未证实 | 低 |
| 设计者、年代、尺寸 | 查不到 | — | — |

---

## 5. 颜鸿森（成功大学）

| 结论 | 证据 | 类型 | 置信度 |
|---|---|---|---|
| 《Reconstruction Designs of Lost Ancient Chinese Machinery》(Springer 2007) 中指南车是**第 7 章**，不是第 9 章：“South-pointing Chariots”，pp.199–268，DOI 10.1007/978-1-4020-6460-9_7。小节为 7.1 古文献，7.4 拓扑构造，7.6 复原设计，7.7–7.9 差动式（四构件、五构件齿轮系、绳/滑轮/摩擦轮），7.10–7.12 定轴式 | Crossref；e-bookshelf 试读目录 https://content.e-bookshelf.de/media/reading/L-4443-a286c64765.pdf | 文献明文 | 高 |
| 构型数量取自同作者的论文：差动式四杆 8 种，五杆齿轮系 18 种（其中几种对应 Lanchester、卢志明、颜志仁、杨、谢龙昌各家方案），绳轮/摩擦轮式 4 种；定轴式四杆单自由度含绳轮的有 6 种 specialized chains，其中一种是王振铎方案。书中是否沿用这些数字，我没读到正文 | Yan & Chen 2006, JSME Int. J. C 49(3):920–929, DOI 10.1299/jsmec.49.920；会议稿 https://www.seismoscope.allshookup.org/reconstruction-synthesis.pdf | 论文数字为文献明文；书中数字为推断 | 论文高，书中中 |
| 他的工作是拓扑综合（topological synthesis），**没有**给车轮直径、辐数、车厢尺寸，也没有讨论齿形 | 同上两篇 | 文献明文（确认没有） | 高 |
| 另有 Yan & Chen 2007, Trans. CSME 31(3):255–272（定轴式），DOI 10.1139/tcsme-2007-0017，付费墙，没读到 | Crossref | 文献明文 | 高 |
| 团队做过一台差动式样机：金属车体，铝圆盘轮外套黑色 O 形胶圈，钢制直齿锥齿轮差动，前面一个万向小轮。是实验室演示件，不是仿古车 | 会议稿 Fig.4（版权不明，没下载） | 照片判读，属推断 | 中 |
| 成功大学博物馆是否藏有指南车模型：查不到。馆藏检索系统本身失效，所以不能当作“没有”的证据 | collections.culture.tw | — | — |
| 容易混淆：JSME 论文里的 “Yan's design” 指**颜志仁**（上海机械学院，1984），不是颜鸿森 | JSME 论文参考文献 (12) | 文献明文 | 高 |

---

## 6. 其他博物馆、日本复原与李约瑟书中图版

| 结论 | 证据 | 类型 | 置信度 |
|---|---|---|---|
| **中国科技馆**「华夏之光」展厅：2017 年以前展的是定轴轮系木模，因车体安装误差和车轮打滑，时间长了会偏；2017 年后换成“现代差动轮系结构”的**金属**指南车，车厢透明，观众可手拉。尺寸没有公布 | 人民日报海外版 2026-04-30，戴逸华 | 文献明文 | 高 |
| **军事博物馆**「宋 燕肃指南车」，海军某部工程师刘海涛据《宋史》复原。标牌后半句似为“其关键构件……差速……”，太模糊。外观：约 18–20 根辐；毂车成多道环棱，轴头有销；圆形平台；铜金色人偶举臂；辀端立一只金鸟。车下可见笼形（灯笼）销齿轮，由一圈竖向圆木销组成 | Commons「South-pointing Chariot Model (9883195115).jpg」，Gary Todd 2008，CC0；标牌放大后目测 | 实物（照片） | 外观高，机构低 |
| **军事博物馆**另一件「北宋燕肃指南车」（与上件不是同一件）：无盖方箱；独辀上弯，前端有支架；中央高柱上立童子；约 10–12 根粗辐，宽轮辋，毂端有金属帽。标牌写“此为据《宋史》记载复原制作的北宋燕肃指南车” | Commons「Northern Song South-Pointing Cart (9872756995).jpg」（标牌）和「…Model (9872757634).jpg」，Gary Todd 2008，CC0 | 实物（照片） | 高 |
| **同济大学 / 陆敬严**：1982 年在同济成立“中国古代机械研制室”，帮军博、中国科技馆等单位复原古代发明；百余件模型后来由宇达集团接收，在山西运城夏县建了中国古代科技馆。著作《中国古代机械复原研究》（上海科学技术出版社 2019，ISBN 9787547842447），指南车在第八章第一节 pp.369–383，分“定轴轮系”“差动轮系”两节；另有《八十年来指南车的研究》（《自然辩证法通讯》1984, 6(1):53–58）。他本人模型的尺寸和齿形查不到 | 张柏春书评 https://m.thepaper.cn/baijiahao_26050367 ；豆瓣 https://book.douban.com/subject/34779382/ | 文献明文 | 高 |
| 军博两件中是否有一件出自陆敬严 | 未证实，只是因为他“帮助军博复原”而产生的联想 | 我的推断 | 低 |
| **新郑轩辕故里**：开放框架，齿轮外露；车架立柱是车床车出的细柱；可见一根黄色细绳【推断：辕尾拉索，即离合式】；水平大平轮；黑色弯辀；约 8 根宽扁辐；毂为黑色大圆筒，轴头有铜帽；金色方脸人偶。来历和尺寸查不到 | Commons「20241011 South-pointing chariot at the Temple of Xuanyuan Hometown.jpg」，Windmemories，CC BY-SA 4.0 | 实物（照片） | 中 |
| **迪拜 Ibn Battuta Mall**（商场装饰件，不是学术复原）：木制；直辕，辕首为铜龙头；**插销齿**做法很清楚，水平木盘上下面插圆木销作齿（冠轮式），竖盘周缘钻孔插销；粗辐，4–6 根 | Commons「South-pointing chariot, China Court, Ibn Battuta Mall, Dubai.jpg」，Nemravik，CC BY-SA 4.0 | 实物（照片） | 高 |
| **户外铜雕**（地点不明，2012 年摄）：格栅方箱，约 20 根辐，轮辋外圈一圈铆钉，长弯辀，高柱；同一画面里有司南雕塑。是雕塑，没有机构 | Commons「指南車 - panoramio.jpg」，ping lin，CC BY-SA 3.0 | 实物（照片） | 中 |
| **2005 爱知世博**：不是中国馆，是爱知县馆（長久手）的机关人偶“唐子指南车”，九代目玉屋庄兵卫作；12 根辐，红漆加金饰。和学术复原无关 | Commons「The Chinese-children instruction vehicle of Expo 2005 Aichi Japan.jpg」；odts.de 转引 Nipponia | 文献明文 | 中高 |
| **日本学术复原**：两角宗晴、岸佐年 1990，日本机械学会论文集 C 56(522)，锥齿轮差动，DOI 10.1299/kikaic.56.462；同年续报 DOI 10.1299/kikaic.56.1542。石田正治 2000，DOI 10.1299/jsmemecjm.2000.5.0_325。白井靖幸 2000《指南車とその寸法》，DOI 10.1299/jsmekanto.2000.6.109，差动式，考证了历代尺长。**1960 年代的日本复原查不到** | J-STAGE DOI（子调研） | 文献明文 | 中 |
| **李约瑟 SCC 4.2（1965）图版**：Fig.527《三才图会》仙人像；Fig.528–529 Moule–王振铎复原（后视、平面）；Fig.530 / Pl.CCI 王振铎模型照片；Fig.531 Moule 的吴德仁方案；Fig.533 Lanchester 方案后视；Fig.534 / Pl.CCII Lanchester 模型；Fig.535 / Pl.CCIII 动作照片。图属剑桥大学出版社版权，没有下载 | archive.org 文本（子调研） | 文献明文 | 中高 |
| **柏林**的件见第 1 节 | — | — | — |

---

## 7. 邮票

| 结论 | 证据 | 类型 | 置信度 |
|---|---|---|---|
| **1953 年特 7 上没有指南车**。特 7「伟大的祖国—古代发明」1953-12-01 发行，4 枚：司南、地动仪、记里鼓车、浑仪。设计孙传哲、夏中汉。原先以为的“指南车”其实是司南 | http://ypw.apple886.com/tzt/s007.htm ；伦敦科学博物馆藏品 co54056 记录的也是这 4 个主题 | 文献明文 | 高 |
| 特 7 里的**记里鼓车**票可作为王振铎记里鼓车外观的旁证，但不是指南车。票面扫描没找到，所以记里鼓车的辐数等细节无从目测 | 同上 | 推断 | 中 |
| 中国大陆、台湾的指南车专题邮票：都没找到。大陆纪特邮票名录里没有；台湾邮票库检索“指南車”为 0 条 | zh.wikipedia 纪特邮票列表；post.gov.tw | 文献明文 | 中 |

---

## 8. 学术复原论文：谁给过辐数、车厢尺寸、齿形？

| 结论 | 证据 | 类型 | 置信度 |
|---|---|---|---|
| **没有任何一家给出“车轮辐数”的考据**。Moule、王振铎（就所见二手材料而言）、Lanchester、颜鸿森、Sleeswyk、Santander 讨论的都是机构 | 第 1–5 节 | 文献明文（确认没有）；王振铎原文未见 | 中高 |
| 尺寸只在以下三处出现：<br>（1）Moule：燕肃车轮距 = 轮径 = 6 尺；<br>（2）鲍思贺推测图：前视图标“6尺”两处，即轮径与轮距，立轴“高8尺径3寸”，取自《宋史》，见万百五 2015 图 10、11；<br>（3）现代教学样机：董焱章 2022 取 D = L = 450 mm，轮厚 30 mm | Moule 1924；万百五 2015 https://tcct.amss.ac.cn/sc-journal/2015/201501/20150144.pdf ；董焱章 2022 https://lxsj.cstam.org.cn/cn/article/pdf/preview/10.6052/1000-0879-22-071.pdf | 学者复原推定 | 高 |
| **齿形**：<br>Moule 图为方齿、梯形齿；<br>鲍思贺的俯视图（万百五图 11）画的是圆弧形齿，近似渐开线外观；<br>Lanchester 讲演图为现代细直齿，但他的实物模型是木盘插销齿；<br>科博馆、中国科技馆 2017 版、颜鸿森样机都是现代金属齿（锥齿、直齿）；<br>军博刘海涛件、迪拜件是插销齿或笼形齿 | 各节 | 图像观察 | 中高 |
| 鲍思贺方案的现存出处是刘仙洲《中国机械工程发明史》第一编（1962）p.102，由 SCC 4.2 p.295 注 b 转引。李约瑟把它挂在吴德仁车下，万百五说是燕肃车，两说矛盾。刘仙洲有没有自己的方案、图上有没有尺寸：查不到 | SCC 转引（子调研）；万百五 2015 | 文献明文（二手） | 中 |
| 颜志仁 1984《中国古代指南车的原理和构造》（《上海机械学院学报》1984(3):31–40）：差动式，把控制部分接到差动器的星轴上，做了模型（万百五图 7、8），尺寸查不到 | 万百五 2015 | 学者复原推定 | 中高 |
| Sleeswyk 1977, "Reconstruction of the South-Pointing Chariots of the Northern Sung Dynasty…", *Chinese Science* 2:4–36，DOI 10.1163/26669323-00201002。燕肃车用擒纵杆（escapement lever）同步两个齿轮；吴德仁车用两套差动，按车厢宽度选定轮距；他认为 Lanchester 方案不符合燕肃原文。齿形查不到 | Crossref；摘要转述 http://www.odts.de/southptr/sleeswyk/index.htm | 学者复原推定 | 中 |
| Santander 1992, Am. J. Phys. 60(9):782–787：从几何上讲差动指南车做的是平行移动（parallel transport），不涉及造型尺寸。差动型的条件与轮距、轮径之比有关 | DOI 10.1119/1.17059；arXiv 0906.0288 | 文献明文 | 高 |
| 王明献 2006，昆山科大硕士论文《指南車分析與設計》：用颜氏方法得到 8 种五杆行星轮系新构型，并推导轮半径、轴距与轮系值的关系 | https://www.airitilibrary.com/Article/Detail/U0025-0306200810421339 | 文献明文 | 高 |
| 【我的推断：对本项目的含义】燕肃模式要让“足轮 6 尺、立子轮 24 齿、小平轮 12 齿、大平轮 48 齿”在转弯时一轮不动的情况下指南，**轮距就得等于轮径（6 尺）**，这是 Moule 的推定。车厢外宽应略大于 6 尺加两侧轮毂的长度。也可以参照吴德仁车的“阔九尺五寸”，但那是另一辆车，轮径也不同（5.7 尺） | Moule 1924；《宋史·舆服志》 | 我的推断 | 中 |

---

## 9. 图片清单

图片都在 `/tmp/zhinanche-polish/cad-research/img/`。

| 文件 | 来源 | 许可 / 作者 | 内容；能否看清车轮、齿轮 |
|---|---|---|---|
| commons_garytodd_national-museum-china_majun_2011.jpg | Commons「Three Kingdoms South-pointing Cart Model (9833363116).jpg」 | CC0，Gary Todd | **国博王振铎方案件**，侧面全貌。车轮约 18–20 辐，宽轮辋分段拼接，短毂插辖，看得很清楚；齿轮看不到。**车轮造型首选参考** |
| smb-berlin_ID46909_1954.jpg | https://id.smb.museum/object/138867 | CC BY-NC-SA 4.0，SMB / Martin Franken | 柏林 1954 年同款件，3/4 视角，有实测尺寸。细辐很密，轮内可见销齿 |
| commons_sciencemuseum_lanchester.jpg | Commons「South-pointing chariot (Science Museum model).jpg」 | CC BY 3.0，Andy Dingley | Lanchester 件带罩。6 辐清楚，轮辋拼段钉接；隔着透明罩能看到齿轮 |
| smg_1952-275_medium_smg00063710.jpg | SMG 藏品页 | CC BY-NC-SA 4.0，Science Museum Group | Lanchester 件去罩，插销齿木盘可见。**差动模式首选参考** |
| commons_nmns-taiwan_2024.jpg | Commons「South-pointing chariot in the National Museum of Natural Science 20241024.jpg」 | CC BY-SA 4.0，阿道 | 科博馆大木车全貌。约 16–18 辐，极宽轮辋，长弯凤（龙）首辀，格栅箱 |
| commons_nmns-taiwan_gears.jpg | Commons「Gears of South-pointing chariot Model in National Museum of Natural Science, Taiwan.JPG」 | CC BY-SA 3.0，SSR2000 | 金属差动锥齿、细直齿、三角大齿，看得很清楚 |
| commons_military-museum_liuhaitao_yansu.jpg | Commons「South-pointing Chariot Model (9883195115).jpg」 | CC0，Gary Todd | 军博刘海涛件。约 18–20 辐，环棱毂，车下有笼形销齿轮 |
| commons_garytodd_military-museum_northernsong_a.jpg / _b.jpg | Commons「Northern Song South-Pointing Cart (9872756995).jpg」和「…Model (9872757634).jpg」 | CC0，Gary Todd | 军博另一件（a 是标牌，b 是正面）。约 10–12 粗辐，宽轮辋 |
| commons_xuanyuan-temple_2024.jpg | Commons「20241011 South-pointing chariot at the Temple of Xuanyuan Hometown.jpg」 | CC BY-SA 4.0，Windmemories | 机构外露，有拉绳，水平大平轮；约 8 宽辐；铜帽大毂 |
| commons_ibn-battuta-mall_dubai.jpg | Commons「South-pointing chariot, China Court, Ibn Battuta Mall, Dubai.jpg」 | CC BY-SA 4.0，Nemravik | **插销齿的最佳特写**（木盘插圆销）。商场装饰件 |
| commons_panoramio_pinglin_2012.jpg | Commons「指南車 - panoramio.jpg」 | CC BY-SA 3.0，ping lin | 铜雕。约 20 辐，轮辋一圈铆钉，格栅箱 |
| commons_expo2005-aichi.jpg | Commons「The Chinese-children instruction vehicle of Expo 2005 Aichi Japan.jpg」 | CC BY-SA 3.0 | 日本机关人偶车，12 辐。仅作对照 |
| moule1924_p91_diagramI_yensu.jpg / moule1924_p93_diagramII_wuderen.jpg | archive.org toungpao2324unse | 美国公有领域；英国和欧盟 2028 年才公有 | Moule 俯视机构图。方齿，没有画辐 |
| lanchester1947_plateII_diff-gear.jpg | archive.org TheYellowEmperorsSouth-pointingChariot | 上传方标 PD Mark，英国版权存疑 | Lanchester 机构图。实心轮，现代直齿，冠轮差动 |
| museum_tongji_handai_zhinanche.png | https://museum.tongji.edu.cn/35374/list.htm | 许可不明 | 同济“汉代指南车”，王振铎同款。约 12–16 辐 |

Commons 分类「South-pointing chariot」里另有几张，没有下载：

- 「Nihongi by Aston volume 2 djvu 265.jpg」：书页
- 「Nordenskiöld 1897 Figure 15 Magnetic car Page058.jpg」：公有领域，日本类书里的指南车图
- 「指南車圖 (三才圖會).jpg」：公有领域
- 「Imperial Encyclopaedia - Manufacture - pic0257 - 指南車圖.png」：公有领域，《古今图书集成》
- 「微型指南車路徑.jpg」：几何示意图

前三张古图属于古代图像，不是现代复原品，可作外观旁证。

---

## 10. 查过但没查到的

- 王振铎 1937 年论文原文（《史学集刊》卷期没有亲眼核对），以及他给模型定的比例、车轮辐数、车厢尺寸。《科技考古论丛》（1989）、《东汉车制复原研究》（1997）没有电子版。
- 国博指南车的馆藏号、实测尺寸和材质（国博藏品检索没找到条目）。
- 1971 年“马钧/黄帝指南车”复制件的出处（只有 zh.wikipedia 一句）。
- 科博馆大木车的设计者、年代、尺寸，以及那组金属差动齿轮是不是装在这辆车里（馆刊原文连不上）。
- 颜鸿森书第 7 章的正文和 Springer 摘要；成功大学馆藏指南车。
- Sleeswyk 1977 和 Santander 1992 的全文；Moule 文的 JSTOR 链接（被拦）。
- 刘仙洲 1962 年书里的复原图和尺寸；鲍思贺方案的原始发表处；陆敬严 1984 文的正文和他的模型数据。
- 南京博物院、河南博物院、北京古代建筑博物馆是否有指南车展品。
- 1960 年代或更早的日本指南车复原；田中久重是否做过指南车。
- 指南车题材的邮票（大陆、台湾都没找到；1953 年特 7 上是司南，不是指南车）。
- 剑桥李约瑟研究所那件 27 × 12 × 30 cm 模型的制作者，档案页面 403。
- 军博刘海涛件标牌后半句（照片太糊）；军博两件、轩辕故里件的尺寸和来历。
