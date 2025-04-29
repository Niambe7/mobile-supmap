// services/itinerary.service.ts
import api from "./api";

export interface LatLng {
  lat: number;
  lng: number;
}

/**
 * Ce type correspond aux options renvoyées par /itineraries/search
 */
export interface ItineraryOptionDTO {
  id: number;                 // identifiant temporaire côté client
  distance: number;           // en mètres
  duration: number;           // en secondes
  toll_free: boolean;
  route_points: LatLng[];
}

/**
 * Ce type correspond à l'itinéraire sauvegardé en base
 */
export interface ItineraryDTO {
  id: number;
  user_id: number;
  start_location: string;
  end_location: string;
  distance: number;
  duration: number;
  toll_free: boolean;
  route_points: LatLng[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Appelle POST /itineraries/search
 * et retourne l’array d’options (au moins 2).
 */
export const fetchItineraries = async (
  start: string,
  end: string,
  avoidTolls: boolean
): Promise<ItineraryOptionDTO[]> => {
  const payload = { start_location: start, end_location: end, avoidTolls };
  console.log("[ItineraryService] → fetchItineraries payload:", payload);

  try {
    // Note l'URL mise à jour : /itineraries/search
    const res = await api.post("/itineraries/itineraries/search", payload);
    console.log("[ItineraryService] ← /search response.data:", res.data);

    // L'API renvoie désormais { message, itineraries }
    const options: ItineraryOptionDTO[] = res.data.itineraries ?? [];
    console.log("[ItineraryService] ✔ Parsed options:", options);

    return options;
  } catch (err: any) {
    console.error(
      "[ItineraryService] ✖ fetchItineraries error:",
      err.response?.data ?? err.message
    );
    throw err;
  }
};

export interface ItineraryOptionDTO {
  id: number;
  distance: number;
  duration: number;
  toll_free: boolean;
  route_points: LatLng[];      // pour l'affichage
  encoded_polyline: string;    // pour l’envoi / stockage
}

export const loadItinerary = async (
  userId: number,
  choice: ItineraryOptionDTO,
  start: string,
  end: string
): Promise<ItineraryDTO> => {
  const body = {
    user_id: userId,
    start_location: start,
    end_location: end,
    selected_itinerary: {
      distance: choice.distance,
      duration: choice.duration,
      toll_free: choice.toll_free,
      // 👇 on envoie la chaîne encodée, pas tout le tableau
      encoded_polyline: choice.encoded_polyline,
    },
  };
  const res = await api.post("/itineraries/itineraries/load", body);
  return res.data.itinerary;
};
