export function api(
  input: string | URL | globalThis.Request,
  init?: RequestInit,
) {
  return fetch(`${process.env.NEXT_PUBLIC_API_URL}${input}`, {
    ...init,
    credentials: "include",
    headers: {
      ...init?.headers,
      "Content-Type": "application/json",
    },
  });
}
