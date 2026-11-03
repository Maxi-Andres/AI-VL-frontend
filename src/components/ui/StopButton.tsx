import { IconPlayerStopFilled } from "@tabler/icons-react";
import { useT } from "../../i18n";

/** The big red STOP of the pages that move the robot (Drive, Agent): the same button, so a
 * person reaches for the same thing on both. Red in both themes on purpose — it is the one
 * control that must read as "stop" on any picture and any background. */
export function StopButton({ onClick, title, className = "" }: {
  onClick: () => void;
  title: string;
  className?: string;
}) {
  const t = useT();
  return (
    <button type="button" onClick={onClick} title={title}
      className={`flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-[#e5484e] to-[#c42f35] px-5 py-2.5 text-sm font-extrabold tracking-[0.06em] text-white transition active:scale-[0.97] ${className}`}>
      <IconPlayerStopFilled size={16} />{t("STOP")}
    </button>
  );
}
