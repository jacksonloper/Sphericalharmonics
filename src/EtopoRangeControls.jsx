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

  const handleAlphaChange = (e) => {
    const newAlpha = parseFloat(e.target.value);
    setLocalAlpha(newAlpha);
    onAlphaChange(newAlpha);
  };

  return (
    <div style={{
      position: 'absolute',
      bottom: '15px',
      left: '50%',
      transform: 'translateX(-50%)',
      color: 'white',
      'font-family': 'monospace',
      'font-size': '12px',
      'background-color': 'rgba(0, 0, 0, 0.7)',
      padding: '12px 15px',
      'border-radius': '8px',
      display: 'flex',
      'align-items': 'center',
      gap: '15px',
      'flex-wrap': 'wrap',
      'justify-content': 'center'
    }}>
      {/* Radio buttons for min/mean/max mesh selection */}
      <div style={{
        display: 'flex',
        'align-items': 'center',
        gap: '12px'
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

      {/* Flip oceans checkbox */}
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

      {/* Show HEALPix dots checkbox */}
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

      {/* Water colormap checkbox */}
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

      {/* Nside selector dropdown */}
      <div style={{
        display: 'flex',
        'align-items': 'center',
        gap: '8px'
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
            'font-size': '12px'
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
        'align-items': 'center',
        gap: '8px'
      }}>
        <span>Relief:</span>
        <input
          type="range"
          min="0.01"
          max="0.5"
          step="0.01"
          value={localAlpha()}
          onInput={handleAlphaChange}
          style={{
            width: '120px',
            cursor: 'pointer'
          }}
        />
        <span style={{
          'min-width': '35px',
          color: '#4ecdc4'
        }}>
          {localAlpha().toFixed(2)}
        </span>
      </div>
    </div>
  );
}
