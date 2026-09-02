using System.Text.Json;
using Examine;
using Umbraco.Cms.Core;
using Umbraco.Cms.Core.Events;
using Umbraco.Cms.Core.IO;
using Umbraco.Cms.Core.Models;
using Umbraco.Cms.Core.Notifications;
using Umbraco.Cms.Core.PropertyEditors;
using Umbraco.Cms.Core.Serialization;
using Umbraco.Cms.Core.Services;
using Umbraco.Cms.Core.Services.OperationStatus;
using Umbraco.Cms.Core.Strings;
using Umbraco.Cms.Core.Models.Membership;
using Umbraco.Cms.Core.Security;
using OpenIddict.Abstractions;
using Umbraco.Cms.Infrastructure.Examine;
using Umbraco.Extensions;

namespace CityGuideWeb.CityGuide;

/// <summary>
/// Creates the CityGuide document types and seeds a sample Santo Domingo content tree.
/// Idempotent: skips schema creation when the "place" document type exists, and skips
/// seeding when a "site" root node already exists.
/// </summary>
public class CityGuideSeeder : INotificationAsyncHandler<UmbracoApplicationStartedNotification>
{
    private static readonly string[] FacilityOptions =
    [
        "Romántico", "Aire Acondicionado", "Horario Extendido", "Restaurante en el Lugar",
        "Parqueo", "WiFi", "Delivery", "Terraza", "Música en Vivo", "Apto para Niños",
    ];

    private readonly IRuntimeState _runtimeState;
    private readonly IContentTypeService _contentTypeService;
    private readonly IDataTypeService _dataTypeService;
    private readonly IContentService _contentService;
    private readonly IMediaService _mediaService;
    private readonly MediaFileManager _mediaFileManager;
    private readonly MediaUrlGeneratorCollection _mediaUrlGenerators;
    private readonly IContentTypeBaseServiceProvider _contentTypeBaseServiceProvider;
    private readonly IHostEnvironment _hostEnvironment;
    private readonly IShortStringHelper _shortStringHelper;
    private readonly PropertyEditorCollection _propertyEditors;
    private readonly IConfigurationEditorJsonSerializer _configSerializer;
    private readonly IExamineManager _examineManager;
    private readonly IIndexRebuilder _indexRebuilder;
    private readonly IUserService _userService;
    private readonly IUserGroupService _userGroupService;
    private readonly IBackOfficeUserClientCredentialsManager _clientCredentialsManager;
    private readonly IOpenIddictApplicationManager _oauthApplications;
    private readonly IConfiguration _configuration;
    private readonly ILogger<CityGuideSeeder> _logger;

    public CityGuideSeeder(
        IRuntimeState runtimeState,
        IContentTypeService contentTypeService,
        IDataTypeService dataTypeService,
        IContentService contentService,
        IMediaService mediaService,
        MediaFileManager mediaFileManager,
        MediaUrlGeneratorCollection mediaUrlGenerators,
        IContentTypeBaseServiceProvider contentTypeBaseServiceProvider,
        IHostEnvironment hostEnvironment,
        IShortStringHelper shortStringHelper,
        PropertyEditorCollection propertyEditors,
        IConfigurationEditorJsonSerializer configSerializer,
        IExamineManager examineManager,
        IIndexRebuilder indexRebuilder,
        IUserService userService,
        IUserGroupService userGroupService,
        IBackOfficeUserClientCredentialsManager clientCredentialsManager,
        IOpenIddictApplicationManager oauthApplications,
        IConfiguration configuration,
        ILogger<CityGuideSeeder> logger)
    {
        _runtimeState = runtimeState;
        _contentTypeService = contentTypeService;
        _dataTypeService = dataTypeService;
        _contentService = contentService;
        _mediaService = mediaService;
        _mediaFileManager = mediaFileManager;
        _mediaUrlGenerators = mediaUrlGenerators;
        _contentTypeBaseServiceProvider = contentTypeBaseServiceProvider;
        _hostEnvironment = hostEnvironment;
        _shortStringHelper = shortStringHelper;
        _propertyEditors = propertyEditors;
        _configSerializer = configSerializer;
        _examineManager = examineManager;
        _indexRebuilder = indexRebuilder;
        _userService = userService;
        _userGroupService = userGroupService;
        _clientCredentialsManager = clientCredentialsManager;
        _oauthApplications = oauthApplications;
        _configuration = configuration;
        _logger = logger;
    }

    public async Task HandleAsync(UmbracoApplicationStartedNotification notification, CancellationToken cancellationToken)
    {
        if (_runtimeState.Level != Umbraco.Cms.Core.RuntimeLevel.Run)
        {
            return;
        }

        if (_contentTypeService.Get("place") is null)
        {
            _logger.LogInformation("CityGuide: creating document types");
            await CreateSchemaAsync();
        }

        if (_contentService.GetRootContent().All(c => c.ContentType.Alias != "site"))
        {
            _logger.LogInformation("CityGuide: seeding sample content");
            SeedContent();
        }

        await EnsureCompanySchemaAsync();

        await EnsureMallSchemaAsync();

        await EnsureMovieSchemaAsync();

        await EnsureArticleSchemaAsync();

        await EnsurePlaceRatingSchemaAsync();

        await EnsureEventCategorySchemaAsync();

        bool thingsToDoMigrated = await EnsureThingsToDoMigratedAsync();

        await EnsureSectionPhotoSchemaAsync();

        await EnsureAgentSchemaAsync();

        await EnsureCityStatusSchemaAsync();

        await EnsureSeoSchemaAsync();

        await EnsureAgentApiUserAsync();

        bool citiesSeeded = EnsureCitiesSeeded();

        bool agentConfigSeeded = EnsureAgentConfigSeeded();

        bool banksSeeded = EnsureBanksSeeded();

        bool eventsSeeded = EnsureEventsSeeded();

        bool atraccionesSeeded = EnsureAtraccionesSeeded();

        bool baresSeeded = EnsureBaresSeeded();

        bool cinemasSeeded = EnsureCinemasSeeded();

        bool mallsSeeded = EnsureMallsSeeded();

        bool shoppingSeeded = EnsureShoppingChainsSeeded();

        bool articlesSeeded = EnsureArticlesSeeded();

        bool logosRestored = EnsureChainLogos();

        // The Delivery API query endpoint reads from this index. Rebuild it when it is
        // empty while published content exists, or when this startup seeded new content
        // (content published during boot is not picked up by the index event handlers).
        if (_examineManager.TryGetIndex(Constants.UmbracoIndexes.DeliveryApiContentIndexName, out IIndex index)
            && (banksSeeded
                || citiesSeeded
                || logosRestored
                || agentConfigSeeded
                || thingsToDoMigrated
                || eventsSeeded
                || atraccionesSeeded
                || baresSeeded
                || cinemasSeeded
                || mallsSeeded
                || shoppingSeeded
                || articlesSeeded
                || index.Searcher.CreateQuery().All().Execute(Examine.Search.QueryOptions.SkipTake(0, 1)).TotalItemCount == 0))
        {
            _logger.LogInformation("CityGuide: rebuilding empty Delivery API content index");
            await _indexRebuilder.RebuildIndexAsync(Constants.UmbracoIndexes.DeliveryApiContentIndexName, null, false);
        }
    }

    private async Task CreateSchemaAsync()
    {
        IDataType textstring = (await _dataTypeService.GetAsync(Constants.DataTypes.Guids.TextstringGuid))!;
        IDataType textarea = (await _dataTypeService.GetAsync(Constants.DataTypes.Guids.TextareaGuid))!;
        IDataType dateTime = (await _dataTypeService.GetAsync(Constants.DataTypes.Guids.DatePickerWithTimeGuid))!;
        IDataType imagePicker = (await _dataTypeService.GetAsync(Constants.DataTypes.Guids.MediaPicker3SingleImageGuid))!;

        IDataType coordinate = await GetOrCreateDataTypeAsync(
            "CityGuide Coordinate", Constants.PropertyEditors.Aliases.Decimal,
            "Umb.PropertyEditorUi.Decimal", ValueStorageType.Decimal, configurationData: null);

        IDataType facilities = await GetOrCreateDataTypeAsync(
            "CityGuide Facilities", Constants.PropertyEditors.Aliases.CheckBoxList,
            "Umb.PropertyEditorUi.CheckBoxList", ValueStorageType.Nvarchar,
            new Dictionary<string, object> { ["items"] = FacilityOptions });

        IContentType place = NewContentType("place", "Place", "icon-map-location");
        AddProperty(place, "description", "Descripción", textarea, 1);
        AddProperty(place, "address", "Dirección", textstring, 2);
        AddProperty(place, "phone", "Teléfono", textstring, 3);
        AddProperty(place, "website", "Sitio Web", textstring, 4);
        AddProperty(place, "hours", "Horario", textarea, 5);
        AddProperty(place, "photo", "Foto", imagePicker, 6);
        AddProperty(place, "latitude", "Latitud", coordinate, 7);
        AddProperty(place, "longitude", "Longitud", coordinate, 8);
        AddProperty(place, "facilities", "Facilidades del Lugar", facilities, 9);
        AddProperty(place, "googlePlaceId", "Google Place ID", textstring, 10);
        AddProperty(place, "source", "Fuente (manual | agent)", textstring, 11);
        await CreateAsync(place);

        IContentType eventItem = NewContentType("eventItem", "Event", "icon-calendar");
        AddProperty(eventItem, "description", "Descripción", textarea, 1);
        AddProperty(eventItem, "startDate", "Fecha Inicio", dateTime, 2);
        AddProperty(eventItem, "endDate", "Fecha Fin", dateTime, 3);
        AddProperty(eventItem, "venueName", "Lugar", textstring, 4);
        AddProperty(eventItem, "address", "Dirección", textstring, 5);
        AddProperty(eventItem, "photo", "Foto", imagePicker, 6);
        AddProperty(eventItem, "latitude", "Latitud", coordinate, 7);
        AddProperty(eventItem, "longitude", "Longitud", coordinate, 8);
        AddProperty(eventItem, "category", "Categoría", textstring, 9);
        AddProperty(eventItem, "website", "Sitio Web / Entradas", textstring, 10);
        AddProperty(eventItem, "phone", "Teléfono", textstring, 11);
        await CreateAsync(eventItem);

        IContentType subcategory = NewContentType("subcategory", "Subcategory", "icon-folder");
        subcategory.AllowedContentTypes = [new ContentTypeSort(place.Key, 0, place.Alias)];
        await CreateAsync(subcategory);

        IContentType categoryPage = NewContentType("categoryPage", "Category Page", "icon-list");
        AddProperty(categoryPage, "intro", "Introducción", textarea, 1);
        AddProperty(categoryPage, "photo", "Foto (portada de sección)", imagePicker, 2);
        categoryPage.AllowedContentTypes =
        [
            new ContentTypeSort(subcategory.Key, 0, subcategory.Alias),
            new ContentTypeSort(place.Key, 1, place.Alias),
        ];
        await CreateAsync(categoryPage);

        IContentType eventsPage = NewContentType("eventsPage", "Events Page", "icon-calendar-alt");
        AddProperty(eventsPage, "photo", "Foto (portada de sección)", imagePicker, 1);
        eventsPage.AllowedContentTypes = [new ContentTypeSort(eventItem.Key, 0, eventItem.Alias)];
        await CreateAsync(eventsPage);

        IContentType thingsToDoPage = NewContentType("thingsToDoPage", "Things To Do Page", "icon-compass");
        AddProperty(thingsToDoPage, "intro", "Introducción", textarea, 1);
        AddProperty(thingsToDoPage, "photo", "Foto (portada de sección)", imagePicker, 2);
        await CreateAsync(thingsToDoPage);

        IContentType city = NewContentType("city", "City", "icon-globe");
        AddProperty(city, "intro", "Introducción", textarea, 1);
        AddProperty(city, "country", "País", textstring, 2);
        AddProperty(city, "heroImage", "Imagen Principal", imagePicker, 3);
        AddProperty(city, "latitude", "Latitud (centro del mapa)", coordinate, 4);
        AddProperty(city, "longitude", "Longitud (centro del mapa)", coordinate, 5);
        city.AllowedContentTypes =
        [
            new ContentTypeSort(categoryPage.Key, 0, categoryPage.Alias),
            new ContentTypeSort(eventsPage.Key, 1, eventsPage.Alias),
            new ContentTypeSort(thingsToDoPage.Key, 2, thingsToDoPage.Alias),
        ];
        await CreateAsync(city);

        IContentType site = NewContentType("site", "Site", "icon-home");
        site.AllowedAsRoot = true;
        AddProperty(site, "siteName", "Nombre del Sitio", textstring, 1);
        site.AllowedContentTypes = [new ContentTypeSort(city.Key, 0, city.Alias)];
        await CreateAsync(site);
    }

    private async Task<IDataType> GetOrCreateDataTypeAsync(
        string name, string editorAlias, string editorUiAlias, ValueStorageType storageType,
        IDictionary<string, object>? configurationData)
    {
        IDataType? existing = await _dataTypeService.GetAsync(name);
        if (existing is not null)
        {
            return existing;
        }

        if (!_propertyEditors.TryGet(editorAlias, out IDataEditor? editor))
        {
            throw new InvalidOperationException($"Property editor '{editorAlias}' not found.");
        }

        var dataType = new DataType(editor!, _configSerializer, -1)
        {
            Name = name,
            EditorUiAlias = editorUiAlias,
            DatabaseType = storageType,
        };
        if (configurationData is not null)
        {
            dataType.ConfigurationData = configurationData;
        }

        Attempt<IDataType, DataTypeOperationStatus> attempt =
            await _dataTypeService.CreateAsync(dataType, Constants.Security.SuperUserKey);
        return attempt.Success
            ? attempt.Result
            : throw new InvalidOperationException($"Failed to create data type '{name}': {attempt.Status}");
    }

    private ContentType NewContentType(string alias, string name, string icon) =>
        new(_shortStringHelper, -1) { Alias = alias, Name = name, Icon = icon };

    private void AddProperty(IContentType contentType, string alias, string name, IDataType dataType, int sortOrder)
    {
        var propertyType = new PropertyType(_shortStringHelper, dataType, alias)
        {
            Name = name,
            SortOrder = sortOrder,
        };
        contentType.AddPropertyType(propertyType, "content", "Content");
    }

    private async Task CreateAsync(IContentType contentType)
    {
        Attempt<ContentTypeOperationStatus> attempt =
            await _contentTypeService.CreateAsync(contentType, Constants.Security.SuperUserKey);
        if (!attempt.Success)
        {
            throw new InvalidOperationException($"Failed to create document type '{contentType.Alias}': {attempt.Result}");
        }
    }

    private void SeedContent()
    {
        IContent site = _contentService.Create("TuCiudad", -1, "site");
        site.SetValue("siteName", "TuCiudad.com");
        _contentService.Save(site);

        IContent city = _contentService.Create("Santo Domingo", site.Id, "city");
        city.SetValue("intro", "Bares, restaurantes, atracciones y un poco más de Santo Domingo. Ubícate con un clic.");
        city.SetValue("country", "República Dominicana");
        city.SetValue("latitude", 18.4718m);
        city.SetValue("longitude", -69.9312m);
        _contentService.Save(city);

        IContent restaurantes = CreateCategory(city, "Restaurantes", "Los mejores restaurantes de la ciudad.");
        IContent bares = CreateCategory(city, "Bares y Clubes", "Vida nocturna: bares, lounges y discotecas.");
        IContent tiendas = CreateCategory(city, "Tiendas", "Tiendas y centros comerciales.");
        IContent cines = CreateCategory(city, "Cines", "Carteleras y salas de cine.");
        IContent servicios = CreateCategory(city, "Empresas y Servicios", "Empresas y servicios locales.");

        IContent china = _contentService.Create("China", restaurantes.Id, "subcategory");
        _contentService.Save(china);
        IContent criolla = _contentService.Create("Criolla", restaurantes.Id, "subcategory");
        _contentService.Save(criolla);
        IContent italiana = _contentService.Create("Italiana", restaurantes.Id, "subcategory");
        _contentService.Save(italiana);

        CreatePlace(china.Id, "Pan Oliva",
            "Cocina asiática con un toque criollo en el corazón de La Julia. Rollitos primavera y especialidades cantonesas en un ambiente acogedor.",
            "Av. Sarasota, Santo Domingo DN", "809-533-7380",
            "Dom - Juev 11:00AM - 12:00AM\nVier - Sáb 11:00AM - 2:00AM",
            18.4557m, -69.9282m,
            ["Romántico", "Aire Acondicionado", "Horario Extendido", "Restaurante en el Lugar", "Parqueo"]);

        CreatePlace(criolla.Id, "El Conuco",
            "Comida típica dominicana con espectáculo folclórico. La bandera dominicana, sancocho y mofongo en un ambiente tradicional.",
            "Calle Casimiro de Moya 152, Gazcue", "809-686-0129",
            "Lun - Dom 11:30AM - 11:00PM",
            18.4645m, -69.9095m,
            ["Aire Acondicionado", "Restaurante en el Lugar", "Parqueo", "Música en Vivo", "Apto para Niños"]);

        CreatePlace(italiana.Id, "Trattoria Vesuvio",
            "Clásico italiano del Malecón con más de 60 años de historia. Pastas artesanales y mariscos frescos.",
            "Av. George Washington 521, Malecón", "809-221-1954",
            "Lun - Dom 12:00PM - 12:00AM",
            18.4602m, -69.9180m,
            ["Romántico", "Aire Acondicionado", "Restaurante en el Lugar", "Parqueo", "WiFi"]);

        CreatePlace(bares.Id, "Onno's Bar",
            "Bar y lounge en la Zona Colonial, punto de encuentro nocturno con música y coctelería.",
            "Calle Hostos esq. El Conde, Zona Colonial", "809-689-1183",
            "Mar - Dom 6:00PM - 3:00AM",
            18.4734m, -69.8849m,
            ["Aire Acondicionado", "Horario Extendido", "Música en Vivo"]);

        CreatePlace(tiendas.Id, "Ágora Mall",
            "Centro comercial moderno en el corazón de Naco: moda, tecnología, food court y cine.",
            "Av. John F. Kennedy esq. Abraham Lincoln", "809-363-2323",
            "Lun - Sáb 9:00AM - 9:00PM\nDom 11:00AM - 8:00PM",
            18.4826m, -69.9401m,
            ["Aire Acondicionado", "Parqueo", "WiFi", "Apto para Niños"]);

        CreatePlace(cines.Id, "Caribbean Cinemas Downtown Center",
            "Salas de cine con tecnología CXC y VIP en Downtown Center, Piantini.",
            "Av. Núñez de Cáceres esq. Rómulo Betancourt", "809-688-8710",
            "Lun - Dom 11:00AM - 11:00PM",
            18.4520m, -69.9584m,
            ["Aire Acondicionado", "Parqueo", "Apto para Niños"]);

        CreatePlace(servicios.Id, "Farmacia Carol",
            "Cadena de farmacias con servicio 24 horas y delivery.",
            "Av. 27 de Febrero 241", "809-563-0000",
            "Abierto 24 horas",
            18.4680m, -69.9390m,
            ["Aire Acondicionado", "Parqueo", "Delivery", "Horario Extendido"]);

        IContent eventos = _contentService.Create("Eventos", city.Id, "eventsPage");
        _contentService.Save(eventos);
        IContent evento = _contentService.Create("Festival Gastronómico Dominicano", eventos.Id, "eventItem");
        evento.SetValue("description", "Una semana dedicada a la cocina dominicana con los mejores chefs de la ciudad.");
        evento.SetValue("startDate", new DateTime(2026, 10, 5, 18, 0, 0));
        evento.SetValue("endDate", new DateTime(2026, 10, 11, 23, 0, 0));
        evento.SetValue("venueName", "Plaza España");
        evento.SetValue("address", "Plaza España, Zona Colonial");
        evento.SetValue("latitude", 18.4773m);
        evento.SetValue("longitude", -69.8822m);
        evento.SetValue("category", "Gastronomía");
        _contentService.Save(evento);

        IContent queHacer = _contentService.Create("Qué Hacer", city.Id, "thingsToDoPage");
        queHacer.SetValue("intro", ThingsToDoIntro);
        _contentService.Save(queHacer);

        _contentService.PublishBranch(site, PublishBranchFilter.IncludeUnpublished, ["*"]);
    }

    private IContent CreateCategory(IContent city, string name, string intro)
    {
        IContent category = _contentService.Create(name, city.Id, "categoryPage");
        category.SetValue("intro", intro);
        _contentService.Save(category);
        return category;
    }

    private IContent CreatePlace(
        int parentId, string name, string description, string address, string phone,
        string hours, decimal latitude, decimal longitude, string[] facilities,
        string? website = null, string? photoValue = null)
    {
        IContent place = _contentService.Create(name, parentId, "place");
        place.SetValue("description", description);
        place.SetValue("address", address);
        place.SetValue("phone", phone);
        place.SetValue("hours", hours);
        place.SetValue("latitude", latitude);
        place.SetValue("longitude", longitude);
        place.SetValue("facilities", JsonSerializer.Serialize(facilities));
        place.SetValue("source", "manual");
        if (website is not null)
        {
            place.SetValue("website", website);
        }

        if (photoValue is not null)
        {
            place.SetValue("photo", photoValue);
        }

        _contentService.Save(place);
        return place;
    }

    /// <summary>
    /// Publishes exactly the nodes the seeder just created, parents before children.
    /// PublishBranch(..., IncludeUnpublished) would publish everything else left
    /// unpublished in the branch too — including the ingestion agent's drafts, which
    /// exist precisely so an editor reviews them before they go live. That is how two
    /// Punta Cana bars from a cancelled run reached the live site: reseeding one
    /// deleted bar published the whole "Bares y Clubes" branch with them in it.
    /// </summary>
    private void PublishSeeded(IEnumerable<IContent> created)
    {
        foreach (IContent content in created.OrderBy(c => c.Level))
        {
            _contentService.Publish(content, ["*"]);
        }
    }

    // ---- Company level (empresa -> sucursales) ----

    /// <summary>
    /// Idempotent, runs every startup: creates the "company" document type (empresa with
    /// logo and general info, branches as child places) if missing, and allows it under
    /// "subcategory" and "categoryPage" so existing installations pick it up.
    /// </summary>
    private async Task EnsureCompanySchemaAsync()
    {
        IContentType? place = _contentTypeService.Get("place");
        if (place is null)
        {
            return;
        }

        if (_contentTypeService.Get("company") is null)
        {
            _logger.LogInformation("CityGuide: creating 'company' document type");
            IDataType textstring = (await _dataTypeService.GetAsync(Constants.DataTypes.Guids.TextstringGuid))!;
            IDataType textarea = (await _dataTypeService.GetAsync(Constants.DataTypes.Guids.TextareaGuid))!;
            IDataType imagePicker = (await _dataTypeService.GetAsync(Constants.DataTypes.Guids.MediaPicker3SingleImageGuid))!;

            IContentType company = NewContentType("company", "Company", "icon-company");
            AddProperty(company, "description", "Descripción", textarea, 1);
            AddProperty(company, "address", "Dirección (oficina principal)", textstring, 2);
            AddProperty(company, "phone", "Teléfono", textstring, 3);
            AddProperty(company, "website", "Sitio Web", textstring, 4);
            AddProperty(company, "hours", "Horario", textarea, 5);
            AddProperty(company, "photo", "Logo", imagePicker, 6);
            company.AllowedContentTypes = [new ContentTypeSort(place.Key, 0, place.Alias)];
            await CreateAsync(company);
        }

        IContentType companyType = _contentTypeService.Get("company")!;
        foreach (string parentAlias in new[] { "subcategory", "categoryPage" })
        {
            IContentType? parent = _contentTypeService.Get(parentAlias);
            if (parent is null || parent.AllowedContentTypes!.Any(c => c.Key == companyType.Key))
            {
                continue;
            }

            _logger.LogInformation("CityGuide: allowing 'company' under '{Parent}'", parentAlias);
            int nextSort = parent.AllowedContentTypes!.Count();
            parent.AllowedContentTypes =
                [.. parent.AllowedContentTypes!, new ContentTypeSort(companyType.Key, nextSort, companyType.Alias)];
            Attempt<ContentTypeOperationStatus> attempt =
                await _contentTypeService.UpdateAsync(parent, Constants.Security.SuperUserKey);
            if (!attempt.Success)
            {
                throw new InvalidOperationException(
                    $"Failed to allow 'company' under '{parentAlias}': {attempt.Result}");
            }
        }
    }

    /// <summary>
    /// Adds the Google rating properties to the existing "place" document type.
    /// Guarded and run every startup so existing installations pick it up.
    /// </summary>
    private async Task EnsurePlaceRatingSchemaAsync()
    {
        IContentType? place = _contentTypeService.Get("place");
        if (place is null || place.PropertyTypeExists("googleRating"))
        {
            return;
        }

        _logger.LogInformation("CityGuide: adding Google rating properties to 'place'");
        IDataType rating = await GetOrCreateDataTypeAsync(
            "CityGuide Rating", Constants.PropertyEditors.Aliases.Decimal,
            "Umb.PropertyEditorUi.Decimal", ValueStorageType.Decimal, configurationData: null);
        IDataType numeric = (await _dataTypeService.GetAsync(Constants.DataTypes.Guids.NumericGuid))!;

        AddProperty(place, "googleRating", "Rating Google", rating, 12);
        AddProperty(place, "googleRatingCount", "Reseñas Google (cantidad)", numeric, 13);
        Attempt<ContentTypeOperationStatus> attempt =
            await _contentTypeService.UpdateAsync(place, Constants.Security.SuperUserKey);
        if (!attempt.Success)
        {
            throw new InvalidOperationException(
                $"Failed to add rating properties to 'place': {attempt.Result}");
        }
    }

    /// <summary>
    /// Adds the "category", "website" and "phone" properties to the existing
    /// "eventItem" document type. Guarded per property and run every startup
    /// so existing installations pick them up.
    /// </summary>
    private async Task EnsureEventCategorySchemaAsync()
    {
        IContentType? eventItem = _contentTypeService.Get("eventItem");
        if (eventItem is null)
        {
            return;
        }

        (string Alias, string Name, int Sort)[] missing =
            new[]
            {
                ("category", "Categoría", 9), ("website", "Sitio Web / Entradas", 10),
                ("phone", "Teléfono", 11), ("source", "Fuente (manual | agent:<portal>)", 12),
            }
                .Where(p => !eventItem.PropertyTypeExists(p.Item1))
                .ToArray();
        if (missing.Length == 0)
        {
            return;
        }

        IDataType textstring = (await _dataTypeService.GetAsync(Constants.DataTypes.Guids.TextstringGuid))!;
        foreach ((string alias, string name, int sort) in missing)
        {
            _logger.LogInformation("CityGuide: adding '{Alias}' property to 'eventItem'", alias);
            AddProperty(eventItem, alias, name, textstring, sort);
        }

        Attempt<ContentTypeOperationStatus> attempt =
            await _contentTypeService.UpdateAsync(eventItem, Constants.Security.SuperUserKey);
        if (!attempt.Success)
        {
            throw new InvalidOperationException(
                $"Failed to add event properties to 'eventItem': {attempt.Result}");
        }
    }

    /// Document types whose pages are indexable and therefore get the "SEO" tab.
    private static readonly string[] SeoDocumentTypes =
    [
        "city", "categoryPage", "subcategory", "place", "company", "mall",
        "eventsPage", "eventItem", "thingsToDoPage", "articlesPage", "article", "movie",
    ];

    /// <summary>
    /// Adds the "SEO" tab (metaTitle / metaDescription / noIndex) to every indexable
    /// document type. The frontend derives all three from the content itself, so these
    /// are per-page overrides only — leaving them empty is the normal case. Guarded per
    /// type and property, and run every startup so existing installations pick it up.
    /// </summary>
    private async Task EnsureSeoSchemaAsync()
    {
        IDataType? textstring = null;
        IDataType? textarea = null;
        IDataType? checkbox = null;

        foreach (string alias in SeoDocumentTypes)
        {
            IContentType? contentType = _contentTypeService.Get(alias);
            if (contentType is null || contentType.PropertyTypeExists("metaTitle"))
            {
                continue;
            }

            textstring ??= (await _dataTypeService.GetAsync(Constants.DataTypes.Guids.TextstringGuid))!;
            textarea ??= (await _dataTypeService.GetAsync(Constants.DataTypes.Guids.TextareaGuid))!;
            checkbox ??= (await _dataTypeService.GetAsync(Constants.DataTypes.Guids.CheckboxGuid))!;

            _logger.LogInformation("CityGuide: adding 'SEO' tab to '{Alias}'", alias);
            AddSeoProperty(contentType, new PropertyType(_shortStringHelper, textstring, "metaTitle")
            {
                Name = "Título SEO",
                Description = "Sustituye el título en Google y al compartir. Máx. 60 caracteres "
                    + "(se le añade \" | QueHacerRD\"). Vacío = se genera del contenido.",
                SortOrder = 1,
            });
            AddSeoProperty(contentType, new PropertyType(_shortStringHelper, textarea, "metaDescription")
            {
                Name = "Descripción SEO",
                Description = "Resumen que aparece bajo el título en Google. Máx. 160 caracteres. "
                    + "Vacío = se genera de la descripción o introducción.",
                SortOrder = 2,
            });
            AddSeoProperty(contentType, new PropertyType(_shortStringHelper, checkbox, "noIndex")
            {
                Name = "Ocultar de Google (noindex)",
                Description = "Marca esta casilla para que la página no se indexe en buscadores. "
                    + "Sigue siendo visible en el portal.",
                SortOrder = 3,
            });

            Attempt<ContentTypeOperationStatus> attempt =
                await _contentTypeService.UpdateAsync(contentType, Constants.Security.SuperUserKey);
            if (!attempt.Success)
            {
                throw new InvalidOperationException(
                    $"Failed to add SEO properties to '{alias}': {attempt.Result}");
            }
        }
    }

    /// <summary>Adds a property to the document type's own "SEO" tab, creating it if needed.</summary>
    private static void AddSeoProperty(IContentType contentType, PropertyType propertyType) =>
        contentType.AddPropertyType(propertyType, "seo", "SEO");

    /// <summary>
    /// Adds the "photo" (section cover) property to the city-section document types
    /// ("categoryPage", "eventsPage", "thingsToDoPage") so editors can set the image
    /// used on the city landing page. Guarded per type and run every startup so
    /// existing installations pick it up.
    /// </summary>
    private async Task EnsureSectionPhotoSchemaAsync()
    {
        IDataType? imagePicker = null;
        foreach (string alias in new[] { "categoryPage", "eventsPage", "thingsToDoPage" })
        {
            IContentType? sectionType = _contentTypeService.Get(alias);
            if (sectionType is null || sectionType.PropertyTypeExists("photo"))
            {
                continue;
            }

            imagePicker ??= (await _dataTypeService.GetAsync(Constants.DataTypes.Guids.MediaPicker3SingleImageGuid))!;
            _logger.LogInformation("CityGuide: adding 'photo' property to '{Alias}'", alias);
            AddProperty(sectionType, "photo", "Foto (portada de sección)", imagePicker,
                sectionType.PropertyTypeExists("intro") ? 2 : 1);

            Attempt<ContentTypeOperationStatus> attempt =
                await _contentTypeService.UpdateAsync(sectionType, Constants.Security.SuperUserKey);
            if (!attempt.Success)
            {
                throw new InvalidOperationException(
                    $"Failed to add 'photo' to '{alias}': {attempt.Result}");
            }
        }
    }

    /// <summary>
    /// Adds the "Agente" tab to the "city" document type: the city name the
    /// ingestion agent uses in Google queries ({city} placeholder in its Runs)
    /// and per-category prompt lines appended to the description-writing prompt.
    /// Guarded and run every startup so existing installations pick it up.
    /// </summary>
    private async Task EnsureAgentSchemaAsync()
    {
        IContentType? city = _contentTypeService.Get("city");
        if (city is null)
        {
            return;
        }

        IDataType textstring = (await _dataTypeService.GetAsync(Constants.DataTypes.Guids.TextstringGuid))!;
        IDataType textarea = (await _dataTypeService.GetAsync(Constants.DataTypes.Guids.TextareaGuid))!;

        // Each property is guarded on its own: an installation seeded before a
        // property existed still gets it, which a single tab-level guard would skip.
        var wanted = new (string Alias, IDataType Editor, string Name, string Description, int SortOrder)[]
        {
            ("agentCityName", textstring, "Nombre para búsquedas",
                "Cómo el agente nombra la ciudad en las búsquedas de Google, "
                + "p. ej. \"Santo Domingo, República Dominicana\". Sustituye {city} en las consultas.", 1),
            ("agentPrompts", textarea, "Prompts por categoría",
                "Una línea por categoría: <slug-de-categoría>: <instrucciones>. "
                + "P. ej. \"bares-y-clubes: Tono nocturno; menciona la música y el ambiente.\" "
                + "El agente las añade al prompt que escribe las descripciones.", 2),
            ("agentArea", textstring, "Área de búsqueda",
                "Rectángulo al que se limitan las búsquedas de Google: esquina suroeste y "
                + "noreste, \"lat,lng;lat,lng\". Sin él Google responde con todo el país "
                + "(bares de Punta Cana en una búsqueda de Santo Domingo).", 3),
            ("agentExcludedPlaces", textarea, "Lugares excluidos",
                "Ids de Google que el agente nunca debe crear, uno por línea, con un "
                + "comentario opcional después de #. P. ej. "
                + "\"ChIJdTEGE6ZhpY4R... # Plaza Luperón, no es una sucursal\". "
                + "Sin esto, lo que mandas a la papelera vuelve en la próxima pasada: "
                + "el agente deduplica por id, y un id que ya no está en el CMS parece nuevo.", 4),
        };

        var added = new List<string>();
        foreach ((string alias, IDataType editor, string name, string description, int sortOrder) in wanted)
        {
            if (city.PropertyTypeExists(alias))
            {
                continue;
            }

            city.AddPropertyType(new PropertyType(_shortStringHelper, editor, alias)
            {
                Name = name,
                Description = description,
                SortOrder = sortOrder,
            }, "agent", "Agente");
            added.Add(alias);
        }

        if (added.Count == 0)
        {
            return;
        }

        _logger.LogInformation("CityGuide: adding {Properties} to the 'Agente' tab on 'city'",
            string.Join(", ", added));
        Attempt<ContentTypeOperationStatus> attempt =
            await _contentTypeService.UpdateAsync(city, Constants.Security.SuperUserKey);
        if (!attempt.Success)
        {
            throw new InvalidOperationException($"Failed to add 'Agente' tab to 'city': {attempt.Result}");
        }
    }

    /// <summary>
    /// Adds the "comingSoon" flag to the "city" document type: a city that is offered in
    /// the city switcher but has no content yet shows an "en construcción" notice instead
    /// of its sections. Guarded and run every startup so existing installations pick it up.
    /// </summary>
    private async Task EnsureCityStatusSchemaAsync()
    {
        IContentType? city = _contentTypeService.Get("city");
        if (city is null || city.PropertyTypeExists("comingSoon"))
        {
            return;
        }

        IDataType checkbox = (await _dataTypeService.GetAsync(Constants.DataTypes.Guids.CheckboxGuid))!;

        _logger.LogInformation("CityGuide: adding 'comingSoon' to 'city'");
        city.AddPropertyType(new PropertyType(_shortStringHelper, checkbox, "comingSoon")
        {
            Name = "En construcción",
            Description = "La ciudad se puede elegir en el selector de ciudades, pero su página "
                + "muestra un aviso de \"en construcción\" en lugar de sus secciones.",
            SortOrder = 6,
        }, "content", "Content");

        Attempt<ContentTypeOperationStatus> attempt =
            await _contentTypeService.UpdateAsync(city, Constants.Security.SuperUserKey);
        if (!attempt.Success)
        {
            throw new InvalidOperationException($"Failed to add 'comingSoon' to 'city': {attempt.Result}");
        }
    }

    /// <summary>
    /// Creates the API user the ingestion agent authenticates with, when
    /// CityGuide:AgentClientSecret is configured (in Azure: an App Service setting).
    /// Lets a freshly seeded database accept the agent without manual backoffice
    /// setup. Runs every startup: it also re-registers the client credentials when the
    /// user is there but its OAuth client is not — the token endpoint then answers
    /// "the specified 'client_id' is invalid" (OpenIddict ID2052) and no restart fixed
    /// it, because the user existing was taken as proof the client existed too.
    /// Rotating the secret still requires deleting the user (or updating it in the
    /// backoffice): what is stored is a hash, so an existing client is left alone.
    /// </summary>
    private async Task EnsureAgentApiUserAsync()
    {
        string? secret = _configuration["CityGuide:AgentClientSecret"];
        if (string.IsNullOrWhiteSpace(secret))
        {
            return;
        }

        const string clientId = "umbraco-back-office-cityguide-agent";
        const string username = "cityguide-agent@quehacerrd.com";

        if (_userService.GetByUsername(username) is { } existing)
        {
            await RepairAgentClientAsync(existing.Key, clientId, secret);
            return;
        }

        _logger.LogInformation("CityGuide: creating agent API user");

        IUserGroup? admins = await _userGroupService.GetAsync(Constants.Security.AdminGroupAlias);
        if (admins is null)
        {
            _logger.LogError("CityGuide: admin user group not found; agent API user not created");
            return;
        }

        var attempt = await _userService.CreateAsync(Constants.Security.SuperUserKey, new UserCreateModel
        {
            UserName = username,
            Email = username,
            Name = "CityGuide Agent",
            Kind = UserKind.Api,
            UserGroupKeys = new HashSet<Guid> { admins.Key },
        }, approveUser: true);

        if (attempt.Success is false || attempt.Result.CreatedUser is null)
        {
            _logger.LogError("CityGuide: agent API user creation failed: {Status}", attempt.Status);
            return;
        }

        var credentialsAttempt = await _clientCredentialsManager.SaveAsync(
            attempt.Result.CreatedUser.Key, clientId, secret);
        if (credentialsAttempt.Success is false)
        {
            _logger.LogError("CityGuide: agent client credentials save failed: {Status}", credentialsAttempt.Result);
        }
    }

    /// <summary>
    /// Re-registers the agent's OAuth client when the user still claims it but the
    /// client itself is gone. Umbraco keeps the two apart — the user-to-client mapping
    /// and the OpenIddict application — and when only the application is missing the
    /// token endpoint answers "the specified 'client_id' is invalid" (ID2052) while
    /// every restart looks healthy: the user exists, so nothing is rebuilt, and saving
    /// the credentials again is refused as a duplicate. Dropping the stale mapping
    /// first is what makes the save go through.
    /// </summary>
    private async Task RepairAgentClientAsync(Guid userKey, string clientId, string secret)
    {
        if (await _oauthApplications.FindByClientIdAsync(clientId) is not null)
        {
            return;
        }

        _logger.LogWarning(
            "CityGuide: agent OAuth client '{ClientId}' is missing — registering it again", clientId);
        IEnumerable<string> claimed = await _clientCredentialsManager.GetClientIdsAsync(userKey);
        if (claimed.Contains(clientId, StringComparer.Ordinal))
        {
            await _clientCredentialsManager.DeleteAsync(userKey, clientId);
        }

        var repair = await _clientCredentialsManager.SaveAsync(userKey, clientId, secret);
        if (repair.Success is false)
        {
            _logger.LogError("CityGuide: agent client credentials repair failed: {Status}", repair.Result);
        }
    }

    /// <summary>
    /// Seeds default agent configuration on the Santo Domingo city node. Runs every
    /// startup and fills each field only while it is still empty, so a field added
    /// after the node was seeded gets its default and an editor's own value is kept.
    /// </summary>
    private bool EnsureAgentConfigSeeded()
    {
        IContent? site = _contentService.GetRootContent().FirstOrDefault(c => c.ContentType.Alias == "site");
        IContent? city = site is null ? null : Descendant(site, "city", "Santo Domingo");
        if (city is null)
        {
            return false;
        }

        var defaults = new (string Alias, string Value)[]
        {
            ("agentCityName", "Santo Domingo, República Dominicana"),
            ("agentPrompts",
                """
                restaurantes: Menciona el tipo de cocina y para qué ocasión funciona el lugar.
                bares-y-clubes: Tono nocturno y cercano; menciona la música y el ambiente.
                tiendas: Menciona qué se consigue allí y por qué vale la pena visitarla.
                """),
            // Greater Santo Domingo: the Distrito Nacional plus Este, Norte and Oeste.
            // Boca Chica, Punta Cana and Santiago fall outside it.
            ("agentArea", "18.35,-70.05;18.62,-69.75"),
        };

        var seeded = new List<string>();
        foreach ((string alias, string value) in defaults)
        {
            if (!city.HasProperty(alias) || !string.IsNullOrWhiteSpace(city.GetValue<string>(alias)))
            {
                continue;
            }

            city.SetValue(alias, value);
            seeded.Add(alias);
        }

        if (seeded.Count == 0)
        {
            return false;
        }

        _logger.LogInformation("CityGuide: seeding {Fields} on 'Santo Domingo'", string.Join(", ", seeded));
        _contentService.Save(city);
        _contentService.Publish(city, ["*"]);
        return true;
    }

    /// <summary>
    /// The cities the portal offers besides the seeded Santo Domingo. They hold no content
    /// yet: they exist so a visitor can pick them in the city switcher, and their page says
    /// as much.
    /// </summary>
    private static readonly (string Name, string Country, decimal Latitude, decimal Longitude, string Intro)[] ComingSoonCities =
    [
        ("Santiago", "República Dominicana", 19.4517m, -70.6970m,
            "Santiago de los Caballeros: bares, restaurantes y atracciones. Estamos armando la guía."),
        ("Punta Cana", "República Dominicana", 18.5820m, -68.4055m,
            "Playas, resorts, restaurantes y vida nocturna de Punta Cana. Estamos armando la guía."),
    ];

    /// <summary>
    /// Idempotent, runs every startup: creates the announced-but-empty cities, each flagged
    /// "comingSoon". Only missing ones are created, so a city an editor later fills (and
    /// unflags) is left alone.
    /// </summary>
    private bool EnsureCitiesSeeded()
    {
        IContent? site = _contentService.GetRootContent().FirstOrDefault(c => c.ContentType.Alias == "site");
        if (site is null)
        {
            return false;
        }

        var created = new List<IContent>();
        foreach ((string name, string country, decimal latitude, decimal longitude, string intro) in ComingSoonCities)
        {
            if (Descendant(site, "city", name) is not null)
            {
                continue;
            }

            _logger.LogInformation("CityGuide: seeding city '{City}' (en construcción)", name);
            IContent city = _contentService.Create(name, site.Id, "city");
            city.SetValue("intro", intro);
            city.SetValue("country", country);
            city.SetValue("latitude", latitude);
            city.SetValue("longitude", longitude);
            city.SetValue("comingSoon", true);
            _contentService.Save(city);
            created.Add(city);
        }

        PublishSeeded(created);
        return created.Count > 0;
    }

    private static readonly string ThingsToDoIntro =
        "Ideas para disfrutar la ciudad hoy: eventos, parques y atracciones abiertos, cines, bares, restaurantes y más.";

    /// <summary>
    /// Idempotent, runs every startup: replaces the retired "Especiales" section with the
    /// "Qué Hacer" guide. Creates the "thingsToDoPage" document type if missing, allows it
    /// under "city", deletes the legacy "specialsPage"/"specialItem" document types (which
    /// also removes their content), and seeds the "Qué Hacer" node under Santo Domingo.
    /// </summary>
    private async Task<bool> EnsureThingsToDoMigratedAsync()
    {
        if (_contentTypeService.Get("city") is null)
        {
            return false;
        }

        bool changed = false;

        if (_contentTypeService.Get("thingsToDoPage") is null)
        {
            _logger.LogInformation("CityGuide: creating 'thingsToDoPage' document type");
            IDataType textarea = (await _dataTypeService.GetAsync(Constants.DataTypes.Guids.TextareaGuid))!;
            IContentType thingsToDo = NewContentType("thingsToDoPage", "Things To Do Page", "icon-compass");
            AddProperty(thingsToDo, "intro", "Introducción", textarea, 1);
            await CreateAsync(thingsToDo);
        }

        IContentType thingsToDoType = _contentTypeService.Get("thingsToDoPage")!;
        IContentType cityType = _contentTypeService.Get("city")!;
        if (!cityType.AllowedContentTypes!.Any(c => c.Key == thingsToDoType.Key))
        {
            _logger.LogInformation("CityGuide: allowing 'thingsToDoPage' under 'city'");
            int nextSort = cityType.AllowedContentTypes!.Count();
            cityType.AllowedContentTypes =
                [.. cityType.AllowedContentTypes!, new ContentTypeSort(thingsToDoType.Key, nextSort, thingsToDoType.Alias)];
            Attempt<ContentTypeOperationStatus> attempt =
                await _contentTypeService.UpdateAsync(cityType, Constants.Security.SuperUserKey);
            if (!attempt.Success)
            {
                throw new InvalidOperationException(
                    $"Failed to allow 'thingsToDoPage' under 'city': {attempt.Result}");
            }
        }

        // Retire "Especiales": delete the child type first, then the page type.
        // Deleting a document type also deletes all content of that type.
        foreach (string alias in new[] { "specialItem", "specialsPage" })
        {
            if (_contentTypeService.Get(alias) is { } legacy)
            {
                _logger.LogInformation("CityGuide: deleting legacy '{Alias}' document type", alias);
                _contentTypeService.Delete(legacy);
                changed = true;
            }
        }

        IContent? site = _contentService.GetRootContent().FirstOrDefault(c => c.ContentType.Alias == "site");
        if (site is null)
        {
            return changed;
        }

        IContent? city = Descendant(site, "city", "Santo Domingo");
        if (city is null || Descendant(city, "thingsToDoPage", "Qué Hacer") is not null)
        {
            return changed;
        }

        _logger.LogInformation("CityGuide: seeding 'Qué Hacer' page");
        IContent queHacer = _contentService.Create("Qué Hacer", city.Id, "thingsToDoPage");
        queHacer.SetValue("intro", ThingsToDoIntro);
        _contentService.Save(queHacer);
        _contentService.PublishBranch(queHacer, PublishBranchFilter.IncludeUnpublished, ["*"]);
        return true;
    }

    private sealed record SeedEvent(
        string Name, string Category, string Description,
        DateTime Start, DateTime End, string Venue, string Address,
        decimal Latitude, decimal Longitude,
        string? Website = null, string? Phone = null, string? Photo = null);

    private static readonly SeedEvent[] Events =
    [
        new("Concierto de Merengue en el Malecón", "Música",
            "Gran tarima libre de costo con orquestas de merengue y bachata frente al mar Caribe.",
            new DateTime(2026, 9, 12, 19, 0, 0), new DateTime(2026, 9, 12, 23, 30, 0),
            "Malecón de Santo Domingo", "Av. George Washington", 18.4636m, -69.8990m, Photo: "merengue-malecon.jpg"),
        new("Feria del Libro Santo Domingo", "Arte y Cultura",
            "La cita anual de la literatura dominicana e internacional: presentaciones, firmas de autores y actividades infantiles.",
            new DateTime(2026, 9, 24, 10, 0, 0), new DateTime(2026, 10, 4, 21, 0, 0),
            "Plaza de la Cultura", "Av. Máximo Gómez esq. Pedro Henríquez Ureña", 18.4708m, -69.9105m, Photo: "feria-libro.jpg"),
        new("Ballet Nacional Dominicano: Gala de Temporada", "Teatro y Danza",
            "Gala de clausura de temporada con obras clásicas y contemporáneas del repertorio nacional.",
            new DateTime(2026, 10, 17, 20, 30, 0), new DateTime(2026, 10, 18, 22, 30, 0),
            "Teatro Nacional Eduardo Brito", "Av. Máximo Gómez 35, Plaza de la Cultura", 18.4703m, -69.9120m, Photo: "ballet-nacional.jpg"),
        new("Maratón Ciudad Colonial 10K", "Deportes",
            "Carrera 10K y 5K por las calles históricas de la Ciudad Colonial. Inscripción abierta hasta una semana antes.",
            new DateTime(2026, 10, 25, 6, 0, 0), new DateTime(2026, 10, 25, 11, 0, 0),
            "Parque Colón", "Calle El Conde, Ciudad Colonial", 18.4734m, -69.8849m, Photo: "maraton-10k.jpg"),
        new("Festival de Jazz de Santo Domingo", "Música",
            "Tres noches de jazz con artistas locales e invitados internacionales en un ambiente al aire libre.",
            new DateTime(2026, 11, 6, 19, 0, 0), new DateTime(2026, 11, 8, 23, 0, 0),
            "Plaza España", "Plaza España, Ciudad Colonial", 18.4773m, -69.8822m, Photo: "festival-jazz.jpg"),
        new("Expo Artesanía Dominicana", "Ferias y Exposiciones",
            "Exposición y venta de artesanía en ámbar, larimar, cerámica y madera de artesanos de todo el país.",
            new DateTime(2026, 11, 13, 10, 0, 0), new DateTime(2026, 11, 15, 20, 0, 0),
            "Centro de Convenciones del MIREX", "Av. Independencia, Centro de los Héroes", 18.4520m, -69.9126m, Photo: "expo-artesania.jpg"),
        new("Serie del Béisbol Invernal: Licey vs. Escogido", "Deportes",
            "El clásico eterno del béisbol dominicano en el inicio de la temporada invernal.",
            new DateTime(2026, 11, 21, 19, 30, 0), new DateTime(2026, 11, 21, 23, 0, 0),
            "Estadio Quisqueya Juan Marichal", "Av. Tiradentes, Ensanche La Fe", 18.4830m, -69.9092m, Photo: "beisbol-invernal.jpg"),
        new("Encendido del Árbol de Navidad", "Ferias y Exposiciones",
            "Encendido navideño con villancicos, food trucks y actividades para toda la familia.",
            new DateTime(2026, 12, 1, 18, 0, 0), new DateTime(2026, 12, 1, 22, 0, 0),
            "Plaza de la Bandera", "Av. 27 de Febrero esq. Luperón", 18.4560m, -69.9670m, Photo: "arbol-navidad.jpg"),
        new("Concierto Sinfónico de Navidad", "Música",
            "La Orquesta Sinfónica Nacional interpreta el repertorio navideño clásico y criollo.",
            new DateTime(2026, 12, 18, 20, 30, 0), new DateTime(2026, 12, 18, 22, 30, 0),
            "Teatro Nacional Eduardo Brito", "Av. Máximo Gómez 35, Plaza de la Cultura", 18.4703m, -69.9120m,
            Phone: "809-687-3191", Photo: "sinfonico-navidad.jpg"),
        // Conciertos, espectáculos y obras de teatro
        new("Juan Luis Guerra en Concierto", "Conciertos",
            "El máximo exponente de la música dominicana presenta sus éxitos junto a 4.40 en una noche única.",
            new DateTime(2026, 11, 28, 20, 30, 0), new DateTime(2026, 11, 28, 23, 59, 0),
            "Estadio Olímpico Félix Sánchez", "Av. John F. Kennedy, Centro Olímpico", 18.4855m, -69.9179m,
            Website: "https://www.uepatickets.com", Photo: "juan-luis-guerra.jpg"),
        new("Romeo Santos: Fórmula Tour", "Conciertos",
            "El Rey de la Bachata regresa a Santo Domingo con su gira internacional.",
            new DateTime(2026, 12, 12, 20, 0, 0), new DateTime(2026, 12, 12, 23, 59, 0),
            "Estadio Quisqueya Juan Marichal", "Av. Tiradentes, Ensanche La Fe", 18.4830m, -69.9092m,
            Website: "https://www.uepatickets.com", Photo: "romeo-santos.jpg"),
        new("Navidad Merenguera: Milly Quezada y Los Hermanos Rosario", "Conciertos",
            "Concierto navideño al aire libre con dos leyendas del merengue frente al mar.",
            new DateTime(2026, 12, 20, 19, 0, 0), new DateTime(2026, 12, 20, 23, 0, 0),
            "Anfiteatro Plaza Juan Barón", "Av. George Washington, Malecón", 18.4600m, -69.8930m,
            Website: "https://www.tuboleta.com.do", Photo: "navidad-merenguera.jpg"),
        new("La Casa de Bernarda Alba", "Teatro y Danza",
            "La obra maestra de Federico García Lorca puesta en escena por la Compañía Nacional de Teatro.",
            new DateTime(2026, 9, 18, 20, 30, 0), new DateTime(2026, 9, 20, 22, 30, 0),
            "Palacio de Bellas Artes", "Av. Máximo Gómez esq. Independencia", 18.4666m, -69.9026m,
            Phone: "809-687-0504", Photo: "bernarda-alba.jpg"),
        new("Don Juan Tenorio", "Teatro y Danza",
            "El clásico de Zorrilla en temporada de Día de los Muertos, montaje de la Sala Ravelo.",
            new DateTime(2026, 10, 31, 20, 30, 0), new DateTime(2026, 11, 2, 22, 30, 0),
            "Sala Ravelo, Teatro Nacional", "Av. Máximo Gómez 35, Plaza de la Cultura", 18.4703m, -69.9120m,
            Phone: "809-687-3191", Photo: "don-juan-tenorio.jpg"),
        new("Ópera: Carmen de Bizet", "Teatro y Danza",
            "Producción completa de la ópera Carmen con solistas internacionales, coro y orquesta en vivo.",
            new DateTime(2026, 12, 5, 20, 0, 0), new DateTime(2026, 12, 6, 22, 30, 0),
            "Teatro Nacional Eduardo Brito", "Av. Máximo Gómez 35, Plaza de la Cultura", 18.4703m, -69.9120m,
            Phone: "809-687-3191", Photo: "opera-carmen.jpg"),
        new("Noche de Comedia Dominicana", "Espectáculos",
            "Los mejores comediantes del país en una noche de stand-up para reír sin parar.",
            new DateTime(2026, 10, 9, 21, 0, 0), new DateTime(2026, 10, 9, 23, 30, 0),
            "Teatro La Fiesta, Hotel Jaragua", "Av. George Washington 367", 18.4620m, -69.9080m,
            Website: "https://www.uepatickets.com", Phone: "809-221-2222", Photo: "noche-comedia.jpg"),
        new("Circo Fantástico Internacional", "Espectáculos",
            "Acróbatas, malabaristas y payasos de gira internacional bajo la gran carpa. Funciones diarias.",
            new DateTime(2026, 10, 30, 18, 0, 0), new DateTime(2026, 11, 8, 21, 0, 0),
            "Carpa junto a Sambil Santo Domingo", "Av. John F. Kennedy esq. Paseo de los Aviadores", 18.4829m, -69.9410m,
            Website: "https://www.tuboleta.com.do", Photo: "circo-fantastico.jpg"),
    ];

    /// <summary>
    /// Seeds the event catalog (with categories) under Santo Domingo's "Eventos" page.
    /// Idempotent per event: only creates the seed events whose name is missing, so new
    /// entries added to <see cref="Events"/> reach existing installations. Also backfills
    /// the "category" and photo of pre-existing seed events that lack them.
    /// </summary>
    private bool EnsureEventsSeeded()
    {
        IContent? site = _contentService.GetRootContent().FirstOrDefault(c => c.ContentType.Alias == "site");
        if (site is null)
        {
            return false;
        }

        IContent? eventos = Descendant(site, "city", "Santo Domingo") is { } city
            ? Descendant(city, "eventsPage", "Eventos")
            : null;
        if (eventos is null)
        {
            return false;
        }

        List<IContent> existing = _contentService
            .GetPagedChildren(eventos.Id, 0, 500, out _, null, null, null, false)
            .Where(c => c.ContentType.Alias == "eventItem")
            .ToList();

        bool changed = false;

        // Seed photo per event name; the festival is created in SeedContent, not in Events.
        Dictionary<string, string> photosByName = Events
            .Where(s => s.Photo is not null)
            .ToDictionary(s => s.Name, s => s.Photo!);
        photosByName["Festival Gastronómico Dominicano"] = "festival-gastronomico.jpg";

        IMedia? photoFolder = null;
        IMedia PhotoFolder() => photoFolder ??= GetOrCreateRootMediaFolder("Eventos");

        // Backfill the category on seeded events that lack one, by name. Only the
        // events seeded here have a known category: the agent's imported events get
        // theirs from the event sync, and a blanket value here would relabel every
        // one of them (they all read "Gastronomía" until this stopped doing that).
        Dictionary<string, string> categoriesByName = Events.ToDictionary(s => s.Name, s => s.Category);
        foreach (IContent item in existing.Where(c => string.IsNullOrEmpty(c.GetValue<string>("category"))))
        {
            if (!categoriesByName.TryGetValue(item.Name!, out string? category))
            {
                continue;
            }

            item.SetValue("category", category);
            _contentService.Save(item);
            changed = true;
        }

        // Backfill the photo on pre-existing events that lack one.
        foreach (IContent item in existing.Where(c => string.IsNullOrEmpty(c.GetValue<string>("photo"))))
        {
            if (!photosByName.TryGetValue(item.Name!, out string? file))
            {
                continue;
            }

            string? photoValue = CreateSeedMedia(PhotoFolder(), $"Foto {item.Name}", $"events/{file}");
            if (photoValue is null)
            {
                continue;
            }

            _logger.LogInformation("CityGuide: adding photo to event '{Name}'", item.Name);
            item.SetValue("photo", photoValue);
            _contentService.Save(item);
            changed = true;
        }

        HashSet<string> existingNames = existing.Select(c => c.Name!).ToHashSet();
        foreach (SeedEvent seed in Events.Where(s => !existingNames.Contains(s.Name)))
        {
            _logger.LogInformation("CityGuide: seeding event '{Name}'", seed.Name);
            IContent evento = _contentService.Create(seed.Name, eventos.Id, "eventItem");
            evento.SetValue("description", seed.Description);
            evento.SetValue("startDate", seed.Start);
            evento.SetValue("endDate", seed.End);
            evento.SetValue("venueName", seed.Venue);
            evento.SetValue("address", seed.Address);
            evento.SetValue("latitude", seed.Latitude);
            evento.SetValue("longitude", seed.Longitude);
            evento.SetValue("category", seed.Category);
            if (seed.Website is not null)
            {
                evento.SetValue("website", seed.Website);
            }
            if (seed.Phone is not null)
            {
                evento.SetValue("phone", seed.Phone);
            }
            if (seed.Photo is not null
                && CreateSeedMedia(PhotoFolder(), $"Foto {seed.Name}", $"events/{seed.Photo}") is { } newPhoto)
            {
                evento.SetValue("photo", newPhoto);
            }
            _contentService.Save(evento);
            changed = true;
        }

        if (changed)
        {
            // Safe as a branch publish: the events sync publishes what it creates, so
            // nothing under here is deliberately held back as a draft. The remaining
            // branch publishes are the same — each covers a subtree this method just
            // created, never one the agent may already have written drafts into.
            _contentService.PublishBranch(eventos, PublishBranchFilter.IncludeUnpublished, ["*"]);
        }
        return changed;
    }

    // ---- Company chains (empresa -> sucursales), shared by banks/supermarkets/pharmacies ----

    private sealed record ChainBranch(string Name, string Address, decimal Latitude, decimal Longitude);

    private sealed record Chain(
        string Name, string LogoFile, string Website, string Phone, string Hours,
        string Description, ChainBranch[] Branches);

    /// <summary>One "company" node per chain (logo + general info), branches as child places.</summary>
    private void SeedChainCompanies(int parentId, IMedia logoFolder, Chain[] chains, string[] branchFacilities)
    {
        foreach (Chain chain in chains)
        {
            string? photoValue = CreateLogoMedia(logoFolder, chain.Name, chain.LogoFile);

            IContent company = _contentService.Create(chain.Name, parentId, "company");
            company.SetValue("description", chain.Description);
            company.SetValue("address", chain.Branches[0].Address);
            company.SetValue("phone", chain.Phone);
            company.SetValue("website", chain.Website);
            company.SetValue("hours", chain.Hours);
            if (photoValue is not null)
            {
                company.SetValue("photo", photoValue);
            }

            _contentService.Save(company);

            // Branches carry only their own data; phone/hours/website/logo are
            // inherited from the company by the frontend when empty.
            foreach (ChainBranch branch in chain.Branches)
            {
                CreatePlace(company.Id, branch.Name, string.Empty,
                    branch.Address, string.Empty, string.Empty,
                    branch.Latitude, branch.Longitude, branchFacilities);
            }
        }
    }

    private IMedia GetOrCreateRootMediaFolder(string name)
    {
        if (_mediaService.GetRootMedia().FirstOrDefault(m => m.Name == name) is { } existing)
        {
            return _mediaService.GetById(existing.Id)!;
        }

        IMedia folder = _mediaService.CreateMedia(name, Constants.System.Root, Constants.Conventions.MediaTypes.Folder);
        _mediaService.Save(folder);
        return folder;
    }

    // ---- Banks ----

    private static readonly string BankHours = "Lun - Vie 8:30AM - 5:00PM\nSáb 9:00AM - 1:00PM";

    private static readonly Chain[] Banks =
    [
        new("Banreservas", "banreservas.png", "https://www.banreservas.com", "809-960-2121", BankHours,
            "Banco de Reservas de la República Dominicana, el banco estatal y uno de los más grandes del país.",
            [
                new("Oficina Principal — Torre Banreservas", "Av. Winston Churchill esq. Porfirio Herrera, Piantini", 18.4676m, -69.9406m),
                new("Sucursal Zona Colonial", "Calle Isabel La Católica esq. Las Mercedes, Zona Colonial", 18.4735m, -69.8830m),
                new("Sucursal 27 de Febrero", "Av. 27 de Febrero, La Esperilla", 18.4623m, -69.9151m),
                new("Sucursal Sambil", "Av. John F. Kennedy, Plaza Sambil", 18.4830m, -69.9260m),
                new("Sucursal Megacentro", "Av. San Vicente de Paúl, Megacentro, Santo Domingo Este", 18.5057m, -69.8570m),
            ]),
        new("Banco Popular Dominicano", "popular.png", "https://www.popularenlinea.com", "809-544-5555", BankHours,
            "El mayor banco privado del país, con amplia red de sucursales y cajeros.",
            [
                new("Casa Matriz — Torre Popular", "Av. John F. Kennedy 20 esq. Máximo Gómez", 18.4749m, -69.9120m),
                new("Sucursal El Conde", "Calle El Conde, Zona Colonial", 18.4723m, -69.8870m),
                new("Sucursal Ágora Mall", "Av. John F. Kennedy esq. Abraham Lincoln, Naco", 18.4826m, -69.9401m),
                new("Sucursal Blue Mall", "Av. Winston Churchill esq. Gustavo Mejía Ricart, Piantini", 18.4720m, -69.9410m),
                new("Sucursal Núñez de Cáceres", "Av. Núñez de Cáceres, Mirador Norte", 18.4550m, -69.9570m),
            ]),
        new("Banco BHD", "bhd.png", "https://www.bhd.com.do", "809-243-3232", BankHours,
            "Banco múltiple dominicano con fuerte presencia en banca personal y empresarial.",
            [
                new("Oficina Principal — Plaza BHD", "Av. 27 de Febrero esq. Winston Churchill", 18.4653m, -69.9401m),
                new("Sucursal Gustavo Mejía Ricart", "Av. Gustavo Mejía Ricart, Piantini", 18.4700m, -69.9350m),
                new("Sucursal Zona Colonial", "Calle El Conde, Zona Colonial", 18.4723m, -69.8860m),
                new("Sucursal Sambil", "Av. John F. Kennedy, Plaza Sambil", 18.4830m, -69.9250m),
            ]),
        new("Scotiabank", "scotiabank.png", "https://do.scotiabank.com", "809-689-5151", BankHours,
            "Banco internacional canadiense con décadas de presencia en República Dominicana.",
            [
                new("Oficina Principal", "Av. 27 de Febrero esq. Winston Churchill", 18.4650m, -69.9390m),
                new("Sucursal Abraham Lincoln", "Av. Abraham Lincoln, Piantini", 18.4740m, -69.9450m),
                new("Sucursal Bella Vista Mall", "Av. Sarasota, Bella Vista", 18.4530m, -69.9450m),
                new("Sucursal Santo Domingo Este", "Av. San Vicente de Paúl, Santo Domingo Este", 18.5050m, -69.8580m),
            ]),
        new("Banco Santa Cruz", "santacruz.png", "https://www.bsc.com.do", "809-726-2727", BankHours,
            "Banco múltiple dominicano en crecimiento, enfocado en servicio personalizado.",
            [
                new("Oficina Principal", "Av. Lope de Vega, Piantini", 18.4780m, -69.9380m),
                new("Sucursal Naco", "Av. Tiradentes, Naco", 18.4770m, -69.9330m),
                new("Sucursal 27 de Febrero", "Av. 27 de Febrero", 18.4630m, -69.9200m),
            ]),
        new("Banco Caribe", "caribe.png", "https://www.bancocaribe.com.do", "809-378-9000", BankHours,
            "Banco múltiple dominicano con servicios de banca personal, empresarial y de inversión.",
            [
                new("Oficina Principal", "Av. 27 de Febrero 208, La Esperilla", 18.4640m, -69.9230m),
                new("Sucursal Naco", "Av. Tiradentes, Naco", 18.4780m, -69.9320m),
                new("Sucursal Santo Domingo Este", "Av. Venezuela, Santo Domingo Este", 18.4940m, -69.8560m),
            ]),
        new("Banco Promerica", "promerica.png", "https://www.promerica.com.do", "809-732-1100", BankHours,
            "Parte del grupo regional Promerica, con presencia en nueve países.",
            [
                new("Oficina Principal", "Av. Pedro Henríquez Ureña, La Esperilla", 18.4700m, -69.9330m),
                new("Sucursal Bella Vista", "Av. Sarasota, Bella Vista", 18.4520m, -69.9440m),
            ]),
        new("Banesco", "banesco.png", "https://www.banesco.com.do", "809-732-3232", BankHours,
            "Banco múltiple de capital internacional con operaciones en República Dominicana.",
            [
                new("Oficina Principal", "Av. Abraham Lincoln esq. Gustavo Mejía Ricart, Piantini", 18.4720m, -69.9430m),
                new("Sucursal Naco", "Av. Tiradentes, Naco", 18.4790m, -69.9340m),
            ]),
        new("APAP", "apap.png", "https://www.apap.com.do", "809-689-0171", BankHours,
            "Asociación Popular de Ahorros y Préstamos, líder en ahorro y crédito hipotecario.",
            [
                new("Oficina Principal", "Av. Máximo Gómez esq. 27 de Febrero", 18.4650m, -69.9110m),
                new("Sucursal John F. Kennedy", "Av. John F. Kennedy", 18.4800m, -69.9300m),
            ]),
    ];

    /// <summary>
    /// Idempotent: creates the "Bancos" subcategory under "Empresas y Servicios" with one
    /// "company" node per bank (logo + general info) and its branches as child places.
    /// Runs on every startup so existing installations pick it up without reseeding.
    /// A pre-company flat "Bancos" (places directly under the subcategory) is deleted and
    /// reseeded with the nested structure.
    /// </summary>
    private bool EnsureBanksSeeded()
    {
        IContent? site = _contentService.GetRootContent().FirstOrDefault(c => c.ContentType.Alias == "site");
        if (site is null)
        {
            return false;
        }

        IContent? servicios = Descendant(site, "city", "Santo Domingo") is { } city
            ? Descendant(city, "categoryPage", "Empresas y Servicios")
            : null;
        if (servicios is null)
        {
            return false;
        }

        if (Descendant(servicios, "subcategory", "Bancos") is { } existing)
        {
            bool hasCompanies = _contentService
                .GetPagedChildren(existing.Id, 0, 1, out _, null, null, null, false)
                .Any(c => c.ContentType.Alias == "company");
            if (hasCompanies)
            {
                return false;
            }

            _logger.LogInformation("CityGuide: migrating flat 'Bancos' to company/branch structure");
            _contentService.Delete(existing);
            if (_mediaService.GetRootMedia().FirstOrDefault(m => m.Name == "Bancos") is { } oldLogos)
            {
                _mediaService.Delete(oldLogos);
            }
        }
        else
        {
            _logger.LogInformation("CityGuide: seeding banks under 'Empresas y Servicios'");
        }

        IContent bancos = _contentService.Create("Bancos", servicios.Id, "subcategory");
        _contentService.Save(bancos);

        IMedia logoFolder = GetOrCreateRootMediaFolder("Bancos");

        SeedChainCompanies(bancos.Id, logoFolder, Banks, ["Aire Acondicionado", "Parqueo"]);

        _contentService.PublishBranch(bancos, PublishBranchFilter.IncludeUnpublished, ["*"]);
        return true;
    }

    /// <summary>
    /// Idempotent, runs every startup: creates the "movie" document type (cartelera
    /// catalog entry maintained by the agent: synopsis, poster, YouTube trailer) if
    /// missing, and allows it under "categoryPage" so existing installations pick it up.
    /// </summary>
    private async Task EnsureMovieSchemaAsync()
    {
        if (_contentTypeService.Get("categoryPage") is null)
        {
            return;
        }

        if (_contentTypeService.Get("movie") is null)
        {
            _logger.LogInformation("CityGuide: creating 'movie' document type");
            IDataType textstring = (await _dataTypeService.GetAsync(Constants.DataTypes.Guids.TextstringGuid))!;
            IDataType textarea = (await _dataTypeService.GetAsync(Constants.DataTypes.Guids.TextareaGuid))!;

            IContentType movie = NewContentType("movie", "Movie", "icon-movie");
            AddProperty(movie, "synopsis", "Sinopsis", textarea, 1);
            AddProperty(movie, "posterUrl", "Afiche (URL)", textstring, 2);
            AddProperty(movie, "trailerYoutubeId", "Trailer (YouTube ID)", textstring, 3);
            AddProperty(movie, "genre", "Género", textstring, 4);
            AddProperty(movie, "rating", "Clasificación", textstring, 5);
            AddProperty(movie, "duration", "Duración (min)", textstring, 6);
            AddProperty(movie, "caribbeanSlug", "Slug en Caribbean Cinemas", textstring, 7);
            await CreateAsync(movie);
        }

        IContentType movieType = _contentTypeService.Get("movie")!;
        await EnsureMovieReviewSchemaAsync(movieType);

        IContentType categoryPage = _contentTypeService.Get("categoryPage")!;
        if (!categoryPage.AllowedContentTypes!.Any(c => c.Key == movieType.Key))
        {
            _logger.LogInformation("CityGuide: allowing 'movie' under 'categoryPage'");
            int nextSort = categoryPage.AllowedContentTypes!.Count();
            categoryPage.AllowedContentTypes =
                [.. categoryPage.AllowedContentTypes!, new ContentTypeSort(movieType.Key, nextSort, movieType.Alias)];
            Attempt<ContentTypeOperationStatus> attempt =
                await _contentTypeService.UpdateAsync(categoryPage, Constants.Security.SuperUserKey);
            if (!attempt.Success)
            {
                throw new InvalidOperationException(
                    $"Failed to allow 'movie' under 'categoryPage': {attempt.Result}");
            }
        }
    }

    /// <summary>
    /// Adds the review properties the agent fills from IMDb and Rotten Tomatoes to the
    /// "movie" document type, so the portal can show the scores and link out to both.
    /// Guarded per property and run every startup so existing installations pick them up.
    /// </summary>
    private async Task EnsureMovieReviewSchemaAsync(IContentType movie)
    {
        (string Alias, string Name, int Sort)[] missing =
            new[]
            {
                ("imdbId", "IMDb ID", 8), ("imdbRating", "Rating IMDb", 9),
                ("imdbVotes", "Votos IMDb", 10), ("rottenTomatoes", "Rotten Tomatoes (%)", 11),
                ("originalTitle", "Título original", 12),
            }
                .Where(p => !movie.PropertyTypeExists(p.Item1))
                .ToArray();
        if (missing.Length == 0)
        {
            return;
        }

        IDataType textstring = (await _dataTypeService.GetAsync(Constants.DataTypes.Guids.TextstringGuid))!;
        foreach ((string alias, string name, int sort) in missing)
        {
            _logger.LogInformation("CityGuide: adding '{Alias}' property to 'movie'", alias);
            AddProperty(movie, alias, name, textstring, sort);
        }

        Attempt<ContentTypeOperationStatus> update =
            await _contentTypeService.UpdateAsync(movie, Constants.Security.SuperUserKey);
        if (!update.Success)
        {
            throw new InvalidOperationException(
                $"Failed to add review properties to 'movie': {update.Result}");
        }
    }

    // ---- Articles (blog) ----

    /// <summary>
    /// Idempotent, runs every startup: creates the "article" (blog post: summary,
    /// markdown body with internal links, hero image URL, author, date, category)
    /// and "articlesPage" (container) document types if missing, and allows
    /// "articlesPage" under "city" so existing installations pick it up.
    /// </summary>
    private async Task EnsureArticleSchemaAsync()
    {
        if (_contentTypeService.Get("city") is null)
        {
            return;
        }

        if (_contentTypeService.Get("article") is null)
        {
            _logger.LogInformation("CityGuide: creating 'article' document type");
            IDataType textstring = (await _dataTypeService.GetAsync(Constants.DataTypes.Guids.TextstringGuid))!;
            IDataType textarea = (await _dataTypeService.GetAsync(Constants.DataTypes.Guids.TextareaGuid))!;
            IDataType dateTime = (await _dataTypeService.GetAsync(Constants.DataTypes.Guids.DatePickerWithTimeGuid))!;

            IContentType article = NewContentType("article", "Article", "icon-edit");
            AddProperty(article, "summary", "Resumen", textarea, 1);
            AddProperty(article, "body", "Contenido (Markdown)", textarea, 2);
            AddProperty(article, "heroImageUrl", "Imagen de portada (URL)", textstring, 3);
            AddProperty(article, "author", "Autor", textstring, 4);
            AddProperty(article, "publishDate", "Fecha de Publicación", dateTime, 5);
            AddProperty(article, "category", "Categoría", textstring, 6);
            await CreateAsync(article);
        }

        if (_contentTypeService.Get("articlesPage") is null)
        {
            _logger.LogInformation("CityGuide: creating 'articlesPage' document type");
            IDataType textarea = (await _dataTypeService.GetAsync(Constants.DataTypes.Guids.TextareaGuid))!;
            IDataType imagePicker = (await _dataTypeService.GetAsync(Constants.DataTypes.Guids.MediaPicker3SingleImageGuid))!;
            IContentType articleType = _contentTypeService.Get("article")!;

            IContentType articlesPage = NewContentType("articlesPage", "Articles Page", "icon-newspaper");
            AddProperty(articlesPage, "intro", "Introducción", textarea, 1);
            AddProperty(articlesPage, "photo", "Foto (portada de sección)", imagePicker, 2);
            articlesPage.AllowedContentTypes = [new ContentTypeSort(articleType.Key, 0, articleType.Alias)];
            await CreateAsync(articlesPage);
        }

        IContentType articlesPageType = _contentTypeService.Get("articlesPage")!;
        IContentType cityType = _contentTypeService.Get("city")!;
        if (!cityType.AllowedContentTypes!.Any(c => c.Key == articlesPageType.Key))
        {
            _logger.LogInformation("CityGuide: allowing 'articlesPage' under 'city'");
            int nextSort = cityType.AllowedContentTypes!.Count();
            cityType.AllowedContentTypes =
                [.. cityType.AllowedContentTypes!, new ContentTypeSort(articlesPageType.Key, nextSort, articlesPageType.Alias)];
            Attempt<ContentTypeOperationStatus> attempt =
                await _contentTypeService.UpdateAsync(cityType, Constants.Security.SuperUserKey);
            if (!attempt.Success)
            {
                throw new InvalidOperationException(
                    $"Failed to allow 'articlesPage' under 'city': {attempt.Result}");
            }
        }
    }

    private sealed record SeedArticle(
        string Name, string Category, string Summary, string HeroImageUrl,
        DateTime PublishDate, string Body);

    private static readonly SeedArticle[] Articles =
    [
        new("Un día completo en la Zona Colonial: historia, café y atardecer",
            "Cultura",
            "Un recorrido a pie por la ciudad más antigua de América: de la Catedral Primada al Alcázar de Colón, con paradas para café, arte y una cerveza fría al caer la tarde.",
            "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a7/Catedral_Primada_CCSD_09_2018_1234.jpg/1280px-Catedral_Primada_CCSD_09_2018_1234.jpg",
            new DateTime(2026, 8, 20, 9, 0, 0),
            """
            Hay ciudades que se visitan y ciudades que se caminan. La [Zona Colonial](/santo-domingo/atracciones/zona-colonial) es de las segundas: quinientos años de historia metidos en unas pocas calles empedradas, y lo mejor es que todo queda a distancia de un buen paseo.

            ## Empieza temprano en el Parque Colón

            Llega antes de las diez, cuando la luz todavía es suave y las palomas mandan más que los turistas. Frente a ti tendrás la [Catedral Primada de América](/santo-domingo/atracciones/catedral-primada-de-america), la primera catedral del continente. Entra: el contraste entre la fachada de piedra coralina y el interior gótico, fresco y en penumbra, no se olvida. La visita toma menos de una hora y deja el resto del día libre.

            ## El Conde, sin prisa

            La calle El Conde es la peatonal de siempre: libreros de viejo, cafeteras ruidosas, gente jugando ajedrez. No es un museo, es una calle viva, y ahí está su gracia. Cualquier cafetería con mesas afuera sirve para un primer café y para ver pasar la ciudad.

            ![La peatonal El Conde, la calle viva de la Zona Colonial](https://upload.wikimedia.org/wikipedia/commons/thumb/c/ce/Calle_El_Conde_CCSD_03_2019_5088.jpg/1280px-Calle_El_Conde_CCSD_03_2019_5088.jpg)

            ## Plaza España al mediodía

            Bajando por la Calle Las Damas —la calle empedrada más antigua del Nuevo Mundo— se llega a Plaza España, presidida por el [Alcázar de Colón](/santo-domingo/atracciones/alcazar-de-colon). El palacio de Diego Colón hoy es un museo que se recorre en una hora y regala, desde sus balcones, la mejor vista del río Ozama. La explanada de la plaza está rodeada de restaurantes con terraza: buen punto para almorzar sin salir del guion.

            ![Plaza España, presidida por el Alcázar de Colón](https://upload.wikimedia.org/wikipedia/commons/thumb/d/db/Plaza_Espana_santo_domingo_02.JPG/1280px-Plaza_Espana_santo_domingo_02.JPG)

            ## La tarde: arte y patios

            Para bajar el almuerzo, [Casa de Teatro](/santo-domingo/bares-y-clubes/bares/casa-de-teatro) es la parada obligada de la tarde: casona colonial, exposiciones, y si tienes suerte, ensayo de algún grupo o peña en el patio. Su cartelera cambia cada semana, así que siempre hay algo distinto.

            ## Cerrar con música

            Cuando cae el sol la Zona cambia de ritmo. [Parada 77](/santo-domingo/bares-y-clubes/bares/parada-77) llena la esquina de son y bailadores —los domingos es fiesta segura— y [El Sartén](/santo-domingo/bares-y-clubes/bares/el-sarten), a unos pasos, sigue siendo ese bar de barrio con vellonera y dominó donde nadie es extraño. Cerveza bien fría, bolero de fondo, y el día queda redondo.

            **El plan en corto:** Catedral y Parque Colón por la mañana, El Conde a media mañana, Alcázar y almuerzo en Plaza España, Casa de Teatro por la tarde, y son y cerveza en Parada 77 o El Sartén de noche. Todo a pie.
            """),
        new("Santo Domingo con niños: un plan que funciona de verdad",
            "Familia",
            "Cuevas con lagunas turquesa, un zoológico gigante, trencito en el jardín botánico y helado al final: un itinerario probado para un fin de semana en familia.",
            "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c0/Santo_Domingo_Este_-_Los_Tres_Ojos_0202.JPG/1280px-Santo_Domingo_Este_-_Los_Tres_Ojos_0202.JPG",
            new DateTime(2026, 8, 26, 9, 0, 0),
            """
            Salir con niños en Santo Domingo tiene un truco: alternar asombro y descanso. Mucho de lo primero, suficiente de lo segundo, y meriendas estratégicas. Este plan lo cumple.

            ## Sábado por la mañana: Los Tres Ojos

            Pocas cosas impresionan tanto a un niño (y a un adulto) como bajar una escalera de piedra y encontrarse tres lagunas subterráneas de agua turquesa. El [Parque Nacional Los Tres Ojos](/santo-domingo/atracciones/parque-nacional-los-tres-ojos) se recorre en hora y media, y la balsa manual que cruza hacia el cuarto lago —escondido a cielo abierto— es el momento estrella del día. Ve temprano: hay sombra, pero el fresco de la mañana se agradece.

            ![Una de las lagunas subterráneas de Los Tres Ojos](https://upload.wikimedia.org/wikipedia/commons/thumb/1/11/Santo_Domingo_Este_-_Los_Tres_Ojos_0941.JPG/1280px-Santo_Domingo_Este_-_Los_Tres_Ojos_0941.JPG)

            ## Sábado por la tarde: zoológico

            El [Parque Zoológico Nacional](/santo-domingo/atracciones/parque-zoologico-nacional) es enorme —más de un millón de metros cuadrados—, así que la estrategia es el tren interno: da la vuelta completa y luego se repite a pie lo que más gustó. Los flamencos y la zona de especies nativas suelen ganar la votación familiar.

            ## Domingo por la mañana: Jardín Botánico

            El [Jardín Botánico Nacional](/santo-domingo/atracciones/jardin-botanico-nacional) es el paseo tranquilo del fin de semana: el trencito recorre el parque completo, el reloj floral es parada obligada de foto y el jardín japonés parece de otro país. Si prefieren pedalear o patinar, el [Parque Mirador Sur](/santo-domingo/atracciones/parque-mirador-sur) es el plan B con ciclovía y kilómetros de sombra.

            ![El reloj floral del Jardín Botánico Nacional](https://upload.wikimedia.org/wikipedia/commons/1/1a/Floral_Clock.jpg)

            ![El jardín japonés, uno de los rincones favoritos del Botánico](https://upload.wikimedia.org/wikipedia/commons/d/df/National_Botanical_Garden_Santo_Domingo_Japanese_Garden.jpg)

            ## Domingo por la tarde: plan bajo techo

            Cuando aprieta el calor (o llueve), el cierre es en [Ágora Mall](/santo-domingo/tiendas/plazas-comerciales-y-malls/agora-mall): merienda en el food court, un helado de Helados Bon y función en el [cine](/santo-domingo/cines) del cuarto nivel. Revisa la cartelera antes de salir y compra los asientos buenos.

            **Consejos rápidos:** lleva efectivo pequeño para las entradas de los parques, repelente para Los Tres Ojos, y agua siempre. Y si un día se cae por el sueño de la siesta, no pasa nada: la sección [Qué Hacer](/santo-domingo/que-hacer) tiene ideas de sobra para armar otro.
            """),
        new("Una noche en Santo Domingo: del rooftop a bailar dentro de una cueva",
            "Vida Nocturna",
            "Ruta nocturna por la capital: atardecer con vista en Piantini, cena con merengue en vivo, coctelería colonial y madrugada bailando bajo estalactitas.",
            "https://upload.wikimedia.org/wikipedia/commons/thumb/5/56/DFC_4574_Late-night_drinks_in_Pattaya_-_a_chilled_cocktail_with_a_slice_of_lime_and_neon_reflections.jpg/1280px-DFC_4574_Late-night_drinks_in_Pattaya_-_a_chilled_cocktail_with_a_slice_of_lime_and_neon_reflections.jpg",
            new DateTime(2026, 8, 31, 9, 0, 0),
            """
            Santo Domingo de noche no es un solo plan: son varios encadenados. Esta ruta empieza con el atardecer y termina de madrugada, y cada parada funciona también por sí sola.

            ## 7:00 PM — Atardecer en las alturas

            Arranca en [SBG](/santo-domingo/bares-y-clubes/lounges-y-rooftops/sbg-santo-domingo), el rooftop de Piantini: terraza con vista a la ciudad, DJ de entrada suave y coctelería seria. Es el punto para llegar temprano, agarrar mesa cerca del borde y ver cómo la ciudad enciende las luces.

            ## 9:00 PM — Cena que se convierte en fiesta

            De ahí, a [Mamajuana Café](/santo-domingo/bares-y-clubes/lounges-y-rooftops/mamajuana-cafe) en Naco. Se llega por la cena y uno se queda por la música: merengue y banda en vivo, y la coctelería de la casa gira alrededor de la mamajuana, como manda el nombre. Reserva si van más de cuatro.

            ## 11:00 PM — Cóctel colonial

            Un salto a la Zona Colonial cambia la escena por completo. [Lucía 203](/santo-domingo/bares-y-clubes/lounges-y-rooftops/lucia-203) es una casa colonial restaurada con mixología de autor: luz baja, tapas y el mejor punto de la ruta para conversar antes del cierre. Si prefieres algo más criollo, [El Sartén](/santo-domingo/bares-y-clubes/bares/el-sarten) queda a unas cuadras con su vellonera de boleros.

            ## 1:00 AM — El cierre: una discoteca dentro de una cueva

            El final es de los que se cuentan: [Guácara Taína](/santo-domingo/bares-y-clubes/discotecas/guacara-taina), una discoteca montada dentro de una cueva natural del [Parque Mirador Sur](/santo-domingo/atracciones/parque-mirador-sur), con estalactitas sobre la pista. Abre para fiestas y eventos especiales —conviene confirmar programación—; el plan B clásico es [Jubilee](/santo-domingo/bares-y-clubes/discotecas/jubilee), en el Malecón, con pista grande hasta las 4:00 AM.

            ![El Obelisco del Malecón, señal de que la noche va terminando frente al mar](https://upload.wikimedia.org/wikipedia/commons/6/65/Obelisco_Santo_Domingo.jpg)

            ## Bonus: la caminata del final

            Si al salir el cuerpo todavía pide calle, el [Malecón](/santo-domingo/atracciones/malecon-de-santo-domingo) de madrugada, con la brisa del Caribe de frente, es el mejor cierre gratis de la ciudad.

            ![El Malecón de Santo Domingo al caer la noche](https://upload.wikimedia.org/wikipedia/commons/thumb/8/83/Malecon_de_Santo_Domingo_2013-10-01_21-33.jpg/1280px-Malecon_de_Santo_Domingo_2013-10-01_21-33.jpg)

            **Logística:** usa taxi o app entre paradas (las distancias engañan), lleva documento para las discotecas y revisa los [eventos](/santo-domingo/eventos) de la semana: si hay concierto en agenda, la ruta se reordena sola.
            """),
    ];

    /// <summary>
    /// Idempotent, runs every startup: creates the "Artículos" page under Santo Domingo
    /// and any missing seed article (guarded per article), so new entries added to
    /// <see cref="Articles"/> reach existing installations.
    /// </summary>
    private bool EnsureArticlesSeeded()
    {
        if (_contentTypeService.Get("articlesPage") is null)
        {
            return false;
        }

        IContent? site = _contentService.GetRootContent().FirstOrDefault(c => c.ContentType.Alias == "site");
        if (site is null || Descendant(site, "city", "Santo Domingo") is not { } city)
        {
            return false;
        }

        IContent? articulos = Descendant(city, "articlesPage", "Artículos");
        bool seeded = false;
        if (articulos is null)
        {
            _logger.LogInformation("CityGuide: seeding 'Artículos' page");
            articulos = _contentService.Create("Artículos", city.Id, "articlesPage");
            articulos.SetValue("intro",
                "Guías, rutas e ideas escritas para disfrutar la ciudad: planes por barrio, por presupuesto y para cada tipo de plan.");
            _contentService.Save(articulos);
            seeded = true;
        }

        foreach (SeedArticle seed in Articles)
        {
            // Existing seed articles are updated in place when the seed text
            // changes, so content fixes reach installations already seeded.
            if (Descendant(articulos, "article", seed.Name) is { } existing)
            {
                if (existing.GetValue<string>("body") == seed.Body
                    && existing.GetValue<string>("summary") == seed.Summary
                    && existing.GetValue<string>("heroImageUrl") == seed.HeroImageUrl)
                {
                    continue;
                }

                _logger.LogInformation("CityGuide: updating seed article '{Name}'", seed.Name);
                existing.SetValue("summary", seed.Summary);
                existing.SetValue("body", seed.Body);
                existing.SetValue("heroImageUrl", seed.HeroImageUrl);
                _contentService.Save(existing);
                seeded = true;
                continue;
            }

            _logger.LogInformation("CityGuide: seeding article '{Name}'", seed.Name);
            IContent article = _contentService.Create(seed.Name, articulos.Id, "article");
            article.SetValue("summary", seed.Summary);
            article.SetValue("body", seed.Body);
            article.SetValue("heroImageUrl", seed.HeroImageUrl);
            article.SetValue("author", "Equipo TuCiudad");
            article.SetValue("publishDate", seed.PublishDate);
            article.SetValue("category", seed.Category);
            _contentService.Save(article);
            seeded = true;
        }

        if (seeded)
        {
            _contentService.PublishBranch(articulos, PublishBranchFilter.IncludeUnpublished, ["*"]);
        }

        return seeded;
    }

    // ---- Cinemas ----

    private sealed record CinemaBranch(string Name, string Address, decimal Latitude, decimal Longitude);

    /// <summary>
    /// Caribbean Cinemas locations in Santo Domingo. Names must match the frontend's
    /// CINEMAS_BY_CITY entries (frontend/lib/cinema.ts) — the branch page shows the
    /// live cartelera for the cinema whose name matches the place name.
    /// </summary>
    private static readonly CinemaBranch[] CaribbeanCinemasBranches =
    [
        new("Downtown Center", "Av. Núñez de Cáceres esq. Rómulo Betancourt", 18.4541m, -69.9545m),
        new("Galería 360", "Av. John F. Kennedy, 2do nivel", 18.4857m, -69.9362m),
        new("Novo-Centro VIP", "Av. Lope de Vega 29, Edificio Novo-Centro", 18.4734m, -69.9310m),
        new("Ágora Mall", "Av. John F. Kennedy esq. Abraham Lincoln", 18.4835m, -69.9393m),
        new("Sambil", "Av. John F. Kennedy, Sambil Santo Domingo", 18.4830m, -69.9119m),
        new("Megaplex-10", "Av. San Vicente de Paúl, Plaza Megacentro", 18.5072m, -69.8566m),
        new("Coral Mall", "Autopista de San Isidro, Coral Mall", 18.4864m, -69.8323m),
        new("Plaza Duarte", "Av. Duarte, Plaza Galería Duarte", 18.4934m, -69.8991m),
    ];

    /// <summary>
    /// Idempotent: creates the "Caribbean Cinemas" company under the "Cines" category
    /// with each Santo Domingo cinema as a child place (branch pages, like banks).
    /// Runs on every startup so existing installations pick it up without reseeding.
    /// The pre-company flat place ("Caribbean Cinemas Downtown Center") is deleted.
    /// </summary>
    private bool EnsureCinemasSeeded()
    {
        IContent? site = _contentService.GetRootContent().FirstOrDefault(c => c.ContentType.Alias == "site");
        if (site is null)
        {
            return false;
        }

        IContent? cines = Descendant(site, "city", "Santo Domingo") is { } city
            ? Descendant(city, "categoryPage", "Cines")
            : null;
        if (cines is null)
        {
            return false;
        }

        if (Descendant(cines, "company", "Caribbean Cinemas") is not null)
        {
            return false;
        }

        _logger.LogInformation("CityGuide: seeding Caribbean Cinemas branches under 'Cines'");

        if (Descendant(cines, "place", "Caribbean Cinemas Downtown Center") is { } legacyFlat)
        {
            _contentService.Delete(legacyFlat);
        }

        IMedia logoFolder = _mediaService.GetRootMedia().FirstOrDefault(m => m.Name == "Cines")
            is { } existingFolder
            ? _mediaService.GetById(existingFolder.Id)!
            : _mediaService.CreateMedia("Cines", Constants.System.Root, Constants.Conventions.MediaTypes.Folder);
        _mediaService.Save(logoFolder);

        string? photoValue = CreateLogoMedia(logoFolder, "Caribbean Cinemas", "caribbean-cinemas.png");

        IContent company = _contentService.Create("Caribbean Cinemas", cines.Id, "company");
        company.SetValue("description",
            "La cadena de cines líder del Caribe: salas CXC, 4DX y VIP con la cartelera "
            + "más completa de estrenos en Santo Domingo.");
        company.SetValue("address", CaribbeanCinemasBranches[0].Address);
        company.SetValue("website", "https://rd.caribbeancinemas.com");
        if (photoValue is not null)
        {
            company.SetValue("photo", photoValue);
        }

        _contentService.Save(company);

        // Branches carry only their own data; website/logo/description are inherited
        // from the company by the frontend when empty.
        foreach (CinemaBranch branch in CaribbeanCinemasBranches)
        {
            CreatePlace(company.Id, branch.Name, string.Empty,
                branch.Address, string.Empty, string.Empty,
                branch.Latitude, branch.Longitude,
                ["Aire Acondicionado", "Parqueo", "Apto para Niños"]);
        }

        _contentService.PublishBranch(company, PublishBranchFilter.IncludeUnpublished, ["*"]);
        return true;
    }

    private sealed record Atraccion(
        string Name, string Description, string Address, string Phone, string Hours,
        decimal Latitude, decimal Longitude, string[] Facilities, string? Website = null);

    private static readonly Atraccion[] Atracciones =
    [
        new("Malecón de Santo Domingo",
            "El paseo marítimo de la ciudad a lo largo de la Av. George Washington: kilómetros de vista al mar Caribe, monumentos, kioscos y vida al aire libre. Ideal para caminar al atardecer.",
            "Av. George Washington, Santo Domingo DN", "",
            "Abierto 24 horas",
            18.4622m, -69.9120m,
            ["Apto para Niños", "Terraza"]),
        new("Parque Zoológico Nacional",
            "El zoológico nacional (ZOODOM): más de 1 millón de metros cuadrados con especies nativas y exóticas en ambientes abiertos, tren interno y áreas familiares.",
            "Av. La Vega Real, Arroyo Hondo", "809-378-2149",
            "Mar - Dom 9:00AM - 5:00PM",
            18.5107m, -69.9418m,
            ["Parqueo", "Apto para Niños"],
            Website: "https://zoodom.gob.do"),
        new("Jardín Botánico Nacional",
            "Jardín Botánico Nacional Dr. Rafael María Moscoso: el pulmón verde de la ciudad, con el famoso reloj floral, jardín japonés y paseos en trencito.",
            "Av. República de Colombia, Los Ríos", "809-385-2611",
            "Lun - Dom 9:00AM - 5:00PM",
            18.4944m, -69.9530m,
            ["Parqueo", "Apto para Niños"],
            Website: "https://jbn.gob.do"),
        new("Parque Mirador Sur",
            "Extenso parque lineal sobre el acantilado del sur: ciclovía, áreas de picnic, cuevas y kilómetros de senderos para correr y patinar.",
            "Av. Mirador Sur, Santo Domingo DN", "",
            "Lun - Dom 5:00AM - 9:00PM",
            18.4443m, -69.9550m,
            ["Parqueo", "Apto para Niños"]),
        new("Zona Colonial",
            "El corazón histórico de Santo Domingo, Patrimonio de la Humanidad: la Catedral Primada de América, el Alcázar de Colón, la Calle Las Damas y la peatonal El Conde entre plazas, museos y cafés en calles empedradas.",
            "Calle El Conde, Ciudad Colonial, Santo Domingo DN", "",
            "Abierto 24 horas",
            18.4734m, -69.8836m,
            ["Apto para Niños"]),
        new("Catedral Primada de América",
            "La primera catedral del Nuevo Mundo, consagrada en el siglo XVI: fachada de piedra coralina dorada, interior gótico y capillas con siglos de historia frente al Parque Colón.",
            "Calle Arzobispo Meriño esq. Arzobispo Nouel, Zona Colonial", "",
            "Lun - Sáb 9:00AM - 4:30PM",
            18.4726m, -69.8834m,
            ["Apto para Niños"]),
        new("Alcázar de Colón",
            "El palacio virreinal de Diego Colón en Plaza España: museo con mobiliario y arte de la época colonial, y una de las postales más fotografiadas de la ciudad.",
            "Plaza España, Zona Colonial", "809-682-4750",
            "Mar - Dom 9:00AM - 5:00PM",
            18.4777m, -69.8825m,
            ["Apto para Niños"]),
        new("Parque Nacional Los Tres Ojos",
            "Tres lagunas subterráneas de agua cristalina dentro de una caverna de piedra caliza en el Parque Mirador del Este. Se cruza en una balsa manual hasta un cuarto lago escondido a cielo abierto.",
            "Av. Las Américas, Parque Mirador del Este, Santo Domingo Este", "",
            "Lun - Dom 9:00AM - 5:00PM",
            18.4810m, -69.8429m,
            ["Parqueo", "Apto para Niños"]),
        new("Parque de Las Praderas",
            "El parque del sector Las Praderas: áreas verdes con sombra, senderos para caminar y juegos infantiles, abierto las 24 horas y muy usado por el vecindario para hacer ejercicio temprano.",
            "Calle Madre Carmen 4, Las Praderas, Santo Domingo DN", "829-648-5028",
            "Abierto 24 horas",
            18.4652m, -69.9642m,
            ["Apto para Niños"]),
    ];

    /// <summary>
    /// Coordinates seeded wrong, corrected in place on installations that already
    /// carry them: the pin of Los Tres Ojos sat 2.3 km southwest of the caverns, and
    /// that same distance kept the agent's photo backfill from accepting the Google
    /// match (it drops a candidate farther than 2 km), so the attraction stayed
    /// without a photo. Only a node still holding the exact stale pair is touched,
    /// never a pin an editor moved.
    /// </summary>
    private static readonly (string Name, decimal StaleLatitude, decimal StaleLongitude,
        decimal Latitude, decimal Longitude)[] AtraccionPinFixes =
    [
        ("Parque Nacional Los Tres Ojos", 18.4647m, -69.8290m, 18.4810m, -69.8429m),
    ];

    /// <summary>
    /// Idempotent: creates the "Atracciones" category under Santo Domingo and any
    /// missing attraction place (guarded per place). Runs on every startup so new
    /// attractions reach existing installations without reseeding.
    /// </summary>
    private bool EnsureAtraccionesSeeded()
    {
        IContent? site = _contentService.GetRootContent().FirstOrDefault(c => c.ContentType.Alias == "site");
        if (site is null)
        {
            return false;
        }

        IContent? city = Descendant(site, "city", "Santo Domingo");
        if (city is null)
        {
            return false;
        }

        IContent? atracciones = Descendant(city, "categoryPage", "Atracciones");
        var created = new List<IContent>();
        if (atracciones is null)
        {
            _logger.LogInformation("CityGuide: seeding 'Atracciones' category");
            atracciones = _contentService.Create("Atracciones", city.Id, "categoryPage");
            atracciones.SetValue("intro", "Parques, monumentos y lugares emblemáticos para disfrutar la ciudad.");
            _contentService.Save(atracciones);
            created.Add(atracciones);
        }

        foreach (Atraccion a in Atracciones)
        {
            if (Descendant(atracciones, "place", a.Name) is not null)
            {
                continue;
            }

            _logger.LogInformation("CityGuide: seeding attraction '{Name}'", a.Name);
            created.Add(CreatePlace(atracciones.Id, a.Name, a.Description, a.Address, a.Phone,
                a.Hours, a.Latitude, a.Longitude, a.Facilities, website: a.Website));
        }

        PublishSeeded(created);
        var repaired = false;
        foreach ((string name, decimal staleLatitude, decimal staleLongitude,
            decimal latitude, decimal longitude) in AtraccionPinFixes)
        {
            if (Descendant(atracciones, "place", name) is not IContent place
                || place.GetValue<decimal?>("latitude") != staleLatitude
                || place.GetValue<decimal?>("longitude") != staleLongitude)
            {
                continue;
            }

            _logger.LogInformation("CityGuide: correcting the coordinates of '{Name}'", name);
            place.SetValue("latitude", latitude);
            place.SetValue("longitude", longitude);
            _contentService.Save(place);
            _contentService.Publish(place, ["*"]);
            repaired = true;
        }

        return created.Count > 0 || repaired;
    }

    // ---- Bares y Clubes ----

    private sealed record NightSpot(
        string Name, string Description, string Address, string Phone, string Hours,
        decimal Latitude, decimal Longitude, string[] Facilities, string? Website = null);

    private static readonly (string Subcategory, NightSpot[] Spots)[] NightlifeSubcategories =
    [
        ("Bares",
        [
            new("El Sartén",
                "Bar de barrio legendario de la Ciudad Colonial: son, bolero y bachata de vellonera, dominó y cerveza bien fría en un ambiente cien por ciento dominicano.",
                "Calle Hostos 153, Zona Colonial", "",
                "Lun - Dom 5:00PM - 12:00AM",
                18.4746m, -69.8846m,
                ["Música en Vivo", "Horario Extendido"]),
            new("Parada 77",
                "Bar de son en plena Zona Colonial: los domingos la esquina se llena de bailadores con orquesta en vivo y ron dominicano.",
                "Calle Isabel La Católica 255, Zona Colonial", "",
                "Mié - Dom 6:00PM - 2:00AM",
                18.4757m, -69.8827m,
                ["Música en Vivo", "Horario Extendido"]),
            new("Casa de Teatro",
                "Centro cultural con bar y patio en la Zona Colonial: peñas, trova, jazz y exposiciones en una casona colonial.",
                "Calle Arzobispo Meriño 110, Zona Colonial", "809-689-3430",
                "Mar - Sáb 6:00PM - 12:00AM",
                18.4715m, -69.8832m,
                ["Música en Vivo", "Terraza"],
                Website: "https://casadeteatro.com.do"),
        ]),
        ("Lounges y Rooftops",
        [
            new("Lucía 203",
                "Cóctel bar y lounge de la Zona Colonial: mixología de autor, tapas y música ambiente en una casa colonial restaurada.",
                "Calle Hostos, Zona Colonial", "",
                "Mar - Dom 6:00PM - 2:00AM",
                18.4741m, -69.8848m,
                ["Aire Acondicionado", "Horario Extendido", "Romántico"]),
            new("Mamajuana Café",
                "Restaurante-lounge en Naco con música en vivo, merengue y coctelería a base de mamajuana. Cena que se convierte en fiesta.",
                "Av. Presidente González, Ensanche Naco", "",
                "Mar - Dom 6:00PM - 2:00AM",
                18.4741m, -69.9265m,
                ["Música en Vivo", "Aire Acondicionado", "Restaurante en el Lugar", "Horario Extendido"]),
            new("SBG Santo Domingo",
                "Rooftop lounge en Piantini: terraza con vista a la ciudad, DJ, sushi y coctelería premium.",
                "Av. Gustavo Mejía Ricart, Piantini", "",
                "Lun - Dom 6:00PM - 2:00AM",
                18.4685m, -69.9394m,
                ["Terraza", "Horario Extendido", "Romántico", "Restaurante en el Lugar"]),
        ]),
        ("Discotecas",
        [
            new("Guácara Taína",
                "Discoteca dentro de una cueva natural en el Parque Mirador Sur: un clásico único de la vida nocturna de Santo Domingo, hoy sede de fiestas y eventos especiales.",
                "Av. Cayetano Germosén, Parque Mirador Sur", "",
                "Vie - Sáb 9:00PM - 3:00AM",
                18.4448m, -69.9457m,
                ["Música en Vivo", "Horario Extendido", "Parqueo"]),
            new("Jubilee",
                "Discoteca del hotel Renaissance Jaragua en el Malecón: pista amplia, DJ y música variada hasta la madrugada.",
                "Av. George Washington 367, Malecón", "809-221-2222",
                "Jue - Sáb 10:00PM - 4:00AM",
                18.4614m, -69.9058m,
                ["Aire Acondicionado", "Horario Extendido", "Parqueo"]),
        ]),
    ];

    /// <summary>
    /// Idempotent, runs every startup: creates the nightlife subcategories under
    /// "Bares y Clubes" and any missing place (guarded per place). A pre-subcategory
    /// "Onno's Bar" sitting directly under the category is moved into "Bares".
    /// </summary>
    private bool EnsureBaresSeeded()
    {
        IContent? site = _contentService.GetRootContent().FirstOrDefault(c => c.ContentType.Alias == "site");
        if (site is null)
        {
            return false;
        }

        IContent? bares = Descendant(site, "city", "Santo Domingo") is { } city
            ? Descendant(city, "categoryPage", "Bares y Clubes")
            : null;
        if (bares is null)
        {
            return false;
        }

        var created = new List<IContent>();
        bool moved = false;
        foreach ((string subcategoryName, NightSpot[] spots) in NightlifeSubcategories)
        {
            IContent? subcategory = Descendant(bares, "subcategory", subcategoryName);
            if (subcategory is null)
            {
                _logger.LogInformation("CityGuide: seeding '{Name}' subcategory under 'Bares y Clubes'", subcategoryName);
                subcategory = _contentService.Create(subcategoryName, bares.Id, "subcategory");
                _contentService.Save(subcategory);
                created.Add(subcategory);
            }

            if (subcategoryName == "Bares" && Descendant(bares, "place", "Onno's Bar") is { } onnos)
            {
                _logger.LogInformation("CityGuide: moving 'Onno's Bar' into 'Bares' subcategory");
                _contentService.Move(onnos, subcategory.Id);
                moved = true;
            }

            foreach (NightSpot spot in spots)
            {
                if (Descendant(subcategory, "place", spot.Name) is not null)
                {
                    continue;
                }

                _logger.LogInformation("CityGuide: seeding nightlife place '{Name}'", spot.Name);
                created.Add(CreatePlace(subcategory.Id, spot.Name, spot.Description, spot.Address, spot.Phone,
                    spot.Hours, spot.Latitude, spot.Longitude, spot.Facilities, website: spot.Website));
            }
        }

        PublishSeeded(created);
        return created.Count > 0 || moved;
    }

    // ---- Supermarkets & pharmacies (Tiendas) ----

    private static readonly string SupermarketHours = "Lun - Sáb 8:00AM - 10:00PM\nDom 8:00AM - 8:00PM";
    private static readonly string PharmacyHours = "Lun - Dom 8:00AM - 10:00PM";

    private static readonly Chain[] Supermarkets =
    [
        new("Supermercados Nacional", "nacional.png", "https://supermercadosnacional.com", "809-565-5541", SupermarketHours,
            "La cadena de supermercados premium del Grupo CCN, con productos gourmet e importados.",
            [
                new("Nacional 27 de Febrero", "Av. 27 de Febrero esq. Abraham Lincoln", 18.4571m, -69.9413m),
                new("Nacional Tiradentes", "Av. Tiradentes, Naco", 18.4781m, -69.9330m),
                new("Nacional Arroyo Hondo", "Av. República de Colombia, Arroyo Hondo", 18.4972m, -69.9470m),
                new("Nacional Bella Vista", "Av. Sarasota, Bella Vista", 18.4523m, -69.9468m),
                new("Nacional San Isidro", "Autopista de San Isidro, Santo Domingo Este", 18.4880m, -69.8320m),
            ]),
        new("Jumbo", "jumbo.png", "https://jumbo.com.do", "809-566-5866", SupermarketHours,
            "Hipermercados del Grupo CCN: supermercado y tienda por departamentos bajo un mismo techo.",
            [
                new("Jumbo Luperón", "Av. Luperón esq. Gustavo Mejía Ricart", 18.4437m, -69.9720m),
                new("Jumbo Galería 360", "Av. John F. Kennedy 62, Galería 360", 18.4857m, -69.9362m),
                new("Jumbo Megacentro", "Av. San Vicente de Paúl, Megacentro, Santo Domingo Este", 18.5072m, -69.8566m),
                new("Jumbo Av. Venezuela", "Av. Venezuela, Santo Domingo Este", 18.4940m, -69.8560m),
            ]),
        new("Supermercados Bravo", "bravo.png", "https://bravo.com.do", "809-227-1000", SupermarketHours,
            "Cadena dominicana de supermercados con precios competitivos y amplia red de sucursales.",
            [
                new("Bravo 27 de Febrero", "Av. 27 de Febrero esq. Caonabo", 18.4632m, -69.9130m),
                new("Bravo Núñez de Cáceres", "Av. Núñez de Cáceres, Mirador Norte", 18.4552m, -69.9560m),
                new("Bravo Av. Venezuela", "Av. Venezuela, Santo Domingo Este", 18.4925m, -69.8530m),
                new("Bravo Charles de Gaulle", "Av. Charles de Gaulle, Santo Domingo Norte", 18.5170m, -69.8370m),
            ]),
        new("La Sirena", "sirena.png", "https://lasirena.com.do", "809-616-1000", SupermarketHours,
            "La tienda por departamentos y supermercado del Grupo Ramos, presente en todo el país.",
            [
                new("La Sirena Churchill", "Av. Winston Churchill esq. 27 de Febrero", 18.4680m, -69.9400m),
                new("La Sirena Mella", "Av. Mella, Villa Francisca", 18.4780m, -69.8810m),
                new("La Sirena Av. Venezuela", "Av. Venezuela, Santo Domingo Este", 18.4930m, -69.8510m),
                new("La Sirena San Isidro", "Autopista de San Isidro, Santo Domingo Este", 18.4870m, -69.8280m),
                new("La Sirena Villa Mella", "Av. Hermanas Mirabal, Villa Mella", 18.5350m, -69.9100m),
            ]),
    ];

    private static readonly Chain[] Pharmacies =
    [
        new("Farmacia Carol", "carol.png", "https://farmaciacarol.com", "809-563-0000",
            "Abierto 24 horas",
            "Cadena de farmacias con servicio 24 horas, delivery y amplia red de sucursales.",
            [
                new("Carol 27 de Febrero", "Av. 27 de Febrero 241", 18.4680m, -69.9390m),
                new("Carol Naco", "Av. Tiradentes, Naco", 18.4770m, -69.9320m),
                new("Carol Bella Vista", "Av. Sarasota, Bella Vista", 18.4525m, -69.9440m),
                new("Carol Gazcue", "Av. Independencia, Gazcue", 18.4660m, -69.9050m),
            ]),
        new("Farmacias Los Hidalgos", "hidalgos.png", "https://farmacialoshidalgos.com", "809-537-7887", PharmacyHours,
            "Una de las cadenas de farmacias más grandes del país, con décadas sirviendo a la capital.",
            [
                new("Los Hidalgos Av. Duarte", "Av. Duarte, Villa Francisca", 18.4850m, -69.8980m),
                new("Los Hidalgos 27 de Febrero", "Av. 27 de Febrero, El Vergel", 18.4620m, -69.9300m),
                new("Los Hidalgos Los Mina", "Av. San Vicente de Paúl, Los Mina", 18.4970m, -69.8670m),
            ]),
        new("Farmacia GBC", "gbc.png", "https://www.farmaciagbc.com.do", "809-682-9000", PharmacyHours,
            "Cadena de farmacias dominicana con servicio a domicilio y programas de lealtad.",
            [
                new("GBC Av. Bolívar", "Av. Bolívar, La Julia", 18.4620m, -69.9180m),
                new("GBC Abraham Lincoln", "Av. Abraham Lincoln, Piantini", 18.4720m, -69.9440m),
                new("GBC Ensanche Ozama", "Av. Presidente Estrella Ureña, Ensanche Ozama", 18.4890m, -69.8600m),
            ]),
        new("Farmax", "farmax.png", "https://farmax.com.do", "809-334-3000", "Abierto 24 horas",
            "Farmacias modernas 24 horas con autoservicio, delivery y amplio surtido.",
            [
                new("Farmax Núñez de Cáceres", "Av. Núñez de Cáceres esq. Sarasota", 18.4530m, -69.9560m),
                new("Farmax 27 de Febrero", "Av. 27 de Febrero, La Esperilla", 18.4630m, -69.9210m),
                new("Farmax Independencia", "Av. Independencia, Zona Universitaria", 18.4590m, -69.9130m),
            ]),
    ];

    /// <summary>
    /// Idempotent: creates the "Supermercados" and "Farmacias" subcategories under
    /// "Tiendas", each with one "company" node per chain (logo + general info) and its
    /// branches as child places. Runs on every startup so existing installations pick it
    /// up without reseeding. The pre-chain flat place ("Farmacia Carol" under "Empresas
    /// y Servicios") is deleted.
    /// </summary>
    private bool EnsureShoppingChainsSeeded()
    {
        IContent? site = _contentService.GetRootContent().FirstOrDefault(c => c.ContentType.Alias == "site");
        if (site is null || Descendant(site, "city", "Santo Domingo") is not { } city)
        {
            return false;
        }

        IContent? tiendas = Descendant(city, "categoryPage", "Tiendas");
        if (tiendas is null)
        {
            return false;
        }

        bool seeded = false;

        if (Descendant(tiendas, "subcategory", "Supermercados") is null)
        {
            _logger.LogInformation("CityGuide: seeding supermarkets under 'Tiendas'");
            IContent supermercados = _contentService.Create("Supermercados", tiendas.Id, "subcategory");
            _contentService.Save(supermercados);
            SeedChainCompanies(supermercados.Id, GetOrCreateRootMediaFolder("Supermercados"),
                Supermarkets, ["Aire Acondicionado", "Parqueo"]);
            _contentService.PublishBranch(supermercados, PublishBranchFilter.IncludeUnpublished, ["*"]);
            seeded = true;
        }

        if (Descendant(tiendas, "subcategory", "Farmacias") is null)
        {
            _logger.LogInformation("CityGuide: seeding pharmacies under 'Tiendas'");

            if (Descendant(city, "categoryPage", "Empresas y Servicios") is { } servicios
                && Descendant(servicios, "place", "Farmacia Carol") is { } legacyFlat)
            {
                _contentService.Delete(legacyFlat);
            }

            IContent farmacias = _contentService.Create("Farmacias", tiendas.Id, "subcategory");
            _contentService.Save(farmacias);
            SeedChainCompanies(farmacias.Id, GetOrCreateRootMediaFolder("Farmacias"),
                Pharmacies, ["Aire Acondicionado", "Delivery"]);
            _contentService.PublishBranch(farmacias, PublishBranchFilter.IncludeUnpublished, ["*"]);
            seeded = true;
        }

        return seeded;
    }

    // ---- Malls (plazas comerciales) ----

    /// <summary>
    /// Idempotent, runs every startup: creates the "mall" document type (plaza comercial
    /// with its own location data; establishments grouped in child subcategories) if
    /// missing, and allows it under "subcategory" and "categoryPage" so existing
    /// installations pick it up.
    /// </summary>
    private async Task EnsureMallSchemaAsync()
    {
        IContentType? place = _contentTypeService.Get("place");
        IContentType? subcategory = _contentTypeService.Get("subcategory");
        if (place is null || subcategory is null)
        {
            return;
        }

        if (_contentTypeService.Get("mall") is null)
        {
            _logger.LogInformation("CityGuide: creating 'mall' document type");
            IDataType textstring = (await _dataTypeService.GetAsync(Constants.DataTypes.Guids.TextstringGuid))!;
            IDataType textarea = (await _dataTypeService.GetAsync(Constants.DataTypes.Guids.TextareaGuid))!;
            IDataType imagePicker = (await _dataTypeService.GetAsync(Constants.DataTypes.Guids.MediaPicker3SingleImageGuid))!;
            IDataType coordinate = await GetOrCreateDataTypeAsync(
                "CityGuide Coordinate", Constants.PropertyEditors.Aliases.Decimal,
                "Umb.PropertyEditorUi.Decimal", ValueStorageType.Decimal, configurationData: null);

            IContentType mall = NewContentType("mall", "Mall / Plaza Comercial", "icon-store");
            AddProperty(mall, "description", "Descripción", textarea, 1);
            AddProperty(mall, "address", "Dirección", textstring, 2);
            AddProperty(mall, "phone", "Teléfono", textstring, 3);
            AddProperty(mall, "website", "Sitio Web", textstring, 4);
            AddProperty(mall, "hours", "Horario", textarea, 5);
            AddProperty(mall, "photo", "Foto", imagePicker, 6);
            AddProperty(mall, "latitude", "Latitud", coordinate, 7);
            AddProperty(mall, "longitude", "Longitud", coordinate, 8);
            mall.AllowedContentTypes =
            [
                new ContentTypeSort(subcategory.Key, 0, subcategory.Alias),
                new ContentTypeSort(place.Key, 1, place.Alias),
            ];
            await CreateAsync(mall);
        }

        IContentType mallType = _contentTypeService.Get("mall")!;
        foreach (string parentAlias in new[] { "subcategory", "categoryPage" })
        {
            IContentType? parent = _contentTypeService.Get(parentAlias);
            if (parent is null || parent.AllowedContentTypes!.Any(c => c.Key == mallType.Key))
            {
                continue;
            }

            _logger.LogInformation("CityGuide: allowing 'mall' under '{Parent}'", parentAlias);
            int nextSort = parent.AllowedContentTypes!.Count();
            parent.AllowedContentTypes =
                [.. parent.AllowedContentTypes!, new ContentTypeSort(mallType.Key, nextSort, mallType.Alias)];
            Attempt<ContentTypeOperationStatus> attempt =
                await _contentTypeService.UpdateAsync(parent, Constants.Security.SuperUserKey);
            if (!attempt.Success)
            {
                throw new InvalidOperationException(
                    $"Failed to allow 'mall' under '{parentAlias}': {attempt.Result}");
            }
        }

        await EnsureMallAgentSchemaAsync(mallType);
        await EnsureMallEstablishmentsSchemaAsync(mallType);
    }

    /// <summary>
    /// Adds the "establishments" picker to the "mall" document type: the places that sit
    /// inside the plaza but are filed elsewhere in the tree — a bank branch under its
    /// company, a restaurant under its cuisine — referenced, never copied. Each one keeps
    /// its single home (and the data it inherits there) and the plaza still lists it.
    /// Guarded and run every startup so existing installations pick it up.
    /// </summary>
    private async Task EnsureMallEstablishmentsSchemaAsync(IContentType mall)
    {
        if (mall.PropertyTypeExists("establishments"))
        {
            return;
        }

        _logger.LogInformation("CityGuide: adding 'establishments' property to 'mall'");
        IDataType picker = await GetOrCreateDataTypeAsync(
            "CityGuide Establecimientos", Constants.PropertyEditors.Aliases.MultiNodeTreePicker,
            "Umb.PropertyEditorUi.ContentPicker", ValueStorageType.Ntext,
            new Dictionary<string, object>
            {
                ["startNode"] = new Dictionary<string, object> { ["type"] = "content" },
                ["minNumber"] = 0,
                ["maxNumber"] = 0,
            });

        AddProperty(mall, "establishments", "Establecimientos en la plaza", picker, 13);
        Attempt<ContentTypeOperationStatus> attempt =
            await _contentTypeService.UpdateAsync(mall, Constants.Security.SuperUserKey);
        if (!attempt.Success)
        {
            throw new InvalidOperationException(
                $"Failed to add 'establishments' to 'mall': {attempt.Result}");
        }
    }

    /// <summary>
    /// Adds the properties the agent needs to own plazas to the "mall" document type:
    /// the Google place id it dedupes by, the rating it refreshes and the source marker.
    /// Without them a discovered plaza can only be created as a "place", which is what
    /// left plaza duplicates next to the seeded malls. Guarded per property and run
    /// every startup so existing installations pick them up.
    /// </summary>
    private async Task EnsureMallAgentSchemaAsync(IContentType mall)
    {
        (string Alias, string Name, int Sort)[] missing =
            new[]
            {
                ("googlePlaceId", "Google Place ID", 9), ("source", "Fuente (manual | agent)", 10),
                ("googleRating", "Rating Google", 11), ("googleRatingCount", "Reseñas Google (cantidad)", 12),
            }
                .Where(p => !mall.PropertyTypeExists(p.Item1))
                .ToArray();
        if (missing.Length == 0)
        {
            return;
        }

        IDataType textstring = (await _dataTypeService.GetAsync(Constants.DataTypes.Guids.TextstringGuid))!;
        IDataType numeric = (await _dataTypeService.GetAsync(Constants.DataTypes.Guids.NumericGuid))!;
        IDataType rating = await GetOrCreateDataTypeAsync(
            "CityGuide Rating", Constants.PropertyEditors.Aliases.Decimal,
            "Umb.PropertyEditorUi.Decimal", ValueStorageType.Decimal, configurationData: null);

        foreach ((string alias, string name, int sort) in missing)
        {
            _logger.LogInformation("CityGuide: adding '{Alias}' property to 'mall'", alias);
            AddProperty(mall, alias, name, alias switch
            {
                "googleRating" => rating,
                "googleRatingCount" => numeric,
                _ => textstring,
            }, sort);
        }

        Attempt<ContentTypeOperationStatus> update =
            await _contentTypeService.UpdateAsync(mall, Constants.Security.SuperUserKey);
        if (!update.Success)
        {
            throw new InvalidOperationException(
                $"Failed to add agent properties to 'mall': {update.Result}");
        }
    }

    private sealed record MallStore(string Name, string Description, string Level);

    private sealed record MallGroup(string Name, MallStore[] Stores);

    private sealed record Mall(
        string Name, string Address, string Phone, string Website, string Hours,
        string Description, decimal Latitude, decimal Longitude, MallGroup[] Groups);

    private static readonly string MallHours = "Lun - Sáb 9:00AM - 9:00PM\nDom 11:00AM - 8:00PM";

    private static readonly Mall[] Malls =
    [
        new("Ágora Mall", "Av. John F. Kennedy esq. Abraham Lincoln, Naco", "809-363-2323",
            "https://agora.com.do", MallHours,
            "Centro comercial moderno en el corazón de Naco: moda, tecnología, food court y cine.",
            18.4826m, -69.9401m,
            [
                new("Moda", [
                    new("Zara", "Moda española para toda la familia.", "Nivel 1, Ágora Mall"),
                    new("Aldo", "Calzado y accesorios de tendencia.", "Nivel 1, Ágora Mall"),
                ]),
                new("Comida", [
                    new("Helados Bon", "La heladería dominicana de siempre.", "Food Court, Ágora Mall"),
                    new("Wing's To Go", "Alitas y picadera estilo americano.", "Food Court, Ágora Mall"),
                ]),
                new("Entretenimiento", [
                    new("Caribbean Cinemas Ágora", "Salas de cine con tecnología CXC.", "Nivel 4, Ágora Mall"),
                ]),
            ]),
        new("Blue Mall", "Av. Winston Churchill esq. Gustavo Mejía Ricart, Piantini", "809-955-3000",
            "https://bluemall.com.do", MallHours,
            "Centro comercial de lujo en Piantini: marcas internacionales premium y alta gastronomía.",
            18.4720m, -69.9410m,
            [
                new("Moda", [
                    new("Louis Vuitton", "Marroquinería y moda de lujo.", "Nivel 1, Blue Mall"),
                    new("Carolina Herrera", "Moda y fragancias de diseñador.", "Nivel 1, Blue Mall"),
                ]),
                new("Restaurantes", [
                    new("SBG", "Cocina internacional con terraza.", "Nivel 5, Blue Mall"),
                ]),
            ]),
        new("Sambil Santo Domingo", "Av. John F. Kennedy, Los Prados", "809-620-6000",
            "https://sambil.com.do", "Lun - Dom 10:00AM - 10:00PM",
            "Uno de los malls más grandes del país: tiendas, food court, cine y entretenimiento familiar.",
            18.4830m, -69.9119m,
            [
                new("Moda", [
                    new("Skechers", "Calzado deportivo y casual.", "Nivel 1, Sambil"),
                ]),
                new("Comida", [
                    new("KFC", "Pollo frito estilo americano.", "Food Court, Sambil"),
                    new("Burger King", "Hamburguesas a la parrilla.", "Food Court, Sambil"),
                ]),
                new("Entretenimiento", [
                    new("Caribbean Cinemas Sambil", "Cine con salas CXC y 4DX.", "Nivel 2, Sambil"),
                ]),
            ]),
        new("Galería 360", "Av. John F. Kennedy 62", "809-566-3360",
            "https://galeria360.com.do", MallHours,
            "Mall familiar sobre la Kennedy: tiendas, supermercado, cine y amplio food court.",
            18.4857m, -69.9362m,
            [
                new("Comida", [
                    new("Krispy Kreme", "Donas y café.", "Nivel 1, Galería 360"),
                ]),
                new("Servicios", [
                    new("Jumbo", "Supermercado y tienda por departamentos.", "Nivel 1, Galería 360"),
                ]),
                new("Entretenimiento", [
                    new("Caribbean Cinemas Galería 360", "Salas de cine en el segundo nivel.", "Nivel 2, Galería 360"),
                ]),
            ]),
        new("Acrópolis Center", "Av. Winston Churchill esq. Rafael Augusto Sánchez, Piantini", "809-955-2020",
            "https://acropoliscenter.com", MallHours,
            "Centro comercial y torre empresarial en Piantini con tiendas, restaurantes y cine.",
            18.4693m, -69.9399m, []),
        new("Downtown Center", "Av. Núñez de Cáceres esq. Rómulo Betancourt", "809-534-7873",
            "https://downtowncenter.com.do", MallHours,
            "Plaza comercial al oeste de la ciudad con cine, tiendas y zona gastronómica.",
            18.4541m, -69.9545m, []),
        new("Megacentro", "Av. San Vicente de Paúl, Santo Domingo Este", "809-236-3232",
            "https://megacentro.com.do", MallHours,
            "El mall de referencia de Santo Domingo Este: tiendas, bancos, food court y cine.",
            18.5072m, -69.8566m, []),
        new("Bella Vista Mall", "Av. Sarasota 62, Bella Vista", "809-255-0665",
            "https://bellavistamall.com.do", MallHours,
            "Mall de barrio consolidado en Bella Vista con tiendas, servicios y restaurantes.",
            18.4530m, -69.9450m, []),
    ];

    /// <summary>
    /// Idempotent: creates the "Plazas Comerciales y Malls" subcategory under "Tiendas"
    /// with one "mall" node per plaza (own location data) and its establishments grouped
    /// in child subcategories. Runs on every startup so existing installations pick it up
    /// without reseeding. The pre-mall flat place ("Ágora Mall") is deleted.
    /// </summary>
    private bool EnsureMallsSeeded()
    {
        if (_contentTypeService.Get("mall") is null)
        {
            return false;
        }

        IContent? site = _contentService.GetRootContent().FirstOrDefault(c => c.ContentType.Alias == "site");
        if (site is null)
        {
            return false;
        }

        IContent? tiendas = Descendant(site, "city", "Santo Domingo") is { } city
            ? Descendant(city, "categoryPage", "Tiendas")
            : null;
        if (tiendas is null || Descendant(tiendas, "subcategory", "Plazas Comerciales y Malls") is not null)
        {
            return false;
        }

        _logger.LogInformation("CityGuide: seeding malls under 'Tiendas'");

        if (Descendant(tiendas, "place", "Ágora Mall") is { } legacyFlat)
        {
            _contentService.Delete(legacyFlat);
        }

        IContent plazas = _contentService.Create("Plazas Comerciales y Malls", tiendas.Id, "subcategory");
        _contentService.Save(plazas);

        foreach (Mall mall in Malls)
        {
            IContent mallContent = _contentService.Create(mall.Name, plazas.Id, "mall");
            mallContent.SetValue("description", mall.Description);
            mallContent.SetValue("address", mall.Address);
            mallContent.SetValue("phone", mall.Phone);
            mallContent.SetValue("website", mall.Website);
            mallContent.SetValue("hours", mall.Hours);
            mallContent.SetValue("latitude", mall.Latitude);
            mallContent.SetValue("longitude", mall.Longitude);
            _contentService.Save(mallContent);

            foreach (MallGroup group in mall.Groups)
            {
                IContent groupContent = _contentService.Create(group.Name, mallContent.Id, "subcategory");
                _contentService.Save(groupContent);

                foreach (MallStore store in group.Stores)
                {
                    CreatePlace(groupContent.Id, store.Name, store.Description,
                        store.Level, string.Empty, string.Empty, 0m, 0m, []);
                }
            }
        }

        _contentService.PublishBranch(plazas, PublishBranchFilter.IncludeUnpublished, ["*"]);
        return true;
    }

    /// <summary>
    /// Idempotent, runs every startup: gives every chain "company" node its logo when it
    /// has none. Installations seeded while the SeedAssets images were missing from the
    /// publish output got their companies without a logo, and the branches inherit that
    /// emptiness, so a whole chain falls back to the section placeholder.
    /// </summary>
    private bool EnsureChainLogos()
    {
        if (_contentTypeService.Get("company") is not { } companyType)
        {
            return false;
        }

        var logos = new Dictionary<string, (string LogoFile, string Folder)>(StringComparer.OrdinalIgnoreCase)
        {
            ["Caribbean Cinemas"] = ("caribbean-cinemas.png", "Cines"),
        };
        foreach ((Chain[] Chains, string Folder) group in new[]
        {
            (Banks, "Bancos"), (Supermarkets, "Supermercados"), (Pharmacies, "Farmacias"),
        })
        {
            foreach (Chain chain in group.Chains)
            {
                logos[chain.Name] = (chain.LogoFile, group.Folder);
            }
        }

        bool changed = false;
        foreach (IContent company in _contentService.GetPagedOfType(companyType.Id, 0, 500, out _, filter: null!))
        {
            if (!string.IsNullOrWhiteSpace(company.GetValue<string>("photo"))
                || company.Name is not { } name
                || !logos.TryGetValue(name, out (string LogoFile, string Folder) logo)
                || CreateLogoMedia(GetOrCreateRootMediaFolder(logo.Folder), name, logo.LogoFile)
                    is not { } photoValue)
            {
                continue;
            }

            _logger.LogInformation("CityGuide: restoring missing logo for '{Name}'", name);
            company.SetValue("photo", photoValue);
            _contentService.Save(company);
            _contentService.Publish(company, ["*"]);
            changed = true;
        }

        return changed;
    }

    private IContent? Descendant(IContent parent, string contentTypeAlias, string name) =>
        _contentService
            .GetPagedChildren(parent.Id, 0, 100, out _, null, null, null, false)
            .FirstOrDefault(c => c.ContentType.Alias == contentTypeAlias
                && string.Equals(c.Name, name, StringComparison.OrdinalIgnoreCase));

    /// <summary>Creates an image media item from SeedAssets and returns a MediaPicker3 value, or null.</summary>
    private string? CreateLogoMedia(IMedia folder, string name, string logoFile) =>
        CreateSeedMedia(folder, $"Logo {name}", logoFile);

    /// <summary>Imports a SeedAssets file into the Media library; returns a MediaPicker3 value.</summary>
    private string? CreateSeedMedia(IMedia folder, string mediaName, string assetFile)
    {
        string path = Path.Combine(_hostEnvironment.ContentRootPath, "CityGuide", "SeedAssets", assetFile);
        if (!System.IO.File.Exists(path))
        {
            _logger.LogWarning("CityGuide: seed asset not found, '{Name}' seeded without it: {Path}", mediaName, path);
            return null;
        }

        IMedia media = _mediaService.CreateMedia(mediaName, folder.Id, Constants.Conventions.MediaTypes.Image);
        using (FileStream stream = System.IO.File.OpenRead(path))
        {
            media.SetValue(_mediaFileManager, _mediaUrlGenerators, _shortStringHelper,
                _contentTypeBaseServiceProvider, Constants.Conventions.Media.File, Path.GetFileName(assetFile), stream);
        }

        _mediaService.Save(media);
        return JsonSerializer.Serialize(new[] { new { key = Guid.NewGuid(), mediaKey = media.Key } });
    }
}
