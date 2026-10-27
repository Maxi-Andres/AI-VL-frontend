import { IconVideo } from "@tabler/icons-react";
import { Pill } from "../ui/Pill";
import { useT } from "../../i18n";

interface Props {
  connected: boolean;
}

/**
 * Pill for THIS browser's own live-stream socket (/ws/detect when we produce,
 * /ws/view when we watch). It says nothing about the robots or the services — those
 * are the presence pills next to it. "off" is grey, not red: not streaming is the
 * normal resting state, not a failure.
 */
export function StatusBadge({ connected }: Props) {
  const t = useT();
  return (
    <Pill
      tone={connected ? "good" : "idle"}
      icon={<IconVideo size={13} stroke={2} />}
      title={
        connected
          ? t("This browser's live-stream socket to the gateway is open")
          : t("This browser is not streaming or watching (start the camera)")
      }
    >
      {connected ? t("stream live") : t("stream off")}
    </Pill>
  );
}
