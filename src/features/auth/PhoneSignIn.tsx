// Prijava telefonom (OTP) — koristi deljeni PhoneOtpSteps (broj → kod, Nazad, greške).
// TEST režim: Supabase DEV ima fiksne test brojeve (v. IZVESTAJ/RUNBOOK) — bez pravog SMS-a.
import { router } from "expo-router";
import { supabase } from "../../lib/supabase";
import { PhoneOtpSteps } from "./PhoneOtpSteps";

export function PhoneSignIn() {
  return (
    <PhoneOtpSteps
      onSend={async (e164) => {
        const { error } = await supabase.auth.signInWithOtp({ phone: e164 });
        if (error) throw error;
      }}
      onVerify={async (e164, code) => {
        const { error } = await supabase.auth.verifyOtp({ phone: e164, token: code, type: "sms" });
        if (error) throw error;
      }}
      onDone={() => router.replace("/")}
    />
  );
}
