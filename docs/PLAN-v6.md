# PLAN v6: 中局评估增强实施路线

## 实施顺序（按依赖关系）

```
S1: R1 无根子检测     →  eval.rs + tests
S2: R2 交换净收益     →  eval.rs + tests (依赖 R1 的 square_attacked)
S3: R3 兵支撑联动     →  eval.rs + tests
S4: R4 车炮联动       →  eval.rs + tests
S5: R5 主动权         →  eval.rs + tests
S6: R6 Quiesce 将军   →  search.rs
S7: R7 LMR 收敛       →  search.rs
S8: 全套验收 + 对弈   →  benchmark + quick-gauntlet + 手动
```

每步后验证：cargo test → crosscheck → handpick → stop → benchmark

---

## S1: R1 无根子检测

**文件**：`rust-engine/src/eval.rs`

**新增函数**：
```rust
fn hanging_penalty(board: &Board, red: bool) -> i32
```

**逻辑**：
1. 遍历己方大子（车/马/炮/过河兵）
2. 对每个子，检查是否被己方子保护（用 square_attacked(己方)）
3. 如果无保护，检查对方是否能攻击该子（用 square_attacked(对方)）
4. 如果能攻击 → 扣分

**注意**：需要知道己方有哪些子可以"保护"该格。简化做法：用 square_attacked 反向查——如果该格被己方攻击，说明有保护。

**接入 evaluate()**：在 phase != 2 时调用（残局简化，无根子常见但不重要）

**新增测试**：
- `test_hanging_rook_penalized`: 红车在对方底线，无己方保护，对方马能攻击 → 扣分
- `test_protected_rook_not_penalized`: 红车有己方炮保护 → 不扣分

---

## S2: R2 交换净收益

**文件**：`rust-engine/src/eval.rs`

**新增函数**：
```rust
fn exchange_penalty(board: &Board, red: bool) -> i32
```

**逻辑**：
1. 遍历己方大子
2. 找到对方能攻击该子的最小攻击者（用 square_attacked 对方 + 遍历对方攻击者找最小 PVAL）
3. 如果攻击者 PVAL < 被攻击子 PVAL → 扣分 = (被攻击子 PVAL - 攻击者 PVAL) / 10
4. 如果对方多子攻击同一格 → 扣分放大

**注意**：这与 SEE 不同——这只是评估中的"威胁检测"，不模拟完整交换序列。

**接入 evaluate()**：在 phase != 2 时调用

**新增测试**：
- `test_exchange_loss_penalized`: 红炮价值 450 被黑马价值 400 攻击，无保护 → 扣分
- `test_exchange_win_not_penalized`: 红车价值 900 被黑兵价值 100 攻击，但有保护 → 不扣分

---

## S3: R3 兵支撑联动

**文件**：`rust-engine/src/eval.rs`

**修改**：在现有兵评估循环中增加

**逻辑**：
- R3a: 兵当炮架：遍历红方过河兵(r≤4)，对每个兵检查同列是否有红炮，且中间无子 → +10
- R3b: 兵控马位：过河兵(r≤4)，同侧马在相邻列(|Δc|≤1)且马在敌阵(r≤4) → 马活度+2
- R3c: 兵护兵：两个过河兵在同一行相邻列 → 已在联兵逻辑中，补充 +4

**新增测试**：
- `test_pawn_cannon_架`: 红兵在 (4,4)，红炮在 (2,4)，中间无子 → +10
- `test_pawn_supports_horse`: 红兵在 (4,4)，红马在 (3,5) → 马活度+2

---

## S4: R4 车炮联动

**文件**：`rust-engine/src/eval.rs`

**新增函数**：
```rust
fn rook_cannon_bonus(board: &Board, red: bool) -> i32
```

**逻辑**：
1. 对每对同列的车和炮
2. 如果中间无子：
   - 车在炮后面（车更靠近己方底线）→ +15
   - 炮在车后面 → +10
3. 如果中间有子 → 不加分

**接入 evaluate()**：所有 phase 生效

**新增测试**：
- `test_rook_behind_cannon`: 红车在 (9,4)，红炮在 (5,4)，中间无子 → +15

---

## S5: R5 主动权

**文件**：`rust-engine/src/eval.rs`

**新增函数**：
```rust
fn initiative_bonus(board: &Board, red_king: (i32,i32), blk_king: (i32,i32)) -> i32
```

**逻辑**：
- R5a: 红方在敌半场(r≤4)的车/马/炮数 × 8 - 黑方在敌半场(r≥5)的车/马/炮数 × 8
- R5b: 在王区攻击单位（复用 king_safety 的 zone_unit 计数）→ 差值 × 12
- 信号方向：正=红方主动，负=黑方主动

**注意**：R5b 与 king_safety 有重叠，但这是净差值，更直接反映"谁在进攻"。

**接入 evaluate()**：所有 phase 生效

**新增测试**：
- `test_initiative_attacking`: 红方 3 子过河 vs 黑方 0 子过河 → 主动权正分

---

## S6: R6 Quiesce 将军检测

**文件**：`rust-engine/src/search.rs`

**修改**：在 `quiesce()` 的非将军分支中，在 stand_pat 检查之后、吃子循环之前，插入：

```rust
// 检查对方是否有一步将军
if !in_chk {
    let opp_moves = all_legal_moves(board, !red_to_move);
    let mut gives_check = false;
    for &(fr,fc,tr,tc) in opp_moves.iter() {
        // 快速检查：只检查走法终点是否在王相邻位置
        // 简化：做实际走法 + in_check 验证
        let u = make_move_zh(board, fr, fc, tr, tc, &mut ctx.current_hash, &ctx.z);
        if in_check(board, red_to_move) { gives_check = true; }
        unmake_move_zh(board, u, &mut ctx.current_hash, &ctx.z);
        if gives_check { break; }
    }
    if gives_check {
        // 扩展 1 层：对方将军后的局面
        // ... 搜索所有走法（不只是吃子）
    }
}
```

**风险**：性能开销大（每节点生成全部走法）。优化：只检查"攻击王"的走法（pseudo-legal check）。

**实际实现**：更轻量的做法——在 stand_pat 和 alpha 之间，如果 stand_pat 接近 alpha，检查对方是否将军。如果将军 → 用全走法搜索替代吃子搜索。

---

## S7: R7 LMR 收敛

**文件**：`rust-engine/src/search.rs`

**修改**：
```rust
// 原: base = 1 + (((moves_done as f64).ln() * (depth as f64).ln()) / 4.0).floor() as i32;
// 新: base = 1 + (((moves_done as f64).ln() * (depth as f64).ln()) / 5.0).floor() as i32;
let base = 1 + (((moves_done as f64).ln() * (depth as f64).ln()) / 5.0).floor() as i32;
```

**预期**：中局搜索精度提升，NPS 略降，但深度不降。

---

## S8: 全套验收

```bash
# 1. 编译 + 单元测试
export PATH="$HOME/.cargo/bin:$HOME/.rustup/toolchains/stable-aarch64-apple-darwin/bin:$PATH"
cd rust-engine && cargo test --release && wasm-pack build --release --target no-modules --out-dir ../js/wasm --out-name engine

# 2. 交叉校验
cd .. && node crosscheck.js

# 3. 手选局面
node tests/handpick-cases.js

# 4. stop 一致性
node tests/stop-consistency.js

# 5. benchmark
node benchmark-rust.js v6-final

# 6. quick-gauntlet（新版 vs 旧版 5 局）
node tests/quick-gauntlet.js

# 7. 人工对弈（手动 3 局）
```

### 快速自对弈脚本
```bash
# 用 quick-gauntlet.js 做新版 vs 旧版对弈
# 验证新版不输旧版
```

---

## 对弈自测

做完 S8 后，用 quick-gauntlet.js 做新版 vs 旧版 5 局对弈。
观察 AI 行为是否改善：
- 不再出现"吃子后立刻被反吃"
- 开局马能正常出动
- 中局有配合意识
- 残局不无谓冲兵

如果仍有问题，分析原因 → 调整参数 → 重新 benchmark → 提交。
