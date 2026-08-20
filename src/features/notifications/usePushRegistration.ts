// Pozvati iz layout-a obe uloge (owner/driver) — registruje push token jednom po sesiji.
import { useEffect } from "react";
import { registerPushOnce } from "./registerPush";
import { isWeb } from "../../lib/platform";

export function usePushRegistration() {
  useEffect(() => {
    if (isWeb) return; // push je native-only (F3) — web nema tokene/obaveštenja
    void registerPushOnce();
  }, []);
}
