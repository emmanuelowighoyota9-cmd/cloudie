import { useNeonAuth } from "./use-neon-auth";
import { useCallback } from "react";

export function useAuth() {
  const { user, isAuthenticated, isLoading, login, register, logout, refresh } = useNeonAuth();

  const signIn = useCallback(
    async (
      providerOrFlow?: unknown,
      params?: {
        flow?: string;
        email?: string;
        password?: string;
        name?: string;
        code?: string;
        newPassword?: string;
        [key: string]: any;
      },
    ) => {
      const options = (typeof providerOrFlow === "object" && providerOrFlow !== null)
        ? (providerOrFlow as Record<string, any>)
        : (params as Record<string, any>);

      const flow = options?.flow ?? "signIn";
      const email = options?.email ?? "";
      const password = options?.password ?? "";
      const name = options?.name ?? email.split("@")[0] ?? "User";

      if (flow === "signUp") {
        return await register(name, email, password);
      }
      if (flow === "signIn" || flow === "signIn" || flow === "password") {
        return await login(email, password);
      }
      throw new Error("This authentication flow is not supported by the configured API.");
    },
    [login, register],
  );

  const signOut = useCallback(async () => {
    await logout();
  }, [logout]);

  return {
    isLoading,
    isAuthenticated,
    user,
    signIn,
    signOut,
    login,
    register,
    logout,
    refresh,
  };
}
