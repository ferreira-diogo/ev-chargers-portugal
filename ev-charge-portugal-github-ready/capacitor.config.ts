import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'pt.evcharge.portugal',
  appName: 'EV Charge Portugal',
  webDir: 'dist',
  android: {
    allowMixedContent: false,
    backgroundColor: '#071b31',
  },
};

export default config;
