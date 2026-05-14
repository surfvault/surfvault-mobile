import { config as loadEnv } from 'dotenv';
import { existsSync } from 'fs';
import { join } from 'path';
import { ExpoConfig, ConfigContext } from 'expo/config';

const envFile = existsSync(join(__dirname, '.env.local')) ? '.env.local' : '.env';
loadEnv({ path: join(__dirname, envFile) });

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'SurfVault',
  slug: 'surfvault-mobile',
  version: '1.0.0',
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
    auth0Domain: process.env.AUTH0_DOMAIN ?? '',
    auth0ClientId: process.env.AUTH0_CLIENT_ID ?? '',
    auth0Audience: process.env.AUTH0_AUDIENCE ?? '',
    pusherAppKey: process.env.PUSHER_APP_KEY ?? '',
    pusherCluster: process.env.PUSHER_CLUSTER ?? 'us2',
    revenuecatApiKey: process.env.REVENUCAT_API_KEY ?? '',
    googleClientId: process.env.GOOGLE_CLIENT_ID ?? '',
    environment: process.env.ENVIRONMENT ?? 'dev',
    eas: {
      projectId: 'f0f75cbd-8e64-43a6-b251-438dcd684772',
    },
  },
});
