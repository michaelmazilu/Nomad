// Anchor's borsh coder (buffer-layout) and @solana/web3.js must agree on a single
// Buffer implementation, or `Buffer.isBuffer(publicKey.toBuffer())` fails with
// "requires (length 32) Buffer as src". Pin the global to the npm `buffer` build
// that the optimized web3 bundle uses.
import { Buffer } from "buffer";

const g = globalThis as unknown as { Buffer?: typeof Buffer };
g.Buffer = Buffer;
