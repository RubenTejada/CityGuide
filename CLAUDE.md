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
# A paid pass skips the queries Google already answered in the last 30 days
# (Google:QueryCooldownDays; the dates live in "Consultas ya hechas" on the city node).
# --force asks all of them again, for when a section has to be re-swept now.
cd CityGuide.Agent && dotnet run -- --paid --force
# One section only (shorter runs): matches any segment of a Run's ParentPath,
# plus "cines"/"eventos" for those syncs. Comma-separated for several.
cd CityGuide.Agent && dotnet run -- --section restaurantes
# Several segments in a row name one section of one city, which two separate
# slugs cannot: "santiago,empresas-y-servicios" would select every section of
# Santiago and that section in every city, Santo Domingo's queries included.
cd CityGuide.Agent && dotnet run -- --paid --section santiago/empresas-y-servicios
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

# File under the cuisine they actually serve the restaurants stuck in "Otros": Google
# types most restaurants as nothing more than "restaurant", so the cuisine map had no
# answer and the fallback subcategory grew larger than every cuisine put together. The
# name, the address and the description already in the CMS say what is cooked there, so
# there is no Google request — only the model, which is what needs --paid. Plan until
# --apply, and --section narrows it to one city.
cd CityGuide.Agent && dotnet run -- --paid --recategorize-places
cd CityGuide.Agent && dotnet run -- --paid --recategorize-places --section santiago --apply

# Give the best-rated places of a section the photo gallery their detail page
# rotates (a main photo over three or six tiles). Google names a place's photos
# for free and bills only the download ($7 per 1.000), so the pass is capped by
# how many places it covers — "--gallery 2" is the two best rated — and prints
# the bill before spending it. Plan until --apply.
cd CityGuide.Agent && dotnet run -- --paid --gallery 2 --section restaurantes
cd CityGuide.Agent && dotnet run -- --paid --gallery 2 --section restaurantes --apply

# The menu of the best-rated restaurants, read from their own site: Google's Places
# API states no menu, only the address of the site, so that is the one source there
# is. A PDF becomes one image per page and a "carta" page gives up the pictures on
# it; that half is free — no Google request, no model token — and runs without --paid.
# Plan until --apply, and --section is what keeps it on the restaurants.
cd CityGuide.Agent && dotnet run -- --menus 25 --section restaurantes
cd CityGuide.Agent && dotnet run -- --menus 25 --section restaurantes --apply
# With --paid the same pass also reads the menus written out as text — half of them
# are — putting the page through the model once per restaurant to get the carta the
# detail page renders. Without it those places are reported and left for a later pass.
cd CityGuide.Agent && dotnet run -- --paid --menus 25 --section restaurantes --apply

# The events a city's own places announce on their own sites, for the section no
# ticket portal can fill: Juan Dolio has no box office, so every portal answers about
# it with Santo Domingo, while its bars announce live music one night a week on their
# own pages. No Google request; the model reads the agenda page, which is what needs
# --paid. Most of what it finds repeats, and is stored with its "recurrence" so the
# event sync moves it to the next Thursday instead of deleting it. --section picks
# the city, exactly as for the other event passes. Plan until --apply.
cd CityGuide.Agent && dotnet run -- --paid --venue-events --section juan-dolio-y-guayacanes
cd CityGuide.Agent && dotnet run -- --paid --venue-events 30 --section juan-dolio-y-guayacanes --apply

# IMDb / Rotten Tomatoes scores on the movie catalog need two free keys, set as
# user-secrets (leave either empty to run without it — the scores just stay blank):
#   Cinemas:Ratings:TmdbApiKey  (themoviedb.org, matches the Spanish release title)
#   Cinemas:Ratings:OmdbApiKey  (omdbapi.com, carries the IMDb rating and Tomatometer)
# In Azure the same two are the repository secrets TMDB_API_KEY / OMDB_API_KEY,
# passed by the "Run agent" workflow as Cinemas__Ratings__*.

# Fill the English side of the portal from the Spanish one. Writes only what is
# missing, so the first pass covers the site and later ones only pick up what
# discovery has since created. No Google requests at all; the model is billed per
# token, which is why it needs --paid. Plan until --apply, and --section narrows it
# (ancestors of the selection are always included, or the pages have no English URL).
cd CityGuide.Agent && dotnet run -- --paid --translate
cd CityGuide.Agent && dotnet run -- --paid --translate --apply
cd CityGuide.Agent && dotnet run -- --paid --translate --section restaurantes --apply

# Announce the portal's own content on Facebook and Instagram: the events of the
# week, the films that just reached the cartelera and the best-rated places of the
# city. A caption is the content the CMS already holds arranged in a sentence — no
# Google request, no model token — so it needs no --paid. It is the one pass that
# publishes outside the portal: it never runs on its own (the nightly job does not
# post), it prints every caption and posts nothing until --apply, and it needs three
# secrets: Social:PageId, Social:InstagramUserId and Social:AccessToken.
cd CityGuide.Agent && dotnet run -- --social --section santo-domingo
cd CityGuide.Agent && dotnet run -- --social 3 --section santo-domingo --apply

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
section image. The runs that fill a plaza's page are the retail ones and, after them, one "tiendas en <plaza>" per big mall: Google answers those with locals whose address names the mall, which is exactly what `MallMatching` needs to hang them from it — in Santiago and Punta Cana the address of a place is usually a plus code, so a tenant is invisible to that rule unless the query itself names the plaza. They run last in their city's block, after the per-category ones, so a clothing store lands in "Ropa y Moda" instead of flat under "Tiendas": whichever run sees a place first decides where it lives. A run may name the subcategory its places are filed in (`Subcategory`,
created under `ParentPath` when missing, through the same code path `AutoCategorize` uses
for cuisines): the retail runs — ropa y moda, calzado, perfumerías y cosméticos, joyería
y accesorios, tiendas por departamento — need it because what a shop sells is what the
query asks for and not what Google says about it, which types a perfume shop and a
jeweller alike as "store". A branch is exempt, as always: it lives under its brand.
**What a restaurant's cuisine is decided by.** `CuisineMap` reads it off the Google
types, which is free and authoritative — but only when they say one, and for most
restaurants they say "restaurant" and nothing more: that fallback ("Otros") ended up
holding more places than every cuisine subcategory together. So an `AutoCategorize` run
asks the model about exactly the places whose types are generic (`CuisineMap.IsGeneric`),
once for the whole run and before it creates anything (`PlaceCuisines`, a batched
classification over `CuisineMap.Options` — the closed list of the subcategory names the
map itself files under, so an answer always names a node the CMS has or can create). It
costs no Google request and a handful of tokens, and a place the model leaves out keeps
the fallback. `--recategorize-places [--apply]` is the same classification over the
restaurants already sitting in "Otros" — it reads the name, the address and the
description an earlier enrichment paid for, moves what it can place and creates the
cuisine node a city lacks, in both cultures. It only ever moves what the agent created,
it never moves a `company` (the branches would travel with it), and a place it answers
"Otros" for stays where it is: the fallback is a real answer for the gastropub whose
cuisine nothing states. Moving a node changes its URL, and the old one stops answering:
Umbraco does record the move in its redirect table, but the Delivery API does not serve
that redirect for a Spanish path — the entry it stores has the city segment mangled
("/ntiago/restaurantes/otros/…"), so the portal has no way to resolve the old address.
The sitemap, the internal links and every canonical carry the new URL from the first
publish, and the old one 404s until a crawler catches up.
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
**A chain answers to more than one name, and `ChainNames` is where the others are
written down**: Google spells a chain differently from city to city — the branches in
the capital come back as "Banco Popular Dominicano" and the ones in Santiago as plain
"Banco Popular", "Banreservas" as "Banco de Reservas", "Banco BHD" as "BHD" — so the run
that filled one city's company node left the other city's places flat beside it, without
the logo, the description or the phone the company carries (Santiago had thirteen loose
Banco Popular branches and no Banco Popular node at all). Every place where the phrase
rule decides a branch — discovery nesting a place under an existing company, a chain run
creating its brand node, `--regroup-companies` — asks `ChainNames.NamesBranch`, and
`BranchNaming` subtracts the name Google used rather than the node's own, or the branch
would be named "Banco Popular Dominicano — Banco Popular …". The names are national facts
about the chains, so they live in code beside the matcher and not in `appsettings`. An
alias has to name the chain and nothing else: "BHD" is only ever BHD León, while
"Popular" alone would take APAP ("Asociación Popular de Ahorros y Préstamos") with it.
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
in the CMS and is how the shops section was cleaned up; `--section` narrows it to one
city like every other pass, and without `--apply` it only prints the plan, and what it removes goes to the recycle bin and only when the agent created it.
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
lacking data: whatever a node is missing — rating, photo, `googlePlaceId`, and now also
address, phone, website and opening hours — is written back the moment Google hands it
over, both when a discovery run recognises a place it already has (the search answer
already carries rating and photo, so it costs nothing) and in the backfill pass, through
the one writer that owns it, `UmbracoClient.CompletePlaceAsync` — it reads the node, fills
only the blanks (refreshing a rating that moved), asks for a photo only when there is
none, and writes once.

**What each Google request costs, and how the agent stays off the expensive tier.** A
Places request is billed at the tier of the most expensive field its mask asks for, and
the tiers are far apart: a mask of ids and photo names alone is *free and uncapped*
(Essentials — IDs Only), while one field of rating, phone, website or opening hours makes
the whole request Enterprise — $35 per 1.000 text searches, $20 per 1.000 place details,
and only 1.000 of each free per month. `GooglePlacesClient` therefore keeps two masks and
picks by purpose: the full one for the two answers that need it (discovering a place the
CMS does not have, refreshing a rating) and the free one for the rest
(`GetPhotoByIdAsync`, `FindPhotoAsync`). Where the expensive tier is paid anyway the mask
asks for everything that tier carries — address, phone, website and hours ride along at no
extra cost, which is what completes a node an editor seeded by hand; a branch is the
exception, since it stores nothing of its own and reads its company's.

The backfill sorts the nodes by what they are missing rather than asking the same question
about all of them. A node that carries its id and its rating and only lacks a picture is
answered by the free sources and, failing those, by the free Google tier — what used to be
an Enterprise request per photo is now a free one or none at all. A node that is missing a
rating, or whose turn it is, takes the Enterprise call and is completed from it. And no
node that already carries everything is asked every pass: it comes up on one day of a
rotation `Google:RatingRefreshDays` long (30), decided by hashing its own id — the turns
spread evenly and stay put without a "last checked" date stored anywhere. What is still
missing something is outside the rotation and asked every pass, and
`Google:MaxBackfillRequests` caps what one pass may spend, dropping refreshes before
incomplete nodes. Google failing to answer — no match, or an outage — no longer costs the
node its picture either: the free sources are tried anyway. The
backfill covers `place` and `mall` nodes alike (plazas carry the same Google properties)
and does the incomplete ones first, so a pass cut short never leaves them queued behind
the daily rating refresh of the nodes that already have everything; a node without
coordinates — seeded, or typed in by hand — is searched inside the city rectangle
(`FindRatingInAreaAsync`) instead of around a pin it does not have. A place found by name
rather than by id has to carry that name (`FindRatingNearAsync` requires the match within
2 km *and* the name to match), or a cinema inside a plaza would take the plaza's rating:
they share coordinates and the plaza is the bigger Google result.
The agent reads per-city config from the city node's "Agente" tab (`agentCityName` replaces the `{city}` placeholder in Run queries; `agentPrompts` holds one `categoria-slug: instrucciones` line per category, appended to the description prompt; `agentArea` is the `lat,lng;lat,lng` rectangle — southwest corner, then northeast — that every Google query for that city is restricted to). Without `agentArea` Google answers a city query with the whole country: "bares en Santo Domingo" returns Punta Cana. Text Search takes only a rectangle there, never a radius, and an unparseable value means no restriction rather than an empty run. The same tab carries `agentExcludedPlaces`, the Google place ids the agent must never turn into content — one per line, everything after a `#` a note for the editor. Without it a node sent to the recycle bin comes back on the next pass: dedupe reads the published places, so an id that is no longer in the CMS looks new. It is the answer to the Google listing that is not what it claims (a "sucursal" whose id is the plaza it stands in) and to the second listing of one branch; the discovery loop skips such a place before creating or updating anything, and `EventVenues` files no venue for it (the event still takes its coordinates). `--purge-duplicate-places` prints the id of every copy it recycles so it can be pasted there, and `--exclude-place <id>[,<id>] [--note "…"] [--apply]` does the pasting and the recycling in one step — it appends each id to the list of the city its node lives in (the node's name and the note beside it, for the editor) and sends every agent-made node carrying it, place or plaza alike, to the recycle bin, so the list and the content never disagree. `--recycle-place <ruta> [--apply]` recycles one agent-made node without excluding its id, for the copy the id dedupe already prevents but nothing removes (the same Google listing filed under a second section). **A query already paid for is not asked again for a month.** Google answers the same text
search with almost the same places for weeks, and every page of every query is billed, so
each city node carries the agent's own memory of what it has asked and when
(`agentQueryLog`, the "Consultas ya hechas" field: one `yyyy-MM-dd la consulta` line each,
written back at the end of the pass). A run whose query was answered less than
`Google:QueryCooldownDays` (30) ago is skipped before it costs anything, so a paid pass
repeated inside the window only runs what is new — `--force` asks everything again, and
emptying the field in the backoffice has the same effect for one city. The log lives in
the CMS because the container the agent runs in keeps nothing between passes.

What runs on its own is the free pass: `.github/workflows/run-agent.yml` fires twice a day, at 08:23 and 20:23 UTC (4:23 AM and 4:23 PM in Santo Domingo), with no inputs, so `paid` is empty and the run refreshes the cartelera and the events without touching Google or the model. Two crons because one is not reliably daily: GitHub starts a scheduled run hours after its cron, and the workflow's concurrency group keeps only one pending run, so a manual dispatch queued while the scheduled run waits behind a long pass cancels it for good. Eventbrite answers the GitHub runner with 405 (its bot protection blocks the datacenter address; the same request from a home connection gets 200), so the events the scheduled pass imports come from TodoTickets alone until the agent runs from somewhere else. Discovery and the rating backfill are dispatched by hand with the `paid` input. (`deploy/schedule-agent-job.sh` documents the Azure Container Apps Job the schedule would live in once the subscription has room for a second environment; `deploy/provision-azure-openai.sh` documents the model resource.) The agent also runs `CinemaSync` once per city in `Cinemas:Cities` (each entry a `CityPath` plus the Caribbean site ids of that city — Santo Domingo's eight, Santiago's two, Bávaro for Punta Cana; the chain name and the `Cinemas:Ratings` keys stay shared, since those arrive as `Cinemas__Ratings__*` from the workflow and a per-city list would break them): upserts the "Caribbean Cinemas" company + branch places from the Caribbean Cinemas GraphQL API and maintains the `movie` catalog under that city's `cines` (synopsis, poster, YouTube trailer in Latino Spanish via search) — this content is published immediately, not drafted, and stale movies are deleted. The catalog covers exactly what the portal can put on screen: every movie with a showing on one of the dates the cartelera's tabs offer (`datesWithShowing` from today on, capped at 7 — the same window `getAvailableDates` gives the frontend), read from `showingsForDate`. The site's own `movies` list is not that set — it is paginated (10 per site by default, which is why most cartelera rows used to have no "Ver detalle" link) and it carries titles that are no longer scheduled. A cartelera row without a catalog node keeps the inline expander and loses its page, so the window the agent catalogues and the window the frontend renders have to stay the same. A branch place is named exactly as the Caribbean API names the site, which is the key `CINEMAS_BY_CITY` (frontend/lib/cinema.ts) joins on: a name that differs there leaves the branch page without showtimes and makes the next sync create a second branch beside it. It also fills each movie's IMDb and Rotten Tomatoes scores (`MovieRatingsClient`, config `Cinemas:Ratings`): Caribbean only gives the Spanish release title, which neither service indexes, so TMDb resolves it to an IMDb id plus the original title and OMDb turns that id into the IMDb rating/votes and the Tomatometer (it carries both). The IMDb id never changes, so a movie that already stores one skips the TMDb round trip. Every step degrades to nothing — no key, no match or a failed request leaves the portal without scores — and a failed lookup rewrites the values already stored instead of blanking them (a PUT replaces the whole document). Rotten Tomatoes exposes no id, so the portal links to its search for the original title. **Photos come from the cheapest source that has one** (`PlacePhotos`, over `FreePhotos`):
a landmark — anything under "Atracciones", a plaza, or a place Google types as monument,
museum, park or beach — is looked up on Wikimedia Commons; anything else with a website
takes the image that site declares for social previews (`og:image`); Google's photo, the
only billed one ($7 per 1.000 downloads, 1.000 free a month), answers for what is left,
and its name is asked for lazily, so a picture found free costs no Google request at all.
A Commons hit has to earn it: every significant word of the place name must appear in the
file's title as a word of its own (`TextMatch.MatchesWords`, so "Scape Park" is not
"RiverScape MetroPark") *and* the file has to say it was taken in this city — coordinates
inside the city rectangle, the city named in its title or categories, or the country for a
name distinctive enough to stand alone. Without that rule Commons answers "Parque Duarte"
in Santiago with the one in the Zona Colonial. Among what survives, a card-shaped
landscape beats a portrait and a portrait beats a panorama. The media item is named after
the place *and* its source, so provenance survives in the backoffice.

**A handful of places carry a gallery, not just a photo.** `gallery` is a second,
multi-image property on `place` (`EnsurePlaceGallerySchemaAsync`), separate from `photo`
because `photo` is the single image every listing card, map popup and Open Graph tag uses
and has to stay one choice. `--gallery [n]` (`PlaceGalleries`, scoped by `--section`,
needs `--paid`) fills it for the best-rated places that have none: Google names a place's
photos on the free tier however many there are, and only the download is billed, so what
the pass costs is exactly the pictures it brings home — seven per place by default
(`Google:GalleryPhotos`: the six the strip holds plus the one extra the viewer offers),
over as many places as the command line asks (`Google:MaxGalleryPlaces` otherwise). The frontend shows it when
there are at least four images (`PhotoGallery`): the place keeps the single main photo it
always had on the left, and the gallery closes the row beside it: a place with
one reads as three bands — the photo, then what the place says (address, description,
facilities), then the gallery, each taking half of the column beside the photo. The
gallery is its own main photo over a strip of three per row, one row or two (three images,
or six from seven up), flush inside one rounded rectangle. The strip does not move: what
rotates is the main photo, which raises the strip's photos one after another — the one up
there is the one the strip shows at full opacity — fading in softly over the one it
replaces. Any photo opens a modal viewer where they are all seen large, the ones the strip
does not fit included, with arrows, a thumbnail rail, Escape and a click outside to close.
Without a gallery the row is the photo and the details, as it always was, and on a narrow
screen the three bands stack. Fewer photos than the strip holds is not a gallery and the
column starts at the details, as before; the rotation stops while the pointer is over the
gallery or the viewer is open, and never starts under `prefers-reduced-motion`.

**A restaurant's menu is read from its own site.** Google states no menu — the Places
API carries the address of the site and nothing of what is on it — so the site is the
only source, and `--menus [n]` (`PlaceMenus` over `MenuSources`, scoped by `--section`)
walks it for the best-rated places that have none. It is the one pass that costs nothing
at all: no Google request, no model token, only somebody else's pages fetched through the
same throttled client the free photos use, which is why it needs no `--paid`. The home
page is asked for what it declares as its menu (schema.org `hasMenu`), then for the links
whose address or text says "carta" or "menú" — a file before a page, since the PDF is the
menu itself — and each candidate is followed once: a PDF is rasterized page by page
(`PDFtoImage`, pdfium and SkiaSharp, natives for every platform the agent runs on), a page
gives up the images whose own address or `alt` says they are the menu, and a page that
only links the PDF is followed one step further. Nothing is taken on size alone, or every
menu would be the dining room and the chef. Three kinds of site are left alone: a social
profile (`WebFiles.ReadableSite`, the same rule that governs the free photos), a delivery
app or review portal storing somebody else's catalogue (`MenuSources.CanRead`), and a
branch, which stores no website of its own. Measured on the fifteen best-rated restaurants
of the CMS that have their own site, three publish a scanned carta.

**The other half write their menu out, and that is what the model is for.** A page with no
picture of its own is kept as text when it reads like a carta — several prices in the
currency, `MenuSources.MenuText` — and `MenuPrompt` puts it through the model once
(`IEnrichmentClient.StructureMenuAsync`, temperature 0) to get sections, dishes, prices
and descriptions back. That call is billed per token, which is why this half of the pass
needs `--paid`: without a model the place is reported and left for a later pass, and every
scanned carta is still brought home. The prompt copies, it does not write — the price is
the line the carta prints ("RD$450", "Desde RD$284"), a page that turns out not to be a
menu comes back empty, and `MenuPrompt.Parse` drops what has no name, cuts what overruns
the caps and refuses an answer under four dishes, so the CMS only ever receives a
structure this side has checked. The result is stored as `menuData`, one JSON document
holding **both languages at once**: the same call returns the English section name and
dish description beside the Spanish ones, and the dish name is in neither language in
particular, because a dish is called what it is called. That is why `menuData` is
invariant like `facilities` rather than culture-variant — `lib/menu.ts` picks the side the
page is in on render, falling back to the Spanish section name (a section must have one)
but never showing a Spanish description on an English page. The translation pass never
sees it. What this still does not reach is a menu drawn by JavaScript (Zola's, the Wix
ones): the raw HTML carries no prices, and nothing short of a headless browser would find
them. The pages are stored on
`place` as `menu`, a third multi-image property (`EnsurePlaceMenuSchemaAsync`, with
`menuSource` and `menuUpdated` beside it): images say the same thing in both languages, so
none of the three varies by culture. The source is stored because a menu is the one thing
on the page that goes stale without anybody noticing — it is what an editor follows to
check a price, what the visitor sees under the button, and what the page declares to a
search engine as `hasMenu` (only on the types schema.org lets carry one, so a shop never
does). Both shapes reach the page the same way: a button beside the opening hours, as one more
thing consulted before going, opening a modal. The scanned pages get a button carrying the
first page as its thumbnail and the page count (`MenuViewer`), and open the same viewer
the gallery opens — that viewer is now `ImageViewer`, shared by both, since it is the same
images seen large and a second copy would only let the two drift apart. That viewer zooms
(buttons, wheel, pinch, double tap, and a drag to pan once zoomed, clamped to the frame),
because the print on a photographed carta is not legible at frame size; the zoom labels are
the viewer's own, read from the dictionary rather than passed by the caller, and every
change of image returns it to size. The written carta
gets a button carrying cutlery and the number of dishes (`MenuDialog`, with `MenuSections`
as the list inside it): a carta of thirty dishes rendered into the page pushes the map and
"¿Qué está cerca?" off the screen, and it is consulted when it is wanted, not in passing.
Being behind a button costs it nothing it was worth having — the JSON-LD is in the page
either way, so Google still gets a real `Menu` with its sections and dishes (`menuJsonLd`
in `seo.ts`; a dish declares an `offers` price only when the carta states one plain number,
so a "Desde RD$284" publishes no figure the restaurant never quoted).

Inside both modals, and only there, goes `MenuNote`: where the menu was read from, **the
date the portal captured it** (`menuUpdated`, formatted by the page and passed in, so the
server and the browser never disagree about a timezone) and the warning that prices and
dishes may have changed since. A copied carta is right the day it is taken and drifts from
then on, and the place to say so is with the prices in front of the reader, not under a
button nobody has pressed. A place with no menu shows nothing.

Every event gets a main image: the one the source declares, else the `og:image` of its
ticket page, else a Google photo of its venue. `EventSync` runs once per city in `Events:Cities` (each entry a `CityPath`, its own `Sources` and its own `VenueSections`) and fills that city's `eventos` from public event portals (TodoTickets detail pages, Eventbrite listings) via per-source strategies ("jsonld-listing", "jsonld-detail"); the national portals are listed by every city and scraped once for the whole pass (`EventSync.ScrapeCache`, keyed by source URL) — the feed is the same and only the rectangle that filters it differs, so the second city costs no request; events publish immediately, dedupe by ticket URL and name+date, and only agent-created (`source` = `agent:*`) past events are deleted — TuBoleta (JS-loaded dates), Uepa Tickets (Cloudflare) and TicketExpress (a listing frozen in 2020 whose pages state neither venue nor a real date, so the prose parser invented future ones) are deliberately not scraped. Every portal lists the whole country, so an event is only imported when its location is inside the city's `agentArea` rectangle (`EventVenues`): the portals state the venue's coordinates in their JSON-LD and the rectangle decides for free — the locality they file it under does not, since Escenario 360 reads "Los Alcarrizos" and stands on Av. John F. Kennedy — and an event without coordinates is kept only when its venue name resolves, on Google restricted to that same rectangle, to a place carrying every significant word of the name. A failed lookup is never read as "not in the city", and a city with no `agentArea` keeps importing everything. Resolving the venue also yields a full place, so the venue is created in the section its Google types belong to (`Events:VenueSections` — bars and attractions; a hotel or a shop matches none and only gives the event its coordinates, which is what puts it on the events map), like any discovered place and deduped by Google place id. `dotnet run -- --purge-foreign-events [--apply]` applies the same rule to the events already imported and recycles the ones outside the city (seeded and hand-made events are never touched); the "Run agent" workflow exposes it as the `purge_foreign_events` input. Each event's "Categoría" comes from the model (`EventCategories`: one batched call per portal, from the vocabulary the seeded events use), because no portal states one and the title is usually just the artist's name — an event stays uncategorized, never mislabelled, when no model is configured or the call fails. `dotnet run -- --scrape-events` prints what each source yields, and whether the city filter would keep it, without touching the CMS; `dotnet run -- --recategorize-events [--apply]` reclassifies the events the agent already created (only `agent:*` ones — hand-made and seeded events keep their editor's category), and the "Run agent" workflow exposes it as the `recategorize_events` input so it can be run against Azure. `dotnet run -- --purge-event-source <portal> [--apply]` recycles what a retired portal left behind: dropping a source from a city's `Sources` stops new imports but not the old ones, which are neither past nor locatable (TicketExpress's seven events sat there until this removed them). A venue is looked up once per pass, not once per event: a portal lists a season at one
address — eight nights at the Gran Arena — and each of those events used to pay for the
same Enterprise search (`EventVenues` caches by venue name). Every event pass — the sync
and each maintenance one — covers every city in `Events:Cities`, and `--section` narrows it: a city slug is a segment of its paths, so `--section santiago` is how one city is run on its own, for the discovery runs and the two syncs alike.

**A town without a box office is invisible to every portal, and that is what
`--venue-events` answers.** Every source the sync scrapes sells tickets, so it lists the
venues that have a box office and says nothing at all about Juan Dolio y Guayacanes:
Eventbrite publishes a "Juan Dolio" page, and not one of the twenty events on it falls
inside the city's rectangle (they are Santo Domingo, La Romana and Casa de Campo), while
TodoTickets is national ticketing and `allevents.in` has no such city; GetYourGuide,
Viator, TripAdvisor and Civitatis answer a datacenter address with 403, like Uepa Tickets.
Adding another portal there buys nothing. What that town does have is a bar with live
music every Thursday and a club with a tournament on Sunday, written on the place's own
page — so `--venue-events [n]` (`VenueEvents` over `EventSources`, scoped by `--section`
like every other event pass) reads the places the CMS already holds for that city, takes
the ones whose `website` is their own site (`MenuSources.CanRead`, so Instagram and
Facebook — which is what most of them store — are left alone), walks it for the page whose
links say "agenda", "eventos", "actividades" or "programación", and keeps the candidate
whose text states the most dates and weekdays. Fetching is the same throttled client the
free photos and the menus use: not one Google request. The model is what turns that page
into events, which is why the pass needs `--paid`: an agenda is prose written for a
visitor ("los jueves se enciende con música en vivo"), and no portal states it as data.
The event takes the place as its venue, so it carries its address, its coordinates — which
is what puts it on the events map — and its photo, at no download: the picture of the bar
is already in the Media library.

**The prompt copies, and the parser checks that it did.** `EventAgendaPrompt` refuses a
page about renting salones for a wedding (which is what "Eventos" means on a hotel's
site), an opening hours table, and a hotel's animation programme for its own guests. No
wording of those rules held on its own: a schema offering a day of the week gets one, and
asked about a resort's *nightly* show the model answered "viernes" twice running. So the
answer is verified instead of trusted, in code. Every weekly activity has to quote the
sentence of the page that announces it (`evidence`, required by the schema), and `Parse`
drops it unless that quote names the day *and* appears in the page text, accents
stripped — there is no quote for a Friday show that does not exist. Nor is a quote that
does exist always an announcement: "Miércoles a Sábado – 20h" is when a restaurant opens,
and a model asked for events read two cultural evenings into it, so a sentence running
from one weekday to another is an opening-hours line and never an event
(`Announces`/`DayRange`). It is the same discipline that makes `MenuPrompt` refuse a
carta of three dishes: the CMS only ever receives what this side could check. Measured
over the eighteen Juan Dolio places with a site of their own that leaves zero events
today, which is the honest answer; over Santo Domingo, where real sites are common, it is
what the pass is for.

**Most of what it finds repeats, and `recurrence` is how the portal keeps it.** A weekly
activity has no date to store — it is every Thursday — so `eventItem` carries a
`recurrence` ("semanal:jueves", added by `EnsureEventCategorySchemaAsync` and invariant,
being a rule and not prose), and `EventSync` moves such an event to its next night as each
one passes instead of deleting it (`EventRecurrence`, `RollAsync`: the time of day and the
length are kept, and an event already in the future is left alone). Only an event *without*
a rule can be past, and only an agent-made one is then deleted, so nothing an editor typed
is touched — and an editor who wants a weekly event now has the field to say so, which is
the tool a beach town needs more than another scraper. The frontend leads with the rule
where it has one: a card and the event page read "Cada jueves" instead of a single date
that would look like the only one (`recurrenceLabel` reads the day off the stored Spanish
value and names it with `Intl`, so the English page says "Every Thursday" without a second
table to keep in step). Every external request goes through `ThrottlingHandler` (min interval + jitter per host, `Throttle:SecondsBetweenRequests`) so the agent is slow on purpose and never trips rate limiters.

Content model (all created in code, not in the backoffice):
`site` → `city` → `categoryPage` → `subcategory` → `place`, plus `eventsPage`/`eventItem` and `thingsToDoPage` (“Qué Hacer”: aggregation-only guide page, planned for a day — the attractions open that day, its events (or the next ones), its most-shown movies (live cartelera cards, not a list of theaters — that is why “cines” is excluded from the idea sections), idea sections per category, every block capped at six with a link to its section; no child content) under each city, and `movie` (agent-maintained cartelera catalog) under `categoryPage`. `categoryPage` accepts `subcategory`, `place`, and `company` children; `subcategory` accepts `place` and `company`; `company` (empresa: logo + general info) accepts only `place` (its branches/sucursales).

Company inheritance: a `place` under a `company` stores only its own data (name, address, coordinates); empty fields (phone, website, hours, description, photo) fall back to the parent company **in the frontend** (`PlaceView` in the catch-all page). Category/subcategory listings show companies as single cards and never flatten their branch places (`listingEntries`); branches appear only inside the company page. Every listing (category, subcategory, mall groups) is ordered best rated first by `listingEntriesByRating`: a company or mall carries no rating of its own, so it ranks by its best-rated nested place, and unrated entries keep their original order at the end.

A section page also links its subcategories (`SubcategoryLinks`, a chip row carrying each
one's glyph and how many entries it holds), under the pagination and headed "Ir a la
categoría". The dropdown above the listing narrows that same listing in place, which is
what a visitor wants and what a crawler cannot follow (the picks are query string, and
`canonicalListingPath` folds any filter back into the bare URL) — without the links every
subcategory page, and every place under it, was reachable only from the sitemap, which is
how a search engine decides a page is an orphan and indexes almost none of them. The two
sit apart rather than stacked together because they are two different intentions —
narrowing this page, and leaving it for another — and a link is followed wherever it sits.

Frontend routing is a single catch-all (`frontend/app/[lang]/[city]/[...slug]/page.tsx`) that switches on the item's `contentType` — new document types need a new case there.

A `movie` has its own page (`MovieView`): the CMS catalog entry (poster, sinopsis, trailer button, IMDb/Rotten Tomatoes badges) over the *live* Caribbean showings — every cinema in the city presenting it on the chosen date (`?fecha=`), its showtimes as booking links, and a map of those cinemas. Cartelera cards link into it whenever the catalog has the movie, matching on name (`getMovieCatalog`, keyed by lowercased name — the same join the trailer override and the badges use); a title the agent has not catalogued yet simply keeps the inline expander and no link. The per-cinema list and its map are `MovieShowtimes`, shared by the card's expanded body and the movie page, and the date pills are `DateTabs`, shared by the movie page and `Cartelera`. `getMovieShowings` asks for the billboard with `trailers: false` — the movie page reads its trailer from the CMS, so the slow YouTube fallback search must not run there.

Map pins never show a node's own photo: `mapPinIcon` (`frontend/lib/sections.ts`) draws the
parent company's logo for a branch and the section glyph otherwise, so pins stay legible and
say which section they belong to. Photos are for listing cards, detail headers and map popup
cards — that is why `/api/nearby` returns `photo` (the real image) and `icon` (company logo
or null) separately, and why `MapMarker` has both.

Every listing offers two views of the same results, switched by `ViewToggle`: the paginated
grid of cards and a map of those very same (filtered) entries. **The server owns that
state**, and `lib/listing.ts` is where it is settled: the query string carries the ticked
dropdowns, the page and the view, and the `Listing` helper in the catch-all filters the
entries, slices twelve of them and renders only those cards — the map view renders none, it
wants the pins. `ListingViews` receives them already drawn and is left with the controls,
which navigate (`usePendingNavigate`, covered by the `PendingArea` overlay the cartelera
already used for `?fecha=`) instead of mutating state in place. Doing it in the browser meant
serialising a rendered card for every entry so the browser could pick twelve: on
"Restaurantes" in Santo Domingo, 3.8 MB and a 2.2 s render to draw 12 places, against 176 KB
and 0.19 s now. The pagination is `ListingPagination`, real `<a href>` links carrying
`?pagina=`, because a listing past its first twelve entries is otherwise unreachable by a
crawler and unbookmarkable by a visitor; the filter controls stay buttons, since a crawlable
URL per combination of facilities is a thousand near-identical pages. Page 1 is always the
bare URL, the links keep whatever else is picked, and the `ItemList` describes the twelve
entries actually on the page, numbered from where that page starts. Each entry's pins are
`listingMarkers` (a place or mall pins itself, a company pins every branch under it, an entry
without coordinates pins nothing, and the toggle is hidden when no entry has any).
Every listing of the portal goes through that one path, whatever it lists: the sections and
subcategories, a company's branches, the articles, the events (`EventsView` keeps its month
headings and its "Eventos pasados" block — it hands `ListingViews` the composed sections
instead of a grid, and pages through upcoming-then-past as one ordered list) and the "Qué
Hacer" guide (`ThingsToDoExplorer`, a server component: `?fecha=` picks the day being planned
through the cartelera's `DateTabs`, and a row of activity chips — one per block, each carrying
its count for that day — narrows the page to one block with `?actividad=<slug>`, which then
shows twenty-four of itself instead of six; both are links, and there is no pagination, since
each block links to the section that holds the rest). The one filter left in the browser is
`PlaceMap`'s "¿Qué está cerca?" panel: it narrows pins fetched live from `/api/nearby`, which
is a map tool rather than page content — nothing there is content a crawler should be reading
on this page, and a navigation per tick would reload a place page to redraw a widget.
`MarkersMap` is the one map of
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

**The portal announces itself.** `--social [n]` (`SocialSync` over `MetaClient`, scoped
by `--section`, whose city slug picks one city) publishes to the Facebook Page and the
Instagram business account linked to it: the events starting within
`Social:EventDaysAhead`, the films the cinema sync catalogued in the last
`Social:MovieDaysNew` days, and the best-rated places the pass has not announced yet
(`Social:MinRating`/`MinReviews`, and a place with no description of its own is skipped —
that is a branch reading its company's prose). One of each kind before a second of any,
capped by `Social:MaxPostsPerPass`, so a feed is never three restaurants in a row. It
costs nothing: a caption is the name, the rating and the first sentence of a description
an enrichment call paid for long ago, which is why the pass needs no `--paid`; and it is
the one pass that writes outside the portal, so it never runs on its own — the nightly
job does not post — and prints every caption until `--apply`. Both networks are reached
through one Graph API token (Instagram is published to through its Page), but not the
same way: Facebook takes the picture and the caption in one request, Instagram takes a
container it downloads the image into and then a publish, and it refuses anything outside
4:5 – 1.91:1 — a film poster is 2:3, so films go to Facebook alone. Meta downloads the
picture itself, so what it is handed is a URL on the portal's own origin, which already
proxies `/media` from the CMS. What it must never do is announce the same place twice,
and the container the agent runs in keeps nothing between passes, so the memory lives in
the CMS beside the query log: `agentSocialLog`, the "Publicaciones ya hechas" field on
the city node, one `yyyy-MM-dd <id> <nombre>` line per node already posted. A post that
failed is not written to it, so the next pass offers it again. `.github/workflows/run-agent.yml`
exposes it as the `social` dispatch input (plan / apply, `social_posts` for the cap), with
the three Meta credentials as repository secrets.

**El clima de la ciudad** lo sirve `frontend/lib/weather.ts`, de dos fuentes por lo que
cada una hace mejor. WeatherAPI.com da el dato de ahora mezclando observaciones de
estaciones — el número que reporta el aeropuerto y que enseñan las apps del teléfono —
pero necesita una clave (`WEATHER_API_KEY`, gratis, un millón de llamadas al mes) y su
plan gratuito solo pronostica tres días (la prueba inicial responde con siete).
Open-Meteo es un modelo puro, sin clave ni
cuenta y con siete días, pero en la costa se queda uno o dos grados corto de lo
observado (medido contra METAR: Santo Domingo 30,2° frente a 32°, Punta Cana 29,8°
frente a 31°, Santiago clavado). Así que WeatherAPI manda en el "ahora" y en los días
que alcanza, Open-Meteo completa del cuarto al séptimo, y sin clave o ante una caída
Open-Meteo responde sola: el portal nunca se queda sin clima, y en desarrollo funciona
sin configurar nada. La clave es de servidor, no `NEXT_PUBLIC_`, así que se lee en
tiempo de ejecución (ajuste de aplicación en App Service, no secreto de compilación).
Las coordenadas son las que el nodo `city` ya lleva (`latitude`/`longitude`, el centro
del mapa), de modo que una ciudad nueva trae su clima sin tocar código — y por eso ese
centro importa más que antes: WeatherAPI lo resuelve a la celda más cercana, y la que
respondía al centro original de Punta Cana daba el día entero entre 28 y 29 grados, sin
madrugada. `CityCenterFixes` en el seeder lo mueve sobre Bávaro, donde está el grueso
del contenido de esa ciudad, con la misma guarda que `AtraccionPinFixes`: solo toca el
nodo que aún guarda el par exacto que sembró la versión anterior. Una petición por fuente y ciudad,
revalidada cada 30 minutos, sirve las dos vistas: es la misma URL, así que React la
deduplica y la cabecera y la guía no pagan dos. Los códigos de cada fuente —la escala
WMO y la lista de WeatherAPI— se reducen a las ocho condiciones que el portal dibuja y
nombra (`conditionOf`, `weatherApiConditionOf`), y los dibujos son
`components/Weather.tsx`, con luna en vez de sol de noche. En la cabecera va
`WeatherBadge`, junto al emblema de la ciudad y a media altura: es un dato de esa
ciudad y de ninguna otra. La insignia lleva el icono y los grados, y al pasar el ratón
abre el resto —condición, sensación, máxima, mínima y lluvia del día— en un panel de
CSS puro (`group-hover`), sin JavaScript ni componente de cliente; lo mismo va en el
texto oculto que lee un lector de pantalla, por lo que el panel es decorativo
(`aria-hidden`). En "Qué Hacer" va `WeatherForecast`, pegado a las pestañas de
fecha, con el pronóstico del día que se está planificando — máxima, mínima y
probabilidad de lluvia a partir del 20 %, más la temperatura de ahora y la sensación
térmica cuando el día es hoy, que en el Caribe se separan cinco grados y es la segunda
la que dice si el plan es de calle. Sin dato no se dibuja nada: una ciudad sin
coordenadas, o un día fuera de la ventana, dejan la página exactamente como estaba.

## SEO

All of it is derived from the CMS item, so content published later is covered without code changes.
`frontend/lib/seo.ts` is the single source: canonical/Open Graph URLs, title and description shaping
(60/160-char budgets, with progressively shorter title candidates instead of mid-word truncation),
and every schema.org builder. `components/JsonLd.tsx` renders it.

- **Per page** (`generateMetadata` in `app/[lang]/[city]/[...slug]/page.tsx`, plus `app/[lang]/[city]/page.tsx`,
  `app/[lang]/page.tsx` and the root layout): a self-referencing canonical, `og:*`/`twitter:*`, explicit robots
  directives, and a document-type-specific title/description. Query strings (`?fecha=`, `?q=`) never
  reach the canonical. The home page states its own metadata through `pageMetadata` too, from the
  `SITE_TITLE`/`SITE_DESCRIPTION` the root layout also uses, so every route's canonical and OG tags come
  from one builder.
- **Listing pages** (`categoryPage`, `subcategory`): the editor's `intro` leads, and `listingLead`
  supplies what the page actually holds — how many places, the section, the section above it and the
  city. It is the meta description when there is no intro, and `listingDescription` appends it to an
  intro shorter than 96 characters (a seeded "Tiendas y centros comerciales." leaves two thirds of the
  snippet budget unused). The same sentence without the section name — the heading already carries it —
  is the page's visible lead paragraph, so a subcategory page is no longer a heading with cards under
  it. `subcategory` had no editable text at all until `EnsureSubcategoryIntroSchemaAsync`
  gave it `intro`. The count comes from `listingCount`, which reuses the ISR-cached queries the view
  itself runs, so the metadata pass costs no extra request.
- **`og:image`**: a page with a photo sends it; a page without one falls back to
  `app/[lang]/opengraph-image.tsx`. That fallback only applies when the metadata declares no images at all, so
  `pageMetadata` omits the key entirely instead of setting it to `undefined` — with the key present
  every page went out without a preview image, home and section pages included.
- **Structured data**: `BreadcrumbList` on every content page (from the existing breadcrumb),
  `Restaurant`/`BarOrPub`/`Store`/`MovieTheater`/`TouristAttraction`/`LocalBusiness` per section for
  places, `ShoppingCenter` for malls, `Organization` + branch `Place`s for companies, `Event`,
  `Article`, `Movie`, `ItemList` for listings, `Organization`+`WebSite` site-wide. Free-text "Horario"
  is parsed into `openingHoursSpecification`; unparseable lines are dropped.
- **`app/sitemap.ts`** enumerates every published node (`getDescendants`, `updateDate` as `<lastmod>`),
  **`app/robots.ts`** points at it and disallows `/api/` and `/*/buscar`; the search page is also
  `noindex, follow`. **`app/[lang]/opengraph-image.tsx`** is the branded fallback card for pages without a photo.
- **`NEXT_PUBLIC_SITE_URL`** must be set per environment — it is the origin of every canonical, OG URL
  and sitemap entry. It defaults to `https://quehacerrd.com`.
- **Only that origin answers**: `redirects()` in `next.config.ts` sends `www`, any
  `*.azurewebsites.net` host and anything arriving with `x-forwarded-proto: http` to it with a
  308, keeping the path and the query. App Service kept serving all three, so the portal was
  three copies of five thousand pages; the canonical tags said which one counted, but a
  crawler had to fetch the other two to find out and links pointing at them passed nothing on.
  `quehacerrd-web` has no health check path configured, which is what makes redirecting its
  own hostname safe. Set `--https-only true` on the App Service as well; the redirect only
  covers what already reached Node.
- **A page of a listing is a page of its own**: `?pagina=3` self-references its canonical and
  carries " — Página 3" in the title, or a crawler folds it into page 1 and stops coming back,
  which is exactly what keeps everything past the first twelve entries out of the index.
  `canonicalListingPath` owns the rule: out of range (`?pagina=999`) points at the bare URL, so
  a bad link is not an indexable page; and a ticked filter, the map view or the day of a
  cartelera folds into the bare URL, because those are the same page seen differently and a
  crawlable URL per combination is a thousand near-identical pages. The hreflang pair carries
  the same page number, and both sides drop the trailing slash the Delivery API puts on a route
  path — `/restaurantes/?pagina=3` would be a second URL for a page that already has one.
- **Internal links are what get a page indexed** — the sitemap alone does not. Two things fed
  the crawler almost nothing until they were fixed: the subcategories of a section were only a
  filter dropdown (now also `SubcategoryLinks`), and everything past the first twelve entries
  of a listing was client state (now `?pagina=` links). Both are described under Architecture.
- **Editor overrides**: the "SEO" tab (`metaTitle`, `metaDescription`, `noIndex`) exists on every
  indexable document type, added by `EnsureSeoSchemaAsync` in the seeder. Empty is the normal case for
  hand-made content.
- **Agent-written SEO**: the enrichment call that describes a discovered place also returns its
  `metaTitle` and `metaDescription` (`EnrichmentPrompt`), so the page carries a title and a snippet
  written for it instead of the shape every place shares — and it costs nothing, being two more fields
  on a call the place already pays for. A title over 47 characters (60 minus the ` | QueHacerRD` the
  template appends) is dropped rather than cut, since the frontend stores an override verbatim; the
  description is passed through, because `clampDescription` truncates every candidate on a word
  boundary. Branch places carry neither: they have no enrichment of their own and their derived title is
  already "Cadena — lo que la distingue". Events and movies carry none either — nothing per item is
  written by the model there, and deriving their metadata in the agent would only duplicate `seo.ts`.
- **A new document type needs**: a `case` in `generateMetadata`, a JSON-LD builder call in its view, an
  entry in `SITEMAP_HINTS`, and its alias in `SeoDocumentTypes` in the seeder.

## Two languages (es-DO / en-US)

The portal is served in Spanish and English through **Umbraco culture variants**, not through
parallel `*En` properties: the node *name* varies too, which is what gives each culture its own
URL segment (`/santo-domingo/restaurantes` and `/en/santo-domingo/restaurants`).

- **Which content varies** is declared once, in `TranslatedDocumentTypes` (`CityGuideSeeder`):
  every document type the portal publishes, each with the properties carrying text a reader sees
  (`description`, `intro`, `country`, `hours`, `summary`, `body`, `synopsis`, `genre`, `category`,
  `metaTitle`, `metaDescription`). Everything else stays invariant and is shared by both
  cultures — coordinates, phone, website, photos, Google ids and ratings say the same thing in
  either language, and `facilities` is a closed vocabulary the frontend translates on render.
  `site` carries no translatable text but varies anyway: a culture only routes when every
  ancestor is published in it. `contactInbox`/`contactMessage` never vary — they are backoffice
  records, not pages.
- **The default language is `es-DO`, and that is load-bearing.** When a document type is switched
  from invariant to culture-variant, Umbraco moves the values it already holds into the *default*
  culture, and an Umbraco install defaults to `en-US` — which would file every Spanish description
  the portal has under English. `EnsureLanguagesAsync` makes Spanish the default and
  `EnsureCultureVariationAsync` refuses to migrate anything until it is.
- **English has no fallback and is not mandatory.** A page nobody has translated is simply absent
  from the English site instead of serving Spanish text under an English URL, which is what would
  make the two hreflang variants duplicates of each other. The Delivery API answers
  `Accept-Language: en-US` with only what is published in English.
- **Culture domains are mandatory, not cosmetic.** Umbraco builds no URL at all for variant
  content whose culture is not bound to a domain, and content the Delivery API cannot route is
  dropped from its answers — the symptom is a list endpoint reporting a `total` with an empty
  `items` array while every item-by-path lookup 404s. `EnsureCultureDomainsAsync` binds Spanish
  to the site root itself and English to the `/en` prefix.
- **Every write sends back what it does not mention.** `ContentCultures` (in the agent) says
  which aliases carry a culture on the Management API wire; `UmbracoClient` owns the stamping
  (`WithCulture`) and reads back only the culture it is working on (`BelongsTo`, `VariantOf`).
  A PUT replaces the whole document and a caller only ever describes one language, so every
  write goes through `PutDocumentAsync`, which reads the document first and re-sends every
  stored value under a property-and-culture the caller is *not* writing. That covers two
  different losses: the other language's prose (without it a discovery run deletes the English
  page of every place the translation pass had covered) and every **shared** property, which
  belongs to no culture and would otherwise be wiped by whichever pass wrote last, taking the
  address, phone, coordinates, rating and photo with it. Publishing is per culture and additive
  (`PublishAsync(id, culture)`).
- **A place the agent discovers is created in both languages at once.** The enrichment
  call that describes it answers with the English description, title and snippet as well
  (`Enrichment`, `EnrichmentPrompt`), which costs no extra call and no extra Google
  request — they are three more fields on the answer the place already pays for — so a
  place found today has an English page today instead of waiting for the next translation
  pass. Its opening hours are translated by the table, and its name is not translated at
  all: a place is called what it is called. A branch stores no prose in either language,
  so it gets its English variant with nothing but a name and reads its company's; and a
  place whose English prose did not come back (the content filter trips on nightlife) is
  left for the translation pass rather than published as an English page written in
  Spanish. The structure a run creates on the way — a subcategory, a brand node, a plaza
  rebuilt by `--regroup-malls` — takes its English variant too (`alsoInEnglish`), because
  a culture only routes when every ancestor is published in it; what it does not take is
  prose, which the translation pass fills. Films and events stay Spanish until that pass:
  their text comes from the cartelera and the ticket portals, not from a model call this
  side could piggyback on.
- **`--translate` fills the English side** (`TranslateSync`), writing only what is missing: the
  first pass covers the site and every pass after it picks up what a discovery run has since
  created. It touches Google not at all — the words are already in the CMS. Most of the text
  never reaches the model either: `TranslatedVocabulary` answers opening hours (Google's own
  closed vocabulary of seven day names and two words, a quarter of the Spanish text in the CMS),
  event and article categories, film genres, and the section names — those last are curated
  rather than translated on the fly, because they become the English URL segment and a URL that
  changes between runs is a URL that breaks; a name missing from the table is reported and left
  in Spanish. What is left for the model is descriptions, intros, article bodies and the SEO
  pair, batched by character budget (`Translation`). Nodes are translated ancestors-first, since
  a culture only routes when everything above it is published in it, and `--section` therefore
  pulls in the ancestors of what it selects. For the same reason the pass runs in two steps —
  the nodes with children first (sections, subcategories, the guide pages, the companies), then
  the rest after reading again what English the Delivery API serves: it only serves a culture it
  can route, so under a section nobody has translated yet every place discovered in both
  languages looks untranslated and would be paid for twice, its English prose overwritten by a
  translation of the Spanish (opening "Empresas y Servicios" in English for Santiago and Punta
  Cana was 18 nodes, not 244). A node whose prose comes back untranslated is left
  for the next pass rather than published as an English page carrying Spanish text.
  Two things bite a full pass over the whole site. It reads the tree from the Delivery API's
  list endpoint, which is backed by Examine, and a CMS that has just restarted answers with a
  total it cannot yet fill — so `GetPublishedNodesAsync` refuses a short page rather than let a
  pass cover a slice of the site and report the whole of it. And a pass over a few thousand
  nodes outlives the Azure login of the "Run agent" workflow: `azure/login` obtains an OIDC
  client assertion good for five minutes, and once the access token it bought expires an hour
  in, `DefaultAzureCredential` cannot buy another (`AADSTS700024`). Nothing is lost — the pass
  writes node by node and the next one resumes where it stopped — so a first full translation
  simply takes two runs.
- **The frontend serves both from one tree.** Every route lives under `app/[lang]`, whose
  layout is the root layout (`<html lang>` comes from the segment), but only English shows
  the segment: `proxy.ts` — Next 16 renamed middleware to Proxy — rewrites "/santo-domingo/…"
  to "/es/santo-domingo/…" without the visitor seeing it, and redirects a request that spells
  "/es" out to the URL without it, so no page is reachable at two addresses. Spanish keeps
  the URLs the portal has always had; they are indexed and linked.
- **The language is read from the route, not passed around.** `next/root-params` gives any
  Server Component the segment without prop drilling (`activeLocale` in `lib/cms.ts`), and
  Client Components read it from a context (`LocaleProvider`, `useWords`). That API exists
  only in Server Components, which is why the modules that fetch are split from the ones the
  browser gets: `lib/cms.ts` (fetching) against `lib/umbraco.ts` (types and property
  helpers), `lib/searchIndex.ts` against `lib/search.ts`, `lib/movieCatalog.ts` against
  `lib/cinema.ts`. Importing a fetching module from a card or a map breaks the build with
  "'next/root-params' cannot be imported from a Client Component module" — keep the two
  sides apart. The Route Handler and the sitemap, which have no route segment to read, pass
  the language explicitly (every fetch takes it as an optional last argument).
- **`lib/i18n.ts` holds every word the frontend writes itself** — chrome, empty states, the
  derived SEO sentences — as one dictionary per language. Content never passes through it:
  Umbraco already served the page's language. Two closed vocabularies do get translated on
  render, because they are keys rather than prose: a place's `facilities` and an event's
  category. Dates and numbers are formatted with `INTL_LOCALE`, and the free-text "Horario"
  parses in either language (`DAY_TOKENS` in `lib/seo.ts`, read by both the JSON-LD parser
  and the guide's `openOn` in the catch-all).
- **Section configuration is keyed by the Spanish slug.** Section images, map glyphs,
  schema.org business types and the "subcategory is the category" rule are all looked up by
  slug, and English URLs carry translated ones — `lib/sectionSlugs.ts` maps them back
  (`canonicalPath`, and `localizedSectionPath` for the paths the app builds itself, like a
  cinema's branch page). It also drops the "/en" prefix, which would otherwise shift every
  path index by one; `contentSegments` does the same where a page reads segments directly.
- **The language switch is a route, not a link.** A page's path differs by more than its
  prefix, so `LanguageToggle` links to `/api/language`, which looks the page up by id in the
  language asked for and redirects. Pages the CMS does not own (contact, search) fall back to
  the same path under the other prefix; content nobody has translated falls back to the
  city's front page rather than to a 404.
- **What the pages declare**: a self-referencing canonical, an `hreflang` pair plus
  `x-default` (only when the counterpart really exists — `alternateOf` reads it by id, and an
  alternate pointing at a 404 makes Google drop both sides), `og:locale` with
  `og:locale:alternate`, `inLanguage` on the site, article, event and movie JSON-LD, and a
  sitemap listing both languages with `<xhtml:link rel="alternate">` per entry. The search
  page stays `noindex` and declares no pair. `/{ciudad}/contacto` and `/{ciudad}/buscar` keep
  their Spanish segments in both languages: they are code routes, one is out of the index and
  the other is a footer link, and a translated segment there would buy nothing.
- **The migration is irreversible and rewrites content data.** Back the database up before
  deploying it. Production runs on **Azure SQL** (`quehacerrd-sql/cityguide`), not on the SQLite
  file the local install uses and not on the leftover `.db` files still sitting in the app's
  `/home/data`: back it up with `az sql db copy` (or restore point-in-time — the Basic tier keeps
  seven days). Schema and agent must ship together: an agent still writing `culture: null` fails
  against variant types.

## The seeder (read this before touching content or schema)

`CityGuideWeb/CityGuide/CityGuideSeeder.cs` runs on every startup (registered in `CityGuideComposer`) and is the single source of truth for document types and seed data. Its idempotency is check-based, each guarded separately:

- Schema creation is skipped when the `place` document type exists. **Editing a document type in the seeder does nothing for an existing database** — change it in the backoffice too, or delete `CityGuideWeb/umbraco/Data/` (and `wwwroot/media/`) to re-seed from scratch.
- Sample content is skipped when a `site` root exists.
- `EnsureCompanySchemaAsync` runs every startup: creates the `company` document type if missing and allows it under `subcategory`/`categoryPage`. `EnsureMallSchemaAsync` does the same for `mall` and, through `EnsureMallAgentSchemaAsync`, adds the `googlePlaceId`, `source` and Google rating properties a plaza needs for the agent to own it (dedupe and rating refresh). `EnsureAgentApiUserAsync` also repairs the agent's OAuth client: Umbraco stores the user-to-client mapping and the OpenIddict application separately, and when only the application is gone the token endpoint answers `invalid_client` / ID2052 ("the specified 'client_id' is invalid") forever — the user exists, so nothing is rebuilt, and re-saving the credentials is refused as a duplicate. The seeder now checks the application itself and, when it is missing, drops the stale mapping and registers the client again from `CityGuide:AgentClientSecret`. Follow this pattern (guarded, every-startup) for schema additions that must reach existing installations.
- Seed steps publish the nodes they created (`PublishSeeded`), never the branch: `PublishBranch(..., IncludeUnpublished)` also publishes the agent's drafts sitting in that branch, which exist to be reviewed first. The branch publishes that remain each cover a subtree the same call just created. Bank seeding (`EnsureBanksSeeded`) runs every startup and creates the "Bancos" subcategory under "Empresas y Servicios" (one `company` per bank, branches as child `place`s) only if missing. A pre-company flat "Bancos" is deleted (content + logo media) and reseeded nested. Follow this pattern for any new seed step that must apply to existing installations. `EnsureCitiesSeeded` (also every startup) creates the cities the portal opens besides Santo Domingo — Santiago, Punta Cana and Juan Dolio y Guayacanes (one city: the beach town and the municipality it belongs to share beach, boulevard and commerce, and it is the one city seeded without "Cines", since the nearest Caribbean Cinemas is in La Romana and a section with no rooms is an empty page) — and `EnsureCityContentSeeded` gives each one the structure Santo Domingo has: its sections (Restaurantes, Bares y Clubes, Tiendas with the three subcategories the agent's runs write under — Plazas Comerciales y Malls, Supermercados, Farmacias —, Cines, Empresas y Servicios — whose "Bancos" and "Remesas y Envíos" subcategories the agent's runs create —, Atracciones), the events page, the "Qué Hacer" guide, and the attractions it opens with (the monuments of Santiago, the beaches and parks of Punta Cana, the beaches, boulevard and golf of Juan Dolio: real coordinates, no invented phone or opening hours). Both steps are guarded per node, so a section an editor renamed is not recreated and one added to the table later reaches installations that already carry the city. The `comingSoon` flag — an "en construcción" page instead of sections, no nav or search in the header, `noindex` and out of the sitemap — is cleared once that structure exists, which is what opened both cities; a city added to the table with no sections of its own would carry it until they are seeded. The rest of each city is filled by the agent: the cartelera and the events by the nightly free pass, the restaurants, bars, shops, banks and remittance agents by a dispatched `--paid` run (the lean per-city run set in `Runs`, against Santo Domingo's seventy-seven). The switcher's buttons are `CityBadge` (`frontend/components/CityBadge.tsx`): the logo's visual language — solar arch, palm, coastline and waves — with each city's landmark drawn inside a medallion, picked by city slug; a city without its own scene gets the generic beach one, so a new city needs no code to look right. The same emblem is the city switcher inside a city: the header carries the wordmark alone on the left (`SiteLogo` with `glyph={false}`) and, on the right, a large ringless `CityEmblem` linking to `/` — it says which city you are in and replaces the old text button. Each scene carries its own ringless crop (the tower of Santiago rises higher than the arch of Santo Domingo) sharing one 13:10 ratio, so every city's emblem reads at the same size.

Boot-time indexing race: content published during startup is NOT picked up by the Examine `DeliveryApiContentIndex` (its event handlers register after the seeder runs). The seeder therefore rebuilds that index when it seeded something. Symptom of getting this wrong: item-by-path Delivery API lookups work but list/filter queries return 0.

Bank logos live in `CityGuideWeb/CityGuide/SeedAssets/` and are imported into the Media library at seed time; `photo` is a MediaPicker3 property whose value is JSON `[{"key":<guid>,"mediaKey":<mediaKey>}]`.

## Analytics

Google Analytics 4 (gtag.js) is rendered site-wide by `frontend/components/Analytics.tsx`, mounted in
the root layout. It emits nothing unless `NEXT_PUBLIC_GA_MEASUREMENT_ID` is set, so local development
does not report traffic; `.github/workflows/deploy-frontend.yml` sets it to `G-RTX0GNHR74` at build
time (`NEXT_PUBLIC_*` values are inlined by `next build`, not read at runtime).

## Meta pixel and Conversions API

Ads on Facebook and Instagram optimize toward what they can measure, so the portal
reports both sides of it.

- **The browser pixel** is `frontend/components/MetaPixel.tsx`, mounted in the root
  layout beside `Analytics`. It emits nothing unless `NEXT_PUBLIC_META_PIXEL_ID` is set,
  so local development reports no traffic; the deploy workflow passes it at build time
  from the `NEXT_PUBLIC_META_PIXEL_ID` repository secret (`NEXT_PUBLIC_*` values are
  inlined by `next build`, not read at runtime). Unlike GA4 it does not listen to the
  History API, so every client-side navigation fires its own `PageView` and the first one
  is skipped — the base snippet already sent it.
- **The server side** is `frontend/lib/metaCapi.ts`, and it reports the one event a
  campaign is actually bought for: a contact message filed. It is sent from the Server
  Action (`app/[lang]/[city]/contacto/actions.ts`) rather than from the form, because a
  server event survives the ad blockers that swallow the pixel. It posts personal data —
  a hashed email and phone, the visitor's IP and user agent, the pixel's own `_fbp`/`_fbc`
  cookies — so nothing is sent at all unless `META_CONVERSIONS_TOKEN` is configured, and a
  send that fails is swallowed: the message is already in the CMS.
- `META_TEST_EVENT_CODE` routes server events to the "Test events" tab of Events Manager
  instead of the dataset, for checking the wiring before a campaign runs.

## Sharing and the portal's own accounts

`frontend/lib/social.ts` holds both sides of one handful of facts: the accounts the portal
publishes to and the links a visitor sends a page with. The accounts are the footer's
profile links (`SocialLinks`) *and* what the Organization JSON-LD declares as `sameAs`, so
a handle that changes changes in one place. `ShareButtons` is the call to action beside
the title of every page the portal owns a subject on — a place, a plaza, a company, a film
and an event — and reads "Compartir" followed by the networks that publish a share URL
(WhatsApp, Facebook, X, Telegram), the phone's own share sheet and the link itself.
Instagram is deliberately absent from the link list: it publishes no share URL, so a
button for it would only open an empty composer. It is reached — with Threads, Messenger,
Telegram's app and whatever else the visitor has installed — through `navigator.share`,
which is what the sheet button calls. That button only exists where the browser really has
a sheet, and whether it does is read with `useSyncExternalStore` (server snapshot `false`)
rather than set from an effect, so it neither hydrates into a mismatch nor shows a control
that does nothing on the desktop. The URL shared is built on the server from the item's
route, so it is the canonical one and never the query string the visitor arrived with.

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
- The Delivery API answers a list query with `total` and one page of `items`: read both. `getDescendantsOfType` used to send a single `take=500` and return whatever came back, so `/santo-domingo/restaurantes` (994 places) listed 363 of them and its count, filters, map, `ItemList` and the search index all agreed on the wrong number. It pages now; `max` is a ceiling for the callers that only want the first few, not the size of one request.
- Deliberate v1 omissions (do not build unasked): user accounts/comments/favorites, agent photo upload, webhook-driven revalidation.
