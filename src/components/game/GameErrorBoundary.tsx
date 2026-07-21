import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "../common/Button";

export class GameErrorBoundary extends Component<{
  children: ReactNode;
  onRetry: () => void;
  onUseMixed: () => void;
  onReturn: () => void;
}, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (import.meta.env.DEV) console.error("[Between Us] Gameplay recovery boundary", error, info);
  }

  reset(action: () => void) {
    this.setState({ error: null }, action);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="text-center max-w-xl mx-auto py-10" role="alert">
        <p className="eyebrow">A small interruption</p>
        <h1 className="question mt-4">We couldn’t prepare these questions.</h1>
        <p className="text-[var(--foreground-soft)] mt-4">Your room is safe. Choose how you’d like to continue.</p>
        <div className="flex flex-col sm:flex-row justify-center gap-3 mt-7">
          <Button onClick={() => this.reset(this.props.onRetry)}>Try Again</Button>
          <Button variant="secondary" onClick={() => this.reset(this.props.onUseMixed)}>Use Mixed Questions</Button>
          <Button variant="quiet" onClick={() => this.reset(this.props.onReturn)}>Return to Lobby</Button>
        </div>
      </div>
    );
  }
}
