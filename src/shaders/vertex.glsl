uniform float coefficients[25]; // up to degree 4: (l+1)^2 = 25 coefficients
uniform float time;
uniform float displacementScale;

varying float vValue;
varying vec3 vNormal;

const float PI = 3.14159265359;

// Factorial helper (precomputed for efficiency)
float factorial(int n) {
  if (n <= 1) return 1.0;
  float result = 1.0;
  for (int i = 2; i <= n; i++) {
    result *= float(i);
  }
  return result;
}

// Associated Legendre polynomial P_l^m(x)
float legendreP(int l, int m, float x) {
  if (l == 0) return 1.0;
  if (l == 1 && m == 0) return x;
  if (l == 1 && m == 1) return -sqrt(1.0 - x * x);

  // General case - using recurrence relations
  // For simplicity, we'll compute directly for common cases
  float x2 = x * x;
  float sx = sqrt(1.0 - x2);

  if (l == 2) {
    if (m == 0) return 0.5 * (3.0 * x2 - 1.0);
    if (m == 1) return -3.0 * x * sx;
    if (m == 2) return 3.0 * (1.0 - x2);
  }

  if (l == 3) {
    if (m == 0) return 0.5 * x * (5.0 * x2 - 3.0);
    if (m == 1) return -1.5 * sx * (5.0 * x2 - 1.0);
    if (m == 2) return 15.0 * x * (1.0 - x2);
    if (m == 3) return -15.0 * sx * (1.0 - x2);
  }

  if (l == 4) {
    float x4 = x2 * x2;
    if (m == 0) return 0.125 * (35.0 * x4 - 30.0 * x2 + 3.0);
    if (m == 1) return -2.5 * x * sx * (7.0 * x2 - 3.0);
    if (m == 2) return 7.5 * (1.0 - x2) * (7.0 * x2 - 1.0);
    if (m == 3) return -105.0 * x * sx * (1.0 - x2);
    if (m == 4) return 105.0 * (1.0 - x2) * (1.0 - x2);
  }

  return 0.0;
}

// Real spherical harmonic Y_l^m(theta, phi)
float sphericalHarmonic(int l, int m, float theta, float phi) {
  float cosTheta = cos(theta);
  int absM = abs(m);

  // Normalization constant
  float K = sqrt((2.0 * float(l) + 1.0) / (4.0 * PI) *
                 factorial(l - absM) / factorial(l + absM));

  float P = legendreP(l, absM, cosTheta);

  if (m > 0) {
    return K * P * cos(float(m) * phi) * sqrt(2.0);
  } else if (m < 0) {
    return K * P * sin(float(-m) * phi) * sqrt(2.0);
  } else {
    return K * P;
  }
}

// Convert index to (l, m) and evaluate spherical harmonic
float evaluateSH(vec3 dir) {
  // Convert to spherical coordinates
  float theta = acos(clamp(dir.z, -1.0, 1.0));
  float phi = atan(dir.y, dir.x);

  float result = 0.0;
  int idx = 0;

  // Sum over all coefficients
  for (int l = 0; l <= 4; l++) {
    for (int m = -l; m <= l; m++) {
      if (idx < 25) {
        result += coefficients[idx] * sphericalHarmonic(l, m, theta, phi);
        idx++;
      }
    }
  }

  return result;
}

void main() {
  vec3 dir = normalize(position);

  // Evaluate spherical harmonic at this direction
  float shValue = evaluateSH(dir);

  // Displace vertex based on magnitude
  float displacement = abs(shValue) * displacementScale;
  vec3 newPosition = dir * (1.0 + displacement);

  // Pass value to fragment shader for coloring
  vValue = shValue;
  vNormal = normalize(newPosition);

  gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
}
