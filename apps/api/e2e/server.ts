import { inject } from "vite-plus/test";

export const origin = inject("origin");

export const get = (path: string, headers?: HeadersInit): Promise<Response> =>
  fetch(new URL(path, origin), { headers, redirect: "manual" });

export const text = (path: string): Promise<string> => get(path).then(response => response.text());

export const mediaType = (response: Response): string | undefined =>
  response.headers.get("Content-Type")?.split(";")[0];
