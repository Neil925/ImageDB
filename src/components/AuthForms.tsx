"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

const input =
  "w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-sky-500";

export default function AuthForms({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "signup") {
        const res = await authClient.signUp.email({ email, password, name });
        if (res.error) throw new Error(res.error.message ?? "sign-up failed");
      } else {
        const res = await authClient.signIn.email({ email, password });
        if (res.error) throw new Error(res.error.message ?? "sign-in failed");
      }
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "auth failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mx-auto max-w-sm space-y-3">
      {mode === "signup" && (
        <div>
          <label className="mb-1 block text-sm text-zinc-400">Name</label>
          <input className={input} value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
      )}
      <div>
        <label className="mb-1 block text-sm text-zinc-400">Email</label>
        <input className={input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </div>
      <div>
        <label className="mb-1 block text-sm text-zinc-400">Password</label>
        <input
          className={input}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={8}
          required
        />
      </div>
      {error && <p className="rounded bg-red-950/70 px-3 py-2 text-sm text-red-300">{error}</p>}
      <button
        type="submit"
        disabled={busy}
        className="w-full rounded bg-sky-600 py-2 text-sm font-medium hover:bg-sky-500 disabled:opacity-50"
      >
        {mode === "signup" ? "Create account" : "Sign in"}
      </button>
      <p className="text-center text-sm text-zinc-500">
        {mode === "signup" ? (
          <>
            Have an account?{" "}
            <a className="text-sky-400 hover:underline" href="/login">
              Sign in
            </a>
          </>
        ) : (
          <>
            No account?{" "}
            <a className="text-sky-400 hover:underline" href="/signup">
              Sign up
            </a>
          </>
        )}
      </p>
    </form>
  );
}
