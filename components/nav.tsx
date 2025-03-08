"use client";

import { Icons } from "./icons";
import { useEffect } from "react";
import { cn } from "@/lib/utils";
import { useRouter, usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { CustomLink } from "./ui/custom-link";

interface NavProps {
  onNewChat: () => void;
  isMobileView: boolean;
  isScrolled?: boolean;
}

export function Nav({ onNewChat, isMobileView, isScrolled }: NavProps) {
  const router = useRouter();
  const pathname = usePathname();
  const isContextPage = pathname === "/context";

  // Keyboard shortcut for creating a new chat
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if typing in an input, if command/meta key is pressed,
      // or if the TipTap editor is focused
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA" ||
        e.metaKey ||
        document.querySelector(".ProseMirror")?.contains(document.activeElement)
      ) {
        return;
      }

      if (e.key === "n") {
        e.preventDefault();
        onNewChat();
      }
      
      // Add keyboard shortcut for context page
      if (e.key === "k" && e.altKey) {
        e.preventDefault();
        if (isContextPage) {
          router.push("/messages");
        } else {
          router.push("/context");
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onNewChat, router, isContextPage]);

  return (
    <>
      <div
        className={cn(
          "px-4 py-2 flex items-center justify-between sticky top-0 z-[1]",
          isScrolled && "border-b shadow-[0_2px_4px_-1px_rgba(0,0,0,0.15)]",
          isMobileView ? "bg-background" : "bg-muted"
        )}
      >
        <div className="flex items-center gap-1.5 p-2">
          <CustomLink 
            href={isContextPage ? "/messages" : "/context"}
            className="cursor-pointer group relative"
            ariaLabel={isContextPage ? "Messages" : "Knowledge Base"}
          >
            <motion.div
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
              transition={{ type: "spring", stiffness: 400, damping: 15 }}
              className="w-3 h-3 rounded-full bg-blue-500 group-hover:opacity-80"
            />
            <span className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 pointer-events-none text-xs">
              <span className="text-background">{isContextPage ? "M" : "K"}</span>
            </span>
          </CustomLink>
          <motion.button 
            className="group relative cursor-default"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
            transition={{ type: "spring", stiffness: 400, damping: 15 }}
          >
            <div className="w-3 h-3 rounded-full bg-yellow-500 group-hover:opacity-80" />
            <span className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 pointer-events-none text-xs">
              <span className="text-background">−</span>
            </span>
          </motion.button>
          <motion.button 
            className="group relative cursor-default"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
            transition={{ type: "spring", stiffness: 400, damping: 15 }}
          >
            <div className="w-3 h-3 rounded-full bg-green-500 group-hover:opacity-80" />
            <span className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 pointer-events-none text-xs">
              <span className="text-background">+</span>
            </span>
          </motion.button>
        </div>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          transition={{ type: "spring", stiffness: 400, damping: 15 }}
          className={`sm:p-2 hover:bg-muted-foreground/10 rounded-lg ${
            isMobileView ? "p-2" : ""
          }`}
          onClick={onNewChat}
          aria-label="New conversation (n)"
        >
          <Icons.new />
        </motion.button>
      </div>
    </>
  );
}
