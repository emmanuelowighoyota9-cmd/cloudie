// THIS FILE IS READ ONLY. Do not touch this file unless you are correctly adding a new auth provider in accordance to the vly auth documentation

import { convexAuth } from "@convex-dev/auth/server";
import { Password } from "@convex-dev/auth/providers/Password";
import { emailOtp } from "./auth/emailOtp";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    // Email + password credentials (see src/pages/Auth.tsx). Passwords are
    // hashed with Scrypt and stored in the authAccounts table; the `profile`
    // callback persists the display name collected during sign-up.
    Password({
      profile(params) {
        const name = typeof params.name === "string" ? params.name.trim() : "";
        return {
          email: params.email as string,
          ...(name.length > 0 ? { name } : {}),
        };
      },
      // Enables the "reset" / "reset-verification" flows: a 6-digit code is
      // emailed through the same OTP service used for email sign-in, and the
      // submitted code lets the user set a new password.
      reset: emailOtp,
    }),
    emailOtp,
  ],
});
