import { Component, ErrorInfo, ReactNode } from 'react';

interface Props { children: ReactNode }
interface State { error: Error | null; info: ErrorInfo | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: null };

  static getDerivedStateFromError(error: Error) {
    return { error, info: null };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ error, info });
    console.error('[ErrorBoundary] caught:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          minHeight: '100vh', background: '#0c111a', color: '#f4f1e8',
          fontFamily: 'monospace', padding: 24, whiteSpace: 'pre-wrap',
          overflow: 'auto'
        }}>
          <h2 style={{ color: '#e7635c' }}>Something crashed</h2>
          <div>{this.state.error.message}</div>
          <details open style={{ marginTop: 16, fontSize: 12, opacity: 0.8 }}>
            <summary>Stack</summary>
            {this.state.error.stack}
            {this.state.info?.componentStack}
          </details>
          <button
            style={{ marginTop: 20, padding: '10px 18px' }}
            onClick={() => { this.setState({ error: null, info: null }); }}
          >Try to recover</button>
        </div>
      );
    }
    return this.props.children;
  }
}
