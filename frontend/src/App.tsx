import React, { useState, useCallback } from 'react';
import './App.css';
import { Whiteboard } from './components/Whiteboard';
import { useWebSocket } from './hooks/useWebSocket';
import type { Drawing, ToolType } from './types';

const API_BASE = `http://${window.location.hostname}:1111`;

function App() {
  const [roomId, setRoomId] = useState<string | null>(null);
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [tool, setTool] = useState<ToolType>('pen');
  const [color, setColor] = useState('#000000');
  const [strokeWidth, setStrokeWidth] = useState(3);

  const handleDrawingReceived = useCallback((drawing: Drawing) => {
    setDrawings((prev) => [...prev, drawing]);
  }, []);

  const handleInit = useCallback((initDrawings: Drawing[]) => {
    setDrawings(initDrawings);
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

  const { sendDrawing, status } = useWebSocket({
    roomId: roomId || '',
    onDrawingReceived: handleDrawingReceived,
    onInit: handleInit,
    onRoomInvalid: handleRoomInvalid,
    onReconnectFailed: handleReconnectFailed,
  });

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
    sendDrawing(drawing);
  };

  const copyShareLink = () => {
    if (!roomId) return;
    const link = `${window.location.origin}${window.location.pathname}#${roomId}`;
    navigator.clipboard.writeText(link);
    alert('分享链接已复制到剪贴板！');
  };

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
      />
    </div>
  );
}

export default App;
