import { createSignal } from 'solid-js';

export function ShflowControls(props) {
  const {
    ouParams,
    onMaxOrderChange,
    onThetaChange,
    onSigmaChange,
    onWireframeToggle,
    wireframeEnabled
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
      >
        <span></span>
        <span></span>
        <span></span>
      </div>

      {/* Control panel with all controls */}
      <div
        id="frequency-list"
        class={isOpen() ? 'show' : ''}
      >
        {/* Max Harmonic Order slider */}
        <div class="control-group">
          <div class="control-label">
            <span>Max Harmonic Order (l)</span>
            <span class="freq-value">{ouParams.maxOrder}</span>
          </div>
          <input
            type="range"
            min="1"
            max="4"
            step="1"
            value={ouParams.maxOrder}
            onInput={(e) => onMaxOrderChange(Math.round(parseFloat(e.target.value)))}
            class="control-slider"
          />
        </div>

        {/* Mean Reversion slider */}
        <div class="control-group">
          <div class="control-label">
            <span>Mean Reversion (θ)</span>
            <span class="freq-value">{ouParams.theta.toFixed(2)}</span>
          </div>
          <input
            type="range"
            min="0"
            max="2"
            step="0.05"
            value={ouParams.theta}
            onInput={(e) => onThetaChange(parseFloat(e.target.value))}
            class="control-slider"
          />
        </div>

        {/* Volatility slider */}
        <div class="control-group">
          <div class="control-label">
            <span>Volatility (σ)</span>
            <span class="freq-value">{ouParams.sigma.toFixed(2)}</span>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={ouParams.sigma}
            onInput={(e) => onSigmaChange(parseFloat(e.target.value))}
            class="control-slider"
          />
        </div>

        {/* Wireframe toggle */}
        <div class="freq-item" onClick={onWireframeToggle}>
          <span>Wireframe</span>
          <span class="freq-value">{wireframeEnabled() ? 'ON' : 'OFF'}</span>
        </div>
      </div>
    </>
  );
}
