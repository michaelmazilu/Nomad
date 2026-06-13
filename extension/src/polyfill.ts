// @solana/web3.js (v1) expects a global Buffer in the browser/service-worker
// context. Import this first from each entry point.
import { Buffer } from "buffer";

const g = globalThis as unknown as { Buffer?: typeof Buffer };
if (!g.Buffer) g.Buffer = Buffer;
