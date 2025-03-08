"use client";

import { ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useNavigation } from "@/providers/NavigationProvider";

// Create a simple event system for navigation
const navigationEvent = new CustomEvent('navigationStart');

interface CustomLinkProps {
  href: string;
  children: ReactNode;
  className?: string;
  prefetch?: boolean;
  onClick?: () => void;
  ariaLabel?: string;
}

export function CustomLink({
  href,
  children,
  className,
  prefetch = true,
  onClick,
  ariaLabel,
}: CustomLinkProps) {
  const router = useRouter();
  const { startNavigation } = useNavigation();

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (onClick) {
      onClick();
    }
    
    // Prevent default navigation
    e.preventDefault();
    
    // Start navigation with target path
    startNavigation(href);
    
    // Dispatch navigation event for any listeners
    window.dispatchEvent(new CustomEvent('navigationStart'));
    
    // Add a small delay to allow for animation
    setTimeout(() => {
      router.push(href);
    }, 50);
  };

  return (
    <Link
      href={href}
      prefetch={prefetch}
      className={className}
      onClick={handleClick}
      aria-label={ariaLabel}
    >
      {children}
    </Link>
  );
} 