namespace CityGuide.Agent;

/// <summary>
/// Fills the English side of the portal from the Spanish one. Content is translated
/// where it lives — the same node, in its en-US culture — so both languages keep one
/// id, one photo, one rating and one set of coordinates, and only the words differ.
///
/// It writes only what is missing, so the first pass covers everything and every pass
/// after it costs almost nothing: what a discovery run has since created in Spanish, and
/// nothing else. Nothing here talks to Google — translation is words the CMS already
/// holds, and the only billed thing it touches is the model.
/// </summary>
public class TranslateSync(UmbracoClient umbraco, IEnrichmentClient enricher)
{
    /// <summary>
    /// Every document type the portal publishes. The order does not matter — the nodes
    /// are sorted by how deep they sit — but the list does: a type missing here is a
    /// page that never appears in English.
    /// </summary>
    private static readonly string[] TranslatableTypes =
    [
        "site", "city", "categoryPage", "subcategory", "eventsPage", "thingsToDoPage",
        "articlesPage", "article", "place", "mall", "company", "movie", "eventItem",
    ];

    /// <summary>The properties only a model can translate. The rest of what varies by
    /// culture is closed vocabulary (<see cref="TranslatedVocabulary"/>).</summary>
    private static readonly string[] ProseAliases =
        ["description", "intro", "summary", "body", "synopsis", "metaTitle", "metaDescription"];

    /// <summary>Types whose name is a label the portal chose ("Restaurantes") rather than
    /// something out in the world. Everything else keeps its name in both languages: a
    /// place, a plaza, a chain, a film and a city are called what they are called.</summary>
    private static readonly string[] NameIsALabel =
        ["categoryPage", "subcategory", "eventsPage", "thingsToDoPage", "articlesPage"];

    /// <summary>What the model is told a node is, so a description reads as being about
    /// the right kind of thing.</summary>
    private static readonly Dictionary<string, string> Kinds = new(StringComparer.OrdinalIgnoreCase)
    {
        ["site"] = "portal",
        ["city"] = "ciudad",
        ["categoryPage"] = "sección de la ciudad",
        ["subcategory"] = "subcategoría",
        ["eventsPage"] = "sección de eventos",
        ["thingsToDoPage"] = "guía de qué hacer",
        ["articlesPage"] = "sección de artículos",
        ["article"] = "artículo",
        ["place"] = "lugar",
        ["mall"] = "plaza comercial",
        ["company"] = "empresa o cadena",
        ["movie"] = "película",
        ["eventItem"] = "evento",
    };

    /// <summary>A node's Spanish side, what it already has in English, and what filling
    /// the gap needs: values a table already answers, and text only the model can.</summary>
    private record Pending(
        UmbracoClient.PublishedNode Node,
        string EnglishName,
        Dictionary<string, string> Known,
        Dictionary<string, string> ForModel);

    public async Task RunAsync(bool apply, IReadOnlyCollection<string> sections)
    {
        Console.WriteLine();
        Console.WriteLine("== Traducción al inglés");

        List<UmbracoClient.PublishedNode> spanish = [];
        var translated = new HashSet<Guid>();
        foreach (string type in TranslatableTypes)
        {
            spanish.AddRange(await umbraco.GetPublishedNodesAsync(type, ContentCultures.Spanish));
            foreach (UmbracoClient.PublishedNode node in
                await umbraco.GetPublishedNodesAsync(type, ContentCultures.English))
            {
                translated.Add(node.Id);
            }
        }

        // Ancestors first: a culture only routes when everything above it is published in
        // it, so a restaurant translated before its section would have no English URL.
        spanish.Sort((a, b) =>
            Depth(a.Path).CompareTo(Depth(b.Path)) is var byDepth && byDepth != 0
                ? byDepth
                : string.CompareOrdinal(a.Path, b.Path));

        var unnamed = new SortedSet<string>(StringComparer.OrdinalIgnoreCase);
        List<Pending> pending = [];
        var alreadyDone = 0;
        HashSet<Guid> selected = Selected(spanish, sections);
        foreach (UmbracoClient.PublishedNode node in spanish)
        {
            if (!selected.Contains(node.Id))
            {
                continue;
            }

            if (translated.Contains(node.Id))
            {
                alreadyDone++;
                continue;
            }

            pending.Add(Plan(node, unnamed));
        }

        Console.WriteLine($"  Ya en inglés: {alreadyDone}");
        Console.WriteLine($"  Sin traducir: {pending.Count}");
        if (pending.Count == 0)
        {
            return;
        }

        if (unnamed.Count > 0)
        {
            Console.WriteLine(
                $"  ! {unnamed.Count} nombre(s) de sección sin equivalente en TranslatedVocabulary "
                + "(la página queda con el nombre en español, y su URL también):");
            foreach (string name in unnamed)
            {
                Console.WriteLine($"    - {name}");
            }
        }

        int characters = pending.Sum(p => p.ForModel.Sum(f => f.Value.Length));
        int withText = pending.Count(p => p.ForModel.Count > 0);
        Console.WriteLine(
            $"  Al modelo: {withText} nodo(s), {characters:N0} caracteres; "
            + $"el resto se traduce con la tabla y no cuesta nada.");
        foreach (IGrouping<string, Pending> group in pending
            .GroupBy(p => p.Node.ContentType)
            .OrderByDescending(g => g.Count()))
        {
            Console.WriteLine($"    {group.Key}: {group.Count()}");
        }

        if (!apply)
        {
            Console.WriteLine("  (nada se escribió: añade --apply)");
            return;
        }

        var written = 0;
        var skipped = 0;
        foreach (List<Pending> batch in Batches(pending))
        {
            Dictionary<int, Dictionary<string, string>> answers = [];
            List<Pending> asked = [.. batch.Where(p => p.ForModel.Count > 0)];
            if (asked.Count > 0)
            {
                List<TranslationRequest> entries =
                [
                    .. asked.Select(p => new TranslationRequest(
                        p.Node.Name, Kinds.GetValueOrDefault(p.Node.ContentType, "página"), p.ForModel)),
                ];
                answers = await enricher.TranslateAsync(entries);
            }

            foreach (Pending item in batch)
            {
                int position = asked.IndexOf(item);
                Dictionary<string, string> prose = position >= 0
                    ? answers.GetValueOrDefault(position) ?? []
                    : [];

                // A node whose only text came back untranslated would go out as an
                // English page carrying Spanish prose — the duplicate the two hreflang
                // variants exist to avoid. Leave it for the next pass instead.
                if (item.ForModel.Count > 0 && prose.Count == 0)
                {
                    Console.WriteLine($"  ! {item.Node.Name} sin traducción: se queda para el próximo pase");
                    skipped++;
                    continue;
                }

                string name = prose.TryGetValue("name", out string? translatedName)
                    ? translatedName
                    : item.EnglishName;
                List<object> values =
                [
                    .. item.Known.Select(v => (object)new { alias = v.Key, value = v.Value }),
                    .. prose.Where(v => v.Key != "name")
                        .Select(v => (object)new { alias = v.Key, value = v.Value }),
                ];

                await umbraco.WriteCultureAsync(item.Node.Id, name, values, ContentCultures.English);
                written++;
                Console.WriteLine($"  + {name}");
            }
        }

        Console.WriteLine($"  {written} traducido(s), {skipped} pendiente(s)");
    }

    /// <summary>
    /// What a node needs: its English name, the values a table already knows, and the
    /// text the model has to write. A field the vocabulary cannot answer (opening hours
    /// an editor typed by hand, a category nobody mapped) falls through to the model
    /// rather than being dropped.
    /// </summary>
    private static Pending Plan(UmbracoClient.PublishedNode node, SortedSet<string> unnamed)
    {
        var known = new Dictionary<string, string>();
        var forModel = new Dictionary<string, string>();

        string englishName = node.Name;
        if (NameIsALabel.Contains(node.ContentType))
        {
            if (TranslatedVocabulary.SectionName(node.Name) is { } label)
            {
                englishName = label;
            }
            else
            {
                unnamed.Add(node.Name);
            }
        }
        else if (node.ContentType == "article")
        {
            // A headline is prose, and the URL it makes is the article's own.
            forModel["name"] = node.Name;
        }

        foreach ((string alias, string spanish) in node.Text)
        {
            string? mapped = alias switch
            {
                "hours" => TranslatedVocabulary.Hours(spanish),
                "category" => TranslatedVocabulary.Category(spanish),
                "country" => TranslatedVocabulary.Country(spanish),
                "genre" => TranslatedVocabulary.Genre(spanish),
                _ => null,
            };

            if (mapped is not null)
            {
                known[alias] = mapped;
            }
            else if (ProseAliases.Contains(alias) || alias is "hours" or "category" or "country")
            {
                forModel[alias] = spanish;
            }
        }

        return new Pending(node, englishName, known, forModel);
    }

    /// <summary>
    /// Groups the work into model calls. A batch pays for the instructions once, so
    /// bigger is cheaper — up to the point where the answer would not fit, and a batch
    /// that overruns loses every node in it, not just the last.
    /// </summary>
    private static IEnumerable<List<Pending>> Batches(List<Pending> pending)
    {
        List<Pending> batch = [];
        var characters = 0;
        foreach (Pending item in pending)
        {
            int size = item.ForModel.Sum(f => f.Value.Length);
            if (batch.Count > 0
                && (batch.Count >= Translation.MaxBatchEntries
                    || characters + size > Translation.MaxBatchCharacters))
            {
                yield return batch;
                batch = [];
                characters = 0;
            }

            batch.Add(item);
            characters += size;
        }

        if (batch.Count > 0)
        {
            yield return batch;
        }
    }

    private static int Depth(string path) => path.Trim('/').Split('/', StringSplitOptions.RemoveEmptyEntries).Length;

    /// <summary>
    /// The nodes --section covers, plus every ancestor of one. A section on its own is
    /// not translatable content: an English page only has a URL when its whole line of
    /// ancestors is published in English, so translating "farmacias" without the city
    /// above it would produce pages nobody can reach.
    /// </summary>
    private static HashSet<Guid> Selected(
        List<UmbracoClient.PublishedNode> nodes, IReadOnlyCollection<string> sections)
    {
        if (sections.Count == 0)
        {
            return [.. nodes.Select(n => n.Id)];
        }

        string[] matched =
        [
            .. nodes
                .Where(n => n.Path.Trim('/').Split('/', StringSplitOptions.RemoveEmptyEntries)
                    .Any(segment => sections.Contains(segment, StringComparer.OrdinalIgnoreCase)))
                .Select(n => n.Path),
        ];

        return
        [
            .. nodes
                .Where(n => matched.Any(path =>
                    path.StartsWith(n.Path, StringComparison.OrdinalIgnoreCase)))
                .Select(n => n.Id),
        ];
    }
}
