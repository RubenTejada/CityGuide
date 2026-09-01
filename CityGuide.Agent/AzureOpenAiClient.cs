using System.Net.Http.Json;
using System.Text.Json;
using Azure.Core;
using Azure.Identity;

namespace CityGuide.Agent;

/// <summary>
/// Azure OpenAI enrichment client (chat completions with a forced function
/// call). Authenticates without keys via DefaultAzureCredential: the Azure CLI
/// login in development, the managed identity in production. Requires the
/// "Cognitive Services OpenAI User" role on the Azure OpenAI account. An
/// explicit ApiKey in config takes precedence when set.
/// </summary>
public class AzureOpenAiClient(HttpClient http, AzureOpenAiConfig config) : IEnrichmentClient
{
    private static readonly string[] Scopes = ["https://cognitiveservices.azure.com/.default"];

    private readonly TokenCredential _credential = new DefaultAzureCredential();
    private AccessToken _token;

    private async Task<string> GetTokenAsync()
    {
        if (_token.Token is null || _token.ExpiresOn <= DateTimeOffset.UtcNow.AddMinutes(2))
        {
            _token = await _credential.GetTokenAsync(new TokenRequestContext(Scopes), CancellationToken.None);
        }

        return _token.Token;
    }

    public async Task<Enrichment> EnrichAsync(DiscoveredPlace place, string? categoryPrompt = null)
    {
        var payload = new
        {
            max_tokens = 1024,
            tools = new object[]
            {
                new
                {
                    type = "function",
                    function = new
                    {
                        name = EnrichmentPrompt.ToolName,
                        description = EnrichmentPrompt.ToolDescription,
                        parameters = EnrichmentPrompt.Schema,
                    },
                },
            },
            tool_choice = new { type = "function", function = new { name = EnrichmentPrompt.ToolName } },
            messages = new object[]
            {
                new { role = "user", content = EnrichmentPrompt.UserMessage(place, categoryPrompt) },
            },
        };

        string url = $"{config.Endpoint.TrimEnd('/')}/openai/deployments/{config.Deployment}"
            + $"/chat/completions?api-version={config.ApiVersion}";

        // Over-quota deployments stall or 429 for up to a minute; retry with
        // backoff instead of failing the place.
        HttpResponseMessage? response = null;
        for (int attempt = 1; ; attempt++)
        {
            var request = new HttpRequestMessage(HttpMethod.Post, url) { Content = JsonContent.Create(payload) };
            if (!string.IsNullOrEmpty(config.ApiKey))
            {
                request.Headers.Add("api-key", config.ApiKey);
            }
            else
            {
                request.Headers.Authorization =
                    new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", await GetTokenAsync());
            }

            try
            {
                response = await http.SendAsync(request);
                if (response.IsSuccessStatusCode)
                {
                    break;
                }

                string body = await response.Content.ReadAsStringAsync();
                if (body.Contains("content_filter", StringComparison.Ordinal))
                {
                    // Azure's content filter occasionally trips on nightlife venues;
                    // create the draft without a description rather than losing the place.
                    Console.Error.WriteLine($"    (content filter en '{place.Name}' — draft sin descripción)");
                    return new Enrichment("", []);
                }

                bool retryable = (int)response.StatusCode is 429 or >= 500;
                if (!retryable || attempt == 3)
                {
                    throw new InvalidOperationException(
                        $"Azure OpenAI failed ({(int)response.StatusCode}): {body}");
                }

                TimeSpan delay = response.Headers.RetryAfter?.Delta ?? TimeSpan.FromSeconds(30 * attempt);
                await Task.Delay(delay);
            }
            catch (TaskCanceledException) when (attempt < 3)
            {
                await Task.Delay(TimeSpan.FromSeconds(30 * attempt));
            }
        }

        using JsonDocument doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        JsonElement message = doc.RootElement.GetProperty("choices")[0].GetProperty("message");
        if (message.TryGetProperty("tool_calls", out JsonElement toolCalls)
            && toolCalls.ValueKind == JsonValueKind.Array && toolCalls.GetArrayLength() > 0)
        {
            string arguments = toolCalls[0].GetProperty("function").GetProperty("arguments").GetString() ?? "{}";
            using JsonDocument args = JsonDocument.Parse(arguments);
            return EnrichmentPrompt.Parse(args.RootElement);
        }

        throw new InvalidOperationException("Azure OpenAI response contained no tool call.");
    }
}
