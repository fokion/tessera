import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  title: string;
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Every tile is isolated: a crashing widget becomes one broken card, not a
 * blank dashboard.
 */
export class TileErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return {
      error: error instanceof Error ? error : new Error(String(error)),
    };
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
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
