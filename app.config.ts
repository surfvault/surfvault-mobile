import { config as loadEnv } from 'dotenv';
import { existsSync } from 'fs';
import { join } from 'path';
import { ExpoConfig, ConfigContext } from 'expo/config';

const envFile = existsSync(join(__dirname, '.env.local')) ? '.env.local' : '.env';
loadEnv({ path: join(__dirname, envFile) });

// Single source of truth for the marketing version (CFBundleShortVersionString
// / versionName). Bump with `npm run bump:patch|minor|major` — EAS only
// auto-increments the build number, not this semver.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { version: appVersion } = require('./package.json') as { version: string };

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'SurfVault',
  slug: 'surfvault-mobile',
  version: appVersion,
  platforms: ['ios', 'android'],
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  newArchEnabled: true,
  runtimeVersion: { policy: 'fingerprint' },
  updates: {
    url: 'https://u.expo.dev/f0f75cbd-8e64-43a6-b251-438dcd684772',
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.surfvaultapp.mobile',
    usesAppleSignIn: true,
    // Universal Links: shared web URLs auto-open the app when installed.
    // Path filtering (shareable content only) lives in the AASA file served
    // at each host's /.well-known/apple-app-site-association.
    associatedDomains: [
      'applinks:app.surf-vault.com',
      'applinks:share.surf-vault.com',
    ],
    entitlements: {
      'com.apple.developer.applesignin': ['Default'],
    },
    infoPlist: {
      NSPhotoLibraryUsageDescription: 'Allow SurfVault to access your photos so you can upload surf session images and update your profile picture.',
      NSPhotoLibraryAddUsageDescription: 'Allow SurfVault to save surf photos from your sessions and approved access requests to your camera roll.',
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#ffffff',
    },
    edgeToEdgeEnabled: true,
    package: 'com.surfvaultapp.mobile',
    // App Links: autoVerify against each host's /.well-known/assetlinks.json
    // (must contain this package's release signing SHA-256 fingerprint).
    // Route-level filtering happens in app/+native-intent.tsx.
    intentFilters: [
      {
        action: 'VIEW',
        autoVerify: true,
        data: [
          { scheme: 'https', host: 'app.surf-vault.com' },
          { scheme: 'https', host: 'share.surf-vault.com' },
        ],
        category: ['BROWSABLE', 'DEFAULT'],
      },
    ],
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? './google-services.json',
    permissions: [
      'ACCESS_FINE_LOCATION',
      'ACCESS_COARSE_LOCATION',
      'READ_MEDIA_IMAGES',
      'READ_EXTERNAL_STORAGE',
      'WRITE_EXTERNAL_STORAGE',
      'POST_NOTIFICATIONS',
    ],
    config: {
      googleMaps: {
        apiKey: process.env.GOOGLE_MAPS_API_KEY ?? '',
      },
    },
  },
  scheme: 'surfvault',
  plugins: [
    'expo-router',
    'expo-video',
    [
      'expo-splash-screen',
      {
        image: './assets/splash-icon.png',
        imageWidth: 680,
        resizeMode: 'contain',
        backgroundColor: '#ffffff',
        dark: {
          image: './assets/splash-icon-dark.png',
          imageWidth: 680,
          resizeMode: 'contain',
          backgroundColor: '#000000',
        },
        // Android 12+ clips the splash image to a circle. Use the wordmark
        // logo sized to fit cleanly inside the splash circle.
        android: {
          image: './assets/surfvault-logo.png',
          imageWidth: 200,
          resizeMode: 'contain',
          backgroundColor: '#ffffff',
          dark: {
            image: './assets/surfvault-logo-dark.png',
            imageWidth: 200,
            resizeMode: 'contain',
            backgroundColor: '#000000',
          },
        },
      },
    ],
    [
      'expo-notifications',
      {
        icon: './assets/icon.png',
        color: '#0ea5e9',
      },
    ],
    [
      'expo-image-picker',
      {
        photosPermission: 'Allow SurfVault to access your photos so you can upload surf session images and update your profile picture.',
        cameraPermission: false,
      },
    ],
    [
      'expo-media-library',
      {
        photosPermission: 'Allow SurfVault to access your photos so you can upload surf session images and update your profile picture.',
        savePhotosPermission: 'Allow SurfVault to save surf photos from your sessions and approved access requests to your camera roll.',
      },
    ],
    'expo-secure-store',
    [
      'expo-location',
      {
        locationWhenInUsePermission: 'Allow SurfVault to use your location to show nearby surf breaks, photographers, and sessions on the map and discover feed.',
      },
    ],
    [
      'react-native-auth0',
      {
        domain: process.env.AUTH0_DOMAIN ?? '',
      },
    ],
  ],
  extra: {
    apiBaseUrl: process.env.API_BASE_URL ?? 'https://dev-api.surf-vault.com',
    // Web app base — billing handoffs (plans/credits) open this URL. Env-bound
    // so dev builds hit the dev web, prod builds hit prod (no more clicking a
    // dev TestFlight link and landing on production checkout).
    webAppBase: process.env.WEB_APP_BASE ?? 'https://app.surf-vault.com',
    auth0Domain: process.env.AUTH0_DOMAIN ?? '',
    auth0ClientId: process.env.AUTH0_CLIENT_ID ?? '',
    auth0Audience: process.env.AUTH0_AUDIENCE ?? '',
    pusherAppKey: process.env.PUSHER_APP_KEY ?? '',
    pusherCluster: process.env.PUSHER_CLUSTER ?? 'us2',
    revenuecatApiKey: process.env.REVENUCAT_API_KEY ?? '',
    googleClientId: process.env.GOOGLE_CLIENT_ID ?? '',
    // YouTube Data API v3 key (enables film publish-date + description autofill
    // in CreateFilmSheet). Reuse the same key as the backend YOUTUBE_API_KEY
    // (API-restricted to YouTube Data API). Empty → autofill silently skipped.
    youtubeApiKey: process.env.YOUTUBE_API_KEY ?? '',
    environment: process.env.ENVIRONMENT ?? 'dev',
    eas: {
      projectId: 'f0f75cbd-8e64-43a6-b251-438dcd684772',
    },
  },
});
