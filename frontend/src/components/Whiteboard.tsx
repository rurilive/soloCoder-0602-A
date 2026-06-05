import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { Drawing, ToolType, Point } from '../types';

interface WhiteboardProps {
  drawings: Drawing[];
  tool: ToolType;
  color: string;
  strokeWidth: number;
  onDraw: (drawing: Drawing) => void;
}

export const Whiteboard: React.FC<WhiteboardProps> = ({
  drawings,
  tool,
  color,
  strokeWidth,
  onDraw,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  const [currentRectangle, setCurrentRectangle] = useState<Drawing | null>(null);
  const currentPenPointsRef = useRef<Point[]>([]);
  const currentDrawingIdRef = useRef<string>('');
  const lastMouseRef = useRef<Point>({ x: 0, y: 0 });
  const panStartRef = useRef<Point>({ x: 0, y: 0 });

  const screenToWorld = useCallback(
    (screenX: number, screenY: number): Point => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      return {
        x: (screenX - rect.left - offset.x) / scale,
        y: (screenY - rect.top - offset.y) / scale,
      };
    },
    [offset, scale]
  );

  const drawPenSegment = useCallback(
    (ctx: CanvasRenderingContext2D, points: Point[]) => {
      if (points.length < 2) return;
      ctx.beginPath();
      ctx.moveTo(points[points.length - 2].x, points[points.length - 2].y);
      ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
      ctx.stroke();
    },
    []
  );

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(offset.x, offset.y);
    ctx.scale(scale, scale);

    for (const drawing of drawings) {
      ctx.strokeStyle = drawing.color;
      ctx.lineWidth = drawing.strokeWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (drawing.type === 'rectangle') {
        ctx.strokeRect(drawing.x, drawing.y, drawing.width, drawing.height);
      } else if (drawing.type === 'pen') {
        if (drawing.points.length < 2) continue;
        ctx.beginPath();
        ctx.moveTo(drawing.points[0].x, drawing.points[0].y);
        for (let i = 1; i < drawing.points.length; i++) {
          ctx.lineTo(drawing.points[i].x, drawing.points[i].y);
        }
        ctx.stroke();
      }
    }

    if (currentRectangle) {
      ctx.strokeStyle = currentRectangle.color;
      ctx.lineWidth = currentRectangle.strokeWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeRect(
        currentRectangle.x,
        currentRectangle.y,
        currentRectangle.width,
        currentRectangle.height
      );
    }

    if (currentPenPointsRef.current.length >= 2) {
      ctx.strokeStyle = color;
      ctx.lineWidth = strokeWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      const points = currentPenPointsRef.current;
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
      }
      ctx.stroke();
    }

    ctx.restore();
  }, [drawings, currentRectangle, offset, scale, color, strokeWidth]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const resizeCanvas = () => {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
      redraw();
    };

    resizeCanvas();
    const observer = new ResizeObserver(resizeCanvas);
    observer.observe(container);

    return () => observer.disconnect();
  }, [redraw]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat) {
        setIsSpacePressed(true);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setIsSpacePressed(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;

    const worldPos = screenToWorld(e.clientX, e.clientY);

    if (isSpacePressed) {
      setIsPanning(true);
      panStartRef.current = { x: e.clientX - offset.x, y: e.clientY - offset.y };
      return;
    }

    if (tool === 'rectangle') {
      setIsDrawing(true);
      setCurrentRectangle({
        id: Date.now().toString(),
        type: 'rectangle',
        x: worldPos.x,
        y: worldPos.y,
        width: 0,
        height: 0,
        color,
        strokeWidth,
      });
    } else if (tool === 'pen') {
      setIsDrawing(true);
      currentDrawingIdRef.current = Date.now().toString();
      currentPenPointsRef.current = [worldPos];
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isPanning) {
      setOffset({
        x: e.clientX - panStartRef.current.x,
        y: e.clientY - panStartRef.current.y,
      });
      return;
    }

    if (!isDrawing) return;

    const worldPos = screenToWorld(e.clientX, e.clientY);

    if (tool === 'rectangle' && currentRectangle) {
      setCurrentRectangle({
        ...currentRectangle,
        width: worldPos.x - currentRectangle.x,
        height: worldPos.y - currentRectangle.y,
      });
    } else if (tool === 'pen') {
      currentPenPointsRef.current.push(worldPos);
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (ctx && currentPenPointsRef.current.length >= 2) {
        ctx.save();
        ctx.translate(offset.x, offset.y);
        ctx.scale(scale, scale);
        ctx.strokeStyle = color;
        ctx.lineWidth = strokeWidth;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        drawPenSegment(ctx, currentPenPointsRef.current);
        ctx.restore();
      }
    }
  };

  const handleMouseUp = () => {
    if (isPanning) {
      setIsPanning(false);
      return;
    }

    if (isDrawing) {
      if (tool === 'rectangle' && currentRectangle) {
        let finalDrawing = currentRectangle;
        if (currentRectangle.width < 0) {
          finalDrawing = {
            ...currentRectangle,
            x: currentRectangle.x + currentRectangle.width,
            width: Math.abs(currentRectangle.width),
          };
        }
        if (currentRectangle.height < 0) {
          finalDrawing = {
            ...finalDrawing,
            y: currentRectangle.y + currentRectangle.height,
            height: Math.abs(currentRectangle.height),
          };
        }
        onDraw(finalDrawing);
      } else if (tool === 'pen' && currentPenPointsRef.current.length >= 2) {
        const finalDrawing: Drawing = {
          id: currentDrawingIdRef.current,
          type: 'pen',
          points: [...currentPenPointsRef.current],
          color,
          strokeWidth,
        };
        onDraw(finalDrawing);
      }
    }

    setIsDrawing(false);
    setCurrentRectangle(null);
    currentPenPointsRef.current = [];
    currentDrawingIdRef.current = '';
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.min(Math.max(scale * delta, 0.1), 5);

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    setOffset({
      x: mouseX - ((mouseX - offset.x) * newScale) / scale,
      y: mouseY - ((mouseY - offset.y) * newScale) / scale,
    });
    setScale(newScale);
  };

  return (
    <div ref={containerRef} className="canvas-container">
      <canvas
        ref={canvasRef}
        className={`whiteboard-canvas ${isSpacePressed ? 'panning' : ''}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      />
    </div>
  );
};
