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

# Agent (needs user-secrets: Umbraco:ClientSecret always; Google:ApiKey only for discovery Runs.
# Enrichment model: Azure OpenAI gpt-4.1-mini, keyless via "az login" — requires the
# "Cognitive Services OpenAI User" role on cityguide-openai; Anthropic:ApiKey is the fallback provider)
cd CityGuide.Agent && dotnet run
# One section only (shorter runs): matches any segment of a Run's ParentPath,
# plus "cines"/"eventos" for those syncs. Comma-separated for several.
cd CityGuide.Agent && dotnet run -- --section restaurantes

# Build everything
dotnet build CityGuide.slnx
```

There are no automated tests in this repo.

## Architecture

Content flow: editors use the Umbraco backoffice → published content is read by the Next.js frontend through the **Content Delivery API v2** (anonymous read, ISR with 10-min revalidation, client in `frontend/lib/umbraco.ts`). The agent (`CityGuide.Agent/Program.cs`) discovers places via Google Places, writes Spanish descriptions with Azure OpenAI (`gpt-4.1-mini` on the `cityguide-openai` account, Central US; Anthropic is the fallback — see `IEnrichmentClient`), and creates them as **drafts** through the **Management API** using API-user client credentials; it dedupes by `googlePlaceId`. Enrichment is the agent's only LLM step; dedupe, rating backfill, cinema sync and trailer search are plain code. Discovery queries are paged (Google returns 20 results per page, up to 60 per query) and
ranked by review count before being cut to `MaxPlaces`, so a bigger run means the
best-known places rather than a wider slice of relevance order. 60 is Google's hard
ceiling per text query, so city-wide coverage comes from many overlapping queries — the
restaurant runs are one broad query plus per-sector and per-cuisine ones — deduped
globally by `googlePlaceId`. The first full pass over them is long (hundreds of new
places, each one LLM call plus a throttled photo download); seed it once with
`--section restaurantes` and the daily job then skips almost everything. A `Run` with a
`CompanyName` creates its places as branches of that `company` node instead of flat under
the category (and fails loudly when the company does not exist); without one, a place
whose name contains an existing company's name is nested under it anyway. Branch places
store only their own data — no description, phone, website or hours — so they inherit the
company's, and they cost no LLM tokens. A discovered branch is named "Chain — what tells it
apart" (`BranchNaming`): Google calls most branches by the chain ("Banreservas" twenty-seven
times), so the chain is stripped from the Google name ("BanReservas Torre" → "Torre") and,
when nothing distinguishing is left, the street line of the address is used
("Banreservas — Av. Winston Churchill 1099"). That is the same shape `branchDisplayName`
produces in the frontend, which leaves such a name alone rather than prefixing the chain
twice; seeded branches still store the bare local name ("Sucursal Naco") and get prefixed
there. Any two places that would share a name under one parent are named apart by their
address instead of by Umbraco's "(n)" suffix (`PlaceNaming`): the newcomer and the twin
already stored both get the first line of their address appended ("Sonoma Bistro — Ágora
Mall", "Sonoma Bistro — Calle Federico Geraldino 96"), which is the plaza, the sector or
the street, whichever Google puts first. When both addresses yield the same line — two
branches on one corner — neither is renamed and the number stays, since the qualifier
would say no more than the bare name does. `PlaceNaming` also owns the connector trimming
both callers need: Google's street line often ends on a dangling cross-street word
("Av. John F. Kennedy esq"), and "y Ureña" opens on one. The rating/photo backfill also covers `mall`
nodes (plazas comerciales), which have coordinates and a photo but no rating properties.
The agent reads per-city config from the city node's "Agente" tab (`agentCityName` replaces the `{city}` placeholder in Run queries; `agentPrompts` holds one `categoria-slug: instrucciones` line per category, appended to the description prompt; `agentArea` is the `lat,lng;lat,lng` rectangle — southwest corner, then northeast — that every Google query for that city is restricted to). Without `agentArea` Google answers a city query with the whole country: "bares en Santo Domingo" returns Punta Cana. Text Search takes only a rectangle there, never a radius, and an unparseable value means no restriction rather than an empty run. It is meant to run daily — `deploy/schedule-agent-job.sh` creates the Azure Container Apps Job (cron 10:00 UTC) once the CMS is in Azure; `deploy/provision-azure-openai.sh` documents the model resource. The agent also runs `CinemaSync` (config section `Cinemas`): upserts the "Caribbean Cinemas" company + branch places from the Caribbean Cinemas GraphQL API and maintains the `movie` catalog under `/santo-domingo/cines` (synopsis, poster, YouTube trailer in Latino Spanish via search) — this content is published immediately, not drafted, and stale movies are deleted. Every event gets a main image: the one the source declares, else the `og:image` of its
ticket page, else a Google photo of its venue. `EventSync` (config section `Events`) fills `/santo-domingo/eventos` from public event portals (TodoTickets and TicketExpress detail pages, Eventbrite listings) via per-source strategies ("jsonld-listing", "jsonld-detail", "ticketexpress"); events publish immediately, dedupe by ticket URL and name+date, and only agent-created (`source` = `agent:*`) past events are deleted — TuBoleta (JS-loaded dates) and Uepa Tickets (Cloudflare) are deliberately not scraped. `dotnet run -- --scrape-events` prints what each source yields without touching the CMS. Every external request goes through `ThrottlingHandler` (min interval + jitter per host, `Throttle:SecondsBetweenRequests`) so the agent is slow on purpose and never trips rate limiters.

Content model (all created in code, not in the backoffice):
`site` → `city` → `categoryPage` → `subcategory` → `place`, plus `eventsPage`/`eventItem` and `thingsToDoPage` (“Qué Hacer”: aggregation-only guide page — upcoming events by category, attractions open today, idea sections per category; no child content) under each city, and `movie` (agent-maintained cartelera catalog) under `categoryPage`. `categoryPage` accepts `subcategory`, `place`, and `company` children; `subcategory` accepts `place` and `company`; `company` (empresa: logo + general info) accepts only `place` (its branches/sucursales).

Company inheritance: a `place` under a `company` stores only its own data (name, address, coordinates); empty fields (phone, website, hours, description, photo) fall back to the parent company **in the frontend** (`PlaceView` in the catch-all page). Category/subcategory listings show companies as single cards and never flatten their branch places (`listingEntries`); branches appear only inside the company page. Every listing (category, subcategory, mall groups) is ordered best rated first by `listingEntriesByRating`: a company or mall carries no rating of its own, so it ranks by its best-rated nested place, and unrated entries keep their original order at the end.

Frontend routing is a single catch-all (`frontend/app/[city]/[...slug]/page.tsx`) that switches on the item's `contentType` — new document types need a new case there.

Map pins never show a node's own photo: `mapPinIcon` (`frontend/lib/sections.ts`) draws the
parent company's logo for a branch and the section glyph otherwise, so pins stay legible and
say which section they belong to. Photos are for listing cards, detail headers and map popup
cards — that is why `/api/nearby` returns `photo` (the real image) and `icon` (company logo
or null) separately, and why `MapMarker` has both.

Every listing offers two views of the same results, switched by `ViewToggle`: the paginated
grid of cards and a map of those very same (filtered) entries. `ListingViews` owns both — it
holds the filter state, so narrowing the dropdowns narrows the map too; cards reach it
already rendered on the server, and each entry carries the pins it puts on the map (a place
or mall pins itself, a company pins every branch under it, an entry without coordinates pins
nothing, and the toggle is hidden when no entry has any). `MarkersMap` is the one map of
many places — listings, company branches, malls, attractions, cinemas showing a film: pins
are clustered by `@googlemaps/markerclusterer` into a branded bubble carrying the count, and
with `locate` the visitor can share their position to pin it and get the same places ranked
by distance in a side panel. That panel is deliberately *not* `/api/nearby`: it ranks the
listing's own filtered results, not everything around the visitor.

The "¿Qué está cerca?" map panel calls `GET /api/nearby` (`CityGuideWeb/CityGuide/NearbyController.cs`, haversine scan over the published-content cache). The frontend proxies it via a Next.js rewrite so the browser call is same-origin.

## SEO

All of it is derived from the CMS item, so content published later is covered without code changes.
`frontend/lib/seo.ts` is the single source: canonical/Open Graph URLs, title and description shaping
(60/160-char budgets, with progressively shorter title candidates instead of mid-word truncation),
and every schema.org builder. `components/JsonLd.tsx` renders it.

- **Per page** (`generateMetadata` in `app/[city]/[...slug]/page.tsx`, plus `app/[city]/page.tsx` and
  the root layout): a self-referencing canonical, `og:*`/`twitter:*`, explicit robots directives, and a
  document-type-specific title/description. Query strings (`?fecha=`, `?q=`) never reach the canonical.
- **Structured data**: `BreadcrumbList` on every content page (from the existing breadcrumb),
  `Restaurant`/`BarOrPub`/`Store`/`MovieTheater`/`TouristAttraction`/`LocalBusiness` per section for
  places, `ShoppingCenter` for malls, `Organization` + branch `Place`s for companies, `Event`,
  `Article`, `Movie`, `ItemList` for listings, `Organization`+`WebSite` site-wide. Free-text "Horario"
  is parsed into `openingHoursSpecification`; unparseable lines are dropped.
- **`app/sitemap.ts`** enumerates every published node (`getDescendants`, `updateDate` as `<lastmod>`),
  **`app/robots.ts`** points at it and disallows `/api/` and `/*/buscar`; the search page is also
  `noindex, follow`. **`app/opengraph-image.tsx`** is the branded fallback card for pages without a photo.
- **`NEXT_PUBLIC_SITE_URL`** must be set per environment — it is the origin of every canonical, OG URL
  and sitemap entry. It defaults to `https://quehacerrd.com`.
- **Editor overrides**: the "SEO" tab (`metaTitle`, `metaDescription`, `noIndex`) exists on every
  indexable document type, added by `EnsureSeoSchemaAsync` in the seeder. Empty is the normal case.
- **A new document type needs**: a `case` in `generateMetadata`, a JSON-LD builder call in its view, an
  entry in `SITEMAP_HINTS`, and its alias in `SeoDocumentTypes` in the seeder.

## The seeder (read this before touching content or schema)

`CityGuideWeb/CityGuide/CityGuideSeeder.cs` runs on every startup (registered in `CityGuideComposer`) and is the single source of truth for document types and seed data. Its idempotency is check-based, each guarded separately:

- Schema creation is skipped when the `place` document type exists. **Editing a document type in the seeder does nothing for an existing database** — change it in the backoffice too, or delete `CityGuideWeb/umbraco/Data/` (and `wwwroot/media/`) to re-seed from scratch.
- Sample content is skipped when a `site` root exists.
- `EnsureCompanySchemaAsync` runs every startup: creates the `company` document type if missing and allows it under `subcategory`/`categoryPage`. Follow this pattern (guarded, every-startup) for schema additions that must reach existing installations.
- Seed steps publish the nodes they created (`PublishSeeded`), never the branch: `PublishBranch(..., IncludeUnpublished)` also publishes the agent's drafts sitting in that branch, which exist to be reviewed first. The branch publishes that remain each cover a subtree the same call just created. Bank seeding (`EnsureBanksSeeded`) runs every startup and creates the "Bancos" subcategory under "Empresas y Servicios" (one `company` per bank, branches as child `place`s) only if missing. A pre-company flat "Bancos" is deleted (content + logo media) and reseeded nested. Follow this pattern for any new seed step that must apply to existing installations.

Boot-time indexing race: content published during startup is NOT picked up by the Examine `DeliveryApiContentIndex` (its event handlers register after the seeder runs). The seeder therefore rebuilds that index when it seeded something. Symptom of getting this wrong: item-by-path Delivery API lookups work but list/filter queries return 0.

Bank logos live in `CityGuideWeb/CityGuide/SeedAssets/` and are imported into the Media library at seed time; `photo` is a MediaPicker3 property whose value is JSON `[{"key":<guid>,"mediaKey":<mediaKey>}]`.

## Analytics

Google Analytics 4 (gtag.js) is rendered site-wide by `frontend/components/Analytics.tsx`, mounted in
the root layout. It emits nothing unless `NEXT_PUBLIC_GA_MEASUREMENT_ID` is set, so local development
does not report traffic; `.github/workflows/deploy-frontend.yml` sets it to `G-RTX0GNHR74` at build
time (`NEXT_PUBLIC_*` values are inlined by `next build`, not read at runtime).

## Gotchas

- `frontend/AGENTS.md` (auto-generated by `next dev`): this Next.js version may differ from training data — check `node_modules/next/dist/docs/` before writing frontend code.
- Umbraco runtime state (SQLite DB, logs, media) is gitignored under `CityGuideWeb/umbraco/Data/` and `wwwroot/media/`. Deleting them is the supported "factory reset".
- Agent config: one `Runs` entry in `CityGuide.Agent/appsettings.json` per Google query + target CMS content path (e.g. `/santo-domingo/restaurantes/china`).
- Delivery API is public read; before exposing the CMS publicly set an `ApiKey` under `Umbraco:CMS:DeliveryApi`.
- Deliberate v1 omissions (do not build unasked): user accounts/comments/favorites, multi-language variants, agent photo upload, webhook-driven revalidation.
