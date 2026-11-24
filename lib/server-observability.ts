export type ApiRequestContext = {
  requestId: string;
  route: "account" | "cloud-state";
};

const SAFE_REQUEST_ID = /^[a-zA-Z0-9._:-]{6,96}$/;

export function createApiRequestContext(
  request: Request,
  route: ApiRequestContext["route"],
): ApiRequestContext {
  const upstreamId =
    request.headers.get("cf-ray") ?? request.headers.get("x-request-id") ?? "";
  return {
    requestId: SAFE_REQUEST_ID.test(upstreamId)
      ? upstreamId
      : crypto.randomUUID(),
    route,
  };
}

export function addOperationalHeaders(
  headers: Headers,
  context?: ApiRequestContext,
) {
  headers.set("Cache-Control", "no-store");
  if (context) headers.set("X-Request-Id", context.requestId);
}

export function logApiFailure(
  context: ApiRequestContext,
  code: string,
  status: number,
) {
  console.error(
    JSON.stringify({
      code,
      level: "error",
      requestId: context.requestId,
      route: context.route,
      service: "focus-quest",
      status,
      timestamp: new Date().toISOString(),
    }),
  );
}
