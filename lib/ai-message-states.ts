// AI Message States Manager
// This file handles the state transitions for AI message generation

export type AIMessageState = 'gathering' | 'understanding' | 'writing' | 'complete';

// Function to add state classes to message bubbles
export function initializeAIMessageStates() {
  // Only run in browser environment
  if (typeof window === 'undefined') return;

  // Function to handle state transitions
  const handleStateTransition = (element: HTMLElement, states: AIMessageState[]) => {
    let currentStateIndex = 0;
    
    // Hide the actual content initially
    const proseElement = element.querySelector('.prose');
    if (proseElement) {
      (proseElement as HTMLElement).style.visibility = 'hidden';
    }
    
    // Add initial state
    element.classList.add(`state-${states[currentStateIndex]}`);
    
    const transitionToNextState = () => {
      // Add transitioning class
      element.classList.add('transitioning');
      
      // After a short delay, remove current state and transitioning class
      setTimeout(() => {
        element.classList.remove(`state-${states[currentStateIndex]}`);
        
        // Move to next state
        currentStateIndex = (currentStateIndex + 1) % states.length;
        
        // Add new state
        element.classList.add(`state-${states[currentStateIndex]}`);
        
        // After transition completes, remove transitioning class
        setTimeout(() => {
          element.classList.remove('transitioning');
          
          // If we've gone through all states, show the content
          if (currentStateIndex === states.length - 1) {
            setTimeout(() => {
              // Show the content and set to complete state
              if (proseElement) {
                (proseElement as HTMLElement).style.visibility = 'visible';
              }
              
              // Add transitioning class
              element.classList.add('transitioning');
              
              // Remove all state classes
              states.forEach(state => {
                element.classList.remove(`state-${state}`);
              });
              
              // Add complete state
              element.classList.add('state-complete');
              
              // Remove transitioning class after transition completes
              setTimeout(() => {
                element.classList.remove('transitioning');
              }, 500);
              
              // Clear the interval
              clearInterval(interval);
            }, 1000);
          }
        }, 500);
      }, 300);
    };
    
    // Transition between states every few seconds
    const intervalTime = 1500; // 1.5 seconds per state
    const interval = setInterval(transitionToNextState, intervalTime);
    
    // Store the interval ID on the element for cleanup
    (element as any)._stateInterval = interval;
  };
  
  // Initialize state transitions for new AI messages
  const initializeNewMessages = () => {
    // Find all AI suggestion message bubbles that don't have state classes yet
    const messageBubbles = document.querySelectorAll('.message-bubble-ai-suggestion:not(.state-gathering):not(.state-understanding):not(.state-writing):not(.state-complete)');
    
    messageBubbles.forEach((bubble) => {
      handleStateTransition(bubble as HTMLElement, ['gathering', 'understanding', 'writing']);
    });
  };
  
  // Set up a mutation observer to watch for new messages
  const messageObserver = new MutationObserver((mutations) => {
    let shouldCheck = false;
    
    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        shouldCheck = true;
        break;
      }
    }
    
    if (shouldCheck) {
      initializeNewMessages();
    }
  });
  
  // Start observing the document body for new messages
  messageObserver.observe(document.body, { childList: true, subtree: true });
  
  // Initialize any existing messages
  initializeNewMessages();
  
  // Return cleanup function
  return () => {
    messageObserver.disconnect();
    
    // Clear all intervals
    document.querySelectorAll('.message-bubble-ai-suggestion').forEach((bubble) => {
      if ((bubble as any)._stateInterval) {
        clearInterval((bubble as any)._stateInterval);
      }
    });
  };
} 