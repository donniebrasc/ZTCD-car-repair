import React, { useState, useEffect, useCallback, useRef } from 'react';
import { MapPin, Navigation, X, Minimize2, Search, ArrowRight, Key } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { NavigationState } from '../types';
import { cn } from '../lib/utils';
import { GoogleMap, Marker, DirectionsRenderer, TrafficLayer } from '@react-google-maps/api';

interface FloatingMapProps {
  navigation: NavigationState;
  setNavigation: (nav: NavigationState) => void;
  mapsApiKey: string;
  isMapsLoaded: boolean;
}

const mapContainerStyle = {
  width: '100%',
  height: '100%'
};

const darkMapStyles = [
  { elementType: "geometry", stylers: [{ color: "#242f3e" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#242f3e" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] },
  {
    featureType: "administrative.locality",
    elementType: "labels.text.fill",
    stylers: [{ color: "#d59563" }],
  },
  {
    featureType: "poi",
    elementType: "labels.text.fill",
    stylers: [{ color: "#d59563" }],
  },
  {
    featureType: "poi.park",
    elementType: "geometry",
    stylers: [{ color: "#263c3f" }],
  },
  {
    featureType: "poi.park",
    elementType: "labels.text.fill",
    stylers: [{ color: "#6b9a76" }],
  },
  {
    featureType: "road",
    elementType: "geometry",
    stylers: [{ color: "#38414e" }],
  },
  {
    featureType: "road",
    elementType: "geometry.stroke",
    stylers: [{ color: "#212a37" }],
  },
  {
    featureType: "road",
    elementType: "labels.text.fill",
    stylers: [{ color: "#9ca5b3" }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry",
    stylers: [{ color: "#746855" }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry.stroke",
    stylers: [{ color: "#1f2835" }],
  },
  {
    featureType: "road.highway",
    elementType: "labels.text.fill",
    stylers: [{ color: "#f3d19c" }],
  },
  {
    featureType: "transit",
    elementType: "geometry",
    stylers: [{ color: "#2f3948" }],
  },
  {
    featureType: "transit.station",
    elementType: "labels.text.fill",
    stylers: [{ color: "#d59563" }],
  },
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#17263c" }],
  },
  {
    featureType: "water",
    elementType: "labels.text.fill",
    stylers: [{ color: "#515c6d" }],
  },
  {
    featureType: "water",
    elementType: "labels.text.stroke",
    stylers: [{ color: "#17263c" }],
  },
];

const libraries: ("places" | "routes" | "geocoding" | "core")[] = ["places", "routes", "geocoding", "core"];

export default function FloatingMap({ navigation, setNavigation, mapsApiKey, isMapsLoaded }: FloatingMapProps) {
  const [isMinimized, setIsMinimized] = useState(false);
  const [isMini, setIsMini] = useState(false);
  const [size, setSize] = useState({ width: 320, height: 384 }); // Default 80x96 (w-80 h-96)
  const [fromInput, setFromInput] = useState(navigation.from);
  const [toInput, setToInput] = useState(navigation.to);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [directions, setDirections] = useState<google.maps.DirectionsResult | null>(null);
  const [eta, setEta] = useState<string | null>(null);
  const [distance, setDistance] = useState<string | null>(null);

  const resizeRef = useRef<HTMLDivElement>(null);

  const handleResize = useCallback((e: MouseEvent | TouchEvent) => {
    if (!resizeRef.current) return;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    
    const rect = resizeRef.current.getBoundingClientRect();
    const newWidth = Math.max(200, window.innerWidth - clientX - 16); // 16px margin
    const newHeight = Math.max(150, window.innerHeight - clientY - 96); // 96px bottom offset
    
    setSize({ width: newWidth, height: newHeight });
  }, []);

  const stopResize = useCallback(() => {
    window.removeEventListener('mousemove', handleResize);
    window.removeEventListener('mouseup', stopResize);
    window.removeEventListener('touchmove', handleResize);
    window.removeEventListener('touchend', stopResize);
  }, [handleResize]);

  const startResize = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    window.addEventListener('mousemove', handleResize);
    window.addEventListener('mouseup', stopResize);
    window.addEventListener('touchmove', handleResize);
    window.addEventListener('touchend', stopResize);
  }, [handleResize, stopResize]);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        (err) => console.error("Geolocation failed:", err)
      );
    }
  }, []);

  useEffect(() => {
    if (!isMapsLoaded || !navigation.from || !navigation.to) return;

    const fetchDirections = () => {
      const directionsService = new google.maps.DirectionsService();
      
      // Handle "Current Location" by using the actual location state if available
      let origin: string | google.maps.LatLngLiteral = navigation.from;
      if (navigation.from.toLowerCase() === 'current location' && location) {
        origin = location;
      } else if (navigation.from.toLowerCase() === 'current location' && !location) {
        // If location is not yet available, we can't route from current location
        return;
      }

      directionsService.route(
        {
          origin: origin,
          destination: navigation.to,
          waypoints: navigation.waypoints?.map(wp => ({
            location: new google.maps.LatLng(wp.lat, wp.lng),
            stopover: true
          })),
          travelMode: google.maps.TravelMode.DRIVING,
          drivingOptions: {
            departureTime: new Date(), // Required to get traffic information
            trafficModel: google.maps.TrafficModel.BEST_GUESS
          }
        },
        (result, status) => {
          if (status === google.maps.DirectionsStatus.OK && result) {
            setDirections(result);
            const route = result.routes[0].legs[0];
            // Use duration_in_traffic if available, otherwise fallback to standard duration
            setEta(route.duration_in_traffic?.text || route.duration?.text || null);
            setDistance(route.distance?.text || null);
          } else {
            console.error(`Error fetching directions: ${status}`, result);
            // Clear directions if there's an error so we don't show stale data
            setDirections(null);
            setEta(null);
            setDistance(null);
          }
        }
      );
    };

    // Initial fetch
    fetchDirections();

    // Re-fetch every 2 minutes (120000 ms) to get updated traffic and ETAs
    const intervalId = setInterval(fetchDirections, 120000);

    return () => clearInterval(intervalId);
  }, [isMapsLoaded, navigation.from, navigation.to, navigation.waypoints, location]);

  if (!navigation.isActive) return null;

  const handleStart = () => {
    setNavigation({ ...navigation, from: fromInput, to: toInput });
  };

  return (
    <motion.div
      ref={resizeRef}
      drag
      dragMomentum={false}
      initial={{ opacity: 0, scale: 0.9, y: 20 }}
      animate={{ 
        opacity: 1, 
        scale: 1, 
        y: 0,
        width: isMinimized ? 64 : (isMini ? 160 : size.width),
        height: isMinimized ? 64 : (isMini ? 160 : size.height),
      }}
      className={cn(
        "fixed bottom-24 right-4 z-50 glass-card rounded-2xl overflow-hidden border border-car-accent/30 shadow-2xl transition-all duration-300",
        isMinimized && "rounded-full"
      )}
    >
      {isMinimized ? (
        <button
          onClick={() => setIsMinimized(false)}
          className="w-full h-full flex items-center justify-center text-car-accent hover:bg-white/5 transition-colors"
        >
          <Navigation size={24} className="animate-pulse" />
        </button>
      ) : (
        <div className="flex flex-col h-full relative">
          {/* Resize Handle (Top-Left) */}
          {!isMini && (
            <div 
              onMouseDown={startResize}
              onTouchStart={startResize}
              className="absolute top-0 left-0 w-6 h-6 cursor-nw-resize z-[60] flex items-center justify-center group"
            >
              <div className="w-1.5 h-1.5 bg-white/20 rounded-full group-hover:bg-car-accent transition-colors" />
            </div>
          )}

          {/* Header */}
          <div className="p-3 bg-car-accent/10 flex items-center justify-between border-b border-white/5 shrink-0">
            <div className="flex items-center gap-2 overflow-hidden">
              <Navigation size={14} className="text-car-accent shrink-0" />
              {!isMini && <span className="text-[10px] font-bold uppercase tracking-widest text-white/80 truncate">Live Navigation</span>}
            </div>
            <div className="flex items-center gap-1">
              <button 
                onClick={() => setIsMini(!isMini)} 
                className="p-1 hover:bg-white/10 rounded-lg text-white/40"
                title={isMini ? "Expand" : "Mini View"}
              >
                <Minimize2 size={12} className={cn(isMini && "rotate-180")} />
              </button>
              {!isMini && (
                <button onClick={() => setIsMinimized(true)} className="p-1 hover:bg-white/10 rounded-lg text-white/40">
                  <div className="w-3 h-0.5 bg-current rounded-full" />
                </button>
              )}
              <button onClick={() => setNavigation({ ...navigation, isActive: false })} className="p-1 hover:bg-white/10 rounded-lg text-white/40">
                <X size={12} />
              </button>
            </div>
          </div>

          {/* Inputs - Hidden in Mini Mode */}
          {!isMini && (
            <div className="p-3 space-y-2 bg-black/20 shrink-0">
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-car-success" />
                <input
                  type="text"
                  value={fromInput}
                  onChange={(e) => setFromInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && setNavigation({ ...navigation, from: fromInput })}
                  placeholder="From..."
                  className="w-full bg-white/5 border border-white/10 rounded-xl py-1.5 pl-8 pr-4 text-[10px] text-white placeholder:text-white/20 focus:outline-none focus:border-car-accent/50"
                />
              </div>
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-car-danger" />
                <input
                  type="text"
                  value={toInput}
                  onChange={(e) => setToInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && setNavigation({ ...navigation, to: toInput })}
                  placeholder="To..."
                  className="w-full bg-white/5 border border-white/10 rounded-xl py-1.5 pl-8 pr-4 text-[10px] text-white placeholder:text-white/20 focus:outline-none focus:border-car-accent/50"
                />
              </div>
            </div>
          )}

          {/* Map View */}
          <div className="flex-1 relative bg-[#151619] overflow-hidden">
            {isMapsLoaded && mapsApiKey ? (
              <GoogleMap
                mapContainerStyle={mapContainerStyle}
                center={location || { lat: 37.7749, lng: -122.4194 }}
                zoom={isMini ? 13 : 15}
                options={{
                  styles: darkMapStyles,
                  disableDefaultUI: true,
                }}
                onClick={(e) => {
                  if (e.latLng) {
                    const lat = e.latLng.lat();
                    const lng = e.latLng.lng();
                    const geocoder = new google.maps.Geocoder();
                    geocoder.geocode({ location: { lat, lng } }, (results, status) => {
                      let destination = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
                      if (status === 'OK' && results && results[0]) {
                        destination = results[0].formatted_address;
                      }
                      
                      if (!navigation.to) {
                        setToInput(destination);
                        setNavigation({ ...navigation, to: destination, waypoints: [] });
                      } else {
                        const currentWaypoints = navigation.waypoints || [];
                        setNavigation({ 
                          ...navigation, 
                          waypoints: [...currentWaypoints, { lat, lng }]
                        });
                      }
                    });
                  }
                }}
              >
                <TrafficLayer />
                {location && <Marker position={location} />}
                {directions && <DirectionsRenderer directions={directions} options={{ suppressMarkers: false }} />}
              </GoogleMap>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center">
                {!mapsApiKey ? (
                  <Key className="text-car-warning" size={16} />
                ) : (
                  <Navigation className="text-car-accent animate-pulse" size={16} />
                )}
              </div>
            )}

            {(eta || distance) && !isMini && (
              <div className="absolute bottom-3 left-3 right-3 p-2 glass-card rounded-xl border border-white/5 flex items-center justify-between">
                <div>
                  <p className="text-[7px] uppercase tracking-widest text-white/40">ETA</p>
                  <p className="text-[10px] font-bold text-white">{eta || '--'}</p>
                </div>
                <div className="text-right">
                  <p className="text-[7px] uppercase tracking-widest text-white/40">Dist</p>
                  <p className="text-[10px] font-bold text-car-accent">{distance || '--'}</p>
                </div>
              </div>
            )}

            {isMini && (eta || distance) && (
              <div className="absolute bottom-2 left-2 right-2 px-2 py-1 bg-black/60 backdrop-blur-sm rounded-lg flex justify-between items-center">
                <span className="text-[8px] font-bold text-white">{eta}</span>
                <span className="text-[8px] font-bold text-car-accent">{distance}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </motion.div>
  );
}
