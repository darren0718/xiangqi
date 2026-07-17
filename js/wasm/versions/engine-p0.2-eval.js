let wasm_bindgen = (function(exports) {
    let script_src;
    if (typeof document !== 'undefined' && document.currentScript !== null) {
        script_src = new URL(document.currentScript.src, location.href).toString();
    }

    class WasmSearchResult {
        static __wrap(ptr) {
            const obj = Object.create(WasmSearchResult.prototype);
            obj.__wbg_ptr = ptr;
            WasmSearchResultFinalization.register(obj, obj.__wbg_ptr, obj);
            return obj;
        }
        __destroy_into_raw() {
            const ptr = this.__wbg_ptr;
            this.__wbg_ptr = 0;
            WasmSearchResultFinalization.unregister(this);
            return ptr;
        }
        free() {
            const ptr = this.__destroy_into_raw();
            wasm.__wbg_wasmsearchresult_free(ptr, 0);
        }
        /**
         * @returns {number}
         */
        get best_from_c() {
            const ret = wasm.__wbg_get_wasmsearchresult_best_from_c(this.__wbg_ptr);
            return ret;
        }
        /**
         * @returns {number}
         */
        get best_from_r() {
            const ret = wasm.__wbg_get_wasmsearchresult_best_from_r(this.__wbg_ptr);
            return ret;
        }
        /**
         * @returns {number}
         */
        get best_to_c() {
            const ret = wasm.__wbg_get_wasmsearchresult_best_to_c(this.__wbg_ptr);
            return ret;
        }
        /**
         * @returns {number}
         */
        get best_to_r() {
            const ret = wasm.__wbg_get_wasmsearchresult_best_to_r(this.__wbg_ptr);
            return ret;
        }
        /**
         * @returns {number}
         */
        get depth() {
            const ret = wasm.__wbg_get_wasmsearchresult_depth(this.__wbg_ptr);
            return ret;
        }
        /**
         * @returns {boolean}
         */
        get found() {
            const ret = wasm.__wbg_get_wasmsearchresult_found(this.__wbg_ptr);
            return ret !== 0;
        }
        /**
         * @returns {number}
         */
        get nodes() {
            const ret = wasm.__wbg_get_wasmsearchresult_nodes(this.__wbg_ptr);
            return ret >>> 0;
        }
        /**
         * @returns {Int32Array}
         */
        get pv() {
            const ret = wasm.__wbg_get_wasmsearchresult_pv(this.__wbg_ptr);
            var v1 = getArrayI32FromWasm0(ret[0], ret[1]).slice();
            wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
            return v1;
        }
        /**
         * @returns {number}
         */
        get score() {
            const ret = wasm.__wbg_get_wasmsearchresult_score(this.__wbg_ptr);
            return ret;
        }
        /**
         * @returns {number}
         */
        get time_ms() {
            const ret = wasm.__wbg_get_wasmsearchresult_time_ms(this.__wbg_ptr);
            return ret;
        }
        /**
         * @param {number} arg0
         */
        set best_from_c(arg0) {
            wasm.__wbg_set_wasmsearchresult_best_from_c(this.__wbg_ptr, arg0);
        }
        /**
         * @param {number} arg0
         */
        set best_from_r(arg0) {
            wasm.__wbg_set_wasmsearchresult_best_from_r(this.__wbg_ptr, arg0);
        }
        /**
         * @param {number} arg0
         */
        set best_to_c(arg0) {
            wasm.__wbg_set_wasmsearchresult_best_to_c(this.__wbg_ptr, arg0);
        }
        /**
         * @param {number} arg0
         */
        set best_to_r(arg0) {
            wasm.__wbg_set_wasmsearchresult_best_to_r(this.__wbg_ptr, arg0);
        }
        /**
         * @param {number} arg0
         */
        set depth(arg0) {
            wasm.__wbg_set_wasmsearchresult_depth(this.__wbg_ptr, arg0);
        }
        /**
         * @param {boolean} arg0
         */
        set found(arg0) {
            wasm.__wbg_set_wasmsearchresult_found(this.__wbg_ptr, arg0);
        }
        /**
         * @param {number} arg0
         */
        set nodes(arg0) {
            wasm.__wbg_set_wasmsearchresult_nodes(this.__wbg_ptr, arg0);
        }
        /**
         * @param {Int32Array} arg0
         */
        set pv(arg0) {
            const ptr0 = passArray32ToWasm0(arg0, wasm.__wbindgen_malloc);
            const len0 = WASM_VECTOR_LEN;
            wasm.__wbg_set_wasmsearchresult_pv(this.__wbg_ptr, ptr0, len0);
        }
        /**
         * @param {number} arg0
         */
        set score(arg0) {
            wasm.__wbg_set_wasmsearchresult_score(this.__wbg_ptr, arg0);
        }
        /**
         * @param {number} arg0
         */
        set time_ms(arg0) {
            wasm.__wbg_set_wasmsearchresult_time_ms(this.__wbg_ptr, arg0);
        }
    }
    if (Symbol.dispose) WasmSearchResult.prototype[Symbol.dispose] = WasmSearchResult.prototype.free;
    exports.WasmSearchResult = WasmSearchResult;

    /**
     * @param {Uint8Array} flat_board
     * @param {boolean} ai_is_red
     * @param {number} max_depth
     * @param {Int32Array} move_history_flat
     * @param {number} time_limit_ms
     * @param {Function | null} [on_progress]
     * @returns {WasmSearchResult}
     */
    function ai_move_wasm(flat_board, ai_is_red, max_depth, move_history_flat, time_limit_ms, on_progress) {
        const ptr0 = passArray8ToWasm0(flat_board, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArray32ToWasm0(move_history_flat, wasm.__wbindgen_malloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.ai_move_wasm(ptr0, len0, ai_is_red, max_depth, ptr1, len1, time_limit_ms, isLikeNone(on_progress) ? 0 : addToExternrefTable0(on_progress));
        return WasmSearchResult.__wrap(ret);
    }
    exports.ai_move_wasm = ai_move_wasm;

    /**
     * @param {Uint8Array} flat_board
     * @param {boolean} red_to_move
     * @returns {Int32Array}
     */
    function all_legal_moves_flat(flat_board, red_to_move) {
        const ptr0 = passArray8ToWasm0(flat_board, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.all_legal_moves_flat(ptr0, len0, red_to_move);
        var v2 = getArrayI32FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v2;
    }
    exports.all_legal_moves_flat = all_legal_moves_flat;

    /**
     * @param {Uint8Array} flat_board
     * @param {boolean} red_to_move
     * @returns {string}
     */
    function board_hash_wasm(flat_board, red_to_move) {
        let deferred2_0;
        let deferred2_1;
        try {
            const ptr0 = passArray8ToWasm0(flat_board, wasm.__wbindgen_malloc);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.board_hash_wasm(ptr0, len0, red_to_move);
            deferred2_0 = ret[0];
            deferred2_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
        }
    }
    exports.board_hash_wasm = board_hash_wasm;

    /**
     * @param {Uint8Array} flat_board
     * @param {boolean} red_to_move
     * @returns {number}
     */
    function evaluate_board(flat_board, red_to_move) {
        const ptr0 = passArray8ToWasm0(flat_board, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.evaluate_board(ptr0, len0, red_to_move);
        return ret;
    }
    exports.evaluate_board = evaluate_board;

    /**
     * @param {Uint8Array} flat_board
     * @param {boolean} red_to_move
     * @returns {string}
     */
    function game_status_str(flat_board, red_to_move) {
        let deferred2_0;
        let deferred2_1;
        try {
            const ptr0 = passArray8ToWasm0(flat_board, wasm.__wbindgen_malloc);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.game_status_str(ptr0, len0, red_to_move);
            deferred2_0 = ret[0];
            deferred2_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
        }
    }
    exports.game_status_str = game_status_str;

    function h_reset() {
        wasm.h_reset();
    }
    exports.h_reset = h_reset;

    /**
     * @param {Uint8Array} flat_board
     * @param {boolean} red
     * @returns {boolean}
     */
    function in_check_side(flat_board, red) {
        const ptr0 = passArray8ToWasm0(flat_board, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.in_check_side(ptr0, len0, red);
        return ret !== 0;
    }
    exports.in_check_side = in_check_side;

    /**
     * @param {Uint8Array} flat_board
     * @param {number} fr
     * @param {number} fc
     * @param {number} tr
     * @param {number} tc
     * @returns {boolean}
     */
    function is_legal_move_wasm(flat_board, fr, fc, tr, tc) {
        const ptr0 = passArray8ToWasm0(flat_board, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.is_legal_move_wasm(ptr0, len0, fr, fc, tr, tc);
        return ret !== 0;
    }
    exports.is_legal_move_wasm = is_legal_move_wasm;

    /**
     * @param {Uint8Array} flat_board
     * @param {boolean} red_to_move
     * @returns {Int32Array}
     */
    function legal_captures_flat(flat_board, red_to_move) {
        const ptr0 = passArray8ToWasm0(flat_board, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.legal_captures_flat(ptr0, len0, red_to_move);
        var v2 = getArrayI32FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v2;
    }
    exports.legal_captures_flat = legal_captures_flat;

    /**
     * @param {Uint8Array} flat_board
     * @param {boolean} red_to_move
     * @param {number} depth
     * @returns {bigint}
     */
    function perft_wasm(flat_board, red_to_move, depth) {
        const ptr0 = passArray8ToWasm0(flat_board, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.perft_wasm(ptr0, len0, red_to_move, depth);
        return BigInt.asUintN(64, ret);
    }
    exports.perft_wasm = perft_wasm;

    /**
     * @param {number} seed_hi
     * @param {number} seed_lo
     */
    function set_zobrist_seed(seed_hi, seed_lo) {
        wasm.set_zobrist_seed(seed_hi, seed_lo);
    }
    exports.set_zobrist_seed = set_zobrist_seed;

    function stop() {
        wasm.stop();
    }
    exports.stop = stop;

    function tt_clear() {
        wasm.tt_clear();
    }
    exports.tt_clear = tt_clear;
    function __wbg_get_imports() {
        const import0 = {
            __proto__: null,
            __wbg___wbindgen_throw_344f42d3211c4765: function(arg0, arg1) {
                throw new Error(getStringFromWasm0(arg0, arg1));
            },
            __wbg_call_a6e5c5dce5018821: function() { return handleError(function (arg0, arg1, arg2) {
                const ret = arg0.call(arg1, arg2);
                return ret;
            }, arguments); },
            __wbg_new_da52cf8fe3429cb2: function() {
                const ret = new Object();
                return ret;
            },
            __wbg_new_from_slice_adc482e0820cc439: function(arg0, arg1) {
                const ret = new Int32Array(getArrayI32FromWasm0(arg0, arg1));
                return ret;
            },
            __wbg_now_86c0d4ba3fa605b8: function() {
                const ret = Date.now();
                return ret;
            },
            __wbg_set_8535240470bf2500: function() { return handleError(function (arg0, arg1, arg2) {
                const ret = Reflect.set(arg0, arg1, arg2);
                return ret;
            }, arguments); },
            __wbindgen_cast_0000000000000001: function(arg0) {
                // Cast intrinsic for `F64 -> Externref`.
                const ret = arg0;
                return ret;
            },
            __wbindgen_cast_0000000000000002: function(arg0, arg1) {
                // Cast intrinsic for `Ref(String) -> Externref`.
                const ret = getStringFromWasm0(arg0, arg1);
                return ret;
            },
            __wbindgen_init_externref_table: function() {
                const table = wasm.__wbindgen_externrefs;
                const offset = table.grow(4);
                table.set(0, undefined);
                table.set(offset + 0, undefined);
                table.set(offset + 1, null);
                table.set(offset + 2, true);
                table.set(offset + 3, false);
            },
        };
        return {
            __proto__: null,
            "./engine_bg.js": import0,
        };
    }

    const WasmSearchResultFinalization = (typeof FinalizationRegistry === 'undefined')
        ? { register: () => {}, unregister: () => {} }
        : new FinalizationRegistry(ptr => wasm.__wbg_wasmsearchresult_free(ptr, 1));

    function addToExternrefTable0(obj) {
        const idx = wasm.__externref_table_alloc();
        wasm.__wbindgen_externrefs.set(idx, obj);
        return idx;
    }

    function getArrayI32FromWasm0(ptr, len) {
        ptr = ptr >>> 0;
        return getInt32ArrayMemory0().subarray(ptr / 4, ptr / 4 + len);
    }

    let cachedInt32ArrayMemory0 = null;
    function getInt32ArrayMemory0() {
        if (cachedInt32ArrayMemory0 === null || cachedInt32ArrayMemory0.byteLength === 0) {
            cachedInt32ArrayMemory0 = new Int32Array(wasm.memory.buffer);
        }
        return cachedInt32ArrayMemory0;
    }

    function getStringFromWasm0(ptr, len) {
        return decodeText(ptr >>> 0, len);
    }

    let cachedUint32ArrayMemory0 = null;
    function getUint32ArrayMemory0() {
        if (cachedUint32ArrayMemory0 === null || cachedUint32ArrayMemory0.byteLength === 0) {
            cachedUint32ArrayMemory0 = new Uint32Array(wasm.memory.buffer);
        }
        return cachedUint32ArrayMemory0;
    }

    let cachedUint8ArrayMemory0 = null;
    function getUint8ArrayMemory0() {
        if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
            cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
        }
        return cachedUint8ArrayMemory0;
    }

    function handleError(f, args) {
        try {
            return f.apply(this, args);
        } catch (e) {
            const idx = addToExternrefTable0(e);
            wasm.__wbindgen_exn_store(idx);
        }
    }

    function isLikeNone(x) {
        return x === undefined || x === null;
    }

    function passArray32ToWasm0(arg, malloc) {
        const ptr = malloc(arg.length * 4, 4) >>> 0;
        getUint32ArrayMemory0().set(arg, ptr / 4);
        WASM_VECTOR_LEN = arg.length;
        return ptr;
    }

    function passArray8ToWasm0(arg, malloc) {
        const ptr = malloc(arg.length * 1, 1) >>> 0;
        getUint8ArrayMemory0().set(arg, ptr / 1);
        WASM_VECTOR_LEN = arg.length;
        return ptr;
    }

    let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
    cachedTextDecoder.decode();
    function decodeText(ptr, len) {
        return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
    }

    let WASM_VECTOR_LEN = 0;

    let wasmModule, wasmInstance, wasm;
    function __wbg_finalize_init(instance, module) {
        wasmInstance = instance;
        wasm = instance.exports;
        wasmModule = module;
        cachedInt32ArrayMemory0 = null;
        cachedUint32ArrayMemory0 = null;
        cachedUint8ArrayMemory0 = null;
        wasm.__wbindgen_start();
        return wasm;
    }

    async function __wbg_load(module, imports) {
        if (typeof Response === 'function' && module instanceof Response) {
            if (typeof WebAssembly.instantiateStreaming === 'function') {
                try {
                    return await WebAssembly.instantiateStreaming(module, imports);
                } catch (e) {
                    const validResponse = module.ok && expectedResponseType(module.type);

                    if (validResponse && module.headers.get('Content-Type') !== 'application/wasm') {
                        console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                    } else { throw e; }
                }
            }

            const bytes = await module.arrayBuffer();
            return await WebAssembly.instantiate(bytes, imports);
        } else {
            const instance = await WebAssembly.instantiate(module, imports);

            if (instance instanceof WebAssembly.Instance) {
                return { instance, module };
            } else {
                return instance;
            }
        }

        function expectedResponseType(type) {
            switch (type) {
                case 'basic': case 'cors': case 'default': return true;
            }
            return false;
        }
    }

    function initSync(module) {
        if (wasm !== undefined) return wasm;


        if (module !== undefined) {
            if (Object.getPrototypeOf(module) === Object.prototype) {
                ({module} = module)
            } else {
                console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
            }
        }

        const imports = __wbg_get_imports();
        if (!(module instanceof WebAssembly.Module)) {
            module = new WebAssembly.Module(module);
        }
        const instance = new WebAssembly.Instance(module, imports);
        return __wbg_finalize_init(instance, module);
    }

    async function __wbg_init(module_or_path) {
        if (wasm !== undefined) return wasm;


        if (module_or_path !== undefined) {
            if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
                ({module_or_path} = module_or_path)
            } else {
                console.warn('using deprecated parameters for the initialization function; pass a single object instead')
            }
        }

        if (module_or_path === undefined && script_src !== undefined) {
            module_or_path = script_src.replace(/\.js$/, "_bg.wasm");
        }
        const imports = __wbg_get_imports();

        if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
            module_or_path = fetch(module_or_path);
        }

        const { instance, module } = await __wbg_load(await module_or_path, imports);

        return __wbg_finalize_init(instance, module);
    }

    return Object.assign(__wbg_init, { initSync }, exports);
})({ __proto__: null });
