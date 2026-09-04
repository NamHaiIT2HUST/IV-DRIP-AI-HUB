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
    setManualValve(servoAngle);
  }, [servoAngle]);

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
        if (currentVol <= 10.0) {
            calculatedBpm = 0; // Stop dripping if volume is below empty/critical threshold (blockage/empty)
        } else if (calculatedBpm > 0) {
            calculatedBpm += (Math.random() * 2 - 1); // ±1 BPM noise
        }
        
        const volumeDrop = (calculatedBpm / 60.0) * 0.05;
        currentVol -= volumeDrop;
        
        if (currentVol < 0) {
            currentVol = 0;
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
    <div className={`mt-6 glass-card rounded-2xl p-6 transition-all duration-300 ${simulationEnabled ? 'border-indigo-500/30 glow-purple' : ''}`}>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-5 pb-4 border-b border-slate-800">
        <h3 className="text-base font-bold flex items-center text-slate-100">
          <Activity className="w-5 h-5 mr-2 text-indigo-400 status-pulse" />
          Simulation Control Cockpit
        </h3>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={toggleSimulation}
            className={`flex items-center px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
              simulationEnabled 
                ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/30' 
                : 'bg-indigo-500/15 text-indigo-400 hover:bg-indigo-500/25 border border-indigo-500/30'
            }`}
          >
            {simulationEnabled ? (
              <><Square className="w-4 h-4 mr-2" /> Stop Simulation</>
            ) : (
              <><Play className="w-4 h-4 mr-2" /> Start Simulation</>
            )}
          </button>
          {simulationEnabled && (
            <div className="flex items-center gap-2">
              <button
                onClick={triggerDanger}
                className="flex items-center px-3.5 py-2 rounded-lg text-xs font-bold transition-all duration-200 bg-red-600/15 text-red-400 hover:bg-red-600/25 border border-red-500/30"
              >
                Trigger Danger
              </button>
              <button
                onClick={resolveDanger}
                className="flex items-center px-3.5 py-2 rounded-lg text-xs font-bold transition-all duration-200 bg-green-600/15 text-green-400 hover:bg-green-600/25 border border-green-500/30"
              >
                Resolve Danger
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Manual Controls (Always Available) */}
      <div className="mt-4">
        <h4 className="text-xs font-semibold text-purple-400 mb-3 uppercase tracking-wider flex items-center gap-2">
          <Settings className="w-3.5 h-3.5 text-purple-400" />
          Manual Valve Position: {manualValve}°
        </h4>
        <div className="flex items-center gap-4 bg-slate-900/40 p-4 rounded-xl border border-slate-800/50">
          <span className="text-[10px] uppercase font-bold text-slate-500">Closed</span>
          <input
            type="range"
            min="0"
            max="90"
            value={manualValve}
            onChange={handleValveChange}
            className="flex-1 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-purple-500"
          />
          <span className="text-[10px] uppercase font-bold text-slate-500">Fully Open</span>
        </div>
      </div>

      <div className="mt-5 pb-2">
        <h4 className="text-xs font-semibold text-blue-400 mb-3 uppercase tracking-wider flex items-center gap-2">
          <Droplets className="w-3.5 h-3.5 text-blue-400" />
          Set Initial Infusion Volume
        </h4>
        <div className="flex items-center gap-3 bg-slate-900/40 p-4 rounded-xl border border-slate-800/50">
          <input
            type="number"
            value={inputVolume}
            onChange={(e) => setInputVolume(Number(e.target.value))}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 w-24 text-sm text-slate-100 font-semibold focus:outline-none focus:border-blue-500"
          />
          <span className="text-xs font-bold text-slate-400">mL</span>
          <button
            onClick={() => {
              setSimVolume(parseFloat(inputVolume));
              if (mqttClient) {
                mqttClient.publish('ivdrip/cmd', JSON.stringify({
                  sim_volume: parseFloat(inputVolume)
                }));
              }
            }}
            className="ml-2 px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-xs font-bold text-white rounded-lg transition-all duration-200 shadow-lg shadow-blue-500/10"
          >
            Update Volume
          </button>
        </div>
      </div>

      {/* Simulation Dynamic Value Displays */}
      {simulationEnabled && (
        <div className="mt-5 pt-5 border-t border-slate-800/60">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-slate-950/40 p-4 rounded-xl border border-slate-800/50">
              <span className="block text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-1">Simulated Volume remaining</span>
              <span className="text-xl font-bold text-slate-200">
                {simVolume.toFixed(1)} <span className="text-xs text-slate-500 font-normal">mL</span>
              </span>
            </div>

            <div className="bg-slate-950/40 p-4 rounded-xl border border-slate-800/50">
              <span className="block text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-1">Simulated Infusion Drop Rate</span>
              <span className="text-xl font-bold text-slate-200">
                {simBPM.toFixed(1)} <span className="text-xs text-slate-500 font-normal">BPM</span>
              </span>
              <div className="text-[10px] text-indigo-400 mt-1">Reflecting Current Servo Position: {servoAngle}°</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SimulatorPanel;
