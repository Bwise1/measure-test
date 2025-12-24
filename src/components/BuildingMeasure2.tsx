"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import * as fabric from "fabric";
import type * as PDFJS from "pdfjs-dist";
import { Point, Measurement, TakeoffItem, TakeoffMode } from "./types";
import { ZoomIn, ZoomOut, Move, Ruler, FileUp, ChevronLeft, ChevronRight, Scissors, Undo2, RotateCcw, MousePointer2, Check, AlertCircle } from "lucide-react";
import TakeoffSidebar from "./TakeoffSidebar";
import { db } from "../db";
import { useLiveQuery } from "dexie-react-hooks";

const FloorPlanMeasure: React.FC = () => {
  const [pdfjs, setPdfjs] = useState<typeof PDFJS | null>(null);

  // Initialize pdfjs worker on the client side
  useEffect(() => {
    const loadPdfjs = async () => {
      try {
        const lib = await import("pdfjs-dist/build/pdf.mjs");
        lib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${lib.version}/pdf.worker.min.mjs`;
        setPdfjs(lib);
      } catch (err) {
        console.error("Failed to load PDF.js", err);
      }
    };
    loadPdfjs();
  }, []);

  const [scales, setScales] = useState<Record<number, number>>({});
  const [calibrationMode, setCalibrationMode] = useState<boolean>(false);
  const [calibrationPoint1, setCalibrationPoint1] = useState<Point | null>(null);
  const [calibrationDistance, setCalibrationDistance] = useState<string>("");
  const [calibrationLines, setCalibrationLines] = useState<Record<number, { p1: Point, p2: Point, distance: number }>>({});

  const [takeoffItems, setTakeoffItems] = useState<TakeoffItem[]>([]);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);

  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pdfDoc, setPdfDoc] = useState<PDFJS.PDFDocumentProxy | null>(null);

  const currentScale = scales[currentPage] || null;
  const currentCalibrationLine = calibrationLines[currentPage] || null;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<fabric.Canvas | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const bgImageRef = useRef<fabric.Image | null>(null);
  const ghostLineRef = useRef<fabric.Group | null>(null);

  const [currentPoints, setCurrentPoints] = useState<Point[]>([]);
  const [tempLines, setTempLines] = useState<fabric.Object[]>([]);
  const [isShiftPressed, setIsShiftPressed] = useState(false);
  const [isPanningMode, setIsPanningMode] = useState(false);
  const [isDeductionMode, setIsDeductionMode] = useState(false);
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [unitSystem, setUnitSystem] = useState<'metric' | 'imperial'>('metric');
  const [snappedVertex, setSnappedVertex] = useState<Point | null>(null);

  const isDragging = useRef(false);
  const lastMousePos = useRef<Point>({ x: 0, y: 0 });

  // Persistence logic with Dexie
  const projectState = useLiveQuery(() => db.projectState.get('current'));
  const isStateLoaded = useRef(false);


  // Unit Helpers
  const parseDistance = useCallback((input: string): number => {
    if (unitSystem === 'metric') return parseFloat(input) || 0;
    const clean = input.replace(/["\s]/g, '').replace(/'/g, '-');
    const parts = clean.split('-');
    if (parts.length === 2) {
      return parseFloat(parts[0]) + (parseFloat(parts[1]) / 12);
    }
    return parseFloat(parts[0]) || 0;
  }, [unitSystem]);

  const formatDistance = useCallback((val: number): string => {
    if (unitSystem === 'metric') return `${val.toFixed(2)}m`;
    const feet = Math.floor(val);
    const inches = Math.round((val - feet) * 12);
    return `${feet}'-${inches}"`;
  }, [unitSystem]);

  const formatArea = useCallback((val: number): string => {
    if (unitSystem === 'metric') return `${val.toFixed(2)} sqm`;
    return `${val.toFixed(2)} sqft`;
  }, [unitSystem]);

  // Utility Functions
  const calculateArea = useCallback((points: Point[]): number => {
    if (points.length < 3) return 0;
    let area = 0;
    for (let i = 0; i < points.length; i++) {
      const p1 = points[i];
      const p2 = points[(i + 1) % points.length];
      area += (p1.x * p2.y - p2.x * p1.y);
    }
    const pixelArea = Math.abs(area / 2);
    const currentPageScale = scales[currentPage];
    return currentPageScale ? pixelArea / (currentPageScale * currentPageScale) : pixelArea;
  }, [scales, currentPage]);

  const getSnappedVertex = useCallback((currentPointer: Point): Point => {
    const snapThreshold = 15;
    let nearest: Point | null = null;
    let minDist = Infinity;

    // Check existing points
    takeoffItems.forEach(item => {
      item.measurements.forEach(m => {
        m.points.forEach(p => {
          const dist = Math.sqrt(Math.pow(currentPointer.x - p.x, 2) + Math.pow(currentPointer.y - p.y, 2));
          if (dist < snapThreshold && dist < minDist) {
            minDist = dist;
            nearest = p;
          }
        });
      });
    });

    // Check current points
    currentPoints.forEach(p => {
      const dist = Math.sqrt(Math.pow(currentPointer.x - p.x, 2) + Math.pow(currentPointer.y - p.y, 2));
      if (dist < snapThreshold && dist < minDist) {
        minDist = dist;
        nearest = p;
      }
    });

    setSnappedVertex(nearest);
    return nearest || currentPointer;
  }, [takeoffItems, currentPoints]);

  const getSnappedPoint = useCallback((currentPoint: Point, lastPoint: Point): Point => {
    if (!isShiftPressed) return currentPoint;
    const dx = currentPoint.x - lastPoint.x;
    const dy = currentPoint.y - lastPoint.y;
    // Snap to horizontal or vertical (90° increments) for straighter lines
    if (Math.abs(dx) > Math.abs(dy)) {
      // Horizontal line
      return { x: currentPoint.x, y: lastPoint.y };
    } else {
      // Vertical line
      return { x: lastPoint.x, y: currentPoint.y };
    }
  }, [isShiftPressed]);

  // Procedural Drawing Helpers
  const drawDimensionProcedural = useCallback((p1: Point, p2: Point, color: string, name?: string) => {
    if (!fabricRef.current) return;
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const angle = Math.atan2(dy, dx);
    const tickLen = 6;

    const main = new fabric.Line([p1.x, p1.y, p2.x, p2.y], { stroke: color, strokeWidth: 2, selectable: false, evented: false });

    // Correcting ticks to be perpendicular
    const tickDX = Math.sin(angle) * tickLen;
    const tickDY = Math.cos(angle) * tickLen;
    const t1 = new fabric.Line([p1.x - tickDX, p1.y + tickDY, p1.x + tickDX, p1.y - tickDY], { stroke: color, strokeWidth: 2, selectable: false, evented: false });
    const t2 = new fabric.Line([p2.x - tickDX, p2.y + tickDY, p2.x + tickDX, p2.y - tickDY], { stroke: color, strokeWidth: 2, selectable: false, evented: false });

    const dist = Math.sqrt(dx * dx + dy * dy);
    const qty = currentScale ? dist / currentScale : dist;
    const label = `${name ? name + ': ' : ''}${formatDistance(qty)}`;
    const text = new fabric.IText(label, {
      left: (p1.x + p2.x) / 2,
      top: (p1.y + p2.y) / 2 - 15,
      fontSize: 12,
      fill: color,
      backgroundColor: 'rgba(255,255,255,0.7)',
      originX: 'center',
      originY: 'center',
      selectable: false,
      evented: false,
      angle: angle * (180 / Math.PI)
    });
    fabricRef.current.add(main, t1, t2, text);
  }, [currentScale, formatDistance]);

  const drawAreaProcedural = useCallback((points: Point[], color: string, quantity: number) => {
    if (!fabricRef.current) return;
    const isDeduct = quantity < 0;
    const poly = new fabric.Polygon(points.map(p => ({ x: p.x, y: p.y })), {
      fill: isDeduct ? 'rgba(255, 255, 255, 0.5)' : color + '44',
      stroke: color,
      strokeWidth: 2,
      strokeDashArray: isDeduct ? [5, 5] : undefined,
      selectable: false,
      evented: false
    });
    const center = poly.getCenterPoint();
    const text = new fabric.IText(formatArea(Math.abs(quantity)), {
      left: center.x,
      top: center.y,
      fontSize: 14,
      fontWeight: 'bold',
      fill: isDeduct ? '#ff0000' : color,
      backgroundColor: 'rgba(255,255,255,0.7)',
      originX: 'center',
      originY: 'center',
      selectable: false,
      evented: false
    });
    fabricRef.current.add(poly, text);
  }, [formatArea]);

  const drawCountProcedural = useCallback((p: Point, color: string, takeoffItemId?: string, measurementId?: string, pointIndex?: number) => {
    if (!fabricRef.current) return;
    const circle = new fabric.Circle({
      left: p.x,
      top: p.y,
      radius: 6,
      fill: color,
      originX: 'center',
      originY: 'center',
      stroke: 'white',
      strokeWidth: 2,
      selectable: isSelectMode,
      evented: isSelectMode,
      hasControls: false,
      data: { takeoffItemId, measurementId, pointIndex }
    });
    fabricRef.current.add(circle);
  }, [isSelectMode]);

  const removeGhostLine = useCallback(() => {
    if (ghostLineRef.current && fabricRef.current) {
      fabricRef.current.remove(ghostLineRef.current);
      ghostLineRef.current = null;
      fabricRef.current.requestRenderAll();
    }
  }, []);

  const updateGhostLine = useCallback((start: Point, end: Point, color: string) => {
    if (!fabricRef.current) return;
    removeGhostLine();

    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const angle = Math.atan2(dy, dx);
    const tickLen = 6;

    const main = new fabric.Line([start.x, start.y, end.x, end.y], { stroke: color, strokeWidth: 2, strokeDashArray: [5, 5], opacity: 0.5 });

    // perpedincular ticks
    const tickDX = Math.sin(angle) * tickLen;
    const tickDY = Math.cos(angle) * tickLen;
    const t1 = new fabric.Line([start.x - tickDX, start.y + tickDY, start.x + tickDX, start.y - tickDY], { stroke: color, strokeWidth: 2, opacity: 0.5 });
    const t2 = new fabric.Line([end.x - tickDX, end.y + tickDY, end.x + tickDX, end.y - tickDY], { stroke: color, strokeWidth: 2, opacity: 0.5 });

    const dist = Math.sqrt(dx * dx + dy * dy);
    const qty = currentScale ? dist / currentScale : dist;
    const text = new fabric.IText(formatDistance(qty), {
      left: (start.x + end.x) / 2,
      top: (start.y + end.y) / 2 - 15,
      fontSize: 12,
      fill: color,
      backgroundColor: 'rgba(255,255,255,0.7)',
      originX: 'center',
      originY: 'center',
      selectable: false,
      evented: false,
      angle: angle * (180 / Math.PI)
    });

    const group = new fabric.Group([main, t1, t2, text], { selectable: false, evented: false });
    ghostLineRef.current = group;
    fabricRef.current.add(group);
    fabricRef.current.requestRenderAll();
  }, [currentScale, formatDistance, removeGhostLine]);

  // Command handlers
  const undo = useCallback(() => {
    if (currentPoints.length > 0) {
      const newPoints = currentPoints.slice(0, -1);
      setCurrentPoints(newPoints);
      if (tempLines.length > 0) {
        const last = tempLines[tempLines.length - 1];
        fabricRef.current?.remove(last);
        setTempLines(prev => prev.slice(0, -1));
      }
      return;
    }
    if (activeItemId) {
      setTakeoffItems(prev => prev.map(item => {
        if (item.id === activeItemId && item.measurements.length > 0) {
          const lastM = item.measurements[item.measurements.length - 1];
          return {
            ...item,
            measurements: item.measurements.slice(0, -1),
            totalQuantity: item.totalQuantity - lastM.quantity
          };
        }
        return item;
      }));
    }
  }, [activeItemId, currentPoints, tempLines]);

  const finishMeasurement = useCallback(() => {
    if (activeItemId && currentPoints.length > 2) {
      const activeItem = takeoffItems.find(i => i.id === activeItemId);
      if (activeItem?.type === "area") {
        let area = calculateArea(currentPoints);
        if (isDeductionMode) area = -area;
        setTakeoffItems(prev => prev.map(i => {
          if (i.id === activeItemId) {
            const m: Measurement = { id: Math.random().toString(), points: [...currentPoints], quantity: area, page: currentPage };
            return { ...i, measurements: [...i.measurements, m], totalQuantity: i.totalQuantity + area };
          }
          return i;
        }));
      }
    }
    tempLines.forEach(l => fabricRef.current?.remove(l));
    setTempLines([]);
    setCurrentPoints([]);
    removeGhostLine();
  }, [activeItemId, currentPoints, isDeductionMode, takeoffItems, calculateArea, removeGhostLine, tempLines, currentPage]);

  const handleCanvasClick = useCallback((rawPoint: Point) => {
    if (isSelectMode) return;

    // Apply vertex snapping first (snap to existing points)
    const point = getSnappedVertex(rawPoint);

    if (calibrationMode) {
      if (!calibrationPoint1) {
        setCalibrationPoint1(point);
      } else {
        // Apply angle snapping for calibration second point
        const snappedPoint = getSnappedPoint(point, calibrationPoint1);
        const dx = snappedPoint.x - calibrationPoint1.x;
        const dy = snappedPoint.y - calibrationPoint1.y;
        const pixelDist = Math.sqrt(dx * dx + dy * dy);
        const dist = parseDistance(calibrationDistance);
        if (dist > 0) {
          const newScale = pixelDist / dist;
          setScales(prev => ({ ...prev, [currentPage]: newScale }));
          setCalibrationMode(false);
          setCalibrationPoint1(null);
          setCalibrationLines(prev => ({ ...prev, [currentPage]: { p1: calibrationPoint1, p2: snappedPoint, distance: dist } }));
          removeGhostLine();
        }
      }
      return;
    }

    if (!activeItemId) return;
    const activeItem = takeoffItems.find(i => i.id === activeItemId);
    if (!activeItem) return;

    if (activeItem.type === "count") {
      setTakeoffItems(prev => prev.map(i => {
        if (i.id === activeItemId) {
          const m: Measurement = { id: Math.random().toString(), points: [point], quantity: 1, page: currentPage };
          return { ...i, measurements: [...i.measurements, m], totalQuantity: i.totalQuantity + 1 };
        }
        return i;
      }));
    } else if (activeItem.type === "linear") {
      if (currentPoints.length === 1) {
        const p1 = currentPoints[0];
        // Apply angle snapping for the second point
        const snappedPoint = getSnappedPoint(point, p1);
        const dx = snappedPoint.x - p1.x;
        const dy = snappedPoint.y - p1.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const qty = currentScale ? dist / currentScale : dist;
        setTakeoffItems(prev => prev.map(i => {
          if (i.id === activeItemId) {
            const m: Measurement = { id: Math.random().toString(), points: [p1, snappedPoint], quantity: qty, page: currentPage };
            return { ...i, measurements: [...i.measurements, m], totalQuantity: i.totalQuantity + qty };
          }
          return i;
        }));
        setCurrentPoints([]);
        removeGhostLine();
      } else {
        setCurrentPoints([point]);
      }
    } else if (activeItem.type === "area") {
      // Apply angle snapping for area points if there's a previous point
      const snappedPoint = currentPoints.length > 0
        ? getSnappedPoint(point, currentPoints[currentPoints.length - 1])
        : point;
      const newPts = [...currentPoints, snappedPoint];
      setCurrentPoints(newPts);
      if (newPts.length > 1) {
        const last = newPts[newPts.length - 2];
        const line = new fabric.Line([last.x, last.y, snappedPoint.x, snappedPoint.y], { stroke: activeItem.color, strokeWidth: 2, selectable: false, evented: false });
        fabricRef.current?.add(line);
        setTempLines(prev => [...prev, line]);
      }
    }
  }, [isSelectMode, calibrationMode, calibrationPoint1, activeItemId, takeoffItems, parseDistance, calibrationDistance, currentPage, currentPoints, removeGhostLine, getSnappedVertex, getSnappedPoint, currentScale]);

  const handleCanvasMouseMove = useCallback((origPoint: Point) => {
    if (!fabricRef.current) return;
    const point = getSnappedVertex(origPoint);
    let finalPoint = point;

    if (calibrationMode && calibrationPoint1) {
      finalPoint = getSnappedPoint(point, calibrationPoint1);
      updateGhostLine(calibrationPoint1, finalPoint, "#ff0000");
    } else if (activeItemId && currentPoints.length > 0) {
      finalPoint = getSnappedPoint(point, currentPoints[currentPoints.length - 1]);
      const activeItem = takeoffItems.find(i => i.id === activeItemId);
      if (activeItem && (activeItem.type === "linear" || activeItem.type === "area")) {
        updateGhostLine(currentPoints[currentPoints.length - 1], finalPoint, activeItem.color);
      }
    } else {
      removeGhostLine();
    }
  }, [getSnappedVertex, calibrationMode, calibrationPoint1, activeItemId, currentPoints, getSnappedPoint, updateGhostLine, takeoffItems, removeGhostLine]);

  // Canvas Initialization Effect
  useEffect(() => {
    if (!containerRef.current || !canvasRef.current || fabricRef.current) return;

    const canvas = new fabric.Canvas(canvasRef.current, {
      width: containerRef.current.offsetWidth || 800,
      height: containerRef.current.offsetHeight || 600,
      backgroundColor: '#f8f8f8',
      selection: false,
      preserveObjectStacking: true,
    });

    fabricRef.current = canvas;

    return () => {
      canvas.dispose();
      fabricRef.current = null;
    };
  }, []);

  // Sync Redraw Effect
  useEffect(() => {
    if (!fabricRef.current) return;
    const canvas = fabricRef.current;

    // Clear all objects but preserve background
    canvas.getObjects().forEach(obj => canvas.remove(obj));

    // Restore Background from Ref if it exists
    if (bgImageRef.current) {
      canvas.backgroundImage = bgImageRef.current;
    }

    takeoffItems.forEach(item => {
      item.measurements.filter(m => m.page === currentPage).forEach(m => {
        if (item.type === 'linear' || item.type === 'polyline') {
          for (let i = 0; i < m.points.length - 1; i++) {
            drawDimensionProcedural(m.points[i], m.points[i + 1], item.color, item.name);
          }
        } else if (item.type === 'area') {
          drawAreaProcedural(m.points, item.color, m.quantity);
        } else if (item.type === 'count') {
          m.points.forEach((p, idx) => drawCountProcedural(p, item.color, item.id, m.id, idx));
        }
      });
    });

    if (currentCalibrationLine) {
      drawDimensionProcedural(currentCalibrationLine.p1, currentCalibrationLine.p2, '#ff0000', `Scale Ref: ${formatDistance(currentCalibrationLine.distance)}`);
    }
    canvas.requestRenderAll();
  }, [takeoffItems, isSelectMode, scales, currentPage, unitSystem, activeItemId, currentCalibrationLine, drawAreaProcedural, drawCountProcedural, drawDimensionProcedural, formatDistance]);

  // Event Listener Effect
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    const handleZoom = (opt: fabric.TPointerEventInfo<WheelEvent>) => {
      const e = opt.e;
      if (!e) return;
      e.preventDefault();
      const delta = e.deltaY;
      let zoom = canvas.getZoom();
      zoom *= 0.999 ** delta;
      zoom = Math.min(Math.max(zoom, 0.2), 5);
      const pointer = canvas.getPointer(e);
      canvas.zoomToPoint(new fabric.Point(pointer.x, pointer.y), zoom);
    };

    const onMouseDown = (opt: fabric.TPointerEventInfo<fabric.TPointerEvent>) => {
      const e = opt.e as MouseEvent;
      if (isPanningMode) {
        isDragging.current = true;
        canvas.selection = false;
        lastMousePos.current = { x: e.clientX, y: e.clientY };
        canvas.defaultCursor = 'grabbing';
        canvas.setCursor('grabbing');
        return;
      }
      if (e.button === 2) { finishMeasurement(); return; }
      const pointer = canvas.getScenePoint(e);
      handleCanvasClick(pointer);
    };

    const onMouseMove = (opt: fabric.TPointerEventInfo<fabric.TPointerEvent>) => {
      const e = opt.e as MouseEvent;
      if (isPanningMode && isDragging.current) {
        const vpt = [...(canvas.viewportTransform || [1, 0, 0, 1, 0, 0])];
        vpt[4] += e.clientX - lastMousePos.current.x;
        vpt[5] += e.clientY - lastMousePos.current.y;
        canvas.setViewportTransform(vpt as [number, number, number, number, number, number]);
        lastMousePos.current = { x: e.clientX, y: e.clientY };
        return;
      }
      const pointer = canvas.getScenePoint(e);
      handleCanvasMouseMove(pointer);
    };

    const onMouseUp = () => { isDragging.current = false; if (isPanningMode) { canvas.defaultCursor = 'grab'; canvas.setCursor('grab'); } };
    const onDoubleClick = () => { if (!isPanningMode) finishMeasurement(); };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") finishMeasurement();
      if (e.key === "Shift") setIsShiftPressed(true);
      if ((e.ctrlKey || e.metaKey) && e.key === "z") { e.preventDefault(); undo(); }
      if (e.key.toLowerCase() === "v") { setIsSelectMode(p => !p); setIsPanningMode(false); }
      if (e.key.toLowerCase() === "m") { setIsPanningMode(p => !p); setIsSelectMode(false); }
      if (e.key.toLowerCase() === "x") setIsDeductionMode(p => !p);
    };
    const onKeyUp = (e: KeyboardEvent) => { if (e.key === "Shift") setIsShiftPressed(false); };
    const onObjectModified = (opt: unknown) => {
      const event = opt as { target?: fabric.Object };
      const obj = event.target as fabric.Object & { data?: { takeoffItemId: string, measurementId: string, pointIndex?: number } };
      if (!obj || !obj.data) return;
      const { takeoffItemId, measurementId, pointIndex } = obj.data;
      setTakeoffItems(prev => prev.map(item => {
        if (item.id === takeoffItemId) {
          return {
            ...item,
            measurements: item.measurements.map(m => {
              if (m.id === measurementId && typeof pointIndex === 'number' && obj.left !== undefined && obj.top !== undefined) {
                const newPts = [...m.points];
                newPts[pointIndex] = { x: obj.left, y: obj.top };
                return { ...m, points: newPts };
              }
              return m;
            })
          };
        }
        return item;
      }));
    };

    const cur = isPanningMode ? 'grab' : (isSelectMode ? 'default' : 'crosshair');
    canvas.defaultCursor = cur;
    canvas.setCursor(cur);

    canvas.on("mouse:down", onMouseDown);
    canvas.on("mouse:move", onMouseMove);
    canvas.on("mouse:up", onMouseUp);
    canvas.on("mouse:dblclick", onDoubleClick);
    canvas.on("object:modified", onObjectModified as (opt: unknown) => void);
    canvas.on("mouse:wheel", handleZoom as (opt: fabric.TPointerEventInfo<fabric.TPointerEvent>) => void);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    return () => {
      canvas.off("mouse:down", onMouseDown);
      canvas.off("mouse:move", onMouseMove);
      canvas.off("mouse:up", onMouseUp);
      canvas.off("mouse:dblclick", onDoubleClick);
      canvas.off("object:modified", onObjectModified as (opt: unknown) => void);
      canvas.off("mouse:wheel", handleZoom as (opt: fabric.TPointerEventInfo<fabric.TPointerEvent>) => void);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [isPanningMode, isSelectMode, finishMeasurement, handleCanvasClick, handleCanvasMouseMove, undo]);

  // Persistence Migration and Auto-save
  useEffect(() => {
    if (projectState && !isStateLoaded.current) {
      console.log("Loading state from Dexie...");
      if (projectState.takeoffItems) setTakeoffItems(projectState.takeoffItems);

      // Multi-page migration / load
      if (projectState.scales) setScales(projectState.scales);
      else if (projectState.scale) setScales({ 1: projectState.scale });

      if (projectState.calibrationLines) setCalibrationLines(projectState.calibrationLines);
      else if (projectState.calibrationLine) setCalibrationLines({ 1: projectState.calibrationLine });

      if (projectState.backgroundImage) {
        fabric.FabricImage.fromURL(projectState.backgroundImage).then((img) => {
          bgImageRef.current = img;
          if (fabricRef.current) {
            const containerWidth = containerRef.current?.offsetWidth || 800;
            const imgWidth = img.width || 100;
            const scaleFactor = containerWidth / imgWidth;
            img.set({
              scaleX: scaleFactor,
              scaleY: scaleFactor,
              selectable: false,
              evented: false,
              left: 0,
              top: 0,
              originX: 'left',
              originY: 'top'
            });
            fabricRef.current.setDimensions({
              width: containerWidth,
              height: (img.height || imgWidth) * scaleFactor
            });
            fabricRef.current.backgroundImage = img;
            fabricRef.current.requestRenderAll();
          }
        });
      }
      isStateLoaded.current = true;
    } else if (!projectState && !isStateLoaded.current) {
      // Check legacy localStorage
      const legacy = localStorage.getItem('bwise_takeoff_data');
      if (legacy) {
        try {
          const { takeoffItems: sItems, scale: sScale } = JSON.parse(legacy);
          db.projectState.put({ id: 'current', takeoffItems: sItems || [], scale: sScale || null });
          localStorage.removeItem('bwise_takeoff_data');
        } catch (e) { console.error("Legacy migration failed", e); }
      }
      isStateLoaded.current = true;
    }
  }, [projectState]);

  useEffect(() => {
    if (!isStateLoaded.current) return;
    const saveState = async () => {
      await db.projectState.update('current', {
        takeoffItems,
        scales,
        calibrationLines
      });
    };
    const timer = setTimeout(saveState, 500); // Shorter debounce for responsiveness
    return () => clearTimeout(timer);
  }, [takeoffItems, scales, calibrationLines]);

  useEffect(() => {
    setTakeoffItems(prev => prev.map(item => {
      let u = item.unit;
      if (unitSystem === 'metric') {
        if (item.type === 'linear') u = 'm';
        if (item.type === 'area') u = 'sqm';
      } else {
        if (item.type === 'linear') u = 'ft';
        if (item.type === 'area') u = 'sqft';
      }
      return { ...item, unit: u };
    }));
  }, [unitSystem]);

  const renderPage = useCallback(async (pageNumber: number, pdf: PDFJS.PDFDocumentProxy) => {
    console.log("Rendering page:", pageNumber);
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.height = viewport.height;
    canvas.width = viewport.width;

    await page.render({ canvasContext: ctx, viewport }).promise;
    const dataUrl = canvas.toDataURL();

    if (fabricRef.current) {
      console.log("PDF DataURL created, length:", dataUrl.length);
      const img = await fabric.FabricImage.fromURL(dataUrl);
      console.log("Image loaded from dataUrl, dimensions:", img.width, img.height);

      const containerWidth = containerRef.current?.offsetWidth || 800;
      const imgWidth = img.width || 100;
      const scaleFactor = containerWidth / imgWidth;

      img.set({
        scaleX: scaleFactor,
        scaleY: scaleFactor,
        selectable: false,
        evented: false,
        left: 0,
        top: 0,
        originX: 'left',
        originY: 'top'
      });

      fabricRef.current.setViewportTransform([1, 0, 0, 1, 0, 0]);
      fabricRef.current.setZoom(1);

      fabricRef.current.setDimensions({
        width: containerWidth,
        height: (img.height || imgWidth) * scaleFactor
      });

      // Clear measurements when changing page? 
      // For now just ensure the background is set correctly
      fabricRef.current.getObjects().forEach(obj => fabricRef.current?.remove(obj));

      bgImageRef.current = img;
      fabricRef.current.backgroundImage = img;

      // Save background to DB once
      const bgData = img.toDataURL({ format: 'jpeg', quality: 0.8 });
      db.projectState.update('current', { backgroundImage: bgData });

      fabricRef.current.requestRenderAll();
      setTimeout(() => fabricRef.current?.requestRenderAll(), 100);
    }
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    console.log("File uploaded:", file.name, file.type);

    if (file.type === "application/pdf" && pdfjs) {
      const buffer = await file.arrayBuffer();
      const pdf = await pdfjs.getDocument({ data: buffer }).promise;
      setPdfDoc(pdf);
      setNumPages(pdf.numPages);
      setCurrentPage(1);
      renderPage(1, pdf);
    } else if (file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const dataUrl = ev.target?.result as string;
        if (fabricRef.current) {
          const img = await fabric.FabricImage.fromURL(dataUrl);
          console.log("Static image loaded, dimensions:", img.width, img.height);

          const containerWidth = containerRef.current?.offsetWidth || 800;
          const imgWidth = img.width || 100;
          const scaleFactor = containerWidth / imgWidth;

          img.set({
            scaleX: scaleFactor,
            scaleY: scaleFactor,
            selectable: false,
            evented: false,
            left: 0,
            top: 0,
            originX: 'left',
            originY: 'top'
          });

          fabricRef.current.setViewportTransform([1, 0, 0, 1, 0, 0]);
          fabricRef.current.setZoom(1);

          fabricRef.current.setDimensions({
            width: containerWidth,
            height: (img.height || imgWidth) * scaleFactor
          });

          fabricRef.current.getObjects().forEach(obj => fabricRef.current?.remove(obj));
          bgImageRef.current = img;
          fabricRef.current.backgroundImage = img;

          // Save background to DB once
          const bgData = img.toDataURL({ format: 'jpeg', quality: 0.8 });
          db.projectState.update('current', { backgroundImage: bgData });

          fabricRef.current.requestRenderAll();
          setTimeout(() => fabricRef.current?.requestRenderAll(), 100);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const createTakeoffItem = (type: TakeoffMode) => {
    setIsPanningMode(false);
    setIsDeductionMode(false);
    setIsSelectMode(false);
    setCurrentPoints([]);
    setTempLines([]);
    const newItem: TakeoffItem = {
      id: Math.random().toString(36).substr(2, 9),
      name: `New ${type} ${takeoffItems.length + 1}`,
      type,
      color: `#${Math.floor(Math.random() * 16777215).toString(16)}`,
      measurements: [],
      totalQuantity: 0,
      unit: type === "area" ? (unitSystem === 'metric' ? "sqm" : "sqft") : type === "count" ? "ea" : (unitSystem === 'metric' ? "m" : "ft"),
      linkedCosts: []
    };
    setTakeoffItems([...takeoffItems, newItem]);
    setActiveItemId(newItem.id);
  };

  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden">
      <TakeoffSidebar
        items={takeoffItems}
        scales={scales}
        activeItemId={activeItemId}
        onSelectItem={(id) => { setActiveItemId(id); setIsPanningMode(false); setIsSelectMode(false); setCurrentPoints([]); setTempLines([]); }}
        onCreateItem={createTakeoffItem}
        onDeleteItem={(id) => setTakeoffItems(prev => prev.filter(i => i.id !== id))}
        onUpdateItem={(id, updates) => setTakeoffItems(prev => prev.map(i => i.id === id ? { ...i, ...updates } : i))}
      />

      <div className="flex-1 flex flex-col relative overflow-hidden">
        <div className="p-4 bg-white border-b border-gray-200 flex items-center justify-between shadow-sm z-10">
          <div className="flex items-center space-x-4">
            <label className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer transition">
              <FileUp className="w-5 h-5" />
              <span>Upload Plan</span>
              <input type="file" className="hidden" accept="image/*,application/pdf" onChange={handleFileUpload} />
            </label>

            <div className="h-8 w-px bg-gray-200" />

            <div className="flex bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => { setCalibrationMode(!calibrationMode); setCalibrationPoint1(null); }}
                className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition ${calibrationMode ? 'bg-red-500 text-white animate-pulse' : currentScale ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
              >
                {currentScale ? <Check className="w-5 h-5" /> : <Ruler className="w-5 h-5" />}
                <span>{calibrationMode ? 'Calibrating...' : currentScale ? 'Calibrated' : 'Calibrate'}</span>
              </button>
              {calibrationMode && (
                <input
                  type="text"
                  placeholder={`Length (${unitSystem === 'metric' ? 'm' : "ft-in"})`}
                  value={calibrationDistance}
                  onChange={(e) => setCalibrationDistance(e.target.value)}
                  className="ml-2 px-3 py-1 border rounded text-sm w-32 outline-none focus:ring-2 focus:ring-red-300"
                />
              )}
            </div>

            <button
              type="button"
              onClick={() => { setIsPanningMode(!isPanningMode); setIsSelectMode(false); }}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition ${isPanningMode ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
              title="Pan Tool (M)"
            >
              <Move className="w-5 h-5" />
              <span>Pan</span>
            </button>

            <button
              type="button"
              onClick={() => { setIsSelectMode(!isSelectMode); setIsPanningMode(false); }}
              className={`p-2 rounded-lg transition ${isSelectMode ? 'bg-blue-600 text-white shadow-lg' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
              title="Select/Move Tool (V)"
            >
              <MousePointer2 className="w-5 h-5" />
            </button>

            <div className="flex items-center bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setUnitSystem('metric')}
                className={`px-3 py-1 text-[10px] font-bold rounded-md transition ${unitSystem === 'metric' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              > METRIC </button>
              <button
                onClick={() => setUnitSystem('imperial')}
                className={`px-3 py-1 text-[10px] font-bold rounded-md transition ${unitSystem === 'imperial' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              > IMPERIAL </button>
            </div>

            <button
              type="button"
              onClick={() => setIsDeductionMode(!isDeductionMode)}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition ${isDeductionMode ? 'bg-red-500 text-white animate-pulse' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
              title="Deduct Mode (X)"
            >
              <Scissors className="w-5 h-5" />
              <span>Deduct</span>
            </button>
          </div>

          <div className="flex items-center space-x-2">
            <button onClick={undo} className="p-2 hover:bg-gray-100 rounded-lg transition" title="Undo (Ctrl+Z)"> <Undo2 className="w-5 h-5 text-gray-600" /> </button>
            <button
              onClick={() => { if (confirm("Clear all measurements?")) { setTakeoffItems([]); setScales({}); setCalibrationLines({}); } }}
              className="p-2 hover:bg-red-50 rounded-lg transition"
              title="Clear All"
            >
              <RotateCcw className="w-5 h-5 text-red-500" />
            </button>
          </div>
        </div>

        <div className="flex-1 relative flex overflow-hidden">
          <div ref={containerRef} className="flex-1 bg-gray-200 relative overflow-hidden" onContextMenu={(e) => e.preventDefault()}>
            <canvas ref={canvasRef} />

            <div className="absolute bottom-6 right-6 flex items-center space-x-2 bg-white/80 backdrop-blur p-2 rounded-xl shadow-xl border border-white/50">
              <button onClick={() => fabricRef.current?.setZoom((fabricRef.current.getZoom() || 1) * 1.1)} className="p-2 hover:bg-gray-100 rounded-lg"> <ZoomIn className="w-5 h-5" /> </button>
              <button onClick={() => fabricRef.current?.setZoom((fabricRef.current.getZoom() || 1) / 1.1)} className="p-2 hover:bg-gray-100 rounded-lg"> <ZoomOut className="w-5 h-5" /> </button>
            </div>

            {pdfDoc && (
              <div className="absolute bottom-6 left-6 flex items-center space-x-4 bg-white/80 backdrop-blur p-2 rounded-xl shadow-xl border border-white/50">
                <button onClick={() => { if (currentPage > 1) { setCurrentPage(p => p - 1); renderPage(currentPage - 1, pdfDoc); } }} className="p-1 hover:bg-gray-100 rounded-lg"> <ChevronLeft /> </button>
                <div className="flex flex-col items-center">
                  <span className="text-[10px] text-gray-500 uppercase font-bold">Page</span>
                  <span className="text-sm font-bold">{currentPage} / {numPages}</span>
                </div>
                <button onClick={() => { if (currentPage < numPages) { setCurrentPage(p => p + 1); renderPage(currentPage + 1, pdfDoc); } }} className="p-1 hover:bg-gray-100 rounded-lg"> <ChevronRight /> </button>
                <div className="h-8 w-px bg-gray-200" />
                <div className={`flex items-center space-x-1 px-2 py-1 rounded-lg text-[10px] font-bold ${currentScale ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                  {currentScale ? <Check className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                  <span>{currentScale ? `CALIBRATED (1${unitSystem === 'metric' ? 'm' : 'ft'} = ${currentScale.toFixed(1)}px)` : 'UNSCALED'}</span>
                </div>
              </div>
            )}

            {isShiftPressed && (
              <div className="absolute bottom-12 left-1/2 -translate-x-1/2 bg-blue-600/80 backdrop-blur text-white px-4 py-2 rounded-full shadow-lg z-20 text-xs font-bold uppercase tracking-widest"> Precision Mode Active (Snapped) </div>
            )}
            {isDeductionMode && (
              <div className="absolute top-24 left-1/2 -translate-x-1/2 bg-red-600 text-white px-4 py-2 rounded-full shadow-lg z-20 text-xs font-bold uppercase tracking-widest animate-pulse border-2 border-white shadow-red-500/50"> Deduction Mode Active (Subtracting Area) </div>
            )}

            {snappedVertex && (
              <div
                className="fixed pointer-events-none z-50 w-4 h-4 rounded-full border-2 border-orange-500 bg-orange-500/30"
                style={{
                  left: (snappedVertex.x * (fabricRef.current?.getZoom() || 1)) + (fabricRef.current?.viewportTransform?.[4] || 0) + (containerRef.current?.getBoundingClientRect().left || 0) - 8,
                  top: (snappedVertex.y * (fabricRef.current?.getZoom() || 1)) + (fabricRef.current?.viewportTransform?.[5] || 0) + (containerRef.current?.getBoundingClientRect().top || 0) - 8,
                }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default FloorPlanMeasure;
