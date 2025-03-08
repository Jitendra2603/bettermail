"use client";

import { ReactNode, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { usePathname, useRouter } from "next/navigation";

interface PageTransitionProps {
  children: ReactNode;
}

export function PageTransition({ children }: PageTransitionProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [isFirstRender, setIsFirstRender] = useState(true);
  const [prevPathname, setPrevPathname] = useState(pathname);
  
  // Skip animation on first render for better initial load experience
  useEffect(() => {
    setIsFirstRender(false);
  }, []);
  
  // Track previous pathname to determine transition direction
  useEffect(() => {
    if (pathname !== prevPathname) {
      setPrevPathname(pathname);
    }
  }, [pathname, prevPathname]);

  // Disable Next.js loading indicator
  useEffect(() => {
    // This helps prevent the loading indicator from showing
    const style = document.createElement('style');
    style.textContent = `
      #nprogress { display: none !important; }
      .nprogress-container { display: none !important; }
    `;
    document.head.appendChild(style);
    
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  // Use simpler, faster transitions to avoid loading indicators
  const getAnimationProps = () => {
    // Skip animation on first render
    if (isFirstRender) {
      return {
        initial: { opacity: 1 },
        animate: { opacity: 1 },
        exit: { opacity: 1 },
        transition: { duration: 0 }
      };
    }
    
    // Fast, subtle transitions for all pages
    return {
      initial: { opacity: 0.9 },
      animate: { opacity: 1 },
      exit: { opacity: 0.9 },
      transition: {
        duration: 0.1,
        ease: "easeInOut"
      }
    };
  };

  const animationProps = getAnimationProps();

  return (
    <AnimatePresence mode="sync">
      <motion.div
        key={pathname}
        initial={animationProps.initial}
        animate={animationProps.animate}
        exit={animationProps.exit}
        transition={animationProps.transition}
        className="w-full h-full"
        onAnimationStart={() => {
          // Prevent scrolling during transition
          document.body.style.overflow = 'hidden';
        }}
        onAnimationComplete={() => {
          // Re-enable scrolling after transition
          document.body.style.overflow = '';
        }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
} 