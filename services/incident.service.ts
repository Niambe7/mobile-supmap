import api from "./api";

export const reportIncident = async (
  type: string,
  latitude: number,
  longitude: number,
  userId: number,
  description: string,
  token: string
) => {
  const payload = {
    type,
    latitude,
    longitude,
    description,
    user_id: userId,
  };

  console.log("📤 Tentative de signalement d'incident...");
  console.log("📦 Payload envoyé :", JSON.stringify(payload, null, 2));

  try {
    const response = await api.post(
      "/incidents/incidents/report",
      payload,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );
    console.log("✅ Incident signalé :", response.data);
    return response.data;
  } catch (err: any) {
    if (err.response) {
      console.log("❌ Erreur serveur :", err.response.data);
    } else {
      console.log("❌ Erreur réseau ou inconnue :", err.message);
    }
    throw new Error(err.response?.data?.message || "Erreur lors du signalement");
  }
};
