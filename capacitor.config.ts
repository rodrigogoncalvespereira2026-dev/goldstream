import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'pt.goldstream.sonora',
  appName: 'Sonora',
  webDir: 'dist',
  android: {
    allowMixedContent: true,
  },
}

export default config
