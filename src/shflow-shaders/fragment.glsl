varying float vValue;
varying vec3 vNormal;

uniform vec3 positiveColor;
uniform vec3 negativeColor;
uniform vec3 lightDirection;
uniform vec3 lightDirection2;

void main() {
  // Color based on sign
  vec3 baseColor = vValue >= 0.0 ? positiveColor : negativeColor;

  // Two-light setup for better depth perception
  vec3 normal = normalize(vNormal);

  // Main light (key light)
  vec3 lightDir1 = normalize(lightDirection);
  float diffuse1 = max(dot(normal, lightDir1), 0.0) * 0.6;

  // Secondary light (fill light)
  vec3 lightDir2 = normalize(lightDirection2);
  float diffuse2 = max(dot(normal, lightDir2), 0.0) * 0.3;

  // Ambient light
  float ambient = 0.2;

  float lighting = diffuse1 + diffuse2 + ambient;
  vec3 finalColor = baseColor * lighting;

  gl_FragColor = vec4(finalColor, 1.0);
}
