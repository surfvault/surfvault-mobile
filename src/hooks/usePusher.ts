import { useEffect } from 'react';
import { useDispatch } from 'react-redux';
import Constants from 'expo-constants';
import { conversationApi } from '../store/apis/endpoints/conversation';
import { notificationApi } from '../store/apis/endpoints/notification';
import { userApi } from '../store/apis/endpoints/user';
import { ApiTag } from '../store/apis/rootApi';

export const usePusher = ({ userId }: { userId: string | undefined }) => {
  const dispatch = useDispatch();

  useEffect(() => {
    if (!userId) return;

    const pusherAppKey = Constants.expoConfig?.extra?.pusherAppKey;
    const pusherCluster = Constants.expoConfig?.extra?.pusherCluster;

    if (!pusherAppKey) return;

    let pusher: any;
    try {
      const PusherModule = require('pusher-js/react-native');
      const PusherClass = PusherModule?.default ?? PusherModule;
      if (typeof PusherClass !== 'function') {
        console.warn('Pusher: constructor not available, skipping real-time');
        return;
      }
      pusher = new PusherClass(pusherAppKey, {
        cluster: pusherCluster ?? 'us2',
      });
    } catch (e) {
      console.warn('Pusher: failed to initialize', e);
      return;
    }

    const channel = pusher.subscribe(`user-${userId}`);

    channel.bind('notification', () => {
      dispatch(notificationApi.util.invalidateTags([ApiTag.Notification]));
    });

    channel.bind('message', () => {
      dispatch(conversationApi.util.invalidateTags([ApiTag.Conversation]));
    });

    channel.bind('message-read', () => {
      dispatch(conversationApi.util.invalidateTags([ApiTag.Conversation]));
    });

    channel.bind('subscription', () => {
      dispatch(userApi.util.invalidateTags([ApiTag.User]));
    });

    channel.bind('download-ready', (data: { error?: boolean; downloadUrl?: string }) => {
      if (data.error) {
        // TODO: Handle download failure (Phase 7)
        return;
      }
      // TODO: Handle download with expo-file-system + expo-sharing (Phase 7)
    });

    return () => {
      channel.unbind_all();
      pusher.unsubscribe(`user-${userId}`);
      pusher.disconnect();
    };
  }, [userId, dispatch]);
};
