using NPoco;
using Umbraco.Cms.Infrastructure.Scoping;

namespace CityGuideWeb.CityGuide;

/// <summary>What a review may hold, shared by the endpoint that validates it and the table that stores it.</summary>
public static class ReviewRules
{
    public const int MinRating = 1;
    public const int MaxRating = 5;
    public const int MaxComment = 2000;
    public const int MaxName = 60;

    /// <summary>
    /// The document types a visitor can rate and keep: an establishment, which is what
    /// Google rates too. A company is its branches, and a tour is an outing, not a place.
    /// </summary>
    public static readonly IReadOnlySet<string> PlaceTypes = new HashSet<string> { "place", "mall" };
}

/// <summary>The portal's own rating of a place: the mean of its visible reviews and how many there are.</summary>
public record ReviewSummary(double Average, int Count);

/// <summary>
/// Reads and writes the two user-content tables (<see cref="ReviewRow"/>,
/// <see cref="FavoriteRow"/>). Every listing card shows the portal's rating beside
/// Google's, so the per-place summaries are held in memory and rebuilt only after a
/// write — the same trade <see cref="NearbyIndex"/> makes for the map.
/// </summary>
public sealed class ReviewStore
{
    private readonly IScopeProvider _scopeProvider;
    private readonly object _summariesLock = new();
    private IReadOnlyDictionary<Guid, ReviewSummary>? _summaries;

    public ReviewStore(IScopeProvider scopeProvider) => _scopeProvider = scopeProvider;

    private sealed class SummaryRow
    {
        [Column("placeKey")]
        public Guid PlaceKey { get; set; }

        [Column("reviewCount")]
        public int ReviewCount { get; set; }

        [Column("average")]
        public double Average { get; set; }
    }

    /// <summary>Drops the cached summaries; the next read rebuilds them.</summary>
    public void Invalidate()
    {
        lock (_summariesLock)
        {
            _summaries = null;
        }
    }

    /// <summary>Every place with at least one visible review.</summary>
    public IReadOnlyDictionary<Guid, ReviewSummary> Summaries()
    {
        lock (_summariesLock)
        {
            if (_summaries is not null)
            {
                return _summaries;
            }
        }

        using IScope scope = _scopeProvider.CreateScope(autoComplete: true);
        List<SummaryRow> rows = scope.Database.Fetch<SummaryRow>(
            $"SELECT placeKey, COUNT(*) AS reviewCount, AVG(CAST(rating AS FLOAT)) AS average " +
            $"FROM {ReviewRow.Table} WHERE hidden = @0 AND authorBlocked = @0 GROUP BY placeKey",
            false);
        var summaries = rows.ToDictionary(
            r => r.PlaceKey,
            r => new ReviewSummary(Math.Round(r.Average, 1), r.ReviewCount));

        lock (_summariesLock)
        {
            _summaries = summaries;
        }

        return summaries;
    }

    /// <summary>The visible reviews of one place, newest first.</summary>
    public List<ReviewRow> ForPlace(Guid placeKey, int max = 200)
    {
        using IScope scope = _scopeProvider.CreateScope(autoComplete: true);
        return scope.Database.SkipTake<ReviewRow>(
            0,
            max,
            scope.SqlContext.Sql()
                .SelectAll()
                .From<ReviewRow>()
                .Where<ReviewRow>(r => r.PlaceKey == placeKey && !r.Hidden && !r.AuthorBlocked)
                .OrderByDescending<ReviewRow>(r => r.UpdatedUtc));
    }

    /// <summary>The member's own review of the place, hidden or not: it is theirs to edit.</summary>
    public ReviewRow? Find(Guid placeKey, Guid memberKey)
    {
        using IScope scope = _scopeProvider.CreateScope(autoComplete: true);
        return scope.Database.FirstOrDefault<ReviewRow>(
            scope.SqlContext.Sql()
                .SelectAll()
                .From<ReviewRow>()
                .Where<ReviewRow>(r => r.PlaceKey == placeKey && r.MemberKey == memberKey));
    }

    /// <summary>
    /// Writes the member's review of the place, replacing the one they already had.
    /// Editing a review an editor hid does not bring it back: that is the editor's call.
    /// </summary>
    public ReviewRow Save(Guid placeKey, Guid memberKey, string authorName, int rating, string? comment)
    {
        DateTime now = DateTime.UtcNow;
        using IScope scope = _scopeProvider.CreateScope();
        ReviewRow? row = scope.Database.FirstOrDefault<ReviewRow>(
            scope.SqlContext.Sql()
                .SelectAll()
                .From<ReviewRow>()
                .Where<ReviewRow>(r => r.PlaceKey == placeKey && r.MemberKey == memberKey));

        if (row is null)
        {
            row = new ReviewRow { PlaceKey = placeKey, MemberKey = memberKey, CreatedUtc = now };
            Apply(row);
            scope.Database.Insert(row);
        }
        else
        {
            Apply(row);
            scope.Database.Update(row);
        }

        scope.Complete();
        Invalidate();
        return row;

        void Apply(ReviewRow target)
        {
            target.AuthorName = authorName;
            target.Rating = rating;
            target.Comment = string.IsNullOrEmpty(comment) ? null : comment;
            target.UpdatedUtc = now;
        }
    }

    public bool Delete(Guid placeKey, Guid memberKey)
    {
        using IScope scope = _scopeProvider.CreateScope();
        int deleted = scope.Database.Delete<ReviewRow>(
            scope.SqlContext.Sql().Where<ReviewRow>(r => r.PlaceKey == placeKey && r.MemberKey == memberKey));
        scope.Complete();
        Invalidate();
        return deleted > 0;
    }

    /// <summary>Hides or restores one review, for the moderation dashboard. False when there is no such review.</summary>
    public bool SetHidden(int id, bool hidden)
    {
        using IScope scope = _scopeProvider.CreateScope();
        int updated = scope.Database.Execute(
            $"UPDATE {ReviewRow.Table} SET hidden = @0 WHERE id = @1", hidden, id);
        scope.Complete();
        Invalidate();
        return updated > 0;
    }

    /// <summary>
    /// Copies a member's name and standing onto every review they wrote. Returns how
    /// many reviews changed, so the caller only tells the frontend when one did.
    /// </summary>
    public int SyncAuthor(Guid memberKey, string authorName, bool blocked)
    {
        using IScope scope = _scopeProvider.CreateScope();
        int updated = scope.Database.Execute(
            $"UPDATE {ReviewRow.Table} SET authorName = @1, authorBlocked = @2 " +
            "WHERE memberKey = @0 AND (authorName <> @1 OR authorBlocked <> @2)",
            memberKey, authorName, blocked);
        scope.Complete();
        if (updated > 0)
        {
            Invalidate();
        }

        return updated;
    }

    /// <summary>A member deleted from the backoffice takes their reviews and their list with them.</summary>
    public int DeleteMember(Guid memberKey)
    {
        using IScope scope = _scopeProvider.CreateScope();
        int reviews = scope.Database.Delete<ReviewRow>(
            scope.SqlContext.Sql().Where<ReviewRow>(r => r.MemberKey == memberKey));
        scope.Database.Delete<FavoriteRow>(
            scope.SqlContext.Sql().Where<FavoriteRow>(f => f.MemberKey == memberKey));
        scope.Complete();
        Invalidate();
        return reviews;
    }

    /// <summary>Every review the member wrote, hidden ones included: what a data export owes them.</summary>
    public List<ReviewRow> ForMember(Guid memberKey)
    {
        using IScope scope = _scopeProvider.CreateScope(autoComplete: true);
        return scope.Database.Fetch<ReviewRow>(
            scope.SqlContext.Sql()
                .SelectAll()
                .From<ReviewRow>()
                .Where<ReviewRow>(r => r.MemberKey == memberKey)
                .OrderByDescending<ReviewRow>(r => r.UpdatedUtc));
    }

    /// <summary>The member's list with the date each place was saved, newest first.</summary>
    public List<FavoriteRow> FavoriteRows(Guid memberKey)
    {
        using IScope scope = _scopeProvider.CreateScope(autoComplete: true);
        return scope.Database.Fetch<FavoriteRow>(
            scope.SqlContext.Sql()
                .SelectAll()
                .From<FavoriteRow>()
                .Where<FavoriteRow>(f => f.MemberKey == memberKey)
                .OrderByDescending<FavoriteRow>(f => f.CreatedUtc));
    }

    /// <summary>The newest reviews of the whole portal, hidden ones included, for moderation.</summary>
    public (List<ReviewRow> Items, long Total) Latest(int skip, int take)
    {
        using IScope scope = _scopeProvider.CreateScope(autoComplete: true);
        long total = scope.Database.ExecuteScalar<long>($"SELECT COUNT(*) FROM {ReviewRow.Table}");
        List<ReviewRow> items = scope.Database.SkipTake<ReviewRow>(
            skip,
            take,
            scope.SqlContext.Sql()
                .SelectAll()
                .From<ReviewRow>()
                .OrderByDescending<ReviewRow>(r => r.UpdatedUtc));
        return (items, total);
    }

    public bool IsFavorite(Guid memberKey, Guid placeKey)
    {
        using IScope scope = _scopeProvider.CreateScope(autoComplete: true);
        return scope.Database.ExecuteScalar<int>(
            $"SELECT COUNT(*) FROM {FavoriteRow.Table} WHERE memberKey = @0 AND placeKey = @1",
            memberKey, placeKey) > 0;
    }

    /// <summary>Adds or removes a place from the member's list; doing either twice is harmless.</summary>
    public void SetFavorite(Guid memberKey, Guid placeKey, bool favorite)
    {
        using IScope scope = _scopeProvider.CreateScope();
        bool exists = scope.Database.ExecuteScalar<int>(
            $"SELECT COUNT(*) FROM {FavoriteRow.Table} WHERE memberKey = @0 AND placeKey = @1",
            memberKey, placeKey) > 0;
        if (favorite && !exists)
        {
            scope.Database.Insert(new FavoriteRow
            {
                MemberKey = memberKey,
                PlaceKey = placeKey,
                CreatedUtc = DateTime.UtcNow,
            });
        }
        else if (!favorite && exists)
        {
            scope.Database.Delete<FavoriteRow>(
                scope.SqlContext.Sql().Where<FavoriteRow>(f => f.MemberKey == memberKey && f.PlaceKey == placeKey));
        }

        scope.Complete();
    }

    /// <summary>The member's list, newest first.</summary>
    public List<Guid> Favorites(Guid memberKey) =>
        FavoriteRows(memberKey).Select(f => f.PlaceKey).ToList();
}
