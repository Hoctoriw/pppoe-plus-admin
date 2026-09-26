import { useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

// Visual only — the server functions enforce admin access.
export function AdminOnly({ children }: { children: ReactNode }) {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const { data: r } = await supabase.rpc("has_role", { _user_id: data.user.id, _role: "admin" });
      setOk(!!r);
    });
  }, []);
  return ok ? <>{children}</> : null;
}
