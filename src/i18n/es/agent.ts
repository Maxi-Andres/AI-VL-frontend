// Spanish — agent (the /agent tab). Keys are the English texts exactly as in t("…") / msg("…").
// Shared and kept elsewhere: "Video quality and transport", "Waiting for the robot
// camera…", "NO VIDEO", "STOP" (drive.ts); "Connecting…", "Stopped", "Listening…",
// "Transcribing…", "Didn't catch that — try again", "Nothing recognized" (live.ts); "LIVE" (fleet.ts).
export const AGENT: Record<string, string> = {
  // The tab and the page
  "Agent": "Agente",
  "The agent works with the G1 only. Pick the G1 in the header.": "El agente funciona solo con el G1. Elige el G1 en la cabecera.",
  "Robot online": "Robot en línea",
  "Robot offline": "Robot desconectado",
  "Robot state unknown": "Estado del robot desconocido",
  // The composer
  "Instruction": "Instrucción",
  "Type or speak…": "Escribe o habla…",
  "The robot is working on it…": "El robot está en eso…",
  "Speak the instruction: it is transcribed and sent": "Di la instrucción: se transcribe y se envía",
  "Send": "Enviar",
  "Stop the instruction now: the arm goes home and lets go": "Detener la instrucción ya: el brazo vuelve a su posición y suelta",
  "Stopping…": "Deteniendo…",
  // The trace
  "Tell the robot what to do, typed or spoken: “pick up the bottle”, “what is on the table?”.": "Dile al robot qué hacer, escrito o hablado: «agarra la botella», «¿qué hay en la mesa?».",
  "heard": "oí",
  "understood": "entendí",
  "plan": "plan",
  "thought": "pienso",
  "thinking…": "pensando…",
  "running": "ejecutando",
  "ran": "ejecuté",
  "{n} s": "{n} s",
  "Stopping: the arm is going home…": "Deteniendo: el brazo vuelve a su posición…",
  "The run ended without an answer.": "La ejecución terminó sin respuesta.",
  // Tools and their results
  "pick up": "agarrar",
  "look": "mirar",
  "{tool}: done": "{tool}: hecho",
  "{tool}: done, holding it": "{tool}: hecho, lo tengo agarrado",
  "{tool} failed: {why}": "{tool} falló: {why}",
  "no reason given": "sin motivo informado",
};
