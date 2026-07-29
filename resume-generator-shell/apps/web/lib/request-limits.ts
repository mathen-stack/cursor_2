/** Default max JSON body size for generation/export APIs (512 KiB). */
export const DEFAULT_MAX_REQUEST_BYTES = 512 * 1024;

export class RequestTooLargeError extends Error {
  readonly code = "REQUEST_TOO_LARGE";

  constructor(maxBytes: number) {
    super(`Request body exceeds the ${maxBytes}-byte limit.`);
    this.name = "RequestTooLargeError";
  }
}

export async function readJsonWithLimit<T = unknown>(
  request: Request,
  maxBytes = DEFAULT_MAX_REQUEST_BYTES,
): Promise<T> {
  const declared = request.headers.get("content-length");
  if (declared) {
    const length = Number(declared);
    if (Number.isFinite(length) && length > maxBytes) {
      throw new RequestTooLargeError(maxBytes);
    }
  }

  const buffer = Buffer.from(await request.arrayBuffer());
  if (buffer.byteLength > maxBytes) {
    throw new RequestTooLargeError(maxBytes);
  }

  if (buffer.byteLength === 0) {
    throw new Error("Request body is empty.");
  }

  return JSON.parse(buffer.toString("utf8")) as T;
}

export function requestLimitErrorResponse(error: unknown): Response | null {
  if (error instanceof RequestTooLargeError) {
    return Response.json(
      {
        error: {
          code: error.code,
          message: error.message,
        },
      },
      { status: 413 },
    );
  }
  return null;
}
