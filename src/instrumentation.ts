import type { Instrumentation } from "next";

/**
 * Preserve the real server-side exception in production logs before React
 * replaces it with an opaque Server Components digest in the browser.
 */
export const onRequestError: Instrumentation.onRequestError = (
  error,
  request,
  context,
) => {
  console.error("[SERVER_RENDER_ERROR]", {
    error,
    method: request.method,
    path: request.path,
    routePath: context.routePath,
    routeType: context.routeType,
    renderSource: context.renderSource ?? null,
  });
};
