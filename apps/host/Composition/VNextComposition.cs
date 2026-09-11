using Workspace.Host.Protocol;

namespace Workspace.Host.Composition;

public sealed class VNextComposition
{
    public SessionAuthenticator Sessions { get; } = new();

    public string InitializeSession(HostRuntimeOptions options)
    {
        if (options.Acceptance && options.SessionToken is not null)
        {
            Sessions.RegisterAcceptanceToken(options.SessionToken);
            return options.SessionToken;
        }
        return Sessions.Issue();
    }
}
