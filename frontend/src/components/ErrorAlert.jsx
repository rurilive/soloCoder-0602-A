export default function ErrorAlert({ message, onRetry }) {
  return (
    <div className="card" style={{ borderColor: '#da3633' }}>
      <div style={{ textAlign: 'center', padding: '24px' }}>
        <div
          style={{
            fontSize: '48px',
            marginBottom: '16px'
          }}
        >
          ⚠️
        </div>
        <h3 style={{ color: '#f85149', marginBottom: '12px' }}>
          连接错误
        </h3>
        <p style={{ color: '#8b949e', marginBottom: '20px' }}>
          {message || '无法连接到后端服务'}
        </p>
        <p style={{ fontSize: '14px', color: '#8b949e', marginBottom: '20px' }}>
          请确认后端服务已启动（端口 1111）
        </p>
        {onRetry && (
          <button className="btn btn-primary" onClick={onRetry}>
            重新连接
          </button>
        )}
      </div>
    </div>
  )
}
