using System.Net.Http.Json;
using System.Text.Json;

namespace CityGuide.Agent;

/// <summary>
/// Claude API enrichment client (forced tool call). Fallback provider — the
/// agent prefers AzureOpenAiClient when an Azure OpenAI endpoint is configured.
/// </summary>
public class ClaudeClient(HttpClient http, string apiKey, string model) : IEnrichmentClient
{
    public async Task<Enrichment> EnrichAsync(DiscoveredPlace place, string? categoryPrompt = null)
    {
        var payload = new
        {
            model,
            max_tokens = 1024,
            tools = new object[]
            {
                new
                {
                    name = EnrichmentPrompt.ToolName,
                    description = EnrichmentPrompt.ToolDescription,
                    input_schema = EnrichmentPrompt.Schema,
                },
            },
            tool_choice = new { type = "tool", name = EnrichmentPrompt.ToolName },
            messages = new object[]
            {
                new { role = "user", content = EnrichmentPrompt.UserMessage(place, categoryPrompt) },
            },
        };

        var request = new HttpRequestMessage(HttpMethod.Post, "https://api.anthropic.com/v1/messages")
        {
            Content = JsonContent.Create(payload),
        };
        request.Headers.Add("x-api-key", apiKey);
        request.Headers.Add("anthropic-version", "2023-06-01");

        HttpResponseMessage response = await http.SendAsync(request);
        if (!response.IsSuccessStatusCode)
        {
            throw new InvalidOperationException(
                $"Claude API failed ({(int)response.StatusCode}): {await response.Content.ReadAsStringAsync()}");
        }

        using JsonDocument doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        foreach (JsonElement block in doc.RootElement.GetProperty("content").EnumerateArray())
        {
            if (block.GetProperty("type").GetString() != "tool_use")
            {
                continue;
            }

            return EnrichmentPrompt.Parse(block.GetProperty("input"));
        }

        throw new InvalidOperationException("Claude response contained no tool_use block.");
    }
}
