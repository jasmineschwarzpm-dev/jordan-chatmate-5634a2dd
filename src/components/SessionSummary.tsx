import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Trophy, TrendingUp, MessageSquare, Copy, CheckCircle } from "lucide-react";

interface SessionSummaryProps {
  summary: {
    practiced: string[];
    improve: string[];
    sampleLine: string;
  };
  onReset: () => void;
  sessionId: string;
  sessionCopied: boolean;
  onCopySessionId: () => void;
}

export const SessionSummary = ({ 
  summary, 
  onReset, 
  sessionId, 
  sessionCopied, 
  onCopySessionId 
}: SessionSummaryProps) => {
  return (
    <Card className="border-2 border-primary/30 warm-shadow backdrop-blur-sm bg-gradient-to-br from-card via-card/95 to-primary/5 animate-fade-in overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-accent/10 pointer-events-none"></div>
      
      <CardHeader className="relative z-10 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20">
            <Trophy className="w-6 h-6 text-primary" />
          </div>
          <div>
            <CardTitle className="text-2xl font-semibold">Great Work!</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">Here's what you practiced today</p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6 relative z-10">
        {/* What Went Well */}
        {summary.practiced.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-primary" />
              <h3 className="font-semibold text-foreground">What You Did Well</h3>
            </div>
            <ul className="space-y-2">
              {summary.practiced.map((item, i) => (
                <li 
                  key={i} 
                  className="flex items-start gap-3 p-3 rounded-xl bg-gradient-to-r from-primary/10 to-accent/10 border border-primary/20"
                >
                  <span className="text-primary mt-0.5">✓</span>
                  <span className="text-sm leading-relaxed">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Largest Area for Growth */}
        {summary.improve.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-accent" />
              <h3 className="font-semibold text-foreground">Your Biggest Area for Growth</h3>
            </div>
            <div className="p-4 rounded-xl bg-gradient-to-r from-accent/10 to-primary/10 border border-accent/20">
              <p className="text-sm leading-relaxed font-medium">{summary.improve[0]}</p>
            </div>
          </div>
        )}

        {/* Sample Line */}
        {summary.sampleLine && (
          <div className="p-4 rounded-xl bg-gradient-to-br from-muted/50 to-muted/30 border border-border">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              Try This Next Time
            </p>
            <p className="text-sm italic leading-relaxed text-foreground">
              "{summary.sampleLine}"
            </p>
          </div>
        )}

        {/* Session ID */}
        {sessionId && (
          <div className="pt-4 border-t border-border/50">
            <p className="text-sm text-muted-foreground mb-3">
              Share your Session ID for feedback:
            </p>
            <div className="flex gap-2">
              <code className="flex-1 px-4 py-2.5 bg-muted/80 rounded-lg text-sm font-mono tracking-wide border border-border">
                {sessionId}
              </code>
              <Button
                variant="outline"
                size="icon"
                onClick={onCopySessionId}
                className="shrink-0 h-11 w-11"
              >
                {sessionCopied ? (
                  <CheckCircle className="w-4 h-4 text-primary" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="pt-4">
          <Button 
            onClick={onReset}
            className="w-full h-12 text-base font-semibold bg-gradient-to-r from-primary to-accent hover:from-primary/90 hover:to-accent/90 shadow-lg"
          >
            Start New Conversation
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
