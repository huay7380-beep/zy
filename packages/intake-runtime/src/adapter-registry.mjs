import { normalizeSourceAdapterCapability } from './intake-normalizer.mjs';

export function createAdapterRegistry(capabilities = []) {
  const adapters = new Map();
  for (const capability of capabilities) {
    const normalized = normalizeSourceAdapterCapability(capability);
    adapters.set(normalized.adapter_id, normalized);
  }

  return {
    list() {
      return [...adapters.values()];
    },
    get(adapterId) {
      return adapters.get(adapterId) ?? null;
    },
    register(capability) {
      const normalized = normalizeSourceAdapterCapability(capability);
      adapters.set(normalized.adapter_id, normalized);
      return normalized;
    },
    require(adapterId) {
      const found = adapters.get(adapterId);
      if (!found) throw new Error(`Unknown source adapter: ${adapterId}`);
      return found;
    }
  };
}

export const builtInAdapterCapabilities = [
  {
    adapter_id: 'sightflow_desktop.wechat',
    adapter_version: '0.1.0',
    source_type: 'desktop',
    platform: 'wechat',
    capabilities: {
      can_receive: true,
      can_send: true,
      can_capture_screenshot: true,
      can_read_dom: false,
      can_identify_thread: true,
      can_verify_target: true,
      requires_user_confirmation: true
    },
    metadata: {
      bridge_mode: 'zhineng_bridge',
      real_execution_default: false
    }
  },
  {
    adapter_id: 'browser_dom.sample',
    adapter_version: '0.1.0',
    source_type: 'browser',
    platform: 'web',
    capabilities: {
      can_receive: true,
      can_send: false,
      can_capture_screenshot: false,
      can_read_dom: true,
      can_identify_thread: true,
      can_verify_target: false,
      requires_user_confirmation: true
    },
    metadata: {
      sample_only: true
    }
  },
  {
    adapter_id: 'fake_test.adapter',
    adapter_version: '0.1.0',
    source_type: 'api',
    platform: 'test',
    capabilities: {
      can_receive: true,
      can_send: false,
      can_capture_screenshot: false,
      can_read_dom: false,
      can_identify_thread: false,
      can_verify_target: false,
      requires_user_confirmation: true
    },
    metadata: {
      sample_only: true
    }
  }
];

export function createBuiltInAdapterRegistry() {
  return createAdapterRegistry(builtInAdapterCapabilities);
}

