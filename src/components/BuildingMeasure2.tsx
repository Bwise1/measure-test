"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import * as fabric from "fabric";
import type * as PDFJS from "pdfjs-dist";
import { Point, Measurement, TakeoffItem, TakeoffMode, CostItem } from "./types";
import { ZoomIn, ZoomOut, Move, Ruler, FileUp, ChevronLeft, ChevronRight, Scissors, Undo2, RotateCcw, MousePointer2 } from "lucide-react";
import TakeoffSidebar from "./TakeoffSidebar";
import EstimationPanel from "./EstimationPanel";

const FloorPlanMeasure: React.FC = () => {
  const [pdfjs, setPdfjs] = useState<typeof PDFJS | null>(null);

  // Initialize pdfjs worker on the client side
  useEffect(() => {
    const loadPdfjs = async () => {
      try {
        // Use explicit .mjs path to avoid Webpack 5 evaluation issues
        const lib = await import("pdfjs-dist/build/pdf.mjs");
        // Note: For version 4.x we use mjs on cdn too
        lib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${lib.version}/pdf.worker.min.mjs`;
        setPdfjs(lib);
      } catch (err) {
        console.error("Failed to load PDF.js", err);
      }
    };
    loadPdfjs();
  }, []);
  const [scale, setScale] = useState<number | null>(null);
  const [calibrationMode, setCalibrationMode] = useState<boolean>(false);
  const [calibrationPoint1, setCalibrationPoint1] = useState<Point | null>(null);
  const [calibrationDistance, setCalibrationDistance] = useState<string>("");

  const [takeoffItems, setTakeoffItems] = useState<TakeoffItem[]>([]);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);

  const [costCatalog] = useState<CostItem[]>([
    { id: 'c1', name: 'Concrete Mix', unit: 'sqm', unitPrice: 45.00, category: 'Materials' },
    { id: 'c2', name: 'Labor - Concrete', unit: 'sqm', unitPrice: 20.00, category: 'Labor' },
    { id: 'c3', name: 'Timber Studs', unit: 'm', unitPrice: 12.50, category: 'Materials' },
    { id: 'c4', name: 'Labor - Wall Framing', unit: 'm', unitPrice: 18.00, category: 'Labor' },
    { id: 'c5', name: 'Interior Paint', unit: 'sqm', unitPrice: 7.50, category: 'Materials' },
    { id: 'c6', name: 'Countable Fixings', unit: 'ea', unitPrice: 5.00, category: 'Hardware' },
  ]);

  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pdfDoc, setPdfDoc] = useState<PDFJS.PDFDocumentProxy | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<fabric.Canvas | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [currentPoints, setCurrentPoints] = useState<Point[]>([]);
  const [tempLines, setTempLines] = useState<fabric.Object[]>([]);
  const [isShiftPressed, setIsShiftPressed] = useState(false);
  const [isPanningMode, setIsPanningMode] = useState(false);
  const [isDeductionMode, setIsDeductionMode] = useState(false);
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [unitSystem, setUnitSystem] = useState<'metric' | 'imperial'>('metric');
  const bgImageRef = useRef<fabric.Image | null>(null);
  const [snappedVertex, setSnappedVertex] = useState<Point | null>(null);
  const [calibrationLine, setCalibrationLine] = useState<{ p1: Point, p2: Point, distance: number } | null>(null);
  const isDragging = useRef(false);
  const lastMousePos = useRef({ x: 0, y: 0 });

  // Unit Helpers
  const parseDistance = (input: string): number => {
    if (unitSystem === 'metric') return parseFloat(input) || 0;

    // Imperial Parser (10'6", 10-6, 10 6)
    const clean = input.replace(/["\s]/g, '').replace(/'/g, '-');
    const parts = clean.split('-');
    if (parts.length === 2) {
      return parseFloat(parts[0]) + (parseFloat(parts[1]) / 12);
    }
    return parseFloat(parts[0]) || 0;
  };

  const formatDistance = (val: number): string => {
    if (unitSystem === 'metric') return `${val.toFixed(2)}m`;

    // Imperial Formatter
    const feet = Math.floor(val);
    const inches = Math.round((val - feet) * 12);
    return `${feet}'-${inches}"`;
  };

  const formatArea = (val: number): string => {
    if (unitSystem === 'metric') return `${val.toFixed(2)} sqm`;
    return `${val.toFixed(2)} sqft`;
  };

  // Persistence Key
  const STORAGE_KEY = 'bwise_takeoff_data';

  // 4. Update units when System changes
  useEffect(() => {
    setTakeoffItems(prev => prev.map(item => {
      let newUnit = item.unit;
      if (unitSystem === 'metric') {
        if (item.type === 'linear') newUnit = 'm';
        if (item.type === 'area') newUnit = 'sqm';
      } else {
        if (item.type === 'linear') newUnit = 'ft';
        if (item.type === 'area') newUnit = 'sqft';
      }
      return { ...item, unit: newUnit };
    }));
  }, [unitSystem]);

  // 5. Save to LocalStorage
  // 1. Initial Load (Hydration)
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const { takeoffItems: savedItems, scale: savedScale } = JSON.parse(saved);
        if (savedItems) setTakeoffItems(savedItems);
        if (savedScale) setScale(savedScale);
      } catch (e) {
        console.error("Failed to load saved takeoff data", e);
      }
    }
  }, []);

  // 2. Auto-Save on change
  useEffect(() => {
    if (takeoffItems.length > 0 || scale) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ takeoffItems, scale }));
    }
  }, [takeoffItems, scale]);

  // 1. Initialize Fabric Canvas ONCE
  useEffect(() => {
    if (!canvasRef.current || fabricRef.current) return;

    const fabricCanvas = new fabric.Canvas(canvasRef.current, {
      width: containerRef.current?.offsetWidth || 800,
      height: 600,
      selection: false,
    });

    fabricRef.current = fabricCanvas;

    return () => {
      fabricCanvas.dispose();
      fabricRef.current = null;
    };
  }, []);

  // 2. Manage Event Listeners (refresh when state changes)
  useEffect(() => {
    const fabricCanvas = fabricRef.current;
    if (!fabricCanvas) return;

    const onMouseDown = (opt: any) => {
      if (isPanningMode) {
        isDragging.current = true;
        fabricCanvas.selection = false;
        lastMousePos.current = { x: opt.e.clientX, y: opt.e.clientY };
        fabricCanvas.defaultCursor = 'grabbing';
        fabricCanvas.setCursor('grabbing');
        fabricCanvas.renderAll();
        return;
      }

      // Right click to finish (opt.button === 3) or just use its own handler
      if (opt.button === 3) {
        finishMeasurement();
        return;
      }
      const pointer = fabricCanvas.getScenePoint(opt.e);
      handleCanvasClick(pointer);
    };

    const onMouseMove = (opt: any) => {
      if (isPanningMode && isDragging.current) {
        const e = opt.e;
        const vpt = [...fabricCanvas.viewportTransform];
        vpt[4] += e.clientX - lastMousePos.current.x;
        vpt[5] += e.clientY - lastMousePos.current.y;
        fabricCanvas.setViewportTransform(vpt as any);
        lastMousePos.current = { x: e.clientX, y: e.clientY };
        return;
      }

      const pointer = fabricCanvas.getScenePoint(opt.e);
      handleCanvasMouseMove(pointer, opt.e);
    };

    const onMouseUp = () => {
      if (isPanningMode) {
        isDragging.current = false;
        fabricCanvas.defaultCursor = 'grab';
        fabricCanvas.setCursor('grab');
        fabricCanvas.renderAll();
      }
    };

    const onDoubleClick = () => {
      if (isPanningMode) return;
      finishMeasurement();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        finishMeasurement();
      }
      if (e.key === "Shift") {
        setIsShiftPressed(true);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault();
        undo();
      }
      if (e.key.toLowerCase() === "v") {
        setIsPanningMode(prev => !prev);
      }
      if (e.key.toLowerCase() === "x") {
        setIsDeductionMode(prev => !prev);
      }
      if (e.key.toLowerCase() === "v") {
        setIsSelectMode(prev => !prev);
        setIsPanningMode(false);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Shift") {
        setIsShiftPressed(false);
      }
    };

    const onObjectModified = (opt: any) => {
      const obj = opt.target;
      if (!obj || !obj.data) return;
      const { takeoffItemId, measurementId, pointIndex } = obj.data;

      setTakeoffItems(prev => prev.map(item => {
        if (item.id === takeoffItemId) {
          return {
            ...item,
            measurements: item.measurements.map(m => {
              if (m.id === measurementId) {
                const newPoints = [...m.points];
                // If it's a point-based object (Count), update that point
                if (typeof pointIndex === 'number') {
                  newPoints[pointIndex] = { x: obj.left, y: obj.top };
                } else {
                  // If it's a group or polygon, we'd need more complex logic
                  // For now, let's keep it simple: moving is mostly for count items
                }
                return { ...m, points: newPoints };
              }
              return m;
            })
          };
        }
        return item;
      }));
    };

    // Set initial cursor
    let cursor = isPanningMode ? 'grab' : (isSelectMode ? 'default' : 'crosshair');
    fabricCanvas.defaultCursor = cursor;
    fabricCanvas.setCursor(cursor);

    fabricCanvas.on("mouse:down", onMouseDown);
    fabricCanvas.on("mouse:move", onMouseMove);
    fabricCanvas.on("mouse:up", onMouseUp);
    fabricCanvas.on("mouse:dblclick", onDoubleClick);
    fabricCanvas.on("object:modified", onObjectModified);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    return () => {
      fabricCanvas.off("mouse:down", onMouseDown);
      fabricCanvas.off("mouse:move", onMouseMove);
      fabricCanvas.off("mouse:up", onMouseUp);
      fabricCanvas.off("mouse:dblclick", onDoubleClick);
      fabricCanvas.off("object:modified", onObjectModified);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [calibrationMode, activeItemId, takeoffItems, currentPoints, scale, calibrationPoint1, isShiftPressed, isPanningMode, isSelectMode]);

  // Sync Fabric Objects to state (The "Holy Grail" of React-Fabric synchronization)
  useEffect(() => {
    if (!fabricRef.current) return;
    const canvas = fabricRef.current;

    // Clear all
    canvas.clear();

    // Restore Background from Ref if it exists
    if (bgImageRef.current) {
      canvas.backgroundImage = bgImageRef.current;
    }

    takeoffItems.forEach(item => {
      item.measurements.forEach(m => {
        if (item.type === 'linear' || item.type === 'polyline') {
          for (let i = 0; i < m.points.length - 1; i++) {
            drawDimensionProcedural(m.points[i], m.points[i + 1], item.color, item.name);
          }
        } else if (item.type === 'area') {
          drawAreaProcedural(m.points, item.color, m.quantity, item.unit);
        } else if (item.type === 'count') {
          m.points.forEach((p, idx) => drawCountProcedural(p, item.color, item.id, m.id, idx));
        }
      });
    });

    if (calibrationLine) {
      drawDimensionProcedural(calibrationLine.p1, calibrationLine.p2, '#ff0000', `Scale Ref: ${formatDistance(calibrationLine.distance)}`);
    }

    canvas.requestRenderAll();
  }, [takeoffItems, isSelectMode, scale, unitSystem, activeItemId, calibrationLine]);

  const drawDimensionProcedural = (p1: Point, p2: Point, color: string, name?: string) => {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const angle = Math.atan2(dy, dx);
    const tickLen = 6;

    const main = new fabric.Line([p1.x, p1.y, p2.x, p2.y], {
      stroke: color, strokeWidth: 2, selectable: false, evented: false
    });

    const t1 = new fabric.Line([
      p1.x - Math.sin(angle) * tickLen, p1.y + Math.cos(angle) * tickLen,
      p1.x + Math.sin(angle) * tickLen, p1.y - Math.cos(angle) * tickLen
    ], { stroke: color, strokeWidth: 2, selectable: false, evented: false });

    const t2 = new fabric.Line([
      p2.x - Math.sin(angle) * tickLen, p2.y + Math.cos(angle) * tickLen,
      p2.x + Math.sin(angle) * tickLen, p2.y - Math.cos(angle) * tickLen
    ], { stroke: color, strokeWidth: 2, selectable: false, evented: false });

    const dist = Math.sqrt(dx * dx + dy * dy);
    const quantity = scale ? dist / scale : dist;
    const label = `${name ? name + ': ' : ''}${formatDistance(quantity)}`;

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

    fabricRef.current?.add(main, t1, t2, text);
  };

  const drawAreaProcedural = (points: Point[], color: string, quantity: number, unit: string) => {
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
    fabricRef.current?.add(poly, text);
  };

  const drawCountProcedural = (p: Point, color: string, takeoffItemId?: string, measurementId?: string, pointIndex?: number) => {
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
    fabricRef.current?.add(circle);
  };

  // Update canvas size on window resize
  useEffect(() => {
    const handleResize = () => {
      if (fabricRef.current && containerRef.current) {
        fabricRef.current.setDimensions({
          width: containerRef.current.offsetWidth,
          height: fabricRef.current.height || 600
        });
      }
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const renderPage = useCallback(async (pageNumber: number, pdf: PDFJS.PDFDocumentProxy) => {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 2 }); // High res render
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) return;

    canvas.height = viewport.height;
    canvas.width = viewport.width;

    await page.render({ canvasContext: context, viewport } as any).promise;

    const dataUrl = canvas.toDataURL();
    const fabricCanvas = fabricRef.current;
    if (fabricCanvas) {
      fabric.Image.fromURL(dataUrl).then((img) => {
        // Resize canvas to match image ratio
        const containerWidth = containerRef.current?.offsetWidth || 800;
        const scaleFactor = containerWidth / img.width!;
        img.set({
          scaleX: scaleFactor,
          scaleY: scaleFactor,
          selectable: false,
          evented: false,
        });

        fabricCanvas.setDimensions({
          width: containerWidth,
          height: img.height! * scaleFactor
        });

        fabricCanvas.clear();
        bgImageRef.current = img;
        fabricCanvas.backgroundImage = img;
        fabricCanvas.requestRenderAll();
        // The takeoffItems useEffect will handle drawing the measurements
      });
    }
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type === "application/pdf" && pdfjs) {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
      setPdfDoc(pdf);
      setNumPages(pdf.numPages);
      setCurrentPage(1);
      renderPage(1, pdf);
    } else {
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        fabric.Image.fromURL(dataUrl).then((img) => {
          const containerWidth = containerRef.current?.offsetWidth || 800;
          const scaleFactor = containerWidth / img.width!;
          img.set({
            scaleX: scaleFactor,
            scaleY: scaleFactor,
            selectable: false,
            evented: false,
          });

          if (fabricRef.current) {
            fabricRef.current.setDimensions({
              width: containerWidth,
              height: img.height! * scaleFactor
            });
            fabricRef.current.clear();
            bgImageRef.current = img;
            fabricRef.current.backgroundImage = img;
            fabricRef.current.requestRenderAll();
          }
        });
      };
      reader.readAsDataURL(file);
    }
  };

  const ghostLineRef = useRef<fabric.Object | null>(null);

  const getSnappedVertex = (point: Point): Point => {
    const threshold = 15; // pixels
    let nearest: Point | null = null;
    let minSourceDist = Infinity;

    // Check all existing items and their measurements
    takeoffItems.forEach(item => {
      item.measurements.forEach(m => {
        m.points.forEach(p => {
          const dx = point.x - p.x;
          const dy = point.y - p.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < threshold && dist < minSourceDist) {
            minSourceDist = dist;
            nearest = p;
          }
        });
      });
    });

    // Also check current active points
    currentPoints.forEach(p => {
      const dx = point.x - p.x;
      const dy = point.y - p.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < threshold && dist < minSourceDist) {
        minSourceDist = dist;
        nearest = p;
      }
    });

    if (nearest) {
      setSnappedVertex(nearest);
    } else {
      setSnappedVertex(null);
    }

    return nearest || point;
  };

  const getSnappedPoint = (current: Point, last: Point): Point => {
    if (!isShiftPressed) return current;
    const dx = Math.abs(current.x - last.x);
    const dy = Math.abs(current.y - last.y);
    if (dx > dy) {
      return { x: current.x, y: last.y }; // Horizontal snap
    } else {
      return { x: last.x, y: current.y }; // Vertical snap
    }
  };

  const handleCanvasMouseMove = (origPoint: Point, e?: any) => {
    if (!fabricRef.current) return;

    // 1. First prioritize Vertex Snapping
    let point = getSnappedVertex(origPoint);

    // 2. Then apply Orthogonal snapping if Shift is pressed
    let finalPoint = point;
    if (calibrationMode && calibrationPoint1) {
      finalPoint = getSnappedPoint(point, calibrationPoint1);
    } else if (activeItemId && currentPoints.length > 0) {
      finalPoint = getSnappedPoint(point, currentPoints[currentPoints.length - 1]);
    }

    // Handle Ghost Line for calibration or linear takeoff
    if (calibrationMode && calibrationPoint1) {
      updateGhostLine(calibrationPoint1, finalPoint, "#ff0000");
    } else if (activeItemId && currentPoints.length > 0) {
      const activeItem = takeoffItems.find(i => i.id === activeItemId);
      if (activeItem && (activeItem.type === "linear" || activeItem.type === "area")) {
        updateGhostLine(currentPoints[currentPoints.length - 1], finalPoint, activeItem.color);
      }
    } else {
      removeGhostLine();
    }
  };

  const updateGhostLine = (start: Point, end: Point, color: string) => {
    if (!fabricRef.current) return;

    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const angle = Math.atan2(dy, dx);
    const tickLen = 6;

    if (ghostLineRef.current) {
      fabricRef.current.remove(ghostLineRef.current);
    }

    const main = new fabric.Line([start.x, start.y, end.x, end.y], {
      stroke: color,
      strokeWidth: 2,
      strokeDashArray: [5, 5],
      opacity: 0.5
    });

    const t1 = new fabric.Line([
      start.x - Math.sin(angle) * tickLen, start.y + Math.cos(angle) * tickLen,
      start.x + Math.sin(angle) * tickLen, start.y - Math.cos(angle) * tickLen
    ], { stroke: color, strokeWidth: 2, opacity: 0.5 });

    const t2 = new fabric.Line([
      end.x - Math.sin(angle) * tickLen, end.y + Math.cos(angle) * tickLen,
      end.x + Math.sin(angle) * tickLen, end.y - Math.cos(angle) * tickLen
    ], { stroke: color, strokeWidth: 2, opacity: 0.5 });

    const dist = Math.sqrt(dx * dx + dy * dy);
    const quantity = scale ? dist / scale : dist;
    const text = new fabric.IText(formatDistance(quantity), {
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

    ghostLineRef.current = new fabric.Group([main, t1, t2, text], {
      selectable: false,
      evented: false
    }) as any;

    fabricRef.current.add(ghostLineRef.current!);
    fabricRef.current.requestRenderAll();
  };

  const removeGhostLine = () => {
    if (ghostLineRef.current && fabricRef.current) {
      fabricRef.current.remove(ghostLineRef.current);
      ghostLineRef.current = null;
      fabricRef.current.requestRenderAll();
    }
  };

  const calculateArea = (points: Point[]) => {
    if (points.length < 3) return 0;
    let area = 0;
    for (let i = 0; i < points.length; i++) {
      const j = (i + 1) % points.length;
      area += points[i].x * points[j].y;
      area -= points[j].x * points[i].y;
    }
    const pixelArea = Math.abs(area) / 2;
    // Area scale factor is squared (pixels per meter ^ 2)
    return scale ? pixelArea / (scale * scale) : pixelArea;
  };

  const undo = () => {
    if (currentPoints.length > 0) {
      // Undo last point
      const newPoints = currentPoints.slice(0, -1);
      setCurrentPoints(newPoints);

      // Remove last temp line if drawing area
      if (tempLines.length > 0) {
        const lastLine = tempLines[tempLines.length - 1];
        fabricRef.current?.remove(lastLine);
        setTempLines(prev => prev.slice(0, -1));
      }
      return;
    }

    if (activeItemId) {
      // Undo last measurement
      setTakeoffItems(prev => prev.map(item => {
        if (item.id === activeItemId && item.measurements.length > 0) {
          const lastM = item.measurements[item.measurements.length - 1];
          // useEffect handles the visual removal from canvas
          return {
            ...item,
            measurements: item.measurements.slice(0, -1),
            totalQuantity: item.totalQuantity - lastM.quantity
          };
        }
        return item;
      }));
    }
  };

  const finishMeasurement = () => {
    if (activeItemId && currentPoints.length > 2) {
      const activeItem = takeoffItems.find(i => i.id === activeItemId);
      if (activeItem?.type === "area") {
        let area = calculateArea(currentPoints);
        if (isDeductionMode) area = -area; // Subtract if deduction

        setTakeoffItems(prev => prev.map(i => {
          if (i.id === activeItemId) {
            const m: Measurement = { id: Math.random().toString(), points: [...currentPoints], quantity: area };
            return { ...i, measurements: [...i.measurements, m], totalQuantity: i.totalQuantity + area };
          }
          return i;
        }));
      }
    }

    // Clear temp lines
    tempLines.forEach(l => fabricRef.current?.remove(l));
    setTempLines([]);
    setCurrentPoints([]);
    removeGhostLine();
  };

  const handleCanvasClick = (rawPoint: Point) => {
    if (isSelectMode) return;
    // Priority: Vertex Snap -> Ortho Snap
    let point = getSnappedVertex(rawPoint);

    if (calibrationMode && calibrationPoint1) {
      point = getSnappedPoint(point, calibrationPoint1);
    } else if (activeItemId && currentPoints.length > 0) {
      point = getSnappedPoint(point, currentPoints[currentPoints.length - 1]);
    }

    if (calibrationMode) {
      if (!calibrationPoint1) {
        setCalibrationPoint1(point);
      } else {
        const dx = point.x - calibrationPoint1.x;
        const dy = point.y - calibrationPoint1.y;
        const pixelDist = Math.sqrt(dx * dx + dy * dy);
        const dist = parseDistance(calibrationDistance);
        if (dist > 0) {
          setScale(pixelDist / dist);
          setCalibrationMode(false);
          setCalibrationPoint1(null);
          setCalibrationLine({ p1: calibrationPoint1, p2: point, distance: dist });

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
          const m: Measurement = { id: Math.random().toString(), points: [point], quantity: 1 };
          return { ...i, measurements: [...i.measurements, m], totalQuantity: i.totalQuantity + 1 };
        }
        return i;
      }));
    } else if (activeItem.type === "linear") {
      if (currentPoints.length === 1) {
        const p1 = currentPoints[0];
        const dist = Math.sqrt(Math.pow(point.x - p1.x, 2) + Math.pow(point.y - p1.y, 2));
        const quantity = scale ? dist / scale : dist;
        setTakeoffItems(prev => prev.map(i => {
          if (i.id === activeItemId) {
            const m: Measurement = { id: Math.random().toString(), points: [p1, point], quantity };
            return { ...i, measurements: [...i.measurements, m], totalQuantity: i.totalQuantity + quantity };
          }
          return i;
        }));
        setCurrentPoints([]);
        removeGhostLine();
      } else {
        setCurrentPoints([point]);
      }
    } else if (activeItem.type === "area") {
      const newPoints = [...currentPoints, point];
      setCurrentPoints(newPoints);
      if (newPoints.length > 1) {
        const lastP = newPoints[newPoints.length - 2];
        const line = new fabric.Line([lastP.x, lastP.y, point.x, point.y], {
          stroke: activeItem.color, strokeWidth: 2, selectable: false, evented: false
        });
        fabricRef.current?.add(line);
        setTempLines(prev => [...prev, line]);
      }
    }
  };

  const renderTakeoffs = () => {
    // Redraw all fabric objects for takeoffs
  };

  const createTakeoffItem = (type: TakeoffMode) => {
    setIsPanningMode(false);
    setIsDeductionMode(false);
    setIsSelectMode(false);
    setCurrentPoints([]);
    setTempLines([]);

    // Default assemblies for the demo
    const defaultLinkedCosts = [];
    if (type === 'area') {
      defaultLinkedCosts.push({ costItemId: 'c1', ratio: 1 }); // Concrete
      defaultLinkedCosts.push({ costItemId: 'c2', ratio: 1 }); // Labor
    } else if (type === 'linear') {
      defaultLinkedCosts.push({ costItemId: 'c3', ratio: 1 }); // Studs
      defaultLinkedCosts.push({ costItemId: 'c4', ratio: 1 }); // Labor
    } else if (type === 'count') {
      defaultLinkedCosts.push({ costItemId: 'c6', ratio: 1 }); // Hardware
    }

    const newItem: TakeoffItem = {
      id: Math.random().toString(36).substr(2, 9),
      name: `New ${type} ${takeoffItems.length + 1}`,
      type,
      color: `#${Math.floor(Math.random() * 16777215).toString(16)}`,
      measurements: [],
      totalQuantity: 0,
      unit: type === "area" ? "sqm" : type === "count" ? "ea" : "m",
      linkedCosts: defaultLinkedCosts
    };
    setTakeoffItems([...takeoffItems, newItem]);
    setActiveItemId(newItem.id);
  };

  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden">
      <TakeoffSidebar
        items={takeoffItems}
        activeItemId={activeItemId}
        onSelectItem={(id) => {
          setActiveItemId(id);
          setIsPanningMode(false);
          setIsSelectMode(false);
          setCurrentPoints([]);
          setTempLines([]);
        }}
        onCreateItem={createTakeoffItem}
        onDeleteItem={(id) => setTakeoffItems(prev => prev.filter(i => i.id !== id))}
        onUpdateItem={(id, updates) => setTakeoffItems(prev => prev.map(i => i.id === id ? { ...i, ...updates } : i))}
      />

      <div className="flex-1 flex flex-col relative overflow-hidden">
        {/* Toolbar */}
        <div className="p-4 bg-white border-b border-gray-200 flex items-center justify-between shadow-sm z-10">
          <div className="flex items-center space-x-4">
            <label className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer transition">
              <FileUp className="w-5 h-5" />
              <span>Upload Plan</span>
              <input type="file" className="hidden" accept="image/*,application/pdf" onChange={handleFileUpload} />
            </label>

            <div className="h-8 w-px bg-gray-200" />

            <div className="flex items-center space-x-2">
              <input
                type="number"
                placeholder="Scale Dist"
                className="w-24 px-3 py-2 border rounded-lg text-sm"
                value={calibrationDistance}
                onChange={e => setCalibrationDistance(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') e.preventDefault(); }}
              />
              <button
                type="button"
                onClick={() => {
                  if (!calibrationDistance || parseFloat(calibrationDistance) <= 0) {
                    alert("Please enter a known distance first!");
                    return;
                  }
                  setCalibrationMode(true);
                  setCalibrationPoint1(null);
                  setIsPanningMode(false);
                }}
                className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition ${calibrationMode ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                title="Calibrate (Shift+C)"
              >
                <Ruler className="w-5 h-5" />
                <span>Calibrate</span>
              </button>
              <button
                type="button"
                onClick={() => setIsPanningMode(!isPanningMode)}
                className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition ${isPanningMode ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                title="Pan Tool (V)"
              >
                <Move className="w-5 h-5" />
                <span>Pan</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsSelectMode(!isSelectMode);
                  setIsPanningMode(false);
                }}
                className={`p-2 rounded-lg transition ${isSelectMode ? 'bg-blue-600 text-white shadow-lg' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                title="Select/Move Tool (V)"
              >
                <MousePointer2 className="w-5 h-5" />
              </button>

              <div className="flex items-center bg-gray-100 rounded-lg p-1">
                <button
                  onClick={() => setUnitSystem('metric')}
                  className={`px-3 py-1 text-[10px] font-bold rounded-md transition ${unitSystem === 'metric' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  METRIC (m)
                </button>
                <button
                  onClick={() => setUnitSystem('imperial')}
                  className={`px-3 py-1 text-[10px] font-bold rounded-md transition ${unitSystem === 'imperial' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  IMPERIAL (ft)
                </button>
              </div>

              <div className="h-8 w-px bg-gray-200" />

              <button
                type="button"
                onClick={() => setIsDeductionMode(!isDeductionMode)}
                className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition ${isDeductionMode ? 'bg-red-500 text-white animate-pulse' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                title="Deduct Mode (X)"
              >
                <Scissors className="w-5 h-5" />
                <span>Deduct</span>
              </button>

              <div className="h-8 w-px bg-gray-200" />

              <button
                type="button"
                onClick={undo}
                className="p-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition"
                title="Undo (Ctrl+Z)"
              >
                <Undo2 className="w-5 h-5" />
              </button>

              <button
                type="button"
                onClick={() => {
                  if (confirm("Clear all measurements?")) {
                    setTakeoffItems(prev => prev.map(i => ({ ...i, measurements: [], totalQuantity: 0 })));
                    fabricRef.current?.getObjects().forEach(obj => {
                      if (obj !== fabricRef.current?.backgroundImage) {
                        fabricRef.current?.remove(obj);
                      }
                    });
                  }
                }}
                className="p-2 bg-gray-100 text-red-600 rounded-lg hover:bg-red-50 transition"
                title="Clear All"
              >
                <RotateCcw className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {numPages > 1 && (
              <div className="flex items-center space-x-2 mr-4">
                <button
                  type="button"
                  disabled={currentPage === 1}
                  onClick={() => {
                    const next = currentPage - 1;
                    setCurrentPage(next);
                    if (pdfDoc) renderPage(next, pdfDoc);
                  }}
                  className="p-2 disabled:opacity-30"
                >
                  <ChevronLeft />
                </button>
                <span className="text-sm font-medium">Page {currentPage} of {numPages}</span>
                <button
                  type="button"
                  disabled={currentPage === numPages}
                  onClick={() => {
                    const next = currentPage + 1;
                    setCurrentPage(next);
                    if (pdfDoc) renderPage(next, pdfDoc);
                  }}
                  className="p-2 disabled:opacity-30"
                >
                  <ChevronRight />
                </button>
              </div>
            )}
            <button
              type="button"
              onClick={() => {
                if (fabricRef.current) {
                  const zoom = fabricRef.current.getZoom();
                  fabricRef.current.setZoom(zoom * 1.1);
                }
              }}
              className="p-2 bg-white border rounded-lg hover:bg-gray-50"
            >
              <ZoomIn className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={() => {
                if (fabricRef.current) {
                  const zoom = fabricRef.current.getZoom();
                  fabricRef.current.setZoom(zoom / 1.1);
                }
              }}
              className="p-2 bg-white border rounded-lg hover:bg-gray-50"
            >
              <ZoomOut className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Main Workspace Area (Canvas + Estimation) */}
        <div className="flex-1 flex flex-row overflow-hidden">
          {/* Canvas Viewport */}
          <div ref={containerRef} className="flex-1 relative overflow-auto p-8 bg-gray-200/50 scrollbar-hide">
            <div className="inline-block shadow-2xl bg-white">
              <canvas ref={canvasRef} />
            </div>

            {calibrationMode && (
              <div className="absolute top-12 left-1/2 -translate-x-1/2 bg-orange-600 text-white px-6 py-3 rounded-full shadow-lg z-20 animate-bounce">
                {calibrationPoint1 ? "Click second point to finish calibration" : "Click first point to start calibration"}
              </div>
            )}

            {isShiftPressed && (
              <div className="absolute bottom-12 left-1/2 -translate-x-1/2 bg-blue-600/80 backdrop-blur text-white px-4 py-2 rounded-full shadow-lg z-20 text-xs font-bold uppercase tracking-widest">
                Precision Mode Active (Snapped)
              </div>
            )}

            {isDeductionMode && (
              <div className="absolute top-24 left-1/2 -translate-x-1/2 bg-red-600 text-white px-4 py-2 rounded-full shadow-lg z-20 text-xs font-bold uppercase tracking-widest animate-pulse border-2 border-white shadow-red-500/50">
                Deduction Mode Active (Subtracting Area)
              </div>
            )}

            {snappedVertex && (
              <div
                className="fixed pointer-events-none z-50 w-4 h-4 rounded-full border-2 border-orange-500 bg-orange-500/30"
                style={{
                  left: (snappedVertex.x * (fabricRef.current?.getZoom() || 1)) + (fabricRef.current?.viewportTransform?.[4] || 0) + containerRef.current?.getBoundingClientRect().left! - 8,
                  top: (snappedVertex.y * (fabricRef.current?.getZoom() || 1)) + (fabricRef.current?.viewportTransform?.[5] || 0) + containerRef.current?.getBoundingClientRect().top! - 8,
                }}
              />
            )}
          </div>

          {/* <EstimationPanel
            items={takeoffItems}
            catalog={costCatalog}
          /> */}
        </div>
      </div>
    </div>
  );
};

export default FloorPlanMeasure;
