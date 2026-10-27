// Spanish — server. Keys are the English texts exactly as in t("…") / msg("…").
// The backend's own `detail` texts (AI-VL-backend: auth.py, team.py, fleet.py, chats.py),
// translated by exact match where the frontend turns a failed response into an error
// (check() in api/fleet.ts, readError() in api/auth.ts). A key must be the server's text to
// the letter, period included; change one there and it shows in English until it changes here.
// Texts built from a value (an email, a robot's name) cannot match and stay in English.
export const SERVER: Record<string, string> = {
  // auth.py — sign-in, setup, profile, the guards in front of every route
  "Use at least 12 characters.": "Usa al menos 12 caracteres.",
  "Use at most 128 characters.": "Usa como máximo 128 caracteres.",
  "The password cannot be your email address.": "La contraseña no puede ser tu correo electrónico.",
  "Enter a valid email address.": "Ingresa un correo electrónico válido.",
  "Too many attempts. Try again later.": "Demasiados intentos. Vuelve a intentarlo más tarde.",
  "Too many attempts. Try again in a few minutes.": "Demasiados intentos. Vuelve a intentarlo en unos minutos.",
  "This install is already set up. Sign in instead.": "Esta instalación ya está configurada. Inicia sesión.",
  "That setup code is not right.": "Ese código de configuración no es correcto.",
  "Wrong email or password.": "Correo electrónico o contraseña incorrectos.",
  "Not a person": "No es una persona",
  "Your name cannot be empty.": "Tu nombre no puede estar vacío.",
  "Your current password is not right.": "Tu contraseña actual no es correcta.",
  "A preference is at most 200 characters.": "Una preferencia tiene como máximo 200 caracteres.",
  "Not allowed": "No permitido",
  "Cross-origin request refused": "Solicitud de otro origen rechazada",
  "Sign in to continue": "Inicia sesión para continuar",
  "Your role does not allow this": "Tu rol no lo permite",

  // team.py — members, invitations, password resets, the public address
  "You cannot invite someone with a role above your own.": "No puedes invitar a alguien con un rol superior al tuyo.",
  "You cannot change someone with a role above your own.": "No puedes cambiar a alguien con un rol superior al tuyo.",
  "You cannot give a role above your own.": "No puedes asignar un rol superior al tuyo.",
  "You cannot reset the password of someone with a role above your own.": "No puedes restablecer la contraseña de alguien con un rol superior al tuyo.",
  "Give the address as https://host:port — nothing after it.": "Escribe la dirección como https://host:puerto, sin nada después.",
  "That invitation is no longer pending.": "Esa invitación ya no está pendiente.",
  "You cannot change your own role or access.": "No puedes cambiar tu propio rol ni tu acceso.",
  "No such member.": "No existe ese miembro.",
  "The company needs at least one active owner.": "La empresa necesita al menos un dueño activo.",
  "This invitation link is not valid.": "Este enlace de invitación no es válido.",
  "This invitation was already used. Sign in instead.": "Esta invitación ya se usó. Inicia sesión.",
  "This invitation has expired. Ask for a new one.": "Esta invitación venció. Pide una nueva.",
  "Change your own password while signed in, not with a reset link.": "Cambia tu propia contraseña con la sesión iniciada, no con un enlace de restablecimiento.",
  "Enable this member before resetting their password.": "Habilita a este miembro antes de restablecer su contraseña.",
  "This reset link is not valid.": "Este enlace de restablecimiento no es válido.",
  "This reset link was already used. Sign in instead.": "Este enlace de restablecimiento ya se usó. Inicia sesión.",
  "This reset link has expired. Ask an admin for a new one.": "Este enlace de restablecimiento venció. Pide uno nuevo a un administrador.",

  // fleet.py — sites, floor plans, robots
  "Send both latitude and longitude, or neither.": "Envía la latitud y la longitud, o ninguna de las dos.",
  "No such site.": "No existe ese sitio.",
  "Give the site a name.": "Ponle un nombre al sitio.",
  "The plan is larger than 10 MB.": "El plano pesa más de 10 MB.",
  "Upload the plan as a PNG, JPEG or WebP image.": "Sube el plano como imagen PNG, JPEG o WebP.",
  "This site has no plan.": "Este sitio no tiene plano.",
  "Give the robot a name and a type.": "Ponle al robot un nombre y un tipo.",
  "No such robot.": "No existe ese robot.",

  // chats.py
  "No such chat.": "No existe esa conversación.",
};
