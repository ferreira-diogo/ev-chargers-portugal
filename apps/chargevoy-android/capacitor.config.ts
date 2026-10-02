import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.chargevoy.mobile',
  appName: 'ChargeVoy',
  webDir: 'dist',
  android: {
    allowMixedContent: false,
    backgroundColor: '#071b31',
  },
};

export default config;
