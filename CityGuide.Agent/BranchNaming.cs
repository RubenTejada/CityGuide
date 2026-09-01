namespace CityGuide.Agent;

/// <summary>
/// Names a chain branch "Chain — what tells it apart". Google returns the chain
/// name for most branches ("Banreservas" twenty-seven times), so taking its name
/// verbatim makes every sibling collide and Umbraco numbers them "Banreservas (7)"
/// — a name that identifies nothing. The chain is spelled out in the same
/// "Chain — Branch" shape the frontend uses, and because the name then carries the
/// chain, branchDisplayName leaves it alone instead of prefixing it twice.
/// </summary>
public static class BranchNaming
{
    /// <summary>The company name followed by what tells this branch apart:
    /// "Banreservas — Av. Winston Churchill 1099".</summary>
    public static string For(string placeName, string? address, string companyName)
        => $"{companyName} — {Distinguisher(placeName, address, companyName)}";

    /// <summary>What is left of the Google name once the chain is removed
    /// ("BanReservas Torre" → "Torre"), or the street line of its address when the
    /// name is nothing but the chain.</summary>
    private static string Distinguisher(string placeName, string? address, string companyName)
    {
        string trimmed = placeName.Trim();
        string local = StripCompany(trimmed, companyName);

        // Stripping shortened the name, so what is left is this branch's own part.
        // When it removed nothing the name carries no chain to subtract (Google
        // calls APAP's branches "Asociación Popular de Ahorros y Préstamos"), and
        // the name is the chain's however it is spelled — fall back to the address.
        if (local.Length > 0 && local.Length < trimmed.Length)
        {
            return local;
        }

        return PlaceNaming.AddressLine(address) ?? "Sucursal";
    }

    private static string StripCompany(string placeName, string companyName)
    {
        var chain = new HashSet<string>(TextMatch.Tokens(companyName));
        IEnumerable<string> kept = placeName
            .Split(' ', StringSplitOptions.RemoveEmptyEntries)
            .Where(word =>
            {
                string token = TextMatch.Normalize(word).Trim('.', ',', '(', ')', '-');
                return token.Length > 0 && !chain.Contains(token);
            });

        return string.Join(' ', kept).Trim(' ', '-', '–', '—', ',');
    }
}
