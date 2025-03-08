import { Attachment } from "@/types";

interface FeedbackSubmission {
  messageId: string;
  originalContent: string;
  updatedContent: string;
  attachments: Attachment[];
  conversationId?: string;
  timestamp: string;
  feedbackType: 'dislike' | 'edit';
}

/**
 * Submit feedback for an AI suggestion
 * 
 * @param messageId - The ID of the message being edited
 * @param originalContent - The original content of the message
 * @param updatedContent - The updated content after editing
 * @param attachments - Any attachments added to the feedback
 * @param conversationId - Optional conversation ID
 * @param feedbackType - The type of feedback (dislike or edit)
 * @returns Promise that resolves when feedback is submitted
 */
export async function submitFeedback(
  messageId: string,
  originalContent: string,
  updatedContent: string,
  attachments: Attachment[] = [],
  conversationId?: string,
  feedbackType: 'dislike' | 'edit' = 'edit'
): Promise<void> {
  try {
    console.log('[Feedback] Submitting feedback:', {
      messageId,
      conversationId,
      feedbackType,
      contentLength: updatedContent.length,
      attachmentCount: attachments.length
    });

    const feedback: FeedbackSubmission = {
      messageId,
      originalContent,
      updatedContent,
      attachments,
      conversationId,
      timestamp: new Date().toISOString(),
      feedbackType
    };

    // TODO: Replace with actual API endpoint when available
    const response = await fetch('/api/feedback', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(feedback),
    });

    if (!response.ok) {
      throw new Error(`Failed to submit feedback: ${response.status} ${response.statusText}`);
    }

    console.log('[Feedback] Feedback submitted successfully');
  } catch (error) {
    console.error('[Feedback] Error submitting feedback:', error);
    throw error;
  }
}

/**
 * Log feedback locally (fallback when API is not available)
 * 
 * @param messageId - The ID of the message being edited
 * @param originalContent - The original content of the message
 * @param updatedContent - The updated content after editing
 * @param attachments - Any attachments added to the feedback
 * @param conversationId - Optional conversation ID
 * @param feedbackType - The type of feedback (dislike or edit)
 */
export function logFeedbackLocally(
  messageId: string,
  originalContent: string,
  updatedContent: string,
  attachments: Attachment[] = [],
  conversationId?: string,
  feedbackType: 'dislike' | 'edit' = 'edit'
): void {
  const feedback = {
    messageId,
    conversationId,
    feedbackType,
    timestamp: new Date().toISOString(),
    originalContentPreview: originalContent.substring(0, 100) + (originalContent.length > 100 ? '...' : ''),
    updatedContentPreview: updatedContent.substring(0, 100) + (updatedContent.length > 100 ? '...' : ''),
    attachmentCount: attachments.length
  };

  console.log('[Feedback] Feedback logged locally:', feedback);
  
  // Optionally store in localStorage for persistence
  try {
    const storedFeedback = JSON.parse(localStorage.getItem('ai_feedback') || '[]');
    storedFeedback.push(feedback);
    localStorage.setItem('ai_feedback', JSON.stringify(storedFeedback));
  } catch (error) {
    console.error('[Feedback] Error storing feedback in localStorage:', error);
  }
} 