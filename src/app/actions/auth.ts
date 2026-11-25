"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { audit } from "@/lib/audit";
import { hashPassword, passwordProblem, verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { LIMITS, rateLimit } from "@/lib/security/rate-limit";
import { clientIp } from "@/lib/security/request";
import { loginSchema, registerSchema, safeNextPath } from "@/lib/validation/schemas";

export type AuthState = { error?: "invalid" | "rate_limited" | "validation" | "email_taken"; message?: string } | null;

// A fixed hash so that unknown emails take as long as wrong passwords (no user enumeration by timing).
const DUMMY_HASH = "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$" + "A".repeat(86) + "==";

export async function signInAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "invalid" };
  const ip = await clientIp();
  const byIp = rateLimit(`login:${ip}`, LIMITS.login.limit * 3, LIMITS.login.windowMs);
  const byAccount = rateLimit(`login:${parsed.data.email}`, LIMITS.login.limit, LIMITS.login.windowMs);
  if (!byIp.ok || !byAccount.ok) return { error: "rate_limited" };

  const db = await getDb();
  const [user] = await db.select().from(users).where(eq(users.email, parsed.data.email)).limit(1);
  const ok = await verifyPassword(parsed.data.password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) return { error: "invalid" };

  await createSession(user.id);
  await audit(db, { id: user.id, name: user.name, email: user.email, role: user.role, isDemo: user.isDemo, communities: [] }, { action: "auth.sign_in", subjectType: "user", subjectId: user.id });
  redirect(safeNextPath(parsed.data.next));
}

export async function registerAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = registerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "validation", message: parsed.error.issues[0]?.message };
  const problem = passwordProblem(parsed.data.password);
  if (problem) return { error: "validation", message: problem };
  const ip = await clientIp();
  if (!rateLimit(`register:${ip}`, LIMITS.register.limit, LIMITS.register.windowMs).ok) return { error: "rate_limited" };

  const db = await getDb();
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, parsed.data.email)).limit(1);
  if (existing) return { error: "email_taken" };
  const [user] = await db
    .insert(users)
    .values({
      email: parsed.data.email,
      name: parsed.data.name,
      affiliation: parsed.data.affiliation ?? "",
      passwordHash: await hashPassword(parsed.data.password),
      role: "contributor",
    })
    .returning();
  await createSession(user.id);
  await audit(db, { id: user.id, name: user.name, email: user.email, role: user.role, isDemo: false, communities: [] }, { action: "auth.register", subjectType: "user", subjectId: user.id });
  redirect("/contribute");
}
