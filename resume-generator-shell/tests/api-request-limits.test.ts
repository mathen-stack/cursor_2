import { describe, expect, it } from "vitest";
import {
  DEFAULT_MAX_REQUEST_BYTES,
  readJsonWithLimit,
  RequestTooLargeError,
} from "../apps/web/lib/request-limits";

describe("API request size limits", () => {
  it("accepts JSON bodies within the configured limit", async () => {
    const body = JSON.stringify({ ok: true, value: 1 });
    const request = new Request("http://localhost/api/resume/generate", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": String(Buffer.byteLength(body)),
      },
      body,
    });

    await expect(readJsonWithLimit<{ ok: boolean }>(request)).resolves.toEqual({
      ok: true,
      value: 1,
    });
  });

  it("rejects oversized Content-Length before reading the body", async () => {
    const request = new Request("http://localhost/api/resume/generate", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": String(DEFAULT_MAX_REQUEST_BYTES + 1),
      },
      body: "{}",
    });

    await expect(readJsonWithLimit(request)).rejects.toBeInstanceOf(RequestTooLargeError);
  });

  it("rejects oversized bodies even without Content-Length", async () => {
    const oversized = "x".repeat(DEFAULT_MAX_REQUEST_BYTES + 16);
    const request = new Request("http://localhost/api/resume/export", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ data: oversized }),
    });

    await expect(readJsonWithLimit(request, 1024)).rejects.toBeInstanceOf(
      RequestTooLargeError,
    );
  });
});
