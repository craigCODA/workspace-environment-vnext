export interface TrustedRecoveryActions {
  packagesPaused(): boolean;
  setPackagesPaused(paused: boolean): void;
  disableCurrentPackage(): Promise<void>;
}

export function createTrustedRecoveryControls(actions: TrustedRecoveryActions): HTMLElement {
  const root = document.createElement('div');
  root.dataset.trustedRecovery = 'true';

  const pause = document.createElement('button');
  pause.type = 'button';
  pause.textContent = 'Pause packages';
  pause.addEventListener('click', () => {
    const next = !actions.packagesPaused();
    actions.setPackagesPaused(next);
    pause.textContent = next ? 'Resume packages' : 'Pause packages';
  });

  const disable = document.createElement('button');
  disable.type = 'button';
  disable.textContent = 'Disable current package';
  disable.addEventListener('click', () => {
    disable.disabled = true;
    void actions.disableCurrentPackage().finally(() => {
      disable.disabled = false;
    });
  });

  root.append(pause, disable);
  return root;
}
