export interface DiscoveredWindowView {
  id: string;
  title: string;
  application: string;
}

export interface PickerItem {
  windowId: string;
  label: string;
}

export class ApplicationPicker {
  readonly #search: () => Promise<{ status: string; windows: DiscoveredWindowView[] }>;
  readonly #bindWindow: (windowId: string) => Promise<void>;
  readonly #render: (items: PickerItem[]) => void;
  constructor(options: {
    search: () => Promise<{ status: string; windows: DiscoveredWindowView[] }>;
    bind: (windowId: string) => Promise<void>;
    render: (items: PickerItem[]) => void;
  }) {
    this.#search = options.search;
    this.#bindWindow = options.bind;
    this.#render = options.render;
  }
  async refresh(): Promise<string> {
    const result = await this.#search();
    this.#render((result.windows ?? []).map(window => ({
      windowId: window.id,
      label: [window.title, window.application].filter(text => text.trim()).join(' · ') || window.id,
    })));
    return result.status;
  }
  bind(windowId: string): Promise<void> { return this.#bindWindow(windowId); }
}

export function readDiscoveredWindows(payload: Record<string, unknown> | null | undefined): { status: string; windows: DiscoveredWindowView[] } {
  const status = typeof payload?.status === 'string' ? payload.status : 'unavailable';
  const windows = Array.isArray(payload?.windows) ? payload.windows.flatMap(value => {
    if (!value || typeof value !== 'object') return [];
    const window = value as Record<string, unknown>;
    if (typeof window.id !== 'string') return [];
    return [{
      id: window.id,
      title: typeof window.title === 'string' ? window.title : '',
      application: typeof window.application === 'string' ? window.application : '',
    }];
  }) : [];
  return { status, windows };
}
