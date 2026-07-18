// NNUE (Efficiently Updatable Neural Network) 推理引擎
// 加载简化格式的 Pikafish 网络（由 convert_nnue.py 生成）

use crate::board::*;

// 量化常量
const QA: i32 = 255;
const QB: i32 = 64;
const QAB: i32 = QA * QB;
const OUTPUT_SCALE: i32 = 400;

// 网络架构
const L1: usize = 1024;
const L2: usize = 32;
const L3: usize = 32;
const PSQ_DIMS: usize = 16536;

#[inline]
fn crelu(x: i32) -> i32 {
    if x <= 0 { 0 } else if x >= QA { QA } else { x }
}

pub struct NnueNet {
    pub loaded: bool,
    ft_biases: Vec<i16>,     // [L1]
    ft_weights: Vec<u8>,     // [PSQ_DIMS * L1]  (row-major: ft_weights[feat * L1 + l1])
    fc0_biases: Vec<i16>,    // [L2]
    fc0_weights: Vec<i8>,    // [L2 * L1 * 2]  (row-major)
    fc1_biases: Vec<i16>,    // [L3]
    fc1_weights: Vec<i8>,    // [L3 * L2 * 2]
    fc2_biases: Vec<i16>,    // [1]
    fc2_weights: Vec<i8>,    // [1 * L3 * 2]
}

impl NnueNet {
    pub fn new() -> Self {
        Self {
            loaded: false,
            ft_biases: vec![],
            ft_weights: vec![],
            fc0_biases: vec![],
            fc0_weights: vec![],
            fc1_biases: vec![],
            fc1_weights: vec![],
            fc2_biases: vec![],
            fc2_weights: vec![],
        }
    }

    pub fn load(&mut self, data: &[u8]) -> Result<(), String> {
        if data.len() < 24 { return Err("too short".into()); }
        let mut off = 0usize;
        let read_u32 = |data: &[u8], off: &mut usize| -> u32 {
            let v = u32::from_le_bytes([data[*off], data[*off+1], data[*off+2], data[*off+3]]);
            *off += 4; v
        };
        let magic = read_u32(data, &mut off);
        if magic != 0x4E4E5545 { return Err(format!("bad magic: {:#x}", magic)); }
        let l1 = read_u32(data, &mut off) as usize;
        let l2 = read_u32(data, &mut off) as usize;
        let l3 = read_u32(data, &mut off) as usize;
        let psq = read_u32(data, &mut off) as usize;
        if l1 != L1 || l2 != L2 || l3 != L3 || psq != PSQ_DIMS {
            return Err(format!("dim mismatch: {}/{}/{}/{}", l1, l2, l3, psq));
        }

        // FT biases
        let n = read_u32(data, &mut off) as usize;
        self.ft_biases = (0..n).map(|_| {
            let v = i16::from_le_bytes([data[off], data[off+1]]); off += 2; v
        }).collect();

        // FT weights (u8)
        let n = read_u32(data, &mut off) as usize;
        self.ft_weights = data[off..off+n].to_vec(); off += n;

        // FC layers
        let read_fc = |data: &[u8], off: &mut usize, n_biases: usize, n_weights: usize|
            -> (Vec<i16>, Vec<i8>)
        {
            let nb = read_u32(data, off) as usize;
            let biases: Vec<i16> = (0..nb).map(|_| {
                let v = i16::from_le_bytes([data[*off], data[*off+1]]); *off += 2; v
            }).collect();
            let nw = read_u32(data, off) as usize;
            let weights: Vec<i8> = data[*off..*off+nw].iter().map(|&b| b as i8).collect();
            *off += nw;
            (biases, weights)
        };

        let (b0, w0) = read_fc(data, &mut off, L2, L2 * L1 * 2);
        self.fc0_biases = b0; self.fc0_weights = w0;
        let (b1, w1) = read_fc(data, &mut off, L3, L3 * L2 * 2);
        self.fc1_biases = b1; self.fc1_weights = w1;
        let (b2, w2) = read_fc(data, &mut off, 1, L3 * 2);
        self.fc2_biases = b2; self.fc2_weights = w2;

        self.loaded = true;
        Ok(())
    }

    /// 特征编码：HalfKAv2_hm 简化版
    /// 返回激活的特征索引列表
    fn encode_features(&self, board: &Board, red_to_move: bool) -> Vec<usize> {
        let mut feats = Vec::with_capacity(32);
        let (kr, kc) = if red_to_move {
            match find_king(board, true) { Some(k) => k, None => return feats }
        } else {
            match find_king(board, false) { Some(k) => k, None => return feats }
        };

        // King bucket: 简化版，将 king 位置映射到 bucket
        let king_sq = (kr * 9 + kc) as usize;
        // 简化 bucket: 使用 king 的 file + rank
        let king_bucket = (kc as usize) * 10 + (kr as usize); // 0-89

        // 遍历所有棋子
        for r in 0..ROWS as i32 {
            for c in 0..COLS as i32 {
                let p = board[idx(r, c)];
                if p == 0 { continue; }
                let own = if red_to_move { is_red(p) } else { is_black(p) };
                let pt = piece_type_lower(p);
                let pt_idx = match pt {
                    b'k' => 0, b'a' => 1, b'e' => 2, b'h' => 3,
                    b'r' => 4, b'c' => 5, b'p' => 6, _ => continue,
                };
                let color_idx = if own { 0 } else { 1 };
                let piece_sq = (r * 9 + c) as usize;

                // 简化特征索引
                let feat = king_bucket * 90 * 14 + piece_sq * 14 + pt_idx * 2 + color_idx;
                if feat < PSQ_DIMS {
                    feats.push(feat);
                }
            }
        }
        feats
    }

    /// 前向推理
    pub fn evaluate(&self, board: &Board, red_to_move: bool) -> i32 {
        if !self.loaded { return 0; }
        let feats = self.encode_features(board, red_to_move);
        if feats.is_empty() { return 0; }

        // Feature Transformer
        let mut l1_out = vec![0i32; L1];
        for l1_idx in 0..L1 {
            let mut acc = self.ft_biases[l1_idx] as i32;
            for &f in &feats {
                acc += self.ft_weights[f * L1 + l1_idx] as i32;
            }
            l1_out[l1_idx] = crelu(acc);
        }

        // FC_0: L1*2 → L2
        let l1_double: Vec<i32> = l1_out.iter().flat_map(|&x| [x, x]).collect();
        let mut l2_out = vec![0i32; L2];
        for l2 in 0..L2 {
            let mut acc = self.fc0_biases[l2] as i32;
            for l1 in 0..L1*2 {
                acc += l1_double[l1] * self.fc0_weights[l2 * L1 * 2 + l1] as i32;
            }
            l2_out[l2] = crelu(acc / QA);
        }

        // FC_1: L2*2 → L3
        let l2_double: Vec<i32> = l2_out.iter().flat_map(|&x| [x, x]).collect();
        let mut l3_out = vec![0i32; L3];
        for l3 in 0..L3 {
            let mut acc = self.fc1_biases[l3] as i32;
            for l2 in 0..L2*2 {
                acc += l2_double[l2] * self.fc1_weights[l3 * L2 * 2 + l2] as i32;
            }
            l3_out[l3] = crelu(acc / QA);
        }

        // FC_2: L3*2 → 1
        let l3_double: Vec<i32> = l3_out.iter().flat_map(|&x| [x, x]).collect();
        let mut output = self.fc2_biases[0] as i32;
        for i in 0..L3*2 {
            output += l3_double[i] * self.fc2_weights[i] as i32;
        }

        // Scale to centipawns
        let cp = output * OUTPUT_SCALE / QAB;
        if red_to_move { cp } else { -cp }
    }
}

// ============ 全局实例 ============
static mut NNUE_NET: Option<NnueNet> = None;

pub fn nnue_load(data: &[u8]) -> Result<(), String> {
    let mut net = NnueNet::new();
    net.load(data)?;
    unsafe { NNUE_NET = Some(net); }
    Ok(())
}

pub fn nnue_loaded() -> bool {
    unsafe { NNUE_NET.as_ref().map(|n| n.loaded).unwrap_or(false) }
}

pub fn nnue_evaluate(board: &Board, red_to_move: bool) -> i32 {
    unsafe {
        if let Some(ref net) = NNUE_NET {
            if net.loaded { return net.evaluate(board, red_to_move); }
        }
    }
    0
}

use crate::rules::find_king;
