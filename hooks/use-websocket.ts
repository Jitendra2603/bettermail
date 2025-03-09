import { useState, useEffect, useCallback, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { io, Socket } from 'socket.io-client';
import { toast } from 'react-hot-toast';

// Define message types
export interface WebSocketMessage {
  type: string;
  data: any;
}

export function useWebSocket() {
  const { data: session } = useSession();
  const [connected, setConnected] = useState(false);
  const [messages, setMessages] = useState<WebSocketMessage[]>([]);
  const socketRef = useRef<Socket | null>(null);
  const roomsRef = useRef<Set<string>>(new Set());
  
  // For development/demo purposes, we'll use local storage as a fallback
  // In production, we'll use a real WebSocket connection
  const isProduction = process.env.NODE_ENV === 'production';
  const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || (isProduction 
    ? 'https://your-firebase-function-url.cloudfunctions.net/socket' 
    : 'https://messages.lu.vg');
  
  // Initialize WebSocket connection
  useEffect(() => {
    if (!session?.user?.id) return;
    
    const connectWebSocket = () => {
      // For development without a real socket server, use localStorage
      if (!isProduction && !process.env.NEXT_PUBLIC_SOCKET_URL) {
        console.log('[WebSocket] Using simulated WebSocket in development');
        setConnected(true);
        return;
      }
      
      console.log('[WebSocket] Connecting to:', socketUrl);
      
      // Connect to Socket.io server
      const socket = io(socketUrl, {
        auth: {
          token: session.accessToken,
          userId: session.user.id,
        },
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        transports: ['websocket', 'polling'], // Prefer WebSocket but fallback to polling
      });
      
      socket.on('connect', () => {
        console.log('[WebSocket] Connected');
        setConnected(true);
        
        // Join any rooms that were requested before connection was established
        roomsRef.current.forEach(roomId => {
          socket.emit('join_room', { roomId });
        });
      });
      
      socket.on('message', (message: WebSocketMessage) => {
        console.log('[WebSocket] Received message:', message);
        setMessages(prev => [...prev, message]);
      });
      
      socket.on('disconnect', () => {
        console.log('[WebSocket] Disconnected');
        setConnected(false);
      });
      
      socket.on('connect_error', (error) => {
        console.error('[WebSocket] Connection error:', error);
        toast.error('Failed to connect to chat server. Using offline mode.');
        
        // In case of connection error, fall back to simulated mode
        if (!isProduction) {
          setConnected(true);
        }
      });
      
      socketRef.current = socket;
      
      // Clean up on unmount
      return () => {
        socket.disconnect();
      };
    };
    
    connectWebSocket();
    
    // Set up storage event listener for simulated WebSocket
    if (!isProduction && !process.env.NEXT_PUBLIC_SOCKET_URL) {
      const handleStorageChange = (event: StorageEvent) => {
        if (event.key === 'simulated_websocket') {
          try {
            const message = JSON.parse(event.newValue || '');
            console.log('[WebSocket] Simulated message received:', message);
            
            // Only process messages for rooms we're in
            if (message.data?.chatId && !roomsRef.current.has(message.data.chatId)) {
              return;
            }
            
            setMessages(prev => [...prev, message]);
          } catch (error) {
            console.error('[WebSocket] Error parsing simulated message:', error);
          }
        }
      };
      
      window.addEventListener('storage', handleStorageChange);
      
      return () => {
        window.removeEventListener('storage', handleStorageChange);
      };
    }
  }, [session, socketUrl]);
  
  // Send a message through the WebSocket
  const sendMessage = useCallback((message: WebSocketMessage) => {
    if (!connected) {
      console.warn('[WebSocket] Cannot send message, not connected');
      return;
    }
    
    console.log('[WebSocket] Sending message:', message);
    
    // For development without a real socket server, use localStorage
    if (!isProduction && !process.env.NEXT_PUBLIC_SOCKET_URL) {
      // For simulated WebSocket, store in localStorage to trigger storage event in other tabs
      localStorage.setItem('simulated_websocket', JSON.stringify(message));
      
      // Also process the message locally
      setMessages(prev => [...prev, message]);
      return;
    }
    
    if (socketRef.current) {
      socketRef.current.emit('message', message);
    }
  }, [connected, isProduction]);
  
  // Join a room
  const joinRoom = useCallback((roomId: string) => {
    console.log('[WebSocket] Joining room:', roomId);
    roomsRef.current.add(roomId);
    
    if (!connected) {
      console.warn('[WebSocket] Will join room when connected:', roomId);
      return;
    }
    
    // For development without a real socket server, just add to our rooms set
    if (!isProduction && !process.env.NEXT_PUBLIC_SOCKET_URL) {
      return;
    }
    
    if (socketRef.current) {
      socketRef.current.emit('join_room', { roomId });
    }
  }, [connected, isProduction]);
  
  // Leave a room
  const leaveRoom = useCallback((roomId: string) => {
    console.log('[WebSocket] Leaving room:', roomId);
    roomsRef.current.delete(roomId);
    
    if (!connected) {
      return;
    }
    
    // For development without a real socket server, just remove from our rooms set
    if (!isProduction && !process.env.NEXT_PUBLIC_SOCKET_URL) {
      return;
    }
    
    if (socketRef.current) {
      socketRef.current.emit('leave_room', { roomId });
    }
  }, [connected, isProduction]);
  
  return {
    connected,
    messages,
    sendMessage,
    joinRoom,
    leaveRoom,
  };
} 