namespace CityGuide.Agent;

public class AgentConfig
{
    public UmbracoConfig Umbraco { get; set; } = new();
    public GoogleConfig Google { get; set; } = new();
    public AzureOpenAiConfig AzureOpenAI { get; set; } = new();
    public AnthropicConfig Anthropic { get; set; } = new();
    public List<RunConfig> Runs { get; set; } = [];
    public CinemasConfig Cinemas { get; set; } = new();
}

public class UmbracoConfig
{
    public string BaseUrl { get; set; } = "http://localhost:54509";
    public string ClientId { get; set; } = "";
    public string ClientSecret { get; set; } = "";
    public bool PublishImmediately { get; set; }
}

public class GoogleConfig
{
    public string ApiKey { get; set; } = "";
}

public class AzureOpenAiConfig
{
    /// <summary>Azure OpenAI endpoint, e.g. https://cityguide-openai.openai.azure.com/.
    /// When set, the agent uses Azure OpenAI instead of Anthropic.</summary>
    public string Endpoint { get; set; } = "";

    public string Deployment { get; set; } = "gpt-4.1-mini";

    public string ApiVersion { get; set; } = "2024-10-21";

    /// <summary>Optional. Empty = keyless auth via DefaultAzureCredential
    /// (Azure CLI locally, managed identity in Azure).</summary>
    public string ApiKey { get; set; } = "";
}

public class AnthropicConfig
{
    public string ApiKey { get; set; } = "";
    public string Model { get; set; } = "claude-sonnet-5";
}

public class CinemasConfig
{
    public bool Enabled { get; set; } = true;

    /// <summary>Umbraco route path of the city whose "cines" section is synced.</summary>
    public string CityPath { get; set; } = "/santo-domingo";

    public string CompanyName { get; set; } = "Caribbean Cinemas";

    /// <summary>Caribbean (Indy) site ids to sync, with coordinate fallbacks for
    /// sites where the Caribbean API has no lat/lon.</summary>
    public List<CinemaSiteConfig> Sites { get; set; } = [];
}

public class CinemaSiteConfig
{
    public string Id { get; set; } = "";
    public decimal Lat { get; set; }
    public decimal Lng { get; set; }
}

public class RunConfig
{
    /// <summary>Google Places text query, e.g. "restaurantes chinos en Santo Domingo".</summary>
    public string Query { get; set; } = "";

    /// <summary>Umbraco route path of the node new places are created under.</summary>
    public string ParentPath { get; set; } = "";

    public int MaxPlaces { get; set; } = 5;

    /// <summary>Restaurant runs only: file each discovered place into a cuisine
    /// subcategory derived from its Google types (see CuisineMap), creating the
    /// subcategory under ParentPath when it does not exist yet.</summary>
    public bool AutoCategorize { get; set; }
}
