// Registracija email + lozinka + ime i prezime (ulaz za dispečera; radi za bilo koga).
// Nov nalog → NoRole → „Imam kod firme" (accept_invitation). Ime ide u auth metadata
// (full_name) i pri prihvatanju pozivnice završi u profilu (v. accept_invitation).
// DEV: mailer_autoconfirm=true → signUp odmah vraća sesiju (bez potvrde mejla).
import { useState } from "react";
import { View, Text, TextInput, Pressable, Alert } from "react-native";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { supabase } from "../../lib/supabase";
import { useTheme } from "../../lib/theme";

export function EmailSignUp({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const input = {
    borderWidth: 1, borderColor: colors.border, borderRadius: 8,
    padding: 12, color: colors.text, backgroundColor: colors.surface,
  } as const;

  const signUp = async () => {
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { full_name: fullName.trim() } },
    });
    setBusy(false);
    if (error) return Alert.alert(t("common.error"), error.message);
    // Sa autoconfirm-om sesija postoji odmah → gate; bez nje (prod) traži potvrdu mejla.
    if (data.session) router.replace("/");
    else Alert.alert(t("auth.confirmEmailSent"));
  };

  const valid = fullName.trim().length > 1 && email.includes("@") && password.length >= 6;

  return (
    <View style={{ gap: 12 }}>
      <TextInput placeholder={t("auth.fullName")} autoCapitalize="words" autoComplete="name"
        value={fullName} onChangeText={setFullName} placeholderTextColor={colors.textMuted} style={input} />
      <TextInput placeholder={t("auth.email")} autoCapitalize="none" keyboardType="email-address"
        autoComplete="email" textContentType="emailAddress"
        value={email} onChangeText={setEmail} placeholderTextColor={colors.textMuted} style={input} />
      <TextInput placeholder={t("auth.password")} secureTextEntry autoCapitalize="none"
        autoComplete="new-password" textContentType="newPassword"
        value={password} onChangeText={setPassword} placeholderTextColor={colors.textMuted} style={input} />

      <Pressable onPress={signUp} disabled={busy || !valid}
        style={{ backgroundColor: colors.primary, borderRadius: 8, padding: 14, alignItems: "center", opacity: busy || !valid ? 0.6 : 1 }}>
        <Text style={{ color: colors.onPrimary, fontWeight: "600" }}>{t("auth.register")}</Text>
      </Pressable>
      <Pressable onPress={onBack} hitSlop={8} style={{ alignItems: "center", padding: 8 }}>
        <Text style={{ color: colors.primary, fontWeight: "600" }}>{t("auth.haveAccount")}</Text>
      </Pressable>
    </View>
  );
}
