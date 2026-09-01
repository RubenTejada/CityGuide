using System.Net.Http.Json;
using System.Text.Json;

namespace CityGuide.Agent;

public record Enrichment(string Description, string[] Facilities);

/// <summary>
/// Claude API client: writes the Spanish description and maps Google data to the
/// portal's facility list via a forced tool call (structured output).
/// </summary>
public class ClaudeClient(HttpClient http, string apiKey, string model)
{
    private static readonly string[] FacilityOptions =
    [
        "Romántico", "Aire Acondicionado", "Horario Extendido", "Restaurante en el Lugar",
        "Parqueo", "WiFi", "Delivery", "Terraza", "Música en Vivo", "Apto para Niños",
    ];

    public async Task<Enrichment> EnrichAsync(DiscoveredPlace place)
    {
        var payload = new
        {
            model,
            max_tokens = 1024,
            tools = new object[]
            {
                new
                {
                    name = "save_place",
                    description = "Save the enriched place information for the city guide portal.",
                    input_schema = new
                    {
                        type = "object",
                        properties = new
                        {
                            description = new
                            {
                                type = "string",
                                description = "Descripción atractiva del lugar en español, 2-3 frases, tono de guía de ciudad. Sin inventar datos específicos (premios, años, platos exactos) que no estén en la información dada.",
                            },
                            facilities = new
                            {
                                type = "array",
                                items = new { type = "string", @enum = FacilityOptions },
                                description = "Facilidades que muy probablemente aplican según el tipo de lugar y sus horarios.",
                            },
                        },
                        required = new[] { "description", "facilities" },
                    },
                },
            },
            tool_choice = new { type = "tool", name = "save_place" },
            messages = new object[]
            {
                new
                {
                    role = "user",
                    content = $"""
                        Lugar para la guía de ciudad:
                        Nombre: {place.Name}
                        Dirección: {place.Address}
                        Tipos (Google): {string.Join(", ", place.Types)}
                        Horario: {string.Join(" | ", place.Hours)}
                        Sitio web: {place.Website ?? "n/a"}

                        Escribe la descripción y selecciona las facilidades.
                        """,
                },
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

            JsonElement input = block.GetProperty("input");
            string description = input.GetProperty("description").GetString() ?? "";
            string[] facilities = input.TryGetProperty("facilities", out JsonElement facilitiesElement)
                ? [.. facilitiesElement.EnumerateArray().Select(f => f.GetString()!).Where(FacilityOptions.Contains)]
                : [];
            return new Enrichment(description, facilities);
        }

        throw new InvalidOperationException("Claude response contained no tool_use block.");
    }
}
