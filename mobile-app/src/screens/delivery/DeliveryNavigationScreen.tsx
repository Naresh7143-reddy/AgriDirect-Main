// FILE: src/screens/delivery/DeliveryNavigationScreen.tsx
/**
 * Delivery partner's real-time Google Maps navigation screen.
 * Shows current GPS location (blue dot), pickup/drop markers with labels,
 * route polyline, and "Navigate in Google Maps" button for turn-by-turn.
 * Auto-sends GPS to backend every 10s and broadcasts to buyer via SSE.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Linking,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ActivityIndicator,
} from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import Geolocation from '@react-native-community/geolocation';
import ConfettiCannon from 'react-native-confetti-cannon';
import Icon from 'react-native-vector-icons/Ionicons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-native-native-stack';
import { Colors } from '../../theme/colors';
import { shadow, borderRadius } from '../../theme/spacing';
import { deliveryApi } from '../../api/delivery';

type DeliveryStackParamList = {
  DeliveryNavigation: {
    orderId: string;
    pickupLat: number;
    pickupLng: number;
    dropLat: number;
    dropLng: number;
    farmerName?: string;
    buyerName?: string;
  };
  DeliveryOrderDetail: { orderId: string };
};

type Phase =
  | 'GOING_TO_FARM'
  | 'ARRIVED_AT_FARM'
  | 'PICKED_UP'
  | 'GOING_TO_DROP'
  | 'ARRIVED_AT_DROP'
  | 'DELIVERED';

const PHASE_STEPS: {
  phase: Phase;
  label: string;
  action: string;
  deliveryStatus: string;
  icon: string;
}[] = [
  {
    phase: 'GOING_TO_FARM',
    label: 'Going to farm',
    action: 'Arrived at Farm',
    deliveryStatus: 'ACCEPTED',
    icon: '🌾',
  },
  {
    phase: 'ARRIVED_AT_FARM',
    label: 'At farm — pickup produce',
    action: 'Order Picked Up',
    deliveryStatus: 'PICKED_UP',
    icon: '📦',
  },
  {
    phase: 'PICKED_UP',
    label: 'Going to customer',
    action: 'Arrived at Delivery',
    deliveryStatus: 'IN_TRANSIT',
    icon: '🚚',
  },
  {
    phase: 'ARRIVED_AT_DROP',
    label: 'At delivery location',
    action: 'Delivered Successfully',
    deliveryStatus: 'DELIVERED',
    icon: '🎉',
  },
];

// Haversine distance calculation in km
function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export const DeliveryNavigationScreen: React.FC = () => {
  const navigation = useNavigation<
    NativeStackNavigationProp<DeliveryStackParamList>
  >();
  const route = useRoute<RouteProp<DeliveryStackParamList, 'DeliveryNavigation'>>();
  const {
    orderId,
    pickupLat,
    pickupLng,
    dropLat,
    dropLng,
    farmerName = 'Farm',
    buyerName = 'Customer',
  } = route.params;

  const [phaseIndex, setPhaseIndex] = useState(0);
  const [showConfirm, setShowConfirm] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [done, setDone] = useState(false);
  const [myLat, setMyLat] = useState<number | null>(null);
  const [myLng, setMyLng] = useState<number | null>(null);

  const confettiRef = useRef<any>(null);
  const earningsAnim = useRef(new Animated.Value(0)).current;
  const mapRef = useRef<MapView>(null);
  const locationWatchId = useRef<number | null>(null);
  const locationInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  const currentStep = PHASE_STEPS[phaseIndex];
  const isGoingToFarm = phaseIndex <= 1;
  const destLat = isGoingToFarm ? pickupLat : dropLat;
  const destLng = isGoingToFarm ? pickupLng : dropLng;
  const destLabel = isGoingToFarm ? `🌾 ${farmerName}` : `🏠 ${buyerName}`;

  // Watch GPS and auto-send to backend every 10s
  useEffect(() => {
    Geolocation.getCurrentPosition(
      (pos) => {
        setMyLat(pos.coords.latitude);
        setMyLng(pos.coords.longitude);
      },
      () => {},
      { enableHighAccuracy: true, timeout: 10000 },
    );

    locationWatchId.current = Geolocation.watchPosition(
      (pos) => {
        setMyLat(pos.coords.latitude);
        setMyLng(pos.coords.longitude);
      },
      () => {},
      { enableHighAccuracy: true, distanceFilter: 10 },
    );

    // Send location to backend every 10 seconds (triggers SSE broadcast to buyer)
    locationInterval.current = setInterval(() => {
      Geolocation.getCurrentPosition(
        (pos) => {
          deliveryApi
            .updateLocation({
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              accuracy: pos.coords.accuracy,
              heading: pos.coords.heading,
              speed: pos.coords.speed,
            })
            .catch(() => {});
        },
        () => {},
        { enableHighAccuracy: true, timeout: 5000 },
      );
    }, 10000);

    return () => {
      if (locationWatchId.current !== null) {
        Geolocation.clearWatch(locationWatchId.current);
      }
      if (locationInterval.current) {
        clearInterval(locationInterval.current);
      }
    };
  }, []);

  // Fit map to show both markers
  useEffect(() => {
    if (myLat && myLng && mapRef.current) {
      setTimeout(() => {
        mapRef.current?.fitToCoordinates(
          [
            { latitude: myLat, longitude: myLng },
            { latitude: destLat, longitude: destLng },
          ],
          {
            edgePadding: { top: 120, right: 60, bottom: 240, left: 60 },
            animated: true,
          },
        );
      }, 500);
    }
  }, [myLat, myLng, destLat, destLng]);

  useEffect(() => {
    if (done) {
      confettiRef.current?.start();
      Animated.timing(earningsAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }).start();
    }
  }, [done, earningsAnim]);

  const distanceKm =
    myLat && myLng
      ? haversineDistance(myLat, myLng, destLat, destLng)
      : 0;
  const etaMinutes = Math.max(
    1,
    Math.round((distanceKm / 20) * 60 + 5),
  );

  const openGoogleMapsNavigation = () => {
    const url = Platform.select({
      ios: `comgooglemaps://?daddr=${destLat},${destLng}&directionsmode=driving`,
      android: `google.navigation:q=${destLat},${destLng}&mode=d`,
    });
    const fallback = `https://www.google.com/maps/dir/?api=1&destination=${destLat},${destLng}&travelmode=driving`;

    if (url) {
      Linking.canOpenURL(url)
        .then((supported) => {
          if (supported) {
            Linking.openURL(url);
          } else {
            Linking.openURL(fallback);
          }
        })
        .catch(() => Linking.openURL(fallback));
    }
  };

  const handlePhaseAction = useCallback(async () => {
    setUpdating(true);
    setShowConfirm(false);
    try {
      await deliveryApi.updateOrderStatus(
        orderId,
        currentStep.deliveryStatus as any,
      );
      if (phaseIndex >= PHASE_STEPS.length - 1) {
        setDone(true);
      } else {
        setPhaseIndex((prev) => prev + 1);
      }
    } catch (e: any) {
      Alert.alert('Update Failed', e?.message || 'Please try again.');
    } finally {
      setUpdating(false);
    }
  }, [orderId, currentStep, phaseIndex]);

  if (done) {
    return (
      <View style={styles.successScreen}>
        <ConfettiCannon
          ref={confettiRef}
          count={100}
          origin={{ x: 200, y: 0 }}
          colors={[Colors.primary, Colors.secondary, Colors.accent, Colors.white]}
          autoStart={false}
          fadeOut
        />
        <Animated.View
          style={[
            styles.earningsCard,
            {
              opacity: earningsAnim,
              transform: [{ scale: earningsAnim }],
            },
          ]}
        >
          <Text style={styles.deliveredIcon}>🎉</Text>
          <Text style={styles.deliveredTitle}>Delivery Complete!</Text>
          <Text style={styles.deliveredSub}>
            Great job! Order delivered successfully.
          </Text>
          <View style={styles.earningsBox}>
            <Text style={styles.earningsLabel}>You Earned</Text>
            <Text style={styles.earningsValue}>₹72</Text>
            <Text style={styles.earningsDetail}>
              ₹40 base + ₹32 distance bonus
            </Text>
          </View>
          <TouchableOpacity
            style={styles.doneBtn}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.doneBtnText}>Done →</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Real Google Map with markers and polyline */}
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={styles.map}
        initialRegion={{
          latitude: pickupLat,
          longitude: pickupLng,
          latitudeDelta: 0.1,
          longitudeDelta: 0.1,
        }}
      >
        {/* Delivery partner's current GPS location (blue dot) */}
        {myLat && myLng && (
          <Marker
            coordinate={{ latitude: myLat, longitude: myLng }}
            title="Your Location"
            flat
          >
            <View style={styles.myLocationMarker}>
              <View style={styles.myLocationDot} />
              <View style={styles.myLocationRing} />
            </View>
          </Marker>
        )}

        {/* Farm/Pickup marker */}
        <Marker
          coordinate={{ latitude: pickupLat, longitude: pickupLng }}
          title={farmerName}
          description="Pickup location"
        >
          <View style={styles.pickupMarker}>
            <Text style={styles.markerEmoji}>🌾</Text>
          </View>
        </Marker>

        {/* Buyer/Drop marker */}
        <Marker
          coordinate={{ latitude: dropLat, longitude: dropLng }}
          title={buyerName}
          description="Drop location"
        >
          <View style={styles.dropMarker}>
            <Text style={styles.markerEmoji}>🏠</Text>
          </View>
        </Marker>

        {/* Route polyline from current location to destination */}
        {myLat && myLng && (
          <Polyline
            coordinates={[
              { latitude: myLat, longitude: myLng },
              { latitude: destLat, longitude: destLng },
            ]}
            strokeColor={Colors.primary}
            strokeWidth={4}
            lineDashPattern={[5]}
          />
        )}
      </MapView>

      {/* Top action bar: back + navigate buttons */}
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
        >
          <Icon name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={openGoogleMapsNavigation}
          style={styles.navigateBtn}
        >
          <Icon name="navigate" size={20} color={Colors.white} />
          <Text style={styles.navigateBtnText}>Navigate</Text>
        </TouchableOpacity>
      </View>

      {/* Bottom sheet with phase info, contact details, and action button */}
      <View style={styles.bottomSheet}>
        <View style={styles.sheetHandle} />

        {/* Current Phase and Distance */}
        <View style={styles.phaseCard}>
          <Text style={styles.phaseEmoji}>{currentStep.icon}</Text>
          <View style={styles.phaseInfo}>
            <Text style={styles.phaseLabel}>{currentStep.label}</Text>
            <Text style={styles.phaseDistance}>
              {distanceKm.toFixed(1)} km away • ETA {etaMinutes} min
            </Text>
          </View>
        </View>

        {/* Contact Card */}
        <View style={styles.contactCard}>
          <View style={styles.contactLeft}>
            <Text style={styles.contactEmoji}>
              {isGoingToFarm ? '🌾' : '🏠'}
            </Text>
            <View>
              <Text style={styles.contactName}>
                {isGoingToFarm ? farmerName : buyerName}
              </Text>
              <Text style={styles.contactType}>
                {isGoingToFarm ? 'Farmer' : 'Buyer'}
              </Text>
            </View>
          </View>
          <TouchableOpacity
            style={styles.callBtn}
            onPress={() => {
              // TODO: Implement calling
            }}
          >
            <Icon name="call" size={18} color={Colors.white} />
          </TouchableOpacity>
        </View>

        {/* Phase Stepper */}
        <View style={styles.stepperContainer}>
          {PHASE_STEPS.map((step, idx) => (
            <View key={step.phase} style={styles.stepRow}>
              <View
                style={[
                  styles.stepDot,
                  idx <= phaseIndex && styles.stepDotActive,
                ]}
              >
                <Text style={styles.stepDotIcon}>
                  {idx < phaseIndex ? '✓' : step.icon}
                </Text>
              </View>
              {idx < PHASE_STEPS.length - 1 && (
                <View
                  style={[
                    styles.stepLine,
                    idx < phaseIndex && styles.stepLineActive,
                  ]}
                />
              )}
              <Text
                style={[
                  styles.stepText,
                  idx <= phaseIndex && styles.stepTextActive,
                ]}
              >
                {step.label}
              </Text>
            </View>
          ))}
        </View>

        {/* Main CTA Button */}
        <TouchableOpacity
          style={[styles.actionBtn, updating && styles.actionBtnDisabled]}
          onPress={() => setShowConfirm(true)}
          disabled={updating}
        >
          {updating ? (
            <ActivityIndicator size="small" color={Colors.white} />
          ) : (
            <>
              <Text style={styles.actionBtnText}>
                {currentStep.action}
              </Text>
              <Icon name="arrow-forward" size={18} color={Colors.white} />
            </>
          )}
        </TouchableOpacity>

        {/* Confirmation Modal */}
        {showConfirm && (
          <View style={styles.confirmOverlay}>
            <View style={styles.confirmDialog}>
              <Text style={styles.confirmTitle}>
                Confirm: {currentStep.action}?
              </Text>
              <Text style={styles.confirmMessage}>
                {currentStep.label}
              </Text>
              <View style={styles.confirmButtons}>
                <TouchableOpacity
                  style={styles.confirmBtnCancel}
                  onPress={() => setShowConfirm(false)}
                >
                  <Text style={styles.confirmBtnCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.confirmBtnConfirm}
                  onPress={handlePhaseAction}
                  disabled={updating}
                >
                  <Text style={styles.confirmBtnConfirmText}>Confirm</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      </View>
    </View>
  );
};

export default DeliveryNavigationScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  map: {
    flex: 1,
  },

  // Markers
  myLocationMarker: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  myLocationDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.primary,
    ...shadow.md,
  },
  myLocationRing: {
    position: 'absolute',
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 3,
    borderColor: Colors.primary,
    opacity: 0.3,
  },
  pickupMarker: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.successLight,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: Colors.white,
    ...shadow.lg,
  },
  dropMarker: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.infoLight,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: Colors.white,
    ...shadow.lg,
  },
  markerEmoji: {
    fontSize: 22,
  },

  // Top Bar
  topBar: {
    position: 'absolute',
    top: 50,
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 10,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.full,
    backgroundColor: 'rgba(255,255,255,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
    ...shadow.md,
  },
  navigateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: borderRadius.full,
    ...shadow.md,
  },
  navigateBtnText: {
    color: Colors.white,
    fontWeight: '700',
    marginLeft: 8,
  },

  // Bottom Sheet
  bottomSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 20,
    ...shadow.xl,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    backgroundColor: Colors.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },

  // Phase Card
  phaseCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.infoLight,
    borderRadius: borderRadius.lg,
    padding: 14,
    marginBottom: 14,
  },
  phaseEmoji: {
    fontSize: 32,
    marginRight: 12,
  },
  phaseInfo: {
    flex: 1,
  },
  phaseLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  phaseDistance: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },

  // Contact Card
  contactCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.background,
    borderRadius: borderRadius.lg,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: Colors.divider,
  },
  contactLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  contactEmoji: {
    fontSize: 28,
    marginRight: 12,
  },
  contactName: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  contactType: {
    fontSize: 11,
    color: Colors.textHint,
    marginTop: 2,
  },
  callBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.success,
    justifyContent: 'center',
    alignItems: 'center',
    ...shadow.sm,
  },

  // Stepper
  stepperContainer: {
    marginVertical: 16,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  stepDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  stepDotActive: {
    backgroundColor: Colors.primary,
  },
  stepDotIcon: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  stepLine: {
    width: 2,
    height: 32,
    backgroundColor: Colors.border,
    marginRight: 15,
    marginTop: -16,
    marginBottom: -16,
  },
  stepLineActive: {
    backgroundColor: Colors.primary,
  },
  stepText: {
    flex: 1,
    fontSize: 13,
    color: Colors.textHint,
    marginTop: 8,
  },
  stepTextActive: {
    color: Colors.textPrimary,
    fontWeight: '600',
  },

  // Action Button
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    borderRadius: borderRadius.lg,
    marginTop: 8,
    ...shadow.md,
  },
  actionBtnDisabled: {
    opacity: 0.6,
  },
  actionBtnText: {
    color: Colors.white,
    fontWeight: '700',
    marginRight: 8,
    fontSize: 15,
  },

  // Confirmation Modal
  confirmOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: borderRadius.lg,
  },
  confirmDialog: {
    backgroundColor: Colors.white,
    borderRadius: borderRadius.xl,
    padding: 24,
    width: '80%',
    ...shadow.xl,
  },
  confirmTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 8,
  },
  confirmMessage: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 20,
  },
  confirmButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  confirmBtnCancel: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: borderRadius.lg,
    backgroundColor: Colors.border,
    alignItems: 'center',
  },
  confirmBtnCancelText: {
    color: Colors.textPrimary,
    fontWeight: '600',
  },
  confirmBtnConfirm: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: borderRadius.lg,
    backgroundColor: Colors.primary,
    alignItems: 'center',
  },
  confirmBtnConfirmText: {
    color: Colors.white,
    fontWeight: '700',
  },

  // Success Screen
  successScreen: {
    flex: 1,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  earningsCard: {
    width: '85%',
    backgroundColor: Colors.white,
    borderRadius: borderRadius.xl,
    padding: 24,
    alignItems: 'center',
    ...shadow.xl,
  },
  deliveredIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  deliveredTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.textPrimary,
    marginBottom: 8,
  },
  deliveredSub: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 20,
  },
  earningsBox: {
    width: '100%',
    backgroundColor: Colors.successLight,
    borderRadius: borderRadius.lg,
    padding: 16,
    alignItems: 'center',
    marginBottom: 20,
  },
  earningsLabel: {
    fontSize: 12,
    color: Colors.textHint,
    fontWeight: '600',
  },
  earningsValue: {
    fontSize: 32,
    fontWeight: '800',
    color: Colors.success,
    marginVertical: 4,
  },
  earningsDetail: {
    fontSize: 11,
    color: Colors.textSecondary,
  },
  doneBtn: {
    width: '100%',
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  doneBtnText: {
    color: Colors.white,
    fontWeight: '700',
    fontSize: 16,
  },
});
