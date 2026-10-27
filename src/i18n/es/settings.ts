// Spanish — settings. Keys are the English texts exactly as in t("…") / msg("…").
// Words shared across the app (Save, Cancel, Close, Done, Name…) live in common.ts.
export const SETTINGS: Record<string, string> = {
  // --- The page and its menu (data-nav titles are identifiers; these are what the menu shows)
  "Account": "Cuenta",
  "Video": "Video",
  "Configuring this robot": "Configurando este robot",
  "Switch to this robot": "Cambiar a este robot",
  "Everything configured on {robot}.": "Todo lo configurado en {robot}.",
  "How the live picture reaches this browser.": "Cómo llega la imagen en vivo a este navegador.",
  "About these values": "Sobre estos valores",
  "Which code runs where": "Qué código corre dónde",
  "First-time setup": "Primera configuración",
  "This app": "Esta app",
  "Drive view": "Vista de manejo",
  "Recorder": "Grabador",
  "MJPEG": "MJPEG",

  // --- Shared buttons and words
  "Saved": "Guardado",
  "Use": "Usar",
  "Copy": "Copiar",
  "Copied": "Copiado",
  "Confirm": "Confirmar",
  "Apply": "Aplicar",
  "Apply and save": "Aplicar y guardar",
  "Discard": "Descartar",
  "Applying…": "Aplicando…",

  // --- Profile
  "How you appear to your team, and how Pilot looks for you.": "Cómo te ve tu equipo y cómo se ve Pilot para ti.",
  "You": "Tú",
  "How your circle looks to the team.": "Cómo ve el equipo tu círculo.",
  "Shown in the team list and the activity.": "Se muestra en la lista del equipo y en la actividad.",
  "Your name": "Tu nombre",
  "Could not save your name.": "No se pudo guardar tu nombre.",
  "Picked at random when you joined. Yours to change.": "Se eligió al azar cuando te uniste. Puedes cambiarlo.",
  "Could not save the colour.": "No se pudo guardar el color.",
  "Light, dark or follow the system. Per browser.": "Claro, oscuro o según el sistema. Por navegador.",
  "English or Spanish, everywhere in Pilot.": "Inglés o español, en todo Pilot.",
  "Changing it signs you out everywhere else.": "Al cambiarla, se cierra tu sesión en todos los demás lugares.",
  "Change password": "Cambiar contraseña",
  "Current password": "Contraseña actual",
  "New password, again": "Repite la nueva contraseña",
  "The two new passwords differ.": "Las dos contraseñas nuevas no coinciden.",
  "Password changed.": "Contraseña cambiada.",
  "Password changed. {n} other session was signed out.": "Contraseña cambiada. Se cerró {n} sesión en otro lugar.",
  "Password changed. {n} other sessions were signed out.": "Contraseña cambiada. Se cerraron {n} sesiones en otros lugares.",
  "Could not change the password.": "No se pudo cambiar la contraseña.",

  // --- Team & roles
  "Just now": "Recién",
  "Yesterday": "Ayer",
  "expires today": "vence hoy",
  "expires in {n} days": "vence en {n} días",
  "Invite member": "Invitar miembro",
  "Owners manage the workspace, admins configure it, operators drive, viewers only watch.":
    "Los dueños administran el espacio de trabajo, los administradores lo configuran, los operadores manejan y los observadores solo miran.",
  "{n} active member in {org}.": "{n} miembro activo en {org}.",
  "{n} active members in {org}.": "{n} miembros activos en {org}.",
  "You are the only owner.": "Eres el único dueño.",
  "Add a second owner so the company is never locked out if one person leaves or forgets their password.":
    "Agrega un segundo dueño para que la empresa nunca se quede sin acceso si alguien se va u olvida su contraseña.",
  "Member": "Miembro",
  "Role": "Rol",
  "Last sign-in": "Último inicio de sesión",
  "Disabled": "Desactivado",
  "Make {name} {role}? They will be signed out and sign in again with the new role.":
    "¿Darle a {name} el rol de {role}? Se cerrará su sesión y volverá a entrar con el nuevo rol.",
  "Make a password reset link for {name}? Their current password keeps working until they set a new one.":
    "¿Crear un enlace para restablecer la contraseña de {name}? Su contraseña actual sigue funcionando hasta que elija una nueva.",
  "Password reset link": "Enlace para restablecer la contraseña",
  "24 hours": "24 horas",
  "Reset password": "Restablecer contraseña",
  "Disable {name}? They are signed out now and cannot sign in until re-enabled.":
    "¿Desactivar a {name}? Su sesión se cierra ahora y no podrá entrar hasta que se vuelva a activar.",
  "Enable {name} again, as {role}?": "¿Activar de nuevo a {name}, como {role}?",
  "Disable": "Desactivar",
  "Enable": "Activar",
  "Pending invitations": "Invitaciones pendientes",
  "{role} · invited by {who} · {expires}": "{role} · invitación de {who} · {expires}",
  "Revoke the invitation for {email}? The link stops working.": "¿Revocar la invitación de {email}? El enlace deja de funcionar.",
  "Revoke": "Revocar",
  "What each role can do": "Qué puede hacer cada rol",
  "Are you sure?": "¿Seguro?",
  "Send this link to {to} by email or chat. It works once and expires in {valid}. For safety it is shown only now.":
    "Envía este enlace a {to} por correo o chat. Funciona una sola vez y vence en {valid}. Por seguridad, solo se muestra ahora.",
  "This link uses {host}, which opens only on this computer. Pick the address people reach Pilot on — it is kept for every link from now on.":
    "Este enlace usa {host}, que solo abre en esta computadora. Elige la dirección con la que la gente llega a Pilot: se guarda para todos los enlaces de ahora en adelante.",
  "Points to {url}": "Apunta a {url}",
  "Finding this server's addresses…": "Buscando las direcciones de este servidor…",
  "Or type it: https://pilot.company.com": "O escríbela: https://pilot.company.com",
  "Invitation links point to": "Los enlaces de invitación apuntan a",
  "{origin} (this page — not set)": "{origin} (esta página; sin configurar)",
  "Invitation ready": "Invitación lista",
  "7 days": "7 días",
  "Invite a member": "Invitar a un miembro",
  "Create invitation link": "Crear enlace de invitación",

  // --- Activity
  "All": "Todo",
  "Access": "Accesos",
  "Could not load the activity.": "No se pudo cargar la actividad.",
  "Who changed what: robots, sites, the team, access. Sign-ins are recorded but left out of this list.":
    "Quién cambió qué: robots, sitios, el equipo, accesos. Los inicios de sesión se registran, pero no aparecen en esta lista.",
  "{from}–{to} of {total}": "{from}–{to} de {total}",
  "Nothing here yet.": "Todavía no hay nada aquí.",
  "Activity pages": "Páginas de actividad",
  "Newer": "Más recientes",
  "Older": "Más antiguas",

  // --- Backups
  "Could not read the backups.": "No se pudieron leer las copias de seguridad.",
  "The backup failed.": "La copia de seguridad falló.",
  "Backing up…": "Haciendo copia…",
  "Back up now": "Hacer copia ahora",
  "A copy of everything Pilot keeps — accounts, the team, sites and robots, conversations, the activity log and floor plans.":
    "Una copia de todo lo que guarda Pilot: cuentas, el equipo, sitios y robots, conversaciones, el registro de actividad y los planos.",
  "A copy of everything Pilot keeps — accounts, the team, sites and robots, conversations, the activity log and floor plans, made every time you press the button (automatic backups are off); the last {keep} are kept.":
    "Una copia de todo lo que guarda Pilot: cuentas, el equipo, sitios y robots, conversaciones, el registro de actividad y los planos, hecha cada vez que pulsas el botón (las copias automáticas están desactivadas); se conservan las últimas {keep}.",
  "A copy of everything Pilot keeps — accounts, the team, sites and robots, conversations, the activity log and floor plans, made every day; the last {keep} are kept.":
    "Una copia de todo lo que guarda Pilot: cuentas, el equipo, sitios y robots, conversaciones, el registro de actividad y los planos, hecha todos los días; se conservan las últimas {keep}.",
  "A copy of everything Pilot keeps — accounts, the team, sites and robots, conversations, the activity log and floor plans, made every {hours} h; the last {keep} are kept.":
    "Una copia de todo lo que guarda Pilot: cuentas, el equipo, sitios y robots, conversaciones, el registro de actividad y los planos, hecha cada {hours} h; se conservan las últimas {keep}.",
  "Last backup {when}": "Última copia {when}",
  "No backup yet": "Todavía no hay copias",
  "The folder is on this server's own disk. To survive a broken disk, set {var} to another disk or a network share. To restore: stop Pilot and copy a day's files back into the data folder.":
    "La carpeta está en el disco de este servidor. Para sobrevivir a un disco dañado, apunta {var} a otro disco o a una carpeta de red. Para restaurar: detén Pilot y copia los archivos de un día de vuelta en la carpeta de datos.",

  // --- Robot: the cards
  "installed": "instalado",
  "not built yet": "aún sin construir",
  "These values are set on {robot} itself, in {env} files on the robot — not in this app and not in source code. They are shown here as the {running} report them, so a file edited without restarting its service will still show the old value. That is deliberate: it is what is actually in effect.":
    "Estos valores se definen en el propio {robot}, en archivos {env} del robot: no en esta app ni en el código fuente. Aquí se muestran tal como los informan los {running}, así que un archivo editado sin reiniciar su servicio seguirá mostrando el valor anterior. Es a propósito: es lo que realmente está en vigor.",
  "running processes": "procesos en ejecución",
  "Which code runs on which robot": "Qué código corre en cada robot",
  "The Go2 and the G1 run {different}. The file name says which: read it before building or copying anything onto a robot.":
    "El Go2 y el G1 corren {different}. El nombre del archivo dice cuál: léelo antes de compilar o copiar algo en un robot.",
  "different code from the same three repos": "código distinto de los mismos tres repos",
  "{var} ({go2} by default, {g1}) picks the variant; everything after the binary is shared. Full map: {doc}.":
    "{var} ({go2} por defecto, {g1}) elige la variante; todo lo que viene después del binario es compartido. Mapa completo: {doc}.",
  "Connection — {robot}": "Conexión — {robot}",
  "Command transport for {robot} is {mode}. The values below travel through the on-robot relay, so set the transport to “relay” in {connection} above to read them.":
    "El transporte de comandos de {robot} es {mode}. Los valores de abajo viajan por el relay del robot, así que pon el transporte en “relay” en {connection}, arriba, para leerlos.",
  "The relay at {url} is not answering, so the robot cannot report its configuration right now.":
    "El relay en {url} no responde, así que el robot no puede informar su configuración ahora.",
  "publishes to": "publica en",
  "frame rate": "cuadros por segundo",
  "bitrate": "bitrate",
  "Not publishing (or not reported yet).": "No está publicando (o todavía no lo informó).",
  "The robot sends {two} H.264 streams, both encoded in hardware on its own computer:":
    "El robot envía {two} transmisiones H.264, ambas codificadas por hardware en su propia computadora:",
  "two": "dos",
  "{name} — the full-size picture over SRT to mediamtx, which Frigate records and the camera bridge re-reads (WHEP) for YOLO and the VLM. Lost packets are repaired within the SRT latency, set on THIS machine's receiver ({unit}, 900 ms): raise it there, not on the robot, if the recording breaks up.":
    "{name} — la imagen en tamaño completo por SRT a mediamtx, que Frigate graba y el puente de cámara vuelve a leer (WHEP) para YOLO y el VLM. Los paquetes perdidos se reparan dentro de la latencia SRT, definida en el receptor de ESTA máquina ({unit}, 900 ms): súbela ahí, no en el robot, si la grabación se corta.",
  "{name} — small all-intra frames over UDP, one picture per message, so a lost one costs a single frame and never a freeze. This is what Drive shows ({detail}).":
    "{name} — cuadros all-intra pequeños por UDP, una imagen por mensaje, así que perder uno cuesta un solo cuadro y nunca un congelamiento. Es lo que muestra Manejar ({detail}).",
  "480×270 at QP 36 by default on the G1": "480×270 a QP 36 por defecto en el G1",
  "640×360 at QP 38 on the Go2": "640×360 a QP 38 en el Go2",
  "On the G1 the camera bridge still reads the robot's own MJPEG (port 8093) for YOLO and the VLM. The G1 runs the same video code as the Go2 with {env}, publishing to its own mediamtx path, {path}.":
    "En el G1, el puente de cámara todavía lee el MJPEG propio del robot (puerto 8093) para YOLO y el VLM. El G1 corre el mismo código de video que el Go2 con {env}, y publica en su propia ruta de mediamtx, {path}.",
  "The robot's MJPEG on port 8093 still exists, but nothing reads it on the Go2 any more: Drive uses the all-intra stream and the camera bridge reads the recorder. That took ~0.55 Mbps off an LTE uplink with about 1 Mbps to spare.":
    "El MJPEG del robot en el puerto 8093 sigue existiendo, pero en el Go2 ya nadie lo lee: Manejar usa la transmisión all-intra y el puente de cámara lee la del grabador. Eso le quitó ~0.55 Mbps a un enlace de subida LTE con apenas 1 Mbps de margen.",
  "Useful keys in {file}: {bitrate}, {idr}, {nvr} for the recorder; {qp}, {width}, {height} for the drive view; {host} for where it all goes. The file is read when the service starts, so editing it needs a restart; the Video tab changes a few values on the running service without one.":
    "Claves útiles en {file}: {bitrate}, {idr}, {nvr} para el grabador; {qp}, {width}, {height} para la vista de manejo; {host} para el destino de todo. El archivo se lee cuando arranca el servicio, así que editarlo requiere un reinicio; la sección Video cambia algunos valores del servicio en curso sin reiniciarlo.",
  "HEC endpoint": "endpoint HEC",
  "interval": "intervalo",
  "daily byte cap": "límite diario de bytes",
  "150 MB (hec_shipper default — not set in the unit)": "150 MB (valor por defecto de hec_shipper; no está definido en la unidad)",
  "robot name": "nombre del robot",
  "Not reported yet.": "Todavía no se informó.",
  "The daily byte cap stops the agent rather than letting it run away. It was sized when the licence was a shared 500 MB/day trial; since 2026-09-04 the licence is a 50 GB/day Partner NFR, so the cap is now a runaway guard, not a budget.":
    "El límite diario de bytes detiene al agente en vez de dejar que se desboque. Se dimensionó cuando la licencia era una prueba compartida de 500 MB/día; desde el 2026-09-04 la licencia es un Partner NFR de 50 GB/día, así que el límite ahora es una protección contra desbordes, no un presupuesto.",
  "max forward / lateral": "máx. adelante / lateral",
  "max yaw": "giro máx.",
  "dead-man window": "ventana de hombre muerto",
  "rate limit": "límite de frecuencia",
  "DDS interface": "interfaz DDS",
  "Enforced on the robot, not by the caller: velocities are clamped whatever is asked for, and a movement not refreshed within the dead-man window is stopped automatically. Acrobatics (flips, jumps, handstand, dances) are not in the relay’s verb list at all, so they cannot be commanded remotely.":
    "Se aplica en el robot, no en quien envía la orden: las velocidades se recortan sin importar lo que se pida, y un movimiento que no se renueva dentro de la ventana de hombre muerto se detiene solo. Las acrobacias (volteretas, saltos, pararse de manos, bailes) ni siquiera están en la lista de verbos del relay, así que no se pueden ordenar a distancia.",
  "What is installed on the {robot}, and how to update it": "Qué está instalado en el {robot} y cómo actualizarlo",
  "Everything below runs on {host}. Log in first:": "Todo lo de abajo corre en {host}. Primero inicia sesión:",
  "Every repo of ours compiles C++, so every pull needs {build}: the binaries are gitignored, and a pull brings new source without rebuilding it. Running it when nothing changed is harmless, so just always run it.":
    "Todos nuestros repos compilan C++, así que cada pull necesita {build}: los binarios están en .gitignore y un pull trae código nuevo sin recompilarlo. Correrlo cuando nada cambió no hace daño, así que córrelo siempre.",
  "Pull the SDK only to take an upstream update — and then rebuild every repo, since the binaries are statically linked against it:":
    "Haz pull del SDK solo para tomar una actualización de upstream, y después recompila todos los repos, porque los binarios están enlazados estáticamente con él:",
  "First-time setup on the {robot}": "Primera configuración en el {robot}",
  "Once per robot, in this order. Already-done steps are marked as such; they are kept here because they are what to repeat if the computer is ever reinstalled.":
    "Una vez por robot, en este orden. Los pasos ya hechos están marcados como tales; se mantienen aquí porque son lo que hay que repetir si alguna vez se reinstala la computadora.",
  "Services on the robot": "Servicios en el robot",
  "All are enabled at boot, so powering the robot on is enough — nothing here has to be started by hand.":
    "Todos se habilitan al arrancar, así que basta con encender el robot: nada de esto hay que iniciarlo a mano.",
  "The browser talks only to the backend, which reaches iacore and the robots for it. It is pointed at:":
    "El navegador habla solo con el backend, que llega a iacore y a los robots por él. Apunta a:",
  "same origin (the backend serves this page)": "mismo origen (el backend sirve esta página)",
  "Change it in {file} (read at runtime, no rebuild) or with {var} at build time.":
    "Cámbialo en {file} (se lee en ejecución, sin recompilar) o con {var} al compilar.",

  // --- Robot: what lives on each robot (pages/robotDeploy.ts)
  "no prefix": "sin prefijo",
  "runs only on the Go2": "corre solo en el Go2",
  "runs only on the G1": "corre solo en el G1",
  "shared — the same file runs on both": "compartido: el mismo archivo corre en ambos",
  "the G1's unit, installed under the name WITHOUT .g1": "la unidad del G1, instalada con el nombre SIN .g1",
  "the Go2's Jetson": "el Jetson del Go2",
  "the G1's PC2 (the Jetson). PC1 (.161) has no SSH and is never touched": "el PC2 del G1 (el Jetson). El PC1 (.161) no tiene SSH y nunca se toca",
  "go2_command_sender (go2::SportClient) on the shared sender_core.hpp": "go2_command_sender (go2::SportClient) sobre el sender_core.hpp compartido",
  "videohub_jpeg_stream (shared with the G1) or go2_h264_stream (Go2-only multicast) — SRT to HQ :8891, mediamtx path `robot`":
    "videohub_jpeg_stream (compartido con el G1) o go2_h264_stream (multicast solo del Go2) — SRT a HQ :8891, ruta de mediamtx `robot`",
  "g1_telemetry_reader (unitree_hg IDL, 29 joints, rt/lf/bmsstate)": "g1_telemetry_reader (IDL unitree_hg, 29 articulaciones, rt/lf/bmsstate)",
  "host/g1/uplink-failover.sh — cable when it works, WiFi when it does not": "host/g1/uplink-failover.sh — cable cuando funciona, WiFi cuando no",
  "g1_command_sender (g1::LocoClient) on the shared sender_core.hpp — verbs use the FSM ids measured on this robot":
    "g1_command_sender (g1::LocoClient) sobre el sender_core.hpp compartido — los verbos usan los ids de FSM medidos en este robot",
  "videohub_jpeg_stream (shared with the Go2) reading Unitree's videohub_pc4 — SRT to HQ :8893, mediamtx path `g1`":
    "videohub_jpeg_stream (compartido con el Go2) leyendo el videohub_pc4 de Unitree — SRT a HQ :8893, ruta de mediamtx `g1`",
  "ThousandEyes agent, Docker host network (the Go2's is bridge)": "agente de ThousandEyes, red host de Docker (la del Go2 es bridge)",
  "Renamed from telemetry_reader on 2026-09-30. The first pull after that builds the new name; run.sh already points at it. The old binary is left unused.":
    "Renombrado desde telemetry_reader el 2026-09-30. El primer pull después de esa fecha compila el nombre nuevo; run.sh ya apunta a él. El binario viejo queda sin uso.",
  "The FIRST pull after 2026-10-01 needs all four lines: the sender was renamed from command_sender, and the relay now refuses to start while SENDER_BIN still names the old binary (the old relay.env and unit both pin it). After that, pull + build + restart as usual.":
    "El PRIMER pull después del 2026-10-01 necesita las cuatro líneas: el sender se renombró desde command_sender, y el relay ahora se niega a arrancar mientras SENDER_BIN siga nombrando el binario viejo (el relay.env y la unidad viejos lo fijan). Después, pull + build + restart como siempre.",
  "Index g1-robot-data, its own HEC token (g1-robot-telemetry).": "Índice g1-robot-data, con su propio token HEC (g1-robot-telemetry).",
  "eth0 is the robot's internal bus and never loses carrier, so unplugging the cable never fails over by itself. This probes the wired gateway instead.":
    "eth0 es el bus interno del robot y nunca pierde la portadora, así que desenchufar el cable nunca conmuta por sí solo. Esto sondea el gateway cableado en su lugar.",
  "No damp, no zero_torque, no SDK squat (it half-falls on this robot). Walk follows the app's waist lock, declared as G1_WAIST_LOCK in relay.env: 1 = locked, FSM 500; unset = free, FSM 501. The robot runs with it locked (2026-10-01): add G1_WAIST_LOCK=1 on the first pull after that date. Clamps 1.2 / 0.5 / 1.2 (MAX_* in relay.env). First-time step 6. Since 2026-10-13 build.sh also builds g1_joint_bridge, the read-only joint state behind the Joints page; the relay starts it only while someone watches. Since 2026-10-14 also g1_joint_sender, which moves the arms when the page takes control (rt/arm_sdk, robot standing in Walk); it runs only until release. The unit copy matters since 2026-10-15: the old one capped the relay at CPUQuota=25%, which froze the arm sender in bursts (trembling, then 'the robot's mode could not be read').":
    "Sin damp, sin zero_torque, sin la sentadilla del SDK (en este robot se medio cae). Walk sigue el bloqueo de cintura de la app, declarado como G1_WAIST_LOCK en relay.env: 1 = bloqueada, FSM 500; sin definir = libre, FSM 501. El robot corre con la cintura bloqueada (2026-10-01): agrega G1_WAIST_LOCK=1 en el primer pull después de esa fecha. Límites 1.2 / 0.5 / 1.2 (MAX_* en relay.env). Primera configuración, paso 6. Desde el 2026-10-13, build.sh también compila g1_joint_bridge, el estado articular de solo lectura detrás de la página Articulaciones; el relay lo inicia solo mientras alguien mira. Desde el 2026-10-14 también g1_joint_sender, que mueve los brazos cuando la página toma el control (rt/arm_sdk, robot de pie en Walk); corre solo hasta que se libera. Copiar la unidad importa desde el 2026-10-15: la vieja limitaba el relay a CPUQuota=25%, lo que congelaba el sender de brazos a ratos (temblores y luego 'no se pudo leer el modo del robot').",
  "Unitree's videohub_pc4 owns the RealSense colour node, so the G1 reads the camera through it, like the Go2 — never by opening /dev/video4. Config: robot/video.g1.env.example (first-time step 5).":
    "El videohub_pc4 de Unitree es dueño del nodo de color de la RealSense, así que el G1 lee la cámara a través de él, igual que el Go2; nunca abriendo /dev/video4. Configuración: robot/video.g1.env.example (primera configuración, paso 5).",
  "Not a repo. Recreate with ./install-te-agent.sh --replace (asks for the account GROUP token, not the API token).":
    "No es un repo. Se recrea con ./install-te-agent.sh --replace (pide el token de GRUPO de la cuenta, no el token de la API).",
  "1. Unitree SDK with the G1 types": "1. SDK de Unitree con los tipos del G1",
  "Not the factory ~/unitree_sdk2-main: it has no unitree_hg IDL, so the G1 reader does not compile against it. Leave that one alone.":
    "No el ~/unitree_sdk2-main de fábrica: no tiene el IDL unitree_hg, así que el lector del G1 no compila con él. Ese no se toca.",
  "2. Replace the rsync copy with a clone (once the code is committed)": "2. Reemplazar la copia de rsync por un clon (cuando el código esté commiteado)",
  "Until this is done, git pull does not work on the G1: the telemetry agent there is a copy made on 2026-09-30 before the code was committed.":
    "Hasta que se haga esto, git pull no funciona en el G1: el agente de telemetría de ahí es una copia hecha el 2026-09-30, antes de commitear el código.",
  "3. HEC token and the telemetry unit": "3. Token HEC y la unidad de telemetría",
  "Done on 2026-09-30. The .g1.service file is installed under the Go2's name on purpose: every robot has ONE robot-telemetry-agent unit.":
    "Hecho el 2026-09-30. El archivo .g1.service se instala con el nombre del Go2 a propósito: cada robot tiene UNA unidad robot-telemetry-agent.",
  "4. Uplink failover": "4. Conmutación del enlace de subida",
  "Done on 2026-09-30 (from a copy in ~/uplink-failover; after the clone, reinstall from the repo with these same lines).":
    "Hecho el 2026-09-30 (desde una copia en ~/uplink-failover; después del clon, reinstalar desde el repo con estas mismas líneas).",
  "5. Video": "5. Video",
  "Same unit as the Go2: everything that differs lives in video.env. HQ needs srt-bridge-g1 (:8893) and the `g1` path in mediamtx, both set up 2026-10-01.":
    "La misma unidad que el Go2: todo lo que cambia vive en video.env. HQ necesita srt-bridge-g1 (:8893) y la ruta `g1` en mediamtx, ambos configurados el 2026-10-01.",
  "6. Command relay — with someone next to the robot": "6. Relay de comandos — con alguien junto al robot",
  "Its OWN token, not the Go2's — the executor reads G1_RELAY_TOKEN first. On HQ, set G1_TRANSPORT=relay and G1_RELAY_URL=http://192.168.51.115:8092 for the executor. The first move: robot on its hanger, stand_up, walk_waist, then a short move — stop_move ready.":
    "Su PROPIO token, no el del Go2: el executor lee G1_RELAY_TOKEN primero. En HQ, define G1_TRANSPORT=relay y G1_RELAY_URL=http://192.168.51.115:8092 para el executor. El primer movimiento: robot en su colgador, stand_up, walk_waist y luego un move corto, con stop_move listo.",

  // --- Robot: connection
  "{robot}: address saved": "{robot}: dirección guardada",
  "invalid address": "dirección inválida",
  "{robot}: {mode} — executor restarting…": "{robot}: {mode} — reiniciando el executor…",
  "could not switch transport": "no se pudo cambiar el transporte",
  "executor unreachable": "no se puede llegar al executor",
  "Unicast to {peers}. Executor restarting…": "Unicast a {peers}. Reiniciando el executor…",
  "Back to multicast. Executor restarting…": "De vuelta a multicast. Reiniciando el executor…",
  "could not apply": "no se pudo aplicar",
  "could not reach the gateway": "no se pudo llegar al gateway",
  "{robot}: online": "{robot}: en línea",
  "{robot}: offline": "{robot}: sin conexión",
  "{robot}: no address set": "{robot}: sin dirección definida",
  "· relay up, sender down": "· relay activo, sender caído",
  "Command transport": "Transporte de comandos",
  "Relay on the robot — any network": "Relay en el robot — cualquier red",
  "DDS from this machine — same subnet only": "DDS desde esta máquina — solo en la misma subred",
  "Commands go over HTTP to the relay on the robot, which publishes DDS there.":
    "Los comandos van por HTTP al relay del robot, que los publica como DDS allí.",
  "Commands are published as DDS from this machine — only while the robot shares its subnet.":
    "Los comandos se publican como DDS desde esta máquina, solo mientras el robot comparta su subred.",
  "Relay URL": "URL del relay",
  "Applies on Enter or when the field loses focus": "Se aplica con Enter o cuando el campo pierde el foco",
  "Online check address": "Dirección para comprobar la conexión",
  "Pinged from the server ONLY to light the online dot — it does not affect commands or video. Empty = no check.":
    "El servidor le hace ping SOLO para encender el punto de conexión; no afecta los comandos ni el video. Vacío = sin comprobación.",
  "Advanced — DDS discovery peers (all robots, same-subnet DDS only)":
    "Avanzado — pares de descubrimiento DDS (todos los robots, solo DDS en la misma subred)",
  "Robot IP(s), comma-separated — empty = multicast": "IP(s) del robot, separadas por comas — vacío = multicast",
  "Apply + restart executor": "Aplicar y reiniciar el executor",
  "Interface {iface} · discovery {discovery}": "Interfaz {iface} · descubrimiento {discovery}",
  "Only for DDS from this machine with the robot on ANOTHER subnet of the same site: discovery is multicast and multicast does not cross a router. Not used with the relay.":
    "Solo para DDS desde esta máquina con el robot en OTRA subred del mismo sitio: el descubrimiento es multicast y el multicast no cruza un router. No se usa con el relay.",

  // --- Robot: camera stream
  "Test pattern instead of the {robot} camera (no robot needed)": "Patrón de prueba en lugar de la cámara del {robot} (no hace falta el robot)",
  "native": "nativa",
  "Quality": "Calidad",
  "Native": "Nativa",
  "Lower = less latency for remote viewers. Anything but Native re-encodes on the bridge. This is the MJPEG view only; H.264 is encoded on the robot.":
    "Más bajo = menos latencia para los espectadores remotos. Cualquier opción que no sea Nativa se recodifica en el puente. Esto es solo la vista MJPEG; el H.264 se codifica en el robot.",

  // --- Video tuning
  "Drive quality": "Calidad de la vista de manejo",
  "Lower = sharper and more bytes per frame. Measured on the Go2 over LTE: QP 40 at 480×270 ≈ 3 kB a frame (0.34 Mbps), QP 38 at 640×360 ≈ 6 kB (0.6-0.7 Mbps), latency unchanged. Every frame stands alone, so a lost one costs one picture, never a freeze.":
    "Más bajo = más nítido y más bytes por cuadro. Medido en el Go2 por LTE: QP 40 a 480×270 ≈ 3 kB por cuadro (0.34 Mbps), QP 38 a 640×360 ≈ 6 kB (0.6-0.7 Mbps), con la misma latencia. Cada cuadro es independiente, así que perder uno cuesta una imagen, nunca un congelamiento.",
  "Drive size": "Tamaño de la vista de manejo",
  "px wide": "px de ancho",
  "16:9; the robot sets the height to match (640 → 640×360). Bigger costs bytes at the same quality — raise the size or lower the QP, rarely both on LTE.":
    "16:9; el robot ajusta el alto (640 → 640×360). Más grande cuesta bytes con la misma calidad: sube el tamaño o baja el QP, rara vez ambos por LTE.",
  "Recorder bitrate": "Bitrate del grabador",
  "H.264 over SRT, the stream Frigate records and the camera bridge re-reads for YOLO and the VLM. 1.3 Mbps holds over LTE because this machine's SRT receiver waits 900 ms to repair losses (srt-bridge.service); at 150 ms the same bitrate dropped 10-15% of packets and the recording broke into blocks and drifted purple.":
    "H.264 por SRT: la transmisión que graba Frigate y que el puente de cámara vuelve a leer para YOLO y el VLM. 1.3 Mbps se sostiene por LTE porque el receptor SRT de esta máquina espera 900 ms para reparar pérdidas (srt-bridge.service); con 150 ms, el mismo bitrate perdía 10-15% de los paquetes y la grabación se rompía en bloques y se teñía de violeta.",
  "Recorder keyframe interval": "Intervalo de cuadros clave del grabador",
  "frames": "cuadros",
  "Lower = a damaged picture heals sooner and a new viewer starts sooner, at more bitrate. A keyframe is ~22 packets at 1080p; one lost and the picture is wrong until the next one.":
    "Más bajo = una imagen dañada se recupera antes y un espectador nuevo arranca antes, a costa de más bitrate. Un cuadro clave son ~22 paquetes a 1080p; si se pierde uno, la imagen queda mal hasta el siguiente.",
  "Feed the recorder": "Alimentar el grabador",
  "Off stops the SRT stream entirely: nothing recorded, and no picture for YOLO and the VLM on the Go2 (its camera bridge reads this stream). Drive is unaffected — it has its own stream.":
    "Apagado detiene por completo la transmisión SRT: no se graba nada y no hay imagen para YOLO ni el VLM en el Go2 (su puente de cámara lee esta transmisión). Manejar no se ve afectado: tiene su propia transmisión.",
  "Capture cap": "Límite de captura",
  "How fast the robot takes pictures from its camera, upstream of every stream. 0 = every new frame the camera makes (~14 fps on the Go2).":
    "Qué tan rápido toma imágenes el robot de su cámara, antes de toda transmisión. 0 = cada cuadro nuevo que genera la cámara (~14 fps en el Go2).",
  "MJPEG frame cap": "Límite de cuadros MJPEG",
  "0 = every frame. Applied per viewer.": "0 = todos los cuadros. Se aplica por espectador.",
  "MJPEG downscale to": "Reducir MJPEG a",
  "0 = native, forwarded untouched. Anything else costs the robot a decode and re-encode per frame.":
    "0 = nativo, se reenvía sin tocar. Cualquier otro valor le cuesta al robot decodificar y recodificar cada cuadro.",
  "MJPEG quality": "Calidad MJPEG",
  "Only matters while the downscale is above 0: at native size nothing is re-encoded.":
    "Solo importa mientras la reducción esté por encima de 0: en tamaño nativo no se recodifica nada.",
  "The all-intra stream Drive shows, over UDP. Both apply to the running stream immediately — safe to move while someone is driving.":
    "La transmisión all-intra que muestra Manejar, por UDP. Ambos se aplican de inmediato a la transmisión en curso: se pueden mover mientras alguien maneja.",
  "The full-size stream, over SRT. Read when the video service starts, so these only take effect after a restart — a few seconds of black on every stream. Not while someone is driving.":
    "La transmisión en tamaño completo, por SRT. Se lee cuando arranca el servicio de video, así que estos valores solo surten efecto tras un reinicio: unos segundos en negro en todas las transmisiones. No mientras alguien maneja.",
  "Nothing reads it on the Go2 any more (Drive uses the stream above, the camera bridge the recorder), so these change nothing you see.":
    "En el Go2 ya nadie la lee (Manejar usa la transmisión de arriba y el puente de cámara, la del grabador), así que estos valores no cambian nada de lo que ves.",
  "What the camera bridge reads on this robot — YOLO's and the VLM's picture.":
    "Lo que lee el puente de cámara en este robot: la imagen de YOLO y del VLM.",
  "Saved. {keys} apply when the video service restarts": "Guardado. {keys} se aplican cuando se reinicie el servicio de video",
  "Applied and saved to the robot": "Aplicado y guardado en el robot",
  "Applied (not saved)": "Aplicado (sin guardar)",
  "the robot refused it": "el robot lo rechazó",
  "Video tuning — {robot}": "Ajuste de video — {robot}",
  "The robot's video knobs, by stream. The right values differ on cable, LTE and Starlink, which is why they are here and not behind SSH. Each knob says whether it applies now or needs a restart of the robot's video service.":
    "Los controles de video del robot, por transmisión. Los valores correctos cambian entre cable, LTE y Starlink; por eso están aquí y no detrás de SSH. Cada control indica si se aplica ya o si necesita reiniciar el servicio de video del robot.",
  "The robot is not answering: {error}. Check that the command transport is set to {relay} under Connection.":
    "El robot no responde: {error}. Revisa que el transporte de comandos esté en {relay} en Conexión.",
  "unknown error": "error desconocido",
  "on": "encendido",
  "off": "apagado",
  "· applies now": "· se aplica ya",
  "· needs a restart": "· requiere reinicio",
  "This robot does not report it — its relay is an older build that only knows the frame cap, the downscale and the quality. Nothing is shown because nothing is known; update the relay to tune it here.":
    "Este robot no lo informa: su relay es una versión anterior que solo conoce el límite de cuadros, la reducción y la calidad. No se muestra nada porque no se sabe nada; actualiza el relay para ajustarlo aquí.",
  "running: {value}": "en curso: {value}",
  "saved: {value}": "guardado: {value}",
  "unset": "sin definir",
  "— differs from what is running; applies on the next restart": "— difiere de lo que está en curso; se aplica en el próximo reinicio",
  "1 unsaved change": "1 cambio sin guardar",
  "{n} unsaved changes": "{n} cambios sin guardar",
  "Apply changes the running video only; Apply and save also writes the robot's {file}.":
    "Aplicar cambia solo el video en curso; Aplicar y guardar además escribe el {file} del robot.",
  "Nothing left to apply.": "No queda nada por aplicar.",

  // Settings → Single sign-on
  "Single sign-on": "Inicio de sesión único",
  "Other (OIDC)": "Otro (OIDC)",
  "Could not read the single sign-on settings.": "No se pudo leer la configuración del inicio de sesión único.",
  "Could not save the single sign-on settings.": "No se pudo guardar la configuración del inicio de sesión único.",
  "Your team signs in with their work account instead of a Pilot password. Only people you invite get in; the password keeps working as the way in when the provider is down.":
    "Tu equipo inicia sesión con su cuenta de trabajo en lugar de una contraseña de Pilot. Solo entran las personas que invites; la contraseña sigue sirviendo para entrar cuando el proveedor no responde.",
  "Provider": "Proveedor",
  "Redirect URI": "URI de redirección",
  "Register this exact address at the provider.": "Registra exactamente esta dirección en el proveedor.",
  "The provider only accepts https addresses (or localhost). Pilot needs a name with a certificate, picked as the address people reach it on (Team & roles, when you invite someone).":
    "El proveedor solo acepta direcciones https (o localhost). Pilot necesita un nombre con certificado, elegido como la dirección por la que se llega a él (Equipo y roles, al invitar a alguien).",
  "Directory (tenant) ID": "Id. de directorio (inquilino)",
  "In Microsoft Entra: Overview. The tenant's domain works too (silk-technologies.com).":
    "En Microsoft Entra: Información general. También sirve el dominio del inquilino (silk-technologies.com).",
  "Issuer URL": "URL del emisor",
  "The address before /.well-known/openid-configuration.": "La dirección antes de /.well-known/openid-configuration.",
  "Application (client) ID": "Id. de aplicación (cliente)",
  "Client ID": "Id. de cliente",
  "Client secret": "Secreto de cliente",
  "Certificates & secrets → New client secret: copy its Value (shown only once). It expires; put the new one here before it does.":
    "Certificados y secretos → Nuevo secreto de cliente: copia su Valor (se muestra una sola vez). Vence; pon el nuevo aquí antes de que venza.",
  "Saved — leave empty to keep it": "Guardado — déjalo vacío para conservarlo",
  "Offer it on the sign-in page": "Ofrecerlo en la pantalla de inicio de sesión",
  "In the Microsoft Entra admin center: {path}, any name (\"Silk Pilot\"), single tenant.":
    "En el centro de administración de Microsoft Entra: {path}, cualquier nombre (\"Silk Pilot\"), un solo inquilino.",
  "App registrations → New registration": "Registros de aplicaciones → Nuevo registro",
  "Redirect URI: platform {web}, the address above.": "URI de redirección: plataforma {web}, la dirección de arriba.",
  "Copy the Application (client) ID and the Directory (tenant) ID from its Overview.":
    "Copia el Id. de aplicación (cliente) y el Id. de directorio (inquilino) desde su Información general.",
  "Create a client secret and paste its Value here, then turn this on and save: Pilot checks with Microsoft before saving.":
    "Crea un secreto de cliente y pega su Valor aquí; después actívalo y guarda: Pilot lo comprueba con Microsoft antes de guardar.",
  "Passwords from the internet": "Contraseñas desde internet",
  "Allow passwords from the internet": "Permitir contraseñas desde internet",
  "Off: from outside the company network people sign in with their work account (and its second factor); a password works only from the office, VPN or Tailscale.":
    "Apagado: desde fuera de la red de la empresa se entra con la cuenta de trabajo (y su segundo factor); la contraseña sirve solo desde la oficina, la VPN o Tailscale.",
};
