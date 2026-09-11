namespace Workspace.Contracts.Generated
{
    using System.Collections.Generic;

    public partial class VNextEnvelope
    {
        public CommandName? Command { get; set; }
        public Dictionary<string, object>? Payload { get; set; }
        public double ProtocolVersion { get; set; }
        public string? RequestId { get; set; }
        public TypeEnum Type { get; set; }
        public bool? Accepted { get; set; }
        public string? ErrorCode { get; set; }
        public string? CandidateId { get; set; }
        public string? EntityId { get; set; }
        public string? GenerationToken { get; set; }
        public string? ManifestJson { get; set; }
        public string? Source { get; set; }
        public string? RevisionDigest { get; set; }
        public string? Message { get; set; }
    }

    public enum CommandName { ApplicationClose, ApplicationOpen, ApplicationProfileDelete, ApplicationProfileSave, ApplicationRestart, ApplicationSearch, CapabilityInspect, ConstraintAdd, ConstraintRemove, EditBegin, EditCancel, EditCommit, EditUpdate, EntityCreate, EntityInspect, EntityRemove, EntityRename, EntityReparent, HistoryRedo, HistoryUndo, InstanceDuplicate, PackageActivate, PackageDelete, PackageDisable, PackageFork, PackageInspect, PackagePublish, PackageRollback, PackageStatePatch, ParametersCopy, ParametersPatch, ReferenceGrant, ReferenceRevoke, RelationshipsAdd, RelationshipsRemove, SurfaceBindWindow, TransformSet, WindowFocus, WorkspaceExport, WorkspaceImport, WorkspaceSave, WorldRead };

    public enum TypeEnum { CommandRequest, CommandResult, RuntimeActivate, RuntimeFailed, RuntimePrepare, RuntimePrepared, RuntimeRetire };
}
