import { createSignal } from 'solid-js';

export function EtopoRangeControls(props) {
  const {
    currentMeshType,
    onMeshTypeChange,
    flipSign,
    onFlipSignChange,
    showHealpixDots,
    onShowHealpixDotsChange,
    useWaterColormap,
    onUseWaterColormapChange,
    currentNside,
    onNsideChange,
    availableNsides,
    alphaValue,
    onAlphaChange,
    getNpix
  } = props;

  const [localAlpha, setLocalAlpha] = createSignal(alphaValue);
  const [isOpen, setIsOpen] = createSignal(false);

  const handleAlphaChange = (e) => {
    const newAlpha = parseFloat(e.target.value);
    setLocalAlpha(newAlpha);
    onAlphaChange(newAlpha);
  };

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
          'z-index': '500',
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
        {/* Radio buttons for min/mean/max mesh selection */}
        <div style={{
          display: 'flex',
          'align-items': 'center',
          gap: '12px',
          padding: '8px',
          background: 'rgba(78, 205, 196, 0.05)',
          'border-radius': '6px'
        }}>
          <input
            type="radio"
            name="meshType"
            id="minMeshRadio"
            checked={currentMeshType === 'min'}
            onChange={() => onMeshTypeChange('min')}
            style={{ cursor: 'pointer' }}
          />
          <label htmlFor="minMeshRadio" style={{ cursor: 'pointer' }}>Min</label>

          <input
            type="radio"
            name="meshType"
            id="meanMeshRadio"
            checked={currentMeshType === 'mean'}
            onChange={() => onMeshTypeChange('mean')}
            style={{ cursor: 'pointer' }}
          />
          <label htmlFor="meanMeshRadio" style={{ cursor: 'pointer' }}>Mean</label>

          <input
            type="radio"
            name="meshType"
            id="maxMeshRadio"
            checked={currentMeshType === 'max'}
            onChange={() => onMeshTypeChange('max')}
            style={{ cursor: 'pointer' }}
          />
          <label htmlFor="maxMeshRadio" style={{ cursor: 'pointer' }}>Max</label>
        </div>

        {/* Checkboxes */}
        <div style={{ display: 'flex', 'flex-direction': 'column', gap: '8px' }}>
          <div style={{
            display: 'flex',
            'align-items': 'center',
            gap: '8px'
          }}>
            <input
              type="checkbox"
              id="flipOceansCheckbox"
              checked={flipSign}
              onChange={(e) => onFlipSignChange(e.target.checked)}
              style={{ cursor: 'pointer' }}
            />
            <label htmlFor="flipOceansCheckbox" style={{ cursor: 'pointer' }}>
              Flip oceans
            </label>
          </div>

          <div style={{
            display: 'flex',
            'align-items': 'center',
            gap: '8px'
          }}>
            <input
              type="checkbox"
              id="dotsCheckbox"
              checked={showHealpixDots}
              onChange={(e) => onShowHealpixDotsChange(e.target.checked)}
              style={{ cursor: 'pointer' }}
            />
            <label htmlFor="dotsCheckbox" style={{ cursor: 'pointer' }}>
              Show HEALPix dots
            </label>
          </div>

          <div style={{
            display: 'flex',
            'align-items': 'center',
            gap: '8px'
          }}>
            <input
              type="checkbox"
              id="waterColormapCheckbox"
              checked={useWaterColormap}
              onChange={(e) => onUseWaterColormapChange(e.target.checked)}
              style={{ cursor: 'pointer' }}
            />
            <label htmlFor="waterColormapCheckbox" style={{ cursor: 'pointer' }}>
              Water colormap
            </label>
          </div>
        </div>

        {/* Resolution selector */}
        <div style={{
          display: 'flex',
          'align-items': 'center',
          gap: '8px',
          padding: '8px',
          background: 'rgba(78, 205, 196, 0.05)',
          'border-radius': '6px'
        }}>
          <span>Resolution:</span>
          <select
            id="nsideSelect"
            value={currentNside}
            onChange={(e) => onNsideChange(parseInt(e.target.value))}
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
            {availableNsides.map(nside => (
              <option value={nside}>
                {getNpix(nside).toLocaleString()} vertices
              </option>
            ))}
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
              {localAlpha().toFixed(2)}
            </span>
          </div>
          <input
            type="range"
            min="0.01"
            max="0.5"
            step="0.01"
            value={localAlpha()}
            onInput={handleAlphaChange}
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
