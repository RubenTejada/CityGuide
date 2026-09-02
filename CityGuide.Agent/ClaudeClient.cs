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
        JsonElement arguments = await CallToolAsync(
            EnrichmentPrompt.ToolName, EnrichmentPrompt.ToolDescription, EnrichmentPrompt.Schema,
            EnrichmentPrompt.UserMessage(place, categoryPrompt));
        return EnrichmentPrompt.Parse(arguments);
    }

    public async Task<Dictionary<int, string>> ClassifyEventsAsync(IReadOnlyList<ScrapedEvent> events)
    {
        JsonElement arguments = await CallToolAsync(
            EventCategories.ToolName, EventCategories.ToolDescription, EventCategories.Schema,
            EventCategories.UserMessage(events), temperature: 0);
        return EventCategories.Parse(arguments, events.Count);
    }

    /// <summary>One forced tool call, returning its input. <paramref name="temperature"/>
    /// is 0 where the answer is a label, so two runs agree, and 1 for the descriptions.</summary>
    private async Task<JsonElement> CallToolAsync(
        string toolName, string toolDescription, object schema, string userMessage,
        double temperature = 1)
    {
        var payload = new
        {
            model,
            temperature,
            // Room for the batched event classification; a description never nears it.
            max_tokens = 2048,
            tools = new object[]
            {
                new
                {
                    name = toolName,
                    description = toolDescription,
                    input_schema = schema,
                },
            },
            tool_choice = new { type = "tool", name = toolName },
            messages = new object[]
            {
                new { role = "user", content = userMessage },
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

            return block.GetProperty("input").Clone();
        }

        throw new InvalidOperationException("Claude response contained no tool_use block.");
    }
}
