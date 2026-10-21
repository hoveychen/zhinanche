# 许可与署名

## 本项目自己的作品

| 内容 | 许可 |
|---|---|
| 代码：JavaScript、Python、构建与配置文件 | **Apache-2.0**（根目录 [`LICENSE`](../LICENSE)） |
| 内容：课件文字（`js/teach/lessons.js`）、3D 模型（`assets/*.glb`）、参数（`params/`）、调研笔记、文档 | **CC BY-SA 4.0** |

仓库遵循 [REUSE](https://reuse.software) 规范。[`REUSE.toml`](../REUSE.toml) 写了上面的默认规则，并逐文件列出所有第三方材料；许可证全文放在 [`LICENSES/`](../LICENSES)。检查命令：

```sh
uvx reuse lint      # 或者 pip install reuse && reuse lint
```

`lessons.js` 和 `params/chariot.json` 虽然是 JS 和 JSON，但写的是内容，所以单独标成 CC BY-SA 4.0。`assets/*.glb` 由 `blender/scripts/` 里的脚本生成，也算内容。

## 第三方材料

| 路径 | 作者 | 许可 | 来源 |
|---|---|---|---|
| `vendor/three/**` | three.js authors | MIT（`vendor/three/LICENSE`） | npm 包 `three@0.186.1`，用 `pnpm vendor` 原样复制 |
| `vendor/tabler-icons/**` | Paweł Kuna（Tabler Icons） | MIT（`vendor/tabler-icons/LICENSE`） | npm 包 `@tabler/icons@3.49.0`（outline 线性图标），`pnpm vendor` 只取页面用到的二十来个图标的 SVG 路径，写成 `icons.js` |
| `images/lessons/sancai-tuhui.jpg` | 王圻、王思义编《三才图会》（明，1609） | 公有领域（`LicenseRef-PublicDomain`） | [Commons: 指南車圖 (三才圖會).jpg](https://commons.wikimedia.org/wiki/File:%E6%8C%87%E5%8D%97%E8%BB%8A%E5%9C%96_(%E4%B8%89%E6%89%8D%E5%9C%96%E6%9C%83).jpg)。Commons 元数据把作者写作「王沂」 |
| `images/lessons/science-museum-model.jpg` | Andy Dingley（2008 年摄） | CC BY 3.0 | [Commons: South-pointing chariot (Science Museum model).jpg](https://commons.wikimedia.org/wiki/File:South-pointing_chariot_(Science_Museum_model).jpg)，缩小到 1200 px 宽 |
| `images/lessons/taiwan-museum-gears.jpg` | SSR2000（2014 年摄） | CC BY-SA 3.0（Commons 上是 GFDL 与 CC BY-SA 3.0 双许可，本项目按后者使用） | [Commons: Gears of South-pointing chariot Model in National Museum of Natural Science, Taiwan.JPG](https://commons.wikimedia.org/wiki/File:Gears_of_South-pointing_chariot_Model_in_National_Museum_of_Natural_Science,_Taiwan.JPG)，缩小到 1200 px 高 |
| `assets/photo/*.webp` | Poly Haven：Greg Zaal、Jarod Guest（天空）；Rob Tuytel（地砖）；Amal Kumar（墙、瓦）；Dimitrios Savva、Dario Barresi、Rico Cilliers（木） | CC0 1.0 | [polyhaven.com](https://polyhaven.com)，素材 id 与页面见 `tools/assets/sources.json`；`pnpm assets`（`tools/assets/build_photo.py`）下载、裁小、重新压成 webp。许可于 2026-10-21 在 https://polyhaven.com/license 核对 |
| `research/sources/songshi-149-zhinanche.txt`、`early-records.txt` | 《宋史》《宋书》《南齐书》 | 公有领域 | 维基文库 |

三张图片的作者和许可已于 2026-10-20 用 Commons API（`action=query&prop=imageinfo&iiprop=extmetadata`）核实。课件在每张图下面显示署名（`Picture.credit`）。

## 规则

- **新加第三方文件**：在 `REUSE.toml` 末尾加一条 `precedence = "override"` 的 annotation，写明作者和 SPDX 许可；许可证全文不在 `LICENSES/` 里的，用 `uvx reuse download <SPDX-ID>` 下载。然后跑 `reuse lint`。
- **课件图片**：只用 `images/` 下有 REUSE 条目的文件。`tests/lessons.test.js` 会检查每张课件图片在 `REUSE.toml` 里都有条目。
- **有版权的图纸和插图**（现代论文、书里的图）不复制、不描摹。从中取用的事实和尺寸可以用，但要写出处：`params/` 里每个数都有 `src`，标签含义见 [`sources.md`](sources.md)。
- **只当建模参考的照片**不产生许可义务，但也在书目里写明。
- 课件文字是原创的。引用古书原文时注明出处。
