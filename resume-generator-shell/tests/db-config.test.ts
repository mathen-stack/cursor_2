import { describe, expect, it } from "vitest";
import { getDatabasePersistenceLabel, hasDatabaseUrl } from "../apps/web/lib/db";

describe("database configuration", () => {
  it("reports file persistence when DATABASE_URL is unset", () => {
    const previous = process.env.DATABASE_URL;
    const previousPostgres = process.env.POSTGRES_URL;
    delete process.env.DATABASE_URL;
    delete process.env.POSTGRES_URL;
    try {
      expect(hasDatabaseUrl()).toBe(false);
      expect(getDatabasePersistenceLabel()).toBe("file");
    } finally {
      if (previous === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previous;
      if (previousPostgres === undefined) delete process.env.POSTGRES_URL;
      else process.env.POSTGRES_URL = previousPostgres;
    }
  });

  it("reports postgres persistence when DATABASE_URL is set", () => {
    const previous = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "postgresql://user:pass@localhost/db";
    try {
      expect(hasDatabaseUrl()).toBe(true);
      expect(getDatabasePersistenceLabel()).toBe("postgres");
    } finally {
      if (previous === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previous;
    }
  });
});
