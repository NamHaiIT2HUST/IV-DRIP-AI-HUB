import React, { useState, useEffect } from 'react';
import { Play, Square, Activity, Droplets, Settings } from 'lucide-react';

const SimulatorPanel = ({ mqttClient, servoAngle }) => {
  const [simulationEnabled, setSimulationEnabled] = useState(false);
  const [simVolume, setSimVolume] = useState(500.0);
  const [simBPM, setSimBPM] = useState(0.0);
  const [manualValve, setManualValve] = useState(servoAngle || 45);
  
  // Initial volume input
  const [inputVolume, setInputVolume] = useState(500);

  // Refs for robust interval handling
  const stateRef = React.useRef({
    simVolume: 500.0,
    simBPM: 0.0,
    servoAngle: servoAngle || 45
  });

  // Keep refs in sync
  useEffect(() => {
    stateRef.current.servoAngle = servoAngle;
  }, [servoAngle]);

  useEffect(() => {
    stateRef.current.simVolume = simVolume;
    stateRef.current.simBPM = simBPM;
  }, [simVolume, simBPM]);

  // Update local manual valve state when servoAngle prop changes
  useEffect(() => {
    if (!simulationEnabled) {
      setManualValve(servoAngle);
    }
  }, [servoAngle, simulationEnabled]);

  const toggleSimulation = () => {
    const newState = !simulationEnabled;
    setSimulationEnabled(newState);
    
    if (newState) {
      setSimVolume(inputVolume);
      setSimBPM(0);
      
      // Publish immediate mode switch
      if (mqttClient) {
        mqttClient.publish('ivdrip/cmd', JSON.stringify({
          simulation_mode: true,
          sim_volume: inputVolume,
          sim_bpm: 0
        }));
      }
    } else {
      // Turn off simulation
      if (mqttClient) {
        mqttClient.publish('ivdrip/cmd', JSON.stringify({
          simulation_mode: false
        }));
      }
    }
  };

  const triggerDanger = () => {
    if (simulationEnabled) {
      setSimVolume(5.0);
      setSimBPM(0.0);
      if (mqttClient) {
        mqttClient.publish('ivdrip/cmd', JSON.stringify({
          simulation_mode: true,
          sim_volume: 5.0,
          sim_bpm: 0.0
        }));
      }
    }
  };

  const resolveDanger = () => {
    if (simulationEnabled) {
      setSimVolume(500.0);
      setSimBPM(60.0);
      if (mqttClient) {
        mqttClient.publish('ivdrip/cmd', JSON.stringify({
          simulation_mode: true,
          sim_volume: 500.0,
          sim_bpm: 60.0
        }));
      }
    }
  };

  const handleValveChange = (e) => {
    const angle = parseInt(e.target.value);
    setManualValve(angle);
    if (mqttClient) {
      mqttClient.publish('ivdrip/cmd', JSON.stringify({
        servo_angle: angle
      }));
    }
  };

  useEffect(() => {
    let interval;
    if (simulationEnabled) {
      interval = setInterval(() => {
        // Read latest state from refs to avoid closure staleness and interval recreation
        const currentAngle = stateRef.current.servoAngle;
        let currentVol = stateRef.current.simVolume;
        
        let calculatedBpm = Math.max(0, (currentAngle - 20) * 1.5);
        if (calculatedBpm > 0) {
            calculatedBpm += (Math.random() * 2 - 1); // ±1 BPM noise
        }
        
        const volumeDrop = (calculatedBpm / 60.0) * 0.05;
        currentVol -= volumeDrop;
        
        if (currentVol < 0) {
            currentVol = 0;
            calculatedBpm = 0; // stop dripping if empty
        }

        // Update state natively
        setSimBPM(calculatedBpm);
        setSimVolume(currentVol);

        // Publish to ESP32
        if (mqttClient) {
          mqttClient.publish('ivdrip/cmd', JSON.stringify({
            simulation_mode: true,
            sim_volume: parseFloat(currentVol.toFixed(2)),
            sim_bpm: parseFloat(calculatedBpm.toFixed(1))
          }));
        }

      }, 1000); // Run 1 tick per second
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [simulationEnabled, mqttClient]); // Removed volatile dependencies!

  return (
    <div className={`mt-6 p-4 rounded-xl border ${simulationEnabled ? 'bg-indigo-900/40 border-indigo-500/50' : 'bg-[#1a1f2c] border-gray-800'}`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold flex items-center text-white">
          <Activity className="w-5 h-5 mr-2 text-indigo-400" />
          System Settings & Simulation
        </h3>
        <button
          onClick={toggleSimulation}
          className={`flex items-center px-4 py-2 rounded-lg font-medium transition-colors ${
            simulationEnabled 
              ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/50' 
              : 'bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30 border border-indigo-500/50'
          }`}
        >
          {simulationEnabled ? (
            <><Square className="w-4 h-4 mr-2" /> Stop Simulation</>
          ) : (
            <><Play className="w-4 h-4 mr-2" /> Start Simulation</>
          )}
        </button>
        {simulationEnabled && (
          <div className="flex space-x-2 ml-2">
            <button
              onClick={triggerDanger}
              className="flex items-center px-4 py-2 rounded-lg font-medium transition-colors bg-red-600/20 text-red-500 hover:bg-red-600/40 border border-red-500"
            >
              Trigger Danger
            </button>
            <button
              onClick={resolveDanger}
              className="flex items-center px-4 py-2 rounded-lg font-medium transition-colors bg-green-600/20 text-green-500 hover:bg-green-600/40 border border-green-500"
            >
              Resolve Danger
            </button>
          </div>
        )}
      </div>

      {/* Manual Controls (Always Available) */}
      <div className="mt-6 border-t border-gray-700 pt-4">
        <h4 className="text-sm font-medium text-gray-300 mb-4 flex items-center gap-2">
          <Settings className="w-4 h-4 text-purple-400" />
          Manual Valve Control (Degree: {manualValve}°)
        </h4>
        <div className="flex items-center gap-4">
          <span className="text-xs text-gray-400">0° (Closed)</span>
          <input
            type="range"
            min="0"
            max="90"
            value={manualValve}
            onChange={handleValveChange}
            className="flex-1 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
          />
          <span className="text-xs text-gray-400">90° (Open)</span>
        </div>
      </div>

      <div className="mt-4 pb-4">
        <h4 className="text-sm font-medium text-gray-300 mb-4 flex items-center gap-2">
          <Droplets className="w-4 h-4 text-blue-400" />
          Set Initial Volume
        </h4>
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={inputVolume}
            onChange={(e) => setInputVolume(Number(e.target.value))}
            className="bg-gray-800 border border-gray-600 rounded px-3 py-1 w-24 text-white"
          />
          <span className="text-sm text-gray-400">mL</span>
          <button
            onClick={() => {
              setSimVolume(parseFloat(inputVolume));
              if (mqttClient) {
                mqttClient.publish('ivdrip/cmd', JSON.stringify({
                  sim_volume: parseFloat(inputVolume)
                }));
              }
            }}
            className="ml-2 px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-sm transition-colors"
          >
            Update Volume
          </button>
        </div>
      </div>

      {/* Simulation Controls */}
      {simulationEnabled && (
        <div className="mt-6 border-t border-gray-700 pt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-black/20 p-4 rounded-lg">
              <span className="block text-sm text-gray-400 mb-1">Simulated Volume</span>
              <span className="text-2xl font-bold text-white">
                {simVolume.toFixed(1)} <span className="text-sm text-gray-500 font-normal">mL</span>
              </span>
            </div>

            <div className="bg-black/20 p-4 rounded-lg">
              <span className="block text-sm text-gray-400 mb-1">Simulated BPM</span>
              <span className="text-2xl font-bold text-white">
                {simBPM.toFixed(1)} <span className="text-sm text-gray-500 font-normal">BPM</span>
              </span>
              <div className="text-xs text-gray-500 mt-1">Calculated from Servo: {servoAngle}°</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SimulatorPanel;
