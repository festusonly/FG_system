import React, { useState, useEffect, useRef } from 'react';

const PullToRefresh = ({ children }) => {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const startY = useRef(0);
  const pullThreshold = 80;

  useEffect(() => {
    const handleTouchStart = (e) => {
      // Only trigger if at the top of the page
      if (window.scrollY === 0) {
        startY.current = e.touches[0].pageY;
      } else {
        startY.current = 0;
      }
    };

    const handleTouchMove = (e) => {
      if (startY.current === 0 || isRefreshing) return;

      const currentY = e.touches[0].pageY;
      const distance = currentY - startY.current;

      if (distance > 0) {
        // Resistance effect: the further you pull, the harder it gets
        const resistance = 0.4;
        const limitedDistance = Math.min(distance * resistance, pullThreshold + 20);
        setPullDistance(limitedDistance);
        
        // Prevent default browser behavior if we are pulling down
        if (distance > 5) {
          if (e.cancelable) e.preventDefault();
        }
      }
    };

    const handleTouchEnd = () => {
      if (pullDistance >= pullThreshold) {
        setIsRefreshing(true);
        setPullDistance(pullThreshold);
        
        // Trigger reload after a short delay for animation
        setTimeout(() => {
          window.location.reload();
        }, 800);
      } else {
        setPullDistance(0);
      }
      startY.current = 0;
    };

    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleTouchEnd);

    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [pullDistance, isRefreshing]);

  return (
    <div className="ptr-container" style={{ position: 'relative', overflow: 'hidden' }}>
      {/* Pull Indicator */}
      <div 
        className="ptr-indicator" 
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '60px',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          transform: `translateY(${pullDistance - 60}px)`,
          opacity: pullDistance / pullThreshold,
          transition: isRefreshing ? 'none' : 'transform 0.1s ease-out',
          zIndex: 2000,
          background: 'transparent'
        }}
      >
        <div style={{
          background: 'white',
          padding: '8px',
          borderRadius: '50%',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          width: '40px',
          height: '40px'
        }}>
          <div className={isRefreshing ? 'spin' : ''} style={{
            width: '24px',
            height: '24px',
            border: '3px solid #f3f3f3',
            borderTop: '3px solid #0d9488',
            borderRadius: '50%',
            transform: `rotate(${pullDistance * 4}deg)`,
            transition: isRefreshing ? 'none' : 'transform 0.1s ease-out'
          }}></div>
        </div>
      </div>

      {/* Content */}
      <div className="ptr-content">
        {children}
      </div>

      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        .spin {
          animation: spin 0.8s linear infinite !important;
        }
      `}</style>
    </div>
  );
};

export default PullToRefresh;
