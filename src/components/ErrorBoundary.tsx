import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  title: string;
  children: ReactNode;
  /** Change this (e.g. serialised config) to clear a previous error. */
  resetKey?: string;
}

interface State {
  error: Error | null;
}

/**
 * Every tile is isolated: a crashing widget becomes one broken card, not a
 * blank dashboard. A changed `resetKey` clears the error so fixing a config
 * does not leave the tile stuck.
 */
export class TileErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return {
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }

  componentDidUpdate(previous: Props): void {
    if (previous.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`Widget "${this.props.title}" crashed`, error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div data-tessera-error role="alert">
          <strong>{this.props.title} needs a refresh</strong>
          <p>{this.state.error.message}</p>
          <button
            type="button"
            data-tessera-button
            onClick={() => this.setState({ error: null })}
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
