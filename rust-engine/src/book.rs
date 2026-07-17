// 开局库（对齐 js/engine-worker.js bookMove）
use crate::board::*;

pub fn book_move(_board: &Board, ai_is_red: bool, hist: &[(i32,i32,i32,i32)], rng: &mut u64) -> Option<(i32,i32,i32,i32)> {
    if hist.len() >= 4 { return None; }
    #[inline] fn rand_next(x: &mut u64) -> u64 { let mut v=*x; v^=v<<13; v^=v>>7; v^=v<<17; *x=v; v }
    #[inline] fn pick<T: Copy>(list: &[T], rng: &mut u64) -> T { let n = list.len() as u64; list[(rand_next(rng) % n) as usize] }
    if hist.is_empty() && ai_is_red {
        let ops = [(7,7,7,4),(7,1,7,4),(9,1,7,2),(9,7,7,6),(6,2,5,2),(6,6,5,6),(6,4,5,4),(9,2,7,4)];
        return Some(pick(&ops, rng));
    }
    if hist.len() == 1 && !ai_is_red {
        let first = hist[0];
        if (first.0==7 && first.1==7 && first.2==7 && first.3==4) || (first.0==7 && first.1==1 && first.2==7 && first.3==4) {
            let res = [(0,1,2,2),(0,7,2,6),(2,1,2,4),(2,7,2,4),(3,4,4,4)];
            return Some(pick(&res, rng));
        }
        if (first.0==9 && first.1==1 && first.2==7 && first.3==2) || (first.0==9 && first.1==7 && first.2==7 && first.3==6) {
            return Some((0,1,2,2));
        }
        if first.0 == 6 && first.3 == 5 { return Some((3,4,4,4)); }
    }
    None
}
