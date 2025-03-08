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
    
    const messages: Message[] = emails.map(email => {
      // Extract sender name from email.from if it contains a name
      let senderName = email.from;
      if (email.from === session?.user?.email) {
        senderName = 'me';
      } else if (email.from.includes('<')) {
        // Extract name from format "Name <email@example.com>"
        const nameMatch = email.from.match(/(.*?)\s*<.*>/);
        if (nameMatch && nameMatch[1]) {
          senderName = nameMatch[1].trim();
        }
      }
      
      // Add debug logging only in development mode
      if (process.env.NODE_ENV === 'development') {
        console.log('Creating message from email:', {
          id: email.messageId,
          content: email.content?.substring(0, 50) || email.body?.substring(0, 50) || '[No content]',
          htmlContent: email.htmlContent?.substring(0, 50) || email.htmlBody?.substring(0, 50) || '[No HTML content]',
          from: email.from,
          senderName,
          hasAttachments: !!email.attachments?.length
        });
      }
      
      return {
        id: createUniqueMessageId(email),
        content: email.content || email.body || '',
        sender: senderName,
        timestamp: email.receivedAt.toDate().toISOString(),
        reactions: [],
        isEmailThread: true,
        htmlContent: email.htmlContent || email.htmlBody || '',
        type: 'message',
        attachments: email.attachments?.map((attachment: any) => ({
          url: attachment.url,
          filename: attachment.filename,
          mimeType: attachment.mimeType,
          attachmentId: attachment.attachmentId
        }))
      };
    });

    const latestEmail = emails[emails.length - 1];
    
    // Extract recipient names from email addresses
    const recipients = emails[0].to.map((to: string) => {
      let name = to;
      let id = to;
      
      // Extract name from format "Name <email@example.com>"
      if (to.includes('<')) {
        const nameMatch = to.match(/(.*?)\s*<(.*)>/);
        if (nameMatch && nameMatch[1] && nameMatch[2]) {
          name = nameMatch[1].trim();
          id = nameMatch[2].trim();
        }
      }
      
      return { name, id };
    });
    
    // Add sender as first recipient for proper avatar display
    if (emails[0].from !== session?.user?.email) {
      let senderName = emails[0].from;
      let senderId = emails[0].from;
      
      // Extract name from format "Name <email@example.com>"
      if (emails[0].from.includes('<')) {
        const nameMatch = emails[0].from.match(/(.*?)\s*<(.*)>/);
        if (nameMatch && nameMatch[1] && nameMatch[2]) {
          senderName = nameMatch[1].trim();
          senderId = nameMatch[2].trim();
        }
      }
      
      // Create a simple avatar from the first letter of the sender's name
      const firstLetter = senderName.charAt(0).toUpperCase();
      
      // Use iMessage-like gradient colors
      const gradientStart = '#9BA1AA';
      const gradientEnd = '#7D828A';
      
      // Add sender as first recipient with a data URI for the avatar
      // Encode the SVG properly for use in a data URI
      const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">
        <defs>
          <linearGradient id="grad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" style="stop-color:${gradientStart};stop-opacity:1" />
            <stop offset="100%" style="stop-color:${gradientEnd};stop-opacity:1" />
          </linearGradient>
        </defs>
        <rect width="40" height="40" fill="url(#grad)"/>
        <text x="50%" y="50%" font-family="Arial" font-size="20" fill="white" text-anchor="middle" dominant-baseline="middle">${firstLetter}</text>
      </svg>`;
      const encodedSvg = encodeURIComponent(svgContent);
      const avatarUrl = `data:image/svg+xml;charset=utf-8,${encodedSvg}`;
      
      // Add sender as first recipient
      recipients.unshift({
        name: senderName,
        id: senderId,
        avatar: avatarUrl
      });
    }
    
    // Determine conversation name from the sender of the first email (if not from the user)
    let conversationName = '';
    const firstEmail = emails[0];
    if (firstEmail.from !== session?.user?.email) {
      // Use sender name if available
      if (firstEmail.from.includes('<')) {
        const nameMatch = firstEmail.from.match(/(.*?)\s*<(.*)>/);
        if (nameMatch && nameMatch[1]) {
          conversationName = nameMatch[1].trim();
        } else {
          conversationName = firstEmail.from;
        }
      } else {
        conversationName = firstEmail.from;
      }
    } else if (emails.length > 1) {
      // If first message is from user, use the first reply sender
      const firstReply = emails.find(email => email.from !== session?.user?.email);
      if (firstReply) {
        if (firstReply.from.includes('<')) {
          const nameMatch = firstReply.from.match(/(.*?)\s*<(.*)>/);
          if (nameMatch && nameMatch[1]) {
            conversationName = nameMatch[1].trim();
          } else {
            conversationName = firstReply.from;
          }
        } else {
          conversationName = firstReply.from;
        }
      }
    }
    
    // If no name could be determined, use the subject
    if (!conversationName && firstEmail.subject) {
      conversationName = firstEmail.subject;
    }
    
    // Get current timestamp as fallback
    const now = new Date().toISOString();
    
    // Get timestamp from the latest email safely
    let timestamp = now;
    if (latestEmail && latestEmail.receivedAt) {
      // Check if receivedAt is a Firestore Timestamp
      if (typeof latestEmail.receivedAt.toDate === 'function') {
        timestamp = latestEmail.receivedAt.toDate().toISOString();
      } 
      // Check if it's already a Date object
      else if (latestEmail.receivedAt instanceof Date) {
        timestamp = latestEmail.receivedAt.toISOString();
      }
      // Check if it's a string timestamp
      else if (typeof latestEmail.receivedAt === 'string') {
        timestamp = latestEmail.receivedAt;
      }
    }
    
    return {
      id: threadId,
      threadId: threadId,
      name: conversationName,
      recipients: recipients,
      messages,
      lastMessageTime: timestamp,
      unreadCount: emails.filter(email => !email.isRead && email.from !== session?.user?.email).length,
      pinned: false,
      hideAlerts: false,
      isEmailThread: true,
      createdAt: timestamp,
      updatedAt: timestamp,
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
      conversations.sort((a, b) => {
        // Safely parse dates with fallback to current time
        const dateA = a.lastMessageTime ? new Date(a.lastMessageTime).getTime() : Date.now();
        const dateB = b.lastMessageTime ? new Date(b.lastMessageTime).getTime() : Date.now();
        return dateB - dateA;
      });
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