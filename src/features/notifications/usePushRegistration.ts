// Pozvati iz layout-a obe uloge (owner/driver) — registruje push token jednom po sesiji.
import { useEffect } from "react";
import { registerPushOnce } from "./registerPush";

export function usePushRegistration() {
  useEffect(() => {
    void registerPushOnce();
  }, []);
}
