import React from "react";

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("r2dav render error", error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div
        style={{
          minHeight: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          padding: 24,
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        }}
      >
        <h1 style={{ margin: 0 }}>Something went wrong</h1>
        <p style={{ margin: 0, maxWidth: 560, textAlign: "center", opacity: 0.75 }}>
          {this.state.error.message}
        </p>
        <button
          type="button"
          style={{
            padding: "8px 16px",
            borderRadius: 8,
            border: "none",
            background: "#f38020",
            color: "#fff",
            cursor: "pointer",
          }}
          onClick={() => window.location.reload()}
        >
          Reload
        </button>
      </div>
    );
  }
}
