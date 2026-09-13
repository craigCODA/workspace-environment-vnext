import path from 'node:path';

export function createElectronBuilderInvocation({ nodeExecutable, builderCliPath }) {
  if (typeof nodeExecutable !== 'string' || nodeExecutable.length === 0) throw new TypeError('A Node executable path is required.');
  if (typeof builderCliPath !== 'string' || builderCliPath.length === 0) throw new TypeError('electron-builder CLI path is required.');
  return {
    executable: nodeExecutable,
    args: [builderCliPath, '--win', 'nsis', '--x64', '--publish', 'never'],
  };
}

export function createM2aWindowsPayloadPaths(distRoot) {
  if (typeof distRoot !== 'string' || distRoot.length === 0) throw new TypeError('A dist root path is required.');
  const unpackedRoot = path.join(distRoot, 'win-unpacked');
  return {
    unpackedExe: path.join(unpackedRoot, 'Workspace Environment.exe'),
    hostExe: path.join(unpackedRoot, 'resources', 'host', 'Workspace.Host.Windows.exe'),
    workspaceHtml: path.join(unpackedRoot, 'resources', 'spatial', 'workspace.html'),
  };
}

export function isM2aWindowsInstallerName(name) {
  return typeof name === 'string' && /^Workspace Environment Setup .+\.exe$/i.test(name);
}

