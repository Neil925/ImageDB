/** Reject reasons fixed list (plan §10). Lives outside "use server" files, which may only export async functions. */
export const REJECT_REASONS = ["duplicate", "bad quality", "wrong rating", "off-topic"] as const;
