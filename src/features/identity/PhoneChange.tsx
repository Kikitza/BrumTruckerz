// Promena broja telefona (dokaz kapije: broj je BRAVA, ne identitet — profil/BT-D/ture ostaju).
// Reuse deljenog PhoneOtpSteps: NOVI broj → kod na NOVI broj → verifyOtp type 'phone_change'.
// TEST brojevi rade i ovde (Supabase sms_test_otp je po broju, nezavisno od toka).
import { Alert } from "react-native";
import { useTranslation } from "react-i18next";
import { supabase } from "../../lib/supabase";
import { PhoneOtpSteps } from "../auth/PhoneOtpSteps";

// onChanged: pozvano posle uspešne promene (osveži prikaz profila).
export function PhoneChange({ onChanged }: { onChanged: () => void }) {
  const { t } = useTranslation();
  return (
    <PhoneOtpSteps
      onSend={async (e164) => {
        // Šalje OTP na NOVI broj (tok promene broja).
        const { error } = await supabase.auth.updateUser({ phone: e164 });
        if (error) throw error;
      }}
      onVerify={async (e164, code) => {
        const { error } = await supabase.auth.verifyOtp({ phone: e164, token: code, type: "phone_change" });
        if (error) throw error;
      }}
      onDone={() => {
        Alert.alert(t("profile.phoneChanged"));
        onChanged();
      }}
    />
  );
}
