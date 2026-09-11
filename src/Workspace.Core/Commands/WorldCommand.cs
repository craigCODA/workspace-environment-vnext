using System.Text.Json;
using Workspace.Core.World;

namespace Workspace.Core.Commands;

public abstract record WorldCommand(string RequestId, IReadOnlyDictionary<RevisionPlane, long> Expected);

public sealed record EntityCreateCommand(string RequestId, WorldEntity Entity, IReadOnlyDictionary<RevisionPlane, long> Expected)
    : WorldCommand(RequestId, Expected);
public sealed record EntityRemoveCommand(string RequestId, string EntityId, IReadOnlyDictionary<RevisionPlane, long> Expected)
    : WorldCommand(RequestId, Expected);
public sealed record EntityRenameCommand(string RequestId, string EntityId, string Name, IReadOnlyDictionary<RevisionPlane, long> Expected)
    : WorldCommand(RequestId, Expected);
public sealed record EntityReparentCommand(string RequestId, string EntityId, string? ParentId, IReadOnlyDictionary<RevisionPlane, long> Expected)
    : WorldCommand(RequestId, Expected);
public sealed record TransformSetCommand(string RequestId, string EntityId, TransformState Transform, IReadOnlyDictionary<RevisionPlane, long> Expected)
    : WorldCommand(RequestId, Expected);
public sealed record ParametersPatchCommand(string RequestId, string EntityId, IReadOnlyDictionary<string, JsonElement> Patch, IReadOnlyDictionary<RevisionPlane, long> Expected)
    : WorldCommand(RequestId, Expected);
public sealed record RelationshipAddCommand(string RequestId, string EntityId, WorldRelationship Relationship, IReadOnlyDictionary<RevisionPlane, long> Expected)
    : WorldCommand(RequestId, Expected);
public sealed record RelationshipRemoveCommand(string RequestId, string EntityId, string Type, string TargetId, IReadOnlyDictionary<RevisionPlane, long> Expected)
    : WorldCommand(RequestId, Expected);
public sealed record HistoryUndoCommand(string RequestId)
    : WorldCommand(RequestId, new Dictionary<RevisionPlane, long>());
public sealed record HistoryRedoCommand(string RequestId)
    : WorldCommand(RequestId, new Dictionary<RevisionPlane, long>());
