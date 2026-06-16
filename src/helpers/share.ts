import { Share, ShareContent, ShareOptions, Linking, Alert } from 'react-native';

/**
 * Wraps `Share.share` so a rejection (common on Android, and in some iOS error
 * states) never becomes an uncaught promise rejection. Preserves the caller's
 * share payload; returns the share result, or null on failure/dismissal.
 */
export async function safeShare(content: ShareContent, options?: ShareOptions) {
  try {
    return await Share.share(content, options);
  } catch (err) {
    console.error('Share failed:', err);
    return null;
  }
}

/**
 * Wraps `Linking.openURL` so a non-openable scheme / malformed user-entered URL
 * surfaces a friendly Alert instead of an uncaught rejection (repo Linking rule).
 */
export async function openUrl(url: string, failureMessage = 'Could not open link') {
  try {
    await Linking.openURL(url);
  } catch (err) {
    console.error('Failed to open URL:', url, err);
    Alert.alert(failureMessage, url);
  }
}
