import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { User } from "lucide-react";

interface MessageBubbleProps {
  role: "user" | "assistant";
  content: string;
}

export const MessageBubble = ({ role, content }: MessageBubbleProps) => {
  const isUser = role === "user";

  return (
    <div className={`flex gap-4 ${isUser ? "flex-row-reverse" : "flex-row"} group`}>
      {/* Avatar */}
      {!isUser && (
        <Avatar className="h-12 w-12 border-2 border-primary/20 bg-gradient-to-br from-primary/30 to-accent/30 shrink-0">
          <AvatarFallback className="bg-transparent text-primary font-semibold text-xl">
            J
          </AvatarFallback>
        </Avatar>
      )}
      
      {isUser && (
        <Avatar className="h-12 w-12 border-2 border-muted bg-muted shrink-0">
          <AvatarFallback className="bg-transparent">
            <User className="w-6 h-6 text-muted-foreground" />
          </AvatarFallback>
        </Avatar>
      )}

      {/* Message Content */}
      <div
        className={`
          max-w-[75%] sm:max-w-[70%] px-5 py-4 rounded-2xl
          ${isUser 
            ? "bg-gradient-to-br from-primary to-accent text-primary-foreground rounded-tr-md" 
            : "bg-card border border-border/50 text-card-foreground rounded-tl-md warm-shadow"
          }
          transition-all duration-200
        `}
      >
        <p className="text-base leading-relaxed whitespace-pre-wrap break-words">
          {content}
        </p>
      </div>
    </div>
  );
};
