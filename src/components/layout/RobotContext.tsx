import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  fetchRobots,
  getRobotCameraStatus,
  setRobotCameraConfig,
} from "../../api/backend";
import type { RobotInfo } from "../../types";

interface RobotContextValue {
  /** Selected robot id ("go2" | "g1"). Drives the command interpreter and Drive. */
  robot: string;
  setRobot: (v: string) => void;
  /** The robots the interpreter can target (for the header selector). */
  robots: RobotInfo[];
}

const RobotContext = createContext<RobotContextValue | null>(null);

/** Shares the selected robot across the header, the interpreter, and the drive
 * pad. Default "go2" — the physically connected robot; the G1 executor isn't
 * wired yet. Sits above <Outlet/> so the choice persists across pages. */
export function RobotProvider({ children }: { children: ReactNode }) {
  const [robot, setRobotState] = useState("go2");
  const [robots, setRobots] = useState<RobotInfo[]>([]);
  useEffect(() => {
    fetchRobots().then(setRobots).catch(console.error);
  }, []);
  // Switching the robot also switches the camera source in the bridge, so the
  // robot camera shows the right robot (Go2 video API vs the G1 image topic).
  // BUT only when the camera is on a per-robot DDS source. The "stream" source reads the
  // video over HTTP and is what works with the robot on another network; "test" is
  // synthetic. Overwriting either of those on a robot change would silently drop the user
  // back to DDS — and DDS is exactly what does not work off-subnet.
  const setRobot = useCallback((v: string) => {
    setRobotState(v);
    getRobotCameraStatus()
      .then((s) => {
        const current = s.robot;
        if (!current || current === "go2" || current === "g1") {
          return setRobotCameraConfig({ robot: v });
        }
      })
      .catch(() => {});
  }, []);
  return (
    <RobotContext value={{ robot, setRobot, robots }}>{children}</RobotContext>
  );
}

export function useRobot(): RobotContextValue {
  const ctx = useContext(RobotContext);
  if (!ctx) throw new Error("useRobot must be used within a RobotProvider");
  return ctx;
}
