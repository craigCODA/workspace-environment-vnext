using System.Security.Cryptography;

namespace Workspace.Host.Protocol;

public sealed record AuthenticatedSession(string SessionId, string ActorId, string ActorKind)
{
    public bool Trusted => ActorKind is "user" or "coda" or "host";
}

public sealed class SessionAuthenticator
{
    private readonly object _gate = new();
    private readonly Dictionary<string, AuthenticatedSession> _pending = new(StringComparer.Ordinal);

    public string Issue(string actorId = "user:local", string actorKind = "user")
    {
        Span<byte> bytes = stackalloc byte[32];
        RandomNumberGenerator.Fill(bytes);
        var token = Base64Url(bytes);
        Register(token, new AuthenticatedSession($"session:{Guid.NewGuid():N}", actorId, actorKind));
        return token;
    }

    public void RegisterAcceptanceToken(string token, string actorId = "user:acceptance", string actorKind = "user")
    {
        if (string.IsNullOrWhiteSpace(token)) throw new ArgumentException("Session token is required.", nameof(token));
        Register(token, new AuthenticatedSession($"session:{Guid.NewGuid():N}", actorId, actorKind));
    }

    public bool TryConsume(string token, out AuthenticatedSession? session)
    {
        lock (_gate)
        {
            if (!_pending.Remove(token, out session)) return false;
            return true;
        }
    }

    private void Register(string token, AuthenticatedSession session)
    {
        lock (_gate)
        {
            if (!_pending.TryAdd(token, session)) throw new InvalidOperationException("Session token already registered.");
        }
    }

    private static string Base64Url(ReadOnlySpan<byte> bytes) =>
        Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
}
