import React, { useState, useEffect } from 'react';
import { BrainCircuit, AlertCircle, CheckCircle2, Zap, Thermometer, Gauge, Activity, Bluetooth, AlertTriangle, ShieldCheck, ShieldAlert, Info, Usb } from 'lucide-react';
import { OBDData } from '../types';
import { runAIDiagnosis, fetchDTCDefinition } from '../services/geminiService';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import { cn } from '../lib/utils';
import { OBD_CODE_DEFINITIONS } from '../constants/obdCodes';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

interface OBDTabProps {
  data: OBDData;
  isSimulation: boolean;
  connectionStatus: 'disconnected' | 'connecting' | 'connected';
  connectedDeviceName?: string | null;
  onConnectReal: () => Promise<void> | void;
  onConnectSerial: (port?: any) => Promise<void> | void;
}

export default function OBDTab({ data, isSimulation, connectionStatus, connectedDeviceName, onConnectReal, onConnectSerial }: OBDTabProps) {
  const [diagnosis, setDiagnosis] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [history, setHistory] = useState<OBDData[]>([]);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [dtcDefinitions, setDtcDefinitions] = useState<Record<string, string>>({});
  const [isFetchingDtc, setIsFetchingDtc] = useState<Record<string, boolean>>({});
  const [availablePorts, setAvailablePorts] = useState<any[]>([]);
  const [selectedPortIndex, setSelectedPortIndex] = useState<number>(-1);

  useEffect(() => {
    const loadPorts = async () => {
      if ('serial' in navigator) {
        try {
          const ports = await (navigator as any).serial.getPorts();
          setAvailablePorts(ports);
          if (ports.length > 0 && selectedPortIndex === -1) {
            setSelectedPortIndex(0);
          }
        } catch (e: any) {
          if (e.name === 'SecurityError' || (e.message && e.message.includes('permissions policy'))) {
            console.warn("Serial ports access is restricted by permissions policy. You may need to open the app in a new tab to use USB Serial.");
          } else {
            console.error("Failed to get serial ports", e);
          }
        }
      }
    };
    loadPorts();
    
    const handleSerialConnect = async (event: any) => {
      loadPorts();
      // Auto-reconnect if a port is plugged in and we are disconnected
      if (connectionStatus === 'disconnected' && event.target) {
        try {
          await onConnectSerial(event.target);
          setConnectionError(null);
        } catch (e) {
          console.error("Auto-reconnect failed", e);
        }
      }
    };
    const handleSerialDisconnect = () => loadPorts();
    
    if ('serial' in navigator) {
      (navigator as any).serial.addEventListener('connect', handleSerialConnect);
      (navigator as any).serial.addEventListener('disconnect', handleSerialDisconnect);
    }
    
    return () => {
      if ('serial' in navigator) {
        (navigator as any).serial.removeEventListener('connect', handleSerialConnect);
        (navigator as any).serial.removeEventListener('disconnect', handleSerialDisconnect);
      }
    };
  }, [connectionStatus, onConnectSerial]);

  const handleCodeClick = async (code: string) => {
    if (selectedCode === code) {
      setSelectedCode(null);
      return;
    }
    
    setSelectedCode(code);
    
    if (!dtcDefinitions[code]) {
      setIsFetchingDtc(prev => ({ ...prev, [code]: true }));
      try {
        const definition = await fetchDTCDefinition(code);
        if (definition) {
          setDtcDefinitions(prev => ({ ...prev, [code]: definition }));
        } else {
          setDtcDefinitions(prev => ({ ...prev, [code]: OBD_CODE_DEFINITIONS[code] || `No definition available for code ${code}.` }));
        }
      } catch (error) {
        console.error(error);
        setDtcDefinitions(prev => ({ ...prev, [code]: OBD_CODE_DEFINITIONS[code] || `No definition available for code ${code}.` }));
      } finally {
        setIsFetchingDtc(prev => ({ ...prev, [code]: false }));
      }
    }
  };

  const handleConnect = async () => {
    try {
      await onConnectReal();
      setConnectionError(null);
    } catch (err) {
      setConnectionError(err instanceof Error ? err.message : 'Failed to connect');
    }
  };

  // Maintain a rolling history of the last 30 data points for the charts
  useEffect(() => {
    setHistory(prev => {
      const newHistory = [...prev, data];
      return newHistory.slice(-30); // Keep last 30 seconds/points
    });
  }, [data]);

  const getStatusConfig = () => {
    if (isSimulation && connectionStatus === 'disconnected') {
      return { 
        label: 'Simulation Active', 
        color: 'text-car-warning', 
        bg: 'bg-car-warning/10',
        dot: 'bg-car-warning animate-pulse',
        icon: Activity
      };
    }
    
    switch (connectionStatus) {
      case 'connected':
        return { 
          label: 'OBD-II Linked', 
          color: 'text-car-success', 
          bg: 'bg-car-success/10',
          dot: 'bg-car-success',
          icon: ShieldCheck
        };
      case 'connecting':
        return { 
          label: 'Connecting...', 
          color: 'text-car-accent', 
          bg: 'bg-car-accent/10',
          dot: 'bg-car-accent animate-ping',
          icon: Bluetooth
        };
      case 'disconnected':
      default:
        return { 
          label: 'Disconnected', 
          color: 'text-white/40', 
          bg: 'bg-white/5',
          dot: 'bg-white/20',
          icon: Bluetooth
        };
    }
  };

  const status = getStatusConfig();

  const handleDiagnosis = async () => {
    setIsAnalyzing(true);
    const result = await runAIDiagnosis(data);
    setDiagnosis(result);
    setIsAnalyzing(false);
  };

  const speedMph = Math.round(data.speed * 0.621371);
  const coolantF = Math.round((data.coolantTemp * 9 / 5) + 32);

  const metrics = [
    { label: 'RPM', value: data.rpm, unit: '', icon: Gauge, color: 'text-car-accent' },
    { label: 'Speed', value: speedMph, unit: 'mph', icon: Zap, color: 'text-car-success' },
    { label: 'VSS', value: speedMph, unit: 'mph', icon: Activity, color: 'text-car-success' },
    { label: 'Coolant', value: coolantF, unit: '°F', icon: Thermometer, color: coolantF > 221 ? 'text-car-danger' : 'text-car-warning' },
    { label: 'Throttle', value: data.throttlePos.toFixed(1), unit: '%', icon: Activity, color: 'text-white' },
    { label: 'Load', value: data.load.toFixed(1), unit: '%', icon: Activity, color: 'text-white' },
    { label: 'Voltage', value: data.voltage.toFixed(1), unit: 'V', icon: Zap, color: 'text-car-accent' },
  ];

  const chartData = history.map(d => ({
    ...d,
    speed: Math.round(d.speed * 0.621371),
    coolantTemp: Math.round((d.coolantTemp * 9 / 5) + 32)
  }));

  const readinessItems = [
    { label: 'Misfire', status: data.readiness.misfire },
    { label: 'Fuel System', status: data.readiness.fuelSystem },
    { label: 'Components', status: data.readiness.components },
    { label: 'Catalyst', status: data.readiness.catalyst },
    { label: 'EVAP', status: data.readiness.evap },
    { label: 'Oxygen Sensor', status: data.readiness.oxygenSensor },
  ];

  const getDtcSeverity = (code: string) => {
    if (code.startsWith('P') || code.startsWith('C')) {
      return { level: 'Critical', color: 'text-car-danger', bg: 'bg-car-danger/10', border: 'border-car-danger/20', activeBg: 'bg-car-danger/20', activeBorder: 'border-car-danger' };
    }
    if (code.startsWith('U')) {
      return { level: 'Warning', color: 'text-car-warning', bg: 'bg-car-warning/10', border: 'border-car-warning/20', activeBg: 'bg-car-warning/20', activeBorder: 'border-car-warning' };
    }
    return { level: 'Minor', color: 'text-car-accent', bg: 'bg-car-accent/10', border: 'border-car-accent/20', activeBg: 'bg-car-accent/20', activeBorder: 'border-car-accent' };
  };

  const groupedDtcs = data.dtcs.reduce((acc, code) => {
    const severity = getDtcSeverity(code).level;
    if (!acc[severity]) acc[severity] = [];
    acc[severity].push(code);
    return acc;
  }, {} as Record<string, string[]>);

  // Custom tooltip for charts
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-car-card/90 border border-white/10 p-2 rounded-lg shadow-xl backdrop-blur-md">
          <p className="text-[10px] text-white/60 mb-1">{new Date(label).toLocaleTimeString()}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} className="text-xs font-bold" style={{ color: entry.color }}>
              {entry.name}: {entry.value}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6">
      {/* Connection Status Indicator */}
      <div className="space-y-2">
        <div className={cn("flex items-center justify-between p-4 rounded-2xl border transition-all duration-500", status.bg, status.color.replace('text-', 'border-').replace('text-white/40', 'border-white/10'))}>
          <div className="flex items-center gap-3">
            <div className={cn("p-2 rounded-lg bg-white/5")}>
              <status.icon size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <div className={cn("w-2 h-2 rounded-full", status.dot)} />
                <span className="text-xs font-bold uppercase tracking-widest">{status.label}</span>
              </div>
              <p className="text-[10px] opacity-60 font-mono">
                {connectionStatus === 'connecting' ? 'Searching for devices...' : 
                 connectionStatus === 'connected' ? (connectedDeviceName ? `Connected to: ${connectedDeviceName}` : 'Data stream active') : 'Connect adapter to see real telemetry'}
              </p>
            </div>
          </div>
          {connectionStatus === 'disconnected' && (
            <div className="flex flex-col gap-2 items-end">
              <div className="flex gap-2">
                <button 
                  onClick={handleConnect}
                  className="px-3 py-1.5 bg-car-accent text-white rounded-lg text-[10px] font-bold uppercase tracking-widest hover:bg-car-accent/80 transition-colors flex items-center gap-1"
                  title="Connect via ELM327 Bluetooth"
                >
                  <Bluetooth className="w-3 h-3" /> ELM327 BT
                </button>
                
                {availablePorts.length === 0 ? (
                  <button 
                    onClick={async () => {
                      try {
                        await onConnectSerial();
                        setConnectionError(null);
                      } catch (err) {
                        setConnectionError(err instanceof Error ? err.message : 'Failed to connect via USB');
                      }
                    }}
                    className="px-3 py-1.5 bg-car-purple text-white rounded-lg text-[10px] font-bold uppercase tracking-widest hover:bg-car-purple/80 transition-colors flex items-center gap-1"
                    title="Connect via 1260 USB Serial Cable"
                  >
                    <Usb className="w-3 h-3" /> USB 1260
                  </button>
                ) : (
                  <div className="flex items-center gap-1 bg-white/5 p-1 rounded-lg border border-white/10">
                    <select 
                      className="bg-transparent border-none px-2 py-0.5 text-[10px] font-mono text-white focus:outline-none focus:ring-0 appearance-none cursor-pointer"
                      value={selectedPortIndex}
                      onChange={(e) => setSelectedPortIndex(Number(e.target.value))}
                    >
                      {availablePorts.map((port, idx) => {
                        let name = `Serial Port ${idx + 1}`;
                        try {
                          const info = port.getInfo();
                          if (info.usbVendorId) {
                            name = `USB (${info.usbVendorId.toString(16).padStart(4, '0')}:${info.usbProductId?.toString(16).padStart(4, '0')})`;
                          }
                        } catch (e) {}
                        return <option key={idx} value={idx} className="bg-zinc-900">{name}</option>;
                      })}
                    </select>
                    <button 
                      onClick={async () => {
                        try {
                          if (selectedPortIndex >= 0 && availablePorts[selectedPortIndex]) {
                            await onConnectSerial(availablePorts[selectedPortIndex]);
                          } else {
                            await onConnectSerial();
                          }
                          setConnectionError(null);
                        } catch (err) {
                          setConnectionError(err instanceof Error ? err.message : 'Failed to connect via USB');
                        }
                      }}
                      className="px-2 py-1 bg-car-purple text-white rounded text-[10px] font-bold uppercase tracking-widest hover:bg-car-purple/80 transition-colors"
                    >
                      CONNECT
                    </button>
                    <button
                      onClick={async () => {
                        try {
                          await onConnectSerial();
                          setConnectionError(null);
                        } catch (err) {
                          setConnectionError(err instanceof Error ? err.message : 'Failed to connect via USB');
                        }
                      }}
                      className="px-2 py-1 bg-white/10 text-white rounded text-[10px] font-bold uppercase tracking-widest hover:bg-white/20 transition-colors"
                      title="Add new USB device"
                    >
                      +
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        {connectionError && (
          <div className="flex items-center gap-2 p-3 bg-car-danger/10 border border-car-danger/20 rounded-xl text-car-danger">
            <AlertCircle size={14} />
            <span className="text-xs">{connectionError}</span>
          </div>
        )}
      </div>

      {/* Main Gauges Section */}
      <div className="grid grid-cols-2 gap-4">
        {metrics.slice(0, 2).map((m) => (
          <div key={m.label} className="glass-card p-6 rounded-2xl flex flex-col items-center gap-2 text-center border-b-2 border-car-accent/20">
            <m.icon size={24} className="text-car-accent/40" />
            <div className="flex items-baseline gap-1">
              <span className={`text-4xl font-bold font-mono tracking-tighter ${m.color}`}>{m.value}</span>
              <span className="text-xs text-white/20 font-mono uppercase">{m.unit}</span>
            </div>
            <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/40">{m.label}</span>
          </div>
        ))}
      </div>

      {/* Live Charts Section */}
      <div className="glass-card p-6 rounded-2xl space-y-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-white/5 rounded-xl">
            <Activity className="text-white" size={20} />
          </div>
          <div>
            <h3 className="font-bold text-white">Live Telemetry</h3>
            <p className="text-xs text-white/40">Real-time performance graphs</p>
          </div>
        </div>

        {/* RPM Chart */}
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-[10px] font-mono uppercase tracking-widest text-car-accent">Engine RPM</span>
            <span className="text-xs font-bold font-mono text-car-accent">{data.rpm}</span>
          </div>
          <div className="h-24 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                <defs>
                  <linearGradient id="colorRpm" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#F27D26" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#F27D26" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <YAxis domain={['auto', 'auto']} hide />
                <Tooltip content={<CustomTooltip />} />
                <Area 
                  type="monotone" 
                  dataKey="rpm" 
                  name="RPM"
                  stroke="#F27D26" 
                  fillOpacity={1}
                  fill="url(#colorRpm)"
                  strokeWidth={2} 
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Speed Chart */}
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-[10px] font-mono uppercase tracking-widest text-car-success">Speed (mph)</span>
            <span className="text-xs font-bold font-mono text-car-success">{speedMph}</span>
          </div>
          <div className="h-24 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                <defs>
                  <linearGradient id="colorSpeed" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <YAxis domain={[0, 'auto']} hide />
                <Tooltip content={<CustomTooltip />} />
                <Area 
                  type="monotone" 
                  dataKey="speed" 
                  name="Speed"
                  stroke="#10B981" 
                  fillOpacity={1}
                  fill="url(#colorSpeed)"
                  strokeWidth={2} 
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Coolant Temp Chart */}
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-[10px] font-mono uppercase tracking-widest text-car-warning">Coolant Temp (°F)</span>
            <span className="text-xs font-bold font-mono text-car-warning">{coolantF}</span>
          </div>
          <div className="h-24 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                <defs>
                  <linearGradient id="colorCoolant" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#F59E0B" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <YAxis domain={['auto', 'auto']} hide />
                <Tooltip content={<CustomTooltip />} />
                <Area 
                  type="monotone" 
                  dataKey="coolantTemp" 
                  name="Coolant"
                  stroke="#F59E0B" 
                  fillOpacity={1}
                  fill="url(#colorCoolant)"
                  strokeWidth={2} 
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Secondary Metrics Grid */}
      <div className="grid grid-cols-2 gap-4">
        {metrics.slice(2).map((m) => (
          <div key={m.label} className="glass-card p-4 rounded-2xl flex flex-col gap-2">
            <div className="flex justify-between items-center">
              <m.icon size={16} className="text-white/20" />
              <span className="text-[10px] font-mono uppercase tracking-widest text-white/40">{m.label}</span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className={`text-2xl font-bold font-mono ${m.color}`}>{m.value}</span>
              <span className="text-[10px] text-white/20 font-mono">{m.unit}</span>
            </div>
          </div>
        ))}
      </div>

      {/* DTCs Section */}
      <div className="glass-card p-6 rounded-2xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-car-danger/10 rounded-xl">
              <AlertTriangle className="text-car-danger" size={20} />
            </div>
            <div>
              <h3 className="font-bold text-white">Trouble Codes</h3>
              <p className="text-xs text-white/40">Active DTCs from ECU</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4 text-[10px] uppercase tracking-widest pb-2 border-b border-white/5">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-car-danger" />
            <span className="text-white/60">Critical</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-car-warning" />
            <span className="text-white/60">Warning</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-car-accent" />
            <span className="text-white/60">Minor</span>
          </div>
        </div>

        {data.dtcs.length > 0 ? (
          <div className="space-y-4">
            {['Critical', 'Warning', 'Minor'].map(severity => {
              const codes = groupedDtcs[severity];
              if (!codes || codes.length === 0) return null;

              const config = getDtcSeverity(codes[0]);

              return (
                <div key={severity} className="space-y-2">
                  <h4 className={cn("text-[10px] font-bold uppercase tracking-widest flex items-center gap-2", config.color)}>
                    {severity} Issues <span className={cn("px-1.5 py-0.5 rounded-md text-[8px]", config.bg)}>{codes.length}</span>
                  </h4>
                  <div className="grid grid-cols-2 gap-2">
                    {codes.map(code => (
                      <button 
                        key={code} 
                        onClick={() => handleCodeClick(code)}
                        className={cn(
                          "border rounded-xl p-3 flex items-center justify-between transition-all",
                          selectedCode === code ? `${config.activeBg} ${config.activeBorder}` : `${config.bg} ${config.border} hover:bg-white/5`
                        )}
                      >
                        <span className={cn("font-mono font-bold", config.color)}>{code}</span>
                        <Info size={14} className={cn("transition-colors", selectedCode === code ? config.color : `${config.color}/40`)} />
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
            
            <AnimatePresence>
              {selectedCode && (
                <motion.div 
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  {(() => {
                    const config = getDtcSeverity(selectedCode);
                    return (
                      <div className={cn("p-4 border rounded-2xl", config.bg, config.border)}>
                        <div className="flex items-center gap-2 mb-2">
                          <span className={cn("text-[10px] font-bold uppercase tracking-widest", config.color)}>Definition for {selectedCode}</span>
                        </div>
                        <div className="text-sm text-white/80 leading-relaxed">
                          {isFetchingDtc[selectedCode] ? (
                            <span className="flex items-center gap-2 text-white/60">
                              <span className="w-3 h-3 border-2 border-white/20 border-t-white/80 rounded-full animate-spin" />
                              Analyzing code with AI...
                            </span>
                          ) : (
                            <div className="prose prose-invert prose-sm max-w-none prose-p:leading-relaxed prose-a:text-car-accent">
                              <ReactMarkdown>
                                {dtcDefinitions[selectedCode] || OBD_CODE_DEFINITIONS[selectedCode] || "No definition available for this code."}
                              </ReactMarkdown>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ) : (
          <div className="flex items-center gap-3 p-4 bg-car-success/5 rounded-2xl border border-car-success/10">
            <CheckCircle2 size={16} className="text-car-success" />
            <p className="text-xs text-car-success/80 font-medium">No diagnostic trouble codes found.</p>
          </div>
        )}
      </div>

      {/* Monitor Readiness Section */}
      <div className="glass-card p-6 rounded-2xl space-y-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-car-success/10 rounded-xl">
            <ShieldCheck className="text-car-success" size={20} />
          </div>
          <div>
            <h3 className="font-bold text-white">Monitor Readiness</h3>
            <p className="text-xs text-white/40">I/M Readiness Status</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {readinessItems.map(item => (
            <div key={item.label} className="flex items-center justify-between p-2 bg-white/5 rounded-xl border border-white/5">
              <span className="text-[10px] uppercase tracking-wider text-white/60 font-mono">{item.label}</span>
              {item.status ? (
                <CheckCircle2 size={14} className="text-car-success" />
              ) : (
                <ShieldAlert size={14} className="text-car-warning" />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* AI Diagnosis Section */}
      <div className="glass-card p-6 rounded-2xl space-y-4 relative overflow-hidden">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-car-accent/10 rounded-xl">
              <BrainCircuit className="text-car-accent" size={20} />
            </div>
            <div>
              <h3 className="font-bold text-white">AI Diagnostics</h3>
              <p className="text-xs text-white/40">Powered by Google Gemini</p>
            </div>
          </div>
          <button
            onClick={handleDiagnosis}
            disabled={isAnalyzing}
            className="px-4 py-2 bg-car-accent text-white rounded-xl text-xs font-bold hover:bg-car-accent/80 transition-colors disabled:opacity-50"
          >
            {isAnalyzing ? 'ANALYZING...' : 'RUN AI DIAGNOSIS'}
          </button>
        </div>

        {diagnosis ? (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="bg-white/5 rounded-2xl p-4 text-sm text-white/80 leading-relaxed prose prose-invert max-w-none"
          >
            <ReactMarkdown>{diagnosis}</ReactMarkdown>
          </motion.div>
        ) : (
          <div className="flex items-center gap-3 p-4 bg-white/5 rounded-2xl border border-white/5">
            <AlertCircle size={16} className="text-car-warning" />
            <p className="text-xs text-white/60 italic">No active diagnosis. Tap run to analyze live telemetry.</p>
          </div>
        )}
      </div>
    </div>
  );
}
