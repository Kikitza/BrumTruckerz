// Reusable dvokoračni OTP UI (broj → kod). Deljen između prijave telefonom i PROMENE
// broja (bez dupliranja markapa). Stanje (prefiks/broj/kod/korak) živi ovde; „Nazad" sa
// koda vraća na broj bez gubitka unosa (REVERZIBILNOST). Pozivalac daje samo akcije:
//   onSend(e164)          — pošalji kod (throws na grešku)
//   onVerify(e164, code)  — potvrdi kod (throws na grešku)
//   onDone()              — posle uspešne potvrde (navigacija ili osvežavanje)
// Greške se mapiraju kroz phoneAuthErrorKey (jedan izvor istine).
import { useState } from "react";
import { View, Text, TextInput, Pressable, Alert } from "react-native";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../lib/theme";
import { toE164, isValidPhone, phoneAuthErrorKey, DEFAULT_DIAL_PREFIX } from "./phone";

export function PhoneOtpSteps({
  onSend, onVerify, onDone, sendLabel, verifyLabel,
}: {
  onSend: (e164: string) => Promise<void>;
  onVerify: (e164: string, code: string) => Promise<void>;
  onDone: () => void;
  sendLabel?: string;
  verifyLabel?: string;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [step, setStep] = useState<"number" | "code">("number");
  const [prefix, setPrefix] = useState(DEFAULT_DIAL_PREFIX);
  const [number, setNumber] = useState("");
  const [phone, setPhone] = useState(""); // E.164 poslat (prikaz na koraku koda)
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const input = {
    borderWidth: 1, borderColor: colors.border, borderRadius: 8,
    padding: 12, color: colors.text, backgroundColor: colors.surface,
  } as const;

  const send = async () => {
    const e164 = toE164(number, prefix);
    if (!isValidPhone(e164)) return Alert.alert(t("auth.err.phoneInvalid"));
    setBusy(true);
    try {
      await onSend(e164);
      setPhone(e164);
      setCode("");
      setStep("code");
    } catch (e) {
      Alert.alert(t(phoneAuthErrorKey((e as Error)?.message)));
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setBusy(true);
    try {
      await onVerify(phone, code.trim());
      onDone();
    } catch (e) {
      Alert.alert(t(phoneAuthErrorKey((e as Error)?.message)));
    } finally {
      setBusy(false);
    }
  };

  if (step === "number") {
    const valid = isValidPhone(toE164(number, prefix));
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
          onPress={send}
          disabled={busy || !valid}
          style={{ backgroundColor: colors.primary, borderRadius: 8, padding: 14, alignItems: "center", opacity: busy || !valid ? 0.6 : 1 }}
        >
          <Text style={{ color: colors.onPrimary, fontWeight: "600" }}>{sendLabel ?? t("auth.sendCode")}</Text>
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
        style={{ backgroundColor: colors.primary, borderRadius: 8, padding: 14, alignItems: "center", opacity: busy || code.trim().length < 6 ? 0.6 : 1 }}
      >
        <Text style={{ color: colors.onPrimary, fontWeight: "600" }}>{verifyLabel ?? t("auth.verify")}</Text>
      </Pressable>
      <Pressable onPress={() => setStep("number")} hitSlop={8} style={{ alignItems: "center", padding: 8 }}>
        <Text style={{ color: colors.primary, fontWeight: "600" }}>{t("auth.back")}</Text>
      </Pressable>
    </View>
  );
}
