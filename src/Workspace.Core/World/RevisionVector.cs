using Workspace.Core.Commands;

namespace Workspace.Core.World;

public sealed record RevisionVector(
    long Transform,
    long Parameters,
    long Relationships,
    long Implementation,
    long PackageState)
{
    public static readonly RevisionVector Zero = new(0, 0, 0, 0, 0);

    public long Get(RevisionPlane plane) => plane switch
    {
        RevisionPlane.Transform => Transform,
        RevisionPlane.Parameters => Parameters,
        RevisionPlane.Relationships => Relationships,
        RevisionPlane.Implementation => Implementation,
        RevisionPlane.PackageState => PackageState,
        _ => throw new ArgumentOutOfRangeException(nameof(plane), plane, null),
    };

    public RevisionVector Increment(params RevisionPlane[] planes)
    {
        var set = planes.ToHashSet();
        return this with
        {
            Transform = Transform + (set.Contains(RevisionPlane.Transform) ? 1 : 0),
            Parameters = Parameters + (set.Contains(RevisionPlane.Parameters) ? 1 : 0),
            Relationships = Relationships + (set.Contains(RevisionPlane.Relationships) ? 1 : 0),
            Implementation = Implementation + (set.Contains(RevisionPlane.Implementation) ? 1 : 0),
            PackageState = PackageState + (set.Contains(RevisionPlane.PackageState) ? 1 : 0),
        };
    }
}
