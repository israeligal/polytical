import { z } from "zod";

// Group input schemas — defined here, imported by the service (no inline Zod).
// Bounds are enforced server-side; the client form mirrors them for UX only.

export const GROUP_NAME_MIN = 2;
export const GROUP_NAME_MAX = 40;
export const GROUP_DESC_MAX = 280;
export const GROUP_EMBLEM_MAX = 8;

// Count by code points, not UTF-16 units, so an emoji in the name (which the
// client counts as one char) is measured the same way on both sides.
const codePoints = (s: string) => [...s].length;

export const createGroupSchema = z.object({
  nameHe: z
    .string()
    .trim()
    .min(GROUP_NAME_MIN)
    .refine((s) => codePoints(s) <= GROUP_NAME_MAX, {
      message: `שם ארוך מדי (עד ${GROUP_NAME_MAX} תווים)`,
    }),
  descriptionHe: z.string().trim().max(GROUP_DESC_MAX).optional().nullable(),
  emblem: z
    .string()
    .trim()
    .refine((s) => codePoints(s) <= GROUP_EMBLEM_MAX, { message: "סמל לא תקין" })
    .optional()
    .nullable(),
  colorToken: z.string().trim().max(40).optional().nullable(),
});

export type CreateGroupInput = z.infer<typeof createGroupSchema>;
