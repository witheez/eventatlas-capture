import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'EventAtlas Capture',
    version: '1.2.0',
    description: 'Capture web content for EventAtlas - one-click content capture from any webpage',
    permissions: ['activeTab', 'storage', 'sidePanel', 'tabs', 'scripting'],
    host_permissions: ['<all_urls>'],
    action: {
      default_title: 'Open EventAtlas Capture',
    },
  },
  srcDir: '.',
  // Preact configuration
  alias: {
    react: 'preact/compat',
    'react-dom': 'preact/compat',
  },
});
