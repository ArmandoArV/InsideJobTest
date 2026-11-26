import { randomBytes } from "node:crypto";

/* Crockford base32: no I, L, O or U, so an id read aloud or copied by hand
   cannot become a different valid id. */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function base32(bytes: Buffer, length: number): string {
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

/** The permanent principal. Opaque, server-generated, never derived from input. */
export function newAgentId(): string {
  return `agt_${base32(randomBytes(10), 10)}`;
}

export function newKeyPrefix(): string {
  return `ab_${base32(randomBytes(8), 8).toLowerCase()}`;
}

/** Two-character mark derived from the id — identity, never the handle. */
export function markFor(agentId: string): string {
  const tail = agentId.replace("agt_", "");
  return (tail[0] + tail[tail.length - 1]).toUpperCase();
}
