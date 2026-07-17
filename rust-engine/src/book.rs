// 开局库 —— 基于走法前缀匹配的手工库
// 库源在 rust-engine/data/opening-book.txt，编译时 include_str! 内嵌
// 每行 = 一整套走法序列 (r,c-r,c 空格分隔)
// 匹配规则：hist 是从初始局面到现在的所有走法；从库中找出所有以 hist 为前缀
// 的行，如果存在，随机挑一条，返回该行的第 hist.len() 步作为下一手。
//
// 特点：
// - 双方（红/黑）走法都在同一行里，一次前缀匹配同时覆盖 AI 执红 / 执黑
// - 支持深至任意步的库（受行长度限制）
// - AI 执红只使用「以红方第 0 步开头」的行；执黑同理

use crate::board::*;

const BOOK_TEXT: &str = include_str!("../data/opening-book.txt");

type Move = (i32, i32, i32, i32);

/// 解析一行为 Vec<Move>。行内格式：`r1,c1-r2,c2  r1,c1-r2,c2 ...`
fn parse_line(line: &str) -> Option<Vec<Move>> {
    let line = line.trim();
    if line.is_empty() || line.starts_with('#') { return None; }
    let mut moves = Vec::with_capacity(12);
    for tok in line.split_ascii_whitespace() {
        // 跳过注释残留（如 `→`）
        if tok.starts_with('#') || tok.starts_with('→') { break; }
        let dash = tok.find('-')?;
        let (a, b) = (&tok[..dash], &tok[dash+1..]);
        let (r1s, c1s) = a.split_once(',')?;
        let (r2s, c2s) = b.split_once(',')?;
        let r1: i32 = r1s.parse().ok()?;
        let c1: i32 = c1s.parse().ok()?;
        let r2: i32 = r2s.parse().ok()?;
        let c2: i32 = c2s.parse().ok()?;
        if !in_board(r1,c1) || !in_board(r2,c2) { return None; }
        moves.push((r1,c1,r2,c2));
    }
    if moves.is_empty() { None } else { Some(moves) }
}

/// 收集所有以 hist 为前缀且长度 > hist.len() 的走法序列，取每个序列的第 hist.len() 步
fn candidates(hist: &[Move]) -> Vec<Move> {
    let mut out: Vec<Move> = Vec::new();
    for line in BOOK_TEXT.lines() {
        let moves = match parse_line(line) { Some(m) => m, None => continue };
        if moves.len() <= hist.len() { continue; }
        let mut ok = true;
        for (i, m) in hist.iter().enumerate() {
            if moves[i] != *m { ok = false; break; }
        }
        if ok { out.push(moves[hist.len()]); }
    }
    out
}

#[inline]
fn rand_next(x: &mut u64) -> u64 { let mut v=*x; v^=v<<13; v^=v>>7; v^=v<<17; *x=v; v }

pub fn book_move(_board: &Board, ai_is_red: bool, hist: &[Move], rng: &mut u64) -> Option<Move> {
    // 只在前若干步查库：hist.len() 表示接下来的第 N 步（0-based）
    // 允许查到第 12 步为止，足以覆盖大多数主流开局
    if hist.len() >= 12 { return None; }

    // AI 执红 → 接下来轮到的是偶数半手（0/2/4/...）；执黑 → 奇数半手
    let is_red_to_move = hist.len() % 2 == 0;
    if is_red_to_move != ai_is_red { return None; }

    let cands = candidates(hist);
    if cands.is_empty() { return None; }
    // 去重：同一走法可能出现在多条前缀里，让频率高的更容易被选
    // （这里不去重是有意的：常见变化在库中出现多次 → 概率更大）
    let n = cands.len() as u64;
    let idx = (rand_next(rng) % n) as usize;
    Some(cands[idx])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn book_has_entries() {
        // 初始局面 AI 执红 → 库应至少给出一步
        let mut rng: u64 = 12345;
        let mv = book_move(&[0u8; NSQ], true, &[], &mut rng);
        assert!(mv.is_some());
    }

    #[test]
    fn book_no_central_pawn_first() {
        // 初始局面 AI 执红：无论 RNG 走 100 次，都不能出现 6,4-5,4（兵五进一）
        for seed in 1..200u64 {
            let mut r = seed;
            let mv = book_move(&[0u8; NSQ], true, &[], &mut r).expect("book must give red opening");
            assert!(mv != (6,4,5,4), "seed {} produced 兵五进一", seed);
        }
    }

    #[test]
    fn book_answers_zhongpao_as_black() {
        // 红走中炮 (7,7-7,4)，黑方（AI 执黑）库中应有多个应法
        let mut rng: u64 = 42;
        let hist = vec![(7,7,7,4)];
        let mv = book_move(&[0u8; NSQ], false, &hist, &mut rng);
        assert!(mv.is_some(), "black should have a book reply to 7,7-7,4");
    }
}
