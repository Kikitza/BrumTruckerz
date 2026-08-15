// Auth (dev): email + lozinka. OTP/magic link se vraća uz pravi SMTP pred produkciju.
// Čuvanje prijave: kroz SISTEMSKI menadžer lozinki (autoComplete/textContentType) —
// aplikacija NE čuva lozinku sama; pamti samo poslednji uneti email (prefill).
import { useEffect, useState } from "react";
import { View, Text, TextInput, Pressable, Alert } from "react-native";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../../src/lib/supabase";
import { useTheme } from "../../src/lib/theme";
import { Screen } from "../../src/components/Screen";
import { LanguagePicker } from "../../src/i18n/LanguagePicker";
import LogoLight from "../../assets/brand/logo-horizontal.svg";
import LogoDark from "../../assets/brand/logo-horizontal-dark.svg";

const LAST_EMAIL_KEY = "auth.lastEmail";

export default function SignIn() {
  const { t } = useTranslation();
  const { colors, scheme } = useTheme();
  const Logo = scheme === "dark" ? LogoDark : LogoLight;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);

  // Prefill poslednjim unetim emailom (samo email — nikad lozinka).
  useEffect(() => {
    AsyncStorage.getItem(LAST_EMAIL_KEY).then((v) => { if (v) setEmail(v); }).catch(() => {});
  }, []);

  const signIn = async () => {
    setBusy(true);
    const mail = email.trim();
    const { error } = await supabase.auth.signInWithPassword({ email: mail, password });
    setBusy(false);
    if (error) return Alert.alert(t("common.error"), error.message);
    AsyncStorage.setItem(LAST_EMAIL_KEY, mail).catch(() => {}); // zapamti email za sledeći put
    router.replace("/");
  };

  const input = {
    borderWidth: 1, borderColor: colors.border, borderRadius: 8,
    padding: 12, color: colors.text, backgroundColor: colors.surface,
  } as const;

  return (
    <Screen style={{ justifyContent: "center", padding: 24, gap: 12 }}>
      <LanguagePicker />
      <Logo width={224} height={40} style={{ alignSelf: "center", marginTop: 16, marginBottom: 20 }} />
      <Text style={{ fontSize: 24, fontWeight: "700", color: colors.text }}>{t("auth.signIn")}</Text>

      <TextInput placeholder={t("auth.email")} autoCapitalize="none" keyboardType="email-address"
        autoComplete="email" textContentType="emailAddress"
        value={email} onChangeText={setEmail} placeholderTextColor={colors.textMuted} style={input} />

      {/* Lozinka + oko za prikaži/sakrij; sistemski menadžer lozinki kroz autoComplete/textContentType */}
      <View style={{ flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.surface }}>
        <TextInput
          placeholder={t("auth.password")} secureTextEntry={!showPassword}
          autoCapitalize="none" autoComplete="current-password" textContentType="password"
          value={password} onChangeText={setPassword} placeholderTextColor={colors.textMuted}
          style={{ flex: 1, padding: 12, color: colors.text }}
        />
        <Pressable
          onPress={() => setShowPassword((s) => !s)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t(showPassword ? "auth.hidePassword" : "auth.showPassword")}
          style={{ paddingHorizontal: 12, paddingVertical: 12 }}
        >
          <Text style={{ fontSize: 18 }}>{showPassword ? "🙈" : "👁"}</Text>
        </Pressable>
      </View>

      <Pressable onPress={signIn} disabled={busy || !email.includes("@") || password.length < 6}
        style={{ backgroundColor: colors.primary, borderRadius: 8, padding: 14, alignItems: "center", opacity: busy ? 0.6 : 1 }}>
        <Text style={{ color: colors.onPrimary, fontWeight: "600" }}>{t("auth.signIn")}</Text>
      </Pressable>
    </Screen>
  );
}
