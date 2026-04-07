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
    infoPlist: {
      NSPhotoLibraryUsageDescription: 'SurfVault needs access to your photo library to upload surf session photos.',
      NSCameraUsageDescription: 'SurfVault needs access to your camera to take surf photos.',
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
        photosPermission: 'SurfVault needs access to your photo library to upload surf session photos.',
        cameraPermission: 'SurfVault needs access to your camera to take surf photos.',
      },
    ],
    'expo-secure-store',
    [
      'expo-location',
      {
        locationWhenInUsePermission: 'SurfVault uses your location to find nearby surf breaks and photographers.',
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
      projectId: process.env.EAS_PROJECT_ID ?? '',
    },
  },
});
