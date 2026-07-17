# 象棋引擎棋力提升 — 执行计划

> **对应 SPEC**：`docs/ENGINE_IMPROVEMENT_SPEC.md`  
> **原则**：小步快跑，每 step 独立验收+独立 commit，任何一步棋力下降立刻 revert

## 总览

```
Phase A  (今天)     : P0 → P2  → 解决用户观察到的 3 个具体 case
Phase B  (本周)     : P1 → P3 → P4 → P5 → P6
Phase C  (可选大改) : P7 / P8 / P9
```

每一步产出物：
1. Rust 代码修改
2. `benchmark-rust-p{N}.json` 对比数据
3. 通过 gauntlet 自对弈 vs 上一版
4. 通过手工 regression 局面
5. commit 消息含数字

---

## Phase A：救火（预计 6~7 小时）

### Step 1 — 建立测试基础设施（前置，1h）

**任务**
- [ ] 新增 `gauntlet.js`：两版引擎对弈 N 局，返回胜率
  - 加载 `benchmark-baseline.json` 中的老 wasm（重命名为 `engine-p0-prev_bg.wasm` 之类）
  - 或临时保留 `js/wasm/engine_bg.wasm` 为 "prev" + 新建 "curr" 目录
  - 每局开局强制第一步不同（从开局库池随机）
- [ ] 新增 `handpick-cases.js`：加载预设 regression 局面
  - Case 1：初始局面，红先，depth 8，bestMove 不能是兵五进一、不能是炮吃边卒
  - Case 2：屏风马开局到第 4 手，AI 前 3 手至少动 2 个不同大子
  - Case 3~7：5 个中局杀棋 fixture（业余中级难度）
- [ ] `docs/BENCHMARK_HISTORY.md` 初始版本 = 当前 baseline

**验收**
- 两个脚本都能 `node xxx.js` 正常运行

**Commit**：`test: 添加 gauntlet 自对弈脚本 + regression 局面`

---

### Step 2 — P0.1 实现 SEE（1.5h）

**任务**
- [ ] `rust-engine/src/see.rs` 新模块
  - `attackers_to(board, r, c, red) -> Vec<(piece_val, from)>`：收集所有攻击方（含 X-ray）
  - `see(board, from, to) -> i32`：递归最小攻击方交换
- [ ] `search.rs::score_moves` 加入 SEE：
  - 负 SEE 吃子 = 20_000 + see_val（排到 quiet 之后，但仍在 history 之上）
  - 正 SEE 吃子保持原逻辑（500_000 + MVV-LVA）
- [ ] `search.rs::quiesce`：过滤 `see(from,to) < 0` 的吃子
- [ ] 单元测试：`rust-engine/tests/see_test.rs`
  - 简单交换（车吃兵有护）：SEE < 0
  - 复杂交换（车马炮争一格）：与手算对齐

**验收**
- `cargo test` 通过
- benchmark-rust-p0.1.json：NPS 允许 -15% 内
- gauntlet: p0.1 vs p0（baseline）胜率 ≥ 55%（20 局）

**Commit**：`feat(p0.1): SEE 静态交换评估 + 走法排序应用`

---

### Step 3 — P0.2/3/4 评估基础修正（1h）

**任务**
- [ ] `eval.rs` 加入：
  - `undeveloped_penalty(board, phase)` → 车马炮未动的负分
  - `PST_P_OP` 数值调整：`[5][4]` 16→6，`[4][4]` 24→10
  - Tempo：evaluate 增加 `red_to_move` 参数，末尾 `± 6`
- [ ] `search.rs::negamax`/`quiesce`：所有 evaluate 调用点传 red_to_move
- [ ] `lib.rs::evaluate_board` wasm 导出增加参数
- [ ] `crosscheck.js` 相应更新 evaluate 对拍逻辑（会 diverge，但要有新 golden 记录）

**验收**
- handpick Case 1：初始局面 bestMove ∉ {兵五进一、炮八平七吃兵、炮二平三吃兵}
- handpick Case 2：屏风马开局 3 手动 2 大子 ✅
- gauntlet: p0.2 vs p0.1 胜率 ≥ 55%

**Commit**：`feat(p0.2-4): 未发展惩罚 + 削中兵 PST + Tempo`

---

### Step 4 — P2.3 增量 Zobrist Hash（1h，性能急救）

**任务**
- [ ] `rules.rs::Undo` 加 `hash_delta: u64`
- [ ] `make_move` 计算 delta 并更新 board_hash（用 thread-local 或 ctx 存 current_hash）
- [ ] `search.rs`：不再每节点调 `board_hash()`，用 `ctx.current_hash`
- [ ] `unmake_move` XOR 恢复
- [ ] 加断言（debug 模式）：`assert_eq!(ctx.current_hash, board_hash(...))`

**验收**
- benchmark-rust-p2.3.json：NPS **提升 ≥ 30%**（预期到 1.5M+）
- 3 层 Perft 结果不变（规则未改）
- gauntlet: p2.3 vs p0.2 平局 ±3 局（此步只提性能不改棋力）

**Commit**：`perf(p2.3): 增量 Zobrist hash，NPS +XX%`

---

### Step 5 — P2.1/2 全路径重复 + 长将（1.5h）

**任务**
- [ ] `search.rs`：`SearchCtx` 加 `path_hash: Vec<u64>`
- [ ] `negamax` 开头：`if ply>0 && path_hash contains current_hash → return 0`
- [ ] `make_move`/`unmake_move`：ctx.path_hash push/pop
- [ ] 长将判负：走法生成时标记 `gives_check`，若一方连续 N 次将军且局面重复 → 判该方负（-MATE+ply）
- [ ] 长捉判负：连续 6 回合攻击对方同一子 + 局面重复 → 判负（先落基础版：只处理"长将"，长捉留 TODO）

**验收**
- 手工构造长将局面 fixture：AI 不再选择永远将下去
- benchmark-rust-p2.5.json：NPS 波动 ≤ 5%
- gauntlet: p2.5 vs p2.3 胜率 ≥ 52%

**Commit**：`feat(p2.1-2): 全路径重复检测 + 长将判负`

---

### Step 6 — P2.4 stop 信号细粒度（30min）

**任务**
- [ ] `SearchCtx` 加 `deadline_ms: f64`
- [ ] `ai_move` 入口设置 deadline
- [ ] `negamax`/`quiesce` 每 4096 节点检查一次 `now() > deadline` 或 `ctx.stop`，是则 return alpha 并置 stop
- [ ] JS 侧 `stop` 消息立即生效

**验收**
- 手工发 stop 消息，UI 响应时间 < 50ms
- 性能：NPS 波动 < 3%

**Commit**：`feat(p2.4): stop 信号细粒度检查`

---

### Phase A 收尾（30min）

- [ ] 汇总 benchmark-rust-p0..p2.4.json 到 `docs/BENCHMARK_HISTORY.md`
- [ ] 更新 `AGENTS.md` 标注引擎 v5
- [ ] `git push origin master`

**Phase A 交付**
- 用户观察到的 3 个 case 全部消失（regression 局面通过）
- NPS 提升 ≥ 30%（增量 hash 收益）
- 累计对老版胜率 ≥ 65%（gauntlet 40 局）

---

## Phase B：本周内做完（预计 20 小时）

### Step 7 — P1 战术模式与 King safety（4h）

**Step 7.1 King safety attack-units**（1.5h）
- [ ] `eval.rs::king_safety(board, red)` 返回负分（越大越危险）
- [ ] 定义危险区 = 王 3×3 + 前方 2 行
- [ ] 攻击者贡献：车 40、炮 20、马 20、兵 5
- [ ] `safety_table: [0,0,10,20,35,55,80,110,150,200,260,330,410,500]`
- [ ] 士象少 → 权重 ×1.3

**Step 7.2 战术模式**（2.5h）
- [ ] `eval.rs::tactics(board, red)` 
- [ ] 依次实现：空头炮 / 沉底炮 / 重炮 / 卧槽马 / 挂角马 / 盘河马 / 马后炮 / 铁门栓 / 闷宫
- [ ] 每种模式在单元测试中验证识别正确

**验收**
- handpick 新增 5 个"该攻却不攻"局面，AI 现在能找到
- gauntlet: p1 vs p0.a 胜率 ≥ 60%
- NPS 可能下降 15% 内（评估变复杂），可接受

**Commit**：`feat(p1): King safety attack-units + 9 种战术模式识别`

---

### Step 8 — P3 开局库扩充（3h）

**Step 8.1 数据准备**（1.5h，先选路线）
选型讨论：
- 优先方案：**手工编写 200 变着**（可控，无许可证问题）
- 备选：从 lichess xiangqi 或 CCF PGN 大师对局提取

先做手工 200 变着覆盖：
- 中炮进七兵 → 屏风马 (a) 巡河车 / (b) 直车 / (c) 弃马陷车 各 5~8 层
- 中炮 → 反宫马
- 中炮 → 顺炮直车对横车
- 中炮 → 半途列炮
- 仙人指路 → 卒底炮 / 飞相 / 挺卒对进
- 飞相 → 士角炮 / 过宫炮 / 挺卒
- 起马 → 挺卒对起马

**Step 8.2 存储与集成**（1.5h）
- [ ] `docs/opening-book-src.txt`：每行 `hash;move;weight;desc`
- [ ] `rust-engine/build.rs`：编译期把 txt 转成 `[(u64,u16,u16)]` const 数组嵌入 wasm
- [ ] `book.rs::book_move`：二分查找 + 加权随机

**验收**
- 前 12 手基本走进主流开局
- handpick：初始局面走各主流开局第 1 步（8 种红先第一步中至少 5 种能出现）
- gauntlet: p3 vs p1 胜率 ≥ 55%（开局稳定 = 少犯错）

**Commit**：`feat(p3): 开局库扩充到 200+ 变着`

---

### Step 9 — P4 搜索增强（5h）

**Step 9.1 Aspiration 多阶段**（30min）
- [ ] `[60, 200, 800, INF]` 渐宽

**Step 9.2 LMP**（30min）
- [ ] `depth<=3 && moves_done > 3+depth*3 && !cap && !gc` → skip

**Step 9.3 Improving**（30min）
- [ ] `eval_stack: Vec<i32>` per ply
- [ ] `improving = eval_stack[ply] > eval_stack[ply-2]`
- [ ] 用于 razoring 和 LMP margin 调整

**Step 9.4 Continuation History**（1.5h）
- [ ] `cont_hist: HashMap<(prev_piece, prev_to), HashMap<(cur_piece, cur_to), i32>>`（或数组表示）
- [ ] score_moves 里加入

**Step 9.5 Singular Extension**（1h）
- [ ] TT 命中且 depth>=8 时，用 β=tt_v-margin, α=tt_v-margin-1 探索其他 move
- [ ] 若全部 fail-low → 延伸 1

**Step 9.6 TT aging + 简化 replacement**（30min）
- [ ] TT entry 加 8-bit age
- [ ] 替换策略：`old.age != cur_age || d >= old.d`

**Step 9.7 Null-move Zugzwang 精化**（30min）
- [ ] 判断"当前 side 有大子"作为空着条件

**验收**
- benchmark-rust-p4.json：NPS 波动 ≤ 10%
- 同局面同时间预算搜索深度 ≥ p3 + 1 层
- gauntlet: p4 vs p3 胜率 ≥ 58%

**Commit**：`feat(p4): LMP+Improving+ContHist+Singular+多阶段Asp+TTaging`

---

### Step 10 — P5 性能（4h）

**Step 10.1 单遍历 evaluate**（2h）
- [ ] 去除 red_rooks 等 8 个 Vec 分配
- [ ] 单次遍历完成 PST + mobility 累积

**Step 10.2 game_phase 增量**（30min）
- [ ] ctx.majors 计数

**Step 10.3 走法生成扁平数组**（1h）
- [ ] `Vec<Move>` → `[Move; 128]` + len

**Step 10.4 SIMD**（30min）
- [ ] `.cargo/config.toml` 加 `rustflags = ["-C", "target-feature=+simd128"]`
- [ ] wasm-pack build --release --features simd

**验收**
- NPS 提升 ≥ 60%（累积到 P4 后的 2M+）
- 3 层 Perft 完全一致

**Commit**：`perf(p5): 单遍历eval+增量phase+SIMD+扁平走法，NPS +XX%`

---

### Step 11 — P6 时间管理（1.5h）

**任务**
- [ ] `bestMove` 变化 → 预算 ×1.5（最多 1 次）
- [ ] `bestVal - prev_bestVal < -30` → ×1.3
- [ ] 明显局面 `|score| > 500` → ×0.7
- [ ] 剩余时间 < 3 × last_iter_time → 停

**验收**
- 主观测试：AI 在均势时用满时间，明显局面秒回
- gauntlet: p6 vs p5 胜率 ≥ 53%（时间管理优势）

**Commit**：`feat(p6): 动态时间管理`

---

### Phase B 收尾

- 汇总所有 benchmark-*.json
- `docs/BENCHMARK_HISTORY.md` 完整更新
- 累计 gauntlet: 各版本 round-robin，估算 Elo
- `git push`

**Phase B 交付**
- NPS 累计提升到 baseline 的 3~5x
- 相对 Phase A 累计胜率 ≥ 75%
- 覆盖用户可预期的绝大部分棋类问题

---

## Phase C：可选大改（需用户确认再启动）

### P7 Bitboard 重写（20h）
- 把 90 格局面用 u128 表示
- 走法生成、攻击检测全部 bitboard 化
- 预计再 NPS +2x

### P8 多线程 Lazy SMP（10h）
- Rust wasm 用 web_sys::Worker + SharedArrayBuffer
- 需 index.html 部署 COOP/COEP header
- 4 核 NPS +2.5x

### P9 NNUE（40h+GPU 训练时间）
- 网络架构：HalfKA-like 特征
- 训练数据来源需商讨（Pikafish 兼容？自采？）
- 预计 +400~600 Elo

---

## 时间线预估

| 里程碑 | 内容 | 累计工时 | 累计 Elo |
|---|---|---:|---:|
| Phase A 完成 | 用户 3 个 case 解决 + NPS +30% | 7h | +280 |
| Phase B Step 7 完成 | 战术模式 + King safety | 11h | +430 |
| Phase B Step 8 完成 | 开局库到位 | 14h | +530 |
| Phase B Step 9 完成 | 搜索增强 | 19h | +680 |
| Phase B Step 10-11 完成 | 性能+时间管理 | 24h | +830 |
| Phase C 全部完成 | 极限性能 | 94h | +1580 |

---

## 需用户确认的开工前问题

1. **本项目 License**：是否可以 GPLv3？（决定能否移植 Pikafish PSQT/NNUE）
2. **开局库路线**：手工写 200 变着（今天就能开始）vs 从 PGN 统计（1~2 天准备数据）
3. **是否上多线程 P8**：如果 UI 通过 GitHub Pages 部署要额外配置
4. **是否要 NNUE P9**：目标是"打过业余爱好者" HCE 够，"打过省级棋手"才需要

---

## 立即开工签署

我建议现在开始 **Step 1：测试基础设施**。等你说 GO。
