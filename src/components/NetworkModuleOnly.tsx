import { useEffect, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getMyLicense } from "@/lib/users.functions";

// Mostra o conteúdo só quando a licença da conta inclui o módulo Rede FTTH.
export function useNetworkModule() {
  const fetchLicense = useServerFn(getMyLicense);
  const [state, setState] = useState<"loading" | "allowed" | "denied">("loading");
  useEffect(() => {
    fetchLicense()
      .then((l) => setState(l.network ? "allowed" : "denied"))
      .catch(() => setState("denied"));
  }, []);
  return state;
}

export function NetworkModuleOnly({ children }: { children: ReactNode }) {
  return useNetworkModule() === "allowed" ? <>{children}</> : null;
}
