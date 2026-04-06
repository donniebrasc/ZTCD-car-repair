/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { Activity, Gauge, Map as MapIcon, History, Play, Square, BrainCircuit, AlertTriangle, ChevronRight, Settings, X, Key, Wrench, Shield, Eye, EyeOff, Trash2 } from 'lucide-react';
import { useJsApiLoader } from '@react-google-maps/api';
import { motion, AnimatePresence } from 'motion/react';
import { OBDData, Trip, DamagePoint, TripEvent, SensorPoint, NavigationState } from './types';
import { cn } from './lib/utils';
import OBDTab from './components/OBDTab';
import DamageLogTab from './components/DamageLogTab';
import GPSTab from './components/GPSTab';
import FloatingMap from './components/FloatingMap';
import ChatAssistant, { ChatAssistantHandle } from './components/ChatAssistant';
import MusicPlayer, { MusicPlayerHandle } from './components/MusicPlayer';
import MaintenanceTab from './components/MaintenanceTab';
import { runAIDiagnosis } from './services/geminiService';
import { MaintenanceTask } from './types';

const DEFAULT_MAPS_KEY = "";
const libraries: ("places" | "routes" | "geocoding" | "core")[] = ["places", "routes", "geocoding", "core"];

export default function App() {
  const musicPlayerRef = useRef<MusicPlayerHandle>(null);
  const chatAssistantRef = useRef<ChatAssistantHandle>(null);
  const [activeTab, setActiveTab] = useState<'obd' | 'damage' | 'gps' | 'maintenance'>('obd');
  const [obdData, setObdData] = useState<OBDData>({
    rpm: 0,
    speed: 0,
    coolantTemp: 90,
    throttlePos: 0,
    load: 0,
    voltage: 14.2,
    dtcs: [],
    readiness: {
      misfire: true,
      fuelSystem: true,
      components: true,
      catalyst: true,
      evap: true,
      oxygenSensor: true,
    },
    timestamp: Date.now(),
  });
  const [navigation, setNavigation] = useState<NavigationState>({
    from: '',
    to: '',
    isActive: false,
  });
  const [damageScore, setDamageScore] = useState(0);
  const [damageHistory, setDamageHistory] = useState<DamagePoint[]>([]);
  const [trips, setTrips] = useState<Trip[]>(() => {
    const saved = localStorage.getItem('ztcd_trips');
    return saved ? JSON.parse(saved) : [];
  });
  const [isRecording, setIsRecording] = useState(false);
  const [currentTrip, setCurrentTrip] = useState<Partial<Trip> | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showApiKeys, setShowApiKeys] = useState(false);
  const [sensorHistory, setSensorHistory] = useState<SensorPoint[]>([]);
  const [apiKeys, setApiKeys] = useState({
    gemini: localStorage.getItem('ztcd_gemini_api_key') || process.env.GEMINI_API_KEY || '',
    maps: localStorage.getItem('ztcd_maps_api_key') || import.meta.env.VITE_MAPS_API_KEY || DEFAULT_MAPS_KEY,
  });

  const { isLoaded: isMapsLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: apiKeys.maps,
    libraries
  });
  const [isSimulation, setIsSimulation] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [connectedDeviceName, setConnectedDeviceName] = useState<string | null>(null);
  const [bluetoothDevice, setBluetoothDevice] = useState<BluetoothDevice | null>(null);
  const [obdCharacteristic, setObdCharacteristic] = useState<BluetoothRemoteGATTCharacteristic | null>(null);
  const [totalMileage, setTotalMileage] = useState(() => {
    const saved = localStorage.getItem('ztcd_mileage');
    return saved ? Number(saved) : 45200; // Starting mileage
  });
  const [maintenanceTasks, setMaintenanceTasks] = useState<MaintenanceTask[]>(() => {
    const saved = localStorage.getItem('ztcd_maintenance');
    return saved ? JSON.parse(saved) : [
      {
        id: '1',
        name: 'Synthetic Oil Change',
        type: 'oil_change',
        intervalMiles: 5000,
        intervalMonths: 6,
        lastCompletedMiles: 40000,
        lastCompletedDate: Date.now() - 1000 * 60 * 60 * 24 * 150, // 5 months ago
      },
      {
        id: '2',
        name: 'Tire Rotation',
        type: 'tire_rotation',
        intervalMiles: 6000,
        intervalMonths: 6,
        lastCompletedMiles: 42000,
        lastCompletedDate: Date.now() - 1000 * 60 * 60 * 24 * 60, // 2 months ago
      }
    ];
  });

  // Simulation logic
  useEffect(() => {
    if (!isSimulation) {
      setConnectionStatus('connected');
      return;
    }
    setConnectionStatus('disconnected');
    
    const interval = setInterval(() => {
      setObdData(prev => {
        // Random walk for simulation
        const targetRpm = isRecording ? 2000 + Math.random() * 1000 : 800 + Math.random() * 50;
        const targetSpeed = isRecording ? 40 + Math.random() * 20 : 0;
        
        return {
          rpm: Math.round(prev.rpm + (targetRpm - prev.rpm) * 0.1),
          speed: Math.round(prev.speed + (targetSpeed - prev.speed) * 0.1),
          coolantTemp: 90 + Math.sin(Date.now() / 10000) * 2,
          throttlePos: isRecording ? 15 + Math.random() * 10 : 0,
          load: isRecording ? 20 + Math.random() * 15 : 5,
          voltage: 14.1 + Math.random() * 0.2,
          dtcs: isRecording && Math.random() > 0.95 ? ['P0300', 'P0171'] : prev.dtcs,
          readiness: prev.readiness,
          timestamp: Date.now(),
        };
      });

      // Sensor simulation (Accel & Gyro) - Toned down
      const accel = isRecording ? 0.2 + Math.random() * 0.8 : 0.05 + Math.random() * 0.1;
      const gyro = isRecording ? 5 + Math.random() * 20 : 0.5 + Math.random() * 2;

      setSensorHistory(prev => {
        const newHistory = [...prev, { accel, gyro, timestamp: Date.now() }];
        return newHistory.slice(-60);
      });

      // Damage score simulation based on "driving behavior" - Toned down
      setDamageScore(prev => {
        let delta = (Math.random() - 0.5) * 0.5; // Smaller random fluctuations
        if (isRecording && (accel > 1.2 || gyro > 35)) delta += 5; // Less frequent and smaller "Harsh event"
        const next = Math.max(0, Math.min(100, prev + delta));
        
        setDamageHistory(history => {
          const newHistory = [...history, { score: next, timestamp: Date.now() }];
          return newHistory.slice(-60);
        });

        if (isRecording) {
          setCurrentTrip(trip => {
            if (!trip) return trip;
            
            let newEvents = trip.events || [];
            
            // Occasionally simulate an event if damage is high
            if (next > 40 && Math.random() > 0.7) {
              const eventType = next > 70 ? 'harsh_braking' : 'rapid_acceleration';
              const lastWaypoint = trip.waypoints?.[trip.waypoints.length - 1];
              newEvents = [...newEvents, {
                type: eventType as any,
                severity: next,
                timestamp: Date.now(),
                location: lastWaypoint ? { lat: lastWaypoint.lat, lng: lastWaypoint.lng } : undefined
              }];
            }

            return {
              ...trip,
              damageHistory: [...(trip.damageHistory || []), { score: next, timestamp: Date.now() }],
              events: newEvents,
            };
          });
        }

        return next;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isRecording]);

  // Real GPS Tracking
  useEffect(() => {
    let watchId: number;

    if (isRecording && navigator.geolocation) {
      watchId = navigator.geolocation.watchPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          
          setCurrentTrip(trip => {
            if (!trip) return trip;
            
            const newLoc = { lat: latitude, lng: longitude, timestamp: Date.now() };
            const newWaypoints = [...(trip.waypoints || []), newLoc];
            
            // Calculate distance if there's a previous waypoint
            let addedDistance = 0;
            if (trip.waypoints && trip.waypoints.length > 0) {
              const lastLoc = trip.waypoints[trip.waypoints.length - 1];
              // Haversine formula
              const R = 3958.8; // Radius of the Earth in miles
              const rlat1 = lastLoc.lat * (Math.PI/180);
              const rlat2 = latitude * (Math.PI/180);
              const difflat = rlat2 - rlat1;
              const difflon = (longitude - lastLoc.lng) * (Math.PI/180);
              const d = 2 * R * Math.asin(Math.sqrt(Math.sin(difflat/2)*Math.sin(difflat/2)+Math.cos(rlat1)*Math.cos(rlat2)*Math.sin(difflon/2)*Math.sin(difflon/2)));
              addedDistance = d;
            }

            if (addedDistance > 0) {
              setTotalMileage(prev => prev + addedDistance);
            }

            return {
              ...trip,
              waypoints: newWaypoints,
              distance: (trip.distance || 0) + addedDistance
            };
          });
        },
        (error) => {
          console.error("GPS Tracking error:", error);
        },
        {
          enableHighAccuracy: true,
          maximumAge: 5000,
          timeout: 5000
        }
      );
    }

    return () => {
      if (watchId !== undefined && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, [isRecording]);

  useEffect(() => {
    localStorage.setItem('ztcd_trips', JSON.stringify(trips));
  }, [trips]);

  useEffect(() => {
    localStorage.setItem('ztcd_mileage', totalMileage.toString());
  }, [totalMileage]);

  useEffect(() => {
    localStorage.setItem('ztcd_maintenance', JSON.stringify(maintenanceTasks));
  }, [maintenanceTasks]);

  const startTrip = () => {
    setIsRecording(true);
    setCurrentTrip({
      id: Math.random().toString(36).substr(2, 9),
      startTime: Date.now(),
      waypoints: [],
      events: [],
      damageHistory: [],
      distance: 0,
    });
  };

  const stopTrip = () => {
    if (!currentTrip) return;
    
    const finishedTrip: Trip = {
      ...currentTrip as Trip,
      endTime: Date.now(),
      averageDamageScore: (currentTrip.damageHistory?.reduce((acc, p) => acc + p.score, 0) || 0) / (currentTrip.damageHistory?.length || 1),
    };

    setTrips(prev => [finishedTrip, ...prev]);
    setIsRecording(false);
    setCurrentTrip(null);
  };

  const tabs = [
    { id: 'obd', label: 'OBD Diagnosis', icon: Gauge },
    { id: 'damage', label: 'Damage Log', icon: Activity },
    { id: 'gps', label: 'GPS Routes', icon: MapIcon },
    { id: 'maintenance', label: 'Maintenance', icon: Wrench },
  ] as const;

  // Real OBD-II Connection Logic
  const connectToOBD = async (existingDevice?: BluetoothDevice) => {
    try {
      if (!navigator.bluetooth) {
        throw new Error("Bluetooth is not supported in this browser. Please use Chrome or Edge on a compatible device.");
      }

      let device = existingDevice;

      if (!device) {
        // Broaden discovery to avoid "User cancelled" due to device not appearing in filtered list
        device = await navigator.bluetooth.requestDevice({
          acceptAllDevices: true,
          optionalServices: [
            '0000fff0-0000-1000-8000-00805f9b34fb', 
            '0000ffe0-0000-1000-8000-00805f9b34fb',
            '000018f0-0000-1000-8000-00805f9b34fb' // Standard OBD-II service
          ]
        }).catch(err => {
          if (err.name === 'NotFoundError') {
            throw new Error("No device selected or found. Ensure your OBD-II adapter is powered on and in pairing mode.");
          }
          if (err.name === 'SecurityError') {
            throw new Error("Bluetooth permission denied. Please allow Bluetooth access in your browser settings (on Android, Chrome also requires Location permission). If you are viewing this in an iframe, please open the app in a new tab.");
          }
          throw err;
        });
      }

      setConnectionStatus('connecting');

      if (!device) {
        throw new Error("No device selected. Please try again.");
      }

      if (!device.gatt) {
        throw new Error("GATT server is unavailable on this device.");
      }

      const handleDisconnect = async () => {
        console.log("Bluetooth disconnected. Attempting to reconnect...");
        setConnectionStatus('connecting');
        try {
          // Attempt to reconnect after a short delay
          setTimeout(() => connectToOBD(device), 2000);
        } catch (e) {
          console.error("Auto-reconnect failed", e);
          setConnectionStatus('disconnected');
          setConnectedDeviceName(null);
        }
      };

      device.addEventListener('gattserverdisconnected', handleDisconnect);

      // Add a timeout to the connection attempt
      const connectPromise = device.gatt.connect();
      const timeoutPromise = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error("Connection timed out. Please move closer to the adapter and try again.")), 10000)
      );
      
      const server = await Promise.race([connectPromise, timeoutPromise]);
      const services = await server.getPrimaryServices();
      
      if (!services || services.length === 0) throw new Error("No compatible OBD-II services found on this device.");
      
      const service = services[0];
      const characteristics = await service.getCharacteristics();
      const characteristic = characteristics.find(c => c.properties.write || c.properties.notify);
      
      if (!characteristic) throw new Error("No suitable communication characteristic found. The adapter may not be fully compatible.");

      setBluetoothDevice(device);
      setConnectedDeviceName(device.name || 'Unknown Bluetooth OBD-II');
      setObdCharacteristic(characteristic);
      setIsSimulation(false);
      setConnectionStatus('connected');
      
      // Start polling loop
      startOBDPoll(characteristic);
    } catch (error) {
      setConnectionStatus('disconnected');
      setConnectedDeviceName(null);
      const message = error instanceof Error ? error.message : "An unexpected Bluetooth error occurred.";
      console.error("Bluetooth Error:", message);
      throw new Error(message);
    }
  };

  const parseOBDResponse = (buffer: string) => {
    const lines = buffer.split(/[\r\n]+/);
    lines.forEach(line => {
      const cleanLine = line.replace(/\s+/g, '').toUpperCase();
      
      // Parse RPM (010C -> 41 0C A B)
      if (cleanLine.includes('410C')) {
        const idx = cleanLine.indexOf('410C');
        const a = parseInt(cleanLine.substring(idx + 4, idx + 6), 16);
        const b = parseInt(cleanLine.substring(idx + 6, idx + 8), 16);
        if (!isNaN(a) && !isNaN(b)) {
          const rpm = ((a * 256) + b) / 4;
          setObdData(prev => ({ ...prev, rpm: Math.round(rpm), timestamp: Date.now() }));
        }
      }
      
      // Parse Speed (010D -> 41 0D A)
      if (cleanLine.includes('410D')) {
        const idx = cleanLine.indexOf('410D');
        const a = parseInt(cleanLine.substring(idx + 4, idx + 6), 16);
        if (!isNaN(a)) {
          setObdData(prev => ({ ...prev, speed: a, timestamp: Date.now() }));
        }
      }

      // Parse Coolant Temp (0105 -> 41 05 A)
      if (cleanLine.includes('4105')) {
        const idx = cleanLine.indexOf('4105');
        const a = parseInt(cleanLine.substring(idx + 4, idx + 6), 16);
        if (!isNaN(a)) {
          setObdData(prev => ({ ...prev, coolantTemp: a - 40, timestamp: Date.now() }));
        }
      }

      // Parse DTCs (03 -> 43 01 02 03 04 05 06)
      if (cleanLine.includes('43')) {
        const idx = cleanLine.indexOf('43');
        const codesData = cleanLine.substring(idx + 2);
        const codes: string[] = [];
        for (let i = 0; i < codesData.length - 3; i += 4) {
          const code = codesData.substring(i, i + 4);
          if (code !== '0000' && /^[0-9A-F]{4}$/.test(code)) {
            const prefix = ['P', 'C', 'B', 'U'][parseInt(code[0], 16) >> 2];
            if (prefix) {
              codes.push(prefix + code.substring(1));
            }
          }
        }
        if (codes.length > 0) {
          setObdData(prev => ({ ...prev, dtcs: codes, timestamp: Date.now() }));
        }
      }

      // Parse Readiness (0101 -> 41 01 A B C D)
      if (cleanLine.includes('4101')) {
        const idx = cleanLine.indexOf('4101');
        const b = parseInt(cleanLine.substring(idx + 6, idx + 8), 16);
        const c = parseInt(cleanLine.substring(idx + 8, idx + 10), 16);
        if (!isNaN(b) && !isNaN(c)) {
          setObdData(prev => ({
            ...prev,
            readiness: {
              misfire: !(b & 0x01),
              fuelSystem: !(b & 0x02),
              components: !(b & 0x04),
              catalyst: !(c & 0x01),
              evap: !(c & 0x04),
              oxygenSensor: !(c & 0x10),
            },
            timestamp: Date.now()
          }));
        }
      }
    });
  };

  const connectToSerialOBD = async (existingPort?: any) => {
    try {
      if (!('serial' in navigator)) {
        throw new Error("Web Serial API is not supported in this browser. Please use Chrome or Edge on desktop.");
      }

      const port = existingPort || await (navigator as any).serial.requestPort();
      await port.open({ baudRate: 38400 }); // Standard baud rate for ELM327 / 1260 USB cables

      setConnectionStatus('connecting');
      setIsSimulation(false);
      
      const portInfo = port.getInfo();
      const deviceName = portInfo.usbProductId 
        ? `USB Serial Device (${portInfo.usbVendorId?.toString(16)}:${portInfo.usbProductId?.toString(16)})` 
        : 'USB Serial Device';
      setConnectedDeviceName(deviceName);

      const handleDisconnect = () => {
        console.log("Serial disconnected.");
        setConnectionStatus('disconnected');
        setConnectedDeviceName(null);
        // Auto-reconnect for serial is handled by the global 'connect' event listener in OBDTab
      };

      (navigator as any).serial.addEventListener('disconnect', (event: any) => {
        if (event.target === port) {
          handleDisconnect();
        }
      });
      
      startSerialOBDPoll(port);
      setConnectionStatus('connected');
    } catch (error: any) {
      setConnectionStatus('disconnected');
      setConnectedDeviceName(null);
      let message = error instanceof Error ? error.message : "An unexpected Serial error occurred.";
      if (error.name === 'SecurityError' || message.includes('permissions policy')) {
        message = "Serial port access is blocked by the browser. Please open the app in a new tab to use USB Serial.";
      }
      console.error("Serial Error:", message);
      throw new Error(message);
    }
  };

  const startSerialOBDPoll = async (port: any) => {
    const textEncoder = new TextEncoderStream();
    const writableStreamClosed = textEncoder.readable.pipeTo(port.writable);
    const writer = textEncoder.writable.getWriter();

    const textDecoder = new TextDecoderStream();
    const readableStreamClosed = port.readable.pipeTo(textDecoder.writable);
    const reader = textDecoder.readable.getReader();

    let buffer = '';
    let isWaitingForPrompt = false;
    let commandQueue: string[] = [];
    let isProcessingQueue = false;
    let isPollingActive = true;

    const processQueue = async () => {
      if (isProcessingQueue || commandQueue.length === 0 || isWaitingForPrompt || !isPollingActive) return;
      
      isProcessingQueue = true;
      const cmd = commandQueue.shift();
      if (cmd) {
        isWaitingForPrompt = true;
        try {
          await writer.write(cmd + '\r');
        } catch (e) {
          console.warn("Command failed:", cmd, e);
          isWaitingForPrompt = false;
        }
      }
      isProcessingQueue = false;
    };

    const readLoop = async () => {
      try {
        while (isPollingActive) {
          const { value, done } = await reader.read();
          if (done) break;
          if (value) {
            buffer += value;
            if (buffer.includes('>')) {
              parseOBDResponse(buffer);
              buffer = '';
              isWaitingForPrompt = false;
              processQueue();
            }
          }
        }
      } catch (error) {
        console.error("Serial read error:", error);
      } finally {
        reader.releaseLock();
      }
    };

    readLoop();

    const queueCommand = (cmd: string) => {
      commandQueue.push(cmd);
      processQueue();
    };

    queueCommand('ATZ');
    queueCommand('ATE0');
    queueCommand('ATL0');
    queueCommand('ATH0');
    queueCommand('ATSP0');

    const pollInterval = setInterval(() => {
      if (!isPollingActive) {
        clearInterval(pollInterval);
        return;
      }
      if (commandQueue.length < 3) {
        queueCommand('010C');
        queueCommand('010D');
        queueCommand('0105');
        if (Math.random() > 0.8) {
          queueCommand('0101');
          queueCommand('03');
        }
      }
    }, 1000);
  };

  const startOBDPoll = async (char: BluetoothRemoteGATTCharacteristic) => {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    let buffer = '';
    let isWaitingForPrompt = false;
    let commandQueue: string[] = [];
    let isProcessingQueue = false;
    let isPollingActive = true;

    const processQueue = async () => {
      if (isProcessingQueue || commandQueue.length === 0 || isWaitingForPrompt || !isPollingActive) return;
      
      isProcessingQueue = true;
      const cmd = commandQueue.shift();
      if (cmd) {
        isWaitingForPrompt = true;
        try {
          await char.writeValue(encoder.encode(cmd + '\r'));
        } catch (e) {
          console.warn("Command failed:", cmd, e);
          isWaitingForPrompt = false; // Reset on failure
        }
      }
      isProcessingQueue = false;
    };

    const handleData = (event: Event) => {
      const value = (event.target as BluetoothRemoteGATTCharacteristic).value;
      if (!value) return;
      
      const chunk = decoder.decode(value);
      buffer += chunk;

      if (buffer.includes('>')) {
        parseOBDResponse(buffer);
        buffer = ''; // Reset buffer after prompt
        isWaitingForPrompt = false;
        processQueue();
      }
    };

    if (char.properties.notify) {
      await char.startNotifications();
      char.addEventListener('characteristicvaluechanged', handleData);
    }

    const queueCommand = (cmd: string) => {
      commandQueue.push(cmd);
      processQueue();
    };

    // ELM327 Initial Setup
    queueCommand('ATZ');    // Reset
    queueCommand('ATE0');   // Echo off
    queueCommand('ATL0');   // Linefeeds off
    queueCommand('ATH0');   // Headers off
    queueCommand('ATSP0');  // Auto protocol

    // Polling Loop
    const pollInterval = setInterval(() => {
      if (!char.service.device.gatt?.connected) {
        clearInterval(pollInterval);
        isPollingActive = false;
        return;
      }
      
      // Only queue new commands if the queue is relatively empty to prevent buildup
      if (commandQueue.length < 3) {
        queueCommand('010C'); // RPM
        queueCommand('010D'); // Speed
        queueCommand('0105'); // Coolant
        
        // Poll readiness and DTCs less frequently (e.g., every 5th cycle)
        if (Math.random() > 0.8) {
          queueCommand('0101'); // Readiness
          queueCommand('03');   // DTCs
        }
      }
    }, 1000); // Poll every second
  };

  const saveApiKeys = () => {
    localStorage.setItem('ztcd_gemini_api_key', apiKeys.gemini);
    localStorage.setItem('ztcd_maps_api_key', apiKeys.maps);
    setShowSettings(false);
  };

  const clearCachedData = () => {
    localStorage.removeItem('ztcd_gemini_api_key');
    localStorage.removeItem('ztcd_maps_api_key');
    localStorage.removeItem('ztcd_trips');
    localStorage.removeItem('ztcd_mileage');
    localStorage.removeItem('ztcd_maintenance');
    
    // Reset state
    setApiKeys({
      gemini: process.env.GEMINI_API_KEY || '',
      maps: import.meta.env.VITE_MAPS_API_KEY || DEFAULT_MAPS_KEY,
    });
    setTrips([]);
    setTotalMileage(0);
    setMaintenanceTasks([]);
    setShowSettings(false);
  };

  const handleAIDiagnosis = async () => {
    setActiveTab('obd');
    // The OBDTab will handle the actual diagnosis display if we trigger it, 
    // but for the ChatAssistant, we can just return the result.
    return await runAIDiagnosis(obdData);
  };

  const criticalTasks = maintenanceTasks.filter(task => {
    const milesSince = totalMileage - task.lastCompletedMiles;
    const monthsSince = (Date.now() - task.lastCompletedDate) / (1000 * 60 * 60 * 24 * 30);
    const milesProgress = (milesSince / task.intervalMiles) * 100;
    const timeProgress = (monthsSince / task.intervalMonths) * 100;
    return Math.max(milesProgress, timeProgress) >= 100;
  });

  return (
    <div className="min-h-screen flex flex-col max-w-md mx-auto bg-car-bg shadow-2xl overflow-hidden">
      {/* Header */}
      <motion.header 
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.2}
        onDragEnd={(e, info) => {
          if (info.offset.x < -50) {
            chatAssistantRef.current?.toggleMic();
          }
        }}
        className="p-6 pt-8 flex justify-between items-center border-b border-white/5 bg-car-card/50 backdrop-blur-md sticky top-0 z-50 cursor-grab active:cursor-grabbing"
      >
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setShowSettings(true)}
            className="p-2 rounded-xl bg-white/5 text-white/40 hover:text-white hover:bg-white/10 transition-all"
          >
            <Settings size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-bold tracking-tighter text-white">ZTCD_V3</h1>
            <p className="text-[10px] uppercase tracking-[0.2em] text-white/40 font-mono">Vehicle Telemetry System</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {isRecording ? (
            <button 
              onClick={stopTrip}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-car-danger/20 text-car-danger border border-car-danger/30 text-xs font-medium animate-pulse"
            >
              <Square size={12} fill="currentColor" />
              RECORDING
            </button>
          ) : (
            <button 
              onClick={startTrip}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-car-accent/20 text-car-accent border border-car-accent/30 text-xs font-medium"
            >
              <Play size={12} fill="currentColor" />
              START TRIP
            </button>
          )}
        </div>
      </motion.header>

      {criticalTasks.length > 0 && (
        <div 
          onClick={() => setActiveTab('maintenance')}
          className="bg-car-danger/20 border-b border-car-danger/30 p-3 flex items-center gap-3 cursor-pointer hover:bg-car-danger/30 transition-colors"
        >
          <AlertTriangle size={16} className="text-car-danger shrink-0" />
          <p className="text-xs text-car-danger font-medium flex-1">
            {criticalTasks.length} maintenance task{criticalTasks.length > 1 ? 's' : ''} due!
          </p>
          <ChevronRight size={16} className="text-car-danger/50" />
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto pb-24">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="p-4"
          >
            {activeTab === 'obd' && (
              <OBDTab 
                data={obdData} 
                isSimulation={isSimulation} 
                connectionStatus={connectionStatus}
                connectedDeviceName={connectedDeviceName}
                onConnectReal={connectToOBD} 
                onConnectSerial={connectToSerialOBD}
              />
            )}
            {activeTab === 'damage' && (
              <DamageLogTab 
                score={damageScore} 
                history={damageHistory} 
                sensorHistory={sensorHistory}
                trips={trips} 
                isRecording={isRecording}
                mapsApiKey={apiKeys.maps}
                isMapsLoaded={isMapsLoaded}
                onUpdateTrip={(updatedTrip) => {
                  setTrips(prev => prev.map(t => t.id === updatedTrip.id ? updatedTrip : t));
                }}
              />
            )}
            {activeTab === 'gps' && (
              <GPSTab 
                isRecording={isRecording} 
                trips={trips} 
                navigation={navigation}
                setNavigation={setNavigation}
                mapsApiKey={apiKeys.maps}
                isMapsLoaded={isMapsLoaded}
                onDiagnose={handleAIDiagnosis}
                onTabChange={(tab) => setActiveTab(tab)}
              />
            )}
            {activeTab === 'maintenance' && (
              <MaintenanceTab 
                tasks={maintenanceTasks}
                totalMileage={totalMileage}
                onCompleteTask={(id) => {
                  setMaintenanceTasks(prev => prev.map(t => 
                    t.id === id ? { ...t, lastCompletedMiles: totalMileage, lastCompletedDate: Date.now() } : t
                  ));
                }}
                onAddTask={(task) => {
                  setMaintenanceTasks(prev => [...prev, { ...task, id: Math.random().toString(36).substr(2, 9) }]);
                }}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      <FloatingMap navigation={navigation} setNavigation={setNavigation} mapsApiKey={apiKeys.maps} isMapsLoaded={isMapsLoaded} />

      <MusicPlayer ref={musicPlayerRef} />

      <ChatAssistant 
        ref={chatAssistantRef}
        onTabChange={(tab) => setActiveTab(tab)}
        onSetNavigation={(from, to) => setNavigation({ from, to, isActive: true })}
        onDiagnose={handleAIDiagnosis}
        onMusicControl={(action) => musicPlayerRef.current?.control(action)}
      />

      {/* Settings Modal */}
      <AnimatePresence>
        {showSettings && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="w-full max-w-sm glass-card p-6 rounded-2xl space-y-6"
            >
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-car-accent/10 rounded-xl">
                    <Settings className="text-car-accent" size={20} />
                  </div>
                  <h2 className="text-xl font-bold">Settings</h2>
                </div>
                <button 
                  onClick={() => setShowSettings(false)}
                  className="p-2 rounded-full hover:bg-white/5 text-white/40"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Admin Mode Toggle (Mock for demonstration) */}
              <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/10">
                <div className="flex items-center gap-2">
                  <Shield className="text-car-warning" size={16} />
                  <span className="text-sm font-medium text-white">Admin Mode</span>
                </div>
                <button
                  onClick={() => {
                    setIsAdmin(!isAdmin);
                    if (isAdmin) setShowApiKeys(false); // Reset visibility when leaving admin mode
                  }}
                  className={cn(
                    "w-10 h-6 rounded-full transition-colors relative",
                    isAdmin ? "bg-car-success" : "bg-white/20"
                  )}
                >
                  <div className={cn(
                    "absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform",
                    isAdmin ? "translate-x-4" : "translate-x-0"
                  )} />
                </button>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-[10px] uppercase tracking-widest text-white/40 font-mono flex items-center gap-2">
                      <Key size={10} />
                      Gemini API Key
                    </label>
                    {isAdmin && (
                      <button
                        onClick={() => setShowApiKeys(!showApiKeys)}
                        className="text-[10px] uppercase tracking-widest text-car-accent font-mono flex items-center gap-1 hover:text-car-accent/80 transition-colors"
                      >
                        {showApiKeys ? <EyeOff size={12} /> : <Eye size={12} />}
                        {showApiKeys ? 'HIDE' : 'SHOW'}
                      </button>
                    )}
                  </div>
                  <input 
                    type={isAdmin && showApiKeys ? "text" : "password"}
                    value={apiKeys.gemini}
                    onChange={(e) => setApiKeys(prev => ({ ...prev, gemini: e.target.value }))}
                    placeholder="Enter Gemini API Key"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-car-accent transition-colors"
                  />
                  <p className="text-[8px] text-white/20">Default: Environment Variable</p>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-[10px] uppercase tracking-widest text-white/40 font-mono flex items-center gap-2">
                      <Key size={10} />
                      Google Maps API Key
                    </label>
                    {isAdmin && (
                      <button
                        onClick={() => setShowApiKeys(!showApiKeys)}
                        className="text-[10px] uppercase tracking-widest text-car-accent font-mono flex items-center gap-1 hover:text-car-accent/80 transition-colors"
                      >
                        {showApiKeys ? <EyeOff size={12} /> : <Eye size={12} />}
                        {showApiKeys ? 'HIDE' : 'SHOW'}
                      </button>
                    )}
                  </div>
                  <input 
                    type={isAdmin && showApiKeys ? "text" : "password"}
                    value={apiKeys.maps}
                    onChange={(e) => setApiKeys(prev => ({ ...prev, maps: e.target.value }))}
                    placeholder="Enter Maps API Key"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-car-accent transition-colors"
                  />
                  <p className="text-[8px] text-white/20">
                    {apiKeys.maps !== DEFAULT_MAPS_KEY ? "Key configured" : "Default: System Key (Restricted)"}
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <button 
                  onClick={saveApiKeys}
                  className="w-full py-3 bg-car-accent text-white rounded-xl font-bold text-sm hover:bg-car-accent/80 transition-all"
                >
                  SAVE CONFIGURATION
                </button>
                <button 
                  onClick={clearCachedData}
                  className="w-full py-3 bg-red-500/10 text-red-500 border border-red-500/20 rounded-xl font-bold text-sm hover:bg-red-500/20 transition-all flex items-center justify-center gap-2"
                >
                  <Trash2 size={16} />
                  CLEAR CACHED DATA
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-car-card/80 backdrop-blur-xl border-t border-white/5 p-2 flex justify-around items-center z-50">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex flex-col items-center gap-1 p-2 transition-all duration-300 rounded-xl flex-1",
                isActive ? "text-car-accent bg-car-accent/5" : "text-white/40 hover:text-white/60"
              )}
            >
              <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
              <span className="text-[10px] font-medium uppercase tracking-wider">{tab.id}</span>
              {isActive && (
                <motion.div 
                  layoutId="activeTab"
                  className="absolute -top-2 w-1 h-1 bg-car-accent rounded-full"
                />
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
