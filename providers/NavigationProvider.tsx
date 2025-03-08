"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";

interface NavigationContextType {
  isNavigating: boolean;
  startNavigation: (href?: string) => void;
  endNavigation: () => void;
}

const NavigationContext = createContext<NavigationContextType>({
  isNavigating: false,
  startNavigation: () => {},
  endNavigation: () => {},
});

export function useNavigation() {
  return useContext(NavigationContext);
}

export function NavigationProvider({ children }: { children: ReactNode }) {
  const [isNavigating, setIsNavigating] = useState(false);
  const [targetPath, setTargetPath] = useState<string | null>(null);
  const pathname = usePathname();
  const router = useRouter();

  // Track pathname changes to end navigation
  useEffect(() => {
    if (isNavigating) {
      // If we've reached the target path, end navigation
      if (targetPath === pathname) {
        const timer = setTimeout(() => {
          setIsNavigating(false);
          setTargetPath(null);
        }, 100); // Small delay to ensure content is rendered
        return () => clearTimeout(timer);
      }
    }
  }, [pathname, isNavigating, targetPath]);

  // Listen for navigation events
  useEffect(() => {
    const handleBeforeNavigate = () => {
      setIsNavigating(true);
    };

    // Create a custom event for navigation
    window.addEventListener('navigationStart', handleBeforeNavigate);
    
    // Cleanup
    return () => {
      window.removeEventListener('navigationStart', handleBeforeNavigate);
    };
  }, []);

  // Function to start navigation
  const startNavigation = (href?: string) => {
    setIsNavigating(true);
    if (href) {
      setTargetPath(href);
    }
  };

  // Function to end navigation
  const endNavigation = () => {
    setIsNavigating(false);
    setTargetPath(null);
  };

  return (
    <NavigationContext.Provider
      value={{
        isNavigating,
        startNavigation,
        endNavigation,
      }}
    >
      {children}
    </NavigationContext.Provider>
  );
} 