using Workspace.Host.Protocol;
using Xunit;

namespace Workspace.Host.Tests;

public sealed class SessionAuthenticatorTests
{
    [Fact]
    public void Issued_token_is_one_time()
    {
        var auth = new SessionAuthenticator();
        var token = auth.Issue();
        Assert.True(auth.TryConsume(token, out var session));
        Assert.NotNull(session);
        Assert.False(auth.TryConsume(token, out _));
    }

    [Fact]
    public void Acceptance_token_can_reconnect()
    {
        var auth = new SessionAuthenticator();
        auth.RegisterAcceptanceToken("fixed");
        Assert.True(auth.TryConsume("fixed", out var first));
        Assert.NotNull(first);
        Assert.True(auth.TryConsume("fixed", out var second));
        Assert.NotNull(second);
        Assert.Equal(first!.SessionId, second!.SessionId);
    }

    [Fact]
    public void Acceptance_token_requires_explicit_acceptance_mode()
    {
        Assert.Throws<InvalidOperationException>(() => HostRuntimeOptions.Parse(new[] { "--session-token", "fixed" }));
        var options = HostRuntimeOptions.Parse(new[] { "--acceptance", "--session-token", "fixed" });
        Assert.True(options.Acceptance);
        Assert.Equal("fixed", options.SessionToken);
    }

    [Fact]
    public void Consumed_token_remains_authorized_for_trusted_http_reads_without_becoming_reusable_for_websocket()
    {
        var auth = new SessionAuthenticator();
        var token = auth.Issue();

        Assert.True(auth.TryConsume(token, out var consumed));
        Assert.NotNull(consumed);
        Assert.True(auth.TryAuthorize(token, out var authorized));
        Assert.Equal(consumed, authorized);
        Assert.False(auth.TryConsume(token, out _));
    }
}
