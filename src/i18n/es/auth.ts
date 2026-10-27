// Spanish — auth. Keys are the English texts exactly as in t("…") / msg("…").
// Sign-in, first-run setup, invitations, password resets, password strength, and the page a
// role may not open. "<br>", "<em>…</em>" and "<b>…</b>" are markup read by AuthScreens' Rich:
// keep them, move them to where the Spanish puts the words.
export const AUTH: Record<string, string> = {
  // Errors written by the frontend
  "Too many attempts. Try again in 1 minute.": "Demasiados intentos. Vuelve a intentarlo en 1 minuto.",
  "Too many attempts. Try again in {n} minutes.": "Demasiados intentos. Vuelve a intentarlo en {n} minutos.",
  "Could not reach the server. Check the connection and try again.": "No se pudo conectar con el servidor. Revisa la conexión y vuelve a intentarlo.",
  "Something went wrong ({status}). Try again.": "Algo salió mal ({status}). Vuelve a intentarlo.",
  "Something went wrong ({status}).": "Algo salió mal ({status}).",
  "This server is running an older version of Pilot. Restart it to finish the update.": "Este servidor ejecuta una versión anterior de Pilot. Reinícialo para terminar la actualización.",

  // The brand panel and the shared form parts
  "Every limit enforced on the robot": "Cada límite se aplica en el robot",
  "Teams and roles": "Equipos y roles",
  "Runs on your own server": "Funciona en tu propio servidor",
  "Hide password": "Ocultar contraseña",
  "Show password": "Mostrar contraseña",
  "Confirm password": "Confirmar contraseña",
  "Full name": "Nombre completo",
  "The passwords do not match": "Las contraseñas no coinciden",
  "Keep me signed in on this device for 30 days": "Mantener la sesión iniciada en este dispositivo por 30 días",
  "This link does not work": "Este enlace no funciona",
  "Go to sign in": "Ir a iniciar sesión",

  // Password strength (lib/password.ts)
  "At least {n} characters": "Al menos {n} caracteres",
  "Cannot be your email": "No puede ser tu correo electrónico",
  "Weak": "Débil",
  "Fair": "Aceptable",
  "Good": "Buena",
  "Strong": "Fuerte",

  // Sign in
  "Operate every robot<br>from <em>one place.</em>": "Opera todos tus robots<br>desde <em>un solo lugar.</em>",
  "Live video, AI perception and safe teleoperation for robots — on your own server.": "Video en vivo, percepción con IA y teleoperación segura para robots, en tu propio servidor.",
  "Sign in to {org}": "Iniciar sesión en {org}",
  "Sign in to Pilot": "Iniciar sesión en Pilot",
  "Welcome back. Use your work account.": "Hola de nuevo. Usa tu cuenta de trabajo.",
  "Your session ended. Sign in again to continue.": "Tu sesión terminó. Vuelve a iniciar sesión para continuar.",
  "Forgot?": "¿La olvidaste?",
  "Ask an admin of {org} for a password reset link.": "Pide a un administrador de {org} un enlace para restablecer la contraseña.",
  "Ask an admin of your workspace for a password reset link.": "Pide a un administrador de tu espacio de trabajo un enlace para restablecer la contraseña.",
  "Signing in…": "Iniciando sesión…",
  "Sign in": "Iniciar sesión",
  "No account yet? Ask your workspace admin for an invitation.": "¿Aún no tienes cuenta? Pide una invitación al administrador de tu espacio de trabajo.",

  // First-run setup
  "Verify server": "Verificar servidor",
  "Company": "Empresa",
  "Your account": "Tu cuenta",
  "Let's set up<br><em>Silk Pilot.</em>": "Configuremos<br><em>Silk Pilot.</em>",
  "Three quick steps. You will be the owner of this workspace: after this, you invite your team and decide what each person can do.": "Tres pasos rápidos. Serás el dueño de este espacio de trabajo: después invitas a tu equipo y decides qué puede hacer cada persona.",
  "Verify this server": "Verifica este servidor",
  "So that only someone with access to the server can claim it, it wrote a one-time setup code when it started. On the server, run:": "Para que solo alguien con acceso al servidor pueda reclamarlo, al arrancar escribió un código de configuración de un solo uso. En el servidor, ejecuta:",
  "Copy command": "Copiar comando",
  "Setup code": "Código de configuración",
  "Continue": "Continuar",
  "The workspace your team signs in to. You can rename it later.": "El espacio de trabajo en el que inicia sesión tu equipo. Puedes cambiarle el nombre después.",
  "Company name": "Nombre de la empresa",
  "Acme Logistics": "Acme Logística",
  "You will be the <b>owner</b> of {org}.": "Serás el <b>dueño</b> de {org}.",
  "You will be the <b>owner</b> of the workspace.": "Serás el <b>dueño</b> del espacio de trabajo.",
  "Creating…": "Creando…",
  "Create workspace": "Crear espacio de trabajo",
  "Back": "Atrás",

  // Joining through an invitation
  "This invitation link is incomplete.": "Este enlace de invitación está incompleto.",
  "Welcome to<br><em>{org}.</em>": "Te damos la bienvenida a<br><em>{org}.</em>",
  "Create your account to join your team on Silk Pilot.": "Crea tu cuenta para unirte a tu equipo en Silk Pilot.",
  "You are already signed in": "Ya iniciaste sesión",
  "This browser is signed in as <b>{email}</b>. To accept this invitation as someone else, sign out first.": "Este navegador tiene la sesión iniciada como <b>{email}</b>. Para aceptar esta invitación como otra persona, primero cierra sesión.",
  "Sign out and continue": "Cerrar sesión y continuar",
  "Stay signed in and go to the app": "Mantener la sesión e ir a la app",
  "Checking your invitation…": "Verificando tu invitación…",
  "Join {org}": "Únete a {org}",
  "{name} invited you as <b>{role}</b>.": "{name} te invitó como <b>{role}</b>.",
  "You were invited as <b>{role}</b>.": "Te invitaron como <b>{role}</b>.",
  "Creating your account…": "Creando tu cuenta…",
  "Create account and join": "Crear cuenta y unirme",

  // A new password through a reset link
  "This reset link is incomplete.": "Este enlace de restablecimiento está incompleto.",
  "Back in,<br><em>in a moment.</em>": "De vuelta,<br><em>en un momento.</em>",
  "Choose a new password. Every other device signed in to your account is signed out.": "Elige una contraseña nueva. Se cerrará la sesión en todos los demás dispositivos con tu cuenta.",
  "Checking your link…": "Verificando tu enlace…",
  "Set a new password": "Define una contraseña nueva",
  "For <b>{email}</b> at {org}.": "Para <b>{email}</b> en {org}.",
  "Save and sign in": "Guardar e iniciar sesión",

  // Server unreachable
  "Can't reach the Pilot server": "No se puede conectar con el servidor de Pilot",
  "The page loaded, but the server behind it did not answer. It may be restarting.": "La página cargó, pero el servidor detrás de ella no respondió. Puede que se esté reiniciando.",
  "Try again": "Reintentar",

  // A page the role may not open
  "Not available for your role": "No disponible para tu rol",
  "You are signed in as {role}. Ask an admin of {org} if you need access to this page.": "Iniciaste sesión como {role}. Si necesitas acceso a esta página, pídeselo a un administrador de {org}.",
};
