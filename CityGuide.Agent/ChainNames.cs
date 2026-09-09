namespace CityGuide.Agent;

/// <summary>
/// The other names Google gives a chain's branches. A branch is recognised by
/// <see cref="TextMatch.ContainsPhrase"/>, which asks for the chain's words in the
/// place's name — and Google does not spell a chain the same way everywhere: the
/// branches the portal has in Santo Domingo come back as "Banco Popular Dominicano"
/// and the ones in Santiago as plain "Banco Popular", so the same run that filled
/// one city's company node left the other's places flat beside it, without the
/// logo, the description or the phone the company carries. The names are national
/// facts about the chains, not deployment settings, so they live here beside the
/// matcher rather than in appsettings.
///
/// An alias has to name the chain and nothing else: "BHD" is only ever BHD León,
/// while "Popular" alone would take APAP ("Asociación Popular de Ahorros y
/// Préstamos") with it.
/// </summary>
public static class ChainNames
{
    private static readonly Dictionary<string, string[]> Aliases =
        new(StringComparer.OrdinalIgnoreCase)
        {
            // Google names half the Banreservas branches by the bank's legal name.
            ["Banreservas"] = ["Banco de Reservas"],
            // "Dominicano" is dropped outside the capital.
            ["Banco Popular Dominicano"] = ["Banco Popular"],
            // The bank renamed itself BHD from BHD León, and Google carries both.
            ["Banco BHD"] = ["BHD León", "BHD"],
            // Google never abbreviates APAP, which is how the company node is named.
            ["APAP"] = ["Asociación Popular de Ahorros y Préstamos"],
            ["Mail Boxes Etc"] = ["MBE"],
        };

    /// <summary>The chain's own name first, then every other name its branches carry.</summary>
    public static IEnumerable<string> Of(string chain) =>
        Aliases.TryGetValue(chain, out string[]? others) ? [chain, .. others] : [chain];

    /// <summary>True when the place's name carries the chain under any of its names.</summary>
    public static bool NamesBranch(string chain, string? placeName) =>
        Of(chain).Any(name => TextMatch.ContainsPhrase(name, placeName));
}
