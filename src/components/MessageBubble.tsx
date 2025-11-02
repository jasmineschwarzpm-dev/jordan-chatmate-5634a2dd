import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { User } from "lucide-react";

interface MessageBubbleProps {
  role: "user" | "assistant";
  content: string;
}

export const MessageBubble = ({ role, content }: MessageBubbleProps) => {
  const isUser = role === "user";

  return (
    <div className={`flex gap-4 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
      {/* Avatar */}
      {!isUser && (
        <Avatar className="h-10 w-10 border-2 border-primary/10 bg-gradient-to-br from-primary/15 to-accent/15 shrink-0">
          <AvatarFallback className="bg-transparent text-primary font-bold text-lg">
            J
          </AvatarFallback>
        </Avatar>
      )}
      
      {isUser && (
        <Avatar className="h-10 w-10 bg-muted/60 shrink-0">
          <AvatarFallback className="bg-transparent">
            <User className="w-5 h-5 text-muted-foreground" />
          </AvatarFallback>
        </Avatar>
      )}

      {/* Message Content */}
      <div
        className={`
          max-w-[75%] sm:max-w-[70%] px-5 py-3.5 rounded-3xl
          ${isUser 
            ? "bg-gradient-to-br from-primary to-accent text-primary-foreground" 
            : "bg-muted/60 border border-border/40 text-foreground clean-shadow"
          }
          transition-all duration-200
        `}
      >
        <p className="text-[15px] leading-relaxed whitespace-pre-wrap break-words">
          {content}
        </p>
      </div>
    </div>
  );
};
