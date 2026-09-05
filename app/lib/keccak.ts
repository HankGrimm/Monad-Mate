/**
 * Minimal Keccak-256 so ABI selectors are computed rather than hardcoded.
 *
 * Rationale: the deposit path previously carried a hand-written
 * `stake(bytes32,uint8)` selector constant. If such a constant is wrong, every
 * deposit reverts and the failure looks like a wallet problem rather than a
 * code problem. Deriving it at runtime removes that class of silent bug and
 * keeps the selector correct if the contract signature ever changes.
 *
 * This is Ethereum's Keccak-256 (0x01 padding), **not** NIST SHA3-256. It is
 * used only for short function-signature strings, so the straightforward
 * implementation is fast enough and avoids adding a dependency.
 */

const ROUND_CONSTANTS = [
  0x00000001, 0x00008082, 0x0000808a, 0x80008000, 0x0000808b, 0x80000001,
  0x80008081, 0x00008009, 0x0000008a, 0x00000088, 0x80008009, 0x8000000a,
  0x8000808b, 0x0000008b, 0x00008089, 0x00008003, 0x00008002, 0x00000080,
  0x0000800a, 0x8000000a, 0x80008081, 0x00008080, 0x80000001, 0x80008008,
];

const ROUND_CONSTANTS_HI = [
  0x00000000, 0x00000000, 0x80000000, 0x80000000, 0x00000000, 0x00000000,
  0x80000000, 0x80000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000,
  0x00000000, 0x80000000, 0x80000000, 0x80000000, 0x80000000, 0x80000000,
  0x00000000, 0x80000000, 0x80000000, 0x80000000, 0x00000000, 0x80000000,
];

const RHO_OFFSETS = [
  0, 1, 62, 28, 27, 36, 44, 6, 55, 20, 3, 10, 43, 25, 39, 41, 45, 15, 21, 8,
  18, 2, 61, 56, 14,
];

const PI_INDEXES = [
  0, 6, 12, 18, 24, 3, 9, 10, 16, 22, 1, 7, 13, 19, 20, 4, 5, 11, 17, 23, 2,
  8, 14, 15, 21,
];

/** 64-bit lane held as [low32, high32]. */
type Lane = [number, number];

function rotl64(lane: Lane, n: number): Lane {
  const [lo, hi] = lane;
  if (n === 0) return [lo, hi];
  if (n < 32) {
    return [
      ((lo << n) | (hi >>> (32 - n))) >>> 0,
      ((hi << n) | (lo >>> (32 - n))) >>> 0,
    ];
  }
  const m = n - 32;
  if (m === 0) return [hi, lo];
  return [
    ((hi << m) | (lo >>> (32 - m))) >>> 0,
    ((lo << m) | (hi >>> (32 - m))) >>> 0,
  ];
}

function keccakF(state: Lane[]): void {
  for (let round = 0; round < 24; round++) {
    // Theta
    const c: Lane[] = [];
    for (let x = 0; x < 5; x++) {
      let lo = 0;
      let hi = 0;
      for (let y = 0; y < 5; y++) {
        lo ^= state[x + 5 * y][0];
        hi ^= state[x + 5 * y][1];
      }
      c[x] = [lo >>> 0, hi >>> 0];
    }
    for (let x = 0; x < 5; x++) {
      const rotated = rotl64(c[(x + 1) % 5], 1);
      const dLo = (c[(x + 4) % 5][0] ^ rotated[0]) >>> 0;
      const dHi = (c[(x + 4) % 5][1] ^ rotated[1]) >>> 0;
      for (let y = 0; y < 5; y++) {
        const i = x + 5 * y;
        state[i] = [(state[i][0] ^ dLo) >>> 0, (state[i][1] ^ dHi) >>> 0];
      }
    }

    // Rho + Pi
    const b: Lane[] = new Array(25);
    for (let i = 0; i < 25; i++) {
      b[PI_INDEXES.indexOf(i) >= 0 ? 0 : 0] = b[0]; // no-op, keeps shape clear
    }
    for (let i = 0; i < 25; i++) {
      b[i] = [0, 0];
    }
    for (let i = 0; i < 25; i++) {
      const x = i % 5;
      const y = Math.floor(i / 5);
      const target = y + 5 * ((2 * x + 3 * y) % 5);
      b[target] = rotl64(state[i], RHO_OFFSETS[i]);
    }

    // Chi
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 5; x++) {
        const i = x + 5 * y;
        const n1 = b[((x + 1) % 5) + 5 * y];
        const n2 = b[((x + 2) % 5) + 5 * y];
        state[i] = [
          (b[i][0] ^ (~n1[0] & n2[0])) >>> 0,
          (b[i][1] ^ (~n1[1] & n2[1])) >>> 0,
        ];
      }
    }

    // Iota
    state[0] = [
      (state[0][0] ^ ROUND_CONSTANTS[round]) >>> 0,
      (state[0][1] ^ ROUND_CONSTANTS_HI[round]) >>> 0,
    ];
  }
}

/** Keccak-256 of a UTF-8 string, returned as lowercase hex without 0x. */
export function keccak256Hex(input: string): string {
  const bytes = new TextEncoder().encode(input);
  const rate = 136; // 1088 bits for Keccak-256

  // Pad: 0x01 ... 0x80 (Ethereum's Keccak, not SHA3's 0x06)
  const padLength = rate - (bytes.length % rate);
  const padded = new Uint8Array(bytes.length + padLength);
  padded.set(bytes);
  padded[bytes.length] = 0x01;
  padded[padded.length - 1] |= 0x80;

  const state: Lane[] = Array.from({ length: 25 }, () => [0, 0] as Lane);

  for (let offset = 0; offset < padded.length; offset += rate) {
    for (let i = 0; i < rate / 8; i++) {
      const base = offset + i * 8;
      const lo =
        (padded[base] |
          (padded[base + 1] << 8) |
          (padded[base + 2] << 16) |
          (padded[base + 3] << 24)) >>>
        0;
      const hi =
        (padded[base + 4] |
          (padded[base + 5] << 8) |
          (padded[base + 6] << 16) |
          (padded[base + 7] << 24)) >>>
        0;
      state[i] = [(state[i][0] ^ lo) >>> 0, (state[i][1] ^ hi) >>> 0];
    }
    keccakF(state);
  }

  // Squeeze 32 bytes
  let out = "";
  for (let i = 0; i < 4; i++) {
    const [lo, hi] = state[i];
    for (let b = 0; b < 4; b++) {
      out += ((lo >>> (8 * b)) & 0xff).toString(16).padStart(2, "0");
    }
    for (let b = 0; b < 4; b++) {
      out += ((hi >>> (8 * b)) & 0xff).toString(16).padStart(2, "0");
    }
  }
  return out;
}

/** First 4 bytes of keccak256(signature) — the ABI function selector. */
export function functionSelector(signature: string): string {
  return keccak256Hex(signature).slice(0, 8);
}
