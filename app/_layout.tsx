// app/_layout.tsx
import { Slot } from "expo-router";
import { AuthProvider } from "../context/AuthContext"; // ✅ bien utilisé ici

export default function Layout() {
  return (
    <AuthProvider>
      <Slot />
    </AuthProvider>
  );
}
