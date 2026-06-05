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
  const [currentDrawing, setCurrentDrawing] = useState<Drawing | null>(null);
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

    if (currentDrawing) {
      ctx.strokeStyle = currentDrawing.color;
      ctx.lineWidth = currentDrawing.strokeWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (currentDrawing.type === 'rectangle') {
        ctx.strokeRect(
          currentDrawing.x,
          currentDrawing.y,
          currentDrawing.width,
          currentDrawing.height
        );
      } else if (currentDrawing.type === 'pen') {
        if (currentDrawing.points.length >= 2) {
          ctx.beginPath();
          ctx.moveTo(currentDrawing.points[0].x, currentDrawing.points[0].y);
          for (let i = 1; i < currentDrawing.points.length; i++) {
            ctx.lineTo(currentDrawing.points[i].x, currentDrawing.points[i].y);
          }
          ctx.stroke();
        }
      }
    }

    ctx.restore();
  }, [drawings, currentDrawing, offset, scale]);

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
      setCurrentDrawing({
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
      setCurrentDrawing({
        id: Date.now().toString(),
        type: 'pen',
        points: [worldPos],
        color,
        strokeWidth,
      });
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

    if (!isDrawing || !currentDrawing) return;

    const worldPos = screenToWorld(e.clientX, e.clientY);

    if (currentDrawing.type === 'rectangle') {
      setCurrentDrawing({
        ...currentDrawing,
        width: worldPos.x - currentDrawing.x,
        height: worldPos.y - currentDrawing.y,
      });
    } else if (currentDrawing.type === 'pen') {
      setCurrentDrawing({
        ...currentDrawing,
        points: [...currentDrawing.points, worldPos],
      });
    }
  };

  const handleMouseUp = () => {
    if (isPanning) {
      setIsPanning(false);
      return;
    }

    if (isDrawing && currentDrawing) {
      let finalDrawing = currentDrawing;
      if (currentDrawing.type === 'rectangle') {
        if (currentDrawing.width < 0) {
          finalDrawing = {
            ...currentDrawing,
            x: currentDrawing.x + currentDrawing.width,
            width: Math.abs(currentDrawing.width),
          };
        }
        if (currentDrawing.height < 0) {
          finalDrawing = {
            ...finalDrawing,
            y: currentDrawing.y + currentDrawing.height,
            height: Math.abs(currentDrawing.height),
          };
        }
      }
      onDraw(finalDrawing);
    }

    setIsDrawing(false);
    setCurrentDrawing(null);
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
