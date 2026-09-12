namespace Workspace.Host.Protocol;

public sealed record HostRuntimeOptions(bool Acceptance, string? SessionToken, string? StateRoot, int Port, bool M2A = false, int? ParentProcessId = null, string? AllowedOrigin = null)
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

        var m2a = args.Contains("--m2a", StringComparer.Ordinal);
        var parentText = Value(args, "--parent-process");
        int? parent = parentText is null ? null : int.Parse(parentText, System.Globalization.CultureInfo.InvariantCulture);
        if (parent is <= 0) throw new ArgumentException("Parent process must be positive.");
        return new HostRuntimeOptions(acceptance, token, stateRoot, port, m2a, parent, Value(args, "--allowed-origin"));
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
