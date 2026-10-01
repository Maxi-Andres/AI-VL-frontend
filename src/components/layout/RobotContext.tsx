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
  // Switching the robot also switches the camera to THAT robot. Always, since 2026-10-01: the
  // bridge reads each robot's own video over the network (GO2_STREAM_URL / G1_STREAM_URL), so
  // following the robot is right on any network. It used to skip the switch while the camera
  // was on "stream" or "test", which is how the drive view ended up on one robot's camera
  // while commanding the other. The test pattern is opted into on the Robot page.
  const setRobot = useCallback((v: string) => {
    setRobotState(v);
    setRobotCameraConfig({ robot: v }).catch(() => {});
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
