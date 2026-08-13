// Gate po ulozi (pravilo #2 živi i u navigaciji): owner -> (owner), driver -> (driver).
import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { useSession } from "../src/features/auth/useSession";

export default function Index() {
  const { session, role, loading } = useSession();
  if (loading) return <View style={{ flex: 1, justifyContent: "center" }}><ActivityIndicator /></View>;
  if (!session) return <Redirect href="/(auth)/sign-in" />;
  if (role === "driver") return <Redirect href="/(driver)" />;
  return <Redirect href="/(owner)/trips" />;
}
