import type { ReactNode } from "react";
import { IconLock } from "@tabler/icons-react";
import { useMe } from "./AuthContext";
import { useCan, type Permission } from "./permissions";
import { ROLE_LABEL } from "./roles";
import { useT } from "../i18n";


/** A page that only some roles may use. A typed URL or an old bookmark lands here instead of on
 * a page whose every button would come back 403. */
export function RequirePermission({ perm, children }: { perm: Permission; children: ReactNode }) {
  const t = useT();
  const can = useCan();
  const me = useMe();
  if (can(perm)) return <>{children}</>;
  return (
    <main className="grid min-h-[60vh] place-items-center p-6">
      <div className="max-w-sm text-center">
        <span className="mx-auto mb-4 grid size-12 place-items-center rounded-xl bg-panel text-muted">
          <IconLock size={24} />
        </span>
        <h1 className="m-0 text-lg font-semibold text-fg">{t("Not available for your role")}</h1>
        <p className="mt-2 text-sm text-muted">
          {t("You are signed in as {role}. Ask an admin of {org} if you need access to this page.",
            { role: t(ROLE_LABEL[me.role]), org: me.org.name })}
        </p>
      </div>
    </main>
  );
}
