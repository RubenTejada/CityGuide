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
/// The public contact form: general enquiries and requests to add or remove a business
/// from the portal. A message becomes an unpublished "contactMessage" node under the
/// inbox the seeder creates, so editors read it in the backoffice and nothing personal
/// ever reaches the Delivery API (which only serves published content). No mail server
/// is involved — the backoffice is the inbox.
/// </summary>
[ApiController]
[Route("api/contact")]
public class ContactController : ControllerBase
{
    /// <summary>The requests the form offers; anything else is rejected.</summary>
    private static readonly string[] RequestTypes =
    [
        "Consulta general", "Agregar mi negocio", "Quitar mi negocio",
        "Publicidad en el sitio",
    ];

    /// <summary>One sender may file a handful of messages per hour, not a flood.</summary>
    private const int MaxPerHour = 5;

    private const int MaxMessage = 4000;

    /// <summary>Shape check only — the address is proven by the reply reaching it.</summary>
    private static readonly Regex EmailPattern =
        new(@"^[^@\s]+@[^@\s]+\.[^@\s]+$", RegexOptions.Compiled);

    private readonly IContentService _contentService;
    private readonly IContentTypeService _contentTypeService;
    private readonly IMemoryCache _cache;
    private readonly IEmailSender _emailSender;
    private readonly IConfiguration _configuration;
    private readonly ILogger<ContactController> _logger;

    public ContactController(
        IContentService contentService,
        IContentTypeService contentTypeService,
        IMemoryCache cache,
        IEmailSender emailSender,
        IConfiguration configuration,
        ILogger<ContactController> logger)
    {
        _contentService = contentService;
        _contentTypeService = contentTypeService;
        _cache = cache;
        _emailSender = emailSender;
        _configuration = configuration;
        _logger = logger;
    }

    /// <summary>
    /// Every field is optional at the binding level and checked in
    /// <see cref="Validate"/>: a missing one is a message the visitor can fix, not a
    /// framework 400 in English.
    /// </summary>
    public record ContactRequest(
        string? RequestType, string? Name, string? Email, string? Phone,
        string? BusinessName, string? BusinessUrl, string? Message,
        /// <summary>Honeypot: a real visitor never sees this field, so a filled one is a bot.</summary>
        string? Website);

    [HttpPost]
    public async Task<IActionResult> Post([FromBody] ContactRequest request)
    {
        // A bot that filled the honeypot is answered like everyone else: telling it
        // apart is what lets it find the shape that gets through.
        if (!string.IsNullOrWhiteSpace(request.Website))
        {
            return Ok(new { ok = true });
        }

        if (Validate(request) is string invalid)
        {
            return BadRequest(new { error = invalid });
        }

        if (!WithinRateLimit())
        {
            return StatusCode(429, new { error = "Recibimos varios mensajes tuyos. Intenta de nuevo en un rato." });
        }

        IContent? inbox = FindInbox();
        if (inbox is null)
        {
            _logger.LogError("CityGuide: contact message dropped, no '{Inbox}' node", CityGuideSeeder.ContactInboxName);
            return StatusCode(503, new { error = "No pudimos recibir tu mensaje. Inténtalo más tarde." });
        }

        IContent message = _contentService.Create(NodeName(request), inbox.Id, "contactMessage");
        message.SetValue("requestType", request.RequestType);
        message.SetValue("senderName", Clean(request.Name, 100));
        message.SetValue("email", Clean(request.Email, 200));
        message.SetValue("phone", Clean(request.Phone, 50));
        message.SetValue("businessName", Clean(request.BusinessName, 200));
        message.SetValue("businessUrl", Clean(request.BusinessUrl, 500));
        message.SetValue("message", Clean(request.Message, MaxMessage));
        message.SetValue("submittedAt", DateTime.UtcNow);
        // Saved, never published: the message is for the backoffice only.
        _contentService.Save(message);

        await NotifyAsync(request);

        return Ok(new { ok = true });
    }

    /// <summary>
    /// Tells the editor a message came in, so nobody has to watch the backoffice. Needs
    /// a recipient in "CityGuide:ContactNotificationEmail" and SMTP under
    /// "Umbraco:CMS:Global:Smtp"; without either, the message is simply filed. A failed
    /// send is logged and swallowed — the visitor's message is already stored, and
    /// telling them it failed would only make them send it again.
    /// </summary>
    private async Task NotifyAsync(ContactRequest request)
    {
        string? to = _configuration["CityGuide:ContactNotificationEmail"];
        string? from = _configuration["Umbraco:CMS:Global:Smtp:From"];
        if (string.IsNullOrWhiteSpace(to) || string.IsNullOrWhiteSpace(from) || !_emailSender.CanSendRequiredEmail())
        {
            return;
        }

        string sender = Clean(request.Email, 200);
        var body = new StringBuilder()
            .AppendLine($"Tipo de solicitud: {request.RequestType}")
            .AppendLine($"Nombre: {Clean(request.Name, 100)}")
            .AppendLine($"Correo: {sender}")
            .AppendLine($"Teléfono: {Or(Clean(request.Phone, 50))}")
            .AppendLine($"Negocio: {Or(Clean(request.BusinessName, 200))}")
            .AppendLine($"Enlace: {Or(Clean(request.BusinessUrl, 500))}")
            .AppendLine()
            .AppendLine(Clean(request.Message, MaxMessage))
            .AppendLine()
            .AppendLine("— QueHacerRD.com. El mensaje también quedó en "
                + $"\"{CityGuideSeeder.ContactInboxName}\" en el backoffice.")
            .ToString();

        // ReplyTo is the visitor: answering the notification answers them.
        var email = new EmailMessage(
            from, [to], cc: null, bcc: null, replyTo: [sender],
            $"[QueHacerRD] {request.RequestType} — {Clean(request.Name, 100)}",
            body, isBodyHtml: false, attachments: null);

        try
        {
            await _emailSender.SendAsync(email, Constants.Web.EmailTypes.Notification);
        }
        catch (Exception exception)
        {
            _logger.LogWarning(exception, "CityGuide: contact message saved but the notification email failed");
        }
    }

    /// <summary>An empty optional field reads better as a dash than as nothing.</summary>
    private static string Or(string value) => string.IsNullOrEmpty(value) ? "—" : value;

    /// <summary>The complaint to show the visitor, or null when the message is fine.</summary>
    private static string? Validate(ContactRequest request)
    {
        if (!RequestTypes.Contains(request.RequestType))
        {
            return "Elige el tipo de solicitud.";
        }

        if (Clean(request.Name, 100).Length < 2)
        {
            return "Escribe tu nombre.";
        }

        if (!EmailPattern.IsMatch(Clean(request.Email, 200)))
        {
            return "Escribe un correo válido.";
        }

        return Clean(request.Message, MaxMessage).Length < 10
            ? "Cuéntanos un poco más en el mensaje."
            : null;
    }

    /// <summary>Trimmed and capped: the visitor decides the text, not its length.</summary>
    private static string Clean(string? value, int maxLength)
    {
        string trimmed = value?.Trim() ?? string.Empty;
        return trimmed.Length <= maxLength ? trimmed : trimmed[..maxLength];
    }

    /// <summary>"Agregar mi negocio — Juan Pérez", what the backoffice tree shows.</summary>
    private static string NodeName(ContactRequest request)
    {
        string name = $"{request.RequestType} — {Clean(request.Name, 100)}";
        return name.Length <= 200 ? name : name[..200];
    }

    private IContent? FindInbox()
    {
        if (_contentTypeService.Get("contactInbox") is null)
        {
            return null;
        }

        IContent? site = _contentService.GetRootContent().FirstOrDefault(c => c.ContentType.Alias == "site");
        return site is null
            ? null
            : _contentService
                .GetPagedChildren(site.Id, 0, 100, out _, null, null, null, false)
                .FirstOrDefault(c => c.ContentType.Alias == "contactInbox");
    }

    /// <summary>
    /// Who is sending, as far as a throttle needs to know. The portal calls this
    /// endpoint server-side, so without the forwarded address every visitor would
    /// share one bucket. It is a courtesy limit and the header can be forged; what
    /// actually guards the inbox is the validation and the honeypot above.
    /// </summary>
    private string? ClientAddress()
    {
        string? forwarded = Request.Headers["X-Forwarded-For"].FirstOrDefault();
        string? first = forwarded?.Split(',').FirstOrDefault()?.Trim();
        return string.IsNullOrEmpty(first)
            ? HttpContext.Connection.RemoteIpAddress?.ToString()
            : first;
    }

    /// <summary>Messages one address has sent inside the current hour.</summary>
    private sealed class SendCount
    {
        public int Value;
    }

    /// <summary>
    /// Counts what one address sent in the last hour. In memory on purpose: this stops
    /// the obvious flood, and a restart losing the count costs nothing. The counter is
    /// mutated in place so a new message never pushes the window forward.
    /// </summary>
    private bool WithinRateLimit()
    {
        string? address = ClientAddress();
        if (address is null)
        {
            return true;
        }

        SendCount count = _cache.GetOrCreate($"contact-form:{address}", entry =>
        {
            entry.AbsoluteExpirationRelativeToNow = TimeSpan.FromHours(1);
            return new SendCount();
        })!;
        return Interlocked.Increment(ref count.Value) <= MaxPerHour;
    }
}
