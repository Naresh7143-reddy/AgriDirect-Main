// FILE: src/screens/buyer/OrderTrackingScreen.tsx
import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Animated,
  Dimensions,
  Linking,
  PanResponder,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ActivityIndicator,
} from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import Icon from 'react-native-vector-icons/Ionicons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Colors } from '../../theme/colors';
import { shadow, borderRadius } from '../../theme/spacing';
import { ordersApi } from '../../api/orders';
import type { Order } from '../../types/order';
import type { BuyerStackParamList } from '../../navigation/types';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const SNAP_POINTS = [
  SCREEN_HEIGHT * 0.75, // collapsed (25% of screen from bottom)
  SCREEN_HEIGHT * 0.45, // default (55% from bottom)
  SCREEN_HEIGHT * 0.10, // expanded (90% from bottom)
];

const STATUS_STEPS = [
  { key: 'PENDING', label: 'Order Placed', icon: '📋' },
  { key: 'ACCEPTED', label: 'Farmer Accepted', icon: '✅' },
  { key: 'PACKED', label: 'Packed & Ready', icon: '📦' },
  { key: 'PICKED_UP', label: 'Picked Up', icon: '🏍️' },
  { key: 'IN_TRANSIT', label: 'In Transit', icon: '🚚' },
  { key: 'DELIVERED', label: 'Delivered', icon: '🎉' },
];

function getStepIndex(status: string): number {
  return STATUS_STEPS.findIndex((s) => s.key === status);
}

function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// Haversine distance
function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

interface AgentInfo {
  lat: number;
  lng: number;
  agentName?: string;
  agentPhone?: string;
  vehicleType?: string;
  vehicleRegistration?: string;
  rating?: number;
  totalDeliveries?: number;
  status?: string;
}

const VEHICLE_ICONS: Record<string, string> = {
  BIKE: '🏍️',
  BICYCLE: '🚲',
  AUTO: '🛺',
  VAN: '🚐',
  SCOOTER: '🛵',
};

export const OrderTrackingScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<BuyerStackParamList>>();
  const route = useRoute<RouteProp<BuyerStackParamList, 'OrderTracking'>>();
  const { orderId } = route.params;

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [agent, setAgent] = useState<AgentInfo | null>(null);
  const [countdown, setCountdown] = useState(15 * 60); // 15 min ETA
  const mapRef = useRef<MapView>(null);

  const sheetY = useRef(new Animated.Value(SNAP_POINTS[1])).current;
  const lastY = useRef(SNAP_POINTS[1]);

  // Countdown timer
  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Load order details
  useEffect(() => {
    ordersApi.getOrderById(orderId).then((r: any) => {
      setOrder(r.data);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [orderId]);

  // Poll agent location every 5 seconds
  useEffect(() => {
    const fetchAgentLocation = () => {
      ordersApi.getAgentLocation(orderId).then((r: any) => {
        const data = r.data;
        if (data?.available) {
          setAgent({
            lat: data.lat,
            lng: data.lng,
            agentName: data.agentName,
            agentPhone: data.agentPhone,
            vehicleType: data.vehicleType,
            vehicleRegistration: data.vehicleRegistration,
            rating: data.rating,
            totalDeliveries: data.totalDeliveries,
            status: data.status,
          });

          // Update order status from agent location response
          if (data.status && order) {
            setOrder(prev => prev ? { ...prev, status: data.status } : prev);
          }
        }
      }).catch(() => {});
    };

    fetchAgentLocation(); // Initial fetch
    const interval = setInterval(fetchAgentLocation, 5000);
    return () => clearInterval(interval);
  }, [orderId, order?.status]);

  // Fit map to show both markers when agent location changes
  useEffect(() => {
    if (agent && order && mapRef.current) {
      const deliveryAddr = order.deliveryAddress;
      const buyerLat = typeof deliveryAddr === 'object' ? deliveryAddr.lat : undefined;
      const buyerLng = typeof deliveryAddr === 'object' ? deliveryAddr.lng : undefined;

      if (buyerLat && buyerLng) {
        mapRef.current.fitToCoordinates(
          [
            { latitude: agent.lat, longitude: agent.lng },
            { latitude: buyerLat, longitude: buyerLng },
          ],
          { edgePadding: { top: 100, right: 60, bottom: SCREEN_HEIGHT * 0.5, left: 60 }, animated: true },
        );
      }
    }
  }, [agent?.lat, agent?.lng]);

  const snapToPoint = (gestureY: number) => {
    const closest = SNAP_POINTS.reduce((prev, curr) =>
      Math.abs(curr - gestureY) < Math.abs(prev - gestureY) ? curr : prev,
    );
    lastY.current = closest;
    Animated.spring(sheetY, { toValue: closest, useNativeDriver: false, tension: 60, friction: 12 }).start();
  };

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 5,
      onPanResponderMove: (_, g) => {
        const newY = lastY.current + g.dy;
        if (newY >= SNAP_POINTS[2] && newY <= SNAP_POINTS[0]) {
          sheetY.setValue(newY);
        }
      },
      onPanResponderRelease: (_, g) => {
        snapToPoint(lastY.current + g.dy);
      },
    }),
  ).current;

  const currentStepIndex = order ? getStepIndex(order.status) : 0;
  const deliveryAddr = order?.deliveryAddress;
  const buyerLat = typeof deliveryAddr === 'object' ? deliveryAddr?.lat : undefined;
  const buyerLng = typeof deliveryAddr === 'object' ? deliveryAddr?.lng : undefined;

  // Calculate distance from agent to buyer
  const distanceToMe = agent && buyerLat && buyerLng
    ? haversineDistance(agent.lat, agent.lng, buyerLat, buyerLng)
    : null;

  const callAgent = useCallback(() => {
    if (agent?.agentPhone) {
      Linking.openURL(`tel:${agent.agentPhone}`);
    }
  }, [agent?.agentPhone]);

  return (
    <View style={styles.container}>
      {/* Real Google Map */}
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={styles.map}
        initialRegion={{
          latitude: buyerLat ?? 17.432,
          longitude: buyerLng ?? 78.407,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }}
      >
        {/* Buyer's delivery address marker */}
        {buyerLat && buyerLng && (
          <Marker
            coordinate={{ latitude: buyerLat, longitude: buyerLng }}
            title="Your Location"
          >
            <View style={styles.buyerMarker}>
              <View style={styles.buyerMarkerBubble}>
                <Text style={styles.markerEmoji}>🏠</Text>
              </View>
              <View style={styles.buyerMarkerArrow} />
            </View>
          </Marker>
        )}

        {/* Delivery agent's live location */}
        {agent && agent.lat !== 0 && agent.lng !== 0 && (
          <Marker
            coordinate={{ latitude: agent.lat, longitude: agent.lng }}
            title={agent.agentName || 'Delivery Partner'}
            description={agent.vehicleType || 'On the way'}
          >
            <View style={styles.agentMarker}>
              <View style={styles.agentMarkerBubble}>
                <Text style={styles.agentMarkerEmoji}>
                  {VEHICLE_ICONS[agent.vehicleType || 'BIKE'] || '🏍️'}
                </Text>
              </View>
              <View style={styles.agentMarkerArrow} />
            </View>
          </Marker>
        )}

        {/* Route polyline from agent to buyer */}
        {agent && agent.lat !== 0 && buyerLat && buyerLng && (
          <Polyline
            coordinates={[
              { latitude: agent.lat, longitude: agent.lng },
              { latitude: buyerLat, longitude: buyerLng },
            ]}
            strokeColor={Colors.primary}
            strokeWidth={4}
            lineDashPattern={[1]}
          />
        )}
      </MapView>

      {/* Back button overlay */}
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
        <Icon name="arrow-back" size={22} color={Colors.textPrimary} />
      </TouchableOpacity>

      {/* Bottom Sheet */}
      <Animated.View style={[styles.sheet, { top: sheetY }]} {...panResponder.panHandlers}>
        <View style={styles.sheetHandle} />

        {loading ? (
          <ActivityIndicator color={Colors.primary} style={{ marginTop: 20 }} />
        ) : !order ? (
          <Text style={styles.errorText}>Order not found</Text>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} scrollEnabled={false}>
            {/* Agent Info Card — Swiggy/Zomato style */}
            {agent ? (
              <View style={styles.agentCard}>
                <View style={styles.agentCardLeft}>
                  <View style={styles.agentAvatar}>
                    <Text style={styles.agentAvatarText}>
                      {VEHICLE_ICONS[agent.vehicleType || 'BIKE'] || '🏍️'}
                    </Text>
                  </View>
                  <View style={styles.agentDetails}>
                    <Text style={styles.agentName}>{agent.agentName || 'Delivery Partner'}</Text>
                    <View style={styles.agentMeta}>
                      <View style={styles.ratingBadge}>
                        <Icon name="star" size={11} color={Colors.secondary} />
                        <Text style={styles.ratingText}>{(agent.rating ?? 4.5).toFixed(1)}</Text>
                      </View>
                      <Text style={styles.agentMetaText}>
                        {agent.totalDeliveries ?? 0} deliveries
                      </Text>
                    </View>
                    <Text style={styles.vehicleInfo}>
                      {agent.vehicleType || 'Bike'} • {agent.vehicleRegistration || ''}
                    </Text>
                  </View>
                </View>
                <View style={styles.agentCardRight}>
                  {/* Call button */}
                  <TouchableOpacity style={styles.callBtn} onPress={callAgent}>
                    <Icon name="call" size={20} color={Colors.white} />
                  </TouchableOpacity>
                  {/* ETA */}
                  <View style={styles.etaBox}>
                    <Text style={styles.etaLabel}>ETA</Text>
                    <Text style={styles.etaTime}>{formatCountdown(countdown)}</Text>
                  </View>
                </View>
              </View>
            ) : (
              <View style={styles.topRow}>
                <View style={styles.agentInfoFallback}>
                  <View style={styles.agentAvatarFallback}>
                    <Text style={styles.agentAvatarText}>🧑</Text>
                  </View>
                  <View>
                    <Text style={styles.agentName}>Waiting for agent...</Text>
                    <Text style={styles.agentSub}>Agent will be assigned soon</Text>
                  </View>
                </View>
                <View style={styles.etaBox}>
                  <Text style={styles.etaLabel}>ETA</Text>
                  <Text style={styles.etaTime}>{formatCountdown(countdown)}</Text>
                </View>
              </View>
            )}

            {/* Live distance info */}
            {distanceToMe !== null && (
              <View style={styles.distanceBanner}>
                <Icon name="bicycle-outline" size={16} color={Colors.primary} />
                <Text style={styles.distanceBannerText}>
                  {distanceToMe < 1
                    ? `${Math.round(distanceToMe * 1000)}m away`
                    : `${distanceToMe.toFixed(1)} km away`
                  }
                </Text>
                <View style={styles.liveIndicator}>
                  <View style={styles.liveDot} />
                  <Text style={styles.liveText}>LIVE</Text>
                </View>
              </View>
            )}

            {/* Status Stepper */}
            <View style={styles.stepperContainer}>
              <Text style={styles.sectionTitle}>Order Status</Text>
              {STATUS_STEPS.map((step, index) => {
                const isDone = index <= currentStepIndex;
                const active = index === currentStepIndex;
                return (
                  <View key={step.key} style={styles.stepRow}>
                    <View style={{ alignItems: 'center', marginRight: 14 }}>
                      <View style={[styles.stepCircle, isDone && styles.stepCircleDone, active && styles.stepCircleActive]}>
                        <Text style={[styles.stepIcon, isDone && { color: Colors.white }]}>
                          {isDone ? '✓' : step.icon}
                        </Text>
                      </View>
                      {index < STATUS_STEPS.length - 1 && (
                        <View style={[styles.stepLine, isDone && styles.stepLineDone]} />
                      )}
                    </View>
                    <View style={styles.stepContent}>
                      <Text style={[styles.stepLabel, isDone && styles.stepLabelDone]}>{step.label}</Text>
                    </View>
                  </View>
                );
              })}
            </View>

            {/* Expanded: items + address */}
            <View style={styles.orderItemsSection}>
              <Text style={styles.sectionTitle}>Items</Text>
              {order.items?.map((item: any) => (
                <View key={item.id} style={styles.orderItemRow}>
                  <Text style={styles.orderItemName} numberOfLines={1}>{item.productName}</Text>
                  <Text style={styles.orderItemQty}>x{item.quantity} {item.unit}</Text>
                  <Text style={styles.orderItemTotal}>₹{item.total?.toFixed(0) || (item.pricePerUnit * item.quantity).toFixed(0)}</Text>
                </View>
              ))}
            </View>

            {typeof deliveryAddr === 'object' && deliveryAddr && (
              <View style={styles.addressSection}>
                <Text style={styles.sectionTitle}>Delivering to</Text>
                <Text style={styles.addressText}>
                  {deliveryAddr.line1}{deliveryAddr.line2 ? `, ${deliveryAddr.line2}` : ''}
                </Text>
                <Text style={styles.addressText}>
                  {deliveryAddr.city}, {deliveryAddr.state}
                </Text>
              </View>
            )}
          </ScrollView>
        )}
      </Animated.View>
    </View>
  );
};

export default OrderTrackingScreen;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  map: { flex: 1 },

  // Buyer marker
  buyerMarker: { alignItems: 'center' },
  buyerMarkerBubble: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center', ...shadow.md },
  markerEmoji: { fontSize: 20 },
  buyerMarkerArrow: { width: 0, height: 0, borderLeftWidth: 8, borderRightWidth: 8, borderTopWidth: 10, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: Colors.primary, marginTop: -2 },

  // Agent marker
  agentMarker: { alignItems: 'center' },
  agentMarkerBubble: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.secondary, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: Colors.white, ...shadow.lg },
  agentMarkerEmoji: { fontSize: 22 },
  agentMarkerArrow: { width: 0, height: 0, borderLeftWidth: 8, borderRightWidth: 8, borderTopWidth: 10, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: Colors.secondary, marginTop: -2 },

  // Back button
  backBtn: { position: 'absolute', top: 50, left: 16, backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: borderRadius.full, width: 44, height: 44, alignItems: 'center', justifyContent: 'center', ...shadow.md, zIndex: 10 },

  // Bottom sheet
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: Colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, ...shadow.xl },
  sheetHandle: { width: 40, height: 4, backgroundColor: Colors.border, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  errorText: { color: Colors.error, textAlign: 'center', marginTop: 20 },

  // Agent card — Swiggy/Zomato style
  agentCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, backgroundColor: Colors.background, borderRadius: borderRadius.lg, padding: 14 },
  agentCardLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 12 },
  agentAvatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: Colors.successLight, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: Colors.primary },
  agentAvatarText: { fontSize: 24 },
  agentDetails: { flex: 1 },
  agentName: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  agentMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 },
  ratingBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: Colors.successLight, borderRadius: borderRadius.full, paddingHorizontal: 6, paddingVertical: 2 },
  ratingText: { fontSize: 11, fontWeight: '700', color: Colors.primary },
  agentMetaText: { fontSize: 11, color: Colors.textHint },
  vehicleInfo: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  agentCardRight: { alignItems: 'center', gap: 8 },
  callBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.success, alignItems: 'center', justifyContent: 'center', ...shadow.sm },

  // Fallback agent info
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  agentInfoFallback: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  agentAvatarFallback: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  agentSub: { fontSize: 12, color: Colors.textHint },

  // ETA box
  etaBox: { alignItems: 'center', backgroundColor: Colors.successLight, borderRadius: borderRadius.md, paddingHorizontal: 14, paddingVertical: 8 },
  etaLabel: { fontSize: 10, color: Colors.textHint, fontWeight: '600' },
  etaTime: { fontSize: 20, fontWeight: '800', color: Colors.primary },

  // Distance banner
  distanceBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.infoLight, borderRadius: borderRadius.md, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 16 },
  distanceBannerText: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary, flex: 1 },
  liveIndicator: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.success },
  liveText: { fontSize: 10, fontWeight: '800', color: Colors.success, letterSpacing: 1 },

  // Stepper
  sectionTitle: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary, marginBottom: 12 },
  stepperContainer: { marginBottom: 16 },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 0 },
  stepCircle: { width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  stepCircleDone: { backgroundColor: Colors.successLight },
  stepCircleActive: { backgroundColor: Colors.primary },
  stepIcon: { fontSize: 12, color: Colors.textPrimary },
  stepLine: { width: 2, height: 24, backgroundColor: Colors.border, marginTop: 2 },
  stepLineDone: { backgroundColor: Colors.primary },
  stepContent: { flex: 1, paddingTop: 4, paddingBottom: 20 },
  stepLabel: { fontSize: 13, color: Colors.textHint },
  stepLabelDone: { color: Colors.textPrimary, fontWeight: '600' },

  // Order items
  orderItemsSection: { marginBottom: 12 },
  orderItemRow: { flexDirection: 'row', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  orderItemName: { flex: 1, fontSize: 13, color: Colors.textSecondary },
  orderItemQty: { fontSize: 13, color: Colors.textHint, marginHorizontal: 8 },
  orderItemTotal: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary },
  addressSection: { marginBottom: 32 },
  addressText: { fontSize: 13, color: Colors.textSecondary, lineHeight: 20 },
});
