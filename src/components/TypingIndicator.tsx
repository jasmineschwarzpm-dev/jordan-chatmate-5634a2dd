import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export const TypingIndicator = () => {
  return (
    <div className="flex gap-4 animate-fade-in">
      <Avatar className="h-10 w-10 border-2 border-primary/10 bg-gradient-to-br from-primary/15 to-accent/15 shrink-0">
        <AvatarFallback className="bg-transparent text-primary font-bold text-lg">
          J
        </AvatarFallback>
      </Avatar>
      
      <div className="bg-muted/60 border border-border/40 rounded-3xl px-6 py-4 clean-shadow">
        <div className="flex gap-1.5">
          <div className="w-2 h-2 rounded-full bg-primary/50 animate-bounce" style={{ animationDelay: "0ms" }}></div>
          <div className="w-2 h-2 rounded-full bg-primary/50 animate-bounce" style={{ animationDelay: "150ms" }}></div>
          <div className="w-2 h-2 rounded-full bg-primary/50 animate-bounce" style={{ animationDelay: "300ms" }}></div>
        </div>
      </div>
    </div>
  );
};
