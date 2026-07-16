import { ArrowLeft, ArrowRight, Focus, Maximize2, MessageSquare, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

export function LensCameraControls({
  canGoBack,
  canGoForward,
  canFocus,
  canReturnToWall,
  canReturnToConversation,
  onGoBack,
  onGoForward,
  onFitFirm,
  onBackToFocus,
  onReturnToWall,
  onReturnToConversation,
}: {
  canGoBack: boolean;
  canGoForward: boolean;
  canFocus: boolean;
  canReturnToWall: boolean;
  canReturnToConversation: boolean;
  onGoBack: () => void;
  onGoForward: () => void;
  onFitFirm: () => void;
  onBackToFocus: () => void;
  onReturnToWall: () => void;
  onReturnToConversation: () => void;
}) {
  return (
    <nav className="firm-lens-camera" aria-label="Canvas camera">
      <Button variant="secondary" size="icon-sm" disabled={!canGoBack} onClick={onGoBack} aria-label="Previous camera">
        <ArrowLeft aria-hidden="true" />
      </Button>
      <Button variant="secondary" size="icon-sm" disabled={!canGoForward} onClick={onGoForward} aria-label="Next camera">
        <ArrowRight aria-hidden="true" />
      </Button>
      <span aria-hidden="true" />
      <Button variant="secondary" size="icon-sm" onClick={onFitFirm} aria-label="Fit firm">
        <Maximize2 aria-hidden="true" />
      </Button>
      <Button variant="secondary" size="icon-sm" disabled={!canFocus} onClick={onBackToFocus} aria-label="Back to focused work">
        <Focus aria-hidden="true" />
      </Button>
      {canReturnToWall ? (
        <Button variant="secondary" size="icon-sm" onClick={onReturnToWall} aria-label="Return to founder decisions">
          <ShieldCheck aria-hidden="true" />
        </Button>
      ) : null}
      {canReturnToConversation ? (
        <Button variant="secondary" size="icon-sm" onClick={onReturnToConversation} aria-label="Return to conversation">
          <MessageSquare aria-hidden="true" />
        </Button>
      ) : null}
    </nav>
  );
}
