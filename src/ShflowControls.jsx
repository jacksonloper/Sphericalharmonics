import { createSignal, Show } from 'solid-js';

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
  const [showSlider, setShowSlider] = createSignal(false);
  const [currentParam, setCurrentParam] = createSignal(null);

  const toggleMenu = () => setIsOpen(!isOpen());

  const openSlider = (param) => {
    setCurrentParam(param);
    setShowSlider(true);
    setIsOpen(false);
  };

  const closeSlider = () => {
    setShowSlider(false);
    setIsOpen(true);
  };

  const handleSliderChange = (e) => {
    const value = parseFloat(e.target.value);
    const param = currentParam();

    if (param === 'maxOrder') {
      const intValue = Math.round(value);
      onMaxOrderChange(intValue);
    } else if (param === 'theta') {
      onThetaChange(value);
    } else if (param === 'sigma') {
      onSigmaChange(value);
    }
  };

  const getSliderConfig = () => {
    const param = currentParam();
    if (param === 'maxOrder') {
      return { min: 1, max: 4, step: 1, value: ouParams.maxOrder };
    } else if (param === 'theta') {
      return { min: 0, max: 2, step: 0.05, value: ouParams.theta };
    } else if (param === 'sigma') {
      return { min: 0, max: 1, step: 0.05, value: ouParams.sigma };
    }
    return { min: 0, max: 1, step: 0.01, value: 0 };
  };

  const formatValue = (param) => {
    if (param === 'maxOrder') {
      return ouParams[param].toString();
    }
    return ouParams[param].toFixed(2);
  };

  const getParamLabel = () => {
    const param = currentParam();
    if (param === 'maxOrder') return 'Max Harmonic Order (l)';
    if (param === 'theta') return 'Mean Reversion (θ)';
    if (param === 'sigma') return 'Volatility (σ)';
    return '';
  };

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

      {/* Parameter list menu */}
      <div
        id="frequency-list"
        class={isOpen() ? 'show' : ''}
      >
        <div class="freq-item" onClick={() => openSlider('maxOrder')}>
          <span>Max Harmonic Order (l)</span>
          <span class="freq-value">{ouParams.maxOrder}</span>
        </div>
        <div class="freq-item" onClick={() => openSlider('theta')}>
          <span>Mean Reversion (θ)</span>
          <span class="freq-value">{ouParams.theta.toFixed(2)}</span>
        </div>
        <div class="freq-item" onClick={() => openSlider('sigma')}>
          <span>Volatility (σ)</span>
          <span class="freq-value">{ouParams.sigma.toFixed(2)}</span>
        </div>
        <div class="freq-item" onClick={onWireframeToggle}>
          <span>Wireframe</span>
          <span class="freq-value">{wireframeEnabled() ? 'ON' : 'OFF'}</span>
        </div>
      </div>

      {/* Slider panel */}
      <Show when={showSlider()}>
        <div id="slider-panel" class="show">
          <div class="title">{getParamLabel()}</div>
          <div class="value-display">
            {formatValue(currentParam())}
          </div>
          <input
            type="range"
            id="slider"
            min={getSliderConfig().min}
            max={getSliderConfig().max}
            step={getSliderConfig().step}
            value={getSliderConfig().value}
            onInput={handleSliderChange}
          />
          <div class="back-btn" onClick={closeSlider}>← Back</div>
        </div>
      </Show>
    </>
  );
}
