// Auth (dev): email + lozinka. OTP/magic link se vraća uz pravi SMTP pred produkciju.
// Čuvanje prijave: kroz SISTEMSKI menadžer lozinki (autoComplete/textContentType) —
// aplikacija NE čuva lozinku sama; pamti samo poslednji uneti email (prefill).
import { useEffect, useState } from "react";
import { View, Text, TextInput, Pressable } from "react-native";
import { router } from "expo-router";
import { emailAuthErrorKey } from "../../src/features/auth/emailAuth";
import { useTranslation } from "react-i18next";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../../src/lib/supabase";
import { useTheme } from "../../src/lib/theme";
import { Screen } from "../../src/components/Screen";
import { LanguagePicker } from "../../src/i18n/LanguagePicker";
import { PhoneSignIn } from "../../src/features/auth/PhoneSignIn";
import { isPhoneLoginEnabled } from "../../src/features/auth/phone";
import { EmailSignUp } from "../../src/features/auth/EmailSignUp";
import { BrandLockup } from "../../src/components/BrandLockup";

const LAST_EMAIL_KEY = "auth.lastEmail";

type Method = "email" | "phone";

export default function SignIn() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  // Prekidač: telefon-staze vidljive samo kad je EXPO_PUBLIC_PHONE_LOGIN='1' (preview),
  // isključeno na produkciji do aktivacije SMS-a. Email + Registracija ostaju svima.
  const phoneEnabled = isPhoneLoginEnabled(process.env.EXPO_PUBLIC_PHONE_LOGIN);
  const [method, setMethod] = useState<Method>("email");
  const [register, setRegister] = useState(false);
  const effectiveMethod: Method = phoneEnabled ? method : "email";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errKey, setErrKey] = useState<string | null>(null); // inline greška prijave (radi na webu i native-u)

  // Prefill poslednjim unetim emailom (samo email — nikad lozinka).
  useEffect(() => {
    AsyncStorage.getItem(LAST_EMAIL_KEY).then((v) => { if (v) setEmail(v); }).catch(() => {});
  }, []);

  const signIn = async () => {
    setBusy(true);
    setErrKey(null); // očisti prethodnu grešku pri novom pokušaju
    const mail = email.trim();
    const { error } = await supabase.auth.signInWithPassword({ email: mail, password });
    setBusy(false);
    if (error) { setErrKey(emailAuthErrorKey(error.message)); return; } // inline crveni tekst
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
      {/* Brend (ETNOP): Evropa dot-map znak + ime + tagline (tema-svesno). */}
      <View style={{ alignItems: "center", marginTop: 8, marginBottom: 20 }}>
        <BrandLockup />
      </View>
      <Text style={{ fontSize: 24, fontWeight: "700", color: colors.text }}>{t("auth.signIn")}</Text>

      {/* Izbor načina prijave: email ili telefon — segment SAMO kad je telefon uključen (flag) */}
      {phoneEnabled && (
        <View style={{ flexDirection: "row", gap: 8 }}>
          {(["email", "phone"] as Method[]).map((m) => {
            const active = method === m;
            return (
              <Pressable
                key={m}
                onPress={() => setMethod(m)}
                style={{
                  flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: "center", borderWidth: 1,
                  borderColor: active ? colors.primary : colors.border,
                  backgroundColor: active ? colors.primary : colors.surface,
                }}
              >
                <Text style={{ color: active ? colors.onPrimary : colors.text, fontWeight: "600" }}>
                  {t(m === "email" ? "auth.methodEmail" : "auth.methodPhone")}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {effectiveMethod === "phone" ? (
        <PhoneSignIn />
      ) : register ? (
        <EmailSignUp onBack={() => setRegister(false)} />
      ) : (
        <>
          <TextInput placeholder={t("auth.email")} autoCapitalize="none" keyboardType="email-address"
            autoComplete="email" textContentType="emailAddress"
            value={email} onChangeText={(v) => { setEmail(v); if (errKey) setErrKey(null); }} placeholderTextColor={colors.textMuted} style={input} />

          {/* Lozinka + oko za prikaži/sakrij; sistemski menadžer lozinki kroz autoComplete/textContentType */}
          <View style={{ flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.surface }}>
            <TextInput
              placeholder={t("auth.password")} secureTextEntry={!showPassword}
              autoCapitalize="none" autoComplete="current-password" textContentType="password"
              value={password} onChangeText={(v) => { setPassword(v); if (errKey) setErrKey(null); }} placeholderTextColor={colors.textMuted}
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

          {/* Inline greška prijave (crveno) — vidljiva na webu i native-u; zamena za Alert (no-op na webu) */}
          {errKey ? (
            <Text style={{ color: colors.danger, fontSize: 14 }}>{t(errKey)}</Text>
          ) : null}

          <Pressable onPress={signIn} disabled={busy || !email.includes("@") || password.length < 6}
            style={{ backgroundColor: colors.primary, borderRadius: 8, padding: 14, alignItems: "center", opacity: busy ? 0.6 : 1 }}>
            <Text style={{ color: colors.onPrimary, fontWeight: "600" }}>{t("auth.signIn")}</Text>
          </Pressable>
          <Pressable onPress={() => setRegister(true)} hitSlop={8} style={{ alignItems: "center", padding: 8 }}>
            <Text style={{ color: colors.primary, fontWeight: "600" }}>{t("auth.noAccount")}</Text>
          </Pressable>
        </>
      )}
    </Screen>
  );
}
