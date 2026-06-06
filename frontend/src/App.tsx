import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import './App.css';
import { Whiteboard } from './components/Whiteboard';
import { useWebSocket } from './hooks/useWebSocket';
import type { Drawing, ToolType, UserCursor, CursorPositionMessage } from './types';

const API_BASE = `http://${window.location.hostname}:1111`;
const MAX_UNDO_STACK = 10;

const CURSOR_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#3b82f6', '#8b5cf6', '#ec4899', '#f43f5e', '#6366f1',
];

function App() {
  const [roomId, setRoomId] = useState<string | null>(null);
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [tool, setTool] = useState<ToolType>('pen');
  const [color, setColor] = useState('#000000');
  const [strokeWidth, setStrokeWidth] = useState(3);
  const [otherCursors, setOtherCursors] = useState<Map<string, UserCursor>>(new Map());
  const [cursorOpacity, setCursorOpacity] = useState(0.8);
  const undoStackRef = useRef<string[]>([]);
  const userIdRef = useRef<string>(`user_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
  const userNumberRef = useRef<number>(Math.floor(Math.random() * 100));
  const userColorRef = useRef<string>(CURSOR_COLORS[Math.floor(Math.random() * CURSOR_COLORS.length)]);
  const lastCursorSendRef = useRef<number>(0);

  const addToUndoStack = useCallback((drawingId: string) => {
    undoStackRef.current.push(drawingId);
    if (undoStackRef.current.length > MAX_UNDO_STACK) {
      undoStackRef.current.shift();
    }
  }, []);

  const handleDrawingReceived = useCallback((drawing: Drawing) => {
    setDrawings((prev) => [...prev, drawing]);
  }, []);

  const handleUndoReceived = useCallback((drawingId: string) => {
    setDrawings((prev) => prev.filter((d) => d.id !== drawingId));
    undoStackRef.current = undoStackRef.current.filter((id) => id !== drawingId);
  }, []);

  const handleClearReceived = useCallback(() => {
    setDrawings([]);
    undoStackRef.current = [];
  }, []);

  const handleCursorReceived = useCallback((message: CursorPositionMessage) => {
    setOtherCursors((prev) => {
      const newMap = new Map(prev);
      newMap.set(message.userId, {
        userId: message.userId,
        userNumber: message.userNumber,
        userColor: message.userColor,
        x: message.x,
        y: message.y,
        lastUpdate: Date.now(),
      });
      return newMap;
    });
  }, []);

  const handleInit = useCallback((initDrawings: Drawing[]) => {
    setDrawings(initDrawings);
    undoStackRef.current = initDrawings.map((d) => d.id).slice(-MAX_UNDO_STACK);
  }, []);

  const handleRoomInvalid = useCallback(() => {
    alert('房间已失效，将返回首页');
    setRoomId(null);
    window.location.hash = '';
  }, []);

  const handleReconnectFailed = useCallback(() => {
    alert('连接服务器失败，将返回首页');
    setRoomId(null);
    window.location.hash = '';
  }, []);

  const { sendDrawing, sendUndo, sendClear, sendCursor, status } = useWebSocket({
    roomId: roomId || '',
    onDrawingReceived: handleDrawingReceived,
    onUndoReceived: handleUndoReceived,
    onClearReceived: handleClearReceived,
    onCursorReceived: handleCursorReceived,
    onInit: handleInit,
    onRoomInvalid: handleRoomInvalid,
    onReconnectFailed: handleReconnectFailed,
  });

  const handleUndo = useCallback(() => {
    if (undoStackRef.current.length === 0) return;
    const drawingId = undoStackRef.current.pop();
    if (drawingId) {
      setDrawings((prev) => prev.filter((d) => d.id !== drawingId));
      sendUndo(drawingId);
    }
  }, [sendUndo]);

  const handleClear = useCallback(() => {
    if (!confirm('确定要清空画布吗？此操作不可撤销。')) return;
    setDrawings([]);
    undoStackRef.current = [];
    sendClear();
  }, [sendClear]);

  const handleCursorMove = useCallback((x: number, y: number) => {
    const now = Date.now();
    if (now - lastCursorSendRef.current < 30) return;
    lastCursorSendRef.current = now;
    sendCursor({
      type: 'cursor',
      userId: userIdRef.current,
      userNumber: userNumberRef.current,
      userColor: userColorRef.current,
      x,
      y,
    });
  }, [sendCursor]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.repeat) {
        e.preventDefault();
        handleUndo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo]);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setOtherCursors((prev) => {
        const newMap = new Map(prev);
        for (const [userId, cursor] of newMap) {
          if (now - cursor.lastUpdate > 5000) {
            newMap.delete(userId);
          }
        }
        return newMap;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const createRoom = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/rooms`, { method: 'POST' });
      const data = await res.json();
      setRoomId(data.room_id);
      setDrawings([]);
    } catch (e) {
      console.error('Failed to create room:', e);
    }
  };

  const joinRoom = async () => {
    const hash = window.location.hash.slice(1);
    if (hash) {
      try {
        const res = await fetch(`${API_BASE}/api/rooms/${hash}`);
        if (res.ok) {
          setRoomId(hash);
          setDrawings([]);
        } else if (res.status === 404) {
          alert('房间不存在或已失效，将返回首页');
          window.location.hash = '';
        }
      } catch (e) {
        console.error('Failed to join room:', e);
        alert('连接服务器失败，将返回首页');
        window.location.hash = '';
      }
    }
  };

  React.useEffect(() => {
    joinRoom();
  }, []);

  const handleDraw = (drawing: Drawing) => {
    setDrawings((prev) => [...prev, drawing]);
    addToUndoStack(drawing.id);
    sendDrawing(drawing);
  };

  const copyShareLink = () => {
    if (!roomId) return;
    const link = `${window.location.origin}${window.location.pathname}#${roomId}`;
    navigator.clipboard.writeText(link);
    alert('分享链接已复制到剪贴板！');
  };

  const cursorList = useMemo(() => Array.from(otherCursors.values()), [otherCursors]);

  if (!roomId) {
    return (
      <div className="home-page">
        <h1 className="home-title">实时协作白板</h1>
        <p className="home-subtitle">多人实时协作，支持矩形、自由线条绘制，无限画布</p>
        <button className="home-btn" onClick={createRoom}>
          创建新房间
        </button>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="toolbar">
        <div className="toolbar-group">
          <button
            className={`btn ${tool === 'pen' ? 'btn-active' : ''}`}
            onClick={() => setTool('pen')}
          >
            ✏️ 画笔
          </button>
          <button
            className={`btn ${tool === 'rectangle' ? 'btn-active' : ''}`}
            onClick={() => setTool('rectangle')}
          >
            ⬜ 矩形
          </button>
        </div>

        <div className="toolbar-divider" />

        <div className="toolbar-group">
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            style={{ width: 32, height: 32, border: 'none', cursor: 'pointer', borderRadius: 4 }}
          />
          <select
            value={strokeWidth}
            onChange={(e) => setStrokeWidth(Number(e.target.value))}
            className="btn"
            style={{ padding: '6px 10px' }}
          >
            <option value={1}>1px</option>
            <option value={3}>3px</option>
            <option value={5}>5px</option>
            <option value={8}>8px</option>
          </select>
        </div>

        <div className="toolbar-divider" />

        <div className="toolbar-group">
          <button className="btn" onClick={handleUndo} title="撤销 (Ctrl+Z)">
            ↩️ 撤销
          </button>
          <button className="btn btn-danger" onClick={handleClear} title="清空画布">
            🗑️ 清空
          </button>
        </div>

        <div className="toolbar-divider" />

        <div className="toolbar-group">
          <label style={{ fontSize: 12, color: '#6b7280', display: 'flex', alignItems: 'center', gap: 8 }}>
            他人光标透明度:
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={cursorOpacity}
              onChange={(e) => setCursorOpacity(Number(e.target.value))}
              style={{ width: 80 }}
            />
            <span>{Math.round(cursorOpacity * 100)}%</span>
          </label>
        </div>

        <div className="toolbar-divider" />

        <div className="toolbar-group">
          <span style={{ fontSize: 12, color: '#6b7280' }}>
            提示：按住空格+鼠标拖拽平移，滚轮缩放
          </span>
        </div>

        <div className="room-info">
          <span className={`connection-status ${status}`}>
            {status === 'connected' && '已连接'}
            {status === 'connecting' && '连接中...'}
            {status === 'disconnected' && '已断开'}
          </span>
          <span>房间:</span>
          <span className="room-id">{roomId}</span>
          <span style={{ fontSize: 12, color: userColorRef.current }}>
            您: #{userNumberRef.current}
          </span>
          <button className="btn" onClick={copyShareLink}>
            📋 复制链接
          </button>
          <button className="btn" onClick={() => { setRoomId(null); window.location.hash = ''; }}>
            返回
          </button>
        </div>
      </div>

      <Whiteboard
        drawings={drawings}
        tool={tool}
        color={color}
        strokeWidth={strokeWidth}
        onDraw={handleDraw}
        otherCursors={cursorList}
        cursorOpacity={cursorOpacity}
        onCursorMove={handleCursorMove}
      />
    </div>
  );
}

export default App;
