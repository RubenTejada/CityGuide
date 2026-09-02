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
        ["sandwich_shop"] = "Comida Rápida",
        ["donut_shop"] = "Comida Rápida",
        ["vegetarian_restaurant"] = "Vegetariana",
        ["vegan_restaurant"] = "Vegetariana",
        ["breakfast_restaurant"] = "Desayunos y Brunch",
        ["brunch_restaurant"] = "Desayunos y Brunch",
    };

    /// <summary>Subcategory for places Google types as a restaurant without saying
    /// which kind ("restaurant", "food"). Most discovered places carry only those,
    /// so without it the category root collects more places than every cuisine
    /// subcategory put together.</summary>
    public const string Fallback = "Otros";

    /// <summary>First cuisine match in the place's types, or <see cref="Fallback"/>
    /// when only generic types are present. Never null: every discovered restaurant
    /// files under some subcategory.</summary>
    public static string SubcategoryFor(IEnumerable<string> types) =>
        types.Select(t => ByGoogleType.GetValueOrDefault(t)).FirstOrDefault(name => name is not null)
        ?? Fallback;
}
