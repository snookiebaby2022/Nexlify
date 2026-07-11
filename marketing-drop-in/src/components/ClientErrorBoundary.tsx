"use client";

import React from "react";

export class ClientErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: string | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { error: `${error.name}: ${error.message}\n${error.stack}` };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[AdminErrorBoundary]", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6 text-sm text-red-300">
          <p className="font-bold text-red-200">Client-side error:</p>
          <pre className="mt-2 whitespace-pre-wrap text-xs">{this.state.error}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}
