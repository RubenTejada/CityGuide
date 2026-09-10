using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace CityGuide.Agent;

/// <summary>
/// Meta's Graph API: the only way to publish to a Facebook Page and to an Instagram
/// business account without a person typing the post. One long-lived token speaks for
/// both — Instagram is reached through the Page it is linked to — which is why there is
/// one client here and not two.
///
/// The two networks do not publish the same way. Facebook takes the picture and the
/// caption in one request; Instagram takes two, a container it downloads the image into
/// and then the publish that releases it, and it refuses an image whose aspect ratio is
/// outside 4:5 – 1.91:1 (a film poster is 2:3, so posters go to Facebook alone).
///
/// Meta downloads the image itself, so what it is handed has to be a public URL — the
/// portal's own /media proxy, never the CMS host on localhost.
/// </summary>
public partial class MetaClient(HttpClient http, SocialConfig config)
{
    private string Root => $"https://graph.facebook.com/{config.ApiVersion}";

    public bool CanPostToFacebook =>
        !string.IsNullOrEmpty(config.PageId) && !string.IsNullOrEmpty(config.AccessToken);

    public bool CanPostToInstagram =>
        !string.IsNullOrEmpty(config.InstagramUserId) && !string.IsNullOrEmpty(config.AccessToken);

    /// <summary>
    /// Reading another account through business discovery needs exactly what publishing
    /// needs: the portal's own Instagram business account and the token of the Page it
    /// hangs from. There is no other way in — an account is read as a business by a
    /// business.
    /// </summary>
    public bool CanReadInstagram => CanPostToInstagram;

    /// <summary>
    /// What another account publishes, read through business discovery: the one way
    /// Meta gives to see a feed that is not the portal's own. The account asked about
    /// has to be a business or a creator — a personal one is refused by the API itself,
    /// which is the answer this returns as an exception for the caller to report — and
    /// what comes back is publications and reels, never stories.
    ///
    /// Only the caption is worth reading: it is the prose a bar writes about its own
    /// Thursday, the same kind of sentence <see cref="EventSources"/> pulls off an
    /// agenda page. The picture is named beside it, because half of what a bar
    /// announces is drawn inside a flyer and nowhere in the text.
    /// </summary>
    public async Task<InstagramProfile?> DiscoverAsync(string username, int posts)
    {
        string fields =
            $"business_discovery.username({username})"
            + "{username,name,followers_count,media_count,"
            + $"media.limit({posts}){{caption,media_type,media_url,permalink,timestamp}}}}";

        using JsonDocument answer = await GetAsync(
            $"{Root}/{config.InstagramUserId}?fields={Uri.EscapeDataString(fields)}");

        if (!answer.RootElement.TryGetProperty("business_discovery", out JsonElement account))
        {
            return null;
        }

        return new InstagramProfile(
            Text(account, "username") ?? username,
            Text(account, "name"),
            Number(account, "followers_count"),
            Number(account, "media_count"),
            [.. Media(account).Select(Post).OfType<InstagramPost>()]);
    }

    /// <summary>A photo post on the Page: the picture is the post, the caption its text.</summary>
    public async Task<string> PostFacebookPhotoAsync(string caption, string imageUrl)
    {
        using JsonDocument answer = await PostAsync($"{Root}/{config.PageId}/photos", new()
        {
            ["url"] = imageUrl,
            ["caption"] = caption,
        });
        return Id(answer);
    }

    /// <summary>
    /// A link post on the Page, for what has no picture Instagram would take either:
    /// Facebook builds the preview card from the page's own Open Graph tags, which the
    /// portal already writes for every route.
    /// </summary>
    public async Task<string> PostFacebookLinkAsync(string message, string link)
    {
        using JsonDocument answer = await PostAsync($"{Root}/{config.PageId}/feed", new()
        {
            ["message"] = message,
            ["link"] = link,
        });
        return Id(answer);
    }

    /// <summary>
    /// One image on Instagram: a container first, then the publish. The container is
    /// Meta downloading the picture, so it can still fail after the first request
    /// answered — which is what the status poll below is for.
    /// </summary>
    public async Task<string> PostInstagramAsync(string caption, string imageUrl)
    {
        using JsonDocument container = await PostAsync($"{Root}/{config.InstagramUserId}/media", new()
        {
            ["image_url"] = imageUrl,
            ["caption"] = caption,
        });
        string creationId = Id(container);

        await WaitForContainerAsync(creationId);

        using JsonDocument published = await PostAsync($"{Root}/{config.InstagramUserId}/media_publish", new()
        {
            ["creation_id"] = creationId,
        });
        return Id(published);
    }

    /// <summary>
    /// Publishing a container Meta has not finished downloading fails, so its status is
    /// read until it is ready. Every request goes through the throttler, which spaces
    /// them by seconds on its own — there is no sleep here on purpose.
    /// </summary>
    private async Task WaitForContainerAsync(string creationId)
    {
        for (var attempt = 0; attempt < 6; attempt++)
        {
            HttpResponseMessage response = await http.GetAsync(
                $"{Root}/{creationId}?fields=status_code&access_token={config.AccessToken}");
            string body = await response.Content.ReadAsStringAsync();
            if (!response.IsSuccessStatusCode)
            {
                throw new InvalidOperationException($"Instagram container: {Error(body)}");
            }

            using JsonDocument doc = JsonDocument.Parse(body);
            string status = doc.RootElement.TryGetProperty("status_code", out JsonElement code)
                ? code.GetString() ?? ""
                : "";
            switch (status)
            {
                case "FINISHED":
                    return;
                case "ERROR":
                case "EXPIRED":
                    throw new InvalidOperationException(
                        $"Instagram rechazó la imagen (status {status}). Suele ser la proporción: "
                        + "acepta entre 4:5 y 1.91:1.");
            }
        }

        throw new InvalidOperationException(
            "Instagram no terminó de descargar la imagen; el contenedor sigue en proceso.");
    }

    private async Task<JsonDocument> PostAsync(string url, Dictionary<string, string> fields)
    {
        // The token travels in the body, not in the query string: a URL is what ends up
        // in a log line, and this one is good for sixty days.
        fields["access_token"] = config.AccessToken;
        HttpResponseMessage response = await http.PostAsync(url, new FormUrlEncodedContent(fields));
        string body = await response.Content.ReadAsStringAsync();
        if (!response.IsSuccessStatusCode)
        {
            throw new InvalidOperationException($"Graph API {(int)response.StatusCode}: {Error(body)}");
        }

        return JsonDocument.Parse(body);
    }

    private async Task<JsonDocument> GetAsync(string url)
    {
        // The token travels in the query string here because a GET has no body. It is
        // the one place a log line could carry it, so nothing else is ever fetched.
        HttpResponseMessage response = await http.GetAsync($"{url}&access_token={config.AccessToken}");
        string body = await response.Content.ReadAsStringAsync();
        if (!response.IsSuccessStatusCode)
        {
            throw new InvalidOperationException($"Graph API {(int)response.StatusCode}: {Error(body)}");
        }

        return JsonDocument.Parse(body);
    }

    private static IEnumerable<JsonElement> Media(JsonElement account) =>
        account.TryGetProperty("media", out JsonElement media)
        && media.TryGetProperty("data", out JsonElement data)
        && data.ValueKind == JsonValueKind.Array
            ? data.EnumerateArray()
            : [];

    /// <summary>A publication without a date or a permalink is one this side cannot
    /// place in time or point an editor at, so it is dropped rather than half-read.</summary>
    private static InstagramPost? Post(JsonElement item) =>
        Taken(Text(item, "timestamp")) is DateTimeOffset taken && Text(item, "permalink") is string link
            ? new InstagramPost(taken, Text(item, "media_type") ?? "", Text(item, "caption"), link,
                Text(item, "media_url"))
            : null;

    /// <summary>Graph writes the offset without its colon ("+0000"), which is one of the
    /// few ISO shapes .NET does not parse on its own.</summary>
    private static DateTimeOffset? Taken(string? value)
    {
        if (string.IsNullOrEmpty(value))
        {
            return null;
        }

        string normalized = GraphOffset().Replace(value, "$1:$2");
        return DateTimeOffset.TryParse(normalized, CultureInfo.InvariantCulture,
            DateTimeStyles.None, out DateTimeOffset parsed)
            ? parsed
            : null;
    }

    [GeneratedRegex(@"([+-]\d{2})(\d{2})$")]
    private static partial Regex GraphOffset();

    private static string? Text(JsonElement item, string name) =>
        item.TryGetProperty(name, out JsonElement value) && value.ValueKind == JsonValueKind.String
            ? value.GetString()
            : null;

    private static int Number(JsonElement item, string name) =>
        item.TryGetProperty(name, out JsonElement value) && value.ValueKind == JsonValueKind.Number
            ? value.GetInt32()
            : 0;

    private static string Id(JsonDocument answer) =>
        answer.RootElement.TryGetProperty("id", out JsonElement id) ? id.GetString() ?? "" : "";

    /// <summary>Graph states what went wrong in "error.message"; anything else is the raw body.</summary>
    private static string Error(string body)
    {
        try
        {
            using JsonDocument doc = JsonDocument.Parse(body);
            if (doc.RootElement.TryGetProperty("error", out JsonElement error)
                && error.TryGetProperty("message", out JsonElement message))
            {
                return message.GetString() ?? body;
            }
        }
        catch (JsonException)
        {
            // Not JSON at all (an HTML error page from a proxy): say what came back.
        }

        return body.Length > 300 ? body[..300] : body;
    }
}
