export function initialNativeWebUrl(
  appUrl: string,
  refreshToken: string | null,
): string {
  return refreshToken ? appUrl : new URL("/auth", appUrl).toString();
}

export function shouldAllowNativeGuestNavigation(
  value: string,
  appUrl: string,
): boolean {
  try {
    const target = new URL(value);
    const app = new URL(appUrl);
    return (
      target.origin === app.origin &&
      (target.pathname === "/auth" || target.pathname.startsWith("/auth/"))
    );
  } catch {
    return false;
  }
}
