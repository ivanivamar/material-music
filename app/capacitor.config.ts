import type { CapacitorConfig } from '@capacitor/cli'

/**
 * Android app (step 7). The web build in dist/ is bundled into the APK, so the UI works offline;
 * Drive, Google sign-in and audio go through the native PelagicNative plugin
 * (android/app/src/main/java/com/ivan/pelagic/PelagicNativePlugin.kt).
 */
const config: CapacitorConfig = {
  appId: 'com.ivan.pelagic',
  appName: 'Pelagic',
  webDir: 'dist',
  backgroundColor: '#0b0b0c',
  plugins: {
    SystemBars: {
      // edge-to-edge: the page pads itself with env(safe-area-inset-*) (index.html has viewport-fit=cover)
      insetsHandling: 'native',
      initialViewportFitValueHint: 'cover',
      style: 'DARK', // light status-bar icons on the dark UI
    },
    // New Releases reminders (native/releaseNotify.ts): the Pelagic mark in the status bar
    LocalNotifications: {
      smallIcon: 'ic_wg_mark',
      iconColor: '#EDEDED',
    },
  },
}

export default config
