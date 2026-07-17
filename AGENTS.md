# 中国象棋人机对战（xiangqi）

## 项目说明
- Web 版中国象棋，人机对战
- 纯前端：HTML + CSS + 原生 JavaScript + Canvas + Web Worker
- AI 引擎运行在 Web Worker 独立线程，UI 永不卡顿
- 零依赖，直接打开 `index.html` 或 `python3 -m http.server` 运行

## 文件结构
- `index.html` — 页面入口
- `css/style.css` — 样式
- `js/chess.js` — 规则引擎（棋盘、走法生成、合法性判定、将死困毙）
- `js/engine-worker.js` — AI 引擎 Worker（搜索+评估+开局库）
- `js/ui.js` — Canvas 绘制、坐标转换、中文记谱
- `js/main.js` — 游戏状态、事件绑定、摆子、悔棋、Worker通信
- `js/ai.js` — AI 旧版（已不使用，保留备份）

## AI 架构（Worker 线程）

### 搜索算法
- Negamax + Alpha-Beta + PVS
- 迭代加深 + Aspiration Windows
- 置换表（512K 条目，64-bit Zobrist Hash）
- 静态搜索 Quiescence Search + Delta/SEE 剪枝
- SEE（静态交换评估）：准确判断吃子是否划算
- 将军扩展、空着剪枝 Null-Move、Razoring、Futility Pruning
- 杀手表（2 per ply）+ Countermove Heuristic（应手启发）
- MVV-LVA+SEE 吃子排序
- 历史启发 History Heuristic
- Late Move Reductions (LMR)
- 内部迭代加深 IID
- 重复局面检测和惩罚

### 评估函数
- 子力价值（车900/马400/炮450/士200/象200/兵100/将60000）
- 位置价值表 PST（开局/中局/残局三套）
- 流动性（车/炮/马活动范围）
- 将帅安全（士象完整度+被将军惩罚）
- 车控开放线/肋道/沉底车
- 炮位（当头炮、沉底炮）
- 兵形（过河联兵、中心兵、老兵惩罚）
- 马活度（憋马腿检测）
- 残局将帅中心化
- 直接威胁（攻击大子，SEE验证）

### 开局库
- 红方第一步 8 种经典开局
- 应中炮 5 种主流防御（屏风马/顺炮/列炮/挺卒）

## 坐标系
- 行 0-9：0=黑方底线，9=红方底线
- 列 0-8：从左到右
- 棋子：大写红方(K/R/H/C/A/E/P)，小写黑方(k/r/h/c/a/e/p)

## 项目铁律（Iron Rules）

### 优化必须有前后对比数据

任何对 AI 引擎、搜索算法、评估函数、规则引擎的性能优化，**必须**提供优化前后的基准测试对比数据：
- 优化前必须先跑 benchmark 记录 baseline（节点数、NPS（每秒节点数）、搜索深度、固定局面评分一致性、时间）。
- 优化后必须跑同一套 benchmark，给出对比数据（表格或清晰的数字对比）。
- 没有对比数据的优化不允许合入，因为无法证明优化有效，也无法防止 regression。
- Benchmark 脚本位于项目根目录，用 Node.js 可直接运行：`node benchmark.js`

## Rust/WASM 引擎（v4）
- 自 v4 起 AI 引擎实际实现位于 `rust-engine/`，编译为 `js/wasm/engine.wasm`
- `js/engine-worker.js` 是 wasm 薄壳（Worker 消息 API 完全兼容 v3）
- `js/engine-worker.js.jsbak` 保留 v3 JS 实现，用于对拍与回滚
- 修改 AI 引擎请改 `rust-engine/src/*.rs`，然后
  `cd rust-engine && wasm-pack build --release --target no-modules --out-dir ../js/wasm --out-name engine`
- 验证：`node crosscheck.js` + `node benchmark-rust.js`，性能不能低于 baseline（`benchmark-baseline.json`）× 3
