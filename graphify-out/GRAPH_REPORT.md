# Graph Report - CityGuide  (2026-08-31)

## Corpus Check
- Corpus is ~14,012 words - fits in a single context window. You may not need a graph.

## Summary
- 394 nodes · 491 edges · 38 communities (15 shown, 23 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 14 edges (avg confidence: 0.91)
- Token cost: 1,665,673 input · 6,000 output

## Community Hubs (Navigation)
- Frontend Pages & Routing
- Seeder & Bank Data
- Agent API Clients
- Umbraco Configuration
- CMS Composition & Nearby API
- TypeScript Config
- Architecture Concepts
- Agent Configuration
- Launch Settings
- Frontend Dependencies
- Lint & Styling Tooling
- Solution & Projects
- Dev Logging Config
- Frontend Root Layout
- Block Grid Items View
- Next.js Config
- APAP Brand
- Banesco Brand
- Banreservas Brand
- Banco BHD Brand
- Banco Caribe Brand
- Banco Popular Brand
- Banco Promerica Brand
- Banco Santa Cruz Brand
- Scotiabank Brand
- Block Grid Area View
- Block Grid Areas View
- Block Grid Default View
- Block List Default View
- Single Block View
- ESLint Config
- PostCSS Config
- File Icon Asset
- Globe Icon Asset
- Next.js Logo Asset
- Vercel Logo Asset
- Window Icon Asset

## God Nodes (most connected - your core abstractions)
1. `CityGuideSeeder` - 34 edges
2. `compilerOptions` - 16 edges
3. `text()` - 15 edges
4. `getItem()` - 12 edges
5. `AgentConfig` - 10 edges
6. `UmbracoClient` - 10 edges
7. `getChildren()` - 10 edges
8. `NearbyController` - 9 edges
9. `GooglePlacesClient` - 8 edges
10. `UmbracoConfig` - 7 edges

## Surprising Connections (you probably didn't know these)
- `CityGuide README Overview` --semantically_similar_to--> `CityGuide Multi-City Guide Portal`  [INFERRED] [semantically similar]
  README.md → CLAUDE.md
- `Content Model (README)` --semantically_similar_to--> `Content Model (site → city → categoryPage → subcategory → place)`  [INFERRED] [semantically similar]
  README.md → CLAUDE.md
- `Nearby Geo API (README)` --semantically_similar_to--> `Nearby API (/api/nearby, ¿Qué está cerca? map panel)`  [INFERRED] [semantically similar]
  README.md → CLAUDE.md
- `CityGuideSeeder First-Boot Seeding (README)` --semantically_similar_to--> `CityGuideSeeder (startup schema + seed data, single source of truth)`  [INFERRED] [semantically similar]
  README.md → CLAUDE.md
- `Frontend Getting Started (create-next-app boilerplate)` --conceptually_related_to--> `Next.js 16 Public Portal (frontend)`  [INFERRED]
  frontend/README.md → CLAUDE.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **AI Content Ingestion Pipeline (Google Places → Claude → Management API drafts)** — claude_ai_ingestion_agent, claude_google_places, claude_claude_descriptions, claude_management_api, claude_google_place_id_dedupe [EXTRACTED 1.00]
- **Published Content Delivery Flow (CMS → Delivery API → Next.js with ISR)** — claude_umbraco_cms, claude_content_delivery_api, claude_nextjs_frontend, claude_isr_revalidation [EXTRACTED 1.00]
- **Seeder Correctness Concerns (idempotency guards + index rebuild)** — claude_cityguide_seeder, claude_seeder_idempotency, claude_boot_time_indexing_race, claude_content_model [EXTRACTED 1.00]

## Communities (38 total, 23 thin omitted)

### Community 0 - "Frontend Pages & Routing"
Cohesion: 0.10
Nodes (39): CityLayout(), generateMetadata(), CityLandingPage(), revalidate, SECTION_ICONS, Breadcrumb(), CategoryView(), ContentPage() (+31 more)

### Community 1 - "Seeder & Bank Data"
Cohesion: 0.07
Nodes (31): Bank, BankBranch, CancellationToken, Bank, BankBranch, CityGuideSeeder, Task, UmbracoApplicationStartedNotification (+23 more)

### Community 2 - "Agent API Clients"
Cohesion: 0.08
Nodes (28): ClaudeClient, Enrichment, HttpClient, Task, DiscoveredPlace, DisplayName, GooglePlacesClient, Location (+20 more)

### Community 3 - "Umbraco Configuration"
Cohesion: 0.07
Nodes (28): Content, DeliveryApi, Global, Imaging, Security, Unattended, ConnectionStrings, umbracoDbDSN (+20 more)

### Community 4 - "CMS Composition & Nearby API"
Cohesion: 0.08
Nodes (21): CityGuideComposer, UmbracoApplicationStartedNotification, NearbyController, NearbyPlace, Guid, Task, ControllerBase, CityGuideWeb.CityGuide (+13 more)

### Community 5 - "TypeScript Config"
Cohesion: 0.07
Nodes (28): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+20 more)

### Community 6 - "Architecture Concepts"
Cohesion: 0.10
Nodes (26): AI Ingestion Agent (CityGuide.Agent), Boot-Time Indexing Race (DeliveryApiContentIndex rebuild), Frontend Catch-All Route ([city]/[...slug] contentType switch), CityGuide Multi-City Guide Portal, CityGuideSeeder (startup schema + seed data, single source of truth), Claude-Written Spanish Descriptions, Umbraco Content Delivery API v2, Content Model (site → city → categoryPage → subcategory → place) (+18 more)

### Community 7 - "Agent Configuration"
Cohesion: 0.11
Nodes (20): AgentConfig, Anthropic, Google, Runs, Umbraco, AnthropicConfig, ApiKey, Model (+12 more)

### Community 8 - "Launch Settings"
Cohesion: 0.11
Nodes (19): ASPNETCORE_ENVIRONMENT, commandName, environmentVariables, launchBrowser, applicationUrl, sslPort, iisSettings, anonymousAuthentication (+11 more)

### Community 9 - "Frontend Dependencies"
Cohesion: 0.11
Nodes (17): dependencies, next, react, react-dom, @vis.gl/react-google-maps, name, private, scripts (+9 more)

### Community 10 - "Lint & Styling Tooling"
Cohesion: 0.12
Nodes (17): eslint, eslint-config-next, devDependencies, eslint, eslint-config-next, tailwindcss, @tailwindcss/postcss, @types/node (+9 more)

### Community 11 - "Solution & Projects"
Cohesion: 0.14
Nodes (12): CityGuide.Agent, net10.0, net10.0, Microsoft.Extensions.Configuration.Binder (10.0.11), Microsoft.Extensions.Configuration.EnvironmentVariables (10.0.11), Microsoft.Extensions.Configuration.Json (10.0.11), Microsoft.Extensions.Configuration.UserSecrets (10.0.11), Microsoft.ICU.ICU4C.Runtime (+4 more)

### Community 12 - "Dev Logging Config"
Cohesion: 0.20
Nodes (9): Hosting, Debug, Default, $schema, Serilog, MinimumLevel, WriteTo, Umbraco (+1 more)

### Community 13 - "Frontend Root Layout"
Cohesion: 0.40
Nodes (3): geistMono, geistSans, metadata

## Ambiguous Edges - Review These
- `Banco Caribe Favicon (small circular blue globe-like mark)` → `Banco Caribe (Dominican bank brand)`  [AMBIGUOUS]
  CityGuideWeb/CityGuide/SeedAssets/caribe.png · relation: references

## Knowledge Gaps
- **157 isolated node(s):** `Umbraco`, `Google`, `Anthropic`, `Runs`, `BaseUrl` (+152 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **23 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Banco Caribe Favicon (small circular blue globe-like mark)` and `Banco Caribe (Dominican bank brand)`?**
  _Edge tagged AMBIGUOUS (relation: references) - confidence is low._
- **Why does `CityGuideSeeder` connect `Seeder & Bank Data` to `CMS Composition & Nearby API`?**
  _High betweenness centrality (0.026) - this node is a cross-community bridge._
- **Why does `Id` connect `Umbraco Configuration` to `Agent API Clients`?**
  _High betweenness centrality (0.022) - this node is a cross-community bridge._
- **What connects `Umbraco`, `Google`, `Anthropic` to the rest of the system?**
  _157 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Frontend Pages & Routing` be split into smaller, more focused modules?**
  _Cohesion score 0.10119047619047619 - nodes in this community are weakly interconnected._
- **Should `Seeder & Bank Data` be split into smaller, more focused modules?**
  _Cohesion score 0.06866002214839424 - nodes in this community are weakly interconnected._
- **Should `Agent API Clients` be split into smaller, more focused modules?**
  _Cohesion score 0.07564102564102564 - nodes in this community are weakly interconnected._