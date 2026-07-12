import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { App } from "./App";
import "./styles.css";

const url = import.meta.env.VITE_CONVEX_URL;
if (!url) throw new Error("VITE_CONVEX_URL is required");
createRoot(document.getElementById("root")!).render(<StrictMode><ConvexProvider client={new ConvexReactClient(url)}><App /></ConvexProvider></StrictMode>);
