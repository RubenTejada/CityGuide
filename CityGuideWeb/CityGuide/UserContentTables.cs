using NPoco;
using Umbraco.Cms.Core;
using Umbraco.Cms.Core.Events;
using Umbraco.Cms.Core.Migrations;
using Umbraco.Cms.Core.Notifications;
using Umbraco.Cms.Core.Scoping;
using Umbraco.Cms.Core.Services;
using Umbraco.Cms.Infrastructure.Migrations;
using Umbraco.Cms.Infrastructure.Migrations.Upgrade;
using Umbraco.Cms.Infrastructure.Persistence.DatabaseAnnotations;

namespace CityGuideWeb.CityGuide;

/// <summary>
/// One visitor's opinion of one establishment: a star rating and, optionally, a few
/// words. A member writes at most one per place and edits it rather than adding
/// another, which the unique index enforces.
///
/// Reviews are not content nodes: they are written by the public, thousands of them,
/// and a node each would drag versions, the content cache and the Delivery API index
/// along for data no editor authors. They live in a table of their own in the CMS
/// database, next to the members who wrote them.
///
/// <see cref="AuthorName"/> and <see cref="AuthorBlocked"/> copy what the member node
/// says, so reading a page of reviews never touches the member tables; the copy is
/// kept in step by <see cref="MemberReviewSync"/> whenever a member is saved.
/// </summary>
[TableName(Table)]
[PrimaryKey("id", AutoIncrement = true)]
[ExplicitColumns]
public class ReviewRow
{
    public const string Table = "cityGuideReview";

    [Column("id")]
    [PrimaryKeyColumn(AutoIncrement = true, IdentitySeed = 1)]
    public int Id { get; set; }

    [Column("placeKey")]
    [Index(IndexTypes.UniqueNonClustered, Name = "IX_cityGuideReview_placeMember", ForColumns = "placeKey,memberKey")]
    public Guid PlaceKey { get; set; }

    [Column("memberKey")]
    [Index(IndexTypes.NonClustered, Name = "IX_cityGuideReview_member")]
    public Guid MemberKey { get; set; }

    [Column("authorName")]
    [Length(100)]
    public string AuthorName { get; set; } = string.Empty;

    [Column("rating")]
    public int Rating { get; set; }

    [Column("comment")]
    [Length(ReviewRules.MaxComment)]
    [NullSetting(NullSetting = NullSettings.Null)]
    public string? Comment { get; set; }

    [Column("createdUtc")]
    public DateTime CreatedUtc { get; set; }

    [Column("updatedUtc")]
    public DateTime UpdatedUtc { get; set; }

    /// <summary>An editor took this one review down from the backoffice.</summary>
    [Column("hidden")]
    public bool Hidden { get; set; }

    /// <summary>The member is no longer approved, or is locked out: every review they wrote is off.</summary>
    [Column("authorBlocked")]
    public bool AuthorBlocked { get; set; }
}

/// <summary>A place a member keeps in their list. Unique per member and place.</summary>
[TableName(Table)]
[PrimaryKey("id", AutoIncrement = true)]
[ExplicitColumns]
public class FavoriteRow
{
    public const string Table = "cityGuideFavorite";

    [Column("id")]
    [PrimaryKeyColumn(AutoIncrement = true, IdentitySeed = 1)]
    public int Id { get; set; }

    [Column("memberKey")]
    [Index(IndexTypes.UniqueNonClustered, Name = "IX_cityGuideFavorite_memberPlace", ForColumns = "memberKey,placeKey")]
    public Guid MemberKey { get; set; }

    [Column("placeKey")]
    public Guid PlaceKey { get; set; }

    [Column("createdUtc")]
    public DateTime CreatedUtc { get; set; }
}

/// <summary>Creates both tables on an installation that does not have them yet.</summary>
public class CreateUserContentTables : AsyncMigrationBase
{
    public CreateUserContentTables(IMigrationContext context)
        : base(context)
    {
    }

    protected override Task MigrateAsync()
    {
        if (!TableExists(ReviewRow.Table))
        {
            Create.Table<ReviewRow>().Do();
        }

        if (!TableExists(FavoriteRow.Table))
        {
            Create.Table<FavoriteRow>().Do();
        }

        return Task.CompletedTask;
    }
}

/// <summary>
/// Runs the plan above on startup. Umbraco records the state a plan reached in its
/// key-value table, so an installation that already has the tables skips it for
/// free, and a later step is added as one more <c>To&lt;…&gt;</c> transition.
/// </summary>
public class UserContentMigration : INotificationAsyncHandler<UmbracoApplicationStartingNotification>
{
    private readonly ICoreScopeProvider _scopeProvider;
    private readonly IMigrationPlanExecutor _executor;
    private readonly IKeyValueService _keyValueService;
    private readonly IRuntimeState _runtimeState;

    public UserContentMigration(
        ICoreScopeProvider scopeProvider,
        IMigrationPlanExecutor executor,
        IKeyValueService keyValueService,
        IRuntimeState runtimeState)
    {
        _scopeProvider = scopeProvider;
        _executor = executor;
        _keyValueService = keyValueService;
        _runtimeState = runtimeState;
    }

    public async Task HandleAsync(UmbracoApplicationStartingNotification notification, CancellationToken cancellationToken)
    {
        // An install or an upgrade still in progress has no database to migrate yet.
        if (_runtimeState.Level < RuntimeLevel.Run)
        {
            return;
        }

        var plan = new MigrationPlan("CityGuide.UserContent");
        plan.From(string.Empty).To<CreateUserContentTables>("user-content-tables");
        await new Upgrader(plan).ExecuteAsync(_executor, _scopeProvider, _keyValueService);
    }
}
