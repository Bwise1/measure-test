"use client";

import React, { useState, useRef, useEffect } from "react";
import { Point, Measurement } from "./types";
import { ZoomIn, ZoomOut, Move, Ruler } from "lucide-react";

const FloorPlanMeasure: React.FC = () => {
  const [scale, setScale] = useState<number | null>(null);
  const [calibrationMode, setCalibrationMode] = useState<boolean>(false);
  const [calibrationPoints, setCalibrationPoints] = useState<Point[]>([]);
  const [calibrationDistance, setCalibrationDistance] = useState<string>("");
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [currentMeasurement, setCurrentMeasurement] = useState<Point[]>([]);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<Point | null>(null);
  const [tool, setTool] = useState<"measure" | "pan">("measure");

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    drawCanvas();
  }, [
    calibrationPoints,
    measurements,
    currentMeasurement,
    image,
    scale,
    zoom,
    pan,
  ]);

  const drawCanvas = (): void => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Clear the entire canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Save the current context state
    ctx.save();

    // Apply pan and zoom transformations
    ctx.translate(pan.x, pan.y);
    ctx.scale(zoom, zoom);

    // Draw the floor plan image
    if (image && imageRef.current) {
      ctx.drawImage(imageRef.current, 0, 0);
    }

    // Draw calibration line with enhanced visibility
    if (calibrationPoints.length === 2) {
      ctx.beginPath();
      ctx.moveTo(calibrationPoints[0].x, calibrationPoints[0].y);
      ctx.lineTo(calibrationPoints[1].x, calibrationPoints[1].y);
      ctx.strokeStyle = "#00ff00";
      ctx.lineWidth = 2 / zoom; // Adjust line width for zoom
      ctx.stroke();

      // Draw calibration points
      calibrationPoints.forEach((point) => {
        ctx.beginPath();
        ctx.arc(point.x, point.y, 4 / zoom, 0, 2 * Math.PI);
        ctx.fillStyle = "#00ff00";
        ctx.fill();
      });
    }

    // Draw saved measurements with enhanced styling
    measurements.forEach((measure) => {
      drawMeasurementLine(ctx, measure.points, measure.distance);
    });

    // Draw current measurement
    if (currentMeasurement.length > 0) {
      drawMeasurementLine(ctx, currentMeasurement);
    }

    // Restore the context state
    ctx.restore();
  };

  const drawMeasurementLine = (
    ctx: CanvasRenderingContext2D,
    points: Point[],
    distance?: number
  ): void => {
    if (points.length < 2) return;

    // Draw the main measurement line
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    ctx.lineTo(points[1].x, points[1].y);
    ctx.strokeStyle = "#2563eb";
    ctx.lineWidth = 2 / zoom;
    ctx.stroke();

    // Draw end points
    points.forEach((point) => {
      ctx.beginPath();
      ctx.arc(point.x, point.y, 4 / zoom, 0, 2 * Math.PI);
      ctx.fillStyle = "#2563eb";
      ctx.fill();
    });

    // Draw measurement label
    if (scale && distance !== undefined) {
      const midX = (points[0].x + points[1].x) / 2;
      const midY = (points[0].y + points[1].y) / 2;

      ctx.save();
      ctx.scale(1 / zoom, 1 / zoom); // Scale text back to normal size

      const scaledMidX = midX * zoom;
      const scaledMidY = midY * zoom;

      // Enhanced label background
      ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
      ctx.fillRect(scaledMidX - 45, scaledMidY - 12, 90, 24);

      // Label text
      ctx.font = "14px Arial";
      ctx.fillStyle = "#2563eb";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`${distance.toFixed(2)}m`, scaledMidX, scaledMidY);

      ctx.restore();
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event: ProgressEvent<FileReader>) => {
        const img = new Image();
        img.onload = () => {
          imageRef.current = img;
          const canvas = canvasRef.current;
          if (canvas) {
            canvas.width = canvas.offsetWidth;
            canvas.height = (img.height / img.width) * canvas.offsetWidth;
            setImage(img);
            // Reset view when loading new image
            setZoom(1);
            setPan({ x: 0, y: 0 });
          }
        };
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  };

  const getCanvasCoordinates = (
    e: React.MouseEvent<HTMLCanvasElement>
  ): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    // Adjust for pan and zoom
    const x = (e.clientX - rect.left - pan.x) / zoom;
    const y = (e.clientY - rect.top - pan.y) / zoom;
    return { x, y };
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>): void => {
    if (tool === "pan") return;

    const point = getCanvasCoordinates(e);

    if (calibrationMode) {
      if (calibrationPoints.length < 2) {
        setCalibrationPoints([...calibrationPoints, point]);
      }
      if (calibrationPoints.length === 1) {
        const dx = point.x - calibrationPoints[0].x;
        const dy = point.y - calibrationPoints[0].y;
        const pixelDistance = Math.sqrt(dx * dx + dy * dy);
        const distance = parseFloat(calibrationDistance);
        if (!isNaN(distance)) {
          setScale(pixelDistance / distance);
          setCalibrationMode(false);
        }
      }
    } else {
      if (currentMeasurement.length < 2) {
        setCurrentMeasurement([...currentMeasurement, point]);
      }
      if (currentMeasurement.length === 1) {
        const dx = point.x - currentMeasurement[0].x;
        const dy = point.y - currentMeasurement[0].y;
        const pixelDistance = Math.sqrt(dx * dx + dy * dy);
        const meters = scale ? pixelDistance / scale : pixelDistance;

        setMeasurements([
          ...measurements,
          {
            points: [...currentMeasurement, point],
            distance: meters,
          },
        ]);
        setCurrentMeasurement([]);
      }
    }
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (tool === "pan") {
      setIsDragging(true);
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isDragging && dragStart) {
      setPan({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setDragStart(null);
  };

  const handleZoomIn = () => {
    setZoom((prev) => Math.min(prev * 1.2, 5));
  };

  const handleZoomOut = () => {
    setZoom((prev) => Math.max(prev / 1.2, 0.5));
  };

  return (
    <div className="w-full max-w-4xl p-4 space-y-4">
      <div className="space-y-2">
        <input
          type="file"
          accept="image/*"
          onChange={handleImageUpload}
          className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
        />

        <div className="flex space-x-2">
          <input
            type="number"
            value={calibrationDistance}
            onChange={(e) => setCalibrationDistance(e.target.value)}
            placeholder="Known distance (meters)"
            className="px-3 py-2 border rounded"
          />
          <button
            onClick={() => {
              setCalibrationMode(true);
              setCalibrationPoints([]);
            }}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Calibrate
          </button>
          <button
            onClick={() => setCalibrationPoints([])}
            className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
          >
            Clear Calibration
          </button>
        </div>

        <div className="flex space-x-2">
          <button
            onClick={handleZoomIn}
            className="p-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 shadow-lg transition flex items-center justify-center"
            title="Zoom In"
            aria-label="Zoom In"
          >
            <ZoomIn className="w-5 h-5" />
          </button>
          <button
            onClick={handleZoomOut}
            className="p-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 shadow-lg transition flex items-center justify-center"
            title="Zoom Out"
            aria-label="Zoom Out"
          >
            <ZoomOut className="w-5 h-5" />
          </button>
          <button
            onClick={() => setTool(tool === "pan" ? "measure" : "pan")}
            className={`p-3 rounded-lg shadow-lg transition flex items-center justify-center ${
              tool === "pan"
                ? "bg-purple-600 text-white hover:bg-purple-700"
                : "bg-gray-200 text-gray-800 hover:bg-gray-300"
            }`}
            title={tool === "pan" ? "Switch to Measure" : "Switch to Pan"}
            aria-label={tool === "pan" ? "Switch to Measure" : "Switch to Pan"}
          >
            {tool === "pan" ? (
              <Move className="w-6 h-6" />
            ) : (
              <Ruler className="w-6 h-6" />
            )}
          </button>
        </div>
      </div>

      <div
        ref={containerRef}
        className="relative border rounded bg-gray-100 overflow-hidden"
      >
        <canvas
          ref={canvasRef}
          onClick={handleCanvasClick}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          className={`w-full h-full ${
            tool === "measure" ? "cursor-crosshair" : "cursor-grab"
          } ${isDragging ? "cursor-grabbing" : ""}`}
        />

        {calibrationMode && (
          <div className="absolute top-4 right-4 bg-white p-2 rounded shadow">
            Click two points to set scale
          </div>
        )}
      </div>

      <div className="mt-4">
        <h3 className="font-semibold mb-2">Measurements:</h3>
        <ul className="space-y-1">
          {measurements.map((m, i) => (
            <li
              key={i}
              className="flex justify-between items-center p-2 bg-gray-50 rounded"
            >
              <span>Measurement {i + 1}:</span>
              <span className="font-medium text-blue-600">
                {m.distance.toFixed(2)}m
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default FloorPlanMeasure;
