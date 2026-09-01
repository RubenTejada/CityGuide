namespace CityGuide.Agent;

/// <summary>
/// Slows every outbound request to external hosts: a minimum interval (plus
/// random jitter) between requests to the same host, so the agent never trips
/// a rate limiter or bot blocker. The CMS host and localhost are exempt.
/// There is no hurry — the agent is a daily batch job.
/// </summary>
public class ThrottlingHandler(TimeSpan minInterval, string exemptHost) : DelegatingHandler(new HttpClientHandler())
{
    private readonly Dictionary<string, DateTime> _lastRequestByHost = new(StringComparer.OrdinalIgnoreCase);
    private readonly SemaphoreSlim _gate = new(1, 1);

    protected override async Task<HttpResponseMessage> SendAsync(
        HttpRequestMessage request, CancellationToken cancellationToken)
    {
        string host = request.RequestUri!.Host;
        bool exempt = host is "localhost" or "127.0.0.1"
            || host.Equals(exemptHost, StringComparison.OrdinalIgnoreCase);
        if (!exempt)
        {
            await _gate.WaitAsync(cancellationToken);
            try
            {
                if (_lastRequestByHost.TryGetValue(host, out DateTime last))
                {
                    TimeSpan wait = last + minInterval + TimeSpan.FromMilliseconds(Random.Shared.Next(0, 1500))
                        - DateTime.UtcNow;
                    if (wait > TimeSpan.Zero)
                    {
                        await Task.Delay(wait, cancellationToken);
                    }
                }

                _lastRequestByHost[host] = DateTime.UtcNow;
            }
            finally
            {
                _gate.Release();
            }
        }

        return await base.SendAsync(request, cancellationToken);
    }
}
