// Auth (dev): email + lozinka. OTP/magic link se vraća uz pravi SMTP pred produkciju.
import { useState } from "react";
import { View, Text, TextInput, Pressable, Alert } from "react-native";
import { router } from "expo-router";
import { supabase } from "../../src/lib/supabase";
import { useTheme } from "../../src/lib/theme";
import LogoLight from "../../assets/brand/logo-horizontal.svg";
import LogoDark from "../../assets/brand/logo-horizontal-dark.svg";

export default function SignIn() {
  const { colors, scheme } = useTheme();
  const Logo = scheme === "dark" ? LogoDark : LogoLight;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const signIn = async () => {
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(), password,
    });
    setBusy(false);
    if (error) return Alert.alert("Greška", error.message);
    router.replace("/");
  };

  const input = {
    borderWidth: 1, borderColor: colors.border, borderRadius: 8,
    padding: 12, color: colors.text, backgroundColor: colors.surface,
  } as const;

  return (
    <View style={{ flex: 1, justifyContent: "center", padding: 24, backgroundColor: colors.bg, gap: 12 }}>
      <Logo width={224} height={40} style={{ alignSelf: "center", marginBottom: 20 }} />
      <Text style={{ fontSize: 24, fontWeight: "700", color: colors.text }}>Prijava</Text>
      <TextInput placeholder="Imejl" autoCapitalize="none" keyboardType="email-address"
        value={email} onChangeText={setEmail} placeholderTextColor={colors.textMuted} style={input} />
      <TextInput placeholder="Lozinka" secureTextEntry
        value={password} onChangeText={setPassword} placeholderTextColor={colors.textMuted} style={input} />
      <Pressable onPress={signIn} disabled={busy || !email.includes("@") || password.length < 6}
        style={{ backgroundColor: colors.primary, borderRadius: 8, padding: 14, alignItems: "center", opacity: busy ? 0.6 : 1 }}>
        <Text style={{ color: "#fff", fontWeight: "600" }}>Prijavi se</Text>
      </Pressable>
    </View>
  );
}
