"use client";

import { ReactNode, useEffect } from "react";
import { PageTransition } from "./page-transition";
import { usePathname, useRouter } from "next/navigation";
import { useNavigation } from "@/providers/NavigationProvider";

// Improved shallow loading fallback that mimics the page structure with wave animations
function ShallowFallback() {
  const pathname = usePathname();
  const isContextPage = pathname === "/context" || pathname.includes("/context");
  
  return (
    <div className="w-full h-full animate-in fade-in duration-300">
      {/* Nav skeleton */}
      <div className="px-4 py-2 flex items-center justify-between sticky top-0 z-[1] bg-muted">
        <div className="flex items-center gap-1.5 p-2">
          <div className="w-3 h-3 rounded-full bg-blue-500/50 shimmer"></div>
          <div className="w-3 h-3 rounded-full bg-yellow-500/50 shimmer"></div>
          <div className="w-3 h-3 rounded-full bg-green-500/50 shimmer"></div>
        </div>
        <div className="w-8 h-8 rounded-lg bg-muted-foreground/20 shimmer"></div>
      </div>

      {/* Content skeleton */}
      <div className="p-4">
        {isContextPage ? (
          /* Context page skeleton */
          <>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-muted-foreground/20 shimmer"></div>
                <div className="h-6 w-24 bg-muted-foreground/20 shimmer rounded"></div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-64 h-10 rounded-md bg-muted-foreground/20 shimmer"></div>
                <div className="w-24 h-10 rounded-md bg-muted-foreground/20 shimmer"></div>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-8">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="p-4 rounded-lg border border-muted-foreground/10">
                  <div className="h-5 w-32 bg-muted-foreground/20 shimmer rounded mb-2"></div>
                  <div className="h-4 w-full bg-muted-foreground/10 shimmer rounded mb-1"></div>
                  <div className="h-4 w-3/4 bg-muted-foreground/10 shimmer rounded"></div>
                </div>
              ))}
            </div>
          </>
        ) : (
          /* Messages page skeleton */
          <>
            <div className="flex flex-col h-[calc(100vh-4rem)]">
              <div className="flex-1 overflow-hidden">
                <div className="space-y-4 p-4">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className={`flex ${i % 2 === 0 ? 'justify-end' : 'justify-start'}`}>
                      <div className={`rounded-2xl p-3 max-w-[80%] ${i % 2 === 0 ? 'bg-primary/20' : 'bg-muted-foreground/10'} shimmer`}>
                        <div className="h-4 w-32 bg-muted-foreground/20 shimmer rounded mb-1"></div>
                        <div className="h-4 w-48 bg-muted-foreground/10 shimmer rounded"></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="p-4 border-t">
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-10 rounded-full bg-muted-foreground/10 shimmer"></div>
                  <div className="w-10 h-10 rounded-full bg-muted-foreground/20 shimmer"></div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

interface PageTransitionWrapperProps {
  children: ReactNode;
}

export function PageTransitionWrapper({ children }: PageTransitionWrapperProps) {
  const { isNavigating } = useNavigation();
  const router = useRouter();
  
  // Disable Next.js loading indicator
  useEffect(() => {
    // This helps prevent the loading indicator from showing
    const style = document.createElement('style');
    style.textContent = `
      #nprogress { display: none !important; }
      .nprogress-container { display: none !important; }
      #nprogress .bar { display: none !important; }
      #nprogress .spinner { display: none !important; }
    `;
    document.head.appendChild(style);
    
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  return (
    <>
      {isNavigating ? (
        <ShallowFallback />
      ) : (
        <PageTransition>{children}</PageTransition>
      )}
    </>
  );
} 