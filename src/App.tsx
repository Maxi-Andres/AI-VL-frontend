import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/layout/Layout";
import { LivePage } from "./pages/LivePage";
import { ControlPage } from "./pages/ControlPage";
import { RobotConfigPage } from "./pages/RobotConfigPage";
import { VideoTuningPage } from "./pages/VideoTuningPage";
import { AboutPage } from "./pages/AboutPage";

/** Routing: a shared Layout (header + nav) wraps the routed pages. */
export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<LivePage />} />
          <Route path="drive" element={<ControlPage />} />
          <Route path="robot" element={<RobotConfigPage />} />
          <Route path="video" element={<VideoTuningPage />} />
          <Route path="about" element={<AboutPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
