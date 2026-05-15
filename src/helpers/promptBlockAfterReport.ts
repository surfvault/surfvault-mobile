import { Alert } from 'react-native';

// After a successful report (session/board/message/user), give the reporter a
// one-tap path to also block the offender. Apple Guideline 1.2 strongly
// encourages this: reporting alone is a passive signal; blocking is what
// actually removes the abuser's content from the reporter's feed.
//
// Caller passes a thunk that calls `.unwrap()` on the RTK Query mutation so
// errors surface here. If userId/handle aren't available (e.g. ad reports
// where there's no blockable user), falls back to a plain success alert.
export function promptBlockAfterReport(opts: {
  userId?: string | null;
  handle?: string | null;
  blockUser?: (args: { userId: string }) => Promise<unknown>;
}) {
  const { userId, handle, blockUser } = opts;

  if (!userId || !handle || !blockUser) {
    Alert.alert('Report submitted', 'Thanks — our team will review it and take appropriate action.');
    return;
  }

  Alert.alert(
    'Report submitted',
    `Thanks — our team will review it.\n\nWant to also block @${handle}? They won't be able to contact you and their content will be hidden from your feed.`,
    [
      { text: 'Not now', style: 'cancel' },
      {
        text: 'Block',
        style: 'destructive',
        onPress: async () => {
          try {
            await blockUser({ userId });
          } catch (e: any) {
            Alert.alert('Could not block', e?.data?.message || 'Please try again.');
          }
        },
      },
    ],
  );
}
