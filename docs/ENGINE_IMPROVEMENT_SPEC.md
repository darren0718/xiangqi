# 象棋引擎棋力提升 SPEC

> **状态**：Draft v1（2026-07-17）  
> **目标**：把当前 AI 从"新手级"提升到"业余高手级"（保守估计 +700 Elo）  
> **约束**：保持零依赖运行时；棋力铁律"任何改动必须有前后对比数据"

## 1. 背景

### 1.1 当前实现（v4 Rust/wasm）
- 规则引擎：`rust-engine/src/rules.rs`（Perft 与 JS 对拍通过）
- 评估函数：`rust-engine/src/eval.rs`（500 局面与 JS 逐位一致）
- 搜索：`rust-engine/src/search.rs`（Negamax+PVS+TT+Quiescence+NullMove+LMR+IID+Killers+CounterMove+History）
- 开局库：`rust-engine/src/book.rs`（13 条硬编码分支）
- 性能基线：**1,172,788 NPS**，5 测试局面平均搜索深度 12 层

### 1.2 用户反馈的可见症状
- 开局各种吃兵，完全不管子力配合
- 开局出现"兵五进一"（业余棋手绝不会走）
- 大子不出动
- **推断：这只是冰山一角，评估函数整体偏软**

### 1.3 业界成熟方案参考
- **Pikafish**（Stockfish 象棋分叉）：NNUE + 全套 SF 搜索技术
- **象棋巫师 ElephantEye / Xqwlight**（王小春）：中文圈经典 HCE 引擎
- **Fairy-Stockfish**（多变体框架含象棋）
- **BikJump**（德国世界冠军级）
- **AlphaZero-Xiangqi** 论文（Google 2019）

## 2. 问题清单（40+ 项按类别分组）

### A. 正确性 / 规则缺陷

| ID | 问题 | 严重度 | 描述 |
|---|---|---|---|
| A1 | 缺长将/长捉判负 | 🔴 高 | 中国象棋规则：连续将军 6 回合或连续捉子 6 回合判负。当前引擎完全无感 |
| A2 | 重复检测只在 ply<2 | 🔴 高 | `if repCount && ply>0 && ply<2` 导致深处三次重复漏检，产生虚假评估 |
| A3 | 缺 60 步无吃子判和 | 🟡 中 | 长和判定缺失 |
| A4 | 炮牵制未识别 | 🟡 中 | `compute_pinned` 只处理车/将对脸牵制，炮的"隔一子"牵制未覆盖 |
| A5 | stop 信号只在顶层检查 | 🟡 中 | UI 点"停止"要等当前深度层跑完，深度 12 可能 5 秒 |

### B. 棋力 / 评估

| ID | 问题 | 严重度 | 描述 |
|---|---|---|---|
| B1 | 无 SEE 静态交换评估 | 🔴 高 | AGENTS.md 描述有 SEE 是错的。走法排序含负 SEE 吃子，quiescence 无过滤 |
| B2 | 无 Xiangqi 战术模式识别 | 🔴 高 | 马后炮/铁门栓/闷宫/重炮/空头炮/卧槽马/挂角马/盘河马 全零覆盖 |
| B3 | King safety 只数士象数量 | 🔴 高 | 缺"attack-units + safety_table"非线性映射 |
| B4 | 车的评估欠缺关键项 | 🟡 中 | 缺连车/沉底车切王逃路/车塞象眼/车叫杀 |
| B5 | 兵的评估过简 | 🔴 高 | PST 数值导致"兵五进一"最优；缺过河兵动态曲线、底兵、联兵、老兵回落 |
| B6 | 马的评估欠缺 | 🟡 中 | 只有"马腿数"，缺卧槽/挂角/盘河/日字对角威胁 |
| B7 | 象士评估欠缺 | 🟡 中 | 缺象眼被塞检测、士角空虚 |
| B8 | PSQT 是拍脑袋的 | 🟡 中 | 应通过 Texel tuning 从对局数据拟合，或移植 Pikafish PSQT |
| B9 | PST 开局部分对"未出子"零惩罚 | 🔴 高 | 车马炮不动 = 0 分，吃兵 = +100 分，AI 当然选吃兵 |
| B10 | 缺 Tempo 奖励 | 🟡 中 | 轮到走棋方缺 +6 微幅奖励 |

### C. 搜索算法

| ID | 问题 | 严重度 | 描述 |
|---|---|---|---|
| C1 | 缺 Late Move Pruning (LMP) | 🟡 中 | 低深度非 PV 非将军时可省 20~30% 节点 |
| C2 | 缺 Improving Heuristic | 🟡 中 | "局面比 2 ply 前更好？"未维护 |
| C3 | 缺 Continuation History | 🟡 中 | 一维 history 无法捕获"对方 X 我 Y"应手模式 |
| C4 | 缺 Singular Extension | 🟡 中 | TT move 明显最优时未延伸 1 层 |
| C5 | 缺 ProbCut | 🟢 低 | 浅搜索 + β+margin 剪枝 |
| C6 | Null-Move Zugzwang 检测粗 | 🟡 中 | 用 `phase!=2` 拦截，应看"有大子" |
| C7 | Aspiration 只重搜 1 次 | 🟡 中 | 应 60→200→800→∞ 多阶段渐宽 |
| C8 | Root Move 无跨迭代排序 | 🟡 中 | 每次 IID 从头尝试，未复用上次评分 |
| C9 | TT 无 aging | 🟡 中 | 跨局旧数据污染 |
| C10 | TT replacement 用随机数 | 🟢 低 | 每次生成 f64 慢 |

### D. 性能

| ID | 问题 | 潜在收益 | 描述 |
|---|---|---|---|
| D1 | board_hash 全盘重算 | +30~50% NPS | 应增量 XOR |
| D2 | evaluate 每次分配 8 个 Vec | +10~20% NPS | 单遍历累积 |
| D3 | game_phase 每次遍历全盘 | +5% NPS | 增量维护大子数 |
| D4 | 走法生成用 Vec | +5% NPS | 应用扁平数组或 staged generation |
| D5 | 未启用 WASM SIMD | 2x NPS | `+simd128` target-feature |
| D6 | 未启用多线程 Lazy SMP | 2.5x NPS | 需 COOP/COEP headers |
| D7 | 未用 Bitboard | 2~3x NPS（潜在） | 90 格 → u128 |

### E. 开局库 / 残局

| ID | 问题 | 描述 |
|---|---|---|
| E1 | 开局库仅 13 条 | 应扩充到 500+ 变着，覆盖 15 层 |
| E2 | 无残局库 (EGTB) | ≤7 子残局可枚举完备 |
| E3 | 无 book learning | 无法根据对局胜率调整开局权重 |

### F. 时间管理

| ID | 问题 | 描述 |
|---|---|---|
| F1 | 静态时间预算 | 应根据 bestMove 变化、分数暴跌、legal 走法数动态调整 |
| F2 | 无 Ponder | 对方思考时我方未 background search |

### G. 评估终极方案

| ID | 问题 | 描述 |
|---|---|---|
| G1 | 无 NNUE | Pikafish 核心武器，+400~600 Elo |

## 3. 优化目标与收益预估

| Phase | 内容（对应问题 ID） | 预计 Elo | 工时 | 副作用 |
|---|---|---:|---:|---|
| **P0** | B1(SEE) + B9(未发展惩罚) + B5(削中兵 PST) + B10(Tempo) | +200 | 2h | 零 |
| **P1** | B2(战术模式) + B3(King safety attack-units) + B4/B6/B7 | +150 | 4h | 零 |
| **P2** | A1/A2(重复+长将) + D1(增量 hash) + A5(stop 检查) | +80 规则 / +150 NPS | 3h | 零 |
| **P3** | E1(500+ 开局库) | +100 | 3h | +book 数据 |
| **P4** | C1/C2/C3/C4/C5(搜索增强) | +150 | 5h | 零 |
| **P5** | D2/D3/D4(单遍历 eval) + D5(SIMD) | +100 (NPS 2x) | 4h | 零 |
| **P6** | F1(动态时间) | +50 | 1.5h | 零 |
| **P7 (可选)** | D7(Bitboard 重写) | +100 (NPS 2x) | 20h | 大改 |
| **P8 (可选)** | D6(多线程 Lazy SMP) | +150 | 10h | 需部署 header |
| **P9 (可选)** | G1(NNUE) | +500 | 40h+训练 | +20MB 权重 |

保守估计 P0~P6 累加 **+700 Elo**。

## 4. 每阶段设计要点

### P0 详设（最高优先级）

**P0.1 实现 SEE (Static Exchange Evaluation)**
- 输入：局面 + 目标格 + 首攻方
- 算法：递归"最小攻击方先手"交换，返回净得分
- 使用点：
  1. `score_moves`：负 SEE 吃子降到 quiet 之后
  2. `quiesce`：过滤 SEE<0 的吃子（Delta pruning 之外的第二道过滤）
  3. Futility pruning 只对 SEE<0 quiet 生效
- 复杂度：每格 O(交换深度)，交换深度通常 <10

**P0.2 未发展惩罚**
- `phase==0 (majors≥10)` 时：
  - 红车在 (9,0)/(9,8) 未动：-15
  - 红马在 (9,1)/(9,7) 未动：-12
  - 红炮在 (7,1)/(7,7) 未动：-8
  - 黑方镜像
- 实现：在 `evaluate` 主循环中按位置直接累积，无需额外遍历

**P0.3 削中兵 PST**
- `PST_P_OP[5][4]` 从 16 降到 6（原位挺 1 步）
- `PST_P_OP[4][4]` 从 24 降到 10（挺 2 步）
- 让中兵推进不再是"位置分明显最大"

**P0.4 Tempo 奖励**
- `evaluate` 结尾：`score += (redToMove ? +6 : -6)`
- 需要 evaluate 签名加参数（或在调用侧调整）

### P1 详设（战术模式与 King safety）

**P1.1 战术模式识别函数（每个返回加分）**
```rust
fn tactic_horse_back_cannon(...)  // 马后炮
fn tactic_iron_gate(...)           // 铁门栓  
fn tactic_double_cannon(...)       // 重炮
fn tactic_empty_head_cannon(...)   // 空头炮
fn tactic_crouching_horse(...)     // 卧槽马
fn tactic_corner_horse(...)        // 挂角马
fn tactic_river_horse(...)         // 盘河马
```

**P1.2 King safety attack-units (Stockfish 风格)**
- 定义敌方将周围 5×3 危险区
- 每个进入的己方大子贡献 attack_units：车 40、炮 20、马 20、兵 5
- 用 `safety_table[units]`（0~500 阶梯）非线性映射
- 士象少 = 危险区容易被穿透，attack_units 权重 ×1.3

### P2 详设（正确性+性能）

**P2.1 全路径重复检测**
- 搜索维护 `path_hash: Vec<u64>`，每次 make/unmake push/pop
- ply>0 且 path 出现相同 hash → 直接 return 0

**P2.2 长将/长捉判负**
- 在重复检测基础上，判断双方走的都是将军着 → 主动重复方判负
- 长捉：连续 6 回合捉同一个子

**P2.3 增量 Zobrist hash**
- 修改 `Undo` 存 hash delta
- `make_move`：`h ^= zob[piece][from] ^ zob[piece][to] ^ (captured ? zob[cap][to] : 0) ^ zob_side`
- `unmake_move`：同 XOR 恢复
- 消除每节点 90 格 board_hash 遍历

**P2.4 stop 信号细粒度检查**
- `ctx.check_stop_interval = 4096`
- negamax 里 `if ctx.nodes & (interval-1) == 0 { if now() > deadline { ctx.stop = true; } if ctx.stop { return alpha; } }`

### P3 详设（开局库）

**P3.1 数据来源选型**（三选一）
1. 象棋巫师 book.dat 反解（GPL，注意许可证）
2. 从 CCF PGN 大师对局库统计 top-N 变着
3. 手工编写核心 200 变着（覆盖中炮/屏风马/顺炮/反宫马/单提马/仙人指路/飞相/过宫炮）

**P3.2 数据格式**
- `js/wasm/book.bin`：`[u64 zobrist_hash | u16 packed_move | u16 weight]` 数组
- 二分查找（按 hash 排序），O(log N)
- 权重加权随机选择（避免总是走同一路）

**P3.3 集成**
- `book_move` 改为读该表
- fallback：hist<4 走硬编码，hist>=4 走 book.bin

### P4 详设（搜索增强）

- **C1 LMP**：`if depth<=3 && moves_done > 3+depth*3 && !isCapture && !givesCheck { continue }`
- **C2 Improving**：`improving = eval > eval_stack[ply-2]`，用于调整 razoring/LMP margin
- **C3 Continuation History**：`cont_hist[prev_piece][prev_to][cur_piece][cur_to]`
- **C4 Singular Extension**：TT move 用 β-margin 单独探索，若其他 move 都 fail-low 则延伸 1 层
- **C7 Aspiration 多阶段**：`asp = [60, 200, 800, INF]`

### P5 详设（性能）

- **D2 单遍历 evaluate**：不再收集棋子列表，一次遍历完成 PST + 位置累积 + 位置分
- **D3 game_phase 增量**：`ctx.majors` 计数器，make/unmake 时增减
- **D5 SIMD**：`RUSTFLAGS='-C target-feature=+simd128'`，对 PST 查表和 mobility 计算向量化

### P6 详设（时间管理）
- 基础预算 = `time_limit`
- `bestMove` 上次迭代变化 → ×1.5
- `bestVal` 下降超过 30 → ×1.3
- 剩余时间估算：`remaining < 3 × last_iter_time` → 停止
- 明显局面（`|score| > 500`）：×0.7 提前返回

## 5. 验收标准

每阶段完成后必须提供：

**5.1 性能对比（`benchmark-rust.js` 5 局面）**
- NPS 波动 ≤ 20%（评估变复杂必然稍慢）
- 深度不允许下降超过 1 层

**5.2 规则等价（`crosscheck.js`）**
- Perft 结果与 baseline 一致（规则未改的阶段）
- P0-P1 阶段：evaluate 分数会变，需要新的黄金局面 fixture 记录

**5.3 gauntlet 自对弈（新增 `gauntlet.js`）**
- 新版 vs 老版 各 20 局，开局强制不同（红/黑各 10 局）
- 胜率 ≥ 60% 视为真正提升

**5.4 人类肉眼 regression 局面（新增 `handpick-cases.js`）**
- 初始局面 depth 8 搜索：bestMove ∉ {兵五进一、炮吃兵}
- 屏风马开局：AI 3 手内至少动 2 个大子
- 中局杀棋局面（预设 5 个）：AI depth 6 内找到杀棋

**5.5 引擎日志**
- 每阶段生成 `benchmark-rust-pN.json`
- 通过后 append 到 `docs/BENCHMARK_HISTORY.md`

## 6. 风险与回滚

- 每阶段独立 commit，可 `git revert` 单独回滚
- 保留 `js/engine-worker.js.jsbak` 作为终极 fallback
- `js/wasm/engine_bg.wasm` 每次构建后手动 commit（不加入 CI），以便按 commit hash 回退到任意历史版本
- Phase 之间不能捆绑发布，每完成一个 Phase 都要跑 5.1-5.4 全套验收才 push

## 7. 未决问题

1. **Pikafish PSQT 与 NNUE 权重的许可证兼容性**：Pikafish 是 GPLv3，本项目当前无许可证声明。要引入前须先明确本项目 license
2. **开局库数据来源**：象棋巫师 GPL 反解 vs 手工编写 vs PGN 统计 —— 优先级待定
3. **是否上多线程**：本地能跑，但 GitHub Pages 部署需要 COOP/COEP header，Netlify/Cloudflare Pages 可配。是否重要？
4. **NNUE**：只有对"县级/省级棋手对抗"有意义。当前用户目标不明。

