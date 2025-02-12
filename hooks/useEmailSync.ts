import { useEffect, useState, useCallback, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { collection, query, onSnapshot, where, orderBy, limit, Timestamp, getDocs, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Conversation, Message } from '@/types';
import { useNotifications } from './useNotifications';

export function useEmailSync() {
  const { data: session } = useSession();
  const [emailConversations, setEmailConversations] = useState<Conversation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const { showNotification } = useNotifications();
  
  // Track processed message IDs to prevent duplicates
  const processedMessageIds = useRef(new Set<string>());
  const emailsByThreadRef = useRef(new Map<string, Map<string, any>>());
  const unsubscribeRef = useRef<(() => void) | null>(null);

  // Set up Gmail push notifications
  useEffect(() => {
    if (!session?.user?.id) return;

    const setupPushNotifications = async () => {
      try {
        const response = await fetch('/api/watch', {
          method: 'POST',
        });
        
        if (!response.ok) {
          const error = await response.json();
          console.error('[useEmailSync] Failed to set up Gmail watch:', error);
          if (error.shouldRefresh) {
            // Token needs refresh, reload the page
            window.location.reload();
          }
        } else {
          console.log('[useEmailSync] Successfully set up Gmail watch');
        }
      } catch (error) {
        console.error('[useEmailSync] Error setting up Gmail watch:', error);
      }
    };

    setupPushNotifications();
  }, [session?.user?.id]);

  // Helper function to create a unique message ID
  const createUniqueMessageId = useCallback((email: any) => {
    return `${email.messageId}`;
  }, []);

  // Helper function to create a conversation from emails
  const createConversation = useCallback((threadId: string, emailsMap: Map<string, any>): Conversation => {
    const emails = Array.from(emailsMap.values());
    // Sort emails by timestamp
    emails.sort((a, b) => a.receivedAt.toMillis() - b.receivedAt.toMillis());
    
    const messages: Message[] = emails.map(email => ({
      id: createUniqueMessageId(email),
      content: email.body || '',
      sender: email.from === session?.user?.email ? 'me' : email.from,
      timestamp: email.receivedAt.toDate().toISOString(),
      reactions: [],
      isEmailThread: true,
      htmlContent: email.htmlBody,
      attachments: email.attachments?.map(attachment => ({
        url: attachment.url,
        filename: attachment.filename,
        mimeType: attachment.mimeType,
        attachmentId: attachment.attachmentId
      }))
    }));

    const latestEmail = emails[emails.length - 1];
    return {
      id: threadId,
      threadId: threadId,
      recipients: emails[0].to.map((to: string) => ({ name: to, id: to })),
      messages,
      lastMessageTime: latestEmail.receivedAt.toDate().toISOString(),
      unreadCount: emails.filter(email => !email.isRead && email.from !== session?.user?.email).length,
      pinned: false,
      hideAlerts: false,
      isEmailThread: true,
    };
  }, [session?.user?.email, createUniqueMessageId]);

  // Function to process emails and update state
  const processEmails = useCallback((emails: any[]) => {
    let hasChanges = false;
    let newEmailCount = 0;
    
    emails.forEach(email => {
      const messageId = createUniqueMessageId(email);
      const threadId = email.threadId;
      
      // Skip if we've already processed this message ID
      if (processedMessageIds.current.has(messageId)) {
        return;
      }

      // Get or create thread email map
      let threadEmails = emailsByThreadRef.current.get(threadId);
      if (!threadEmails) {
        threadEmails = new Map();
        emailsByThreadRef.current.set(threadId, threadEmails);
      }

      // Add email
      if (!threadEmails.has(messageId)) {
        threadEmails.set(messageId, email);
        processedMessageIds.current.add(messageId);
        hasChanges = true;
        
        // Count new unread emails not from the current user
        if (!email.isRead && email.from !== session?.user?.email) {
          newEmailCount++;
        }
      }
    });

    if (hasChanges) {
      const conversations: Conversation[] = [];
      emailsByThreadRef.current.forEach((emailsMap, threadId) => {
        try {
          conversations.push(createConversation(threadId, emailsMap));
        } catch (error) {
          console.error('[useEmailSync] Error processing thread:', threadId, error);
        }
      });

      // Sort conversations by last message time
      conversations.sort((a, b) => new Date(b.lastMessageTime).getTime() - new Date(a.lastMessageTime).getTime());
      setEmailConversations(conversations);

      // Show notification for new emails
      if (newEmailCount > 0) {
        showNotification('New Email', {
          body: `You have ${newEmailCount} new email${newEmailCount === 1 ? '' : 's'}`,
          icon: '/app-icon.svg'
        });
      }
    }
    
    setIsSyncing(false);
  }, [createUniqueMessageId, createConversation, session?.user?.email, showNotification]);

  useEffect(() => {
    if (!session?.user?.id) {
      console.log('[useEmailSync] No user ID in session, skipping email sync');
      return;
    }

    // Clean up previous subscription if it exists
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
      emailsByThreadRef.current.clear();
      processedMessageIds.current.clear();
    }

    setIsSyncing(true);
    const emailsRef = collection(db, 'users', session.user.id, 'emails');
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Try the optimized query first
    const optimizedQuery = query(
      emailsRef,
      where('userId', '==', session.user.id),
      where('receivedAt', '>=', Timestamp.fromDate(thirtyDaysAgo)),
      orderBy('receivedAt', 'desc'),
      limit(100)
    );

    // Simpler fallback query that doesn't require the composite index
    const fallbackQuery = query(
      emailsRef,
      where('userId', '==', session.user.id),
      limit(100)
    );

    // Try to set up the optimized listener first
    const setupListener = async () => {
      try {
        // First try to get initial data with optimized query
        const snapshot = await getDocs(optimizedQuery);
        const emails = snapshot.docs.map(doc => doc.data());
        processEmails(emails);

        // Set up real-time listener with optimized query
        return onSnapshot(optimizedQuery, (snapshot) => {
          const emails = snapshot.docs.map(doc => doc.data());
          processEmails(emails);
        }, async (error) => {
          if (error.message.includes('requires an index')) {
            console.warn('[useEmailSync] Missing index, using fallback query. Please create the index at:', error.message.split('create it here: ')[1]);
            
            // Use fallback query if index is missing
            const fallbackSnapshot = await getDocs(fallbackQuery);
            const fallbackEmails = fallbackSnapshot.docs.map(doc => doc.data());
            processEmails(fallbackEmails);

            // Set up real-time listener with fallback query
            return onSnapshot(fallbackQuery, (snapshot) => {
              const emails = snapshot.docs.map(doc => doc.data());
              processEmails(emails);
            }, (error) => {
              console.error('[useEmailSync] Fallback query failed:', error);
              setError('Failed to sync emails. Please try again later.');
              setIsSyncing(false);
            });
          } else {
            console.error('[useEmailSync] Optimized query failed:', error);
            setError('Failed to sync emails. Please try again later.');
            setIsSyncing(false);
          }
        });
      } catch (error: any) {
        if (error.message.includes('requires an index')) {
          console.warn('[useEmailSync] Missing index, using fallback query. Please create the index at:', error.message.split('create it here: ')[1]);
          
          // Use fallback query if index is missing
          const fallbackSnapshot = await getDocs(fallbackQuery);
          const fallbackEmails = fallbackSnapshot.docs.map(doc => doc.data());
          processEmails(fallbackEmails);

          return onSnapshot(fallbackQuery, (snapshot) => {
            const emails = snapshot.docs.map(doc => doc.data());
            processEmails(emails);
          }, (error) => {
            console.error('[useEmailSync] Fallback query failed:', error);
            setError('Failed to sync emails. Please try again later.');
            setIsSyncing(false);
          });
        } else {
          console.error('[useEmailSync] Initial optimized query failed:', error);
          setError('Failed to sync emails. Please try again later.');
          setIsSyncing(false);
        }
      }
    };

    // Set up initial listener
    setupListener().then(unsubscribe => {
      if (unsubscribe) {
        unsubscribeRef.current = unsubscribe;
      }
    });

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, [session?.user?.id, processEmails]);

  // Listen for sync triggers
  useEffect(() => {
    if (!session?.user?.id) return;

    const userRef = doc(db, 'users', session.user.id);
    const unsubscribe = onSnapshot(userRef, async (snapshot) => {
      const data = snapshot.data();
      if (!data) return;

      const lastSyncTrigger = data.lastSyncTrigger?.toDate();
      if (!lastSyncTrigger) return;

      // Only sync if the trigger is recent (within the last minute)
      const isRecentTrigger = Date.now() - lastSyncTrigger.getTime() < 60000;
      if (!isRecentTrigger) return;

      console.log('[useEmailSync] Received sync trigger:', data.syncReason);
      
      try {
        setIsSyncing(true);
        const response = await fetch('/api/sync', {
          method: 'POST',
        });
        
        if (!response.ok) {
          const error = await response.json();
          console.error('[useEmailSync] Sync failed:', error);
          if (error.shouldRefresh) {
            window.location.reload();
          }
        }
      } catch (error) {
        console.error('[useEmailSync] Error syncing emails:', error);
      } finally {
        setIsSyncing(false);
      }
    });

    return () => unsubscribe();
  }, [session?.user?.id]);

  // Set up automatic periodic sync
  useEffect(() => {
    if (!session?.user?.id) return;

    // Sync every 30 seconds
    const syncInterval = setInterval(async () => {
      try {
        setIsSyncing(true);
        const response = await fetch('/api/sync', {
          method: 'POST',
        });
        
        if (!response.ok) {
          const error = await response.json();
          console.error('[useEmailSync] Periodic sync failed:', error);
          if (error.shouldRefresh) {
            window.location.reload();
          }
        }
      } catch (error) {
        console.error('[useEmailSync] Error in periodic sync:', error);
      } finally {
      setIsSyncing(false);
      }
    }, 30000); // 30 seconds

    return () => clearInterval(syncInterval);
  }, [session?.user?.id]);

  return { emailConversations, error, isSyncing };
} 