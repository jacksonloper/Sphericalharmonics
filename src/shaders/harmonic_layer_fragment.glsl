// Fragment shader for rendering individual harmonic layers with transparency
varying float vValue;
varying vec3 vNormal;

uniform vec3 layerColor;
uniform vec3 lightDirection;
uniform vec3 lightDirection2;
uniform float opacity;

void main() {
  vec3 normal = normalize(vNormal);

  // Two-light setup for depth perception
  vec3 lightDir1 = normalize(lightDirection);
  float diffuse1 = max(dot(normal, lightDir1), 0.0) * 0.6;

  vec3 lightDir2 = normalize(lightDirection2);
  float diffuse2 = max(dot(normal, lightDir2), 0.0) * 0.3;

  float ambient = 0.3;

  // Brighter lighting for transparent layers
  float lighting = clamp(diffuse1 + diffuse2 + ambient, 0.0, 1.2);

  vec3 finalColor = layerColor * lighting;

  // Apply transparency
  gl_FragColor = vec4(finalColor, opacity);
}
