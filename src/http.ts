import { config } from "./config.js";

export class HttpError extends Error {
  constructor(public status: number, public url: string, public body: string) {
    super(`HTTP ${status} for ${url}: ${body.slice(0, 200)}`);
  }
}

/** Fetch JSON with a timeout and a couple of retries on 429/5xx/network errors. */
export async function getJson<T>(url: string, searchParams?: Record<string, string | number | boolean | undefined>): Promise<T> {
  const fullUrl = new URL(url);
  if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      if (value !== undefined && value !== null && value !== "") {
        fullUrl.searchParams.set(key, String(value));
      }
    }
  }

  let lastErr: unknown;
  for (let attempt = 0; attempt <= config.requestRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.requestTimeoutMs);
    try {
      const res = await fetch(fullUrl, {
        signal: controller.signal,
        headers: { accept: "application/json" },
      });
      clearTimeout(timer);

      if (res.status === 429 || res.status >= 500) {
        const body = await res.text().catch(() => "");
        lastErr = new HttpError(res.status, fullUrl.toString(), body);
        await sleep(400 * (attempt + 1));
        continue;
      }

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new HttpError(res.status, fullUrl.toString(), body);
      }

      return (await res.json()) as T;
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (attempt < config.requestRetries) {
        await sleep(300 * (attempt + 1));
        continue;
      }
    }
  }
  throw lastErr;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
