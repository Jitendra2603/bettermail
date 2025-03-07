import { useState } from "react";

interface FileUploadState {
  isUploading: boolean;
  progress: number;
  error: string | null;
}

interface UploadResponse {
  url: string;
  filename: string;
  mimeType: string;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export function useFileUpload() {
  const [state, setState] = useState<FileUploadState>({
    isUploading: false,
    progress: 0,
    error: null,
  });

  const validateFile = (file: File): string | null => {
    if (file.size > MAX_FILE_SIZE) {
      return `File size must be less than ${MAX_FILE_SIZE / (1024 * 1024)}MB`;
    }

    // Add more validations as needed
    return null;
  };

  const uploadFile = async (file: File): Promise<UploadResponse | null> => {
    try {
      // Reset state
      setState({
        isUploading: true,
        progress: 0,
        error: null,
      });

      // Validate file
      const validationError = validateFile(file);
      if (validationError) {
        throw new Error(validationError);
      }

      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to upload file");
      }

      setState(prev => ({
        ...prev,
        isUploading: false,
        progress: 100,
        error: null,
      }));

      return data;
    } catch (error) {
      console.error("[useFileUpload] Error:", error);
      setState(prev => ({
        ...prev,
        isUploading: false,
        progress: 0,
        error: error instanceof Error ? error.message : "Failed to upload file",
      }));
      return null;
    }
  };

  const reset = () => {
    setState({
      isUploading: false,
      progress: 0,
      error: null,
    });
  };

  return {
    ...state,
    uploadFile,
    reset,
  };
} 