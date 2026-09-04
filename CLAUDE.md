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
# Everything the agent talks to is free except two — Google Places (billed per request,
# and the backfill makes one per node) and the enrichment model (billed per token) — so a
# run without --paid leaves both alone: the cinema catalogue, the event portals, the plaza
# links and the publishing sweep all run, discovery and the backfill do not. --paid is the
# full pass, and the "paid" input of the "Run agent" workflow is the same switch in Azure.
cd CityGuide.Agent && dotnet run -- --paid
# One section only (shorter runs): matches any segment of a Run's ParentPath,
# plus "cines"/"eventos" for those syncs. Comma-separated for several.
cd CityGuide.Agent && dotnet run -- --section restaurantes
# The agent publishes what it writes ("Umbraco:PublishImmediately", on by default) and,
# when the run ends, releases the drafts earlier passes left under the sections it
# covered. --publish forces that sweep on an installation configured to draft instead.
cd CityGuide.Agent && dotnet run -- --section restaurantes --publish
# Maintenance over the shops section: recreate a plaza stored as a shop with the
# "mall" type, and send plaza duplicates the agent made to the recycle bin.
# Prints the plan and changes nothing without --apply.
cd CityGuide.Agent && dotnet run -- --regroup-malls
cd CityGuide.Agent && dotnet run -- --regroup-malls --apply
# Fold a plaza into another one (Google names a plaza its own way, and the matcher
# will not merge two plazas on a guess): the establishments move, the surviving
# plaza takes the Google place id and rating it lacks, the other goes to the
# recycle bin. Also a plan until --apply.
cd CityGuide.Agent && dotnet run -- --merge-mall "Acrópolis Business Mall" "Acrópolis Center"
# List under each plaza the places that sit inside it but live elsewhere in the
# tree (a bank branch under its company, a restaurant under its cuisine). The
# node stays where it is; the plaza only gains a reference. Plan until --apply.
cd CityGuide.Agent && dotnet run -- --link-malls
# File a node under another parent, for the one no rule can decide: an
# establishment an earlier pass parented to a plaza, whose real section only a
# person knows ("Carrefour" is a supermarket, and nothing stored says so). The
# plaza keeps listing it by reference. Plan until --apply.
cd CityGuide.Agent && dotnet run -- --move-place \
  /santo-domingo/tiendas/plazas-comerciales-y-malls/plaza-duarte/carrefour \
  /santo-domingo/tiendas/supermercados
# Send to the recycle bin the copies of a place earlier passes created ("Dolce Italia",
# "Dolce Italia (1)", "(2)"), and clear the place id a branch borrowed from the plaza it
# stands in. Plan until --apply.
cd CityGuide.Agent && dotnet run -- --purge-duplicate-places
cd CityGuide.Agent && dotnet run -- --purge-duplicate-places --apply
# File under their chain the places an earlier pass left flat beside the company (a
# Western Union counter the Vimenca run reached first, a MoneyGram agent the broad query
# found before the chain had a node), renamed as branches; a chain a run may create
# (CreatesCompanies) whose node is missing is created from the first place carrying its
# name. Scoped by --section. Plan until --apply.
cd CityGuide.Agent && dotnet run -- --regroup-companies --section empresas-y-servicios
cd CityGuide.Agent && dotnet run -- --regroup-companies --section empresas-y-servicios --apply
# Put Google place ids on the city's "Lugares excluidos" and send to the recycle bin every
# agent-made node carrying them, in one step (a second listing of one branch, a shop
# answered to a remesas query, a listing that does not exist in the country). The note
# lands beside each id for the editor. Plan until --apply.
cd CityGuide.Agent && dotnet run -- --exclude-place ChIJ...,ChIJ... --note "tienda, no remesas"
# Send one agent-made node to the recycle bin, for the copy no rule can see (the same
# Google listing filed under a second section). Plan until --apply.
cd CityGuide.Agent && dotnet run -- --recycle-place /santo-domingo/empresas-y-servicios/remesas-y-envios/plaza-lama
# Send to the recycle bin the events the agent imported that do not happen in the
# city: every ticket portal lists the whole country, and the section filled up with
# Santiago, Higüey and Punta Cana. Plan until --apply.
cd CityGuide.Agent && dotnet run -- --purge-foreign-events
# What each event source yields right now and whether the city filter keeps it
# (reads the city node and Google; writes nothing).
cd CityGuide.Agent && dotnet run -- --scrape-events

# IMDb / Rotten Tomatoes scores on the movie catalog need two free keys, set as
# user-secrets (leave either empty to run without it — the scores just stay blank):
#   Cinemas:Ratings:TmdbApiKey  (themoviedb.org, matches the Spanish release title)
#   Cinemas:Ratings:OmdbApiKey  (omdbapi.com, carries the IMDb rating and Tomatometer)
# In Azure the same two are the repository secrets TMDB_API_KEY / OMDB_API_KEY,
# passed by the "Run agent" workflow as Cinemas__Ratings__*.

# Build everything
dotnet build CityGuide.slnx
```

There are no automated tests in this repo.

## Architecture

Content flow: editors use the Umbraco backoffice → published content is read by the Next.js frontend through the **Content Delivery API v2** (anonymous read, ISR with 10-min revalidation, client in `frontend/lib/umbraco.ts`). The agent (`CityGuide.Agent/Program.cs`) discovers places via Google Places, writes Spanish descriptions with Azure OpenAI (`gpt-4.1-mini` on the `cityguide-openai` account, Central US; Anthropic is the fallback — see `IEnrichmentClient`), and creates them through the **Management API** using API-user client credentials, published as it goes (`Umbraco:PublishImmediately`, on by default — a draft is invisible to the portal *and* to the Delivery API, which is what the backfill reads); it dedupes by `googlePlaceId`. The agent's LLM steps are exactly two: place enrichment, and the category of a scraped event (`EventCategories`, one batched call per portal); dedupe, rating backfill, cinema sync, trailer search and the event scraping itself are plain code. Discovery queries are paged (Google returns 20 results per page, up to 60 per query) and
ranked by review count before being cut to `MaxPlaces`, so a bigger run means the
best-known places rather than a wider slice of relevance order. 60 is Google's hard
ceiling per text query, so city-wide coverage comes from many overlapping queries — the
restaurant runs are one broad query plus per-sector and per-cuisine ones — deduped
globally by `googlePlaceId`. The first full pass over them is long (hundreds of new
places, each one LLM call plus a throttled photo download); seed it once with
`--section restaurantes` and the daily job then skips almost everything. A `Run` with a
`CompanyName` creates its places as branches of that `company` node instead of flat under
the category (and fails loudly when the company does not exist); without one, a place
whose name contains an existing company's name is nested under it anyway. That lookup
covers the category's subcategories too — a chain filed inside one ("McDonald's" under
"Comida Rápida") has to be found from the category above it, or the next run creates the
brand a second time. `CreatesCompanies` pairs with `CompanyName` for the chains nobody is
going to type into the backoffice one by one — the fast-food runs, one per brand
(McDonald's, Burger King, KFC, Pizza Hut, Domino's, Subway, Dunkin'…): the brand node is
created on the first discovered place whose name carries the chain, inside the cuisine
subcategory that place's Google types name (a burger chain lands in "Comida Rápida", a
pizza one in "Pizzerías"), and it keeps the description that one place paid for while
every location after it inherits and costs no tokens. Such a run does not pin the company
for its whole answer — Google returns the chain's rivals to a query for it, and those
belong in the category — so the name match decides place by place. The brand node is
created without a logo; an editor adds it, and until then the frontend falls back to the
section image. A run may name the subcategory its places are filed in (`Subcategory`,
created under `ParentPath` when missing, through the same code path `AutoCategorize` uses
for cuisines): the retail runs — ropa y moda, calzado, perfumerías y cosméticos, joyería
y accesorios, tiendas por departamento — need it because what a shop sells is what the
query asks for and not what Google says about it, which types a perfume shop and a
jeweller alike as "store". A branch is exempt, as always: it lives under its brand.
`Subcategory` and `CreatesCompanies` together are what fill a section the backoffice has
no node for yet: the "Remesas y Envíos" runs under `/santo-domingo/empresas-y-servicios`
create the subcategory on the first place that needs it and the brand node inside it
(Vimenca, Caribe Express, Quisqueyana, Western Union, EPS, Aeropaq, Domex, DHL), each
followed by two broad queries — agencias de remesas, empresas de envíos — that catch the
independents and nest anything named after a brand under the node the chain runs just
made. Order matters there: the chain runs come first, because the global `googlePlaceId`
dedupe means whichever run sees a branch first decides where it lives. Whether a place is a branch of a chain is decided by
`TextMatch.ContainsPhrase`: the chain's words have to appear in the place's name as a run
of consecutive words, compared with their spaces removed ("DHL" matches "D H L Ágora
Mall", "BM Cargo" matches "BM Cargo Gazcue" and never "Transporte RC Cargo Express") —
the token match `TextMatch.Matches` uses drops short words and takes the rest in any
order, which is right for recognising one place under two names and wrong for a brand.
Ria is still left to the broad runs (its name is a word inside "panadería" and
"joyería"). A chain run creates the brand node on the first location it finds, so every
location a *previous* run had already stored stays flat beside the company;
`--regroup-companies [--apply]` (scoped by `--section`) files those under the chain whose
name they carry, renamed as branches through `BranchNaming`, and creates a chain the
config lets a run create when its node is missing, from the first place carrying its
name. The brand node is created without a logo either way: `EnsureChainLogos` in the
seeder gives it one on the next CMS startup when `AgentChainLogos` names it (the remesas
and courier chains have theirs in `SeedAssets`), and until then the frontend falls back
to the section image.
Every run also
asks the address whether the establishment sits inside a plaza comercial the CMS already
has, its coordinates within 250 m of it (`MallMatching`) — but a plaza never becomes the
parent: a place lives in the section that says what it is, which is what keeps it in that
section's listing and what lets the plaza's page group its establishments by category.
The plaza only gains a reference to it. The
plazas run itself carries `CreatesMalls`: a plaza is created as a `mall`, the container
the frontend renders with its establishments inside, not as one more shop, and its
`ParentPath` is where every other run looks the plazas up. A discovered plaza that is one
already stored is recognised by name and distance (`MallMatching.Same`: one name starts
with the other, within 400 m, ignoring any address appended to tell twins apart) and only
lends it its `googlePlaceId`, which is what the next pass and the rating backfill dedupe
by. `--regroup-malls` applies those two rules (recreate, deduplicate) to content already
in the CMS and is how the shops section was cleaned up; without `--apply` it only prints
the plan, and what it removes goes to the recycle bin and only when the agent created it.
`--move-place <ruta> <ruta padre>` files one node under another parent, for what no rule
can decide — an establishment an earlier pass parented to a plaza, whose section only a
person knows ("Carrefour" is a supermarket and nothing stored says so); the plaza it
leaves keeps it by reference. `--purge-duplicate-places [--apply]` cleans up after the passes that could not see their
own drafts and created the same place two and three times: published places are grouped by
`googlePlaceId`, and two nodes are only folded when they also share a category and a
company and each name carries every significant word of the other — a shared id proves
nothing on its own, since the backfill used to hand a plaza's id to the branches inside it,
and every bank seeded a "Sucursal Naco". The survivor is the node an editor made, else the
oldest (the clean slug, the URL that may already be linked); it takes the copy's photo
before the copy goes to the recycle bin, only agent-made copies are ever recycled, and one
with content inside it is reported instead. The pass then clears the place id and rating of
a node that borrowed them from a plaza (a pharmacy showing the mall's 46.000 reviews), so
the backfill matches it again by name; a plaza stored as one more shop keeps its id, since
`--regroup-malls` and `--merge-mall` need it to recognise the node. Dangling references in a
plaza's `establishments` picker are re-made by the linking pass. `--merge-mall
<sobra> <se queda>` folds the pair no rule can safely unify — Google's "Acrópolis Business
Mall" beside the stored "Acrópolis Center" — moving the establishments, filling the
survivor's blanks (the Google place id above all, or the next pass rediscovers the plaza
and recreates the duplicate) and recycling the other. A place that sits inside a plaza but belongs in another
section — a bank branch under its company, a restaurant under its cuisine, a cinema under
Caribbean Cinemas — is listed on the plaza's page by reference instead of being moved:
every run adds the node it creates to the plaza's `establishments` picker
(`AddMallEstablishmentAsync`), and `LinkEstablishmentsAsync` runs at the end of every
pass — after the cinema and event syncs, so it also covers what they published — to link
every published place that is still missing. It writes only what is missing, so a pass
with nothing new costs a handful of reads; `--link-malls` is the same pass on its own
(a plan until `--apply`). A branch is never taken for the plaza it is named after
(Caribbean Cinemas calls its screens in Ágora Mall exactly "Ágora Mall"), which is what
the `isBranch` argument of `MallMatching.Containing` settles. The data lives in exactly one node; `MallView`
renders one heading per category (`mallEstablishmentGroups`): the groups the plaza owns
("Moda", "Comida", filled by an editor) merged by slug with the categories of the places
it only references, so every bank lands under "Bancos" and every restaurant under
"Restaurantes" however each one is filed. A referenced node's category is read from its
own path (`categoryPath` in `lib/sections.ts`): the section it lives in, except under
"Tiendas" and "Empresas y Servicios", where the subcategory is what names the kind of
business ("Bancos", "Supermercados") while a restaurant's subcategory is only its cuisine.
The plaza's own groups lead, the rest follow the city's section order, and a place
parented straight by the plaza — nothing the agent creates any more — closes the page
under "Otros establecimientos". The picker is expanded by the Delivery API
(`getItem(path, "properties[establishments]")`) so the cards get photo and
rating, and a branch is qualified with the company it hangs from. `.github/workflows/run-agent.yml`
exposes every maintenance pass as a dispatch input, so they run against Azure without the
CMS client secret leaving the workflow. Branch places
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
("Av. John F. Kennedy esq"), and "y Ureña" opens on one. No place is ever skipped for
lacking data: whatever a node is missing — rating, photo, `googlePlaceId` — is written
back the moment Google hands it over, both when a discovery run recognises a place it
already has (the search answer already carries rating and photo, so it costs nothing) and
in the backfill pass, through the one writer that owns it,
`UmbracoClient.CompletePlaceAsync` — it reads the node, fills only the blanks (refreshing
a rating that moved), downloads a photo only when there is none, and writes once. The
backfill does not ask about every node on every pass: a rating moves by hundredths in a
day and each question is billed on the priciest Places SKU, so a node that already carries
everything comes up on one day of a rotation `Google:RatingRefreshDays` long (14), decided
by hashing its own id — the turns spread evenly and stay put without a "last checked" date
stored anywhere. What is still missing something is outside the rotation and asked every
pass, and `Google:MaxBackfillRequests` caps what one pass may spend, dropping refreshes
before incomplete nodes. The
backfill covers `place` and `mall` nodes alike (plazas carry the same Google properties)
and does the incomplete ones first, so a pass cut short never leaves them queued behind
the daily rating refresh of the nodes that already have everything; a node without
coordinates — seeded, or typed in by hand — is searched inside the city rectangle
(`FindRatingInAreaAsync`) instead of around a pin it does not have. A place found by name
rather than by id has to carry that name (`FindRatingNearAsync` requires the match within
2 km *and* the name to match), or a cinema inside a plaza would take the plaza's rating:
they share coordinates and the plaza is the bigger Google result.
The agent reads per-city config from the city node's "Agente" tab (`agentCityName` replaces the `{city}` placeholder in Run queries; `agentPrompts` holds one `categoria-slug: instrucciones` line per category, appended to the description prompt; `agentArea` is the `lat,lng;lat,lng` rectangle — southwest corner, then northeast — that every Google query for that city is restricted to). Without `agentArea` Google answers a city query with the whole country: "bares en Santo Domingo" returns Punta Cana. Text Search takes only a rectangle there, never a radius, and an unparseable value means no restriction rather than an empty run. The same tab carries `agentExcludedPlaces`, the Google place ids the agent must never turn into content — one per line, everything after a `#` a note for the editor. Without it a node sent to the recycle bin comes back on the next pass: dedupe reads the published places, so an id that is no longer in the CMS looks new. It is the answer to the Google listing that is not what it claims (a "sucursal" whose id is the plaza it stands in) and to the second listing of one branch; the discovery loop skips such a place before creating or updating anything, and `EventVenues` files no venue for it (the event still takes its coordinates). `--purge-duplicate-places` prints the id of every copy it recycles so it can be pasted there, and `--exclude-place <id>[,<id>] [--note "…"] [--apply]` does the pasting and the recycling in one step — it appends each id to the list of the city its node lives in (the node's name and the note beside it, for the editor) and sends every agent-made node carrying it to the recycle bin, so the list and the content never disagree. `--recycle-place <ruta> [--apply]` recycles one agent-made node without excluding its id, for the copy the id dedupe already prevents but nothing removes (the same Google listing filed under a second section). What runs on its own is the free pass: `.github/workflows/run-agent.yml` fires nightly at 08:23 UTC (4:23 AM in Santo Domingo) with no inputs, so `paid` is empty and the run refreshes the cartelera and the events without touching Google or the model. Discovery and the rating backfill are dispatched by hand with the `paid` input. (`deploy/schedule-agent-job.sh` documents the Azure Container Apps Job the schedule would live in once the subscription has room for a second environment; `deploy/provision-azure-openai.sh` documents the model resource.) The agent also runs `CinemaSync` (config section `Cinemas`): upserts the "Caribbean Cinemas" company + branch places from the Caribbean Cinemas GraphQL API and maintains the `movie` catalog under `/santo-domingo/cines` (synopsis, poster, YouTube trailer in Latino Spanish via search) — this content is published immediately, not drafted, and stale movies are deleted. The catalog covers exactly what the portal can put on screen: every movie with a showing on one of the dates the cartelera's tabs offer (`datesWithShowing` from today on, capped at 7 — the same window `getAvailableDates` gives the frontend), read from `showingsForDate`. The site's own `movies` list is not that set — it is paginated (10 per site by default, which is why most cartelera rows used to have no "Ver detalle" link) and it carries titles that are no longer scheduled. A cartelera row without a catalog node keeps the inline expander and loses its page, so the window the agent catalogues and the window the frontend renders have to stay the same. It also fills each movie's IMDb and Rotten Tomatoes scores (`MovieRatingsClient`, config `Cinemas:Ratings`): Caribbean only gives the Spanish release title, which neither service indexes, so TMDb resolves it to an IMDb id plus the original title and OMDb turns that id into the IMDb rating/votes and the Tomatometer (it carries both). The IMDb id never changes, so a movie that already stores one skips the TMDb round trip. Every step degrades to nothing — no key, no match or a failed request leaves the portal without scores — and a failed lookup rewrites the values already stored instead of blanking them (a PUT replaces the whole document). Rotten Tomatoes exposes no id, so the portal links to its search for the original title. Every event gets a main image: the one the source declares, else the `og:image` of its
ticket page, else a Google photo of its venue. `EventSync` (config section `Events`) fills `/santo-domingo/eventos` from public event portals (TodoTickets detail pages, Eventbrite listings) via per-source strategies ("jsonld-listing", "jsonld-detail"); events publish immediately, dedupe by ticket URL and name+date, and only agent-created (`source` = `agent:*`) past events are deleted — TuBoleta (JS-loaded dates), Uepa Tickets (Cloudflare) and TicketExpress (a listing frozen in 2020 whose pages state neither venue nor a real date, so the prose parser invented future ones) are deliberately not scraped. Every portal lists the whole country, so an event is only imported when its location is inside the city's `agentArea` rectangle (`EventVenues`): the portals state the venue's coordinates in their JSON-LD and the rectangle decides for free — the locality they file it under does not, since Escenario 360 reads "Los Alcarrizos" and stands on Av. John F. Kennedy — and an event without coordinates is kept only when its venue name resolves, on Google restricted to that same rectangle, to a place carrying every significant word of the name. A failed lookup is never read as "not in the city", and a city with no `agentArea` keeps importing everything. Resolving the venue also yields a full place, so the venue is created in the section its Google types belong to (`Events:VenueSections` — bars and attractions; a hotel or a shop matches none and only gives the event its coordinates, which is what puts it on the events map), like any discovered place and deduped by Google place id. `dotnet run -- --purge-foreign-events [--apply]` applies the same rule to the events already imported and recycles the ones outside the city (seeded and hand-made events are never touched); the "Run agent" workflow exposes it as the `purge_foreign_events` input. Each event's "Categoría" comes from the model (`EventCategories`: one batched call per portal, from the vocabulary the seeded events use), because no portal states one and the title is usually just the artist's name — an event stays uncategorized, never mislabelled, when no model is configured or the call fails. `dotnet run -- --scrape-events` prints what each source yields, and whether the city filter would keep it, without touching the CMS; `dotnet run -- --recategorize-events [--apply]` reclassifies the events the agent already created (only `agent:*` ones — hand-made and seeded events keep their editor's category), and the "Run agent" workflow exposes it as the `recategorize_events` input so it can be run against Azure. `dotnet run -- --purge-event-source <portal> [--apply]` recycles what a retired portal left behind: dropping a source from `Events:Sources` stops new imports but not the old ones, which are neither past nor locatable (TicketExpress's seven events sat there until this removed them). Every external request goes through `ThrottlingHandler` (min interval + jitter per host, `Throttle:SecondsBetweenRequests`) so the agent is slow on purpose and never trips rate limiters.

Content model (all created in code, not in the backoffice):
`site` → `city` → `categoryPage` → `subcategory` → `place`, plus `eventsPage`/`eventItem` and `thingsToDoPage` (“Qué Hacer”: aggregation-only guide page — upcoming events by category, attractions open today, today’s six most-shown movies (live cartelera cards, not a list of theaters — that is why “cines” is excluded from the idea sections), idea sections per category; no child content) under each city, and `movie` (agent-maintained cartelera catalog) under `categoryPage`. `categoryPage` accepts `subcategory`, `place`, and `company` children; `subcategory` accepts `place` and `company`; `company` (empresa: logo + general info) accepts only `place` (its branches/sucursales).

Company inheritance: a `place` under a `company` stores only its own data (name, address, coordinates); empty fields (phone, website, hours, description, photo) fall back to the parent company **in the frontend** (`PlaceView` in the catch-all page). Category/subcategory listings show companies as single cards and never flatten their branch places (`listingEntries`); branches appear only inside the company page. Every listing (category, subcategory, mall groups) is ordered best rated first by `listingEntriesByRating`: a company or mall carries no rating of its own, so it ranks by its best-rated nested place, and unrated entries keep their original order at the end.

Frontend routing is a single catch-all (`frontend/app/[city]/[...slug]/page.tsx`) that switches on the item's `contentType` — new document types need a new case there.

A `movie` has its own page (`MovieView`): the CMS catalog entry (poster, sinopsis, trailer button, IMDb/Rotten Tomatoes badges) over the *live* Caribbean showings — every cinema in the city presenting it on the chosen date (`?fecha=`), its showtimes as booking links, and a map of those cinemas. Cartelera cards link into it whenever the catalog has the movie, matching on name (`getMovieCatalog`, keyed by lowercased name — the same join the trailer override and the badges use); a title the agent has not catalogued yet simply keeps the inline expander and no link. The per-cinema list and its map are `MovieShowtimes`, shared by the card's expanded body and the movie page, and the date pills are `DateTabs`, shared by the movie page and `Cartelera`. `getMovieShowings` asks for the billboard with `trailers: false` — the movie page reads its trailer from the CMS, so the slow YouTube fallback search must not run there.

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
listing's own filtered results, not everything around the visitor. Clustering and the hover
framing live in `components/mapPins.ts` (`useMarkerElements` + `useClusteredPins`), shared
with `PlaceMap`'s neighbourhood pins: hovering a row in either list frames the pin it points
at — the cluster hiding it is opened, and a pin drawn on its own but outside the viewport is
flown to (`animateCamera` tweens the camera by hand, since the Maps API only animates
`panTo` over short moves) — and the camera eases back to the visitor's own framing once the
pointer leaves the block, never when it only leaves a row. `PlaceMap`'s subject pin is never
clustered.

Every map that pairs a list with pins is one block: `components/MapBlock.tsx` draws the
shared border, puts the list column beside the map and returns the hover framing on the way
out (`onExit`, fired by the block's `mouseleave` and by focus leaving it — a row only ever
hands the highlight over, so the pointer can travel from a row onto the pin it just framed).
The list column is taken out of the flow beside the map (`lg:absolute`), so the map's own
height is the block's and the list scrolls inside it — which is what lets both panels offer
24 places instead of 8. `MapPanelHeader`/`MapPanelList`/`MapPanelRow` are that list, so
"¿Qué está cerca?" (`PlaceMap`) and "Cerca de ti" (`MarkersMap`, every listing, the events
and attractions maps) read and behave the same. Each row carries, at 40px, the very icon its
pin shows (`mapPinIcon`: the company logo, else the section glyph), so a row and the pin it
frames read as the same thing. Name and detail are each cut with an ellipsis so every row is
the same height. Stacked on a phone the list keeps its own
capped height under the map.

The "¿Qué está cerca?" map panel calls `GET /api/nearby` (`CityGuideWeb/CityGuide/NearbyController.cs`, haversine scan over `NearbyIndex`). It draws as a `MapBlock` like every other map with a list beside it. The index is the projection of every published `place` — category, branch name, photo, logo, url, rating — built once and held until a publish, unpublish, delete or move drops it (`NearbyIndexInvalidator`, the same four notifications the frontend cache invalidator listens to); a request used to read every place node plus each of its ancestors out of the content cache. It is built inside the request that finds it empty (resolving a node URL needs the ambient request state) and concurrent requests wait on that one build. The frontend proxies the endpoint via a Next.js rewrite so the browser call is same-origin.

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
- `EnsureCompanySchemaAsync` runs every startup: creates the `company` document type if missing and allows it under `subcategory`/`categoryPage`. `EnsureMallSchemaAsync` does the same for `mall` and, through `EnsureMallAgentSchemaAsync`, adds the `googlePlaceId`, `source` and Google rating properties a plaza needs for the agent to own it (dedupe and rating refresh). `EnsureAgentApiUserAsync` also repairs the agent's OAuth client: Umbraco stores the user-to-client mapping and the OpenIddict application separately, and when only the application is gone the token endpoint answers `invalid_client` / ID2052 ("the specified 'client_id' is invalid") forever — the user exists, so nothing is rebuilt, and re-saving the credentials is refused as a duplicate. The seeder now checks the application itself and, when it is missing, drops the stale mapping and registers the client again from `CityGuide:AgentClientSecret`. Follow this pattern (guarded, every-startup) for schema additions that must reach existing installations.
- Seed steps publish the nodes they created (`PublishSeeded`), never the branch: `PublishBranch(..., IncludeUnpublished)` also publishes the agent's drafts sitting in that branch, which exist to be reviewed first. The branch publishes that remain each cover a subtree the same call just created. Bank seeding (`EnsureBanksSeeded`) runs every startup and creates the "Bancos" subcategory under "Empresas y Servicios" (one `company` per bank, branches as child `place`s) only if missing. A pre-company flat "Bancos" is deleted (content + logo media) and reseeded nested. Follow this pattern for any new seed step that must apply to existing installations. `EnsureCitiesSeeded` (also every startup) creates the announced-but-empty cities — Santiago and Punta Cana — with `comingSoon` checked: they are pickable in the city switcher (the home page at `/`, where the header's city button points), but their page renders an "en construcción" notice instead of sections, the header drops nav and search, they are `noindex` and stay out of the sitemap. Unchecking the flag in the backoffice turns a city on. The switcher's buttons are `CityBadge` (`frontend/components/CityBadge.tsx`): the logo's visual language — solar arch, palm, coastline and waves — with each city's landmark drawn inside a medallion, picked by city slug; a city without its own scene gets the generic beach one, so a new city needs no code to look right. The same emblem is the city switcher inside a city: the header carries the wordmark alone on the left (`SiteLogo` with `glyph={false}`) and, on the right, a large ringless `CityEmblem` linking to `/` — it says which city you are in and replaces the old text button. Each scene carries its own ringless crop (the tower of Santiago rises higher than the arch of Santo Domingo) sharing one 13:10 ratio, so every city's emblem reads at the same size.

Boot-time indexing race: content published during startup is NOT picked up by the Examine `DeliveryApiContentIndex` (its event handlers register after the seeder runs). The seeder therefore rebuilds that index when it seeded something. Symptom of getting this wrong: item-by-path Delivery API lookups work but list/filter queries return 0.

Bank logos live in `CityGuideWeb/CityGuide/SeedAssets/` and are imported into the Media library at seed time; `photo` is a MediaPicker3 property whose value is JSON `[{"key":<guid>,"mediaKey":<mediaKey>}]`.

## Analytics

Google Analytics 4 (gtag.js) is rendered site-wide by `frontend/components/Analytics.tsx`, mounted in
the root layout. It emits nothing unless `NEXT_PUBLIC_GA_MEASUREMENT_ID` is set, so local development
does not report traffic; `.github/workflows/deploy-frontend.yml` sets it to `G-RTX0GNHR74` at build
time (`NEXT_PUBLIC_*` values are inlined by `next build`, not read at runtime).

## Contact form

`/{ciudad}/contacto` (linked from the footer of every city) takes general enquiries,
requests to add or remove a business from the portal, and advertising enquiries. It is a
Server Action (`app/[city]/contacto/actions.ts`, form in `components/ContactForm.tsx`,
the request types in `lib/contact.ts`, which the controller repeats because it rejects
anything else), so it submits before hydration and the CMS never has to be
reachable from the browser. The action posts to `ContactController` (`/api/contact` in
CityGuideWeb), which validates in code — DataAnnotations on the record are not what runs —
drops anything that filled the honeypot field, throttles a sender to 5 messages an hour, and
creates a `contactMessage` node under the "Mensajes de Contacto" inbox
(`contactInbox`, seeded under `site` by `EnsureContactSchemaAsync` /
`EnsureContactInboxSeeded`). **Messages are saved, never published**: they carry personal
data and the Delivery API only serves published content, so the inbox exists for the
backoffice alone — that is also why `contactMessage` is not in `SeoDocumentTypes` and the
inbox is not in the sitemap (the contact *page* is, enumerated per city as a code route).
Editors read the messages in the backoffice and mark them "Atendido"; on top of that the
controller emails a notification through Umbraco's own `IEmailSender` (no extra
dependency), so nobody has to watch the tree. It needs two things and does nothing
without either: the recipient in `CityGuide:ContactNotificationEmail` (in
`appsettings.json`) and SMTP under `Umbraco:CMS:Global:Smtp` — `From`, `Host`, `Port`,
`Username` and `Password` (the password by user-secrets locally, `az webapp config
appsettings set ... Umbraco__CMS__Global__Smtp__Password=...` in Azure). Gmail wants
`smtp.gmail.com:587`, an app password, and a `From` equal to the account. The mail is
plain text with `Reply-To` set to the visitor, so answering the notification answers
them; a send that fails is logged and swallowed, because the message is already stored
and a visitor told it failed would only send it again. The visitor's address reaches the throttle as `X-Forwarded-For` (the action
forwards it — the hop through the Next server would otherwise put every visitor in one
bucket); it is a courtesy limit and the header can be forged, so the honeypot and the
validation are what actually guard the inbox.

## Gotchas

- `frontend/AGENTS.md` (auto-generated by `next dev`): this Next.js version may differ from training data — check `node_modules/next/dist/docs/` before writing frontend code.
- Umbraco runtime state (SQLite DB, logs, media) is gitignored under `CityGuideWeb/umbraco/Data/` and `wwwroot/media/`. Deleting them is the supported "factory reset".
- Agent config: one `Runs` entry in `CityGuide.Agent/appsettings.json` per Google query + target CMS content path (e.g. `/santo-domingo/restaurantes/china`).
- Delivery API is public read; before exposing the CMS publicly set an `ApiKey` under `Umbraco:CMS:DeliveryApi`.
- Deliberate v1 omissions (do not build unasked): user accounts/comments/favorites, multi-language variants, agent photo upload, webhook-driven revalidation.
