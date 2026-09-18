using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;

namespace CityGuideWeb.CityGuide;

/// <summary>
/// Endpoints only the portal's own server may call: the ones that act for a signed-in
/// visitor (write a review, keep a favourite, sign in) and trust the member key the
/// portal names. The portal proves who it is with a secret shared through
/// configuration — "CityGuide:PortalApiSecret" here, CMS_PORTAL_SECRET on the Next
/// server — sent as "x-portal-secret". The visitor's session lives on the portal; the
/// CMS never sees it, and a browser never reaches these endpoints.
///
/// Without the setting every such endpoint answers 404, so an installation that has
/// not configured accounts exposes nothing.
/// </summary>
[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method)]
public sealed class PortalApiAttribute : Attribute, IAuthorizationFilter
{
    public const string Header = "x-portal-secret";

    public void OnAuthorization(AuthorizationFilterContext context)
    {
        IConfiguration configuration = context.HttpContext.RequestServices.GetRequiredService<IConfiguration>();
        string? secret = configuration["CityGuide:PortalApiSecret"];
        string? sent = context.HttpContext.Request.Headers[Header].FirstOrDefault();

        if (string.IsNullOrEmpty(secret)
            || string.IsNullOrEmpty(sent)
            || !CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(secret), Encoding.UTF8.GetBytes(sent)))
        {
            context.Result = new NotFoundResult();
        }
    }
}
