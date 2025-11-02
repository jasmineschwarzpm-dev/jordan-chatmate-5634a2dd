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
            ? "bg-destructive/10 border-destructive/30 text-destructive" 
            : "bg-primary/5 border-primary/20 text-foreground"
          }
          clean-shadow
        `}
      >
        <div className="flex items-start gap-3">
          <div className={`shrink-0 mt-0.5 ${isCrisis ? "text-destructive" : "text-primary"}`}>
            {isCrisis ? <AlertCircle className="w-5 h-5" /> : <Lightbulb className="w-5 h-5" />}
          </div>
          <div className="space-y-1">
            <p className="text-xs font-bold uppercase tracking-wider opacity-60">
              {isCrisis ? "Important" : "Coach"}
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
