import bcrypt from "npm:bcryptjs";
import { jwtVerify, SignJWT } from "npm:jose";
import { getSupabaseClient } from "./supabase-client.ts";
import type { AdminUser } from "./types.ts";

const ADMIN_JWT_EXPIRES_IN_SECONDS = 30 * 24 * 60 * 60;

function getJwtSecret(): Uint8Array {
  const secret = Deno.env.get("ADMIN_JWT_SECRET") ||
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
    "";

  if (!secret) {
    throw new Error("Missing ADMIN_JWT_SECRET or SUPABASE_SERVICE_ROLE_KEY");
  }

  return new TextEncoder().encode(secret);
}

export type AdminJwtClaims = {
  sub: string;
  email: string;
  role: "admin";
};

export async function verifyAdminPassword(
  plainTextPassword: string,
  passwordHash: string,
): Promise<boolean> {
  return await bcrypt.compare(plainTextPassword, passwordHash);
}

export async function issueAdminToken(
  adminUser: AdminUser,
): Promise<{ token: string; expiresAt: string }> {
  const expiresAt = new Date(
    Date.now() + ADMIN_JWT_EXPIRES_IN_SECONDS * 1000,
  ).toISOString();

  const token = await new SignJWT({
    email: adminUser.email,
    role: "admin",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(adminUser.id)
    .setIssuedAt()
    .setExpirationTime(`${ADMIN_JWT_EXPIRES_IN_SECONDS}s`)
    .sign(getJwtSecret());

  return { token, expiresAt };
}

export function getBearerToken(req: Request): string | null {
  const authorization = req.headers.get("authorization") || "";
  const [scheme, token] = authorization.split(" ");

  if (!scheme || scheme.toLowerCase() !== "bearer" || !token) {
    return null;
  }

  return token;
}

export async function requireAdminAuth(req: Request): Promise<AdminUser> {
  const token = getBearerToken(req);

  if (!token) {
    throw new Error("Missing bearer token");
  }

  const verified = await jwtVerify(token, getJwtSecret());
  const subject = verified.payload.sub;
  const role = verified.payload.role;

  if (!subject || role !== "admin") {
    throw new Error("Invalid admin token");
  }

  const { data, error } = await getSupabaseClient()
    .from("admin_users")
    .select("*")
    .eq("id", subject)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load admin user: ${error.message}`);
  }

  if (!data) {
    throw new Error("Admin user not found or inactive");
  }

  return data as AdminUser;
}
