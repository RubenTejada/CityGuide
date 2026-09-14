using System.Globalization;

namespace CityGuide.Agent;

/// <summary>One of the portal's own Instagram posts, as the promotion pass lists it.</summary>
public record OwnInstagramPost(
    string Id, DateTimeOffset? Taken, string MediaType, string? Caption, string? Permalink,
    int Likes, int Comments);

public record AdAccountInfo(string Name, string Currency, int Status);

/// <summary>What one promotion buys: a post, a place, a radius, a budget and a window.</summary>
public record Promotion(
    string MediaId, string Name, double Latitude, double Longitude, int RadiusKm,
    decimal Budget, DateTimeOffset Start, DateTimeOffset End);

/// <summary>
/// Pays Meta to show one of the portal's own Instagram posts to the people of a city.
///
/// It is the one pass of the agent that spends money on the portal's behalf, so it never
/// chooses what to promote: without a post id it only lists the account's recent posts
/// to pick from, and with one it prints the campaign — audience, window, budget in the ad
/// account's own currency — and creates nothing until <c>--apply</c>. The budget is a
/// lifetime budget, which Meta does not exceed, and <c>Social:MaxAdBudget</c> refuses a
/// typo before it reaches Meta at all.
///
/// A post the social pass (or a person) already published is what gets boosted, rather
/// than an ad built from scratch: it keeps its likes and comments, and the portal's
/// feed and its ads say the same thing.
/// </summary>
public class SocialPromotion(UmbracoClient umbraco, MetaClient meta, SocialConfig config)
{
    private static readonly CultureInfo Spanish = CultureInfo.GetCultureInfo("es-DO");

    /// <summary>Lists the posts a promotion can boost. Reads Meta, spends nothing.</summary>
    public async Task ListAsync()
    {
        Console.WriteLine("\n== Publicaciones de Instagram que se pueden promocionar");
        foreach (OwnInstagramPost post in await meta.OwnInstagramPostsAsync(15))
        {
            string caption = (post.Caption ?? "").Split('\n')[0];
            Console.WriteLine(
                $"  {post.Id}  {post.Taken:yyyy-MM-dd}  {post.MediaType,-14} ♥ {post.Likes,-4} 💬 {post.Comments,-3} "
                + $"{(caption.Length > 60 ? caption[..60] + "…" : caption)}");
            Console.WriteLine($"      {post.Permalink}");
        }

        Console.WriteLine(
            "\n  Promociona una con: --promote <id> --budget <monto> --days <días> --section <ciudad> [--radius <km>]");
    }

    public async Task<int> RunAsync(
        string mediaId, SocialCityConfig city, decimal budget, int days, int radiusKm, bool apply)
    {
        Console.WriteLine(apply
            ? $"\n== Promoción en Instagram ({city.CityPath})"
            : $"\n== Promoción en Instagram ({city.CityPath}) (simulación; agrega --paid --apply)");

        if (budget <= 0 || budget > config.MaxAdBudget)
        {
            Console.Error.WriteLine(
                $"  ! --budget debe estar entre 1 y {config.MaxAdBudget} (Social:MaxAdBudget).");
            return 1;
        }

        if (days is < 1 or > 30 || radiusKm is < 1 or > 80)
        {
            Console.Error.WriteLine("  ! --days va de 1 a 30 y --radius de 1 a 80 km (el máximo de Meta).");
            return 1;
        }

        OwnInstagramPost? post = (await meta.OwnInstagramPostsAsync(50)).FirstOrDefault(p => p.Id == mediaId);
        if (post is null)
        {
            Console.Error.WriteLine(
                $"  ! {mediaId} no está entre las últimas 50 publicaciones de la cuenta. Ejecuta --promote sin id para verlas.");
            return 1;
        }

        if (await umbraco.GetContentByPathAsync(city.CityPath) is not { } cityNode
            || await umbraco.GetCoordinatesAsync(cityNode.Id) is not { } centre)
        {
            Console.Error.WriteLine($"  ! La ciudad {city.CityPath} no existe o no tiene latitud y longitud.");
            return 1;
        }

        AdAccountInfo account = await meta.AdAccountAsync();
        DateTimeOffset start = DateTimeOffset.UtcNow.AddMinutes(10);
        var promotion = new Promotion(
            post.Id,
            $"{cityNode.Name} {start:yyyy-MM-dd} {post.Id}",
            centre.Latitude, centre.Longitude, radiusKm, budget, start, start.AddDays(days));

        string caption = (post.Caption ?? "").Split('\n')[0];
        Console.WriteLine($"  Publicación: {post.Permalink}");
        Console.WriteLine($"  | {caption}");
        Console.WriteLine($"  Cuenta publicitaria: {account.Name} ({account.Currency})");
        Console.WriteLine(
            $"  Público: 18+, a {radiusKm} km de {cityNode.Name} "
            + $"({centre.Latitude.ToString("0.####", CultureInfo.InvariantCulture)}, "
            + $"{centre.Longitude.ToString("0.####", CultureInfo.InvariantCulture)}), feed y explorar de Instagram");
        Console.WriteLine(
            $"  Del {promotion.Start.ToLocalTime().ToString("d 'de' MMMM HH:mm", Spanish)} "
            + $"al {promotion.End.ToLocalTime().ToString("d 'de' MMMM HH:mm", Spanish)} ({days} días)");
        Console.WriteLine(
            $"  Presupuesto total: {budget.ToString("N2", Spanish)} {account.Currency} "
            + $"(≈ {(budget / days).ToString("N2", Spanish)} por día; Meta no lo supera)");

        if (account.Status != 1)
        {
            Console.Error.WriteLine(
                $"  ! La cuenta publicitaria no está activa (account_status {account.Status}): Meta no entregaría el anuncio.");
            return 1;
        }

        if (!apply)
        {
            return 0;
        }

        string campaignId = await meta.PromoteInstagramPostAsync(promotion);
        Console.WriteLine($"  → Campaña {campaignId} activa. Revísala en Ads Manager: Meta la aprueba antes de entregarla.");
        return 0;
    }
}
