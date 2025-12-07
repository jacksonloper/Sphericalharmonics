import { createSignal } from 'solid-js';

export function PopulationControls(props) {
  const {
    visualizationMode,
    onModeChange,
    relief,
    onReliefChange,
    moteSize,
    onMoteSizeChange,
    moteCount,
    onMoteCountChange
  } = props;

  const [isOpen, setIsOpen] = createSignal(false);

  const toggleMenu = () => setIsOpen(!isOpen());

  return (
    <>
      {/* Hamburger button */}
      <div
        id="hamburger"
        class={isOpen() ? 'open' : ''}
        onClick={toggleMenu}
        style={{
          position: 'fixed',
          bottom: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '50px',
          height: '50px',
          background: 'rgba(0, 0, 0, 0.9)',
          border: '2px solid #4ecdc4',
          'border-radius': '50%',
          cursor: 'pointer',
          display: 'flex',
          'flex-direction': 'column',
          'justify-content': 'center',
          'align-items': 'center',
          gap: '4px',
          'z-index': '1000',
          transition: 'transform 0.3s'
        }}
      >
        <span style={{
          width: '24px',
          height: '2px',
          background: '#4ecdc4',
          transition: 'all 0.3s',
          transform: isOpen() ? 'rotate(45deg) translate(5px, 5px)' : 'none'
        }}></span>
        <span style={{
          width: '24px',
          height: '2px',
          background: '#4ecdc4',
          transition: 'all 0.3s',
          opacity: isOpen() ? '0' : '1'
        }}></span>
        <span style={{
          width: '24px',
          height: '2px',
          background: '#4ecdc4',
          transition: 'all 0.3s',
          transform: isOpen() ? 'rotate(-45deg) translate(5px, -5px)' : 'none'
        }}></span>
      </div>

      {/* Control panel */}
      <div style={{
        position: 'fixed',
        bottom: '80px',
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'rgba(0, 0, 0, 0.95)',
        border: '1px solid #4ecdc4',
        'border-radius': '12px',
        padding: '15px',
        display: isOpen() ? 'flex' : 'none',
        'flex-direction': 'column',
        gap: '12px',
        'min-width': '280px',
        'max-width': '320px',
        'backdrop-filter': 'blur(10px)',
        color: 'white',
        'font-family': 'monospace',
        'font-size': '12px'
      }}>
        {/* Mode toggle */}
        <div style={{
          display: 'flex',
          'align-items': 'center',
          gap: '12px',
          padding: '8px',
          background: 'rgba(78, 205, 196, 0.05)',
          'border-radius': '6px'
        }}>
          <span>Mode:</span>
          <div style={{ display: 'flex', gap: '12px', 'align-items': 'center' }}>
            <label style={{ display: 'flex', 'align-items': 'center', gap: '4px', cursor: 'pointer' }}>
              <input
                type="radio"
                name="vizMode"
                value="pyramids"
                checked={visualizationMode === 'pyramids'}
                onChange={(e) => onModeChange(e.target.value)}
                style={{ cursor: 'pointer' }}
              />
              <span>Boxes</span>
            </label>
            <label style={{ display: 'flex', 'align-items': 'center', gap: '4px', cursor: 'pointer' }}>
              <input
                type="radio"
                name="vizMode"
                value="dust"
                checked={visualizationMode === 'dust'}
                onChange={(e) => onModeChange(e.target.value)}
                style={{ cursor: 'pointer' }}
              />
              <span>Dust</span>
            </label>
          </div>
        </div>

        {/* Mote count selector */}
        <div style={{
          display: 'flex',
          'align-items': 'center',
          gap: '8px',
          padding: '8px',
          background: 'rgba(78, 205, 196, 0.05)',
          'border-radius': '6px'
        }}>
          <span>Motes:</span>
          <select
            value={moteCount}
            onChange={(e) => onMoteCountChange(parseInt(e.target.value))}
            style={{
              cursor: 'pointer',
              padding: '4px 8px',
              'background-color': 'rgba(255, 255, 255, 0.1)',
              color: 'white',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              'border-radius': '4px',
              'font-family': 'monospace',
              'font-size': '12px',
              flex: '1'
            }}
          >
            <option value="150">150 motes</option>
            <option value="300">300 motes</option>
            <option value="600">600 motes</option>
            <option value="1200">1200 motes</option>
          </select>
        </div>

        {/* Relief slider */}
        <div style={{
          display: 'flex',
          'flex-direction': 'column',
          gap: '8px',
          padding: '8px',
          background: 'rgba(78, 205, 196, 0.05)',
          'border-radius': '6px'
        }}>
          <div style={{
            display: 'flex',
            'justify-content': 'space-between',
            'align-items': 'center'
          }}>
            <span>Relief:</span>
            <span style={{ color: '#4ecdc4', 'font-weight': 'bold' }}>
              {relief.toFixed(2)}
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            value={relief * 100}
            onInput={(e) => onReliefChange(parseFloat(e.target.value) / 100)}
            style={{
              width: '100%',
              cursor: 'pointer'
            }}
          />
        </div>

        {/* Mote size slider */}
        <div style={{
          display: 'flex',
          'flex-direction': 'column',
          gap: '8px',
          padding: '8px',
          background: 'rgba(78, 205, 196, 0.05)',
          'border-radius': '6px'
        }}>
          <div style={{
            display: 'flex',
            'justify-content': 'space-between',
            'align-items': 'center'
          }}>
            <span>Mote size:</span>
            <span style={{ color: '#4ecdc4', 'font-weight': 'bold' }}>
              {moteSize.toFixed(2)}
            </span>
          </div>
          <input
            type="range"
            min="10"
            max="100"
            step="1"
            value={moteSize * 50}
            onInput={(e) => onMoteSizeChange(parseFloat(e.target.value) / 50)}
            style={{
              width: '100%',
              cursor: 'pointer'
            }}
          />
        </div>
      </div>
    </>
  );
}
