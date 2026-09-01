# CityGuide

Multi-city guide portal (rebuild of TuSantoDomingo.com): places, bars/clubs, shops, cinemas, businesses, events and specials per city, with Google Maps integration and AI-assisted content ingestion.

## Architecture

| Part | Tech | Folder |
|------|------|--------|
| CMS (headless) | Umbraco 18 / .NET 10 | `CityGuideWeb/` |
| Public portal | Next.js 16 (App Router, Tailwind) | `frontend/` |
| AI ingestion agent | .NET 10 console (Google Places + Claude) | `CityGuide.Agent/` |

Content flows: editors use the Umbraco backoffice; the agent discovers places with the Google Places API, writes Spanish descriptions with Claude, and creates them as **drafts** through the Umbraco Management API. The frontend reads published content through the Content Delivery API with ISR (10 min revalidation).

## Content model

`site` → `city` (landing per city) → `categoryPage` (Restaurantes, Bares y Clubes, Tiendas, Cines, Empresas y Servicios) → `subcategory` → `place`, plus `eventsPage`/`eventItem` and `specialsPage`/`specialItem` under each city.

The schema and a seeded Santo Domingo sample tree are created automatically on first boot by `CityGuideWeb/CityGuide/CityGuideSeeder.cs` (idempotent).

## Running locally

### 1. CMS

```bash
cd CityGuideWeb
dotnet run
```

- Backoffice: http://localhost:54509/umbraco
- Delivery API: `GET /umbraco/delivery/api/v2/content?fetch=descendants:/&take=100`
- Nearby geo API: `GET /api/nearby?lat=18.4557&lng=-69.9282&radius=2500[&category=Restaurantes][&exclude=<guid>]`

### 2. Frontend

```bash
cd frontend
cp .env.example .env.local   # set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
npm install
npm run dev
```

Browse http://localhost:3000 → `/santo-domingo` → category → place detail (map + "¿Qué está cerca?").

The Google Maps key needs **Maps JavaScript API** enabled and should be restricted by HTTP referrer.

### 3. AI agent

One-time setup:

1. In the backoffice: **Users → API Users → Create** (e.g. name `cityguide-agent`, admin or editor group). Note the Client ID (`umbraco-back-office-cityguide-agent`) and generate a Client Secret.
2. Configure secrets:

```bash
cd CityGuide.Agent
dotnet user-secrets set "Google:ApiKey" "<google-places-api-key>"
dotnet user-secrets set "Anthropic:ApiKey" "<anthropic-api-key>"
dotnet user-secrets set "Umbraco:ClientSecret" "<api-user-secret>"
```

3. Edit `appsettings.json` → `Runs`: one entry per Google query + target CMS path. Then:

```bash
dotnet run
```

New places are created as **drafts** (set `Umbraco:PublishImmediately` to `true` to auto-publish) and deduped by Google Place ID.

The Google key needs **Places API (New)** enabled.

## Production notes

- Swap SQLite for SQL Server: change `ConnectionStrings:umbracoDbDSN` (+ provider name) in `CityGuideWeb/appsettings.json`.
- Delivery API is public read (`Umbraco:CMS:DeliveryApi` in appsettings); add an `ApiKey` there and send it from the frontend if the CMS is exposed publicly before launch.
- Not built yet (deliberate v1 omissions): user accounts/comments/favorites, multi-language variants, agent photo upload to the Media library, Umbraco webhook → Next.js on-demand revalidation.
