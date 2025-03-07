import { useEffect, useCallback } from 'react';
import { useToast } from './use-toast';

export function useNotifications() {
  const { toast } = useToast();

  const requestNotificationPermission = useCallback(async () => {
    if (!('Notification' in window)) {
      console.log('This browser does not support notifications');
      return;
    }

    if (Notification.permission === 'granted') {
      return;
    }

    try {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        console.log('Notification permission granted');
      }
    } catch (error) {
      console.error('Error requesting notification permission:', error);
    }
  }, []);

  const showNotification = useCallback((title: string, options?: NotificationOptions) => {
    if (Notification.permission === 'granted') {
      try {
        const notification = new Notification(title, {
          icon: '/app-icon.svg',
          ...options,
        });

        notification.onclick = () => {
          window.focus();
          notification.close();
        };

        // Also show a toast for in-app notification
        toast({
          title,
          description: options?.body,
        });
      } catch (error) {
        console.error('Error showing notification:', error);
        // Fallback to toast only
        toast({
          title,
          description: options?.body,
        });
      }
    }
  }, [toast]);

  // Request permission when the hook is first used
  useEffect(() => {
    requestNotificationPermission();
  }, [requestNotificationPermission]);

  return { showNotification };
} 