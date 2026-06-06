import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { Drawing, ToolType, Point, UserCursor } from '../types';

interface WhiteboardProps {
  drawings: Drawing[];
  tool: ToolType;
  color: string;
  strokeWidth: number;
  onDraw: (drawing: Drawing) => void;
  otherCursors: UserCursor[];
  cursorOpacity: number;
  onCursorMove: (x: number, y: number) => void;
}

export const Whiteboard: React.FC<WhiteboardProps> = ({
  drawings,
  tool,
  color,
  strokeWidth,
  onDraw,
  otherCursors,
  cursorOpacity,
  onCursorMove,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  const currentPenPointsRef = useRef<Point[]>([]);
  const currentRectangleRef = useRef<{
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const currentDrawingIdRef = useRef<string>('');
  const panStartRef = useRef<Point>({ x: 0, y: 0 });
  const redrawRef = useRef<(() => void) | null>(null);

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

  const worldToScreen = useCallback(
    (worldX: number, worldY: number): Point => {
      return {
        x: worldX * scale + offset.x,
        y: worldY * scale + offset.y,
      };
    },
    [offset, scale]
  );

  const drawPenSegment = useCallback(
    (ctx: CanvasRenderingContext2D, p1: Point, p2: Point) => {
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    },
    []
  );

  const drawCursors = useCallback((ctx: CanvasRenderingContext2D) => {
    ctx.globalAlpha = cursorOpacity;
    for (const cursor of otherCursors) {
      const screenPos = worldToScreen(cursor.x, cursor.y);
      ctx.save();
      ctx.translate(screenPos.x, screenPos.y);

      ctx.fillStyle = cursor.userColor;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;

      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, 16);
      ctx.lineTo(6, 10);
      ctx.lineTo(10, 16);
      ctx.lineTo(14, 14);
      ctx.lineTo(10, 8);
      ctx.lineTo(16, 8);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(14, 12, 28, 18);
      ctx.strokeStyle = cursor.userColor;
      ctx.lineWidth = 1;
      ctx.strokeRect(14, 12, 28, 18);

      ctx.fillStyle = cursor.userColor;
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`#${cursor.userNumber}`, 28, 21);

      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }, [otherCursors, cursorOpacity, worldToScreen]);

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

    if (currentRectangleRef.current) {
      const rect = currentRectangleRef.current;
      ctx.strokeStyle = color;
      ctx.lineWidth = strokeWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
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

    drawCursors(ctx);
  }, [drawings, offset, scale, color, strokeWidth, drawCursors]);

  useEffect(() => {
    redrawRef.current = redraw;
  }, [redraw]);

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
  }, [redraw, otherCursors, cursorOpacity]);

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
      currentDrawingIdRef.current = Date.now().toString();
      currentRectangleRef.current = {
        id: currentDrawingIdRef.current,
        x: worldPos.x,
        y: worldPos.y,
        width: 0,
        height: 0,
      };
    } else if (tool === 'pen') {
      setIsDrawing(true);
      currentDrawingIdRef.current = Date.now().toString();
      currentPenPointsRef.current = [worldPos];
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const worldPos = screenToWorld(e.clientX, e.clientY);
    onCursorMove(worldPos.x, worldPos.y);

    if (isPanning) {
      setOffset({
        x: e.clientX - panStartRef.current.x,
        y: e.clientY - panStartRef.current.y,
      });
      return;
    }

    if (!isDrawing) return;

    if (tool === 'rectangle' && currentRectangleRef.current) {
      currentRectangleRef.current.width = worldPos.x - currentRectangleRef.current.x;
      currentRectangleRef.current.height = worldPos.y - currentRectangleRef.current.y;
      redrawRef.current?.();
    } else if (tool === 'pen') {
      const points = currentPenPointsRef.current;
      const prevPoint = points[points.length - 1];
      points.push(worldPos);
      if (points.length >= 2) {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (ctx) {
          ctx.save();
          ctx.translate(offset.x, offset.y);
          ctx.scale(scale, scale);
          ctx.strokeStyle = color;
          ctx.lineWidth = strokeWidth;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          drawPenSegment(ctx, prevPoint, worldPos);
          ctx.restore();
        }
      }
    }
  };

  const handleMouseUp = () => {
    if (isPanning) {
      setIsPanning(false);
      return;
    }

    if (isDrawing) {
      if (tool === 'rectangle' && currentRectangleRef.current) {
        let finalDrawing = currentRectangleRef.current;
        if (currentRectangleRef.current.width < 0) {
          finalDrawing = {
            ...currentRectangleRef.current,
            x: currentRectangleRef.current.x + currentRectangleRef.current.width,
            width: Math.abs(currentRectangleRef.current.width),
          };
        }
        if (currentRectangleRef.current.height < 0) {
          finalDrawing = {
            ...finalDrawing,
            y: finalDrawing.y + finalDrawing.height,
            height: Math.abs(finalDrawing.height),
          };
        }
        onDraw({
          id: finalDrawing.id,
          type: 'rectangle',
          x: finalDrawing.x,
          y: finalDrawing.y,
          width: finalDrawing.width,
          height: finalDrawing.height,
          color,
          strokeWidth,
        });
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
    currentRectangleRef.current = null;
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
