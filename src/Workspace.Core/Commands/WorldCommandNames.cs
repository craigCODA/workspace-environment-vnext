namespace Workspace.Core.Commands;

public static class WorldCommandNames
{
    public const string EntityCreate = "entity.create";
    public const string EntityRemove = "entity.remove";
    public const string EntityRename = "entity.rename";
    public const string EntityReparent = "entity.reparent";
    public const string TransformSet = "transform.set";
    public const string ParametersPatch = "parameters.patch";
    public const string RelationshipsAdd = "relationships.add";
    public const string RelationshipsRemove = "relationships.remove";
    public const string HistoryUndo = "history.undo";
    public const string HistoryRedo = "history.redo";
}
