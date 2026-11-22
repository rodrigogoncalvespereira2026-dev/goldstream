import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'pt.goldstream.sonora',
  appName: 'Sonora',
  webDir: 'dist',
  // O app abre a versão publicada: qualquer alteração chega sem instalar um APK novo.
  // Se o site não responder, fica a cópia local (dist) como rede de segurança.
  server: {
    url: 'https://goldstream-uzxb.onrender.com',
    cleartext: false,
    errorPath: 'offline.html',
  },
  android: {
    allowMixedContent: true,
  },
}

export default config
