import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/layout/Layout";
import { LivePage } from "./pages/LivePage";
import { ControlPage } from "./pages/ControlPage";
import { RobotConfigPage } from "./pages/RobotConfigPage";
import { VideoTuningPage } from "./pages/VideoTuningPage";

// Lazy: three.js and the URDF loader are most of this page's weight, and no other page uses
// them — the drive pad must not pay for a 3D engine it never draws.
const JointsPage = lazy(() =>
  import("./pages/JointsPage").then((m) => ({ default: m.JointsPage })),
);

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
          <Route
            path="joints"
            element={
              <Suspense fallback={null}>
                <JointsPage />
              </Suspense>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
