// Prijava telefonom (OTP). Dva koraka u ISTOJ komponenti (stanje u roditelju, koraci
// renderuju podskup) → „Nazad" sa koda vraća na broj bez gubitka unosa (REVERZIBILNOST).
// Auth ekrani zovu supabase.auth direktno (isti obrazac kao sign-in email tok).
// TEST režim: Supabase DEV ima fiksne test brojeve (v. IZVESTAJ/RUNBOOK) — bez pravog SMS-a.
import { useState } from "react";
import { View, Text, TextInput, Pressable, Alert } from "react-native";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { supabase } from "../../lib/supabase";
import { useTheme } from "../../lib/theme";
import { toE164, isValidPhone, phoneAuthErrorKey, DEFAULT_DIAL_PREFIX } from "./phone";

export function PhoneSignIn() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [step, setStep] = useState<"number" | "code">("number");
  const [prefix, setPrefix] = useState(DEFAULT_DIAL_PREFIX);
  const [number, setNumber] = useState("");
  const [phone, setPhone] = useState(""); // E.164 poslat (za prikaz na koraku koda)
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const input = {
    borderWidth: 1, borderColor: colors.border, borderRadius: 8,
    padding: 12, color: colors.text, backgroundColor: colors.surface,
  } as const;

  const sendCode = async () => {
    const e164 = toE164(number, prefix);
    if (!isValidPhone(e164)) return Alert.alert(t("auth.err.phoneInvalid"));
    setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({ phone: e164 });
    setBusy(false);
    if (error) return Alert.alert(t(phoneAuthErrorKey(error.message)));
    setPhone(e164);
    setCode("");
    setStep("code");
  };

  const verify = async () => {
    setBusy(true);
    const { error } = await supabase.auth.verifyOtp({ phone, token: code.trim(), type: "sms" });
    setBusy(false);
    if (error) return Alert.alert(t(phoneAuthErrorKey(error.message)));
    router.replace("/");
  };

  if (step === "number") {
    return (
      <View style={{ gap: 12 }}>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <TextInput
            value={prefix}
            onChangeText={setPrefix}
            keyboardType="phone-pad"
            accessibilityLabel={t("auth.phonePrefix")}
            placeholderTextColor={colors.textMuted}
            style={[input, { width: 84, textAlign: "center" }]}
          />
          <TextInput
            placeholder={t("auth.phoneNumber")}
            autoComplete="tel"
            textContentType="telephoneNumber"
            keyboardType="phone-pad"
            value={number}
            onChangeText={setNumber}
            placeholderTextColor={colors.textMuted}
            style={[input, { flex: 1 }]}
          />
        </View>
        <Pressable
          onPress={sendCode}
          disabled={busy || !isValidPhone(toE164(number, prefix))}
          style={{
            backgroundColor: colors.primary, borderRadius: 8, padding: 14, alignItems: "center",
            opacity: busy || !isValidPhone(toE164(number, prefix)) ? 0.6 : 1,
          }}
        >
          <Text style={{ color: colors.onPrimary, fontWeight: "600" }}>{t("auth.sendCode")}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ gap: 12 }}>
      <Text style={{ color: colors.textMuted, textAlign: "center" }}>
        {t("auth.codeSentToPhone", { phone })}
      </Text>
      <TextInput
        placeholder={t("auth.code")}
        keyboardType="number-pad"
        autoComplete="sms-otp"
        textContentType="oneTimeCode"
        maxLength={6}
        value={code}
        onChangeText={setCode}
        placeholderTextColor={colors.textMuted}
        style={[input, { textAlign: "center", letterSpacing: 4, fontSize: 18 }]}
      />
      <Pressable
        onPress={verify}
        disabled={busy || code.trim().length < 6}
        style={{
          backgroundColor: colors.primary, borderRadius: 8, padding: 14, alignItems: "center",
          opacity: busy || code.trim().length < 6 ? 0.6 : 1,
        }}
      >
        <Text style={{ color: colors.onPrimary, fontWeight: "600" }}>{t("auth.verify")}</Text>
      </Pressable>
      {/* Nazad → broj (unos ostaje) */}
      <Pressable onPress={() => setStep("number")} hitSlop={8} style={{ alignItems: "center", padding: 8 }}>
        <Text style={{ color: colors.primary, fontWeight: "600" }}>{t("auth.back")}</Text>
      </Pressable>
    </View>
  );
}
