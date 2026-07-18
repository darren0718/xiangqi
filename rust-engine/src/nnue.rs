// NNUE (Efficiently Updatable Neural Network) 推理引擎
// 兼容 Pikafish (Stockfish NNUE) 网络格式
// 参考: https://github.com/official-stockfish/nnue-pytorch/blob/master/docs/nnue.md

use crate::board::*;
use crate::rules::find_king;
// is_red is in board, already imported via crate::board::*
// is_black is in board

// ============ 架构常量（需与网络文件匹配） ============
const INPUT_BUCKETS: usize = 90; // 棋盘格数
const PIECE_TYPES: usize = 7;    // k/a/e/h/r/c/p
const COLORS: usize = 2;         // 己方/对方
const FEATURES_PER_BUCKET: usize = PIECE_TYPES * COLORS; // 14
const INPUT_SIZE: usize = INPUT_BUCKETS * INPUT_BUCKETS * FEATURES_PER_BUCKET; // 113400

// 网络层大小（从网络文件头部读取，这里给默认值）
const DEFAULT_L1: usize = 256;
const DEFAULT_L2: usize = 32;
const DEFAULT_L3: usize = 32;

// ============ 量化常量 ============
const QA: i32 = 255;
const QB: i32 = 64;
const QAB: i32 = QA * QB;

// ClippedReLU: min(max(0, x), QA)
#[inline]
fn crelu(x: i32) -> i32 {
    if x <= 0 { 0 } else if x >= QA { QA } else { x }
}

// ============ 网络结构 ============
pub struct NnueNet {
    pub loaded: bool,
    // 特征变换层
    ft_weights: Vec<Vec<(usize, i16)>>,  // [L1][(feat_idx, weight)] 稀疏存储
    ft_biases: Vec<i16>,        // [L1]
    // L1→L2
    l1_weights: Vec<i16>,       // [L1 * 2 * L2]
    l1_biases: Vec<i16>,        // [L2]
    // L2→L3
    l2_weights: Vec<i16>,       // [L2 * 2 * L3]
    l2_biases: Vec<i16>,        // [L3]
    // L3→Output
    l3_weights: Vec<i16>,       // [L3 * 2]
    l3_bias: i16,
    // 架构参数
    l1_size: usize,
    l2_size: usize,
    l3_size: usize,
}

impl NnueNet {
    pub fn new() -> Self {
        Self {
            loaded: false,
            ft_weights: vec![],
            ft_biases: vec![],
            l1_weights: vec![],
            l1_biases: vec![],
            l2_weights: vec![],
            l2_biases: vec![],
            l3_weights: vec![],
            l3_bias: 0,
            l1_size: DEFAULT_L1,
            l2_size: DEFAULT_L2,
            l3_size: DEFAULT_L3,
        }
    }

    /// 加载 NNUE 网络文件（二进制格式）
    /// 文件格式（与 Stockfish/Pikafish 兼容）：
    ///   4 bytes: version (0x00000001)
    ///   4 bytes: hash (network hash)
    ///   4 bytes: arch string length + arch string
    ///   4 bytes: L1 size
    ///   4 bytes: L2 size
    ///   4 bytes: L3 size
    ///   然后: FT biases, FT weights, L1, L2, L3 weights/biases
    pub fn load(&mut self, data: &[u8]) -> Result<(), String> {
        if data.len() < 20 {
            return Err("NNUE file too short".into());
        }
        
        let mut off = 0usize;
        let _read_i32 = |data: &[u8], off: &mut usize| -> i32 {
            let v = i32::from_le_bytes([data[*off], data[*off+1], data[*off+2], data[*off+3]]);
            *off += 4;
            v
        };
        let read_u32 = |data: &[u8], off: &mut usize| -> u32 {
            let v = u32::from_le_bytes([data[*off], data[*off+1], data[*off+2], data[*off+3]]);
            *off += 4;
            v
        };
        
        let version = read_u32(data, &mut off);
        if version != 1 {
            return Err(format!("unsupported NNUE version: {}", version));
        }
        
        let _hash = read_u32(data, &mut off);
        
        // Skip arch string
        let arch_len = read_u32(data, &mut off) as usize;
        if off + arch_len > data.len() { return Err("truncated arch string".into()); }
        off += arch_len;
        // Pad to 4-byte alignment
        off = (off + 3) & !3;
        
        self.l1_size = read_u32(data, &mut off) as usize;
        self.l2_size = read_u32(data, &mut off) as usize;
        self.l3_size = read_u32(data, &mut off) as usize;
        
        // Validate sizes
        if self.l1_size == 0 || self.l2_size == 0 || self.l3_size == 0 {
            return Err("invalid layer sizes".into());
        }
        
        // Read feature transformer biases (L1 * i16)
        let bias_size = self.l1_size * 2;
        if off + bias_size > data.len() { return Err("truncated FT biases".into()); }
        self.ft_biases = (0..self.l1_size).map(|i| {
            i16::from_le_bytes([data[off + i*2], data[off + i*2 + 1]])
        }).collect();
        off += bias_size;
        
        // Read feature transformer weights (sparse: for each input feature, list of (L1_idx, weight))
        // Format: for each L1 neuron: count + (input_idx, weight) pairs
        // Actually, simpler: the weights are stored as dense matrix [L1][INPUT_SIZE]
        // But for sparse storage, it's stored per L1 neuron
        self.ft_weights = vec![vec![]; self.l1_size];
        for l1 in 0..self.l1_size {
            if off + 4 > data.len() { return Err("truncated FT weights".into()); }
            let count = read_u32(data, &mut off) as usize;
            for _ in 0..count {
                if off + 4 > data.len() { return Err("truncated FT entry".into()); }
                let idx = read_u32(data, &mut off) as usize;
                let w = i16::from_le_bytes([data[off], data[off+1]]);
                off += 2;
                self.ft_weights[l1].push((idx, w));
            }
        }
        
        // Read L1 weights: [L1 * 2 * L2] i16
        let l1w_size = self.l1_size * 2 * self.l2_size * 2;
        if off + l1w_size > data.len() { return Err("truncated L1 weights".into()); }
        self.l1_weights = (0..self.l1_size * 2 * self.l2_size).map(|i| {
            i16::from_le_bytes([data[off + i*2], data[off + i*2 + 1]])
        }).collect();
        off += l1w_size;
        
        // Read L1 biases: [L2] i16
        let l1b_size = self.l2_size * 2;
        if off + l1b_size > data.len() { return Err("truncated L1 biases".into()); }
        self.l1_biases = (0..self.l2_size).map(|i| {
            i16::from_le_bytes([data[off + i*2], data[off + i*2 + 1]])
        }).collect();
        off += l1b_size;
        
        // Read L2 weights: [L2 * 2 * L3] i16
        let l2w_size = self.l2_size * 2 * self.l3_size * 2;
        if off + l2w_size > data.len() { return Err("truncated L2 weights".into()); }
        self.l2_weights = (0..self.l2_size * 2 * self.l3_size).map(|i| {
            i16::from_le_bytes([data[off + i*2], data[off + i*2 + 1]])
        }).collect();
        off += l2w_size;
        
        // Read L2 biases: [L3] i16
        let l2b_size = self.l3_size * 2;
        if off + l2b_size > data.len() { return Err("truncated L2 biases".into()); }
        self.l2_biases = (0..self.l3_size).map(|i| {
            i16::from_le_bytes([data[off + i*2], data[off + i*2 + 1]])
        }).collect();
        off += l2b_size;
        
        // Read L3 weights: [L3 * 2] i16
        let l3w_size = self.l3_size * 2 * 2;
        if off + l3w_size > data.len() { return Err("truncated L3 weights".into()); }
        self.l3_weights = (0..self.l3_size * 2).map(|i| {
            i16::from_le_bytes([data[off + i*2], data[off + i*2 + 1]])
        }).collect();
        off += l3w_size;
        
        // Read L3 bias: 1 i16
        if off + 2 > data.len() { return Err("truncated L3 bias".into()); }
        self.l3_bias = i16::from_le_bytes([data[off], data[off+1]]);
        
        self.loaded = true;
        Ok(())
    }
    
    /// 将棋盘编码为 NNUE 输入特征
    /// 返回激活的特征索引列表
    fn encode_features(&self, board: &Board, red_to_move: bool) -> Vec<usize> {
        let mut features = Vec::with_capacity(32);
        
        // 找到两方的王
        let (rk_r, rk_c) = match find_king(board, true) {
            Some(k) => k,
            None => return features,
        };
        let (bk_r, bk_c) = match find_king(board, false) {
            Some(k) => k,
            None => return features,
        };
        
        let (king_r, king_c) = if red_to_move { (rk_r, rk_c) } else { (bk_r, bk_c) };
        let king_sq = (king_r * 9 + king_c) as usize;
        
        // 遍历棋盘上所有棋子
        for r in 0..ROWS as i32 {
            for c in 0..COLS as i32 {
                let p = board[idx(r, c)];
                if p == 0 { continue; }
                
                let piece_sq = (r * 9 + c) as usize;
                let t = piece_type_lower(p);
                let pt_idx = match t {
                    b'k' => 0,
                    b'a' => 1,
                    b'e' => 2,
                    b'h' => 3,
                    b'r' => 4,
                    b'c' => 5,
                    b'p' => 6,
                    _ => continue,
                };
                
                // 视角：己方子 vs 对方子
                let own = if red_to_move { is_red(p) } else { is_black(p) };
                let color_idx = if own { 0 } else { 1 };
                
                let feat_idx = king_sq * INPUT_BUCKETS * FEATURES_PER_BUCKET
                    + piece_sq * FEATURES_PER_BUCKET
                    + pt_idx * COLORS
                    + color_idx;
                
                features.push(feat_idx);
            }
        }
        
        features
    }
    
    /// NNUE 前向推理
    pub fn evaluate(&self, board: &Board, red_to_move: bool) -> i32 {
        if !self.loaded { return 0; }
        
        let features = self.encode_features(board, red_to_move);
        if features.is_empty() { return 0; }
        
        // Step 1: Feature Transformer
        // 计算每个 L1 神经元的输出
        let mut l1_out = vec![0i32; self.l1_size];
        for l1_idx in 0..self.l1_size {
            let mut acc = self.ft_biases[l1_idx] as i32;
            for &(feat_idx, weight) in &self.ft_weights[l1_idx] {
                // 检查该特征是否激活
                if features.contains(&feat_idx) {
                    acc += weight as i32;
                }
            }
            l1_out[l1_idx] = crelu(acc * QA / 255);
        }
        
        // Step 2: L1 → L2
        // L1 output is used twice: once for current perspective, once for opponent
        let l1_double: Vec<i32> = l1_out.iter().flat_map(|&x| [x, x]).collect();
        let mut l2_out = vec![0i32; self.l2_size];
        for l2 in 0..self.l2_size {
            let mut acc = self.l1_biases[l2] as i32;
            for l1 in 0..self.l1_size * 2 {
                acc += l1_double[l1] * self.l1_weights[l1 * self.l2_size + l2] as i32;
            }
            l2_out[l2] = crelu(acc / QA);
        }
        
        // Step 3: L2 → L3
        let l2_double: Vec<i32> = l2_out.iter().flat_map(|&x| [x, x]).collect();
        let mut l3_out = vec![0i32; self.l3_size];
        for l3 in 0..self.l3_size {
            let mut acc = self.l2_biases[l3] as i32;
            for l2 in 0..self.l2_size * 2 {
                acc += l2_double[l2] * self.l2_weights[l2 * self.l3_size + l3] as i32;
            }
            l3_out[l3] = crelu(acc / QA);
        }
        
        // Step 4: L3 → Output
        let l3_double: Vec<i32> = l3_out.iter().flat_map(|&x| [x, x]).collect();
        let mut output = self.l3_bias as i32;
        for i in 0..self.l3_size * 2 {
            output += l3_double[i] * self.l3_weights[i] as i32;
        }
        
        // Scale output: stockfish NNUE outputs in centipawns * QA * QB scaling
        // Output = raw * SCALE / (QA * QB)
        output * 300 / QAB
    }
}

// ============ 全局 NNUE 实例 ============
// wasm 单线程，用 unsafe static 简单实现（避免添加依赖）
static mut NNUE_NET: Option<NnueNet> = None;

/// 加载 NNUE 网络（从字节数组）
pub fn nnue_load(data: &[u8]) -> Result<(), String> {
    let mut net = NnueNet::new();
    net.load(data)?;
    unsafe { NNUE_NET = Some(net); }
    Ok(())
}

/// 检查 NNUE 是否已加载
pub fn nnue_loaded() -> bool {
    unsafe { NNUE_NET.as_ref().map(|n| n.loaded).unwrap_or(false) }
}

/// NNUE 评估（如果网络未加载，返回 0，调用方应 fallback 到手写评估）
pub fn nnue_evaluate(board: &Board, red_to_move: bool) -> i32 {
    unsafe {
        if let Some(ref net) = NNUE_NET {
            if net.loaded {
                return net.evaluate(board, red_to_move);
            }
        }
    }
    0
}
