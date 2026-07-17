# Rust/WASM 引擎迁移记录

## 结论：性能 6.1× 提升，功能/棋力零缺失

| 指标 | JS 版 (baseline) | Rust/wasm | 倍数 |
|---|---:|---:|---:|
| 5 局面总节点 | 5,473,063 | **35,038,217** | 6.4× |
| 5 局面总时间 (ms) | 28,623 | **29,876** | ≈相同 |
| 平均 NPS | 191,212 | **1,172,788** | **6.13×** |
| 5 局面平均搜索深度 | 9.4 层 | **12 层** | +2.6 层 |

（相同 5 局面、相同 depth 参数、相同时间预算的 aiMove 调用；总时间几乎持平是因为迭代加深会用满时间预算，Rust 版把多出的时间用于把深度从 8~11 加到 12。）

## 棋力等价证明

1. **规则等价（Perft 对拍）**  
   `crosscheck.js` 已通过：
   - Perft(3) 初始局面：JS 与 Rust 都是 80,062
   - 500 个随机中局的合法走法集合：**500/500 完全一致**

2. **评估函数逐位相等**  
   500 个随机局面 evaluate 分数 **500/500 完全一致**（连 `Math.floor` 对负数取整的边缘语义都对齐）。

3. **搜索结果一致**  
   固定 depth=6、超长时间预算下：
   - 中炮对屏风马(4步)：两版都到 d=14，bestMove 相同（7,4→7,6）
   - 中局复杂(12步)：两版都到 d=14，bestMove 相同（6,4→6,3），score=242 相同

## 副作用清单（承诺"零维护成本增量"）

- ✅ `index.html`、`js/main.js`、`js/ui.js`、`js/chess.js`、`js/evaluate.js` **一行未改**
- ✅ `js/engine-worker.js` 重写为 90 行的 wasm 薄壳，**Worker 消息 API 完全兼容**（search / stop / newgame / progress / result 字段全部保留）
- ✅ 运行时保持零依赖：`python3 -m http.server` 直接跑
- ✅ 原 JS 实现留存于 `js/engine-worker.js.jsbak`，可一键回滚
- ➕ 新增 `rust-engine/` 目录（Cargo + Rust 源），构建产物 `js/wasm/`

## 构建流程

一次性安装工具链：
```bash
brew install rustup
rustup default stable
rustup target add wasm32-unknown-unknown
cargo install wasm-pack
```

日常构建（改 Rust 源后）：
```bash
cd rust-engine
wasm-pack build --release --target no-modules --out-dir ../js/wasm --out-name engine
```
产物：`js/wasm/engine.js` (18KB) + `js/wasm/engine_bg.wasm` (82KB)。

## 验证脚本

- `node crosscheck.js` — Perft + 走法集合 + evaluate 对拍
- `node benchmark-rust.js` — 5 局面 benchmark（对齐 benchmark.js 的 TESTS）
- `node benchmark.js` — 原 JS 版 benchmark（对照）

## 移植的特性清单（1:1 对齐 js/engine-worker.js）

规则：`pseudoMoves`（k/a/e/h/r/c/p）、`squareAttacked`（定向）、`inCheck`、`computePinnedBB`（车线+将对脸）、`isLegalMove`、`allLegalMoves`/`legalCaptures`（内联合法性）、`gameStatus`。

搜索：Negamax + Alpha-Beta + PVS、迭代加深、Aspiration Windows(±60)、TT(512K 条目、Zobrist 64-bit)、Quiescence + Delta(1000)、Null-Move(R=2/3)、Razoring(200×d)、Futility(150+100×d)、Killers×2/ply、Countermove、MVV-LVA(×16)、History Heuristic、LMR(ln·ln/4)、IID(depth-2)、将军扩展、重复局面惩罚。

评估：PVAL、PST(开/残 3 套)、流动性(车/炮/马legs×2)、士象完整度、开放线、肋道、沉底车、当头炮、沉底炮、联兵/中心兵/老兵、马腿、残局王中心化。

开局库：红先 8 种 + 应中炮 5 种（分支完全一致，随机数用 xorshift64 保证浏览器/Node 一致）。
