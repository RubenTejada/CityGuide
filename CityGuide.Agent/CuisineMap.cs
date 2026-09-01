namespace CityGuide.Agent;

/// <summary>
/// Maps Google Places types to restaurant cuisine subcategory names, so
/// AutoCategorize runs can file discovered restaurants (creating the
/// subcategory when missing) without spending model tokens. Names must match
/// the subcategory node names in the CMS ("China", "Criolla", "Italiana"...).
/// </summary>
public static class CuisineMap
{
    private static readonly Dictionary<string, string> ByGoogleType = new(StringComparer.OrdinalIgnoreCase)
    {
        ["mexican_restaurant"] = "Mexicana",
        ["italian_restaurant"] = "Italiana",
        ["chinese_restaurant"] = "China",
        ["japanese_restaurant"] = "Japonesa",
        ["sushi_restaurant"] = "Japonesa",
        ["ramen_restaurant"] = "Japonesa",
        ["korean_restaurant"] = "Coreana",
        ["thai_restaurant"] = "Tailandesa",
        ["vietnamese_restaurant"] = "Vietnamita",
        ["indian_restaurant"] = "India",
        ["french_restaurant"] = "Francesa",
        ["spanish_restaurant"] = "Española",
        ["greek_restaurant"] = "Mediterránea",
        ["mediterranean_restaurant"] = "Mediterránea",
        ["turkish_restaurant"] = "Árabe",
        ["lebanese_restaurant"] = "Árabe",
        ["middle_eastern_restaurant"] = "Árabe",
        ["american_restaurant"] = "Americana",
        ["brazilian_restaurant"] = "Brasileña",
        ["peruvian_restaurant"] = "Peruana",
        ["caribbean_restaurant"] = "Criolla",
        ["seafood_restaurant"] = "Mariscos",
        ["steak_house"] = "Parrilladas",
        ["barbecue_restaurant"] = "Parrilladas",
        ["pizza_restaurant"] = "Pizzerías",
        ["hamburger_restaurant"] = "Comida Rápida",
        ["fast_food_restaurant"] = "Comida Rápida",
        ["vegetarian_restaurant"] = "Vegetariana",
        ["vegan_restaurant"] = "Vegetariana",
        ["breakfast_restaurant"] = "Desayunos y Brunch",
        ["brunch_restaurant"] = "Desayunos y Brunch",
    };

    /// <summary>First cuisine match in the place's types; null when only generic
    /// types ("restaurant", "food") are present — the place then stays at the
    /// category root.</summary>
    public static string? SubcategoryFor(IEnumerable<string> types) =>
        types.Select(t => ByGoogleType.GetValueOrDefault(t)).FirstOrDefault(name => name is not null);
}
