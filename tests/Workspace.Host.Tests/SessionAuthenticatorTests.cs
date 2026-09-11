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
    public void Acceptance_token_requires_explicit_acceptance_mode()
    {
        Assert.Throws<InvalidOperationException>(() => HostRuntimeOptions.Parse(new[] { "--session-token", "fixed" }));
        var options = HostRuntimeOptions.Parse(new[] { "--acceptance", "--session-token", "fixed" });
        Assert.True(options.Acceptance);
        Assert.Equal("fixed", options.SessionToken);
    }
}
