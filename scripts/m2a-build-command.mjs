export function createElectronBuilderInvocation({ nodeExecutable, builderCliPath }) {
  if (typeof nodeExecutable !== 'string' || nodeExecutable.length === 0) throw new TypeError('A Node executable path is required.');
  if (typeof builderCliPath !== 'string' || builderCliPath.length === 0) throw new TypeError('electron-builder CLI path is required.');
  return {
    executable: nodeExecutable,
    args: [builderCliPath, '--win', 'nsis', '--x64', '--publish', 'never'],
  };
}
