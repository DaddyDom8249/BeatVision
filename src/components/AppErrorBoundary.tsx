import React from 'react';

type Props = {
  children: React.ReactNode;
};

type State = {
  hasError: boolean;
  message: string;
  stack?: string;
};

export default class AppErrorBoundary extends React.Component<Props, State> {
  state: State = {
    hasError: false,
    message: '',
  };

  static getDerivedStateFromError(error: unknown): State {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    console.error('[BeatVision Runtime Crash]', error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-5">
        <div className="w-full max-w-2xl rounded-2xl border border-red-500/30 bg-red-500/5 p-5 space-y-4">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-red-300 font-semibold">
              BeatVision Runtime Guard
            </p>
            <h1 className="text-2xl font-bold mt-2">The page crashed instead of black-screening.</h1>
            <p className="text-sm text-muted-foreground mt-2">
              This is a dev safety screen. It means the app hit a runtime error, but the error is now visible instead of hiding in the void like a coward.
            </p>
          </div>

          <pre className="text-xs whitespace-pre-wrap overflow-auto max-h-72 rounded-xl bg-black/40 border border-red-500/20 p-3">
            {this.state.message}
            {this.state.stack ? `\n\n${this.state.stack}` : ''}
          </pre>

          <button
            type="button"
            className="h-10 px-4 rounded-xl bg-red-500 text-white font-semibold"
            onClick={() => window.location.reload()}
          >
            Reload BeatVision
          </button>
        </div>
      </div>
    );
  }
}
