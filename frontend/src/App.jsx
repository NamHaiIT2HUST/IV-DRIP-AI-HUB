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
            const data = JSON.parse(message.toString());
            
            if (topic === 'ivdrip/telemetry') {
              setTelemetry(prev => ({
                ...data,
                timestamp: data.timestamp || Date.now()
              }));
              
              // Add to chart data
              setHistoricalData(prev => {
                const newData = [...prev, {
                  time: formatTime(data.timestamp || Date.now()),
                  volume: parseFloat(data.volume_ml?.toFixed(1) || 0),
                  bpm: parseFloat(data.bpm?.toFixed(1) || 0),
                  target_bpm: parseFloat(data.target_bpm?.toFixed(1) || 60),
                  servo_angle: data.servo_angle || 45
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
          servo_angle: point.servo_angle
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
    <div className="min-h-screen bg-gray-900 text-white p-4 md:p-6">
      {/* Header */}
      <header className="mb-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-white flex items-center gap-3">
              <Activity className="w-8 h-8 text-blue-500" />
              IV Drip AI Hub
            </h1>
            <p className="text-gray-400 text-sm mt-1">Real-time IV Monitoring System</p>
          </div>
          
          <div className="flex items-center gap-4">
            {/* Connection Status */}
            <div className="flex items-center gap-2">
              <div className={`flex items-center gap-1 px-3 py-1 rounded-full text-sm ${mqttConnected ? 'bg-green-900 text-green-400' : 'bg-red-900 text-red-400'}`}>
                {mqttConnected ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
                MQTT
              </div>
              <div className={`flex items-center gap-1 px-3 py-1 rounded-full text-sm ${apiAvailable ? 'bg-green-900 text-green-400' : 'bg-yellow-900 text-yellow-400'}`}>
                API
              </div>
            </div>
            
            {/* Refresh button */}
            <button 
              onClick={fetchHistoricalData}
              className="p-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
              title="Refresh data"
            >
              <RefreshCw className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Status Banner */}
      <div className={`mb-6 p-4 rounded-lg flex items-center justify-between ${currentStatus.bg} bg-opacity-20 border border-${telemetry.status === 'normal' ? 'green' : telemetry.status === 'warning' ? 'yellow' : 'red'}-500`}>
        <div className="flex items-center gap-3">
          <StatusIcon className={`w-8 h-8 text-${telemetry.status === 'normal' ? 'green' : telemetry.status === 'warning' ? 'yellow' : 'red'}-500`} />
          <div>
            <h2 className="text-xl font-semibold">Status: {currentStatus.label}</h2>
            <p className="text-sm opacity-80">
              {telemetry.status === 'normal' && 'All parameters within normal range'}
              {telemetry.status === 'warning' && 'Parameters outside normal range - attention required'}
              {telemetry.status === 'danger' && 'Critical condition - immediate action required'}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-sm opacity-80">Last Update</p>
          <p className="font-mono">{formatTime(telemetry.timestamp)}</p>
        </div>
      </div>

      {/* Main Dashboard Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {/* Volume Card */}
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <div className="flex items-center justify-between mb-2">
            <Droplets className="w-5 h-5 text-blue-400" />
            <span className="text-xs text-gray-400">VOLUME</span>
          </div>
          <div className="text-2xl font-bold mb-2">
            {telemetry.volume_ml.toFixed(1)} <span className="text-sm font-normal text-gray-400">mL</span>
          </div>
          <div className="w-full bg-gray-700 rounded-full h-2">
            <div 
              className="bg-blue-500 h-2 rounded-full transition-all duration-500" 
              style={{ width: `${volumePercentage}%` }}
            />
          </div>
          <p className="text-xs text-gray-400 mt-1">
            {volumePercentage > 80 ? 'Full' : volumePercentage > 20 ? 'In Use' : 'Low - Replace Soon'}
          </p>
        </div>

        {/* BPM Card */}
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <div className="flex items-center justify-between mb-2">
            <Activity className="w-5 h-5 text-green-400" />
            <span className="text-xs text-gray-400">DROP RATE</span>
          </div>
          <div className="text-2xl font-bold mb-2">
            {telemetry.bpm.toFixed(1)} <span className="text-sm font-normal text-gray-400">BPM</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-400">Target:</span>
            <span className="font-mono">{telemetry.target_bpm} BPM</span>
          </div>
          <div className="w-full bg-gray-700 rounded-full h-2 mt-2">
            <div 
              className={`h-2 rounded-full transition-all duration-500 ${bpmPercentage > 120 || bpmPercentage < 50 ? 'bg-red-500' : 'bg-green-500'}`}
              style={{ width: `${Math.min(100, bpmPercentage)}%` }}
            />
          </div>
        </div>

        {/* Servo Angle Card */}
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <div className="flex items-center justify-between mb-2">
            <Settings className="w-5 h-5 text-purple-400" />
            <span className="text-xs text-gray-400">VALVE POSITION</span>
          </div>
          <div className="text-2xl font-bold mb-2">
            {telemetry.servo_angle}°
          </div>
          <div className="w-full bg-gray-700 rounded-full h-2">
            <div 
              className="bg-purple-500 h-2 rounded-full transition-all duration-500" 
              style={{ width: `${(telemetry.servo_angle / 90) * 100}%` }}
            />
          </div>
          <p className="text-xs text-gray-400 mt-1">
            {telemetry.servo_angle < 30 ? 'Mostly Closed' : telemetry.servo_angle > 60 ? 'Mostly Open' : 'Partially Open'}
          </p>
        </div>

        {/* Device Info Card */}
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <div className="flex items-center justify-between mb-2">
            <Wifi className="w-5 h-5 text-cyan-400" />
            <span className="text-xs text-gray-400">DEVICE</span>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Signal:</span>
              <span className="font-mono">{telemetry.rssi} dBm</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Memory:</span>
              <span className="font-mono">{(telemetry.free_heap / 1024).toFixed(0)} KB</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Uptime:</span>
              <span className="font-mono">{formatUptime(telemetry.uptime_ms)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {/* Volume Chart */}
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Droplets className="w-5 h-5 text-blue-400" />
              Volume History
            </h3>
            <select 
              value={chartTimeRange}
              onChange={(e) => setChartTimeRange(e.target.value)}
              className="bg-gray-700 text-sm px-3 py-1 rounded-lg"
            >
              <option value="1h">Last Hour</option>
              <option value="6h">Last 6 Hours</option>
              <option value="24h">Last 24 Hours</option>
              <option value="7d">Last 7 Days</option>
            </select>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={historicalData}>
                <defs>
                  <linearGradient id="colorVolume" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.1}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="time" stroke="#9ca3af" tick={{fontSize: 12}} />
                <YAxis stroke="#9ca3af" tick={{fontSize: 12}} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }}
                  labelStyle={{ color: '#9ca3af' }}
                />
                <Area 
                  type="monotone" 
                  dataKey="volume" 
                  stroke="#3b82f6" 
                  fillOpacity={1} 
                  fill="url(#colorVolume)" 
                  name="Volume (mL)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* BPM Chart */}
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Activity className="w-5 h-5 text-green-400" />
              Drop Rate History
            </h3>
            <div className="flex items-center gap-2 text-sm">
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 bg-green-500 rounded-full"></span>
                Actual
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 bg-yellow-500 rounded-full"></span>
                Target
              </span>
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={historicalData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="time" stroke="#9ca3af" tick={{fontSize: 12}} />
                <YAxis stroke="#9ca3af" tick={{fontSize: 12}} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }}
                  labelStyle={{ color: '#9ca3af' }}
                />
                <Legend />
                <Line 
                  type="monotone" 
                  dataKey="bpm" 
                  stroke="#22c55e" 
                  strokeWidth={2}
                  dot={false}
                  name="Actual BPM"
                />
                <Line 
                  type="monotone" 
                  dataKey="target_bpm" 
                  stroke="#eab308" 
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  dot={false}
                  name="Target BPM"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Simulator Panel */}
      <SimulatorPanel mqttClient={mqttClientRef.current} servoAngle={telemetry.servo_angle} />

      {/* Alerts Section */}
      <div className="mt-6 bg-gray-800 rounded-lg p-4 border border-gray-700">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-yellow-400" />
          Recent Alerts
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-400 border-b border-gray-700">
                <th className="text-left py-2 px-3">Time</th>
                <th className="text-left py-2 px-3">Status</th>
                <th className="text-left py-2 px-3">Volume</th>
                <th className="text-left py-2 px-3">BPM</th>
                <th className="text-left py-2 px-3">Message</th>
              </tr>
            </thead>
            <tbody>
              {historicalData
                .filter((_, idx) => idx % 10 === 0) // Show every 10th point as sample
                .slice(-10)
                .reverse()
                .map((row, idx) => {
                  const status = row.bpm > 120 || row.volume < 50 ? 'warning' : 'normal';
                  return (
                    <tr key={idx} className="border-b border-gray-800 hover:bg-gray-750">
                      <td className="py-2 px-3 font-mono">{row.time}</td>
                      <td className="py-2 px-3">
                        <span className={`px-2 py-1 rounded text-xs ${status === 'warning' ? 'bg-yellow-900 text-yellow-400' : 'bg-green-900 text-green-400'}`}>
                          {status}
                        </span>
                      </td>
                      <td className="py-2 px-3">{row.volume} mL</td>
                      <td className="py-2 px-3">{row.bpm} BPM</td>
                      <td className="py-2 px-3 text-gray-400">
                        {status === 'warning' ? 'Parameter outside range' : 'Normal'}
                      </td>
                    </tr>
                  );
                })}
              {historicalData.length === 0 && (
                <tr>
                  <td colSpan="5" className="py-4 text-center text-gray-500">
                    No data available. Waiting for telemetry...
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer */}
      <footer className="mt-6 text-center text-gray-500 text-sm">
        <p>IV Drip AI Hub &copy; 2024 | Real-time Medical Monitoring System</p>
      </footer>
    </div>
  );
}

export default App;