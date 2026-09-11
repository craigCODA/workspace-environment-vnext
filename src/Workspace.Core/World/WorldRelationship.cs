namespace Workspace.Core.World;

public enum MissingTargetPolicy
{
    MarkMissing,
    RemoveRelationship,
}

public sealed record WorldRelationship(
    string Type,
    string TargetId,
    MissingTargetPolicy MissingTargetPolicy,
    string? WriteGrantId,
    bool TargetMissing);
