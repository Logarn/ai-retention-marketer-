# Migration Baseline Audit

## Summary

The repository migration history was missing earlier migrations that had been
applied locally:

- `20260428133954_init`
- `20260430104124_add_campaign_memory`

Before this repair, a fresh database created from the checked-in migrations
could apply successfully, but it only created the Planner, Brief Generator, and
QA Engine tables. That left the current Prisma schema out of sync with a clean
database.

## Current checked-in migrations

- `20260430000000_planner_v0`
- `20260430123000_brief_generator_v0`
- `20260430143000_qa_engine_v0`
- `20260430190000_migration_baseline_audit`

## Missing schema coverage

The missing migration history covered the base app tables, Shopify sync tables,
Brain/brand tables, competitor/chat tables, and Campaign Memory. Without a
repair migration, a clean database did not contain tables such as:

- `Customer`, `Order`, `OrderItem`, `Product`, `CustomerEvent`
- `Campaign`, `CampaignReceipt`, `CampaignMetrics`
- `CampaignMemory`
- `IntegrationState`, `ShopifySyncRun`
- `BrandProfile`, `BrandRule`, `BrandPhrase`, `BrandCTA`, `BrandDocument`
- `VoiceTone`, `DosAndDonts`, `ProductIntelligence`, `Compliance`
- `SeasonalContext`, `Persona`, `SellingPoint`
- `ChatSession`, `ChatMessage`
- `Competitor`, `CompetitorEmail`

## Repair approach

The repair migration is additive and idempotent:

- it uses `CREATE TABLE IF NOT EXISTS`
- it uses `CREATE INDEX IF NOT EXISTS`
- it adds foreign keys only when their constraint names are absent
- it does not drop, rename, truncate, or overwrite data

This avoids recreating guessed versions of the missing historical migration
files, which could create checksum conflicts in databases that already recorded
those migrations.

## Verification

The repaired migration chain was applied to a disposable Postgres database using
standard Prisma migration flow. After applying all checked-in migrations, Prisma
reported an empty diff between the database and `prisma/schema.prisma`.

Tables present on the clean disposable database:

- `BrandCTA`
- `BrandDocument`
- `BrandPhrase`
- `BrandProfile`
- `BrandProfileMeta`
- `BrandRule`
- `BriefQaCheck`
- `Campaign`
- `CampaignBrief`
- `CampaignBriefSection`
- `CampaignMemory`
- `CampaignMetrics`
- `CampaignPlan`
- `CampaignPlanItem`
- `CampaignReceipt`
- `ChatMessage`
- `ChatSession`
- `Competitor`
- `CompetitorEmail`
- `Compliance`
- `CustomVoiceDimension`
- `Customer`
- `CustomerEvent`
- `DosAndDonts`
- `IntegrationState`
- `MessageTemplate`
- `Order`
- `OrderItem`
- `Persona`
- `Product`
- `ProductIntelligence`
- `SeasonalContext`
- `SellingPoint`
- `ShopifySyncRun`
- `StoreScreenshot`
- `VoiceTone`

Commands run:

```bash
npx prisma validate --config prisma.config.ts
npx prisma generate --config prisma.config.ts
DATABASE_URL=postgresql://postgres@localhost:55432/worklin_audit_after npx prisma migrate deploy --config prisma.config.ts
DATABASE_URL=postgresql://postgres@localhost:55432/worklin_audit_after npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script --exit-code --config prisma.config.ts
```
