import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'EventAtlas Capture',
    version: '1.1.1',
    description: 'Capture web content for EventAtlas - one-click content capture from any webpage',
    permissions: ['activeTab', 'storage', 'sidePanel', 'tabs', 'scripting'],
    host_permissions: ['<all_urls>'],
    action: {
      default_title: 'Open EventAtlas Capture',
    },
  },
  // Keep JavaScript for now (Phase 1 - no TypeScript conversion yet)
  srcDir: '.',
});
