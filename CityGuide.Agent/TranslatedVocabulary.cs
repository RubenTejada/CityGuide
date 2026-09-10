using System.Text.RegularExpressions;

namespace CityGuide.Agent;

/// <summary>
/// The part of the portal that translates itself without a model. Three quarters of
/// the Spanish text in the CMS is not prose at all — opening hours are Google's own
/// closed vocabulary of seven day names and two words, and a section name, an event
/// category or a film genre is one label out of a list the portal itself defines.
/// Sending those to a model would cost tokens to get back something a table already
/// knows, and would let two runs disagree — which for a section name means two URLs.
/// </summary>
public static partial class TranslatedVocabulary
{
    /// <summary>
    /// Section, subcategory and guide-page names. These become the English URL segment
    /// ("/en/santo-domingo/restaurants"), so they are curated rather than translated on
    /// the fly: a URL that changes between runs is a URL that breaks. A name missing
    /// here is reported by the translation pass and left in Spanish until it is added,
    /// which is the safe failure — a Spanish segment beats a segment that moves.
    /// </summary>
    private static readonly Dictionary<string, string> SectionNames = new(StringComparer.OrdinalIgnoreCase)
    {
        // City sections
        ["Restaurantes"] = "Restaurants",
        ["Bares y Clubes"] = "Bars & Clubs",
        ["Tiendas"] = "Shopping",
        ["Cines"] = "Movie Theaters",
        ["Atracciones"] = "Attractions",
        ["Empresas y Servicios"] = "Businesses & Services",
        // La sección se llama igual en los dos idiomas, y por eso está aquí: sin la
        // entrada el pase de traducción la deja en español y la reporta como faltante.
        ["Tours"] = "Tours",
        ["Eventos"] = "Events",
        ["Qué Hacer"] = "Things to Do",
        ["Artículos"] = "Articles",

        // Cuisines
        ["Americana"] = "American",
        ["Árabe"] = "Middle Eastern",
        ["Brasileña"] = "Brazilian",
        ["China"] = "Chinese",
        ["Comida Rápida"] = "Fast Food",
        ["Coreana"] = "Korean",
        ["Criolla"] = "Dominican",
        ["Desayunos y Brunch"] = "Breakfast & Brunch",
        ["Española"] = "Spanish",
        ["Francesa"] = "French",
        ["India"] = "Indian",
        ["Italiana"] = "Italian",
        ["Japonesa"] = "Japanese",
        ["Mariscos"] = "Seafood",
        ["Mediterránea"] = "Mediterranean",
        ["Mexicana"] = "Mexican",
        ["Parrilladas"] = "Steakhouse & Grill",
        ["Peruana"] = "Peruvian",
        ["Pizzerías"] = "Pizzerias",
        ["Tailandesa"] = "Thai",
        ["Vegetariana"] = "Vegetarian",
        ["Vietnamita"] = "Vietnamese",

        // Nightlife, retail and services
        ["Bancos"] = "Banks",
        ["Bares"] = "Bars",
        ["Calzado"] = "Shoes",
        ["Comida"] = "Food",
        ["Discotecas"] = "Nightclubs",
        ["Entretenimiento"] = "Entertainment",
        ["Farmacias"] = "Pharmacies",
        ["Joyería y Accesorios"] = "Jewelry & Accessories",
        ["Lounges y Rooftops"] = "Lounges & Rooftops",
        ["Moda"] = "Fashion",
        ["Otros"] = "Other",
        ["Perfumerías y Cosméticos"] = "Perfume & Cosmetics",
        ["Plazas Comerciales y Malls"] = "Shopping Malls",
        ["Remesas y Envíos"] = "Money Transfers & Shipping",
        ["Rent a Car"] = "Car Rentals",
        ["Salones de Eventos"] = "Event Venues",
        ["Ropa y Moda"] = "Clothing & Fashion",
        ["Servicios"] = "Services",
        ["Supermercados"] = "Supermarkets",
        ["Tiendas por Departamento"] = "Department Stores",
        ["Tours y Excursiones"] = "Tour Operators",

        // Las clases de día que agrupan las excursiones de la sección "Tours"
        ["Islas y Catamaranes"] = "Islands & Catamarans",
        ["Naturaleza y Ballenas"] = "Nature & Whales",
        ["Cultura e Historia"] = "Culture & History",
        ["Mar y Buceo"] = "Sea & Diving",
        ["Aventura"] = "Adventure",
    };

    /// <summary>The events filter lists whatever values the events carry, so the English
    /// labels have to be as closed a set as the Spanish ones (<see cref="EventCategories.Options"/>)
    /// or the English dropdown splits one category into two.</summary>
    private static readonly Dictionary<string, string> Categories = new(StringComparer.OrdinalIgnoreCase)
    {
        ["Conciertos"] = "Concerts",
        ["Música"] = "Music",
        ["Teatro y Danza"] = "Theater & Dance",
        ["Espectáculos"] = "Shows",
        ["Deportes"] = "Sports",
        ["Arte y Cultura"] = "Arts & Culture",
        ["Ferias y Exposiciones"] = "Fairs & Expos",
        ["Gastronomía"] = "Food & Drink",

        // Article categories
        ["Cultura"] = "Culture",
        ["Familia"] = "Family",
        ["Vida Nocturna"] = "Nightlife",
    };

    /// <summary>Caribbean Cinemas states genres in English already; this is for the odd
    /// Spanish one that slips through.</summary>
    private static readonly Dictionary<string, string> Genres = new(StringComparer.OrdinalIgnoreCase)
    {
        ["Comedia"] = "Comedy",
        ["Acción"] = "Action",
        ["Animación"] = "Animation",
        ["Aventura"] = "Adventure",
        ["Ciencia Ficción"] = "Science Fiction",
        ["Documental"] = "Documentary",
        ["Drama"] = "Drama",
        ["Fantasía"] = "Fantasy",
        ["Familiar"] = "Family",
        ["Terror"] = "Horror",
        ["Suspenso"] = "Thriller",
    };

    private static readonly Dictionary<string, string> Countries = new(StringComparer.OrdinalIgnoreCase)
    {
        ["República Dominicana"] = "Dominican Republic",
    };

    /// <summary>Google writes opening hours as one "day: range" line per day, with two
    /// words for the days that are not a range. Longest first, so "miércoles" is not cut
    /// down to the "mié" rule.</summary>
    private static readonly (string Spanish, string English)[] HourWords =
    [
        ("Abierto 24 horas", "Open 24 hours"),
        ("miércoles", "Wednesday"),
        ("domingo", "Sunday"),
        ("sábado", "Saturday"),
        ("viernes", "Friday"),
        ("jueves", "Thursday"),
        ("martes", "Tuesday"),
        ("lunes", "Monday"),
        ("Cerrado", "Closed"),
        ("mié", "Wed"),
        ("dom", "Sun"),
        ("sáb", "Sat"),
        ("vie", "Fri"),
        ("jue", "Thu"),
        ("mar", "Tue"),
        ("lun", "Mon"),
    ];

    /// <summary>The English name of a section, or null when nobody has decided one.</summary>
    public static string? SectionName(string spanish) =>
        SectionNames.TryGetValue(spanish.Trim(), out string? english) ? english : null;

    /// <summary>The English opening hours, or null when the text is not the shape Google
    /// writes — a note an editor typed by hand goes to the model like any other prose.</summary>
    public static string? Hours(string spanish)
    {
        string english = spanish;
        foreach ((string from, string to) in HourWords)
        {
            english = Regex.Replace(english, $@"\b{Regex.Escape(from)}\b", to, RegexOptions.IgnoreCase);
        }

        // Every word Google uses is in the table; anything left in Spanish means an
        // editor wrote the hours themselves, and the model should read them instead.
        return SpanishLetters().IsMatch(english) ? null : english;
    }

    /// <summary>The English label of an event or article category, or null when it is
    /// one nobody has mapped.</summary>
    public static string? Category(string spanish) =>
        Categories.TryGetValue(spanish.Trim(), out string? english) ? english : null;

    /// <summary>A film genre in English. Caribbean Cinemas states most of them in
    /// English already, so an unmapped one is passed through rather than dropped.</summary>
    public static string Genre(string spanish) =>
        Genres.TryGetValue(spanish.Trim(), out string? english) ? english : spanish;

    /// <summary>The English name of a country, or null when it is not one we know.</summary>
    public static string? Country(string spanish) =>
        Countries.TryGetValue(spanish.Trim(), out string? english) ? english : null;

    [GeneratedRegex(@"[áéíóúñÁÉÍÓÚÑ]|\b(?:de|del|la|el|los|las|y|horas|abierto|cerrado)\b", RegexOptions.IgnoreCase)]
    private static partial Regex SpanishLetters();
}
