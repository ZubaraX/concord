import { Component, type ReactNode } from "react";

// Catches render/runtime errors anywhere below it and shows a recover screen
// instead of a blank white page — so one bad component can't brick the app.
export default class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: unknown) {
    console.error("[Concord] render error", error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-discord-bg p-6 text-center text-discord-text">
        <div className="text-4xl">😵</div>
        <div className="text-lg font-semibold text-white">Что-то пошло не так</div>
        <p className="max-w-sm text-sm text-discord-muted">
          Приложение столкнулось с ошибкой. Перезапуск обычно решает проблему.
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => window.location.reload()}
            className="rounded bg-discord-accent px-5 py-2 text-sm font-medium text-white hover:bg-discord-accentDark"
          >
            Перезапустить
          </button>
          <button
            onClick={() => this.setState({ error: null })}
            className="rounded bg-discord-card px-5 py-2 text-sm text-discord-muted hover:text-white"
          >
            Продолжить
          </button>
        </div>
        <pre className="max-h-32 max-w-full overflow-auto rounded bg-black/30 p-2 text-left text-[10px] text-discord-faint">
          {this.state.error.message}
        </pre>
      </div>
    );
  }
}
