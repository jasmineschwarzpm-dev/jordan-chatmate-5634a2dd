import { Lightbulb, AlertCircle } from "lucide-react";

interface CoachTipProps {
  content: string;
  isCrisis?: boolean;
}

export const CoachTip = ({ content, isCrisis = false }: CoachTipProps) => {
  return (
    <div className="flex justify-center animate-fade-in">
      <div 
        className={`
          max-w-xl px-5 py-4 rounded-2xl border
          ${isCrisis 
            ? "bg-destructive/10 border-destructive/30 text-destructive-foreground" 
            : "bg-accent/10 border-accent/30 text-foreground"
          }
          backdrop-blur-sm shadow-sm
        `}
      >
        <div className="flex items-start gap-3">
          <div className={`shrink-0 mt-1 ${isCrisis ? "text-destructive" : "text-accent"}`}>
            {isCrisis ? <AlertCircle className="w-5 h-5" /> : <Lightbulb className="w-5 h-5" />}
          </div>
          <div className="space-y-1.5">
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
