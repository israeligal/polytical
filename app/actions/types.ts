/** The shared server-action result shape — previously re-declared locally in
 *  six action files; a field added to one copy silently missed the others. */
export type ActionResult = { ok: boolean; message?: string };
