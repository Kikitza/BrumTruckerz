// Auth (MVP): email OTP — pošalji kod, unesi 6-cifreni kod, verifikuj.
// Apple/Google sign-in se dodaju u koraku 2 (v. CLAUDE.md).
import { useState } from "react";
import { View, Text, TextInput, Pressable, Alert } from "react-native";
import { useTranslation } from "react-i18next";
import { router } from "expo-router";
import { supabase } from "../../src/lib/supabase";
import { useTheme } from "../../src/lib/theme";

export default function SignIn() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const send = async () => {
    setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim() });
    setBusy(false);
    if (error) return Alert.alert("Greška", error.message);
    setSent(true);
  };

  const verify = async () => {
    setBusy(true);
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(), token: code.trim(), type: "email",
    });
    setBusy(false);
    if (error) return Alert.alert("Greška", error.message);
    router.replace("/");
  };

  const input = {
    borderWidth: 1, borderColor: colors.border, borderRadius: 8,
    padding: 12, color: colors.text, backgroundColor: colors.surface,
  } as const;
  const btn = { backgroundColor: colors.primary, borderRadius: 8, padding: 14, alignItems: "center" as const, opacity: busy ? 0.6 : 1 };

  return (
    <View style={{ flex: 1, justifyContent: "center", padding: 24, backgroundColor: colors.bg, gap: 12 }}>
      <Text style={{ fontSize: 24, fontWeight: "700", color: colors.text }}>{t("auth.signIn")}</Text>

      {!sent ? (
        <>
          <TextInput placeholder={t("auth.email")} autoCapitalize="none" keyboardType="email-address"
            value={email} onChangeText={setEmail} placeholderTextColor={colors.textMuted} style={input} />
          <Pressable onPress={send} disabled={busy || !email.includes("@")} style={btn}>
            <Text style={{ color: "#fff", fontWeight: "600" }}>{t("auth.sendCode")}</Text>
          </Pressable>
        </>
      ) : (
        <>
          <Text style={{ color: colors.textMuted }}>{t("auth.codeSentTo", { email })}</Text>
          <TextInput placeholder={t("auth.code")} keyboardType="number-pad" maxLength={6}
            value={code} onChangeText={setCode} placeholderTextColor={colors.textMuted} style={input} />
          <Pressable onPress={verify} disabled={busy || code.length < 6} style={btn}>
            <Text style={{ color: "#fff", fontWeight: "600" }}>{t("auth.verify")}</Text>
          </Pressable>
          <Pressable onPress={() => { setSent(false); setCode(""); }}>
            <Text style={{ color: colors.primary, textAlign: "center" }}>{t("auth.changeEmail")}</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}
