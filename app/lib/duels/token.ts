import { z } from "zod";

/**
 * A stateless duel-challenge token. v0 encodes the challenge in the link itself
 * (no `challenges` table yet → no prod migration): the market, the challenger's
 * public @handle, and their locked pick. Decoded on the public `/duel/[token]`
 * landing to render the arena against live market data.
 *
 * Isomorphic base64url (TextEncoder + btoa, present in both Node and the
 * browser) so the share button can mint a link client-side and the RSC route
 * can read it server-side — no `Buffer`, which would break in client bundles.
 */
export const duelTokenSchema = z.object({
  m: z.string().min(1), // marketId
  h: z.string().min(1), // challenger @handle (no leading @)
  p: z.string().min(1).optional(), // challenger's picked outcomeId
});

export type DuelToken = z.infer<typeof duelTokenSchema>;

function base64UrlEncode(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(input: string): string {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function encodeDuelToken(token: DuelToken): string {
  return base64UrlEncode(JSON.stringify(token));
}

export function decodeDuelToken(raw: string): DuelToken | null {
  try {
    const parsed = duelTokenSchema.safeParse(JSON.parse(base64UrlDecode(raw)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** The shareable path for a freshly-minted challenge. */
export function duelPath(token: DuelToken): string {
  return `/duel/${encodeDuelToken(token)}`;
}
