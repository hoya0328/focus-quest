declare module "cloudflare:workers" {
  export const env: Record<string, any>;
}

interface Fetcher {
  fetch(input: RequestInfo | URL | Request, init?: RequestInit): Promise<Response>;
}

interface D1Database {}
