'use client';

import { useEffect } from 'react';
import { initializeAIMessageStates } from '@/lib/ai-message-states';

export function AIMessageInitializer() {
  useEffect(() => {
    // Initialize AI message states
    const cleanup = initializeAIMessageStates();
    
    // Clean up on unmount
    return cleanup;
  }, []);
  
  // This component doesn't render anything
  return null;
} 