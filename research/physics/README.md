# 离线刚体物理验证（research/physics）

两种指南车机构的齿轮做成 MuJoCo 刚体，用实体方块齿接触，沿 js/sim 导出的路线驱动，量物理木人与运动学木人的偏差。结论和全部数字在 [REPORT.md](REPORT.md)，完整表格在 [results-tables.md](results-tables.md)。

一条命令重跑报告里的全部数据和图（需要 `uv` 和 node；10 核约 50 分钟）：

```sh
cd research/physics && \
  mkdir -p /tmp/zhinanche-polish/physics/geom-03d51de /tmp/zhinanche-polish/physics/geom-16a1781 && \
  git archive 03d51de params blender/scripts/lib | tar -x -C /tmp/zhinanche-polish/physics/geom-03d51de && \
  git archive 16a1781 params blender/scripts/lib | tar -x -C /tmp/zhinanche-polish/physics/geom-16a1781 && \
  node export_routes.mjs --root ../.. --out out/routes-cad.json && cp out/routes-cad.json out/routes.json && \
  sh sweeps.sh && sh control-main.sh && \
  uv run --with numpy python summarize.py out/results-cad.json > results-tables.md && \
  uv run --with numpy --with matplotlib python plot.py out/results-cad.json --out figs
```

（`git archive` 要在仓库里执行，`research/physics` 在仓库里，所以没问题。两版的路线相同：js 的传动比没有变，inputRatio=1。）

| 文件 | 作用 |
|---|---|
| `export_routes.mjs` | 从 js/sim 导出 80 条路线：两轮转角、离合、运动学木人角 |
| `model.py` | 读任意一个 checkout 的 `layout.py` 生成 MJCF；`Opts` 可以改齿隙、倒角、屋脊齿、摩擦、压紧方式等 |
| `sim.py` | 给路线配时间、驱动、记录；`metrics()` 计算误差、永久台阶、穿透和入齿统计 |
| `clearance.py` | 静态间距、齿隙扫描、自由间隙 |
| `batch.py` | 多进程跑「路线 × 设定」，数字写进 `out/*.json`，20 Hz 的曲线写进 `out/<结果名>/` |
| `summarize.py` / `plot.py` | 出表、出图 |
| `sweeps.sh` / `control-main.sh` | 报告里的全部跑批：CAD 几何 / 旧几何对照 |

`out/` 不进版本库（路线 75 MB，曲线约 100 MB），按上面的命令可以重新生成。
