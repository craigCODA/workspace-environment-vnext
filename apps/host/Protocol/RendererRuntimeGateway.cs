using System.Collections.Concurrent;
using System.Text.Json;
using Workspace.Core.Ports;

namespace Workspace.Host.Protocol;

public interface IRendererRuntimeChannel
{
    Task<JsonElement> RequestAsync(JsonElement message, CancellationToken cancellationToken);
    Task SendAsync(JsonElement message, CancellationToken cancellationToken);
}

public sealed class RendererRuntimeGateway : IRuntimeGateway
{
    private readonly IRendererRuntimeChannel _channel;
    private readonly TimeSpan _prepareTimeout;
    private readonly ConcurrentDictionary<string, byte> _retiredGenerations = new(StringComparer.Ordinal);

    public RendererRuntimeGateway(IRendererRuntimeChannel channel, TimeSpan? prepareTimeout = null)
    {
        _channel = channel;
        _prepareTimeout = prepareTimeout ?? TimeSpan.FromSeconds(5);
    }

    public async Task<RuntimePrepareResult> PrepareAsync(PackageCandidate candidate, CancellationToken cancellationToken)
    {
        if (_retiredGenerations.ContainsKey(candidate.GenerationToken)) return new(false, "generation_retired");

        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(_prepareTimeout);
        JsonElement response;
        try
        {
            response = await _channel.RequestAsync(JsonSerializer.SerializeToElement(new
            {
                type = "runtime.prepare",
                protocolVersion = 1,
                candidateId = candidate.CandidateId,
                entityId = candidate.EntityId,
                generationToken = candidate.GenerationToken,
                source = candidate.Source,
                manifestJson = candidate.ManifestJson,
            }), timeout.Token);
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            return new(false, "runtime_prepare_timeout");
        }

        if (_retiredGenerations.ContainsKey(candidate.GenerationToken)) return new(false, "generation_retired");
        if (!MatchesCandidate(response, candidate)) return new(false, "runtime_response_mismatch");

        var type = response.GetProperty("type").GetString();
        if (type == "runtime.prepared") return new(true, null);
        if (type == "runtime.failed")
            return new(false, response.TryGetProperty("errorCode", out var error) ? error.GetString() ?? "runtime_prepare_failed" : "runtime_prepare_failed");
        return new(false, "runtime_prepare_failed");
    }

    public Task ActivateAsync(string entityId, string revisionDigest, string generationToken, CancellationToken cancellationToken)
    {
        if (_retiredGenerations.ContainsKey(generationToken)) throw new InvalidOperationException("generation_retired");
        return _channel.SendAsync(JsonSerializer.SerializeToElement(new
        {
            type = "runtime.activate",
            protocolVersion = 1,
            entityId,
            revisionDigest,
            generationToken,
        }), cancellationToken);
    }

    public async Task RetireAsync(string generationToken, CancellationToken cancellationToken)
    {
        _retiredGenerations.TryAdd(generationToken, 0);
        await _channel.SendAsync(JsonSerializer.SerializeToElement(new
        {
            type = "runtime.retire",
            protocolVersion = 1,
            generationToken,
        }), cancellationToken);
    }

    private static bool MatchesCandidate(JsonElement response, PackageCandidate candidate)
    {
        if (response.ValueKind != JsonValueKind.Object) return false;
        if (!response.TryGetProperty("type", out var type) || type.ValueKind != JsonValueKind.String) return false;
        var responseType = type.GetString();
        if (responseType is not ("runtime.prepared" or "runtime.failed")) return false;
        if (!response.TryGetProperty("protocolVersion", out var version) || version.ValueKind != JsonValueKind.Number || version.GetInt32() != 1) return false;
        if (!response.TryGetProperty("candidateId", out var candidateId) || candidateId.GetString() != candidate.CandidateId) return false;
        if (!response.TryGetProperty("generationToken", out var generation) || generation.GetString() != candidate.GenerationToken) return false;
        return true;
    }
}
