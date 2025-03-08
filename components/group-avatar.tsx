import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { motion } from "framer-motion";
import { Recipient } from "@/types";

interface GroupAvatarProps {
  recipients: Recipient[];
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function GroupAvatar({ recipients, size = "md", className = "" }: GroupAvatarProps) {
  // Limit to max 4 avatars
  const displayRecipients = recipients.slice(0, 4);
  const hasMore = recipients.length > 4;
  
  // Calculate sizes based on the size prop
  const containerSize = size === "sm" ? "w-8 h-8" : size === "md" ? "w-12 h-12" : "w-16 h-16";
  const avatarSize = size === "sm" ? "w-5 h-5" : size === "md" ? "w-7 h-7" : "w-9 h-9";
  const fontSize = size === "sm" ? "text-xs" : size === "md" ? "text-sm" : "text-base";
  
  // For single recipient, just show their avatar
  if (displayRecipients.length === 1) {
    const recipient = displayRecipients[0];
    return (
      <Avatar className={`${containerSize} ${className}`}>
        <AvatarImage src={recipient.avatar} alt={recipient.name} />
        <AvatarFallback className={fontSize}>
          {recipient.name.split(" ").map(n => n[0]).join("").toUpperCase()}
        </AvatarFallback>
      </Avatar>
    );
  }
  
  // For multiple recipients, show a grid of avatars
  return (
    <div className={`relative ${containerSize} ${className} bg-muted rounded-full overflow-hidden`}>
      <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 gap-px">
        {displayRecipients.map((recipient, index) => (
          <motion.div
            key={recipient.id}
            className="flex items-center justify-center bg-background"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: index * 0.05 }}
          >
            <Avatar className={avatarSize}>
              <AvatarImage src={recipient.avatar} alt={recipient.name} />
              <AvatarFallback className={fontSize}>
                {recipient.name.split(" ").map(n => n[0]).join("").toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </motion.div>
        ))}
        
        {/* Fill empty slots with placeholder */}
        {Array.from({ length: 4 - displayRecipients.length }).map((_, index) => (
          <div key={`empty-${index}`} className="bg-muted" />
        ))}
      </div>
      
      {/* Show count of additional recipients */}
      {hasMore && (
        <div className="absolute bottom-0 right-0 bg-primary text-primary-foreground rounded-full w-4 h-4 flex items-center justify-center text-[10px]">
          +{recipients.length - 4}
        </div>
      )}
    </div>
  );
} 