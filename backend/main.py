"""
FastAPI Backend for IV Drip Hub.

This module provides REST API endpoints for:
1. Querying historical IV drip data from InfluxDB
2. Real-time status monitoring
3. Device management

The API serves data to the React frontend for visualization.
"""

from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta, timezone
import json

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from influxdb_client import InfluxDBClient
from influxdb_client.client.query_api import QueryApi
from loguru import logger
import uvicorn

# Configuration
INFLUXDB_URL = "http://localhost:8087"
INFLUXDB_TOKEN = "L-Xz9sxCt6nxdlNJJsWMRoXSNGeKgI5z0_6dv_J2HQw4evAix-ry6x0SraDPjCYjtDHQBtj0BU8CAFAQm5QYVw=="
INFLUXDB_ORG = "soict"
INFLUXDB_BUCKET = "telemetry_bucket"

# Initialize FastAPI app
app = FastAPI(
    title="IV Drip Hub API",
    description="REST API for IV Drip Monitoring System",
    version="1.0.0"
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",  # Vite dev server
        "http://localhost:3000",  # React dev server
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logger.add("logs/ivdrip_api.log", rotation="1 day", retention="7 days")


# ============================================================================
# Pydantic Models
# ============================================================================

class TelemetryData(BaseModel):
    """Model for a single telemetry data point."""
    time: datetime
    volume_ml: float
    bpm: float
    target_bpm: float
    servo_angle: int
    status: str
    rssi: int
    free_heap: int
    uptime_ms: int
    device_id: str


class TelemetryResponse(BaseModel):
    """Response model for telemetry data."""
    data: List[TelemetryData]
    count: int
    start_time: str
    end_time: str


class StatusResponse(BaseModel):
    """Response model for current status."""
    device_id: str
    status: str
    volume_ml: float
    bpm: float
    target_bpm: float
    servo_angle: int
    last_update: datetime
    uptime_ms: int


class AlertConfig(BaseModel):
    """Model for alert configuration."""
    volume_empty_threshold: float = Field(default=10.0, description="Volume threshold for empty alert (mL)")
    bpm_high_threshold: float = Field(default=120.0, description="High BPM threshold")
    bpm_low_threshold: float = Field(default=20.0, description="Low BPM threshold")


# ============================================================================
# InfluxDB Helper Functions
# ============================================================================

def get_influx_client() -> InfluxDBClient:
    """Get InfluxDB client instance."""
    return InfluxDBClient(
        url=INFLUXDB_URL,
        token=INFLUXDB_TOKEN,
        org=INFLUXDB_ORG,
        verify_ssl=False
    )


def query_to_list(result, measurement: str = "iv_drip") -> List[Dict[str, Any]]:
    """Convert InfluxDB query result to list of dictionaries."""
    data_points = []
    
    for table in result:
        for record in table.records:
            point = {
                "time": record.get_time(),
                "device_id": record.values.get("device_id", "unknown"),
            }
            
            # Add all field values
            for field in ["volume_ml", "bpm", "target_bpm", "servo_angle", 
                         "rssi", "free_heap", "uptime_ms"]:
                point[field] = record.values.get(field, 0)
            
            # Add status from tag
            point["status"] = record.values.get("status", "unknown")
            
            data_points.append(point)
    
    return data_points


# ============================================================================
# API Routes
# ============================================================================

@app.get("/")
async def root():
    """Root endpoint with API information."""
    return {
        "name": "IV Drip Hub API",
        "version": "1.0.0",
        "description": "REST API for IV Drip Monitoring System",
        "endpoints": {
            "telemetry": "/api/telemetry",
            "status": "/api/status",
            "alerts": "/api/alerts",
            "health": "/api/health"
        }
    }


@app.get("/api/health")
async def health_check():
    """Health check endpoint."""
    try:
        client = get_influx_client()
        health = client.health()
        client.close()
        
        return {
            "status": "healthy",
            "database": health.status if health else "unknown",
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return {
            "status": "unhealthy",
            "error": str(e),
            "timestamp": datetime.now(timezone.utc).isoformat()
        }


@app.get("/api/status", response_model=StatusResponse)
async def get_current_status():
    """Get the most recent telemetry data (current status)."""
    try:
        client = get_influx_client()
        query_api = client.query_api()
        
        # Query for the most recent data point
        query = f'''
            from(bucket: "{INFLUXDB_BUCKET}")
            |> range(start: -1h)
            |> filter(fn: (r) => r._measurement == "iv_drip")
            |> filter(fn: (r) => r._field == "volume_ml" or r._field == "bpm" or 
                             r._field == "target_bpm" or r._field == "servo_angle" or
                             r._field == "rssi" or r._field == "free_heap" or 
                             r._field == "uptime_ms")
            |> last()
            |> pivot(rowKey:["_time"], columnKey: ["_field"], valueColumn: "_value")
        '''
        
        result = query_api.query(query)
        client.close()
        
        if not result or not result[0].records:
            raise HTTPException(status_code=404, detail="No data available")
        
        record = result[0].records[-1]
        
        return StatusResponse(
            device_id=record.values.get("device_id", "unknown"),
            status=record.values.get("status", "unknown"),
            volume_ml=float(record.values.get("volume_ml", 0)),
            bpm=float(record.values.get("bpm", 0)),
            target_bpm=float(record.values.get("target_bpm", 60)),
            servo_angle=int(record.values.get("servo_angle", 45)),
            last_update=record.get_time(),
            uptime_ms=int(record.values.get("uptime_ms", 0))
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get current status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/telemetry", response_model=TelemetryResponse)
async def get_telemetry(
    start: str = Query(default="-1h", description="Start time (InfluxDB format, e.g., -1h, -24h, 2024-01-01T00:00:00Z)"),
    end: str = Query(default="now", description="End time (InfluxDB format)"),
    limit: int = Query(default=1000, ge=1, le=10000, description="Maximum number of data points")
):
    """Get historical telemetry data within a time range."""
    try:
        client = get_influx_client()
        query_api = client.query_api()
        
        # Build query
        query = f'''
            from(bucket: "{INFLUXDB_BUCKET}")
            |> range(start: {start}, stop: {end})
            |> filter(fn: (r) => r._measurement == "iv_drip")
            |> filter(fn: (r) => r._field == "volume_ml" or r._field == "bpm" or 
                             r._field == "target_bpm" or r._field == "servo_angle" or
                             r._field == "rssi" or r._field == "free_heap" or 
                             r._field == "uptime_ms")
            |> sort(columns: ["_time"], desc: false)
            |> limit(n: {limit})
            |> pivot(rowKey:["_time"], columnKey: ["_field"], valueColumn: "_value")
        '''
        
        result = query_api.query(query)
        client.close()
        
        # Convert to list of TelemetryData
        data_points = []
        for table in result:
            for record in table.records:
                try:
                    data_points.append(TelemetryData(
                        time=record.get_time(),
                        volume_ml=float(record.values.get("volume_ml", 0)),
                        bpm=float(record.values.get("bpm", 0)),
                        target_bpm=float(record.values.get("target_bpm", 60)),
                        servo_angle=int(record.values.get("servo_angle", 45)),
                        status=str(record.values.get("status", "unknown")),
                        rssi=int(record.values.get("rssi", 0)),
                        free_heap=int(record.values.get("free_heap", 0)),
                        uptime_ms=int(record.values.get("uptime_ms", 0)),
                        device_id=str(record.values.get("device_id", "unknown"))
                    ))
                except (ValueError, TypeError) as e:
                    logger.warning(f"Skipping invalid record: {e}")
                    continue
        
        return TelemetryResponse(
            data=data_points,
            count=len(data_points),
            start_time=start,
            end_time=end
        )
        
    except Exception as e:
        logger.error(f"Failed to get telemetry data: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/telemetry/stats")
async def get_telemetry_stats(
    start: str = Query(default="-24h", description="Start time"),
    end: str = Query(default="now", description="End time")
):
    """Get statistical summary of telemetry data."""
    try:
        client = get_influx_client()
        query_api = client.query_api()
        
        # Query for statistics
        query = f'''
            from(bucket: "{INFLUXDB_BUCKET}")
            |> range(start: {start}, stop: {end})
            |> filter(fn: (r) => r._measurement == "iv_drip")
            |> filter(fn: (r) => r._field == "volume_ml" or r._field == "bpm" or r._field == "servo_angle")
            |> aggregateWindow(every: 1h, fn: mean, createEmpty: false)
            |> yield(name: "hourly_mean")
        '''
        
        result = query_api.query(query)
        client.close()
        
        # Process results
        stats = {
            "volume_ml": {"min": 0, "max": 0, "avg": 0},
            "bpm": {"min": 0, "max": 0, "avg": 0},
            "servo_angle": {"min": 0, "max": 0, "avg": 0}
        }
        
        for table in result:
            for record in table.records:
                field = record.values.get("_field", "")
                value = float(record.values.get("_value", 0))
                
                if field in stats:
                    if stats[field]["min"] == 0 or value < stats[field]["min"]:
                        stats[field]["min"] = value
                    if value > stats[field]["max"]:
                        stats[field]["max"] = value
                    stats[field]["avg"] = (stats[field]["avg"] + value) / 2
        
        return {
            "period": {"start": start, "end": end},
            "statistics": stats,
            "generated_at": datetime.now(timezone.utc).isoformat()
        }
        
    except Exception as e:
        logger.error(f"Failed to get statistics: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/alerts")
async def get_alerts(
    start: str = Query(default="-24h", description="Start time"),
    end: str = Query(default="now", description="End time")
):
    """Get all alert events (danger/warning status) within a time range."""
    try:
        client = get_influx_client()
        query_api = client.query_api()
        
        query = f'''
            from(bucket: "{INFLUXDB_BUCKET}")
            |> range(start: {start}, stop: {end})
            |> filter(fn: (r) => r._measurement == "iv_drip")
            |> filter(fn: (r) => r._field == "status")
            |> filter(fn: (r) => r._value == "danger" or r._value == "warning")
            |> sort(columns: ["_time"], desc: true)
        '''
        
        result = query_api.query(query)
        client.close()
        
        alerts = []
        for table in result:
            for record in table.records:
                alerts.append({
                    "time": record.get_time(),
                    "status": record.values.get("_value", "unknown"),
                    "volume_ml": record.values.get("volume_ml", 0),
                    "bpm": record.values.get("bpm", 0),
                    "device_id": record.values.get("device_id", "unknown")
                })
        
        return {
            "alerts": alerts,
            "count": len(alerts),
            "period": {"start": start, "end": end}
        }
        
    except Exception as e:
        logger.error(f"Failed to get alerts: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/config/alerts")
async def update_alert_config(config: AlertConfig):
    """Update alert thresholds (for future implementation)."""
    # This would typically write to a configuration database
    return {
        "message": "Alert configuration updated",
        "config": config.dict()
    }


# ============================================================================
# Main Entry Point
# ============================================================================

if __name__ == "__main__":
    # Create logs directory
    import os
    os.makedirs("logs", exist_ok=True)
    
    # Run the server
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8000,
        log_level="info"
    )