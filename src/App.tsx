import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import { AuthGate } from "./auth/AuthGate";
import { RequirePermission } from "./auth/RequirePermission";
import { Layout } from "./components/layout/Layout";
import { LivePage } from "./pages/LivePage";
import { ControlPage } from "./pages/ControlPage";
import { RobotConfigPage } from "./pages/RobotConfigPage";
import { VideoTuningPage } from "./pages/VideoTuningPage";
import { TeamPage } from "./pages/TeamPage";
import { FleetPage } from "./pages/FleetPage";

// Lazy: three.js and the URDF loader are most of this page's weight, and no other page uses
// them — the drive pad must not pay for a 3D engine it never draws.
const JointsPage = lazy(() =>
  import("./pages/JointsPage").then((m) => ({ default: m.JointsPage })),
);

/** Routing: a shared Layout (header + nav) wraps the routed pages. Nothing past AuthGate
 * renders — or opens a socket — until someone is signed in. */
export function App() {
  return (
    <AuthProvider>
      <AuthGate>
        <AppRoutes />
      </AuthGate>
    </AuthProvider>
  );
}

function AppRoutes() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          {/* Fleet is home: where the company's robots are and how they are doing. */}
          <Route index element={<FleetPage />} />
          <Route path="live" element={<LivePage />} />
          <Route path="drive" element={<RequirePermission perm="operate"><ControlPage /></RequirePermission>} />
          <Route path="robot" element={<RequirePermission perm="configure"><RobotConfigPage /></RequirePermission>} />
          <Route path="video" element={<RequirePermission perm="configure"><VideoTuningPage /></RequirePermission>} />
          <Route path="fleet" element={<Navigate to="/" replace />} />
          <Route path="team" element={<RequirePermission perm="manage_users"><TeamPage /></RequirePermission>} />
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
