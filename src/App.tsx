import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/layout/Layout";
import { LivePage } from "./pages/LivePage";
import { MonitorPage } from "./pages/MonitorPage";
import { AboutPage } from "./pages/AboutPage";

/** Routing: a shared Layout (header + nav) wraps the routed pages. */
export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<LivePage />} />
          <Route path="monitor" element={<MonitorPage />} />
          <Route path="about" element={<AboutPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
