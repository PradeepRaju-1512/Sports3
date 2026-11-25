import React from "react";

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("UI ErrorBoundary caught an error:", error, info.componentStack);
  }

  handleReload = () => {
    this.setState({ hasError: false });
    window.location.assign("/");
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="container" style={{ paddingTop: 64 }}>
          <div className="panel" style={{ maxWidth: 560, margin: "0 auto", textAlign: "center" }}>
            <h1 className="section-heading" style={{ color: "#d4a038" }}>
              Something went wrong
            </h1>
            <p className="muted" style={{ marginBottom: 20 }}>
              An unexpected display error occurred. Your saved data on the server
              is unaffected. Reload to return to IIIT Trichy Sports.
            </p>
            <button
              type="button"
              className="action-btn"
              onClick={this.handleReload}
            >
              Return to Home
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
