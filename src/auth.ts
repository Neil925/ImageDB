import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/db";
import { accounts, sessions, users, verifications } from "@/db/schema";

export const auth = betterAuth({
  appName: "ImageDB",
  secret: process.env.BETTER_AUTH_SECRET ?? "imagedb-dev-secret-change-me-0123456789ab",
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { user: users, session: sessions, account: accounts, verification: verifications },
  }),
  emailAndPassword: { enabled: true, minPasswordLength: 8, autoSignIn: true },
  user: {
    additionalFields: {
      role: {
        type: "string",
        required: true,
        defaultValue: "viewer",
        input: false, // never client-settable; admins change it in /settings
      },
    },
  },
  session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24, cookieCache: { enabled: true, maxAge: 60 } },
  advanced: {
    cookiePrefix: "imagedb",
    useSecureCookies: process.env.IMAGEDB_SECURE_COOKIES === "1",
  },
  databaseHooks: {
    user: {
      create: {
        // First account ever becomes admin; everyone after that is a viewer.
        before: async (user) => {
          const res = await db.select({ id: users.id }).from(users).limit(1);
          return { data: { ...user, role: res.length === 0 ? "admin" : (user as { role?: string }).role ?? "viewer" } };
        },
      },
    },
  },
});

export type SessionUser = { id: string; name: string; email: string; role: string };
