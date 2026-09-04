import { useState, useEffect, useRef, useCallback } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area } from 'recharts';
import mqtt from 'mqtt';
import axios from 'axios';
import { Activity, Droplets, Wind, AlertTriangle, AlertCircle, CheckCircle, Wifi, WifiOff, Settings, RefreshCw } from 'lucide-react';
import SimulatorPanel from './components/SimulatorPanel';
import './App.css';

// Configuration
const MQTT_BROKER_URL = 'ws://localhost:9001'; // WebSocket URL for MQTT
const API_BASE_URL = 'http://localhost:8000/api';

// Status configurations
const STATUS_CONFIG = {
  normal: { color: '#22c55e', bg: 'bg-green-500', icon: CheckCircle, label: 'Normal' },
  warning: { color: '#eab308', bg: 'bg-yellow-500', icon: AlertCircle, label: 'Warning' },
  danger: { color: '#ef4444', bg: 'bg-red-500', icon: AlertTriangle, label: 'Danger' }
};

function App() {
  // Real-time data state
  const [telemetry, setTelemetry] = useState({
    volume_ml: 0,
    bpm: 0,
    target_bpm: 60,
    servo_angle: 45,
    status: 'normal',
    rssi: 0,
    free_heap: 0,
    uptime_ms: 0,
    timestamp: Date.now()
  });

  // Historical data for charts
  const [historicalData, setHistoricalData] = useState([]);
  const [chartTimeRange, setChartTimeRange] = useState('1h');

  // Connection states
  const [mqttConnected, setMqttConnected] = useState(false);
  const [apiAvailable, setApiAvailable] = useState(false);
  const [loading, setLoading] = useState(true);

  // MQTT client reference
  const mqttClientRef = useRef(null);

  // Format time for charts
  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  // Format time for display
  const formatUptime = (ms) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  };

  // Initialize MQTT connection
  useEffect(() => {
    const connectMQTT = () => {
      try {
        mqttClientRef.current = mqtt.connect(MQTT_BROKER_URL, {
          clientId: `ivdrip_web_${Math.random().toString(16).substr(2, 8)}`,
          clean: true,
          reconnectPeriod: 3000,
          connectTimeout: 10000
        });

        mqttClientRef.current.on('connect', () => {
          console.log('Connected to MQTT broker');
          setMqttConnected(true);
          mqttClientRef.current.subscribe('ivdrip/telemetry');
          mqttClientRef.current.subscribe('ivdrip/status');
        });

        mqttClientRef.current.on('message', (topic, message) => {
          try {
            if (topic === 'ivdrip/telemetry') {
              const data = JSON.parse(message.toString());
              
              // Detect if timestamp is just millis() uptime (less than year 2000 epoch) and fallback to browser time
              const isRealTimestamp = data.timestamp && data.timestamp > 1000000000000;
              const telemetryTime = isRealTimestamp ? data.timestamp : Date.now();
              
              setTelemetry(prev => ({
                ...data,
                timestamp: telemetryTime
              }));
              
              // Add to chart data
              setHistoricalData(prev => {
                const newData = [...prev, {
                  time: formatTime(telemetryTime),
                  volume: parseFloat(data.volume_ml?.toFixed(1) || 0),
                  bpm: parseFloat(data.bpm?.toFixed(1) || 0),
                  target_bpm: parseFloat(data.target_bpm?.toFixed(1) || 60),
                  servo_angle: data.servo_angle || 45,
                  status: data.status || 'normal'
                }];
                // Keep last 100 points for performance
                return newData.slice(-100);
              });
            }
          } catch (error) {
            console.error('Error parsing MQTT message:', error);
          }
        });

        mqttClientRef.current.on('disconnect', () => {
          console.log('Disconnected from MQTT broker');
          setMqttConnected(false);
        });

        mqttClientRef.current.on('error', (error) => {
          console.error('MQTT error:', error);
        });
      } catch (error) {
        console.error('Failed to connect to MQTT:', error);
      }
    };

    connectMQTT();

    return () => {
      if (mqttClientRef.current) {
        mqttClientRef.current.end();
      }
    };
  }, []);

  // Fetch historical data from API
  const fetchHistoricalData = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/telemetry`, {
        params: {
          start: `-${chartTimeRange}`,
          limit: 200
        }
      });
      
      if (response.data && response.data.data) {
        const formattedData = response.data.data.map(point => ({
          time: formatTime(new Date(point.time).getTime()),
          volume: parseFloat(point.volume_ml.toFixed(1)),
          bpm: parseFloat(point.bpm.toFixed(1)),
          target_bpm: parseFloat(point.target_bpm.toFixed(1)),
          servo_angle: point.servo_angle,
          status: point.status || 'normal'
        }));
        setHistoricalData(formattedData);
      }
      setApiAvailable(true);
    } catch (error) {
      console.error('Failed to fetch historical data:', error);
      setApiAvailable(false);
    } finally {
      setLoading(false);
    }
  }, [chartTimeRange]);

  // Check API health
  const checkApiHealth = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/health`);
      setApiAvailable(response.data.status === 'healthy');
    } catch (error) {
      setApiAvailable(false);
    }
  }, []);

  // Initial data fetch
  useEffect(() => {
    fetchHistoricalData();
    checkApiHealth();
    const interval = setInterval(() => {
      checkApiHealth();
    }, 30000); // Check every 30 seconds
    return () => clearInterval(interval);
  }, [fetchHistoricalData, checkApiHealth]);

  // Get status configuration
  const currentStatus = STATUS_CONFIG[telemetry.status] || STATUS_CONFIG.normal;
  const StatusIcon = currentStatus.icon;

  // Calculate status percentage for progress bars
  const volumePercentage = Math.min(100, Math.max(0, (telemetry.volume_ml / 500) * 100));
  const bpmPercentage = telemetry.target_bpm > 0 ? (telemetry.bpm / telemetry.target_bpm) * 100 : 0;

  return (
    <div className="med-bg text-white p-4 md:p-6 transition-all duration-300 min-h-screen flex flex-col">
      {/* Header */}
      <header className="mb-4 border-b border-slate-800 pb-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-xl md:text-2xl font-extrabold flex items-center gap-3">
              <Activity className="w-7 h-7 text-sky-400 status-pulse" />
              <span className="gradient-text">IV Drip AI Hub</span>
            </h1>
            <p className="text-slate-400 text-xs mt-0.5 font-light tracking-wide">Real-time Smart IV Infusion Monitoring Dashboard</p>
          </div>
          
          <div className="flex items-center gap-4">
            {/* Connection Status */}
            <div className="flex items-center gap-2">
              <div className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${mqttConnected ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                <span className={`w-1 h-1 rounded-full ${mqttConnected ? 'bg-green-400' : 'bg-red-400'} status-pulse`}></span>
                MQTT Connected
              </div>
              <div className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${apiAvailable ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'}`}>
                <span className={`w-1 h-1 rounded-full ${apiAvailable ? 'bg-green-400' : 'bg-amber-400'}`}></span>
                Database API
              </div>
            </div>
            
            {/* Refresh button */}
            <button 
              onClick={fetchHistoricalData}
              className="p-1.5 bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/50 rounded-lg transition-all duration-200"
              title="Refresh data"
            >
              <RefreshCw className="w-3.5 h-3.5 text-slate-300" />
            </button>
          </div>
        </div>
      </header>

      {/* Status Banner */}
      <div className={`mb-4 p-3 rounded-xl flex items-center justify-between transition-all duration-300 ${
        telemetry.status === 'danger' 
          ? 'bg-red-500/15 border border-red-500/40 danger-glow-pulse text-red-100' 
          : telemetry.status === 'warning' 
          ? 'bg-amber-500/15 border border-amber-500/40 text-amber-100' 
          : 'bg-green-500/15 border border-green-500/30 text-green-100'
      }`}>
        <div className="flex items-center gap-3">
          <StatusIcon className={`w-6 h-6 ${
            telemetry.status === 'danger' ? 'text-red-400' : telemetry.status === 'warning' ? 'text-amber-400' : 'text-green-400'
          } status-pulse`} />
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wide">System Status: {currentStatus.label}</h2>
            <p className="text-xs opacity-85 font-light">
              {telemetry.status === 'normal' && 'Infusion proceeding normally. All parameters stable.'}
              {telemetry.status === 'warning' && 'Warning: Flow rate anomalies detected. Please check line.'}
              {telemetry.status === 'danger' && 'CRITICAL: Infusion blockage or empty bag detected! Immediate intervention required.'}
            </p>
          </div>
        </div>
        <div className="text-right hidden sm:block">
          <p className="text-[10px] opacity-60">Last update</p>
          <p className="font-mono text-xs font-semibold">{formatTime(telemetry.timestamp)}</p>
        </div>
      </div>

      {/* Main Responsive Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 flex-1 items-stretch">
        {/* LEFT COLUMN: Controls & Hardware (col-span-4) */}
        <div className="lg:col-span-4 flex flex-col gap-4">
          {/* Device Info Card */}
          <div className="glass-card glow-cyan rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-cyan-400 tracking-wider">DEVICE METRICS</span>
              <Wifi className="w-4 h-4 text-cyan-400" />
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs text-slate-300">
              <div className="bg-slate-900/40 p-2 rounded-lg border border-slate-800/40">
                <span className="block text-[9px] text-slate-500 uppercase font-bold mb-0.5">WiFi Signal</span>
                <span className="font-mono font-semibold">{telemetry.rssi} dBm</span>
              </div>
              <div className="bg-slate-900/40 p-2 rounded-lg border border-slate-800/40">
                <span className="block text-[9px] text-slate-500 uppercase font-bold mb-0.5">Free Heap</span>
                <span className="font-mono font-semibold">{(telemetry.free_heap / 1024).toFixed(0)} KB</span>
              </div>
              <div className="bg-slate-900/40 p-2 rounded-lg border border-slate-800/40">
                <span className="block text-[9px] text-slate-500 uppercase font-bold mb-0.5">Uptime</span>
                <span className="font-mono font-semibold truncate">{formatUptime(telemetry.uptime_ms)}</span>
              </div>
            </div>
          </div>

          {/* Simulator Panel (Manual Controls) */}
          <SimulatorPanel mqttClient={mqttClientRef.current} servoAngle={telemetry.servo_angle} />
        </div>

        {/* RIGHT COLUMN: Charts, Metrics and Logs (col-span-8) */}
        <div className="lg:col-span-8 flex flex-col gap-4">
          {/* Metrics Row */}
          <div className="grid grid-cols-3 gap-4">
            {/* Volume Card */}
            <div className="glass-card glow-blue rounded-xl p-3.5">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold text-blue-400 tracking-wider uppercase">Remaining Volume</span>
                <Droplets className="w-4 h-4 text-blue-400" />
              </div>
              <div className="text-xl font-extrabold mb-1">
                {telemetry.volume_ml.toFixed(1)} <span className="text-xs font-normal text-slate-400">mL</span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-1.5 mb-1">
                <div 
                  className="bg-blue-500 h-1.5 rounded-full transition-all duration-500" 
                  style={{ width: `${volumePercentage}%` }}
                />
              </div>
              <span className="text-[9px] text-slate-400 font-light block">
                {volumePercentage > 80 ? 'Full Bag' : volumePercentage > 20 ? 'Infusing' : 'Bag Almost Empty'}
              </span>
            </div>

            {/* BPM Card */}
            <div className="glass-card glow-green rounded-xl p-3.5">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold text-green-400 tracking-wider uppercase">Infusion Rate</span>
                <Activity className="w-4 h-4 text-green-400" />
              </div>
              <div className="text-xl font-extrabold mb-1">
                {telemetry.bpm.toFixed(1)} <span className="text-xs font-normal text-slate-400">BPM</span>
              </div>
              <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                <span>Target:</span>
                <span className="font-mono text-amber-400 font-bold">{telemetry.target_bpm} BPM</span>
              </div>
            </div>

            {/* Servo Angle Card */}
            <div className="glass-card glow-purple rounded-xl p-3.5">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold text-purple-400 tracking-wider uppercase">Valve Aperture</span>
                <Settings className="w-4 h-4 text-purple-400" />
              </div>
              <div className="text-xl font-extrabold mb-1">
                {telemetry.servo_angle}°
              </div>
              <div className="w-full bg-slate-800 rounded-full h-1.5 mb-1">
                <div 
                  className="bg-purple-500 h-1.5 rounded-full transition-all duration-500" 
                  style={{ width: `${(telemetry.servo_angle / 90) * 100}%` }}
                />
              </div>
              <span className="text-[9px] text-slate-400 font-light block">
                {telemetry.servo_angle < 30 ? 'Closed' : telemetry.servo_angle > 60 ? 'Open' : 'Partially Open'}
              </span>
            </div>
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Volume Chart */}
            <div className="glass-card rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-bold flex items-center gap-1.5 text-slate-200">
                  <Droplets className="w-3.5 h-3.5 text-blue-400" />
                  Volume History
                </h3>
                <select 
                  value={chartTimeRange}
                  onChange={(e) => setChartTimeRange(e.target.value)}
                  className="bg-slate-800 text-[10px] px-2 py-0.5 rounded-md border border-slate-700 text-slate-200"
                >
                  <option value="1h">Last Hour</option>
                  <option value="6h">Last 6 Hours</option>
                  <option value="24h">Last 24 Hours</option>
                </select>
              </div>
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={historicalData}>
                    <defs>
                      <linearGradient id="colorVolume" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="time" stroke="#64748b" tick={{fontSize: 9}} />
                    <YAxis stroke="#64748b" tick={{fontSize: 9}} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '8px', fontSize: 10 }}
                      labelStyle={{ color: '#94a3b8' }}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="volume" 
                      stroke="#3b82f6" 
                      fillOpacity={1} 
                      fill="url(#colorVolume)" 
                      name="Volume"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* BPM Chart */}
            <div className="glass-card rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-bold flex items-center gap-1.5 text-slate-200">
                  <Activity className="w-3.5 h-3.5 text-green-400" />
                  Flow Rate (BPM)
                </h3>
                <div className="flex items-center gap-2 text-[10px]">
                  <span className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
                    BPM
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 bg-yellow-500 rounded-full"></span>
                    Target
                  </span>
                </div>
              </div>
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={historicalData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="time" stroke="#64748b" tick={{fontSize: 9}} />
                    <YAxis stroke="#64748b" tick={{fontSize: 9}} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '8px', fontSize: 10 }}
                      labelStyle={{ color: '#94a3b8' }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="bpm" 
                      stroke="#22c55e" 
                      strokeWidth={2}
                      dot={false}
                      name="Actual"
                    />
                    <Line 
                      type="monotone" 
                      dataKey="target_bpm" 
                      stroke="#eab308" 
                      strokeWidth={1.5}
                      strokeDasharray="4 4"
                      dot={false}
                      name="Target"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Alerts Section (Logs table max height bounded with internal scroll) */}
          <div className="glass-card rounded-xl p-4 flex flex-col flex-1 min-h-[160px] max-h-[220px]">
            <h3 className="text-xs font-bold mb-2 flex items-center gap-2 text-slate-200">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
              Infusion Safety Logs
            </h3>
            <div className="overflow-y-auto flex-1 pr-1">
              <table className="w-full text-[11px] med-table">
                <thead>
                  <tr className="text-slate-400 border-b border-slate-800 text-left">
                    <th className="py-2 px-3">Time</th>
                    <th className="py-2 px-3">Status</th>
                    <th className="py-2 px-3">Volume</th>
                    <th className="py-2 px-3">BPM</th>
                    <th className="py-2 px-3">Message</th>
                  </tr>
                </thead>
                <tbody>
                  {historicalData
                    .filter((_, idx) => idx % 5 === 0) // Show every 5th point for compact details
                    .slice(-8)
                    .reverse()
                    .map((row, idx) => {
                      const status = row.status || 'normal';
                      let statusBg = 'bg-green-500/10 text-green-400 border border-green-500/20';
                      let message = 'Normal';
                      if (status === 'warning') {
                        statusBg = 'bg-amber-500/10 text-amber-400 border border-amber-500/20';
                        message = 'Parameter outside range';
                      } else if (status === 'danger') {
                        statusBg = 'bg-red-500/10 text-red-400 border border-red-500/20';
                        message = 'Critical blockage / Empty bag';
                      }
                      return (
                        <tr key={idx} className="hover:bg-slate-800/30">
                          <td className="py-2 px-3 font-mono text-slate-400">{row.time}</td>
                          <td className="py-2 px-3">
                            <span className={`px-1.5 py-0.5 rounded-[4px] text-[9px] uppercase font-bold tracking-wide ${statusBg}`}>
                              {status}
                            </span>
                          </td>
                          <td className="py-2 px-3 font-semibold text-slate-300">{row.volume} mL</td>
                          <td className="py-2 px-3 font-semibold text-slate-300">{row.bpm} BPM</td>
                          <td className="py-2 px-3 text-slate-400">
                            {message}
                          </td>
                        </tr>
                      );
                    })}
                  {historicalData.length === 0 && (
                    <tr>
                      <td colSpan="5" className="py-4 text-center text-slate-500">
                        Waiting for telemetry connection...
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="mt-4 text-center text-slate-500 text-[10px] border-t border-slate-800/50 pt-2">
        <p>IV Drip AI Hub &copy; 2026 | Real-time Medical Infusion Control Cockpit</p>
      </footer>
    </div>
  );
}



export default App;