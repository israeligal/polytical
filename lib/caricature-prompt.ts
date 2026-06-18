/**
 * The prompt a user pastes into Gemini (with their own photo attached) to make
 * a caricature avatar. Adapted from the politician trading-card prompt in
 * `.claude/skills/caricature-cards/SKILL.md` — frame, name banner, stats and the
 * 4:5 ratio removed; reshaped into a square, centered head-and-shoulders that
 * crops cleanly to a circle. Single source of truth shared by the profile
 * editor's "copy prompt" button and (later) the automated Gemini-API path.
 *
 * Client-safe (no secrets / server-only imports) so the copy button can use it.
 */
export const USER_CARICATURE_PROMPT = `Use the attached photo as the exact likeness reference for the person's face. Create a bold, fun caricature avatar of this person — a centered head-and-shoulders portrait, facing forward (slight 3/4), filling the frame so it crops cleanly into a circle. Exaggerated caricature features (slightly oversized head, expressive larger-than-life face), clean comic-book ink linework with cel shading, dramatic rim lighting, rich saturated colors, on a simple solid background with a subtle Israeli-blue energy glow behind them. Square 1:1. NO frame, NO text, NO banner, NO logos — just the character on a clean background. Punchy, friendly, iconic. Clearly a stylized caricature, NOT photorealistic. Keep the face true to the attached photo — same hairline, same features.`;

/** Where to open Gemini (no native URL prompt prefill exists — the user pastes). */
export const GEMINI_APP_URL = "https://gemini.google.com/app";
