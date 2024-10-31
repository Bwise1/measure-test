"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";

export default function BuildingPlanUpload() {
  const [planImage, setPlanImage] = useState<string | null>(null);
  const [scale, setScale] = useState<number | null>(null);
  const [measurementStart, setMeasurementStart] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [measurementEnd, setMeasurementEnd] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setPlanImage(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCanvasClick = useCallback(
    (event: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;

      if (!measurementStart) {
        setMeasurementStart({ x, y });
      } else if (!measurementEnd) {
        setMeasurementEnd({ x, y });
      } else {
        setMeasurementStart({ x, y });
        setMeasurementEnd(null);
      }
    },
    [measurementStart, measurementEnd]
  );

  const handleCalibrate = () => {
    if (measurementStart && measurementEnd) {
      const dx = measurementEnd.x - measurementStart.x;
      const dy = measurementEnd.y - measurementStart.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      setScale(2.3 / distance); // Assuming 2.3m as in the original image
    }
  };

  const drawMeasurement = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx || !canvas) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (planImage) {
      const img = new Image();
      img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);

        if (measurementStart) {
          ctx.beginPath();
          ctx.arc(measurementStart.x, measurementStart.y, 5, 0, 2 * Math.PI);
          ctx.fillStyle = "red";
          ctx.fill();
        }

        if (measurementEnd) {
          ctx.beginPath();
          ctx.arc(measurementEnd.x, measurementEnd.y, 5, 0, 2 * Math.PI);
          ctx.fillStyle = "red";
          ctx.fill();

          ctx.beginPath();
          ctx.moveTo(measurementStart!.x, measurementStart!.y);
          ctx.lineTo(measurementEnd.x, measurementEnd.y);
          ctx.strokeStyle = "red";
          ctx.stroke();
        }
      };
      img.src = planImage;
    }
  }, [planImage, measurementStart, measurementEnd]);

  useEffect(() => {
    drawMeasurement();
  }, [drawMeasurement]);

  return (
    <div>
      <h1>Building Plan Upload and Calibration</h1>
      <div>
        <input type="file" accept="image/*" onChange={handleFileUpload} />
        <button
          onClick={handleCalibrate}
          disabled={!measurementStart || !measurementEnd}
        >
          Calibrate
        </button>
      </div>
      <div>
        <canvas
          ref={canvasRef}
          onClick={handleCanvasClick}
          style={{
            border: "1px solid black",
            maxWidth: "100%",
            height: "auto",
          }}
        />
      </div>
      {scale && (
        <div>
          <p>Scale: 1px = {scale.toFixed(4)}m</p>
        </div>
      )}
    </div>
  );
}
