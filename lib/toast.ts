// Simple toast implementation
export const toast = {
  success: (message: string) => {
    console.log('[Toast Success]', message);
  },
  error: (message: string) => {
    console.error('[Toast Error]', message);
  },
  info: (message: string) => {
    console.info('[Toast Info]', message);
  },
  warning: (message: string) => {
    console.warn('[Toast Warning]', message);
  }
}; 