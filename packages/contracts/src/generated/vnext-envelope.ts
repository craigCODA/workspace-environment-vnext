export interface VNextEnvelope {
    command?:         CommandName;
    payload?:         { [key: string]: unknown } | null;
    protocolVersion:  number;
    requestId?:       string;
    type:             Type;
    accepted?:        boolean;
    errorCode?:       null | string;
    candidateId?:     string;
    entityId?:        string;
    generationToken?: string;
    manifestJson?:    string;
    source?:          string;
    revisionDigest?:  string;
    message?:         null | string;
}

export type CommandName = "world.read" | "entity.inspect" | "package.inspect" | "capability.inspect" | "entity.create" | "entity.remove" | "entity.rename" | "entity.reparent" | "transform.set" | "parameters.patch" | "relationships.add" | "relationships.remove" | "reference.grant" | "reference.revoke" | "constraint.add" | "constraint.remove" | "edit.begin" | "edit.update" | "edit.commit" | "edit.cancel" | "history.undo" | "history.redo" | "workspace.save" | "instance.duplicate" | "parameters.copy" | "package.fork" | "package.publish" | "package.activate" | "package.disable" | "package.rollback" | "package.delete" | "package.state.patch" | "workspace.import" | "workspace.export" | "application.search" | "application.open" | "window.focus" | "surface.bindWindow" | "application.profile.save" | "application.profile.delete" | "application.close" | "application.restart";

export type Type = "command.request" | "command.result" | "runtime.prepare" | "runtime.prepared" | "runtime.activate" | "runtime.retire" | "runtime.failed";
