import 'dotenv/config';
import { ExpoConfig, ConfigContext } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'SurfVault',
  slug: 'surfvault-mobile',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  newArchEnabled: true,
  splash: {
    image: './assets/splash-icon.png',
    resizeMode: 'contain',
    backgroundColor: '#ffffff',
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.surfvault.mobile',
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
    package: 'com.surfvault.mobile',
  },
  scheme: 'surfvault',
  plugins: [
    'expo-router',
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
    pusherBeamsInstanceId: process.env.PUSHER_BEAMS_INSTANCE_ID ?? '',
    pusherCluster: process.env.PUSHER_CLUSTER ?? 'us2',
    revenuecatApiKey: process.env.REVENUCAT_API_KEY ?? '',
    googleClientId: process.env.GOOGLE_CLIENT_ID ?? '',
    environment: process.env.ENVIRONMENT ?? 'dev',
    eas: {
      projectId: 'f0f75cbd-8e64-43a6-b251-438dcd684772',
    },
  },
});
