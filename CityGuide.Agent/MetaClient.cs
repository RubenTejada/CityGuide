using System.Text.Json;

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
public class MetaClient(HttpClient http, SocialConfig config)
{
    private string Root => $"https://graph.facebook.com/{config.ApiVersion}";

    public bool CanPostToFacebook =>
        !string.IsNullOrEmpty(config.PageId) && !string.IsNullOrEmpty(config.AccessToken);

    public bool CanPostToInstagram =>
        !string.IsNullOrEmpty(config.InstagramUserId) && !string.IsNullOrEmpty(config.AccessToken);

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
