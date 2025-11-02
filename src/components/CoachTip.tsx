import { Lightbulb, AlertCircle } from "lucide-react";

interface CoachTipProps {
  content: string;
  isCrisis?: boolean;
}

export const CoachTip = ({ content, isCrisis = false }: CoachTipProps) => {
  return (
    <div className="flex justify-center px-4 animate-fade-in">
      <div 
        className={`
          max-w-2xl w-full px-4 py-3 rounded-xl border-2
          ${isCrisis 
            ? "bg-destructive/10 border-destructive/30 text-destructive-foreground" 
            : "bg-accent/20 border-accent/40 text-foreground"
          }
          backdrop-blur-sm transition-all duration-300 hover:scale-[1.01]
        `}
      >
        <div className="flex items-start gap-3">
          <div className={`shrink-0 mt-0.5 ${isCrisis ? "text-destructive" : "text-accent"}`}>
            {isCrisis ? <AlertCircle className="w-5 h-5" /> : <Lightbulb className="w-5 h-5" />}
          </div>
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide opacity-70">
              {isCrisis ? "Important Notice" : "Coach Tip"}
            </p>
            <p className="text-sm leading-relaxed">
              {content}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
