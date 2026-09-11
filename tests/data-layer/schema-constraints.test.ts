/**
 * Data-layer: expected uniques / indexes / onDelete from schema.prisma,
 * plus live catalog checks when TEST_DATABASE_URL is available.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { disconnectTestPrisma, getTestPrisma, hasTestDatabase } from "../helpers/prisma.ts";

const schema = readFileSync(join(process.cwd(), "prisma", "schema.prisma"), "utf8");

function modelBlock(name: string): string {
  const re = new RegExp(`model\\s+${name}\\s*\\{([\\s\\S]*?)\\n\\}`);
  const m = schema.match(re);
  assert.ok(m, `model ${name} not found in schema`);
  return m[1]!;
}

describe("schema constraints (source of truth)", () => {
  it("PanelUser.username and Line.username are unique", () => {
    assert.match(modelBlock("PanelUser"), /username\s+String\s+@unique/);
    assert.match(modelBlock("Line"), /username\s+String\s+@unique/);
  });

  it("join tables use composite primary keys", () => {
    assert.match(modelBlock("BouquetStream"), /@@id\(\[bouquetId,\s*streamId\]\)/);
    assert.match(modelBlock("ResellerBouquet"), /@@id\(\[userId,\s*bouquetId\]\)/);
    assert.match(modelBlock("LineBouquet"), /@@id\(\[lineId,\s*bouquetId\]\)/);
  });

  it("Line has status+expiresAt and LiveConnection has lastSeenAt indexes", () => {
    assert.match(modelBlock("Line"), /@@index\(\[status,\s*expiresAt\]\)/);
    assert.match(modelBlock("Line"), /@@index\(\[expiresAt\]\)/);
    assert.match(modelBlock("LiveConnection"), /@@index\(\[lastSeenAt\]\)/);
    assert.match(modelBlock("LiveConnection"), /@@index\(\[lastSeenAt,\s*lineId\]\)/);
  });

  it("cascade deletes are declared for bouquet / credit / connection children", () => {
    assert.match(modelBlock("ResellerBouquet"), /user\s+PanelUser.*onDelete:\s*Cascade/s);
    assert.match(modelBlock("ResellerBouquet"), /bouquet\s+Bouquet.*onDelete:\s*Cascade/s);
    assert.match(modelBlock("BouquetStream"), /bouquet\s+Bouquet.*onDelete:\s*Cascade/s);
    assert.match(modelBlock("LineBouquet"), /line\s+Line.*onDelete:\s*Cascade/s);
    assert.match(modelBlock("LineBouquet"), /bouquet\s+Bouquet.*onDelete:\s*Cascade/s);
    assert.match(modelBlock("CreditTransaction"), /user\s+PanelUser.*onDelete:\s*Cascade/s);
    assert.match(modelBlock("LiveConnection"), /line\s+Line.*onDelete:\s*Cascade/s);
    assert.match(modelBlock("MagDevice"), /line\s+Line.*onDelete:\s*Cascade/s);
  });

  it("Line.ownerId does not cascade (deleting reseller with lines is restricted)", () => {
    const line = modelBlock("Line");
    const ownerLine = line.match(/owner\s+PanelUser\?[^\n]*/)?.[0] ?? "";
    assert.ok(ownerLine.includes("PanelUser?"));
    assert.equal(/onDelete:\s*Cascade/.test(ownerLine), false);
  });
});

describe("schema constraints (live DB)", () => {
  after(async () => {
    await disconnectTestPrisma().catch(() => undefined);
  });

  it(
    "Postgres unique indexes exist for line/panel usernames",
    { skip: !hasTestDatabase() },
    async () => {
      const prisma = getTestPrisma();
      const rows = await prisma.$queryRawUnsafe<Array<{ indexname: string }>>(
        `SELECT indexname FROM pg_indexes
         WHERE schemaname = 'public'
           AND (
             indexdef ILIKE '%UNIQUE%' AND (
               indexdef ILIKE '%"Line"%username%'
               OR indexdef ILIKE '%Line%username%'
               OR indexdef ILIKE '%"PanelUser"%username%'
               OR indexdef ILIKE '%PanelUser%username%'
             )
           )`
      );
      const names = rows.map((r) => r.indexname).join(" ");
      assert.match(names, /Line/i);
      assert.match(names, /PanelUser|panel_user|PanelUser_username/i);
    }
  );

  it(
    "FK constraints exist for ResellerBouquet and LineBouquet",
    { skip: !hasTestDatabase() },
    async () => {
      const prisma = getTestPrisma();
      const fks = await prisma.$queryRawUnsafe<Array<{ conname: string; rel: string }>>(
        `SELECT c.conname, r.relname AS rel
         FROM pg_constraint c
         JOIN pg_class r ON r.oid = c.conrelid
         WHERE c.contype = 'f'
           AND r.relname IN ('ResellerBouquet', 'LineBouquet', 'LiveConnection', 'CreditTransaction')`
      );
      const byRel = new Map<string, string[]>();
      for (const row of fks) {
        const list = byRel.get(row.rel) ?? [];
        list.push(row.conname);
        byRel.set(row.rel, list);
      }
      for (const table of ["ResellerBouquet", "LineBouquet", "LiveConnection", "CreditTransaction"]) {
        assert.ok((byRel.get(table) ?? []).length >= 1, `missing FKs on ${table}`);
      }
    }
  );
});
