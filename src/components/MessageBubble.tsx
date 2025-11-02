import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { User } from "lucide-react";

interface MessageBubbleProps {
  role: "user" | "assistant";
  content: string;
}

export const MessageBubble = ({ role, content }: MessageBubbleProps) => {
  const isUser = role === "user";

  return (
    <div className={`flex gap-3 animate-fade-in ${isUser ? "flex-row-reverse" : "flex-row"} group`}>
      {/* Avatar */}
      {!isUser && (
        <Avatar className="h-10 w-10 border-2 border-primary/20 bg-gradient-to-br from-primary/30 to-accent/30 shrink-0">
          <AvatarFallback className="bg-transparent text-primary font-semibold text-lg">
            J
          </AvatarFallback>
        </Avatar>
      )}
      
      {isUser && (
        <Avatar className="h-10 w-10 border-2 border-muted bg-muted shrink-0">
          <AvatarFallback className="bg-transparent">
            <User className="w-5 h-5 text-muted-foreground" />
          </AvatarFallback>
        </Avatar>
      )}

      {/* Message Content */}
      <div
        className={`
          max-w-[75%] sm:max-w-[65%] px-4 py-3 rounded-2xl
          ${isUser 
            ? "bg-gradient-to-br from-primary to-primary/90 text-primary-foreground rounded-tr-sm" 
            : "bg-card border border-border/50 text-card-foreground rounded-tl-sm warm-shadow"
          }
          transition-all duration-200 hover:scale-[1.02]
        `}
      >
        <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
          {content}
        </p>
      </div>
    </div>
  );
};
