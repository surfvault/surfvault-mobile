import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useDispatch } from 'react-redux';
import Constants from 'expo-constants';
import { conversationApi } from '../store/apis/endpoints/conversation';
import { notificationApi } from '../store/apis/endpoints/notification';
import { userApi } from '../store/apis/endpoints/user';
import { ApiTag } from '../store/apis/rootApi';
import { getAuthToken } from '../store/apis/customBaseQuery';

export const usePusher = ({ userId }: { userId: string | undefined }) => {
  const dispatch = useDispatch();

  useEffect(() => {
    if (!userId) return;

    const pusherAppKey = Constants.expoConfig?.extra?.pusherAppKey;
    const pusherCluster = Constants.expoConfig?.extra?.pusherCluster;
    const apiBaseUrl = Constants.expoConfig?.extra?.apiBaseUrl ?? 'https://dev-api.surf-vault.com';

    if (!pusherAppKey) return;

    let pusher: any;
    try {
      const PusherModule = require('pusher-js/react-native');
      const PusherClass = PusherModule?.default ?? PusherModule?.Pusher ?? PusherModule;
      if (typeof PusherClass !== 'function') {
        console.warn('Pusher: constructor not available, skipping real-time');
        return;
      }
      pusher = new PusherClass(pusherAppKey, {
        cluster: pusherCluster ?? 'us2',
        // Private, server-authorized channel. customHandler reads the stored
        // auth token and POSTs the subscription to /pusher/auth, which only
        // signs `private-user-{callerId}` — so a user subscribes to their own
        // realtime stream and nobody else's. (Replaces the old public
        // `user-{id}` channel anyone could subscribe to.)
        channelAuthorization: {
          endpoint: `${apiBaseUrl}/pusher/auth`,
          transport: 'ajax',
          customHandler: async (
            { socketId, channelName }: { socketId: string; channelName: string },
            callback: (error: Error | null, authData: any) => void
          ) => {
            try {
              const token = await getAuthToken();
              const res = await fetch(`${apiBaseUrl}/pusher/auth`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/x-www-form-urlencoded',
                  Authorization: `Bearer ${token ?? ''}`,
                },
                body: `socket_id=${encodeURIComponent(socketId)}&channel_name=${encodeURIComponent(channelName)}`,
              });
              if (!res.ok) {
                callback(new Error(`Pusher auth failed (${res.status})`), null);
                return;
              }
              callback(null, await res.json());
            } catch (e) {
              callback(e as Error, null);
            }
          },
        },
      });
    } catch (e) {
      console.warn('Pusher: failed to initialize', e);
      return;
    }

    const channelName = `private-user-${userId}`;
    const channel = pusher.subscribe(channelName);

    // Private-channel auth failures were silent before — if /pusher/auth fails
    // (e.g. expired token) the subscription never establishes and realtime
    // events vanish with no signal. Surface it so it's diagnosable.
    channel.bind('pusher:subscription_error', (status: any) => {
      console.warn('Pusher subscription error', channelName, status);
    });
    pusher.connection.bind(
      'state_change',
      ({ previous, current }: { previous: string; current: string }) => {
        if (current === 'failed' || current === 'unavailable') {
          console.warn('Pusher connection', previous, '→', current);
        }
      }
    );

    // RN suspends the socket when the app backgrounds and pusher-js doesn't
    // always re-establish on resume — nudge it so realtime keeps working
    // without a manual pull-to-refresh.
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && pusher.connection.state !== 'connected') {
        pusher.connect();
      }
    });

    channel.bind('notification', () => {
      // AdPartners keeps any admin ad-moderation surface (e.g. the per-ad
      // review screen) live when a new campaign submission arrives. All
      // endpoints share rootApi, so one invalidate covers both tags.
      dispatch(notificationApi.util.invalidateTags([ApiTag.Notification, ApiTag.AdPartners]));
    });

    channel.bind('message', (data: { conversationId?: string }) => {
      // Targeted: refetch only the affected thread + the list/badge — not every
      // conversation. Falls back to the broad tag if the event predates
      // conversationId (rollout safety).
      dispatch(conversationApi.util.invalidateTags(
        data?.conversationId
          ? [{ type: ApiTag.Conversation, id: data.conversationId }, { type: ApiTag.Conversation, id: 'LIST' }]
          : [ApiTag.Conversation]
      ));
    });

    channel.bind('message-read', (data: { message?: string }) => {
      // message-read carries the conversationId in `data.message`.
      dispatch(conversationApi.util.invalidateTags(
        data?.message
          ? [{ type: ApiTag.Conversation, id: data.message }, { type: ApiTag.Conversation, id: 'LIST' }]
          : [ApiTag.Conversation]
      ));
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
      appStateSub.remove();
      channel.unbind_all();
      pusher.connection.unbind('state_change');
      pusher.unsubscribe(channelName);
      pusher.disconnect();
    };
  }, [userId, dispatch]);
};
