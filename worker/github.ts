// Thin GitHub REST helpers (all calls go through the contributor's token).
export const GITHUB_API = "https://api.github.com";
export const UA = "color.recipes-worker";

export function gh(token: string, method: string, path: string, body?: unknown): Promise<Response> {
  return fetch(`${GITHUB_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": UA,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

export async function ghError(res: Response, action: string): Promise<string> {
  const data = (await res.json().catch(() => ({}))) as { message?: string };
  return `${action} failed (${res.status}): ${data.message ?? res.statusText}`;
}
