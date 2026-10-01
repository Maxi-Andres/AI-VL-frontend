import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
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
 * pad. Sits above <Outlet/> so the choice persists across pages.
 *
 * STARTS ON THE ROBOT THE CAMERA IS ON, not on a fixed default. The camera bridge is shared
 * server state and outlives a reload; the selector was not. A reload used to show "Go2" over
 * the G1's picture (2026-10-01), and the commands followed the selector — so the drive view
 * steered one robot while showing the other. "go2" is only the value until that answer lands,
 * and a robot picked by hand before it does is never overwritten. */
export function RobotProvider({ children }: { children: ReactNode }) {
  const [robot, setRobotState] = useState("go2");
  const [robots, setRobots] = useState<RobotInfo[]>([]);
  const pickedRef = useRef(false);
  useEffect(() => {
    fetchRobots().then(setRobots).catch(console.error);
    getRobotCameraStatus()
      .then((s) => {
        if (!pickedRef.current && (s.robot === "go2" || s.robot === "g1"))
          setRobotState(s.robot);
      })
      .catch(() => {});
  }, []);
  // Switching the robot also switches the camera to THAT robot. Always, since 2026-10-01: the
  // bridge reads each robot's own video over the network (GO2_STREAM_URL / G1_STREAM_URL), so
  // following the robot is right on any network. It used to skip the switch while the camera
  // was on "stream" or "test", which is how the drive view ended up on one robot's camera
  // while commanding the other. The test pattern is opted into on the Robot page.
  const setRobot = useCallback((v: string) => {
    pickedRef.current = true;
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
