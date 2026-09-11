using System.Security.Cryptography;
using System.Text;

namespace Workspace.Runtime.Drafts;

public sealed class DraftPathViolationException(string path) : Exception($"Draft path is not allowed: {path}");

public sealed class DraftWorkspace
{
    private readonly string _root;
    private readonly string _rootWithSeparator;

    private DraftWorkspace(string root)
    {
        _root = Path.GetFullPath(root);
        _rootWithSeparator = _root.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar) + Path.DirectorySeparatorChar;
    }

    public string Root => _root;

    public static async Task<DraftWorkspace> CreateAsync(string stateRoot, string draftId, CancellationToken cancellationToken)
    {
        var idHash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(draftId))).ToLowerInvariant()[..24];
        var root = Path.Combine(Path.GetFullPath(stateRoot), "drafts", idHash);
        Directory.CreateDirectory(root);
        await Task.CompletedTask;
        return new DraftWorkspace(root);
    }

    public async Task WriteTextAsync(string relativePath, string content, CancellationToken cancellationToken)
    {
        var path = Resolve(relativePath, forWrite: true);
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        await File.WriteAllTextAsync(path, content, Encoding.UTF8, cancellationToken);
    }

    public Task<string> ReadTextAsync(string relativePath, CancellationToken cancellationToken)
    {
        var path = Resolve(relativePath, forWrite: false);
        return File.ReadAllTextAsync(path, Encoding.UTF8, cancellationToken);
    }

    private string Resolve(string relativePath, bool forWrite)
    {
        if (string.IsNullOrWhiteSpace(relativePath) || Path.IsPathRooted(relativePath))
            throw new DraftPathViolationException(relativePath);

        var candidate = Path.GetFullPath(Path.Combine(_root, relativePath));
        if (!candidate.StartsWith(_rootWithSeparator, StringComparison.OrdinalIgnoreCase))
            throw new DraftPathViolationException(relativePath);

        var cursor = _root;
        foreach (var part in Path.GetRelativePath(_root, candidate).Split(new[] { Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar }, StringSplitOptions.RemoveEmptyEntries))
        {
            cursor = Path.Combine(cursor, part);
            if (!File.Exists(cursor) && !Directory.Exists(cursor)) continue;
            var attributes = File.GetAttributes(cursor);
            if ((attributes & FileAttributes.ReparsePoint) != 0)
                throw new DraftPathViolationException(relativePath);
        }

        return candidate;
    }
}
