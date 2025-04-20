import React, { useEffect, useRef, useState } from "react";
import {
  View,
  StyleSheet,
  TextInput,
  Button,
  Alert,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Text,
} from "react-native";
import MapView, { Marker, Polyline, Region } from "react-native-maps";
import * as Location from "expo-location";
import { useAuth } from "../context/AuthContext";
import { fetchItinerary } from "../services/itinerary.service";
import { Ionicons } from "@expo/vector-icons";

interface Coordinate {
  latitude: number;
  longitude: number;
}

export default function MapScreen() {
  const [location, setLocation] = useState<Coordinate | null>(null);
  const [region, setRegion] = useState<Region | null>(null);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("Montluçon");
  const [avoidTolls, setAvoidTolls] = useState(false);
  const [routePoints, setRoutePoints] = useState<Coordinate[]>([]);
  const [simIndex, setSimIndex] = useState(0);
  const [isSimulating, setIsSimulating] = useState(false);
  const [showControls, setShowControls] = useState(true);

  const mapRef = useRef<MapView>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const { user, logout } = useAuth();

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission refusée", "Active la géolocalisation");
        return;
      }
      const loc = await Location.getCurrentPositionAsync({});
      const coords = {
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      };
      setLocation(coords);
      setRegion({
        ...coords,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      });
    })();
  }, []);

  const useCurrentLocation = async () => {
    try {
      const loc = await Location.getCurrentPositionAsync({});
      const coords = {
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      };
  
      const [address] = await Location.reverseGeocodeAsync(coords);
      const readableAddress = `${address.name || ""} ${address.street || ""} ${address.city || ""}`.trim();
      setStart(readableAddress);
  
      console.log("📍 Adresse géolocalisée :", readableAddress);
    } catch (err) {
      console.log("❌ Erreur reverse geocode :", err);
      Alert.alert("Erreur", "Impossible de récupérer une adresse.");
    }
  };
  

  const handleItinerary = async () => {
    console.log("🧭 Début de la génération d'itinéraire...");
    console.log("🔑 user.id :", user?.id);
    console.log("📍 Départ :", start);
    console.log("🏁 Arrivée :", end);

    if (!user?.id || !start || !end) {
      Alert.alert("Champs requis", "Merci de remplir les champs et être connecté.");
      return;
    }

    try {
      const points = await fetchItinerary(start, end, user.id, avoidTolls);
      console.log("📦 Itinéraire reçu :", points.length, "points");

      const formatted = points.map((p: { lat: number; lng: number }) => ({
        latitude: p.lat,
        longitude: p.lng,
      }));

      if (formatted.length > 0) {
        setRoutePoints(formatted);
        setSimIndex(0);
        setShowControls(false);
        setIsSimulating(false);
        Alert.alert("Itinéraire OK ✅", `${formatted.length} points trouvés.`);
      } else {
        Alert.alert("Aucun itinéraire", "Aucun point reçu.");
      }
    } catch (err: any) {
      console.log("❌ Erreur handleItinerary :", err.message);
      Alert.alert("Erreur", err.message);
    }
  };

  const simulateRoute = () => {
    if (routePoints.length === 0) return;
    console.log("🚗 Démarrage de la simulation...");

    setIsSimulating(true);
    intervalRef.current = setInterval(() => {
      setSimIndex((prev) => {
        const next = prev + 1;
        if (next >= routePoints.length) {
          clearInterval(intervalRef.current!);
          setIsSimulating(false);
          return prev;
        }
        mapRef.current?.animateCamera({
          center: routePoints[next],
        });
        return next;
      });
    }, 1000);
  };

  const stopSimulation = () => {
    console.log("🛑 Arrêt de la simulation.");
    if (intervalRef.current) clearInterval(intervalRef.current);
    setIsSimulating(false);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={styles.container}>
        <MapView
          ref={mapRef}
          style={styles.map}
          region={region || undefined}
          showsUserLocation
        >
          {routePoints.length > 0 && (
            <>
              <Polyline coordinates={routePoints} strokeColor="#0066FF" strokeWidth={4} />
              <Marker coordinate={routePoints[0]} title="Départ" pinColor="green" />
              <Marker coordinate={routePoints[routePoints.length - 1]} title="Arrivée" pinColor="red" />
              {isSimulating && routePoints[simIndex] && (
                <Marker coordinate={routePoints[simIndex]} anchor={{ x: 0.5, y: 0.5 }}>
                  <Ionicons name="car-sport" size={28} color="blue" />
                </Marker>
              )}
            </>
          )}
        </MapView>

        <TouchableOpacity style={styles.menuIcon} onPress={() => setShowControls(prev => !prev)}>
          <Ionicons name="menu" size={30} color="#333" />
        </TouchableOpacity>

        {showControls && (
          <View style={styles.controls}>
            <TextInput placeholder="Départ" value={start} onChangeText={setStart} style={styles.input} />
            <TextInput placeholder="Arrivée" value={end} onChangeText={setEnd} style={styles.input} />
            <Button title="📍 Ma position actuelle" onPress={useCurrentLocation} />
            <Button
              title={avoidTolls ? "✅ Éviter les péages" : "🚧 Éviter les péages"}
              onPress={() => setAvoidTolls(prev => !prev)}
              color={avoidTolls ? "green" : "gray"}
            />
            <Button title="Générer l'itinéraire" onPress={handleItinerary} />
            <Button title="Déconnexion" color="red" onPress={logout} />
          </View>
        )}

        {!showControls && routePoints.length > 0 && (
          <View style={styles.simulationButtons}>
            <Button title="▶️ Démarrer la simulation" onPress={simulateRoute} disabled={isSimulating} />
            <Button title="⏹️ Arrêter" onPress={stopSimulation} disabled={!isSimulating} />
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  menuIcon: {
    position: "absolute",
    top: 50,
    left: 20,
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 8,
    elevation: 5,
    zIndex: 10,
  },
  controls: {
    position: "absolute",
    bottom: 20,
    left: 20,
    right: 20,
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 15,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 5,
    zIndex: 10,
  },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    padding: 10,
    marginBottom: 10,
    borderRadius: 8,
  },
  simulationButtons: {
    position: "absolute",
    bottom: 30,
    left: 20,
    right: 20,
    flexDirection: "column",
    gap: 10,
  },
});
