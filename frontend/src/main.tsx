import { Component, ReactNode, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { App } from "./App";
import "./styles.css";

const url = import.meta.env.VITE_CONVEX_URL;

class AppErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="fatal-shell">
        <section>
          <p>founder.exe recovery</p>
          <h1>the workspace hit a setup problem.</h1>
          <span>{this.state.error.message || "the app could not finish loading"}</span>
          <div><button onClick={() => window.location.reload()}>try again</button><button onClick={() => { localStorage.removeItem("founder.companyId"); localStorage.removeItem("founder.conversationId"); window.location.reload(); }}>reset workspace view</button></div>
          <small>your saved projects are still in convex. this only resets the local view.</small>
        </section>
      </main>
    );
  }
}

const root = createRoot(document.getElementById("root")!);
if (!url) root.render(<main className="fatal-shell"><section><p>founder.exe setup</p><h1>connect convex to start.</h1><span>`VITE_CONVEX_URL` is missing from `frontend/.env.local`.</span></section></main>);
else root.render(<StrictMode><AppErrorBoundary><ConvexProvider client={new ConvexReactClient(url)}><App /></ConvexProvider></AppErrorBoundary></StrictMode>);
