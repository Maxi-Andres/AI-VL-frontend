import { Outlet } from "react-router-dom";
import { Header } from "./Header";
import { StatusBadge } from "./StatusBadge";
import { StatusProvider, useStatus } from "./StatusContext";

function HeaderWithStatus() {
  const { connected } = useStatus();
  return (
    <Header>
      <StatusBadge connected={connected} />
    </Header>
  );
}

/** App shell: header (with nav + live status) over the routed page. */
export function Layout() {
  return (
    <StatusProvider>
      <HeaderWithStatus />
      <Outlet />
    </StatusProvider>
  );
}
