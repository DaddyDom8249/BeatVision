import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { failed: boolean };

// Top-level boundary: a render error in any page shows a recoverable message
// instead of a blank screen. Error details are logged, never rendered as HTML.
export default class AppErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error("BeatVision UI error", error, info?.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" className="app-error-boundary" style={{ padding: 24 }}>
        <h1>Something went wrong</h1>
        <p>This screen hit an unexpected error. Your saved and approved work has not been changed.</p>
        <button type="button" onClick={() => window.location.reload()}>Reload</button>{" "}
        <a href="/">Back to dashboard</a>
      </div>
    );
  }
}
