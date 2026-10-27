// Settings → Single sign-on (sso.py): the company's identity provider. Owners only. The client
// secret goes in and never comes back: `has_secret` says whether one is saved.
import { backendFetch } from "./backend";
import { check } from "./fleet";

export type SsoProvider = "microsoft" | "google" | "oidc";

export interface SsoSettings {
  enabled: boolean;
  provider: SsoProvider;
  /** Microsoft: the Directory (tenant) ID or the company's domain. */
  tenant: string;
  /** Any other OIDC provider: its issuer URL. */
  issuer: string;
  client_id: string;
  has_secret: boolean;
  /** What to register at the provider: built on the public address when there is one. */
  redirect_uri: string;
  public_url: string | null;
  /** Passwords from the internet too; off: only from the company network while this is on. */
  password_anywhere: boolean;
}

export interface SsoUpdate {
  enabled: boolean;
  provider: SsoProvider;
  tenant: string;
  issuer: string;
  client_id: string;
  /** Empty keeps the saved one. */
  client_secret: string;
  password_anywhere: boolean;
}

export async function getSso(signal?: AbortSignal): Promise<SsoSettings> {
  return (await check(await backendFetch("/api/org/sso", { signal }))).json();
}

export async function saveSso(body: SsoUpdate): Promise<SsoSettings> {
  return (await check(await backendFetch("/api/org/sso", {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  }))).json();
}
