// The one place that hears "the backend no longer knows who you are" (HTTP 401). The REST
// helper reports every 401 here and the AuthProvider listens, so a session that expires or is
// revoked mid-use sends the app back to the sign-in screen from wherever it was — no page has
// to handle it. WebSockets need nothing of their own: the same moment their REST siblings
// (presence is polled every few seconds) hit a 401, the app unmounts and closes them.
type Listener = () => void;

const listeners = new Set<Listener>();

export function onSignedOut(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function notifySignedOut(): void {
  for (const fn of listeners) fn();
}
