using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Caching.Memory;
using Umbraco.Cms.Core;
using Umbraco.Cms.Core.Mail;
using Umbraco.Cms.Core.Models;
using Umbraco.Cms.Core.Models.Email;
using Umbraco.Cms.Core.Services;

namespace CityGuideWeb.CityGuide;

/// <summary>
/// The member side of a visitor's session, called by the portal's server alone
/// (<see cref="PortalApiAttribute"/>). The portal runs the sign-in itself — the Google
/// round trip, the session cookie — and comes here for the one thing it cannot own:
/// who the visitor is in the CMS. Sign-in finds the member by the proven email address
/// or creates one; the email link is issued and redeemed here because this is where
/// the mail server is.
/// </summary>
[ApiController]
[Route("api/account")]
[PortalApi]
public class AccountController : ControllerBase
{
    /// <summary>How long an emailed sign-in link works.</summary>
    private static readonly TimeSpan LinkLifetime = TimeSpan.FromMinutes(30);

    /// <summary>Links one address may ask for per hour: enough to retry, not to flood an inbox.</summary>
    private const int LinksPerHour = 5;

    private static readonly Regex EmailPattern = new(@"^[^@\s]+@[^@\s]+\.[^@\s]+$", RegexOptions.Compiled);

    private readonly IMemberService _memberService;
    private readonly IContentService _contentService;
    private readonly ReviewStore _store;
    private readonly IMemoryCache _cache;
    private readonly IEmailSender _emailSender;
    private readonly IConfiguration _configuration;
    private readonly ILogger<AccountController> _logger;

    public AccountController(
        IMemberService memberService,
        IContentService contentService,
        ReviewStore store,
        IMemoryCache cache,
        IEmailSender emailSender,
        IConfiguration configuration,
        ILogger<AccountController> logger)
    {
        _memberService = memberService;
        _contentService = contentService;
        _store = store;
        _cache = cache;
        _emailSender = emailSender;
        _configuration = configuration;
        _logger = logger;
    }

    public record SignInRequest(string? Email, string? Name, string? Locale);

    public record LoginLinkRequest(string? Email, string? Name, string? Link, string? Locale);

    public record RedeemRequest(string? Token, string? Locale);

    /// <summary>What the portal keeps in its session cookie: the key it acts with and the name it shows.</summary>
    public record MemberInfo(Guid Key, string Name);

    /// <summary>What an issued link stands for until it is redeemed or expires.</summary>
    private sealed record PendingLink(string Email, string Name);

    /// <summary>
    /// Google has proven the address (the portal only calls this with a verified one):
    /// find the member or create it. The name Google gives is used only when the
    /// member is created, so a visitor's own choice of name is never overwritten.
    /// </summary>
    [HttpPost("sign-in")]
    public IActionResult SignIn([FromBody] SignInRequest request)
    {
        bool english = request.Locale == "en";
        string email = NormalizeEmail(request.Email);
        if (!EmailPattern.IsMatch(email))
        {
            return BadRequest(new { error = english ? "That account has no valid email." : "Esa cuenta no tiene un correo válido." });
        }

        return Enter(email, PublicForms.Clean(request.Name, ReviewRules.MaxName), rename: false, english);
    }

    /// <summary>
    /// Emails a one-time sign-in link. <c>Link</c> is the portal page that redeems it;
    /// the token is appended to it. The visitor gets the same answer whether or not the
    /// address has an account, so the form tells nobody who is registered.
    /// </summary>
    [HttpPost("login-link")]
    public async Task<IActionResult> LoginLink([FromBody] LoginLinkRequest request)
    {
        bool english = request.Locale == "en";
        string email = NormalizeEmail(request.Email);
        string name = PublicForms.Clean(request.Name, ReviewRules.MaxName);

        if (!EmailPattern.IsMatch(email))
        {
            return BadRequest(new { error = english ? "Write a valid email address." : "Escribe un correo válido." });
        }

        if (name.Length < 2)
        {
            return BadRequest(new { error = english ? "Write your name." : "Escribe tu nombre." });
        }

        if (!Uri.TryCreate(request.Link, UriKind.Absolute, out Uri? link)
            || (link.Scheme != Uri.UriSchemeHttps && link.Scheme != Uri.UriSchemeHttp))
        {
            return BadRequest(new { error = "link" });
        }

        string? from = _configuration["Umbraco:CMS:Global:Smtp:From"];
        if (string.IsNullOrWhiteSpace(from) || !_emailSender.CanSendRequiredEmail())
        {
            _logger.LogWarning("CityGuide: sign-in link requested but SMTP is not configured");
            return StatusCode(503, new
            {
                error = english
                    ? "Signing in by email is not available right now. Use Google instead."
                    : "El acceso por correo no está disponible ahora mismo. Usa Google.",
            });
        }

        if (!PublicForms.WithinRateLimit(_cache, "login-link", email, LinksPerHour)
            || !PublicForms.WithinRateLimit(_cache, "login-link-address", PublicForms.ClientAddress(HttpContext), LinksPerHour * 2))
        {
            return StatusCode(429, new
            {
                error = english
                    ? "We already sent you several links. Check your inbox or try again in a while."
                    : "Ya te enviamos varios enlaces. Revisa tu correo o inténtalo en un rato.",
            });
        }

        string token = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32))
            .TrimEnd('=').Replace('+', '-').Replace('/', '_');
        _cache.Set(LinkKey(token), new PendingLink(email, name), LinkLifetime);

        string separator = string.IsNullOrEmpty(link.Query) ? "?" : "&";
        string url = $"{link}{separator}token={token}";

        string body = english
            ? new StringBuilder()
                .AppendLine($"Hi {name},")
                .AppendLine()
                .AppendLine("Open this link to sign in to QueHacerRD.com:")
                .AppendLine(url)
                .AppendLine()
                .AppendLine($"It works once and expires in {LinkLifetime.TotalMinutes:0} minutes. "
                    + "If you did not ask for it, ignore this email: nobody can sign in without it.")
                .AppendLine()
                .AppendLine("— QueHacerRD.com")
                .ToString()
            : new StringBuilder()
                .AppendLine($"Hola {name}:")
                .AppendLine()
                .AppendLine("Abre este enlace para entrar en QueHacerRD.com:")
                .AppendLine(url)
                .AppendLine()
                .AppendLine($"Sirve una sola vez y caduca en {LinkLifetime.TotalMinutes:0} minutos. "
                    + "Si no lo pediste, ignora este correo: sin él nadie puede entrar.")
                .AppendLine()
                .AppendLine("— QueHacerRD.com")
                .ToString();

        try
        {
            await _emailSender.SendAsync(
                new EmailMessage(
                    from, [email], cc: null, bcc: null, replyTo: null,
                    english ? "Your sign-in link to QueHacerRD.com" : "Tu enlace para entrar en QueHacerRD.com",
                    body, isBodyHtml: false, attachments: null),
                Constants.Web.EmailTypes.Notification);
        }
        catch (Exception exception)
        {
            _cache.Remove(LinkKey(token));
            _logger.LogWarning(exception, "CityGuide: sign-in link could not be sent");
            return StatusCode(503, new
            {
                error = english
                    ? "We could not send the email. Please try again later."
                    : "No pudimos enviar el correo. Inténtalo más tarde.",
            });
        }

        return Ok(new { ok = true });
    }

    /// <summary>
    /// Trades a link for a member, once: the token is removed before anything else, so a
    /// second click — or a forwarded email — finds nothing. The name typed when asking
    /// for the link becomes the member's name, since only the owner of the inbox gets here.
    /// </summary>
    [HttpPost("login-link/redeem")]
    public IActionResult Redeem([FromBody] RedeemRequest request)
    {
        bool english = request.Locale == "en";
        string token = PublicForms.Clean(request.Token, 100);
        string key = LinkKey(token);
        if (token.Length == 0 || !_cache.TryGetValue(key, out PendingLink? pending) || pending is null)
        {
            return BadRequest(new
            {
                error = english
                    ? "This link has already been used or has expired. Ask for a new one."
                    : "Este enlace ya se usó o caducó. Pide uno nuevo.",
            });
        }

        _cache.Remove(key);
        return Enter(pending.Email, pending.Name, rename: true, english);
    }

    /// <summary>The places the member keeps, newest first.</summary>
    [HttpGet("{memberKey:guid}/favorites")]
    public IActionResult Favorites(Guid memberKey) =>
        MemberAccounts.Active(_memberService, memberKey) is null
            ? NotFound()
            : Ok(_store.Favorites(memberKey));

    [HttpPut("{memberKey:guid}/favorites/{placeKey:guid}")]
    public IActionResult AddFavorite(Guid memberKey, Guid placeKey)
    {
        if (MemberAccounts.Active(_memberService, memberKey) is null || !IsRateablePlace(_contentService, placeKey))
        {
            return NotFound();
        }

        _store.SetFavorite(memberKey, placeKey, favorite: true);
        return Ok(new { favorite = true });
    }

    [HttpDelete("{memberKey:guid}/favorites/{placeKey:guid}")]
    public IActionResult RemoveFavorite(Guid memberKey, Guid placeKey)
    {
        if (MemberAccounts.Active(_memberService, memberKey) is null)
        {
            return NotFound();
        }

        _store.SetFavorite(memberKey, placeKey, favorite: false);
        return Ok(new { favorite = false });
    }

    /// <summary>
    /// Everything the portal holds about the member, for them to take away (the right of
    /// access in Ley 172-13). A suspended member is still owed it, so only existence is
    /// checked. Place names are read now; a place since deleted keeps only its key.
    /// </summary>
    [HttpGet("{memberKey:guid}/export")]
    public IActionResult Export(Guid memberKey)
    {
        IMember? member = _memberService.GetById(memberKey);
        if (member is null)
        {
            return NotFound();
        }

        List<ReviewRow> reviews = _store.ForMember(memberKey);
        List<FavoriteRow> favorites = _store.FavoriteRows(memberKey);
        Dictionary<Guid, string?> places = _contentService
            .GetByIds(reviews.Select(r => r.PlaceKey).Concat(favorites.Select(f => f.PlaceKey)).Distinct())
            .ToDictionary(c => c.Key, c => c.Name);

        return Ok(new
        {
            exportedUtc = DateTime.UtcNow,
            account = new
            {
                name = member.Name,
                email = member.Email,
                createdUtc = member.CreateDate.ToUniversalTime(),
                lastSignInUtc = member.LastLoginDate?.ToUniversalTime(),
                suspended = MemberAccounts.IsBlocked(member),
            },
            reviews = reviews.Select(r => new
            {
                placeKey = r.PlaceKey,
                place = places.GetValueOrDefault(r.PlaceKey),
                r.Rating,
                r.Comment,
                createdUtc = ReviewsController.Utc(r.CreatedUtc),
                updatedUtc = ReviewsController.Utc(r.UpdatedUtc),
                hiddenByModerator = r.Hidden,
            }),
            favorites = favorites.Select(f => new
            {
                placeKey = f.PlaceKey,
                place = places.GetValueOrDefault(f.PlaceKey),
                savedUtc = ReviewsController.Utc(f.CreatedUtc),
            }),
        });
    }

    /// <summary>
    /// Deletes the member at their own request. Their reviews and favourites go with it
    /// (<see cref="MemberReviewSync"/>, the same path an editor's delete takes), and a
    /// suspended member may do it too: erasure is not a privilege of good standing.
    /// </summary>
    [HttpDelete("{memberKey:guid}")]
    public IActionResult DeleteAccount(Guid memberKey)
    {
        IMember? member = _memberService.GetById(memberKey);
        if (member is null)
        {
            return NotFound();
        }

        _memberService.Delete(member);
        _logger.LogInformation("CityGuide: member {Key} deleted their account", memberKey);
        return Ok(new { ok = true });
    }

    /// <summary>A published establishment of a type visitors can rate and keep.</summary>
    internal static bool IsRateablePlace(IContentService contentService, Guid placeKey)
    {
        IContent? place = contentService.GetById(placeKey);
        return place is not null && place.Published && ReviewRules.PlaceTypes.Contains(place.ContentType.Alias);
    }

    /// <summary>Finds or creates the member for a proven address, refusing a blocked one.</summary>
    private IActionResult Enter(string email, string name, bool rename, bool english)
    {
        IMember? member = _memberService.GetByEmail(email);
        if (member is null)
        {
            member = _memberService.CreateMemberWithIdentity(
                email, email, name.Length > 0 ? name : email.Split('@')[0], Constants.Conventions.MemberTypes.DefaultAlias);
            member.IsApproved = true;
        }
        else if (MemberAccounts.IsBlocked(member))
        {
            return StatusCode(403, new
            {
                error = english
                    ? "This account has been suspended. Write to us through the contact form if you think it is a mistake."
                    : "Esta cuenta está suspendida. Escríbenos desde el formulario de contacto si crees que es un error.",
            });
        }
        else if (rename && name.Length > 0)
        {
            member.Name = name;
        }

        member.LastLoginDate = DateTime.UtcNow;
        _memberService.Save(member);
        return Ok(new MemberInfo(member.Key, member.Name ?? string.Empty));
    }

    private static string NormalizeEmail(string? email) => PublicForms.Clean(email, 200).ToLowerInvariant();

    /// <summary>Only the token's hash is kept, so the cache holds nothing a reader could use.</summary>
    private static string LinkKey(string token) =>
        "login-link-token:" + Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token)));
}
