import idl from "./agent_passport.json";
import type { AgentPassport } from "./agent_passport";

/**
 * Runtime IDL for the Anchor client. The program ID lives in `idl.address`
 * (Anchor 0.31), so `new Program(AGENT_PASSPORT_IDL, provider)` needs no separate
 * program-id argument. Vendored from `target/idl` — regenerate after a program
 * layout change (`anchor build` then copy `target/idl` + `target/types`).
 */
export const AGENT_PASSPORT_IDL = idl as AgentPassport;
export type { AgentPassport };
