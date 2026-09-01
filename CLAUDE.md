# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Multi-city guide portal (rebuild of TuSantoDomingo.com). Three parts, one solution (`CityGuide.slnx`):

| Part | Tech | Folder |
|------|------|--------|
| Headless CMS | Umbraco 18 / .NET 10 | `CityGuideWeb/` |
| Public portal | Next.js 16 (App Router, Tailwind 4) | `frontend/` |
| AI ingestion agent | .NET 10 console | `CityGuide.Agent/` |

## Commands

```bash
# CMS (backoffice at http://localhost:54509/umbraco)
cd CityGuideWeb && dotnet run

# Frontend (http://localhost:3000; needs .env.local — copy .env.example)
cd frontend && npm run dev
cd frontend && npm run lint

# Agent (needs user-secrets: Umbraco:ClientSecret always; Google:ApiKey + Anthropic:ApiKey only for discovery Runs)
cd CityGuide.Agent && dotnet run

# Build everything
dotnet build CityGuide.slnx
```

There are no automated tests in this repo.

## Architecture

Content flow: editors use the Umbraco backoffice → published content is read by the Next.js frontend through the **Content Delivery API v2** (anonymous read, ISR with 10-min revalidation, client in `frontend/lib/umbraco.ts`). The agent (`CityGuide.Agent/Program.cs`) discovers places via Google Places, writes Spanish descriptions with Claude, and creates them as **drafts** through the **Management API** using API-user client credentials; it dedupes by `googlePlaceId`. The agent also runs `CinemaSync` (config section `Cinemas`): upserts the "Caribbean Cinemas" company + branch places from the Caribbean Cinemas GraphQL API and maintains the `movie` catalog under `/santo-domingo/cines` (synopsis, poster, YouTube trailer in Latino Spanish via search) — this content is published immediately, not drafted, and stale movies are deleted.

Content model (all created in code, not in the backoffice):
`site` → `city` → `categoryPage` → `subcategory` → `place`, plus `eventsPage`/`eventItem` and `thingsToDoPage` (“Qué Hacer”: aggregation-only guide page — upcoming events by category, attractions open today, idea sections per category; no child content) under each city, and `movie` (agent-maintained cartelera catalog) under `categoryPage`. `categoryPage` accepts `subcategory`, `place`, and `company` children; `subcategory` accepts `place` and `company`; `company` (empresa: logo + general info) accepts only `place` (its branches/sucursales).

Company inheritance: a `place` under a `company` stores only its own data (name, address, coordinates); empty fields (phone, website, hours, description, photo) fall back to the parent company **in the frontend** (`PlaceView` in the catch-all page). Category/subcategory listings show companies as single cards and never flatten their branch places (`listingEntries`); branches appear only inside the company page.

Frontend routing is a single catch-all (`frontend/app/[city]/[...slug]/page.tsx`) that switches on the item's `contentType` — new document types need a new case there.

The "¿Qué está cerca?" map panel calls `GET /api/nearby` (`CityGuideWeb/CityGuide/NearbyController.cs`, haversine scan over the published-content cache). The frontend proxies it via a Next.js rewrite so the browser call is same-origin.

## The seeder (read this before touching content or schema)

`CityGuideWeb/CityGuide/CityGuideSeeder.cs` runs on every startup (registered in `CityGuideComposer`) and is the single source of truth for document types and seed data. Its idempotency is check-based, each guarded separately:

- Schema creation is skipped when the `place` document type exists. **Editing a document type in the seeder does nothing for an existing database** — change it in the backoffice too, or delete `CityGuideWeb/umbraco/Data/` (and `wwwroot/media/`) to re-seed from scratch.
- Sample content is skipped when a `site` root exists.
- `EnsureCompanySchemaAsync` runs every startup: creates the `company` document type if missing and allows it under `subcategory`/`categoryPage`. Follow this pattern (guarded, every-startup) for schema additions that must reach existing installations.
- Bank seeding (`EnsureBanksSeeded`) runs every startup and creates the "Bancos" subcategory under "Empresas y Servicios" (one `company` per bank, branches as child `place`s) only if missing. A pre-company flat "Bancos" is deleted (content + logo media) and reseeded nested. Follow this pattern for any new seed step that must apply to existing installations.

Boot-time indexing race: content published during startup is NOT picked up by the Examine `DeliveryApiContentIndex` (its event handlers register after the seeder runs). The seeder therefore rebuilds that index when it seeded something. Symptom of getting this wrong: item-by-path Delivery API lookups work but list/filter queries return 0.

Bank logos live in `CityGuideWeb/CityGuide/SeedAssets/` and are imported into the Media library at seed time; `photo` is a MediaPicker3 property whose value is JSON `[{"key":<guid>,"mediaKey":<mediaKey>}]`.

## Gotchas

- `frontend/AGENTS.md` (auto-generated by `next dev`): this Next.js version may differ from training data — check `node_modules/next/dist/docs/` before writing frontend code.
- Umbraco runtime state (SQLite DB, logs, media) is gitignored under `CityGuideWeb/umbraco/Data/` and `wwwroot/media/`. Deleting them is the supported "factory reset".
- Agent config: one `Runs` entry in `CityGuide.Agent/appsettings.json` per Google query + target CMS content path (e.g. `/santo-domingo/restaurantes/china`).
- Delivery API is public read; before exposing the CMS publicly set an `ApiKey` under `Umbraco:CMS:DeliveryApi`.
- Deliberate v1 omissions (do not build unasked): user accounts/comments/favorites, multi-language variants, agent photo upload, webhook-driven revalidation.
