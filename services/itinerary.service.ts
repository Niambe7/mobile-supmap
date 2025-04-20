// itinerary.service.ts
import api from "./api";

export const fetchItinerary = async (
  start: string,
  end: string,
  userId: number,
  avoidTolls: boolean
) => {
  const payload = {
    start_location: start,
    end_location: end,
    user_id: userId,
    avoidTolls,
  };

  try {
    const res = await api.post("/itineraries/itineraries/search", payload);
    console.log("📤 Payload envoyé :", payload);

    return res.data.itinerary.route_points;
  } catch (err: any) {
    console.log("📤 Payload envoyé :", payload);
    console.log(err.response?.data?.message || "Erreur lors de la génération")
    console.log("❌ fetchItinerary error :", err.response?.data || err.message);
    throw new Error(err.response?.data?.message || "Erreur lors de la génération");
  }
};
