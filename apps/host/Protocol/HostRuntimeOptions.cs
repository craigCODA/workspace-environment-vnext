namespace Workspace.Host.Protocol;

public sealed record HostRuntimeOptions(bool Acceptance, string? SessionToken, string? StateRoot, int Port)
{
    public static HostRuntimeOptions Parse(string[] args)
    {
        var acceptance = args.Contains("--acceptance", StringComparer.Ordinal);
        var token = Value(args, "--session-token");
        var stateRoot = Value(args, "--state-root");
        var portText = Value(args, "--port");
        var port = portText is null ? 41772 : int.Parse(portText, System.Globalization.CultureInfo.InvariantCulture);

        if (!acceptance && token is not null)
            throw new InvalidOperationException("--session-token is accepted only with --acceptance.");
        if (port is < 1 or > 65535) throw new ArgumentOutOfRangeException(nameof(args), "Port must be 1..65535.");

        return new HostRuntimeOptions(acceptance, token, stateRoot, port);
    }

    private static string? Value(string[] args, string key)
    {
        var index = Array.FindIndex(args, x => string.Equals(x, key, StringComparison.Ordinal));
        if (index < 0) return null;
        if (index + 1 >= args.Length || args[index + 1].StartsWith("--", StringComparison.Ordinal))
            throw new ArgumentException($"{key} requires a value.");
        return args[index + 1];
    }
}
