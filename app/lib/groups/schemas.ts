import { z } from "zod";

// Group input schemas — defined here, imported by the service (no inline Zod).
// Bounds are enforced server-side; the client form mirrors them for UX only.

export const GROUP_NAME_MIN = 2;
export const GROUP_NAME_MAX = 40;
export const GROUP_DESC_MAX = 280;

export const createGroupSchema = z.object({
  nameHe: z.string().trim().min(GROUP_NAME_MIN).max(GROUP_NAME_MAX),
  descriptionHe: z.string().trim().max(GROUP_DESC_MAX).optional().nullable(),
  emblem: z.string().trim().max(8).optional().nullable(),
  colorToken: z.string().trim().max(40).optional().nullable(),
});

export type CreateGroupInput = z.infer<typeof createGroupSchema>;
