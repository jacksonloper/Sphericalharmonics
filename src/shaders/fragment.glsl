varying float vValue;
varying vec3 vNormal;

uniform vec3 positiveColor;
uniform vec3 negativeColor;
uniform vec3 lightDirection;

void main() {
  // Color based on sign
  vec3 baseColor = vValue >= 0.0 ? positiveColor : negativeColor;

  // Simple lighting for depth perception
  vec3 normal = normalize(vNormal);
  vec3 lightDir = normalize(lightDirection);
  float diffuse = max(dot(normal, lightDir), 0.0) * 0.7 + 0.3;

  vec3 finalColor = baseColor * diffuse;

  gl_FragColor = vec4(finalColor, 1.0);
}
