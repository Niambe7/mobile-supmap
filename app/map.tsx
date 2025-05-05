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
  ScrollView,
  TouchableWithoutFeedback,
  Image,
  Modal
} from "react-native";
import io, { Socket } from 'socket.io-client';

import MapView, { Marker, Polyline, Region } from "react-native-maps";
import Constants from 'expo-constants';
import * as Location from "expo-location";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../context/AuthContext";
import { reportIncident , contributeIncident } from "../services/incident.service";
import {
  fetchItineraries,
  loadItinerary,
  ItineraryOptionDTO,
} from "../services/itinerary.service";
import { useRouter } from "expo-router";
import { CameraView, useCameraPermissions } from 'expo-camera';


interface Coordinate {
  latitude: number;
  longitude: number;
}

const GOOGLE_ROADS_API_KEY = "AIzaSyBavHlx6CMNPURIPW3fheR4b8Ra9xVT1rI";
const screenWidth = Dimensions.get("window").width;

/** Haversine formula */
function haversine(a: Coordinate, b: Coordinate): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const u =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(u));
}

function calculateHeading(from: Coordinate, to: Coordinate): number {
  const dLon = ((to.longitude - from.longitude) * Math.PI) / 180;
  const lat1 = (from.latitude * Math.PI) / 180;
  const lat2 = (to.latitude * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  const heading = (Math.atan2(y, x) * 180) / Math.PI;
  return (heading + 360) % 360;
}

export default function MapScreen() {
  const [location, setLocation] = useState<Coordinate | null>(null);
  const [region, setRegion] = useState<Region | null>(null);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("Gare de Lyon, Paris");
  const [routePoints, setRoutePoints] = useState<Coordinate[]>([]);
  const [simIndex, setSimIndex] = useState(0);
  const [isSimulating, setIsSimulating] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);
  const [avoidTolls, setAvoidTolls] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [showSearchBox, setShowSearchBox] = useState(true);
  const [showIncidentBanner, setShowIncidentBanner] = useState(false);
  const [carPosition, setCarPosition] = useState<Coordinate | null>(null);
  const [heading, setHeading] = useState(0);
  const [traveledPoints, setTraveledPoints] = useState<Coordinate[]>([]);
  const [currentItineraryId, setCurrentItineraryId] = useState<number | null>(null);

  // Permissions et visibilité de la caméra
const [cameraPermission, requestCameraPermission] = useCameraPermissions();
const [cameraVisible, setCameraVisible] = useState(false);
const [scanned, setScanned] = useState(false);



  const [itineraries, setItineraries] = useState<ItineraryOptionDTO[]>([]);
  const [choosingRoute, setChoosingRoute] = useState(false);

  const [socket, setSocket] = useState<typeof Socket | null>(null);
  const [alertData, setAlertData] = useState<{
    alertType: 'contribute' | 'recalculate',
    message: string,
    data: any
  } | null>(null);
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
  const navSubscriptionRef = useRef<Location.LocationSubscription | null>(null);
  const drawerAnim = useRef(new Animated.Value(-screenWidth * 0.6)).current;
  const { user, logout, token } = useAuth();



  const handleBarCodeScanned = ({ type, data }: { type: string; data: string }) => {
    setScanned(true);
    Alert.alert("Code scanné", `Type : ${type}\nDonnées : ${data}`);
    setCameraVisible(false);
  };
  

  // 1) Socket: écouter deux events
  useEffect(() => {
    if (isSimulating && !socket) {
      const s = io('https://api.supmap-server.pp.ua', {
        path: '/notify/socket.io',
        transports: ['websocket'],
        auth: { token },
      });
      s.on('connect',       () => console.log('✅ Socket connectée, id=', s.id));
      s.on('connect_error', (err: Error) => console.error('❌ Erreur socket', err.message));

      // s.on('notification', (payload: { message: string; data: any }) => {
      //   setAlertData({ alertType: 'contribute', message: payload.message, data: payload.data });
      // });

      s.on('recalculate-itinerary', (payload: { message: string; data: any }) => {
        setAlertData({ alertType: 'recalculate', message: payload.message, data: payload.data });
      });
      setSocket(s);
    }
    if (!isSimulating && socket) {
      socket.disconnect();
      setSocket(null);
    }
    return () => { if (socket) socket.disconnect(); };
  }, [isSimulating]);
  
    
    
    
    
  
    // 2) Boîte de dialogue personnalisée
    const renderAlertDialog = () => {
      if (!alertData) return null;
      const isContrib = alertData.alertType === 'contribute';
      const title = isContrib
        ? '🚨 Signaler un incident ?'
        : '🚨 Plusieurs incidents signalés';
      const question = isContrib
        ? alertData.message
        : 'Plusieurs incidents ont été signalés sur votre itinéraire. Voulez-vous le recalculer ?';
  
      return (
        <Modal transparent visible animationType="fade">
          <View style={styles.overlay}>
            <View style={styles.dialog}>
              <Text style={styles.dialogTitle}>{title}</Text>
              <Text style={styles.dialogText}>{question}</Text>
              <View style={styles.dialogButtons}>
                <TouchableOpacity
                  style={[styles.dialogBtn, styles.yesBtn]}
                  onPress={() => {
                    if (isContrib) {
                      handleConfirmIncident(
                        alertData.data.incidentId,
                        true,
                        carPosition,
                        token
                      );
                    } else {
                      handleRecalculate();
                    }
                  }}
                >
                  <Text style={styles.btnText}>Oui</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.dialogBtn, styles.noBtn]}
                  onPress={() => {
                    if (isContrib) {
                      handleConfirmIncident(
                        alertData.data.incidentId,
                        false,
                        carPosition,
                        token
                      );
                    }
                    setAlertData(null);
                  }}
                >
                  <Text style={styles.btnText}>Non</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      );
    };

    async function handleConfirmIncident(
      incidentId: number,
      confirmed: boolean,
      carPos: Coordinate | null,
      token: string | null
    ) {
      if (!token || !carPos) return;
      try {
        await contributeIncident(
          incidentId,
          carPos.latitude,
          carPos.longitude,
          confirmed ? "yes" : "no",
          token
        );
        Alert.alert(
          confirmed
            ? "Merci pour votre confirmation 👍"
            : "Merci pour votre retour 👎"
        );
      } catch (err: any) {
        Alert.alert("Erreur", err.message);
      } finally {
        setAlertData(null);
      }
    }

    // 3) Recalculate handler
    async function handleRecalculate() {
      // 1) Vérifie les prérequis
      if (!user || !carPosition || !currentItineraryId) {
        console.log("[handleRecalculate] Prérequis manquants (user, carPosition ou currentItineraryId)");
        setAlertData(null);
        return;
      }
    
      try {
        // 2) Appel à l'API recalcul
        console.log("[handleRecalculate] Envoi POST /itineraries/recalculate", {
          itinerary_id: currentItineraryId,
          current_position: { lat: carPosition.latitude, lng: carPosition.longitude }
        });
    
        const res = await fetch(
          "https://api.supmap-server.pp.ua/itineraries/itineraries/recalculate",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({
              itinerary_id: currentItineraryId,
              current_position: {
                lat: carPosition.latitude,
                lng: carPosition.longitude
              }
            })
          }
        );
    
        // 3) Lecture du texte brut et log
        const raw = await res.text();
        console.log("[handleRecalculate] raw response:", raw);
    
        // 4) Parsing JSON
        let json: any;
        try {
          json = JSON.parse(raw);
        } catch (parseErr) {
          console.error("[handleRecalculate] échec parse JSON:", parseErr);
          throw new Error("Réponse du serveur non JSON");
        }
        console.log("[handleRecalculate] parsed JSON:", json);
    
        // 5) Vérifie statut HTTP
        if (!res.ok) {
          const msg = json.error || `Erreur API (${res.status})`;
          console.error("[handleRecalculate] API returned error:", msg);
          throw new Error(msg);
        }
    
        // 6) Récupère l'ancienne route si besoin
        //    Utile si vous voulez l'afficher en parallèle
        const oldPtsArray: any[] = Array.isArray(json.route_points)
          ? json.route_points
          : [];
        console.log("[handleRecalculate] old route_points count =", oldPtsArray.length);
    
        // 7) Récupère la nouvelle route
        if (!json.new_route || !Array.isArray(json.new_route.route_points)) {
          console.error("[handleRecalculate] new_route.route_points introuvable");
          throw new Error("new_route.route_points manquant dans la réponse");
        }
        const newPtsArray: any[] = json.new_route.route_points;
        console.log("[handleRecalculate] new_route.route_points count =", newPtsArray.length);
    
        // 8) Transformation en Coordinate[]
        const newCoords: Coordinate[] = newPtsArray.map(p => ({
          latitude: p.lat,
          longitude: p.lng
        }));
    
        // (Optionnel) Transformation de l'ancienne route si vous stockez oldRoutePoints
        // const oldCoords: Coordinate[] = oldPtsArray.map(p => ({ latitude: p.lat, longitude: p.lng }));
        // setOldRoutePoints(oldCoords);
    
        // 9) Mise à jour de l'état
        setRoutePoints(newCoords);
        setSimIndex(0);
        console.log("[handleRecalculate] routePoints mis à jour, simulation reset");
    
        // 10) Affichage à l'utilisateur
        Alert.alert("Itinéraire recalculé !", "Votre nouvelle route a bien été chargée.");
    
      } catch (err: any) {
        console.error("[handleRecalculate] erreur attrapée:", err);
        Alert.alert("Erreur", err.message || "Impossible de recalculer l’itinéraire.");
      } finally {
        // 11) Toujours fermer la boîte de dialogue
        setAlertData(null);
      }
    }
    
    
    



async function handleConfirm(incidentId: number, confirmed: boolean, carPosition: Coordinate | null, token: string | null) {
  if (!token || !carPosition) return;

  try {
    await contributeIncident(
      incidentId,
      carPosition.latitude,
      carPosition.longitude,
      confirmed ? "yes" : "no",
      token
    );
    Alert.alert(
      confirmed ? 
        "Merci pour votre confirmation 👍" :
        "Merci pour votre retour 👎"
    );
  } catch (err: any) {
    Alert.alert("Erreur", err.message);
  } finally {
    setAlertData(null);
  }
}


  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission refusée", "Active la géolocalisation");
        return;
      }
      const loc = await Location.getCurrentPositionAsync({});
      const coords = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
      setLocation(coords);
      setRegion({ ...coords, latitudeDelta: 0.05, longitudeDelta: 0.05 });
    })();
  }, []);

  const toggleDrawer = () => {
    Animated.timing(drawerAnim, {
      toValue: drawerOpen ? -screenWidth * 0.6 : 0,
      duration: 300,
      useNativeDriver: false,
    }).start();
    setDrawerOpen(!drawerOpen);
  };

  const handleLogout = () => {
    logout();
    toggleDrawer();
    router.replace("/login");
  };

  const useCurrentLocation = async () => {
    try {
      const loc = await Location.getCurrentPositionAsync({});
      const coords = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
      const [address] = await Location.reverseGeocodeAsync(coords);
      const readable = `${address.name || ""} ${address.street || ""} ${address.city || ""}`.trim();
      setStart(readable);
    } catch {
      Alert.alert("Erreur", "Impossible de récupérer une adresse.");
    }
  };

  const handleItinerary = async () => {
    if (!user) { Alert.alert("Erreur", "Merci de vous connecter."); return; }
    if (!start || !end) { Alert.alert("Champs requis", "Merci de remplir départ et arrivée."); return; }
    try {
      const options = await fetchItineraries(start, end, avoidTolls);
      if (!options.length) { Alert.alert("Aucun résultat", "Aucune proposition d’itinéraire trouvée."); return; }
      setItineraries(options);
      setChoosingRoute(true);
      setShowSearchBox(false);
    } catch (err: any) {
      Alert.alert("Erreur", err.message || "Erreur lors de la génération");
    }
  };

  const handleLoadItinerary = async (choice: ItineraryOptionDTO) => {
    if (!user) {
      Alert.alert("Erreur", "Utilisateur non identifié");
      return;
    }
  
    // 1) Sauvegarde de l'itinéraire en base
    let savedItinerary;
    try {
      savedItinerary = await loadItinerary(user.id, choice, start, end);
      // On stocke l'ID pour la simulation / notifications
      setCurrentItineraryId(savedItinerary.id);
    } catch (err: any) {
      console.warn("Échec de l'enregistrement de l'itinéraire :", err);
      Alert.alert("Erreur", "Impossible de sauvegarder l'itinéraire");
      return;
    }
  
    // 2) SnapToRoads pour lisser la route
    try {
      const path = choice.route_points.map(p => `${p.lat},${p.lng}`).join("|");
      const response = await fetch(
        `https://roads.googleapis.com/v1/snapToRoads?path=${encodeURIComponent(
          path
        )}&interpolate=true&key=${GOOGLE_ROADS_API_KEY}`
      );
      const snapped = await response.json();
      const coords = snapped.snappedPoints.map((p: any) => ({
        latitude: p.location.latitude,
        longitude: p.location.longitude,
      }));
      setRoutePoints(coords);
    } catch (err) {
      console.warn("SnapToRoads échoué, fallback :", err);
      setRoutePoints(
        choice.route_points.map(p => ({ latitude: p.lat, longitude: p.lng }))
      );
    }
  
    // 3) Mise à jour de l'UI
    setChoosingRoute(false);
    setIsSimulating(false);
    setSimIndex(0);
    Alert.alert("Itinéraire chargé", `Option ${choice.id + 1} sélectionnée`);
  };
  
  

  // Simulation
  const simulateRoute = () => {
    if (routePoints.length < 2) return;
  
    // Recentre la carte sur tout l'itinéraire
    mapRef.current?.fitToCoordinates(routePoints, {
      edgePadding: { top: 50, right: 50, bottom: 50, left: 50 },
      animated: true
    });
  
    setIsSimulating(true);
    let index = 0;
  
    intervalRef.current = setInterval(() => {
      if (index >= routePoints.length) {
        clearInterval(intervalRef.current!);
        setIsSimulating(false);
        return;
      }
  
      const curr = routePoints[index];
      const next = routePoints[index + 1];
  
      // 1) Envoi "fire-and-forget" de la position au user-service
      // fetch('https://api.supmap-server.pp.ua/users/location/update', {
      //   method: 'POST',
      //   headers: {
      //     'Content-Type': 'application/json',
      //   },
      //   body: JSON.stringify({
      //     userId: user?.id || "",
      //     latitude: curr.latitude,
      //     longitude: curr.longitude
      //   })
      // })
      // .then(res => console.log(`[Update] status ${res.status} for step ${index}`))
      // .catch(err => console.warn('[Update] erreur envoi position', err));


      fetch('https://api.supmap-server.pp.ua/users/recalculate/itinerary/notify-recalculate', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({
          userId:      user?.id,
          itineraryId: currentItineraryId,
          latitude:    curr.latitude,
          longitude:   curr.longitude
        })
      });
  
      // 2) Mise à jour locale de la voiture et de l'UI
      setCarPosition(curr);
      setSimIndex(index);
      if (next) {
        setHeading(calculateHeading(curr, next));
      }
      mapRef.current?.animateCamera({ center: curr, zoom: 16 });
  
      index++;
    }, 1000);
  };
  const stopSimulation = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setIsSimulating(false);
  };

  // Navigation (vrai trajet)
  const startNavigation = async () => {
    if (routePoints.length < 2) return;
    setIsNavigating(true);
    setTraveledPoints([]);
    const sub = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.Highest, timeInterval: 1000, distanceInterval: 1 },
      (loc) => {
        const coords = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
        setCarPosition(coords);
        setTraveledPoints(prev => {
          if (prev.length > 0) {
            setHeading(calculateHeading(prev[prev.length-1], coords));
          }
          return [...prev, coords];
        });
        mapRef.current?.animateCamera({ center: coords, zoom:16 });
      }
    );
    navSubscriptionRef.current = sub;
  };
  const stopNavigation = () => {
    if (navSubscriptionRef.current) {
      navSubscriptionRef.current.remove();
      navSubscriptionRef.current = null;
    }
    setIsNavigating(false);
  };

  const handleIncident = async (type: string) => {
    if (!user || !token || !routePoints[simIndex]) return;
    const { latitude, longitude } = routePoints[simIndex];
    try {
      await reportIncident(type, latitude, longitude, user.id, "No description", token);
      Alert.alert("✅ Signalement envoyé");
      setShowIncidentBanner(false);
      simulateRoute();
    } catch (err: any) {
      Alert.alert("❌ Erreur", err.response?.data?.message || "Erreur serveur");
    }
  };

  return (
    <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={styles.container}>

    {/* ① La Map / les contrôles de recherche */}
    {showSearchBox && (
      <View style={styles.controls}>
        {/* … tes inputs + bouton recherche … */}
      </View>
    )}

    {/* ② Le route selector */}
    {choosingRoute && !showSearchBox && (
      <View style={styles.routeSelectorContainer}>
        {/* … tes options d’itinéraire … */}
      </View>
    )}

    {/* ③ Les boutons simulation/navigation */}
    {routePoints.length > 0 && !choosingRoute && !showSearchBox && (
      <View style={styles.navigationContainer}>
        {/* … tes boutons Démarrer / Stop … */}
      </View>
    )}

    {/* ④ Le backdrop pour le drawer */}
    {drawerOpen && (
      <TouchableWithoutFeedback onPress={toggleDrawer}>
        <View style={styles.backdrop} />
      </TouchableWithoutFeedback>
    )}

    {/* ⑤ Le drawer lui-même — placé en dernier pour qu’il soit au-dessus */}
    <Animated.View style={[styles.drawer, { left: drawerAnim }]}>
      <TouchableWithoutFeedback>
        <View>
          <Text style={styles.drawerTitle}>Menu</Text>
          <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
            <Text style={styles.logoutText}>Déconnexion</Text>
          </TouchableOpacity>

          <TouchableOpacity
        onPress={() => {
          if (!cameraPermission?.granted) {
            requestCameraPermission();
          } else {
            setScanned(false);
            setCameraVisible(true);
          }
        }}
        style={[styles.logoutButton, { backgroundColor: '#007bff', marginTop: 12 }]}
      >
        <Text style={styles.logoutText}>Scanner un code-barres</Text>
      </TouchableOpacity>

        </View>
      </TouchableWithoutFeedback>
    </Animated.View>

    {/* ⑥ Le bouton hamburger en tout dernier (ou premier, selon ton goût) */}
    <TouchableOpacity style={styles.menuIcon} onPress={toggleDrawer}>
      <Ionicons name="menu" size={32} color="#333" />
    </TouchableOpacity>

      {renderAlertDialog()}
        <MapView ref={mapRef} style={styles.map} region={region || undefined} showsUserLocation>
          {routePoints.length > 0 && (
            <>
              {isNavigating && traveledPoints.length > 1 && (
                <Polyline coordinates={traveledPoints} strokeColor="rgba(0,0,0,0.3)" strokeWidth={6} />
              )}
              <Polyline
                coordinates={routePoints}
                strokeColor="#007bff"
                strokeWidth={isSimulating || isNavigating ? 6 : 3}
              />
              <Marker coordinate={routePoints[0]} title="Départ" pinColor="green" />
              <Marker coordinate={routePoints[routePoints.length-1]} title="Arrivée" pinColor="red" />

              {/* Simulated car */}
              {isSimulating && carPosition && (
                <Marker coordinate={carPosition} anchor={{x:0.5,y:0.5}}>
                  <View style={styles.simCarDot} />
                </Marker>
              )}

              {/* Live navigation arrow */}
              {isNavigating && carPosition && (
                <Marker
                  coordinate={carPosition}
                  anchor={{ x:0.5, y:0.5 }}
                  rotation={heading}
                  flat
                >
                    <Ionicons
                        name="arrow-up"
                        size={60}                // ← taille plus grande
                        color="#800080"          // ← mauve
                        style={styles.arrowIcon} // tu peux alléger l’ombre si besoin
                      /> 
                </Marker>
              )}
            </>
          )}
        </MapView>

        {/* Itinerary selector */}
        {choosingRoute &&  !showSearchBox && (
          <View style={styles.routeSelectorContainer}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.routeSelectorScroll} contentContainerStyle={styles.routeSelectorContent}>
              {itineraries.map((opt, idx) => (
                <View key={opt.id} style={[styles.routeCard, idx===0 && styles.routeCardFastest]}>
                  <Text style={styles.routeLabel}>Option {idx+1}{idx===0?" • Plus rapide":""}</Text>
                  <Text style={styles.routeInfo}>{(opt.distance/1000).toFixed(1)} km • {Math.round(opt.duration/60)} min</Text>
                  <TouchableOpacity style={styles.loadButton} onPress={() => handleLoadItinerary(opt)}>
                    <Text style={styles.loadButtonText}>ITINÉRAIRE</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Drawer menu */}
        <TouchableOpacity style={styles.menuIcon} onPress={toggleDrawer}>
  <Ionicons name="menu" size={32} color="#333" />
</TouchableOpacity>

  {drawerOpen && (
    <TouchableWithoutFeedback onPress={toggleDrawer}>
      <View style={styles.backdrop} />
    </TouchableWithoutFeedback>
  )}

 
        {/* Search form */}
        {showSearchBox && (
          <View style={styles.controls}>
            <TextInput placeholder="Départ" value={start} onChangeText={setStart} style={styles.input} />
            <TextInput placeholder="Arrivée" value={end} onChangeText={setEnd} style={styles.input} />
            <TouchableOpacity onPress={useCurrentLocation} style={styles.currentLocBtn}>
              <Text style={styles.currentLocText}>📍 MA POSITION ACTUELLE</Text>
            </TouchableOpacity>
            <View style={styles.switchContainer}>
              <Text style={{flex:1}}>Éviter les péages</Text>
              <Switch value={avoidTolls} onValueChange={setAvoidTolls} />
            </View>
            <TouchableOpacity onPress={handleItinerary} style={styles.searchBtn}>
              <Text style={styles.searchBtnText}>Rechercher</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Simulation & Navigation controls */}
        {routePoints.length > 0 && !showSearchBox && !choosingRoute && (
          <View style={styles.navigationContainer}>
            <TouchableOpacity
              style={[styles.navButton, isSimulating && styles.disabled]}
              onPress={simulateRoute}
              disabled={isSimulating}
            >
              <Text style={styles.navButtonText}>▶️ Démarrer simulation</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.navButton, styles.stopButton, !isSimulating && styles.disabled]}
              onPress={stopSimulation}
              disabled={!isSimulating}
            >
              <Text style={styles.navButtonText}>⏹️ Arrêter</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.navButtonNav, isNavigating && styles.disabled]}
              onPress={startNavigation}
              disabled={isNavigating}
            >
              <Text style={styles.navButtonText}>🧭 Démarrer trajet</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.navButtonNav, styles.stopButton, !isNavigating && styles.disabled]}
              onPress={stopNavigation}
              disabled={!isNavigating}
            >
              <Text style={styles.navButtonText}>⏹️ Stop trajet</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Incident reporting */}
        {isSimulating && (
          <TouchableOpacity
            style={styles.reportButton}
            onPress={() => { clearInterval(intervalRef.current!); setIsSimulating(false); setShowIncidentBanner(true); }}
          >
            <Ionicons name="warning" size={32} color="white" />
          </TouchableOpacity>
        )}
        {showIncidentBanner && (
          <TouchableWithoutFeedback onPress={() => setShowIncidentBanner(false)}>
            <View style={styles.overlay}>
              <TouchableWithoutFeedback>
                <View style={styles.banner}>
                  <Text style={styles.bannerTitle}>🚨 Signaler un incident</Text>
                  <View style={styles.incidentRow}>
                    {incidentTypes.map(item => (
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

        {/* Edit destination */}
        {!showSearchBox && (
          <View style={styles.editButton}>
            <TouchableOpacity onPress={() => setShowSearchBox(true)}>
              <View style={styles.editButtonBox}>
                <Text style={styles.editButtonText}>✏️ Modifier destination</Text>
              </View>
            </TouchableOpacity>
          </View>
        )}
        <Modal visible={cameraVisible} animationType="slide">
          <View style={{ flex: 1 }}>
            <CameraView
              style={{ flex: 1 }}
              onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
              barcodeScannerSettings={{ barcodeTypes: ['qr', 'ean13', 'ean8'] }}
            />
            <TouchableOpacity
              style={{
                position: 'absolute',
                top: 40,
                right: 20,
                backgroundColor: 'rgba(0,0,0,0.5)',
                padding: 10,
                borderRadius: 5
              }}
              onPress={() => setCameraVisible(false)}
            >
              <Text style={{ color: '#fff', fontWeight: 'bold' }}>Fermer</Text>
            </TouchableOpacity>
          </View>
        </Modal>
      </View>
    </KeyboardAvoidingView>
  );
}



const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  closeCameraBtn: {
    position: 'absolute',
    top: 40,
    right: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: 10,
    borderRadius: 5,
    zIndex: 10,
  },
  closeCameraTxt: {
    color: '#fff',
    fontWeight: 'bold',
  },
  controls: {
    position: "absolute",
    bottom:20,
    left:20,
    right:20,
    backgroundColor:"#fff",
    borderRadius:10,
    padding:15,
    elevation:5,     // Android
    zIndex:10,       // iOS
  },
  routeSelectorContainer: {
    position: "absolute",
    bottom:100,
    width:"100%",
    height:160,
    backgroundColor:"rgba(255,255,255,0.9)",
    elevation:10,
    zIndex:20,
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    // backgroundColor: 'rgba(0,0,0,0.2)', // si tu veux un léger fondu
    zIndex: 5,
  },
  drawer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: screenWidth * 0.6,
    backgroundColor: '#fff',
    padding: 20,
    elevation: 10,
    zIndex: 999,      // plus haut que le backdrop
  },

  dialog: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 12,
    width: '80%',
    alignItems: 'center'
  },
  dialogTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15
  },
  dialogText: {
    textAlign: 'center',
    marginBottom: 20
  },
  dialogButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%'
  },
  dialogBtn: {
    padding: 10,
    borderRadius: 8,
    minWidth: 80
  },
  yesBtn: { backgroundColor: '#28a745' },
  noBtn:  { backgroundColor: '#dc3545' },
  btnText: {
    color: '#fff',
    textAlign: 'center'
  },
  // itinerary selector
  // routeSelectorContainer: { position: "absolute", bottom: 100, width: "100%", height: 160, backgroundColor: "rgba(255,255,255,0.9)", zIndex:20 },
  routeSelectorScroll: { flexGrow:0, height:"100%" },
  routeSelectorContent: { paddingHorizontal:10, flexDirection:"row", alignItems:"flex-start" },
  routeCard: { width:220, marginRight:12, padding:12, borderRadius:8, backgroundColor:"#fff", shadowColor:"#000", shadowOpacity:0.2, shadowRadius:4, elevation:3, justifyContent:"space-between" },
  routeCardFastest: { borderColor:"#007bff", borderWidth:2 },
  routeLabel: { fontWeight:"600", marginBottom:6 },
  routeInfo: { color:"#555", marginBottom:8 },
  loadButton: { backgroundColor:"#007bff", paddingVertical:8, borderRadius:6 },
  loadButtonText: { color:"#fff", textAlign:"center", fontWeight:"600" },

  // drawer
  menuIcon: { position:"absolute", top:50, left:20, backgroundColor:"#fff", borderRadius:20, padding:8, elevation:5, zIndex:10 },
  // drawer: { position:"absolute", top:0, bottom:0, width: screenWidth*0.6, backgroundColor:"#fff", padding:20, elevation:10, zIndex:20 },
  drawerTitle: { fontSize:20, marginBottom:20 },
  logoutButton: { backgroundColor:"#dc3545", padding:10, borderRadius:6 },
  logoutText: { color:"#fff", textAlign:"center", fontWeight:"600" },

  // search form
  // controls: { position:"absolute", bottom:20, left:20, right:20, backgroundColor:"#fff", borderRadius:10, padding:15, elevation:5, zIndex:10 },
  input: { borderWidth:1, borderColor:"#ccc", padding:10, marginBottom:10, borderRadius:8 },
  currentLocBtn: { backgroundColor:"#eee", paddingVertical:10, borderRadius:6, marginBottom:10 },
  currentLocText: { textAlign:"center", fontWeight:"600" },
  switchContainer: { flexDirection:"row", alignItems:"center", marginBottom:15 },
  searchBtn: { backgroundColor:"#007bff", paddingVertical:12, borderRadius:8 },
  searchBtnText: { color:"#fff", textAlign:"center", fontWeight:"600" },

  // simulation & navigation controls
  navigationContainer: { position:"absolute", bottom:30, left:20, right:20, alignItems:"center", zIndex:15 },
  navButton: { backgroundColor:"#007bff", paddingVertical:12, borderRadius:8, width:"70%", marginVertical:5 },
  navButtonNav: { backgroundColor:"#28a745", paddingVertical:12, borderRadius:8, width:"70%", marginVertical:5 },
  stopButton: { backgroundColor:"#dc3545" },
  navButtonText: { color:"#fff", textAlign:"center", fontWeight:"600" },
  disabled: { opacity:0.5 },

  // simulated car dot
  simCarDot: { width:20, height:20, backgroundColor:"#007bff", borderRadius:10, borderWidth:3, borderColor:"#fff" },

  // arrow icon
  arrowIcon: {
    //  color:"#28a745", textShadowColor:"rgba(0,0,0,0.5)", textShadowOffset:{width:1, height:1}, textShadowRadius:2
    
    },

  // incident overlay
  reportButton: { position:"absolute", bottom:120, right:20, backgroundColor:"red", borderRadius:30, padding:12, zIndex:15 },
  overlay: { position:"absolute", top:0, left:0, right:0, bottom:0, backgroundColor:"rgba(0,0,0,0.5)", justifyContent:"center", alignItems:"center", zIndex:999 },
  banner: { backgroundColor:"#fff", borderRadius:12, padding:20, width:"90%", maxHeight:"70%", alignItems:"center" },
  bannerTitle: { fontSize:20, fontWeight:"bold", marginBottom:15 },
  incidentRow: { flexDirection:"row", flexWrap:"wrap", justifyContent:"center", gap:15 },
  incidentCard: { alignItems:"center", margin:10 },
  incidentImage: { width:70, height:70, borderRadius:8 },
  incidentLabel: { marginTop:5, fontWeight:"600" },

  // edit
  editButton: { position:"absolute", top:100, right:20, zIndex:15 },
  editButtonBox: { backgroundColor:"#fff", padding:10, borderRadius:5, elevation:4 },
  editButtonText: { fontWeight:"bold" },
});
