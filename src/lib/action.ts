import "server-only";
import { z } from "zod";
import { AuthorizationError } from "@/lib/auth";
import { friendlyDbError } from "@/lib/format";
import type { ActionResult } from "@/lib/types";

/** Thrown from inside an action body to return a friendly error. */
export class ActionError extends Error {}

/** Throw on a Supabase error so it is converted to a friendly message. */
export function check<T extends { error: { message: string } | null }>(res: T): T {
  if (res.error) throw new ActionError(friendlyDbError(res.error.message));
  return res;
}

/**
 * Wraps a server action body: validates input with zod, converts thrown errors
 * into a serialisable ActionResult, never leaks stack traces to the client.
 */
export async function runAction<S extends z.ZodType, T>(
  schema: S,
  input: unknown,
  body: (data: z.infer<S>) => Promise<T | ActionResult<T>>,
): Promise<ActionResult<T>> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".") || "_";
      (fieldErrors[key] ??= []).push(issue.message);
    }
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input.", fieldErrors };
  }
  try {
    const out = await body(parsed.data);
    if (out && typeof out === "object" && "ok" in out) return out as ActionResult<T>;
    return { ok: true, data: out as T };
  } catch (e) {
    if (e instanceof ActionError || e instanceof AuthorizationError) {
      return { ok: false, error: e.message };
    }
    // Next.js redirect/notFound errors must propagate.
    if (e && typeof e === "object" && "digest" in e) throw e;
    console.error("[action]", e);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

/** Unwrap a single-row result that must exist. */
export function one<T>(res: { data: unknown; error: { message: string } | null }, notFound = "Record not found."): T {
  if (res.error) throw new ActionError(friendlyDbError(res.error.message));
  if (res.data === null || res.data === undefined) throw new ActionError(notFound);
  return res.data as T;
}
