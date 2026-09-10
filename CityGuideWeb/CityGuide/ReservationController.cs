using System.Globalization;
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
/// The reservation form of one establishment: a request to hold a table, filed as an
/// unpublished "reservationRequest" node under the inbox the seeder creates. Like a
/// contact message it carries personal data and is never published, so it lives in the
/// backoffice alone and never reaches the Delivery API.
///
/// It is offered only where an editor turned it on ("acceptsReservations" on the place),
/// and that flag is checked here rather than trusted from the form: the endpoint is
/// public, so the place the visitor names is looked up and refused when it does not take
/// reservations. Nothing is booked — the portal takes the request and the establishment
/// confirms it by email, which is exactly what the form says.
/// </summary>
[ApiController]
[Route("api/reservation")]
public class ReservationController : ControllerBase
{
    /// <summary>One sender may ask for a handful of tables per hour, not a flood.</summary>
    private const int MaxPerHour = 5;

    private const int MaxParty = 30;
    private const int MaxNotes = 1000;

    /// <summary>How far ahead a table may be asked for; beyond it is a typo, not a plan.</summary>
    private static readonly TimeSpan MaxAhead = TimeSpan.FromDays(365);

    /// <summary>Shape check only — the address is proven by the confirmation reaching it.</summary>
    private static readonly Regex EmailPattern =
        new(@"^[^@\s]+@[^@\s]+\.[^@\s]+$", RegexOptions.Compiled);

    /// <summary>
    /// The portal is Dominican and so is every establishment in it: a reservation is
    /// asked for in the restaurant's own wall clock, and that is the clock "today" has
    /// to be read on for a server running in UTC.
    /// </summary>
    private static readonly TimeZoneInfo LocalZone = FindLocalZone();

    private readonly IContentService _contentService;
    private readonly IContentTypeService _contentTypeService;
    private readonly IMemoryCache _cache;
    private readonly IEmailSender _emailSender;
    private readonly IConfiguration _configuration;
    private readonly ILogger<ReservationController> _logger;

    public ReservationController(
        IContentService contentService,
        IContentTypeService contentTypeService,
        IMemoryCache cache,
        IEmailSender emailSender,
        IConfiguration configuration,
        ILogger<ReservationController> logger)
    {
        _contentService = contentService;
        _contentTypeService = contentTypeService;
        _cache = cache;
        _emailSender = emailSender;
        _configuration = configuration;
        _logger = logger;
    }

    /// <summary>
    /// Every field is checked in code: a missing one is a message the visitor can fix,
    /// not a framework 400 in English. "Date" is "yyyy-MM-dd" and "Time" is "HH:mm", as
    /// the browser's own date and time inputs hand them over.
    /// </summary>
    public record ReservationSubmission(
        string? PlaceId, string? PlaceUrl, string? Date, string? Time, int? PartySize,
        string? Name, string? Email, string? Phone, string? Notes, string? Locale,
        /// <summary>Honeypot: a real visitor never sees this field, so a filled one is a bot.</summary>
        string? Website);

    [HttpPost]
    public async Task<IActionResult> Post([FromBody] ReservationSubmission request)
    {
        bool english = request.Locale == "en";

        // A bot that filled the honeypot is answered like everyone else: telling it
        // apart is what lets it find the shape that gets through.
        if (!string.IsNullOrWhiteSpace(request.Website))
        {
            return Ok(new { ok = true });
        }

        IContent? place = FindPlace(request.PlaceId);
        if (place is null)
        {
            return BadRequest(new
            {
                error = english
                    ? "This place is not taking reservations through the portal."
                    : "Este lugar no está recibiendo reservas por el portal.",
            });
        }

        if (Validate(request, english) is string invalid)
        {
            return BadRequest(new { error = invalid });
        }

        DateTime when = ReservationAt(request)!.Value;

        if (!PublicForms.WithinRateLimit(_cache, "reservation-form", PublicForms.ClientAddress(HttpContext), MaxPerHour))
        {
            return StatusCode(429, new
            {
                error = english
                    ? "We already have several requests from you. Try again in a while."
                    : "Ya recibimos varias solicitudes tuyas. Intenta de nuevo en un rato.",
            });
        }

        IContent? inbox = PublicForms.FindInbox(_contentService, _contentTypeService, "reservationInbox");
        if (inbox is null)
        {
            _logger.LogError("CityGuide: reservation dropped, no '{Inbox}' node", CityGuideSeeder.ReservationInboxName);
            return StatusCode(503, new
            {
                error = english
                    ? "We could not take your request. Please try again later."
                    : "No pudimos recibir tu solicitud. Inténtalo más tarde.",
            });
        }

        string placeName = PlaceName(place);
        IContent reservation = _contentService.Create(NodeName(placeName, when, request), inbox.Id, "reservationRequest");
        reservation.SetValue("placeName", placeName);
        reservation.SetValue("placeUrl", PlaceUrl(request.PlaceUrl));
        reservation.SetValue("reservationAt", when);
        reservation.SetValue("partySize", request.PartySize);
        reservation.SetValue("guestName", PublicForms.Clean(request.Name, 100));
        reservation.SetValue("email", PublicForms.Clean(request.Email, 200));
        reservation.SetValue("phone", PublicForms.Clean(request.Phone, 50));
        reservation.SetValue("notes", PublicForms.Clean(request.Notes, MaxNotes));
        reservation.SetValue("submittedAt", DateTime.UtcNow);
        // Saved, never published: the request is for the backoffice and the restaurant.
        _contentService.Save(reservation);

        await NotifyAsync(request, place, placeName, when, english);

        return Ok(new { ok = true });
    }

    /// <summary>
    /// The place the request names, but only when it really takes reservations: the
    /// endpoint is public, so the flag an editor set is what decides, never the form.
    /// </summary>
    private IContent? FindPlace(string? placeId)
    {
        if (!Guid.TryParse(placeId, out Guid key))
        {
            return null;
        }

        IContent? place = _contentService.GetById(key);
        // A tour is asked for the same way: the flag an editor set is what decides.
        return place is not null
            && (place.ContentType.Alias == "place" || place.ContentType.Alias == "tour")
            && place.Published
            && place.GetValue<bool>("acceptsReservations")
                ? place
                : null;
    }

    /// <summary>The complaint to show the visitor, or null when the request is fine.</summary>
    private static string? Validate(ReservationSubmission request, bool english)
    {
        if (ReservationAt(request) is not DateTime when)
        {
            return english ? "Choose a date and a time." : "Elige la fecha y la hora.";
        }

        DateTime now = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, LocalZone);
        if (when < now)
        {
            return english
                ? "Choose a date and time still to come."
                : "Elige una fecha y hora que no hayan pasado.";
        }

        if (when > now + MaxAhead)
        {
            return english ? "That date is too far ahead." : "Esa fecha está demasiado lejos.";
        }

        if (request.PartySize is not int party || party < 1 || party > MaxParty)
        {
            return english
                ? $"How many people are coming? Up to {MaxParty}."
                : $"¿Cuántas personas van? Hasta {MaxParty}.";
        }

        if (PublicForms.Clean(request.Name, 100).Length < 2)
        {
            return english ? "Write your name." : "Escribe tu nombre.";
        }

        if (!EmailPattern.IsMatch(PublicForms.Clean(request.Email, 200)))
        {
            return english ? "Write a valid email address." : "Escribe un correo válido.";
        }

        // The establishment calls back when something changes, so a phone is not optional.
        return PublicForms.Clean(request.Phone, 50).Count(char.IsDigit) < 7
            ? english ? "Write a phone number they can reach you on." : "Escribe un teléfono donde te puedan llamar."
            : null;
    }

    /// <summary>
    /// The wall clock of the establishment: "2026-09-12" plus "20:30" as typed, with no
    /// timezone conversion — eight thirty at that table is eight thirty.
    /// </summary>
    private static DateTime? ReservationAt(ReservationSubmission request) =>
        DateTime.TryParseExact(
            $"{PublicForms.Clean(request.Date, 10)} {PublicForms.Clean(request.Time, 5)}",
            "yyyy-MM-dd HH:mm",
            CultureInfo.InvariantCulture,
            DateTimeStyles.None,
            out DateTime parsed)
            ? parsed
            : null;

    /// <summary>The place's own name, in Spanish: the backoffice tree reads one language.</summary>
    private static string PlaceName(IContent place) =>
        place.ContentType.VariesByCulture()
            ? place.GetCultureName("es-DO") ?? place.Name ?? string.Empty
            : place.Name ?? string.Empty;

    /// <summary>
    /// The page the request came from, for the editor and for the email. It arrives from
    /// the browser, so only a path on the portal itself is kept.
    /// </summary>
    private static string PlaceUrl(string? url)
    {
        string path = PublicForms.Clean(url, 500);
        return path.StartsWith('/') && !path.StartsWith("//") ? path : string.Empty;
    }

    /// <summary>"Sonoma Bistro — 12/09/2026 20:30 — 4 personas", what the tree shows.</summary>
    private static string NodeName(string placeName, DateTime when, ReservationSubmission request)
    {
        string name = $"{placeName} — {when:dd/MM/yyyy HH:mm} — {request.PartySize} pers.";
        return name.Length <= 200 ? name : name[..200];
    }

    /// <summary>
    /// Sends the request on to whoever answers it — the address on the place, else the
    /// portal's own recipient — and tells the visitor it arrived. Needs SMTP under
    /// "Umbraco:CMS:Global:Smtp"; without it the request is simply filed, and an editor
    /// reads it in the backoffice. A failed send is logged and swallowed: the request is
    /// already stored, and telling the visitor it failed would only make them send it again.
    /// </summary>
    private async Task NotifyAsync(
        ReservationSubmission request, IContent place, string placeName, DateTime when, bool english)
    {
        string? from = _configuration["Umbraco:CMS:Global:Smtp:From"];
        if (string.IsNullOrWhiteSpace(from) || !_emailSender.CanSendRequiredEmail())
        {
            return;
        }

        string venue = PublicForms.Clean(place.GetValue<string>("reservationEmail"), 200);
        string? portal = _configuration["CityGuide:ContactNotificationEmail"];
        string? to = EmailPattern.IsMatch(venue) ? venue : portal;
        string guest = PublicForms.Clean(request.Email, 200);
        string guestName = PublicForms.Clean(request.Name, 100);
        string schedule = when.ToString("dddd d 'de' MMMM 'de' yyyy, HH:mm", new CultureInfo("es-DO"));

        if (!string.IsNullOrWhiteSpace(to))
        {
            var body = new StringBuilder()
                .AppendLine($"Nueva solicitud de reserva en {placeName}.")
                .AppendLine()
                .AppendLine($"Fecha y hora: {schedule}")
                .AppendLine($"Personas: {request.PartySize}")
                .AppendLine($"Nombre: {guestName}")
                .AppendLine($"Correo: {guest}")
                .AppendLine($"Teléfono: {PublicForms.Clean(request.Phone, 50)}")
                .AppendLine($"Notas: {PublicForms.Or(PublicForms.Clean(request.Notes, MaxNotes))}")
                .AppendLine($"Página: {PublicForms.Or(PlaceUrl(request.PlaceUrl))}")
                .AppendLine()
                .AppendLine("Responde a este correo para confirmarle la reserva; la respuesta le llega "
                    + "directamente.")
                .AppendLine($"— QueHacerRD.com. La solicitud también quedó en "
                    + $"\"{CityGuideSeeder.ReservationInboxName}\" en el backoffice.")
                .ToString();

            // ReplyTo is the guest: answering the notification confirms the table.
            await SendAsync(new EmailMessage(
                from, [to], cc: null, bcc: null, replyTo: [guest],
                $"[QueHacerRD] Reserva — {placeName} — {when:dd/MM/yyyy HH:mm} — {request.PartySize} pers.",
                body, isBodyHtml: false, attachments: null));
        }

        // What the form promised: the request arrived and the confirmation comes by email.
        string acknowledgement = english
            ? new StringBuilder()
                .AppendLine($"Hi {guestName},")
                .AppendLine()
                .AppendLine($"We passed your reservation request on to {placeName}:")
                .AppendLine($"  {when:dd/MM/yyyy HH:mm} — {request.PartySize} people")
                .AppendLine()
                .AppendLine("It is not confirmed yet: the venue answers this email to confirm it, "
                    + "usually within the day. If you need to change or cancel it, reply here.")
                .AppendLine()
                .AppendLine("— QueHacerRD.com")
                .ToString()
            : new StringBuilder()
                .AppendLine($"Hola {guestName}:")
                .AppendLine()
                .AppendLine($"Enviamos tu solicitud de reserva a {placeName}:")
                .AppendLine($"  {schedule} — {request.PartySize} personas")
                .AppendLine()
                .AppendLine("Todavía no está confirmada: el establecimiento responde a este correo "
                    + "para confirmarla, normalmente el mismo día. Si necesitas cambiarla o "
                    + "cancelarla, responde aquí.")
                .AppendLine()
                .AppendLine("— QueHacerRD.com")
                .ToString();

        await SendAsync(new EmailMessage(
            from, [guest], cc: null, bcc: null,
            replyTo: string.IsNullOrWhiteSpace(to) ? null : [to],
            english
                ? $"Your reservation request at {placeName} — {when:dd/MM/yyyy HH:mm}"
                : $"Tu solicitud de reserva en {placeName} — {when:dd/MM/yyyy HH:mm}",
            acknowledgement, isBodyHtml: false, attachments: null));
    }

    private async Task SendAsync(EmailMessage email)
    {
        try
        {
            await _emailSender.SendAsync(email, Constants.Web.EmailTypes.Notification);
        }
        catch (Exception exception)
        {
            _logger.LogWarning(exception, "CityGuide: reservation saved but an email failed");
        }
    }

    /// <summary>
    /// The Dominican zone, by its IANA id and by the Windows one a developer's machine
    /// may answer to. A host that knows neither falls back to UTC, which only shifts what
    /// counts as "already past" by four hours.
    /// </summary>
    private static TimeZoneInfo FindLocalZone()
    {
        foreach (string id in new[] { "America/Santo_Domingo", "SA Western Standard Time" })
        {
            try
            {
                return TimeZoneInfo.FindSystemTimeZoneById(id);
            }
            catch (Exception exception) when (exception is TimeZoneNotFoundException or InvalidTimeZoneException)
            {
                // Try the next spelling.
            }
        }

        return TimeZoneInfo.Utc;
    }
}
