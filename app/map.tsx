import React, { useEffect, useRef, useState } from "react";
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
import { fetchItinerary } from "../services/itinerary.service";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";


const screenWidth = Dimensions.get("window").width;

interface Coordinate {
  latitude: number;
  longitude: number;
}

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
  const router = useRouter();


  const mapRef = useRef<MapView>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const drawerAnim = useRef(new Animated.Value(-screenWidth * 0.6)).current;

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

  const simulateRoute = () => {
    if (routePoints.length === 0) return;
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
                <Marker coordinate={routePoints[simIndex]}>
                  <Ionicons name="car-sport" size={30} color="blue" />
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
            <Button title="▶️ Démarrer simulation" onPress={simulateRoute} disabled={isSimulating} />
            <Button title="⏹️ Arrêter" onPress={stopSimulation} disabled={!isSimulating} />
          </View>
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
