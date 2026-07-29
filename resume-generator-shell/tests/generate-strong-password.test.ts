import { describe, expect, it } from "vitest";
import {
  generateStrongPassword,
  isStrongPasswordShape,
} from "../apps/web/lib/generate-strong-password";

describe("generateStrongPassword", () => {
  it("creates a long mixed-character password", () => {
    const password = generateStrongPassword();
    expect(password).toHaveLength(16);
    expect(isStrongPasswordShape(password)).toBe(true);
  });

  it("respects a custom length", () => {
    expect(generateStrongPassword(20)).toHaveLength(20);
  });
});
