import React, { useEffect, useRef, useState } from "react";
import { TouchableWithoutFeedback, Image } from "react-native";

import {
  View,
  StyleSheet,
  TextInput,
  Alert,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Text,
  Animated,
  Dimensions,
  Switch,
  Button,
} from "react-native";
import MapView, { Marker, Polyline, Region } from "react-native-maps";
import * as Location from "expo-location";
import { useAuth } from "../context/AuthContext";
import { reportIncident } from "../services/incident.service";
import { fetchItinerary } from "../services/itinerary.service";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";


function calculateHeading(from: Coordinate, to: Coordinate): number {
  const dLon = (to.longitude - from.longitude) * Math.PI / 180;
  const lat1 = from.latitude * Math.PI / 180;
  const lat2 = to.latitude * Math.PI / 180;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) -
            Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  const heading = Math.atan2(y, x) * 180 / Math.PI;
  return (heading + 360) % 360; // Normaliser entre 0-360
}



const screenWidth = Dimensions.get("window").width;

interface Coordinate {
  latitude: number;
  longitude: number;
}

const interpolateCoords = (start: Coordinate, end: Coordinate, progress: number): Coordinate => {
  if (!start || !end) {
    console.warn("⚠️ Coordonnées manquantes dans interpolateCoords");
    return { latitude: 0, longitude: 0 }; // ou ton point de départ par défaut
  }

  return {
    latitude: start.latitude + (end.latitude - start.latitude) * progress,
    longitude: start.longitude + (end.longitude - start.longitude) * progress,
  };
};



export default function MapScreen() {
  const [location, setLocation] = useState<Coordinate | null>(null);
  const [region, setRegion] = useState<Region | null>(null);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("Gare de Lyon, Paris");
  const [routePoints, setRoutePoints] = useState<Coordinate[]>([]);
  const [simIndex, setSimIndex] = useState(0);
  const [isSimulating, setIsSimulating] = useState(false);
  const [avoidTolls, setAvoidTolls] = useState(true); // ✅ Activé par défaut
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [showSearchBox, setShowSearchBox] = useState(true);
  const [showIncidentBanner, setShowIncidentBanner] = useState(false);
  const [carPosition, setCarPosition] = useState<Coordinate | null>(null);
  const [heading, setHeading] = useState(0); // ✅ État pour la direction de la voiture

  const incidentTypes = [
    { type: "accident", label: "Accident", image: require("../assets/incidents/accident.jpg") },
    { type: "traffic", label: "Embouteillage", image: require("../assets/incidents/traffic.png") },
    { type: "closed", label: "Route fermée", image: require("../assets/incidents/closed.gif") },
    { type: "police", label: "Police", image: require("../assets/incidents/police.png") },
    { type: "obstacle", label: "Obstacle", image: require("../assets/incidents/obstacle.jpg") },
  ];

  const router = useRouter();


  const mapRef = useRef<MapView>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const drawerAnim = useRef(new Animated.Value(-screenWidth * 0.6)).current;

  const { user, logout , token } = useAuth();

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

  const toggleDrawer = () => {
    const toValue = drawerOpen ? -screenWidth * 0.6 : 0;
    Animated.timing(drawerAnim, {
      toValue,
      duration: 300,
      useNativeDriver: false,
    }).start();
    setDrawerOpen(!drawerOpen);
  };

  const handleLogout = () => {
    logout();
    toggleDrawer(); // referme le drawer
    router.replace("/login");
  };

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
    } catch (err) {
      Alert.alert("Erreur", "Impossible de récupérer une adresse.");
    }
  };

  const handleItinerary = async () => {
    console.log("🧭 Début de la génération d'itinéraire...");
    console.log("🔑 user.id :", user?.id);
    console.log("📍 Départ :", start);
    console.log("🏁 Arrivée :", end);
    console.log("🚧 Avoid tolls :", avoidTolls);

    if (!user?.id || !start || !end) {
      Alert.alert("Champs requis", "Merci de remplir les champs et être connecté.");
      return;
    }

    try {
      const points = await fetchItinerary(start, end, user.id, avoidTolls);
      const formatted = points.map((p: { lat: number; lng: number }) => ({
        latitude: p.lat,
        longitude: p.lng,
      }));

      if (formatted.length > 0) {
        setRoutePoints(formatted);
        setSimIndex(0);
        Alert.alert("Itinéraire généré", `${formatted.length} points trouvés.`);
        setIsSimulating(false);
        setShowSearchBox(false) // cache le bloc de recherche
      } else {
        Alert.alert("Aucun résultat", "Aucun point trouvé.");
      }
    } catch (err: any) {
      console.log("❌ fetchItinerary error :", err.response?.data || err.message);
      Alert.alert("Erreur", err.message || "Erreur lors de la génération");
    }
  };


  const simulateRoute = (startIndex = simIndex) => {
    if (routePoints.length < 2) return;
  
    console.log("🚗 Simulation interpolée démarrée depuis l'index", startIndex);
    mapRef.current?.fitToCoordinates(routePoints, {
      edgePadding: { top: 50, right: 50, bottom: 50, left: 50 },
      animated: true,
    });
    
    setIsSimulating(true);
  
    let index = startIndex;
    let progress = 0;
    const step = 0.02;
  
    intervalRef.current = setInterval(() => {
      if (index >= routePoints.length - 1) {
        clearInterval(intervalRef.current!);
        setIsSimulating(false);
        return;
      }
  
      const start = routePoints[index];
      const end = routePoints[index + 1];

      if (!start || !end) {
        clearInterval(intervalRef.current!);
        setIsSimulating(false);
        console.log("🛑 Fin de simulation : coordonnées manquantes.");
        return;
      }
      const interpolated = interpolateCoords(start, end, progress);
  
      setCarPosition(interpolated);
  
      mapRef.current?.animateCamera({
        center: interpolated,
      });
  
      progress += step;
  
      if (progress >= 1) {
        index++;
        progress = 0;
        setSimIndex(index); // ✅ Met à jour le simIndex courant

const current = routePoints[index];
const nextPoint = routePoints[index + 1];
if (current && nextPoint) {
  setHeading(calculateHeading(current, nextPoint));
}

      }
    }, 100);
  };
  
  
  


  const stopSimulation = () => {
    console.log("🛑 Simulation arrêtée manuellement");
  
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
  
    intervalRef.current = null;
    setIsSimulating(false);
  };
  

  const handleIncident = async (type: string) => {
    if (!user || !token || !routePoints[simIndex]) return;
  
    const { latitude, longitude } = routePoints[simIndex];
  
    console.log("📢 Signalement déclenché !");
    console.log("🧭 Position simulation :", latitude, longitude);
    console.log("🧑‍🚒 Type :", type);
    console.log("🛡️ Token :", token?.slice(0, 10) + "...");
  
    try {
      const res = await reportIncident(
        type,
        latitude,
        longitude,
        user.id,
        "No description provided",
        token
      );
      Alert.alert("✅ Signalement envoyé", res.message);
      setShowIncidentBanner(false);
      simulateRoute(simIndex); // ✅ Reprend la simulation à l'index courant
    } catch (err: any) {
      console.log("❌ Erreur lors du signalement :", err.response?.data || err.message);
      Alert.alert("❌ Erreur", err.response?.data?.message || "Erreur serveur");
    }
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
              <Polyline coordinates={routePoints} strokeColor="#007bff" strokeWidth={isSimulating ? 6 : 3} />
              <Marker coordinate={routePoints[0]} title="Départ" pinColor="green" />
              <Marker coordinate={routePoints[routePoints.length - 1]} title="Arrivée" pinColor="red" />
              {isSimulating && carPosition && (
              <Marker
              coordinate={routePoints[simIndex]}
              anchor={{ x: 0.5, y: 0.5 }}
              rotation={heading}
              flat
            >
              <Ionicons name="navigate" size={30} color="blue" />
            </Marker>
            )}


            </>
          )}
        </MapView>

        {/* ☰ Hamburger */}
        <TouchableOpacity style={styles.menuIcon} onPress={toggleDrawer}>
          <Ionicons name="menu" size={32} color="#333" />
        </TouchableOpacity>

        {/* 👉 Drawer latéral */}
        <Animated.View style={[styles.drawer, { left: drawerAnim }]}>
          <Text style={styles.drawerTitle}>Menu</Text>
          <Button title="Déconnexion" color="red" onPress={handleLogout} />
        </Animated.View>

        {/* 🔍 Bloc jaune (formulaire) */}
        {showSearchBox && (
          <View style={styles.controls}>
            <TextInput placeholder="Départ" value={start} onChangeText={setStart} style={styles.input} />
            <TextInput placeholder="Arrivée" value={end} onChangeText={setEnd} style={styles.input} />
            <Button title="📍 MA POSITION ACTUELLE" onPress={useCurrentLocation} />

            <View style={styles.switchContainer}>
              <Text style={{ flex: 1 }}>Éviter les péages</Text>
              <Switch value={avoidTolls} onValueChange={setAvoidTolls} />
            </View>

            <Button title="GÉNÉRER L'ITINÉRAIRE" onPress={handleItinerary} color="#007bff" />
          </View>
        )}

        {/* 🚗 Boutons de simulation */}
        {!drawerOpen && routePoints.length > 0 && (
          <View style={styles.simulationButtons}>
            <Button title="▶️ Démarrer simulation" onPress={() => simulateRoute()} disabled={isSimulating} />
            <Button title="⏹️ Arrêter" onPress={stopSimulation} disabled={!isSimulating} />
          </View>
        )}


        {/* 🚧 Banniere d'incidents */}
      
        {isSimulating && (
  <TouchableOpacity
    style={styles.reportButton}
    onPress={() => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      setIsSimulating(false); // pause la simulation
      setShowIncidentBanner(true);
    }}
  >
    <Ionicons name="warning" size={32} color="white" />
  </TouchableOpacity>
)}


        {/* ✏️ Bouton Modifier destination */}
        {!showSearchBox && (
          <View style={styles.editButton}>
            <TouchableOpacity onPress={() => setShowSearchBox(true)}>
              <View style={styles.editButtonBox}>
                <Text style={styles.editButtonText}>✏️ Modifier destination</Text>
              </View>
            </TouchableOpacity>
          </View>
        )}

        {/* 🚧 Banniere d'incidents */}

        {showIncidentBanner && (
  <TouchableWithoutFeedback onPress={() => setShowIncidentBanner(false)}>
    <View style={styles.overlay}>
      <TouchableWithoutFeedback onPress={() => {}}>
        <View style={styles.banner}>
          <Text style={styles.bannerTitle}>🚨 Signaler un incident</Text>
          <View style={styles.incidentRow}>
            {incidentTypes.map((item) => (
              <TouchableOpacity key={item.type} onPress={() => handleIncident(item.type)}>
                <View style={styles.incidentCard}>
                  <Image source={item.image} style={styles.incidentImage} />
                  <Text style={styles.incidentLabel}>{item.label}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </TouchableWithoutFeedback>
    </View>
  </TouchableWithoutFeedback>
)}


      </View>

      
    </KeyboardAvoidingView>
  );
}


const styles = StyleSheet.create({

  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 999,
  },
  
  banner: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 20,
    width: "90%",
    maxHeight: "70%",
    alignItems: "center",
  },
  
  bannerTitle: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 15,
  },
  
  incidentRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 15,
  },
  
  incidentCard: {
    alignItems: "center",
    margin: 10,
  },
  
  incidentImage: {
    width: 70,
    height: 70,
    borderRadius: 8,
  },
  
  incidentLabel: {
    marginTop: 5,
    fontWeight: "600",
  },
  
  reportButton: {
    position: "absolute",
    bottom: 120,
    right: 20,
    backgroundColor: "red",
    borderRadius: 30,
    padding: 12,
    zIndex: 15,
  },
  

  incidentButton: {
    position: "absolute",
    bottom: 120,
    right: 20,
    backgroundColor: "#ff9900",
    padding: 15,
    borderRadius: 30,
    elevation: 5,
    zIndex: 15,
  },
  
  incidentBanner: {
    position: "absolute",
    bottom: 180,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#fff",
    paddingVertical: 15,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    elevation: 10,
    zIndex: 20,
  },
  
  
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
  drawer: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: screenWidth * 0.6,
    backgroundColor: "#fff",
    zIndex: 20,
    padding: 20,
    elevation: 10,
  },
  drawerTitle: {
    fontSize: 20,
    marginBottom: 20,
  },
  controls: {
    position: "absolute",
    bottom: 20,
    left: 20,
    right: 20,
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 15,
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
  switchContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 15,
  },
  simulationButtons: {
    position: "absolute",
    bottom: 30,
    left: 20,
    right: 20,
    flexDirection: "column",
    gap: 10,
  },

  editButton: {
    position: "absolute",
    top: 100,
    right: 20,
    zIndex: 15,
  },
  
  editButtonBox: {
    backgroundColor: "#fff",
    padding: 10,
    borderRadius: 5,
    elevation: 4,
  },
  
  editButtonText: {
    fontWeight: "bold",
  },
  
});
