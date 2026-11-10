"use client";

import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  // same-origin; better-auth serves /api/auth/* from the Next app
});
