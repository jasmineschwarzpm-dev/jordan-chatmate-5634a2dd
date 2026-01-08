import { Sparkles, Info, MapPin } from "lucide-react";

interface CoachMessageProps {
  content: string;
  type: "celebration" | "insight";
  isSceneContext?: boolean;
}

export const CoachMessage = ({ content, type, isSceneContext = false }: CoachMessageProps) => {
  const isCelebration = type === "celebration";
  
  // Scene context gets special styling: black text on light green background
  if (isSceneContext) {
    return (
      <div className="flex justify-center my-3 animate-fade-in">
        <div className="max-w-lg px-4 py-3 rounded-xl border bg-green-100 border-green-300 text-black dark:bg-green-200 dark:border-green-400 dark:text-black">
          <div className="flex items-center gap-2.5">
            <div className="shrink-0">
              <MapPin className="w-4 h-4 text-green-700" />
            </div>
            <p className="text-sm leading-relaxed font-medium">
              {content}
            </p>
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <div className="flex justify-center my-3 animate-fade-in">
      <div 
        className={`
          max-w-lg px-4 py-3 rounded-xl border
          ${isCelebration 
            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400" 
            : "bg-accent/10 border-accent/30 text-accent-foreground"
          }
        `}
      >
        <div className="flex items-center gap-2.5">
          <div className="shrink-0">
            {isCelebration 
              ? <Sparkles className="w-4 h-4" /> 
              : <Info className="w-4 h-4 opacity-70" />
            }
          </div>
          <p className="text-sm leading-relaxed">
            {content}
          </p>
        </div>
      </div>
    </div>
  );
};
