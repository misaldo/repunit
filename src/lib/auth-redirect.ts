export function safeAuthPath(path: string | undefined, origin: string) {
  if (!path) return "/dashboard";
  try {
    const url = new URL(path, origin);
    if (url.origin !== origin || url.pathname === "/auth") return "/dashboard";
    return url.pathname + url.search;
  } catch {
    return "/dashboard";
  }
}