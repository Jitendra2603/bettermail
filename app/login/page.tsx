"use client";

import { useState, useEffect, useRef } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import { auth } from "@/lib/firebase";
import { signInWithCustomToken } from "firebase/auth";
import "@/styles/login.css";

export default function LoginPage() {
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const { toast } = useToast();
  const mainRef = useRef<HTMLDivElement>(null);
  const lightRef = useRef<HTMLDivElement>(null);
  const loginCardRef = useRef<HTMLDivElement>(null);
  const buttonLightRef = useRef<HTMLDivElement>(null);
  const buttonLightsRef = useRef<HTMLDivElement[]>([]);

  const handleGmailLogin = async () => {
    try {
      setIsLoading(true);
      
      // Sign in with NextAuth
      console.log("[Login] Starting Google sign in");
      
      // Use signIn with redirect: true to let NextAuth handle the redirect
      // This will take the user through the OAuth flow and then redirect to /messages
      await signIn("google", { 
        callbackUrl: "/messages"
      });
      
      // The code below won't execute if the redirect happens
      console.log("[Login] If you see this, the redirect didn't happen");
      
    } catch (error) {
      console.error('[Login] Error:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to log in. Please try again.",
        variant: "destructive",
      });
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!mainRef.current || !lightRef.current || !loginCardRef.current || !buttonLightRef.current) return;

    // Clone the button light for glare effect
    for (let i = 0; i < 4; i++) {
      const newButtonLight = buttonLightRef.current.cloneNode(true) as HTMLDivElement;
      newButtonLight.classList.add('glare');
      newButtonLight.style.filter = `blur(${Math.pow(i*1.5,2)}px)`;
      mainRef.current.appendChild(newButtonLight);
      buttonLightsRef.current.push(newButtonLight);
    }

    // Add mousemove event listener
    const handleMouseMove = (event: MouseEvent) => {
      const x = event.clientX;
      const y = event.clientY;
      
      if (lightRef.current) {
        lightRef.current.style.transform = `translate(${x}px,${y}px)`;
      }

      if (loginCardRef.current) {
        const shadow = calculateShadow(loginCardRef.current, event);
        loginCardRef.current.style.boxShadow = shadow;
      }

      const lightRadius = 400;
      const opacity = easeInQuad(calculateIntensity(loginCardRef.current, event, lightRadius / 3, lightRadius * 1.3));
      
      const buttonLightsAll = document.querySelectorAll('.button-light');
      buttonLightsAll.forEach((item) => {
        (item as HTMLElement).style.opacity = opacity.toString();
      });
    };

    window.addEventListener('mousemove', handleMouseMove);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);

  // Helper functions for the light effect
  const calculateShadow = (element: HTMLElement | null, event: MouseEvent) => {
    if (!element) return '';
    
    const rect = element.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const deltaX = event.clientX - centerX;
    const deltaY = event.clientY - centerY;

    const angle = Math.atan2(deltaY, deltaX);
    const maxOffset = 3;

    const detectionRadius = rect.width * 2;
    const distance = Math.min(maxOffset, Math.sqrt(deltaX ** 2 + deltaY ** 2) / detectionRadius * maxOffset);
    const offsetX = Math.cos(angle) * distance;
    const offsetY = Math.sin(angle) * distance;

    return `
      ${-offsetX * 2.6}px ${-offsetY * 2.6}px 1.5px rgba(0, 0, 0, 0.081),
      ${-offsetX * 5.8}px ${-offsetY * 5.8}px 3.4px rgba(0, 0, 0, 0.12),
      ${-offsetX * 9.8}px ${-offsetY * 9.8}px 5.6px rgba(0, 0, 0, 0.15),
      ${-offsetX * 14.8}px ${-offsetY * 14.8}px 8.5px rgba(0, 0, 0, 0.174),
      ${-offsetX * 21.3}px ${-offsetY * 21.3}px 12.3px rgba(0, 0, 0, 0.195),
      ${-offsetX * 30.1}px ${-offsetY * 30.1}px 17.4px rgba(0, 0, 0, 0.216),
      ${-offsetX * 42.7}px ${-offsetY * 42.7}px 24.6px rgba(0, 0, 0, 0.24),
      ${-offsetX * 62.1}px ${-offsetY * 62.1}px 35.8px rgba(0, 0, 0, 0.27),
      ${-offsetX * 95.6}px ${-offsetY * 95.6}px 55.1px rgba(0, 0, 0, 0.309),
      ${-offsetX * 170}px ${-offsetY * 170}px 98px rgba(0, 0, 0, 0.39)
    `;
  };

  const calculateIntensity = (element: HTMLElement | null, event: MouseEvent, innerRadius: number, outerRadius: number) => {
    if (!element) return 0;
    
    const rect = element.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const deltaX = event.clientX - centerX;
    const deltaY = event.clientY - centerY;
    const distance = Math.sqrt(deltaX ** 2 + deltaY ** 2);

    let intensity = 0;

    if (distance > innerRadius && distance <= outerRadius) {
      intensity = (distance - innerRadius) / (outerRadius - innerRadius);
    } else if (distance > outerRadius) {
      intensity = 1;
    } else if (distance <= innerRadius) {
      intensity = 0;
    }

    return intensity;
  };

  const easeInQuad = (t: number) => {
    return t * t;
  };

  return (
    <div className="login-container" ref={mainRef}>
      <div className="light" ref={lightRef}></div>
      
      <div className="button-light" ref={buttonLightRef}>
        <div></div>
      </div>
      
      <div className="login-card" ref={loginCardRef}>
        <div className="login-header">
          <div className="login-icon">
            <img 
              className="login-icon-bg" 
              src="https://cdn.prod.website-files.com/65cceef869e5a56037c32801/672080ee3e9942d6e0617400_Rectangle%201002.png" 
              alt="Background" 
            />
            <div className="login-icon-frame">
              <svg
                className="w-8 h-8 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-4l-4 4-4-4z"
                />
              </svg>
            </div>
          </div>
          <h1 className="login-title">Welcome to Messages</h1>
          <p className="login-subtitle">Sign in with your Gmail account to continue</p>
        </div>

        <button
          onClick={handleGmailLogin}
          disabled={isLoading}
          className="login-button"
        >
          <img 
            className="login-button-bg" 
            src="https://cdn.prod.website-files.com/65cceef869e5a56037c32801/672080ee3e9942d6e0617400_Rectangle%201002.png" 
            alt="Background" 
          />
          <div className="login-button-frame">
            {isLoading ? (
              <div className="login-button-content">
                <div className="loading-spinner" />
                Signing in...
              </div>
            ) : (
              <div className="login-button-content">
                <svg
                  className="w-5 h-5 mr-2"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    fill="currentColor"
                    d="M20.283 10.356h-8.327v3.451h4.792c-.446 2.193-2.313 3.453-4.792 3.453a5.27 5.27 0 0 1-5.279-5.28 5.27 5.27 0 0 1 5.279-5.279c1.259 0 2.397.447 3.29 1.178l2.6-2.599c-1.584-1.381-3.615-2.233-5.89-2.233a8.908 8.908 0 0 0-8.934 8.934 8.907 8.907 0 0 0 8.934 8.934c4.467 0 8.529-3.249 8.529-8.934 0-.528-.081-1.097-.202-1.625z"
                  />
                </svg>
                Continue with Gmail
              </div>
            )}
          </div>
        </button>

        <p className="login-footer">
          By continuing, you agree to our Terms of Service and Privacy Policy
        </p>
      </div>
    </div>
  );
} 