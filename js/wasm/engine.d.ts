declare namespace wasm_bindgen {
    /* tslint:disable */
    /* eslint-disable */

    export class WasmSearchResult {
        private constructor();
        free(): void;
        [Symbol.dispose](): void;
        best_from_c: number;
        best_from_r: number;
        best_to_c: number;
        best_to_r: number;
        depth: number;
        found: boolean;
        nodes: number;
        pv: Int32Array;
        score: number;
        time_ms: number;
    }

    export function ai_move_wasm(flat_board: Uint8Array, ai_is_red: boolean, max_depth: number, move_history_flat: Int32Array, time_limit_ms: number, on_progress?: Function | null): WasmSearchResult;

    export function all_legal_moves_flat(flat_board: Uint8Array, red_to_move: boolean): Int32Array;

    export function board_hash_wasm(flat_board: Uint8Array, red_to_move: boolean): string;

    export function evaluate_board(flat_board: Uint8Array): number;

    export function game_status_str(flat_board: Uint8Array, red_to_move: boolean): string;

    export function h_reset(): void;

    export function in_check_side(flat_board: Uint8Array, red: boolean): boolean;

    export function is_legal_move_wasm(flat_board: Uint8Array, fr: number, fc: number, tr: number, tc: number): boolean;

    export function legal_captures_flat(flat_board: Uint8Array, red_to_move: boolean): Int32Array;

    export function perft_wasm(flat_board: Uint8Array, red_to_move: boolean, depth: number): bigint;

    export function set_zobrist_seed(seed_hi: number, seed_lo: number): void;

    export function stop(): void;

    export function tt_clear(): void;

}
declare type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

declare interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_get_wasmsearchresult_best_from_c: (a: number) => number;
    readonly __wbg_get_wasmsearchresult_best_from_r: (a: number) => number;
    readonly __wbg_get_wasmsearchresult_best_to_c: (a: number) => number;
    readonly __wbg_get_wasmsearchresult_best_to_r: (a: number) => number;
    readonly __wbg_get_wasmsearchresult_depth: (a: number) => number;
    readonly __wbg_get_wasmsearchresult_found: (a: number) => number;
    readonly __wbg_get_wasmsearchresult_nodes: (a: number) => number;
    readonly __wbg_get_wasmsearchresult_pv: (a: number) => [number, number];
    readonly __wbg_get_wasmsearchresult_score: (a: number) => number;
    readonly __wbg_get_wasmsearchresult_time_ms: (a: number) => number;
    readonly __wbg_set_wasmsearchresult_best_from_c: (a: number, b: number) => void;
    readonly __wbg_set_wasmsearchresult_best_from_r: (a: number, b: number) => void;
    readonly __wbg_set_wasmsearchresult_best_to_c: (a: number, b: number) => void;
    readonly __wbg_set_wasmsearchresult_best_to_r: (a: number, b: number) => void;
    readonly __wbg_set_wasmsearchresult_depth: (a: number, b: number) => void;
    readonly __wbg_set_wasmsearchresult_found: (a: number, b: number) => void;
    readonly __wbg_set_wasmsearchresult_nodes: (a: number, b: number) => void;
    readonly __wbg_set_wasmsearchresult_pv: (a: number, b: number, c: number) => void;
    readonly __wbg_set_wasmsearchresult_score: (a: number, b: number) => void;
    readonly __wbg_set_wasmsearchresult_time_ms: (a: number, b: number) => void;
    readonly __wbg_wasmsearchresult_free: (a: number, b: number) => void;
    readonly ai_move_wasm: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => number;
    readonly all_legal_moves_flat: (a: number, b: number, c: number) => [number, number];
    readonly board_hash_wasm: (a: number, b: number, c: number) => [number, number];
    readonly evaluate_board: (a: number, b: number) => number;
    readonly game_status_str: (a: number, b: number, c: number) => [number, number];
    readonly in_check_side: (a: number, b: number, c: number) => number;
    readonly is_legal_move_wasm: (a: number, b: number, c: number, d: number, e: number, f: number) => number;
    readonly legal_captures_flat: (a: number, b: number, c: number) => [number, number];
    readonly perft_wasm: (a: number, b: number, c: number, d: number) => bigint;
    readonly tt_clear: () => void;
    readonly set_zobrist_seed: (a: number, b: number) => void;
    readonly h_reset: () => void;
    readonly stop: () => void;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_start: () => void;
}

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
declare function wasm_bindgen (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
