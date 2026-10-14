using System.Text.Json;
using SkiaSharp;

namespace CityGuide.Agent;

/// <summary>Where the subject of a picture is, as fractions of its width and height,
/// and whether the picture can illustrate an article at all.</summary>
public record ImageFocus(bool Usable, double X, double Y);

/// <summary>
/// The question put to the model about the pictures of an article: what each one shows
/// and where. It is the one thing about a photo no code here can answer — the centre of
/// a picture is where its subject is only when the photographer put it there, and a
/// cocktail on the left of a bar shot is lost by a centred crop.
/// </summary>
public static class ImageFocusPrompt
{
    public const string ToolName = "save_image_focus";
    public const string ToolDescription = "Save, for each picture, whether it can illustrate an article and where its subject is.";

    public static object Schema => new
    {
        type = "object",
        properties = new
        {
            images = new
            {
                type = "array",
                items = new
                {
                    type = "object",
                    properties = new
                    {
                        index = new { type = "integer", description = "Número de la imagen." },
                        usable = new
                        {
                            type = "boolean",
                            description = "true si es una fotografía del lugar, su comida, su ambiente o el paisaje. "
                                + "false si es un logo, un afiche o flyer con texto, un menú, un mapa, una captura de "
                                + "pantalla, un collage o una imagen borrosa o casi vacía.",
                        },
                        x = new { type = "number", description = "Centro horizontal del sujeto principal, de 0 (izquierda) a 1 (derecha)." },
                        y = new { type = "number", description = "Centro vertical del sujeto principal, de 0 (arriba) a 1 (abajo)." },
                    },
                    required = new[] { "index", "usable", "x", "y" },
                },
            },
        },
        required = new[] { "images" },
    };

    public static IReadOnlyList<PromptPart> UserMessage(IReadOnlyList<string> imageUrls)
    {
        var parts = new List<PromptPart>
        {
            PromptPart.Say(
                $"Estas {imageUrls.Count} imágenes van a ilustrar un artículo de una guía de ocio, "
                + "recortadas en formato 16:9. Para cada una di si sirve y dónde está su sujeto "
                + "principal (la fachada, el plato, la gente, el monumento), para centrar el recorte en él."),
        };
        for (var i = 0; i < imageUrls.Count; i++)
        {
            parts.Add(PromptPart.Say($"Imagen {i + 1}:"));
            parts.Add(PromptPart.Show(imageUrls[i]));
        }

        return parts;
    }

    /// <summary>The focus of each picture by its position in the list. A picture the
    /// model left out has no answer and is cropped on its centre; coordinates outside
    /// the frame are clamped into it.</summary>
    public static Dictionary<int, ImageFocus> Parse(JsonElement input, int count)
    {
        var focus = new Dictionary<int, ImageFocus>();
        if (!input.TryGetProperty("images", out JsonElement images) || images.ValueKind != JsonValueKind.Array)
        {
            return focus;
        }

        foreach (JsonElement entry in images.EnumerateArray())
        {
            if (entry.TryGetProperty("index", out JsonElement index) && index.TryGetInt32(out int position)
                && position >= 1 && position <= count)
            {
                bool usable = !entry.TryGetProperty("usable", out JsonElement u) || u.ValueKind != JsonValueKind.False;
                focus[position - 1] = new ImageFocus(usable, Fraction(entry, "x"), Fraction(entry, "y"));
            }
        }

        return focus;
    }

    private static double Fraction(JsonElement entry, string name) =>
        entry.TryGetProperty(name, out JsonElement value) && value.TryGetDouble(out double v)
            ? Math.Clamp(v, 0, 1)
            : 0.5;
}

/// <summary>
/// The pictures of an article, cropped here and not by the browser. The page shows each
/// one in a 16:9 frame (and the cover a little wider) with <c>object-fit: cover</c>,
/// which keeps the centre of whatever it is given — so a picture whose subject is off
/// centre, or a portrait, came out as a ceiling or a tablecloth. Each photo is cut here
/// to 16:9 around where the model says its subject is and uploaded as its own media
/// item; any further trim the frame makes is then around the subject, and the original
/// the place's own page uses is left as it was. Pictures that cannot illustrate anything
/// (a flyer, a logo, a menu) and pictures too small to fill the column are dropped, and
/// that recommendation goes without a photo rather than with a bad one.
/// </summary>
public class ArticleImages(HttpClient http, UmbracoClient umbraco, IEnrichmentClient model, string cmsBaseUrl)
{
    private const double Ratio = 16.0 / 9.0;

    /// <summary>The article column is 48rem; narrower than this the photo is blown up.</summary>
    private const int MinWidth = 640;

    private const int MaxWidth = 1600;

    /// <summary>What the model looks at: enough to tell a plate from a façade, at a
    /// fraction of the tokens of the full picture.</summary>
    private const int PreviewSide = 512;

    /// <summary>One picture to prepare: the key the caller knows it by, the name the
    /// media item takes, where the original is and the credit it is stored with — a crop
    /// of a Commons or Google photo owes its author the same credit the original does.</summary>
    public record Source(int Key, string Name, string Url, PhotoCredit? Credit);

    /// <summary>
    /// Crops every usable picture and, with <paramref name="upload"/>, stores the crops
    /// in the Media library. Answers key → address of the picture to use: the crop's, or
    /// the original's in a plan (which uploads nothing). A key missing from the answer is
    /// a recommendation without a photo.
    /// </summary>
    public async Task<Dictionary<int, string>> PrepareAsync(IReadOnlyList<Source> sources, bool upload)
    {
        var decoded = new List<(Source Source, SKBitmap Bitmap)>();
        foreach (Source source in sources)
        {
            if (await DownloadAsync(source.Url) is { } bitmap)
            {
                // The width of the 16:9 crop, which a portrait limits by its height.
                if (Math.Min(bitmap.Width, bitmap.Height * Ratio) >= MinWidth)
                {
                    decoded.Add((source, bitmap));
                }
                else
                {
                    Console.WriteLine($"    foto de {source.Name} descartada: {bitmap.Width}x{bitmap.Height}, demasiado pequeña");
                    bitmap.Dispose();
                }
            }
        }

        Dictionary<int, ImageFocus> focus = [];
        if (decoded.Count > 0)
        {
            try
            {
                focus = await model.LocateSubjectsAsync([.. decoded.Select(d => Preview(d.Bitmap))]);
            }
            catch (Exception ex)
            {
                // Without an answer every picture is cropped on its centre, which is what
                // the frame would have done anyway.
                Console.Error.WriteLine($"    ! foco de las fotos: {ex.Message}");
            }
        }

        var prepared = new Dictionary<int, string>();
        for (var i = 0; i < decoded.Count; i++)
        {
            (Source source, SKBitmap bitmap) = decoded[i];
            using (bitmap)
            {
                ImageFocus at = focus.GetValueOrDefault(i, new ImageFocus(true, 0.5, 0.5));
                if (!at.Usable)
                {
                    Console.WriteLine($"    foto de {source.Name} descartada: no ilustra (logo, afiche o menú)");
                    continue;
                }

                SKRectI crop = Crop(bitmap.Width, bitmap.Height, at);
                Console.WriteLine($"    foto de {source.Name}: {bitmap.Width}x{bitmap.Height} → recorte "
                    + $"{crop.Width}x{crop.Height} centrado en ({at.X:0.00}, {at.Y:0.00})");
                if (!upload)
                {
                    prepared[source.Key] = source.Url;
                    continue;
                }

                try
                {
                    Guid media = await umbraco.CreateMediaImageAsync(
                        $"{source.Name} — artículo", Encode(bitmap, crop), "image/jpeg", source.Credit);
                    if (await umbraco.GetMediaUrlAsync(media) is { } url)
                    {
                        prepared[source.Key] = url;
                    }
                }
                catch (Exception ex)
                {
                    Console.Error.WriteLine($"    ! subir la foto de {source.Name}: {ex.Message}");
                }
            }
        }

        return prepared;
    }

    /// <summary>The largest 16:9 rectangle inside the picture whose centre is as close
    /// to the subject as the edges allow.</summary>
    private static SKRectI Crop(int width, int height, ImageFocus focus)
    {
        int cropWidth = Math.Min(width, (int)Math.Round(height * Ratio));
        int cropHeight = Math.Min(height, (int)Math.Round(cropWidth / Ratio));
        int left = Math.Clamp((int)Math.Round(focus.X * width - cropWidth / 2.0), 0, width - cropWidth);
        int top = Math.Clamp((int)Math.Round(focus.Y * height - cropHeight / 2.0), 0, height - cropHeight);
        return new SKRectI(left, top, left + cropWidth, top + cropHeight);
    }

    private static byte[] Encode(SKBitmap bitmap, SKRectI crop)
    {
        int width = Math.Min(MaxWidth, crop.Width);
        int height = (int)Math.Round(width / Ratio);
        using var surface = SKSurface.Create(new SKImageInfo(width, height));
        using SKImage image = SKImage.FromBitmap(bitmap);
        surface.Canvas.DrawImage(
            image, SKRect.Create(crop.Left, crop.Top, crop.Width, crop.Height),
            SKRect.Create(0, 0, width, height), new SKSamplingOptions(SKCubicResampler.Mitchell));
        using SKImage result = surface.Snapshot();
        using SKData data = result.Encode(SKEncodedImageFormat.Jpeg, 85);
        return data.ToArray();
    }

    /// <summary>The picture small, as a data address: the CMS that holds the original is
    /// not one the model can always reach (a local install), and a data address is the
    /// same request either way.</summary>
    private static string Preview(SKBitmap bitmap)
    {
        double scale = Math.Min(1, (double)PreviewSide / Math.Max(bitmap.Width, bitmap.Height));
        int width = Math.Max(1, (int)(bitmap.Width * scale));
        int height = Math.Max(1, (int)(bitmap.Height * scale));
        using var surface = SKSurface.Create(new SKImageInfo(width, height));
        using SKImage image = SKImage.FromBitmap(bitmap);
        surface.Canvas.DrawImage(image, SKRect.Create(0, 0, width, height), new SKSamplingOptions(SKFilterMode.Linear));
        using SKImage result = surface.Snapshot();
        using SKData data = result.Encode(SKEncodedImageFormat.Jpeg, 75);
        return $"data:image/jpeg;base64,{Convert.ToBase64String(data.ToArray())}";
    }

    /// <summary>The original, decoded, or null. The pictures are the CMS's own (its
    /// "/media" addresses), so this is a request to the portal and costs nothing.</summary>
    private async Task<SKBitmap?> DownloadAsync(string url)
    {
        try
        {
            string absolute = url.StartsWith('/') ? $"{cmsBaseUrl.TrimEnd('/')}{url}" : url;
            byte[] bytes = await http.GetByteArrayAsync(absolute);
            return SKBitmap.Decode(bytes);
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"    ! descargar {url}: {ex.Message}");
            return null;
        }
    }
}
