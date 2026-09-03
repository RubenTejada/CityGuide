namespace CityGuide.Agent;

/// <summary>
/// Tells apart two places that share a name. Chains reuse one name across
/// locations ("CachArepa" in Naco and on Máximo Gómez), so Umbraco numbers the
/// second sibling "CachArepa (1)" — a name that says which one arrived later and
/// nothing about which one it is. Both get the line of their address that places
/// them instead: the plaza ("Ágora Mall"), the sector ("Villas Agrícolas") or the
/// street, whichever Google puts first.
/// </summary>
public static class PlaceNaming
{
    /// <summary>The name followed by where this one is: "Sonoma Bistro — Ágora Mall".
    /// Returns the name unchanged when the address gives nothing to add, or already
    /// says it.</summary>
    /// <summary>
    /// The name plus the first line of the address that says something the name does not:
    /// two "MoneyGram — Banco Popular" counters are told apart by the avenue that follows
    /// the bank in their addresses. The bare name comes back when no line adds anything.
    /// </summary>
    public static string Qualified(string name, string? address)
    {
        string normalized = TextMatch.Normalize(name);
        string? line = AddressLines(address)
            .FirstOrDefault(l => !normalized.Contains(TextMatch.Normalize(l)));
        return line is null ? name : $"{name} — {line}";
    }

    /// <summary>Words that only introduce the cross street. Google's own street line
    /// often ends on one because it never got the second street ("Av. John F. Kennedy
    /// esq"), leaving them dangling at the end of the name.</summary>
    private static readonly string[] Connectors = ["esq", "esquina", "casi", "con", "c", "y"];

    /// <summary>Connectors that can also open a line. "C." is left out: at the start
    /// it abbreviates "Calle" ("C. Duarte 451"), not a cross street.</summary>
    // "inside"/"dentro": Google names an agent counter by where it stands ("MoneyGram
    // inside Banreservas"), and once the chain is stripped the word leads the rest.
    private static readonly string[] LeadingConnectors =
        ["esq", "esquina", "casi", "con", "y", "inside", "dentro"];

    /// <summary>First line of a formatted address ("Ágora Mall, Av. Abraham Lincoln,
    /// Santo Domingo…"), skipping a leading plus code, which places nothing.</summary>
    public static string? AddressLine(string? address) => AddressLines(address).FirstOrDefault();

    /// <summary>The lines of an address that name something — plus codes and stubs do not.</summary>
    private static IEnumerable<string> AddressLines(string? address)
    {
        // Google closes every address on the locality and the country ("…, Santo Domingo
        // 10413, República Dominicana"), which place nothing within the city.
        string[] parts = (address ?? "").Split(',');
        foreach (string part in parts.Length > 2 ? parts[..^2] : parts)
        {
            // Google sometimes opens an address on punctuation left over from a
            // cross-street note ("| y Urena, C. Hostos 302"), which places nothing.
            string segment = TrimConnectors(part.Trim().TrimStart('|', '-', '/', '.', '#'));
            if (segment.Length > 3 && !segment.Contains('+'))
            {
                yield return segment.Trim();
            }
        }
    }

    /// <summary>Drops the connector words a street line starts or ends on, so neither
    /// "Av. Máximo Gómez ESQ" nor "y Ureña" becomes part of a name.</summary>
    public static string TrimConnectors(string street)
    {
        string[] words = street.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        int start = 0, end = words.Length;
        bool IsConnector(string word) =>
            Connectors.Contains(TextMatch.Normalize(word).Trim('.', '/', ','));

        while (end > start + 1 && IsConnector(words[end - 1]))
        {
            end--;
        }

        while (start < end - 1
               && LeadingConnectors.Contains(TextMatch.Normalize(words[start]).Trim('.', '/', ',')))
        {
            start++;
        }

        return string.Join(' ', words[start..end]);
    }
}
