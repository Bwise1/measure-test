import React, { useEffect, useRef, useState } from "react";
import { Canvas, Image } from 'fabric';

const FloorPlanMeasure = () => {
  const [canvas, setCanvas] = useState(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    const fabricCanvas = new Canvas(canvasRef.current, {
      selection: false, // Disable group selection
    });
    setCanvas(fabricCanvas);

    // Set up background image
    fabric.Image.fromURL("path/to/your/image.jpg", (img) => {
      img.set({ selectable: false, evented: false });
      fabricCanvas.setBackgroundImage(
        img,
        fabricCanvas.renderAll.bind(fabricCanvas)
      );
    });

    // Zoom and pan setup
    fabricCanvas.on("mouse:wheel", handleZoom);
    fabricCanvas.on("mouse:down", handlePanStart);
    fabricCanvas.on("mouse:move", handlePanMove);
    fabricCanvas.on("mouse:up", handlePanEnd);

    // Clean up listeners on unmount
    return () => {
      fabricCanvas.off("mouse:wheel", handleZoom);
      fabricCanvas.off("mouse:down", handlePanStart);
      fabricCanvas.off("mouse:move", handlePanMove);
      fabricCanvas.off("mouse:up", handlePanEnd);
    };
  }, []);

  // Helper functions for panning
  let isPanning = false;
  let lastPosX = 0;
  let lastPosY = 0;

  const handlePanStart = (opt) => {
    const evt = opt.e;
    if (evt.altKey) {
      // Use Alt key for panning
      isPanning = true;
      lastPosX = evt.clientX;
      lastPosY = evt.clientY;
    }
  };

  const handlePanMove = (opt) => {
    if (isPanning) {
      const e = opt.e;
      const vpt = canvas.viewportTransform;
      vpt[4] += e.clientX - lastPosX;
      vpt[5] += e.clientY - lastPosY;
      canvas.requestRenderAll();
      lastPosX = e.clientX;
      lastPosY = e.clientY;
    }
  };

  const handlePanEnd = () => {
    isPanning = false;
  };

  const handleZoom = (opt) => {
    const delta = opt.e.deltaY;
    let zoom = canvas.getZoom();
    zoom *= 0.999 ** delta;
    zoom = Math.max(0.5, Math.min(zoom, 10)); // Limit zoom levels
    canvas.zoomToPoint({ x: opt.e.offsetX, y: opt.e.offsetY }, zoom);
    opt.e.preventDefault();
    opt.e.stopPropagation();
  };

  // Function to create a measurement line with snapping
  const createMeasurementLine = (x1, y1, x2, y2) => {
    const line = new fabric.Line([x1, y1, x2, y2], {
      stroke: "#2563eb",
      strokeWidth: 2,
      selectable: true,
    });

    const anchor1 = createAnchor(line, 0);
    const anchor2 = createAnchor(line, 2);

    canvas.add(line, anchor1, anchor2);
    return line;
  };

  // Create draggable anchors for snapping
  const createAnchor = (line, idx) => {
    const circle = new fabric.Circle({
      radius: 5,
      fill: "#ff0000",
      stroke: "#000",
      strokeWidth: 1,
      left: line.get("x" + idx),
      top: line.get("y" + idx),
      hasBorders: false,
      hasControls: false,
      originX: "center",
      originY: "center",
    });

    circle.on("moving", (opt) => {
      const { left, top } = opt.target;

      // Snapping logic - adjust as needed
      const snapDistance = 10;
      const snapX = Math.round(left / snapDistance) * snapDistance;
      const snapY = Math.round(top / snapDistance) * snapDistance;
      opt.target.set({ left: snapX, top: snapY });

      // Update line position based on dragged anchor
      line.set("x" + idx, snapX);
      line.set("y" + idx, snapY);
      canvas.renderAll();
    });

    return circle;
  };

  return (
    <div className="floor-plan-measure">
      <input
        type="file"
        onChange={(e) => handleImageUpload(e, canvas)}
        accept="image/*"
        className="upload-input"
      />
      <button onClick={() => createMeasurementLine(100, 100, 200, 200)}>
        Add Measurement Line
      </button>
      <canvas ref={canvasRef} width={800} height={600} />
    </div>
  );
};

export default FloorPlanMeasure;
