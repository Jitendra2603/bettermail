import { db } from '@/lib/firebase';
import { collection, addDoc, query, where, getDocs, orderBy, limit, serverTimestamp, doc, updateDoc } from 'firebase/firestore';
import { Message, Conversation, Recipient } from '@/types';
import { generateClientUUID } from '@/lib/utils';

// Collection names
const CHATS_COLLECTION = 'chats';
const MESSAGES_COLLECTION = 'messages';
const EMBEDDINGS_COLLECTION = 'embeddings';

// Save a new chat to Firebase
export async function saveChat(chat: Conversation) {
  try {
    const chatRef = await addDoc(collection(db, CHATS_COLLECTION), {
      ...chat,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    
    console.log('[Firebase] Chat saved with ID:', chatRef.id);
    return chatRef.id;
  } catch (error) {
    console.error('[Firebase] Error saving chat:', error);
    throw error;
  }
}

// Save a message to Firebase with embeddings
export async function saveMessage(message: Message, chatId: string, userEmail: string) {
  try {
    // Add the message to the messages collection
    const messageRef = await addDoc(collection(db, MESSAGES_COLLECTION), {
      ...message,
      chatId,
      userEmail,
      timestamp: serverTimestamp(),
    });
    
    // Generate embeddings for the message content
    // In a real implementation, you would call an API to generate embeddings
    const mockEmbedding = Array(1536).fill(0).map(() => Math.random() - 0.5);
    
    // Store the embeddings
    await addDoc(collection(db, EMBEDDINGS_COLLECTION), {
      messageId: messageRef.id,
      chatId,
      userEmail,
      content: message.content,
      embedding: mockEmbedding,
      timestamp: serverTimestamp(),
    });
    
    console.log('[Firebase] Message saved with ID:', messageRef.id);
    return messageRef.id;
  } catch (error) {
    console.error('[Firebase] Error saving message:', error);
    throw error;
  }
}

// Get messages for a specific chat
export async function getChatMessages(chatId: string) {
  try {
    const q = query(
      collection(db, MESSAGES_COLLECTION),
      where('chatId', '==', chatId),
      orderBy('timestamp', 'asc')
    );
    
    const querySnapshot = await getDocs(q);
    const messages: Message[] = [];
    
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      messages.push({
        id: doc.id,
        content: data.content,
        sender: data.sender,
        timestamp: data.timestamp?.toDate().toISOString() || new Date().toISOString(),
        attachments: data.attachments || [],
        reactions: data.reactions || [],
      });
    });
    
    return messages;
  } catch (error) {
    console.error('[Firebase] Error getting chat messages:', error);
    throw error;
  }
}

// Get all chats for a user
export async function getUserChats(userEmail: string) {
  try {
    const q = query(
      collection(db, CHATS_COLLECTION),
      where('recipients', 'array-contains', { email: userEmail }),
      orderBy('updatedAt', 'desc')
    );
    
    const querySnapshot = await getDocs(q);
    const chats: Conversation[] = [];
    
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      chats.push({
        id: doc.id,
        name: data.name,
        recipients: data.recipients,
        messages: [], // Messages are loaded separately
        createdAt: data.createdAt?.toDate().toISOString() || new Date().toISOString(),
        updatedAt: data.updatedAt?.toDate().toISOString() || new Date().toISOString(),
        unreadCount: data.unreadCount || 0,
        pinned: data.pinned || false,
        hideAlerts: data.hideAlerts || false,
      });
    });
    
    return chats;
  } catch (error) {
    console.error('[Firebase] Error getting user chats:', error);
    throw error;
  }
}

// Update typing status in a chat
export async function updateTypingStatus(chatId: string, userEmail: string, isTyping: boolean) {
  try {
    const chatRef = doc(db, CHATS_COLLECTION, chatId);
    
    await updateDoc(chatRef, {
      typingUsers: isTyping 
        ? { [userEmail]: serverTimestamp() } 
        : { [userEmail]: null },
      updatedAt: serverTimestamp(),
    });
    
    console.log('[Firebase] Typing status updated');
  } catch (error) {
    console.error('[Firebase] Error updating typing status:', error);
    throw error;
  }
}

// Search messages using embeddings
export async function searchMessages(query: string, userEmail: string) {
  try {
    // In a real implementation, you would:
    // 1. Generate an embedding for the query
    // 2. Perform a vector similarity search in your database
    
    // For now, we'll just do a simple text search
    const q = query(
      collection(db, MESSAGES_COLLECTION),
      where('userEmail', '==', userEmail),
      where('content', '>=', query),
      where('content', '<=', query + '\uf8ff'),
      limit(20)
    );
    
    const querySnapshot = await getDocs(q);
    const results: any[] = [];
    
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      results.push({
        id: doc.id,
        content: data.content,
        chatId: data.chatId,
        timestamp: data.timestamp?.toDate().toISOString() || new Date().toISOString(),
      });
    });
    
    return results;
  } catch (error) {
    console.error('[Firebase] Error searching messages:', error);
    throw error;
  }
} 