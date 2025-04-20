// app/index.tsx
import { useEffect } from "react";
import { useRouter } from "expo-router";
import { useAuth } from "../context/AuthContext";
import { View, ActivityIndicator } from "react-native";

export default function IndexRedirector() {
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (user) {
        router.replace("/map");
      } else {
        router.replace("/login");
      }
    }, 100); // Attendre un petit délai pour s'assurer que le layout est prêt

    return () => clearTimeout(timeout);
  }, [user]);

  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
      <ActivityIndicator size="large" />
    </View>
  );
}
