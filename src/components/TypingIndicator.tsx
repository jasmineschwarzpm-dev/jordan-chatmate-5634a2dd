import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export const TypingIndicator = () => {
  return (
    <div className="flex gap-3 animate-fade-in">
      <Avatar className="h-10 w-10 border-2 border-primary/20 bg-gradient-to-br from-primary/30 to-accent/30 shrink-0">
        <AvatarFallback className="bg-transparent text-primary font-semibold text-lg">
          J
        </AvatarFallback>
      </Avatar>
      
      <div className="bg-card border border-border/50 rounded-2xl rounded-tl-sm px-5 py-3.5 warm-shadow">
        <div className="flex gap-1.5">
          <div className="w-2 h-2 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: "0ms" }}></div>
          <div className="w-2 h-2 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: "150ms" }}></div>
          <div className="w-2 h-2 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: "300ms" }}></div>
        </div>
      </div>
    </div>
  );
};
